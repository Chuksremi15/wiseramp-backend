import { ethers } from "ethers";
import { TransactionStatus } from "../shared/types.js";

// ERC20 Transfer event signature
const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Common ERC20 ABI for Transfer events
const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

interface TokenConfig {
  address: string;
  symbol: string;
  decimals: number;
}

// Popular tokens on Ethereum mainnet
const SUPPORTED_TOKENS: Record<string, TokenConfig> = {
  USDT: {
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    symbol: "USDT",
    decimals: 6,
  },
  USDC: {
    address: "0xA0b86a33E6441b8C4505B8C4505B8C4505B8C4505", // Replace with real USDC address
    symbol: "USDC",
    decimals: 6,
  },
  // Add more tokens as needed
};

export class ERC20Watcher {
  private provider: ethers.WebSocketProvider;
  private httpProvider: ethers.JsonRpcProvider;
  private watchedAddresses: Map<string, Set<string>> = new Map(); // tokenAddress -> Set of recipient addresses
  private contracts: Map<string, ethers.Contract> = new Map();
  private transactionService?: any; // Add transaction service
  private chain: string; // Add chain identifier

  constructor(
    wsRpcUrl: string,
    httpRpcUrl: string,
    chain: string,
    transactionService?: any
  ) {
    this.provider = new ethers.WebSocketProvider(wsRpcUrl);
    this.httpProvider = new ethers.JsonRpcProvider(httpRpcUrl);
    this.chain = chain;
    this.transactionService = transactionService;

    // Initialize contracts for supported tokens
    for (const [symbol, config] of Object.entries(SUPPORTED_TOKENS)) {
      const contract = new ethers.Contract(
        config.address,
        ERC20_ABI,
        this.provider
      );
      this.contracts.set(config.address.toLowerCase(), contract);
    }
  }

  // Add address to watch for specific token
  async addAddressToWatch(
    tokenAddress: string,
    recipientAddress: string,
    fromBlock?: number
  ) {
    const normalizedToken = tokenAddress.toLowerCase();
    const normalizedRecipient = recipientAddress.toLowerCase();

    if (!this.watchedAddresses.has(normalizedToken)) {
      this.watchedAddresses.set(normalizedToken, new Set());
    }

    this.watchedAddresses.get(normalizedToken)!.add(normalizedRecipient);

    // Start listening if this is the first address for this token
    if (this.watchedAddresses.get(normalizedToken)!.size === 1) {
      this.startTokenListener(normalizedToken);
    }

    // Check for historical transfers if fromBlock is provided
    if (fromBlock !== undefined) {
      console.log(
        `Checking historical transfers for ${normalizedRecipient} from block ${fromBlock}`
      );
      await this.checkHistoricalTransfers(
        normalizedToken,
        normalizedRecipient,
        fromBlock
      );
    }
  }

  // Remove address from watching
  removeAddressFromWatch(tokenAddress: string, recipientAddress: string) {
    const normalizedToken = tokenAddress.toLowerCase();
    const normalizedRecipient = recipientAddress.toLowerCase();

    const addresses = this.watchedAddresses.get(normalizedToken);
    if (addresses) {
      addresses.delete(normalizedRecipient);

      // Stop listening if no more addresses for this token
      if (addresses.size === 0) {
        this.stopTokenListener(normalizedToken);
        this.watchedAddresses.delete(normalizedToken);
      }
    }
  }

  private startTokenListener(tokenAddress: string) {
    console.log(`Starting ERC20 listener for token: ${tokenAddress}`);

    // Method 1: Listen to Transfer events directly
    const contract = this.contracts.get(tokenAddress);
    if (contract) {
      contract.on("Transfer", (from, to, value, event) => {
        this.handleTransferEvent(tokenAddress, from, to, value, event);
      });
    }

    // Method 2: Listen to all logs and filter (more reliable for some cases)
    const filter = {
      address: tokenAddress,
      topics: [ERC20_TRANSFER_TOPIC],
    };

    this.provider.on(filter, (log) => {
      this.handleTransferLog(tokenAddress, log);
    });
  }

  private stopTokenListener(tokenAddress: string) {
    console.log(`Stopping ERC20 listener for token: ${tokenAddress}`);

    const contract = this.contracts.get(tokenAddress);
    if (contract) {
      contract.removeAllListeners("Transfer");
    }

    // Remove log listeners
    this.provider.removeAllListeners({
      address: tokenAddress,
      topics: [ERC20_TRANSFER_TOPIC],
    });
  }

  private async handleTransferEvent(
    tokenAddress: string,
    from: string,
    to: string,
    value: bigint,
    event: any
  ) {
    const normalizedTo = to.toLowerCase();
    const watchedAddresses = this.watchedAddresses.get(tokenAddress);

    if (watchedAddresses && watchedAddresses.has(normalizedTo)) {
      console.log(
        `ERC20 Transfer detected for watched address: ${normalizedTo}`
      );
      console.log(
        `Token: ${tokenAddress}, Amount: ${value.toString()}, TxHash: ${
          event.transactionHash
        }`
      );

      // Get token info
      const tokenConfig = Object.values(SUPPORTED_TOKENS).find(
        (t) => t.address.toLowerCase() === tokenAddress
      );

      if (tokenConfig) {
        const formattedAmount = ethers.formatUnits(value, tokenConfig.decimals);
        console.log(
          `Formatted amount: ${formattedAmount} ${tokenConfig.symbol}`
        );

        // Wait for confirmation
        const receipt = await event.getTransactionReceipt();
        if (receipt && receipt.status === 1) {
          await this.processConfirmedTransfer({
            tokenAddress,
            tokenSymbol: tokenConfig.symbol,
            recipientAddress: normalizedTo,
            amount: formattedAmount,
            txHash: event.transactionHash,
            blockNumber: event.blockNumber,
          });
        }
      }
    }
  }

  private async handleTransferLog(tokenAddress: string, log: ethers.Log) {
    try {
      // Decode the log
      const iface = new ethers.Interface(ERC20_ABI);
      const decoded = iface.parseLog({
        topics: log.topics,
        data: log.data,
      });

      if (decoded && decoded.name === "Transfer") {
        const [from, to, value] = decoded.args;
        await this.handleTransferEvent(tokenAddress, from, to, value, {
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber,
          getTransactionReceipt: () =>
            this.httpProvider.getTransactionReceipt(log.transactionHash!),
        });
      }
    } catch (error) {
      console.error("Error decoding transfer log:", error);
    }
  }

  private async processConfirmedTransfer(transfer: {
    tokenAddress: string;
    tokenSymbol: string;
    recipientAddress: string;
    amount: string;
    txHash: string;
    blockNumber: number;
  }) {
    console.log(
      `[${this.chain}] Processing confirmed ERC20 transfer:`,
      transfer
    );

    if (!this.transactionService) {
      console.log(`[${this.chain}] No transaction service available`);
      return;
    }

    try {
      // Get pending token transactions for this chain and address
      const pendingTransactions =
        await this.transactionService.getPendingTransactionsByChainAndAddress(
          this.chain,
          transfer.recipientAddress
        );

      // Filter for token transactions matching this token address
      const tokenTransactions = pendingTransactions.filter(
        (tx: any) =>
          tx.tokenAddress &&
          tx.tokenAddress.toLowerCase() === transfer.tokenAddress.toLowerCase()
      );

      if (tokenTransactions.length === 0) {
        console.log(
          `[${this.chain}] No pending token transactions found for ${transfer.recipientAddress}`
        );
        this.removeAddressFromWatch(
          transfer.tokenAddress,
          transfer.recipientAddress
        );
        return;
      }

      // Match by amount with tolerance
      let matchedTransaction = null;
      for (const tx of tokenTransactions) {
        const expectedAmount = parseFloat(tx.sourceAmount);
        const receivedAmount = parseFloat(transfer.amount);
        const tolerance = Math.max(expectedAmount * 0.001, 0.000001); // 0.1% tolerance or minimum 0.000001

        if (Math.abs(expectedAmount - receivedAmount) <= tolerance) {
          matchedTransaction = tx;
          console.log(
            `[${this.chain}] Matched token transaction ${tx.transactionId} with amount ${tx.sourceAmount} ${transfer.tokenSymbol}`
          );
          break;
        }
      }

      // If no exact match, use the oldest transaction (FIFO)
      if (!matchedTransaction) {
        matchedTransaction = tokenTransactions[0];
        console.log(
          `[${this.chain}] No exact amount match, using oldest token transaction ${matchedTransaction.transactionId}`
        );
      }

      // Update transaction status
      await this.transactionService.updateCryptoStatus(
        matchedTransaction.id,
        TransactionStatus.CRYPTO_CONFIRMED,
        transfer.txHash
      );

      console.log(
        `[${this.chain}] Updated transaction ${matchedTransaction.transactionId} to CRYPTO_CONFIRMED`
      );

      // Notify other services
      await this.notifyTransactionConfirmed(transfer, matchedTransaction);

      // Remove from watching
      this.removeAddressFromWatch(
        transfer.tokenAddress,
        transfer.recipientAddress
      );
    } catch (error) {
      console.error(
        `[${this.chain}] Error processing confirmed transfer:`,
        error
      );
    }
  }

  private async notifyTransactionConfirmed(
    transfer: any,
    matchedTransaction: any
  ) {
    try {
      const axios = await import("axios");

      // Notify your main server (similar to ETH confirmation)
      await axios.default.post(
        "http://localhost:3000/api/confirm-transaction/on-confirmed-token", // You might need to create this endpoint
        {
          transactionId: matchedTransaction.transactionId,
          address: transfer.recipientAddress,
          status: "CRYPTO_CONFIRMED",
          txHash: transfer.txHash,
          tokenAddress: transfer.tokenAddress,
          tokenSymbol: transfer.tokenSymbol,
          amount: transfer.amount,
          expectedAmount: matchedTransaction.sourceAmount,
          chain: this.chain,
          sourceCurrency: matchedTransaction.sourceCurrency,
          destinationCurrency: matchedTransaction.destinationCurrency,
        }
      );

      console.log(
        `[${this.chain}] Notified main server about confirmed token transfer`
      );
    } catch (error) {
      console.error(
        `[${this.chain}] Error notifying transaction confirmed:`,
        error
      );
    }
  }

  // Method to watch for historical transfers (useful for missed events)
  async checkHistoricalTransfers(
    tokenAddress: string,
    recipientAddress: string,
    fromBlock: number,
    toBlock: number = -1
  ) {
    const filter = {
      address: tokenAddress,
      topics: [
        ERC20_TRANSFER_TOPIC,
        null, // from (any)
        ethers.zeroPadValue(recipientAddress, 32), // to (specific address)
      ],
      fromBlock,
      toBlock: toBlock === -1 ? "latest" : toBlock,
    };

    const logs = await this.httpProvider.getLogs(filter);

    for (const log of logs) {
      await this.handleTransferLog(tokenAddress, log);
    }
  }
}
