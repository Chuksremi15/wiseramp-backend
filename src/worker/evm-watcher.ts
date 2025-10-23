import { ethers } from "ethers";
import dotenv from "dotenv";
import { PostgresTransactionService } from "../services/transaction.service.js";
import { TransactionStatus } from "../shared/types.js";
import express, { Request, Response } from "express";
import axios from "axios";
import { initializeDatabase } from "../db/connection.js";

import {
  HypersyncClient,
  Decoder,
  BlockField,
  LogField,
  TransactionField,
} from "@envio-dev/hypersync-client";

import WebSocket, { WebSocketServer } from "ws";
import http from "http";
import cors from "cors";
import { ERC20Watcher } from "./erc20-watcher.js";
import { normalizeAddress } from "../utils/address.js";

type BlockWithTx = ethers.Block & {
  transactions: ethers.TransactionResponse[];
};

const app = express();

app.use(express.json());

dotenv.config();

app.use(
  cors({
    origin: ["http://localhost:3150", "https://wiseramp.vercel.app"],
    credentials: true,
  })
);

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
// Map: chain+address -> Set of WebSocket clients
const addressClients: Record<string, Set<WebSocket>> = {};

function getKey(chain: string, address: string) {
  return `${chain}:${address}`;
}

wss.on("connection", (ws: WebSocket) => {
  ws.on("message", (msg: Buffer) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === "subscribe" && data.chain && data.address) {
        const key = getKey(
          data.chain,
          normalizeAddress(data.address, data.chain)
        );
        if (!addressClients[key]) addressClients[key] = new Set();
        addressClients[key].add(ws);
        ws.send(
          JSON.stringify({
            type: "subscribed",
            chain: data.chain,
            address: data.address,
          })
        );
      } else if (data.type === "unsubscribe" && data.chain && data.address) {
        const key = getKey(
          data.chain,
          normalizeAddress(data.address, data.chain)
        );
        if (addressClients[key]) {
          addressClients[key].delete(ws);
          if (addressClients[key].size === 0) delete addressClients[key];
        }
        ws.send(
          JSON.stringify({
            type: "unsubscribed",
            chain: data.chain,
            address: data.address,
          })
        );
      }
    } catch (e) {
      ws.send(JSON.stringify({ error: "Invalid message" }));
    }
  });
  ws.on("close", () => {
    for (const key in addressClients) {
      addressClients[key].delete(ws);
      if (addressClients[key].size === 0) delete addressClients[key];
    }
  });
});

// --- Multi-chain setup ---
const CHAINS_WITH_TOKENS = [
  {
    name: "ethereum",
    wsRpcUrl: process.env.ETH_WEBSOCKET_RPC_URL!,
    httpRpcUrl: process.env.ETH_HTTP_RPC_URL!,
    hyperSyncUrl: "https://sepolia.hypersync.xyz",
    chainId: 11155111,
    supportedTokens: {
      USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // Example
    },
  },
  // {
  //   name: "bsc",
  //   wsRpcUrl: process.env.BSC_RPC_URL!,
  //   chainId: 56,
  // },
  // Add more chains as needed
];

// Per-chain wsProviders and address maps with transaction counts
const wsProviders: Record<string, ethers.WebSocketProvider> = {};

const httpProviders: Record<string, ethers.JsonRpcProvider> = {};

const addressesToWatch: Record<string, Map<string, number>> = {};

const erc20Watchers: Record<string, ERC20Watcher> = {};

const watcherActive: Record<string, boolean> = {};

const hypersyncClient: Record<string, HypersyncClient> = {};

// PostgreSQL transaction service
const transactionService = new PostgresTransactionService();

// Initialize wsProviders and maps
for (const chain of CHAINS_WITH_TOKENS) {
  console.log(`[${chain.name}] Initializing providers...`);
  console.log(
    `[${chain.name}] WS URL: ${chain.wsRpcUrl ? "configured" : "MISSING"}`
  );
  console.log(
    `[${chain.name}] HTTP URL: ${chain.httpRpcUrl ? "configured" : "MISSING"}`
  );

  wsProviders[chain.name] = new ethers.WebSocketProvider(chain.wsRpcUrl);
  httpProviders[chain.name] = new ethers.JsonRpcProvider(chain.httpRpcUrl);

  hypersyncClient[chain.name] = HypersyncClient.new({
    url: chain.hyperSyncUrl,
  });

  erc20Watchers[chain.name] = new ERC20Watcher(
    chain.wsRpcUrl,
    chain.httpRpcUrl,
    chain.name,
    transactionService
  );

  addressesToWatch[chain.name] = new Map();
  watcherActive[chain.name] = false;
}

// Add address API (now requires chain)
app.post("/add-address", (req: Request, res: Response): void => {
  const { address, chain, timeoutMs } = req.body;
  if (!address || !chain || !addressesToWatch[chain]) {
    res.status(400).json({ error: "Address and valid chain required" });
    return;
  }

  const normalizedAddress = normalizeAddress(address, chain);
  const currentCount = addressesToWatch[chain].get(normalizedAddress) || 0;
  addressesToWatch[chain].set(normalizedAddress, currentCount + 1);

  console.log(
    `[${chain}] Adding address to watch: ${normalizedAddress} (count: ${
      currentCount + 1
    })`
  );
  console.log(
    `[${chain}] Total addresses being watched: ${addressesToWatch[chain].size}`
  );
  console.log(`[${chain}] Watcher active: ${watcherActive[chain]}`);

  if (!watcherActive[chain]) {
    console.log(`[${chain}] Starting provider listener for new address`);
    startProviderListener(chain);
  } else {
    console.log(
      `[${chain}] Provider listener already active, new address will be monitored`
    );
    // Test connection by trying to get the latest block number
    wsProviders[chain].getBlockNumber().catch((error) => {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.log(
        `[${chain}] Provider connection test failed, restarting listener:`,
        errorMessage
      );
      stopProviderListener(chain);
      startProviderListener(chain);
    });
  }

  res.json({ success: true });

  // Auto-remove after timeout if specified
  if (timeoutMs) {
    setTimeout(() => {
      const count = addressesToWatch[chain].get(normalizedAddress) || 0;
      if (count <= 1) {
        addressesToWatch[chain].delete(normalizedAddress);
        if (addressesToWatch[chain].size === 0 && watcherActive[chain]) {
          stopProviderListener(chain);
        }
      } else {
        addressesToWatch[chain].set(normalizedAddress, count - 1);
      }
    }, timeoutMs);
  }
});

app.post("/add-token-address", async (req, res) => {
  const { address, chain, tokenAddress, tokenSymbol, scanHistorical } =
    req.body;

  if (!address || !chain || !tokenAddress || !erc20Watchers[chain]) {
    res
      .status(400)
      .json({ error: "Address, chain, and tokenAddress required" });
    return;
  }

  const normalizedAddress = normalizeAddress(address, chain);
  const normalizedToken = tokenAddress.toLowerCase();

  console.log(
    `[${chain}] Adding ERC20 watch: ${tokenSymbol} to ${normalizedAddress}`
  );

  try {
    let fromBlock;
    if (scanHistorical) {
      // Scan back 1 hour (approximately 300 blocks on Ethereum)
      const currentBlock = await httpProviders[chain].getBlockNumber();
      fromBlock = Math.max(currentBlock - 300, 0);
    }

    await erc20Watchers[chain].addAddressToWatch(
      normalizedToken,
      normalizedAddress,
      fromBlock
    );

    res.json({
      success: true,
      message: `Watching ${tokenSymbol} transfers to ${normalizedAddress}`,
      historicalScan: scanHistorical
        ? `Scanned from block ${fromBlock}`
        : "No historical scan",
    });
  } catch (error) {
    console.error(`Error adding token address watch:`, error);
    res.status(500).json({ error: "Failed to add token address watch" });
  }
});

// Remove address API (requires chain)
app.post("/remove-address", (req: Request, res: Response): void => {
  const { address, chain } = req.body;
  if (!address || !chain || !addressesToWatch[chain]) {
    res.status(400).json({ error: "Address and valid chain required" });
    return;
  }

  const normalizedAddress = normalizeAddress(address, chain);
  const count = addressesToWatch[chain].get(normalizedAddress) || 0;
  if (count <= 1) {
    addressesToWatch[chain].delete(normalizedAddress);
    if (addressesToWatch[chain].size === 0 && watcherActive[chain]) {
      stopProviderListener(chain);
    }
  } else {
    addressesToWatch[chain].set(normalizedAddress, count - 1);
  }
  res.json({ success: true });
});

app.post("/remove-token-address", (req, res) => {
  const { address, chain, tokenAddress } = req.body;

  if (!address || !chain || !tokenAddress || !erc20Watchers[chain]) {
    res
      .status(400)
      .json({ error: "Address, chain, and tokenAddress required" });
    return;
  }

  const normalizedAddress = normalizeAddress(address, chain);
  const normalizedToken = tokenAddress.toLowerCase();

  erc20Watchers[chain].removeAddressFromWatch(
    normalizedToken,
    normalizedAddress
  );

  res.json({ success: true });
});

async function loadAddressesFromDB() {
  console.log("Loading addresses from DB...");
  for (const chain of CHAINS_WITH_TOKENS) {
    try {
      // Get pending crypto transactions for this chain
      const transactions =
        await transactionService.getPendingCryptoTransactions();

      // Filter by chain and ensure we have valid source addresses
      const chainTransactions = transactions.filter(
        (tx) =>
          tx.sourceChain === chain.name &&
          tx.sourceAddress &&
          tx.status !== TransactionStatus.EXPIRED &&
          (!tx.expiredAt || tx.expiredAt > new Date())
      );

      for (const tx of chainTransactions) {
        if (tx.sourceAddress) {
          const normalizedAddress = normalizeAddress(
            tx.sourceAddress,
            chain.name
          );
          const currentCount =
            addressesToWatch[chain.name].get(normalizedAddress) || 0;
          addressesToWatch[chain.name].set(normalizedAddress, currentCount + 1);

          // If this is a token transaction, also add to ERC20 watcher
          if (tx.tokenAddress) {
            // Calculate how far back to scan (e.g., from when transaction was created)
            const currentBlock = await httpProviders[
              chain.name
            ].getBlockNumber();
            const createdAt = new Date(tx.createdAt);
            const now = new Date();
            const timeDiffHours =
              (now.getTime() - createdAt.getTime()) / (1000 * 60 * 3);

            // Estimate blocks to scan back (assuming ~12 second block time for Ethereum)
            const blocksToScanBack = Math.min(
              Math.floor(timeDiffHours * 300),
              100
            ); // Cap at 1000 blocks
            const fromBlock = Math.max(currentBlock - blocksToScanBack, 0);

            await erc20Watchers[chain.name].addAddressToWatch(
              tx.tokenAddress,
              normalizedAddress
            );
          }
        }
      }

      if (addressesToWatch[chain.name].size > 0 && !watcherActive[chain.name]) {
        startProviderListener(chain.name);
      }

      console.log(
        `[${chain.name}] Loaded ${chainTransactions.length} transactions`
      );
    } catch (error) {
      console.error(`[${chain.name}] Error loading addresses from DB:`, error);
    }
  }
}

// Health check and restart listeners if needed
async function healthCheckAndRestart() {
  console.log("Running health check...");

  for (const chain of CHAINS_WITH_TOKENS) {
    const chainName = chain.name;
    const hasAddresses = addressesToWatch[chainName].size > 0;
    const isActive = watcherActive[chainName];

    if (hasAddresses && !isActive) {
      console.log(
        `[${chainName}] 🔧 Health check failed - addresses: ${hasAddresses}, active: ${isActive}`
      );
      console.log(
        `[${chainName}] Restarting listener for ${addressesToWatch[chainName].size} addresses`
      );
      startProviderListener(chainName);
    } else if (hasAddresses && isActive) {
      // Test connection by trying to get the latest block number
      try {
        await wsProviders[chainName].getBlockNumber();
        console.log(
          `[${chainName}] ✅ Health check passed - ${addressesToWatch[chainName].size} addresses being watched`
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.log(
          `[${chainName}] 🔧 Health check failed - connection error:`,
          errorMessage
        );
        console.log(`[${chainName}] Restarting listener`);
        stopProviderListener(chainName);
        startProviderListener(chainName);
      }
    }
  }
}

// Clean up expired addresses from watcher
async function cleanupExpiredAddresses() {
  console.log("Cleaning up expired addresses...");
  for (const chain of CHAINS_WITH_TOKENS) {
    const addressesToRemove: string[] = [];

    // Check each address in the watcher
    for (const [address] of addressesToWatch[chain.name]) {
      try {
        // Check if there are any expired transactions for this address
        const expiredTransactions =
          await transactionService.getExpiredTransactionsByChainAndAddress(
            chain.name,
            address
          );

        if (expiredTransactions.length > 0) {
          // Check if there are any non-expired transactions for this address
          const pendingTransactions =
            await transactionService.getPendingTransactionsByChainAndAddress(
              chain.name,
              address
            );

          if (pendingTransactions.length === 0) {
            addressesToRemove.push(address);
            console.log(
              `[${chain.name}] Removing expired address: ${address} (no pending transactions)`
            );
          } else {
            console.log(
              `[${chain.name}] Keeping address: ${address} (${pendingTransactions.length} pending transactions)`
            );
          }
        }
      } catch (error) {
        console.error(
          `[${chain.name}] Error checking expired transactions for ${address}:`,
          error
        );
      }
    }

    // Remove expired addresses
    addressesToRemove.forEach((address) => {
      addressesToWatch[chain.name].delete(address);
    });

    // Stop listener if no addresses left
    if (addressesToWatch[chain.name].size === 0 && watcherActive[chain.name]) {
      stopProviderListener(chain.name);
      console.log(`[${chain.name}] Stopped watching - no active addresses`);
    }
  }
  console.log("Cleanup completed.");
}

async function handleMatchedTransaction(
  chain: string,
  tx: ethers.TransactionResponse
) {
  const recipientAddress = normalizeAddress(tx.to!.toLowerCase(), chain);
  const txValue = tx.value.toString();
  console.log(
    `[${chain}] Matched pending transaction for: ${recipientAddress} with value: ${txValue}`
  );

  try {
    // Find all pending transactions for this address
    const pendingTransactions =
      await transactionService.getPendingTransactionsByChainAndAddress(
        chain,
        recipientAddress
      );

    if (pendingTransactions.length === 0) {
      console.log(
        `[${chain}] No pending transactions found for address ${recipientAddress}.`
      );
      // Remove from watching if no transaction found
      const count = addressesToWatch[chain].get(recipientAddress) || 0;
      if (count <= 1) {
        addressesToWatch[chain].delete(recipientAddress);
      } else {
        addressesToWatch[chain].set(recipientAddress, count - 1);
      }
      return;
    }

    // Try to match by amount (keep as BigInt for precision)
    const txValueInWei = BigInt(txValue);
    let matchedTransaction = null;

    for (const transaction of pendingTransactions) {
      // Convert source amount to wei for precise comparison
      const sourceAmountInWei = ethers.parseEther(transaction.sourceAmount);

      // Allow for small tolerance due to gas fees (0.0001 ETH = 100000000000000 wei)
      const toleranceInWei = ethers.parseEther("0.0001");
      const difference =
        txValueInWei > sourceAmountInWei
          ? txValueInWei - sourceAmountInWei
          : sourceAmountInWei - txValueInWei;

      if (difference <= toleranceInWei) {
        matchedTransaction = transaction;
        console.log(
          `[${chain}] Matched transaction ${transaction.transactionId} with amount ${transaction.sourceAmount} ETH`
        );
        break;
      }
    }

    // If no exact match, use the oldest transaction (FIFO)
    if (!matchedTransaction) {
      matchedTransaction = pendingTransactions[0];
      console.log(
        `[${chain}] No exact amount match, using oldest transaction ${matchedTransaction.transactionId}`
      );
    }

    // 1. Update status to 'pending' to prevent double-processing
    const updateSuccess = await transactionService.updateCryptoStatus(
      matchedTransaction.id,
      TransactionStatus.CRYPTO_PENDING
    );

    if (!updateSuccess) {
      console.log(
        `[${chain}] Transaction for address ${recipientAddress} already being processed.`
      );
      return;
    }

    // Get the updated transaction
    const updatedTransaction = await transactionService.getTransactionById(
      matchedTransaction.id
    );
    if (!updatedTransaction) {
      console.log(`[${chain}] Failed to retrieve updated transaction`);
      return;
    }

    console.log(`[${chain}] Waiting for confirmation for tx: ${tx.hash}`);
    const receipt = await tx.wait(); // Wait for 1 confirmation

    if (receipt && receipt.status === 1) {
      // 2. On Success: Update status to 'confirmed'
      console.log(`[${chain}] Transaction ${tx.hash} confirmed.`);

      await transactionService.updateCryptoStatus(
        updatedTransaction.id,
        TransactionStatus.CRYPTO_CONFIRMED,
        tx.hash
      );

      const wsKey = getKey(chain, recipientAddress);
      if (addressClients[wsKey]) {
        for (const ws of addressClients[wsKey]) {
          ws.send(
            JSON.stringify({
              type: "transaction_update",
              chain,
              address: recipientAddress,
              transactionId: updatedTransaction.transactionId,
              status: "processing",
              txHash: tx.hash,
              value: tx.value.toString(),
              expectedAmount: matchedTransaction.sourceAmount,
              matchedAmount: ethers.formatEther(txValue),
              sourceCurrency: matchedTransaction.sourceCurrency,
              destinationCurrency: matchedTransaction.destinationCurrency,
            })
          );
        }
      }

      // Notify another server with detailed transaction info
      await axios.post(
        "http://localhost:3000/api/confirm-transaction/on-confirmed-eth",
        {
          transactionId: updatedTransaction.transactionId,
          address: recipientAddress,
          status: "CRYPTO_CONFIRMED",
          txHash: tx.hash,
          value: tx.value.toString(),
          expectedAmount: matchedTransaction.sourceAmount,
          matchedAmount: ethers.formatEther(txValue),
          chain,
          sourceCurrency: matchedTransaction.sourceCurrency,
          destinationCurrency: matchedTransaction.destinationCurrency,
        }
      );

      if (addressClients[wsKey]) {
        for (const ws of addressClients[wsKey]) {
          ws.send(
            JSON.stringify({
              type: "transaction_update",
              chain,
              address: recipientAddress,
              transactionId: updatedTransaction.transactionId,
              status: "completed",
              txHash: tx.hash,
              value: tx.value.toString(),
              expectedAmount: matchedTransaction.sourceAmount,
              matchedAmount: ethers.formatEther(txValue),
              sourceCurrency: matchedTransaction.sourceCurrency,
              destinationCurrency: matchedTransaction.destinationCurrency,
            })
          );
        }
      }

      // 3. Remove from the in-memory map (decrement count)
      const count = addressesToWatch[chain].get(recipientAddress) || 0;
      if (count <= 1) {
        addressesToWatch[chain].delete(recipientAddress);
        if (addressesToWatch[chain].size === 0 && watcherActive[chain]) {
          stopProviderListener(chain);
        }
        console.log(
          `[${chain}] Stopped watching confirmed address: ${recipientAddress}`
        );
      } else {
        addressesToWatch[chain].set(recipientAddress, count - 1);
        console.log(
          `[${chain}] Decremented watch count for address: ${recipientAddress} (${
            count - 1
          } remaining)`
        );
      }
    } else {
      // 4. On Failure: Revert status to 'waiting'
      console.log(
        `[${chain}] Transaction ${tx.hash} failed. Re-watching address.`
      );

      if (
        updatedTransaction.cryptoStatus === TransactionStatus.CRYPTO_PENDING
      ) {
        await transactionService.updateCryptoStatus(
          updatedTransaction.id,
          TransactionStatus.WAITING_FOR_CRYPTO
        );
      } else {
        // Already confirmed or failed, do not revert!
        console.log(
          `[${chain}] Not reverting status for transaction ${updatedTransaction.transactionId} because it is already ${updatedTransaction.cryptoStatus}`
        );
      }
    }
  } catch (error) {
    console.error(`[${chain}] Error processing transaction ${tx.hash}:`, error);
    // Revert to waiting status if any error occurs
    try {
      // Find the transaction that was being processed
      const allTransactions =
        await transactionService.getPendingCryptoTransactions();
      const transactionToRevert = allTransactions.find(
        (tx) =>
          tx.sourceChain === chain &&
          tx.sourceAddress === recipientAddress &&
          tx.cryptoStatus === TransactionStatus.CRYPTO_PENDING
      );

      if (transactionToRevert) {
        await transactionService.updateCryptoStatus(
          transactionToRevert.id,
          TransactionStatus.WAITING_FOR_CRYPTO
        );
      }
    } catch (revertError) {
      console.error(
        `[${chain}] Error reverting transaction status:`,
        revertError
      );
    }
  }
}

function startProviderListener(chain: string) {
  const startTime = Date.now();

  if (watcherActive[chain]) {
    console.log(`[${chain}] Provider listener already active, skipping start`);
    return; // Prevent double-listening
  }

  console.log(`[${chain}] 🚀 Starting provider listener...`);
  watcherActive[chain] = true;

  // Check if we need to recreate the provider after a stop
  if (
    wsProviders[chain].websocket &&
    wsProviders[chain].websocket.readyState !== 1
  ) {
    console.log(
      `[${chain}] 🔄 WebSocket not ready (state: ${wsProviders[chain].websocket.readyState}), recreating provider...`
    );
    const chainConfig = CHAINS_WITH_TOKENS.find((c) => c.name === chain);
    if (chainConfig) {
      wsProviders[chain] = new ethers.WebSocketProvider(chainConfig.wsRpcUrl);
      console.log(`[${chain}] ✨ New WebSocket provider created`);
    }
  }

  // Test WebSocket connection immediately
  console.log(`[${chain}] Testing WebSocket connection...`);
  wsProviders[chain]
    .getBlockNumber()
    .then((blockNumber) => {
      console.log(
        `[${chain}] ✅ WebSocket connected, current block: ${blockNumber}`
      );
    })
    .catch((error) => {
      console.error(
        `[${chain}] ❌ WebSocket connection failed:`,
        error.message
      );
    });

  // Add connection monitoring using provider events
  wsProviders[chain].on("network", (newNetwork, oldNetwork) => {
    const connectionTime = Date.now() - startTime;
    if (oldNetwork) {
      console.log(
        `[${chain}] 🔄 Network changed from ${oldNetwork.chainId} to ${newNetwork.chainId} (${connectionTime}ms)`
      );
    } else {
      console.log(
        `[${chain}] 🟢 Connected to network ${newNetwork.chainId} (${connectionTime}ms)`
      );
    }
  });

  wsProviders[chain].on("error", (error) => {
    console.error(`[${chain}] 🚨 Provider error:`, error);
    watcherActive[chain] = false;
  });

  wsProviders[chain].on("pending", (txHash: string) => {
    pendingTxHandler(chain, txHash);
  });

  // Reliable path: block (backup)
  wsProviders[chain].on("block", async (blockNumber) => {
    const firstBlockTime = Date.now() - startTime;
    try {
      // Retry logic for block fetching
      let block: BlockWithTx | null = null;
      let retries = 3;

      while (!block && retries > 0) {
        block = (await httpProviders[chain].getBlock(
          blockNumber,
          true
        )) as BlockWithTx;

        if (!block) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1s
          retries--;
        }
      }

      if (!block || !block.transactions) {
        return;
      }

      console.log(
        `[${chain}] Block ${blockNumber} has ${block.transactions.length} transactions (first block after ${firstBlockTime}ms)`
      );

      for (const tx of block.transactions) {
        const normalizedTo = tx.to
          ? normalizeAddress(tx.to.toLowerCase(), chain)
          : null;

        if (normalizedTo && addressesToWatch[chain].has(normalizedTo)) {
          console.log(`[${chain}] 🎯 Found transaction: ${tx.hash}`);
          await handleMatchedTransaction(chain, tx);
        }
      }
    } catch (err) {
      console.error(`[${chain}] Error in block handler:`, err);
    }
  });

  const setupTime = Date.now() - startTime;
  console.log(
    `[${chain}] 🚀 Provider listener started for ${addressesToWatch[chain].size} addresses (setup: ${setupTime}ms)`
  );
}

function stopProviderListener(chain: string) {
  const stopStartTime = Date.now();

  console.log(`[${chain}] 🛑 Stopping provider listener...`);

  // Remove event listeners
  wsProviders[chain].removeAllListeners("pending");
  wsProviders[chain].removeAllListeners("block");
  wsProviders[chain].removeAllListeners("network");
  wsProviders[chain].removeAllListeners("error");

  watcherActive[chain] = false;

  if (
    wsProviders[chain].websocket &&
    typeof wsProviders[chain].websocket.close === "function"
  ) {
    console.log(`[${chain}] 🔌 Closing WebSocket connection...`);
    wsProviders[chain].websocket.close();
  }

  const stopTime = Date.now() - stopStartTime;
  console.log(`[${chain}] ✅ Provider listener stopped (${stopTime}ms)`);
}

async function pendingTxHandler(chain: string, txHash: string) {
  try {
    const tx = await wsProviders[chain].getTransaction(txHash);

    if (!tx || !tx.to) return;

    const normalizedTo = normalizeAddress(tx.to.toLowerCase(), chain);
    const isWatched = addressesToWatch[chain].has(normalizedTo);

    if (isWatched) {
      console.log(
        `[${chain}] 🎯 Found transaction for watched address: ${normalizedTo} (tx: ${txHash})`
      );
      await handleMatchedTransaction(chain, tx);
      // After handling, check if we should stop
      if (addressesToWatch[chain].size === 0 && watcherActive[chain]) {
        stopProviderListener(chain);
      }
    }
    // Optional: Add periodic logging to show the watcher is working
    else if (Math.random() < 0.001) {
      // Log ~0.1% of non-matching transactions
      console.log(
        `[${chain}] 👀 Monitoring ${addressesToWatch[chain].size} addresses, checked tx to: ${normalizedTo}`
      );
    }
  } catch (error) {
    console.error(`[${chain}] Error in pendingTxHandler for ${txHash}:`, error);
  }
}

async function startWorker() {
  console.log("Starting EVM watcher worker...");

  // Initialize database connection first
  try {
    await initializeDatabase();
    console.log("✅ Database connection initialized for EVM watcher");
  } catch (error) {
    console.error("❌ Failed to initialize database connection:", error);
    process.exit(1);
  }

  await loadAddressesFromDB();

  for (const chain of CHAINS_WITH_TOKENS) {
    if (addressesToWatch[chain.name].size > 0) {
      startProviderListener(chain.name);
    }
  }

  // Start periodic cleanup every 5 minutes
  setInterval(async () => {
    await cleanupExpiredAddresses();
  }, 5 * 60 * 1000); // 5 minutes

  // Start periodic health check every 2 minutes
  setInterval(async () => {
    await healthCheckAndRestart();
  }, 2 * 60 * 1000); // 2 minutes

  console.log("EVM watcher worker started successfully");
}

async function gracefulShutdown() {
  console.log("Shutting down gracefully...");
  try {
    // Remove all listeners to stop new work
    for (const chain of CHAINS_WITH_TOKENS) {
      wsProviders[chain.name].removeAllListeners();
      if (
        wsProviders[chain.name].websocket &&
        typeof wsProviders[chain.name].websocket.close === "function"
      ) {
        wsProviders[chain.name].websocket.close();
      }

      // Clean up ERC20 watchers
      if (erc20Watchers[chain.name]) {
        // You might want to add a cleanup method to ERC20Watcher
        // erc20Watchers[chain.name].cleanup();
      }
    }

    // PostgreSQL connections are handled by the connection pool
    // No explicit cleanup needed for Drizzle/postgres.js

    console.log("Cleanup complete. Exiting.");
    process.exit(0);
  } catch (err) {
    console.error("Error during graceful shutdown:", err);
    process.exit(1);
  }
}

process.on("SIGINT", gracefulShutdown); // Ctrl+C
process.on("SIGTERM", gracefulShutdown); // Termination signal
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  gracefulShutdown();
});

startWorker().catch((error) => {
  console.error("Failed to start the worker:", error);
  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);
  process.exit(1);
});

// API endpoint to trigger cleanup
app.post("/cleanup", async (req, res) => {
  try {
    await cleanupExpiredAddresses();
    res.json({
      success: true,
      message: "Cleanup completed",
      addressesWatching: Object.fromEntries(
        Object.entries(addressesToWatch).map(([chain, addressMap]) => [
          chain,
          Object.fromEntries(addressMap),
        ])
      ),
    });
  } catch (error) {
    console.error("Error during cleanup:", error);
    res.status(500).json({ success: false, error: "Cleanup failed" });
  }
});

// API endpoint to get current watching status
app.get("/status", async (req, res) => {
  const chainStatus: Record<
    string,
    {
      watcherActive: boolean;
      addressCount: number;
      connectionStatus: string;
    }
  > = {};

  for (const chain of CHAINS_WITH_TOKENS) {
    let connectionStatus = "unknown";
    try {
      await wsProviders[chain.name].getBlockNumber();
      connectionStatus = "connected";
    } catch (error) {
      connectionStatus = "disconnected";
    }

    chainStatus[chain.name] = {
      watcherActive: watcherActive[chain.name],
      addressCount: addressesToWatch[chain.name].size,
      connectionStatus,
    };
  }

  res.json({
    success: true,
    chainStatus,
    addressesWatching: Object.fromEntries(
      Object.entries(addressesToWatch).map(([chain, addressMap]) => [
        chain,
        Object.fromEntries(addressMap),
      ])
    ),
  });
});

// API endpoint to restart listeners for a specific chain
app.post("/restart-listener/:chain", (req, res) => {
  const { chain } = req.params;

  if (!addressesToWatch[chain]) {
    res.status(400).json({ error: "Invalid chain" });
    return;
  }

  console.log(`[${chain}] Manual restart requested`);

  if (watcherActive[chain]) {
    stopProviderListener(chain);
  }

  if (addressesToWatch[chain].size > 0) {
    startProviderListener(chain);
    res.json({
      success: true,
      message: `Listener restarted for ${chain}`,
      addressCount: addressesToWatch[chain].size,
    });
  } else {
    res.json({
      success: true,
      message: `No addresses to watch for ${chain}`,
      addressCount: 0,
    });
  }
});

// API endpoint to get pending transactions for an address
app.get("/pending-transactions/:chain/:address", async (req, res) => {
  try {
    const { chain, address } = req.params;
    const normalizedAddress = normalizeAddress(address, chain);

    const pendingTransactions =
      await transactionService.getPendingTransactionsByChainAndAddress(
        chain,
        normalizedAddress
      );

    res.json({
      success: true,
      address: normalizedAddress,
      chain,
      pendingTransactions: pendingTransactions.map((tx) => ({
        transactionId: tx.transactionId,
        sourceAmount: tx.sourceAmount,
        sourceCurrency: tx.sourceCurrency,
        destinationAmount: tx.destinationAmount,
        destinationCurrency: tx.destinationCurrency,
        createdAt: tx.createdAt,
        expiredAt: tx.expiredAt,
        status: tx.status,
      })),
      watchCount: addressesToWatch[chain]?.get(normalizedAddress) || 0,
    });
  } catch (error) {
    console.error("Error fetching pending transactions:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch pending transactions" });
  }
});

// Start the HTTP server
const PORT = process.env.EVM_WATCHER_PORT || 4000;
server.listen(PORT, () => {
  console.log(
    `\x1b[34mWatcher HTTP server and WS listening on port ${PORT}\x1b[0m`
  );
});
