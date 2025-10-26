// src/workers/hypersync-worker.ts
import { HypersyncClient, BlockField, LogField, TransactionField, Decoder, } from "@envio-dev/hypersync-client";
import { PostgresTransactionService } from "../services/transaction.service.js";
import { TransactionStatus } from "../shared/types.js";
import { TokenConfigUtils } from "../utils/token-config.js";
import { ethers } from "ethers";
import { TransactionConfirmationService } from "../services/transaction-confirmation.service.js";
export class HypersyncWorker {
    isRunning = false;
    scanInterval = null;
    transactionService = null;
    transactionConfirmationService = null;
    // In-memory state: chain -> addresses
    watchedAddresses = new Map();
    // Chain configurations
    chains = new Map();
    constructor() {
        // Don't initialize transaction service here - do it lazily
        // Don't initialize chains automatically - do it when needed
    }
    // Initialize chains when first needed
    async ensureInitialized() {
        if (this.chains.size === 0) {
            await this.initializeChains();
        }
    }
    // Lazy initialization of transaction service
    getTransactionService() {
        if (!this.transactionService) {
            this.transactionService = new PostgresTransactionService();
        }
        return this.transactionService;
    }
    // Lazy initialization of transaction confirmation service
    getTransactionConfirmationService() {
        if (!this.transactionConfirmationService) {
            this.transactionConfirmationService =
                new TransactionConfirmationService();
        }
        return this.transactionConfirmationService;
    }
    // Validate and normalize Ethereum address
    validateAndNormalizeAddress(address) {
        if (!address || typeof address !== "string") {
            return null;
        }
        // Remove 0x prefix if present
        const cleanAddress = address.toLowerCase().startsWith("0x")
            ? address.toLowerCase().slice(2)
            : address.toLowerCase();
        // Check if it's a valid hex string of correct length
        if (!/^[0-9a-f]{40}$/i.test(cleanAddress)) {
            console.error(`Invalid address format: ${address} - must be 40 hex characters (without 0x prefix). Got ${cleanAddress.length} characters: "${cleanAddress}"`);
            return null;
        }
        // Return with 0x prefix
        return "0x" + cleanAddress;
    }
    async initializeChains() {
        // Get supported chains from token config
        const supportedChains = TokenConfigUtils.getSupportedChains();
        console.log(`Initializing ${supportedChains.length} chains from token config...`);
        for (const chainName of supportedChains) {
            const chainConfig = TokenConfigUtils.getChainConfig(chainName);
            if (!chainConfig) {
                console.warn(`Chain config not found for ${chainName}`);
                continue;
            }
            try {
                const client = HypersyncClient.new({ url: chainConfig.hypersyncUrl });
                // Get current block height
                const currentBlock = await client.getHeight();
                this.chains.set(chainName, {
                    name: chainName,
                    hypersyncUrl: chainConfig.hypersyncUrl,
                    client,
                    lastScannedBlock: currentBlock, // Start from NOW, not genesis
                });
                // Initialize empty address map for each chain
                this.watchedAddresses.set(chainName, new Map());
                console.log(`✅ Initialized ${chainName} (block: ${currentBlock})`);
            }
            catch (error) {
                console.error(`❌ Failed to initialize ${chainName}:`, error);
            }
        }
        console.log(`Initialized ${this.chains.size} chains for Hypersync`);
    }
    // Add address to watch (for ETH/native token only)
    async addAddress(address, chain) {
        await this.ensureInitialized();
        if (!this.chains.has(chain)) {
            console.warn(`Chain ${chain} not supported`);
            return false;
        }
        // Validate address format
        const normalizedAddress = this.validateAndNormalizeAddress(address);
        if (!normalizedAddress) {
            console.error(`Invalid address format: ${address}`);
            return false;
        }
        const chainAddresses = this.watchedAddresses.get(chain);
        if (!chainAddresses.has(normalizedAddress)) {
            chainAddresses.set(normalizedAddress, {
                address: normalizedAddress,
                tokens: new Set(),
                addedAt: new Date(),
            });
        }
        console.log(`Added ${normalizedAddress} to watch on ${chain} for ETH/native token`);
        // Start worker if not running and we have addresses
        this.checkAndStart();
        return true;
    }
    // Add address to watch for specific token by symbol
    async addAddressForToken(address, chain, tokenSymbol) {
        await this.ensureInitialized();
        if (!this.chains.has(chain)) {
            console.warn(`Chain ${chain} not supported`);
            return false;
        }
        const tokenAddress = TokenConfigUtils.getTokenAddress(chain, tokenSymbol);
        if (!tokenAddress) {
            console.error(`Token ${tokenSymbol} not supported on ${chain}`);
            return false;
        }
        // Validate address format
        const normalizedAddress = this.validateAndNormalizeAddress(address);
        if (!normalizedAddress) {
            console.error(`Invalid address format: ${address}`);
            return false;
        }
        const chainAddresses = this.watchedAddresses.get(chain);
        if (!chainAddresses.has(normalizedAddress)) {
            chainAddresses.set(normalizedAddress, {
                address: normalizedAddress,
                tokens: new Set(),
                addedAt: new Date(),
            });
        }
        // Add the resolved token address
        chainAddresses
            .get(normalizedAddress)
            .tokens.add(tokenAddress.toLowerCase());
        console.log(`Added ${normalizedAddress} to watch on ${chain} for token ${tokenSymbol} (${tokenAddress})`);
        // Start worker if not running and we have addresses
        this.checkAndStart();
        return true;
    }
    // Add address to watch for all supported tokens on a chain
    async addAddressForAllTokens(address, chain) {
        const tokenSymbols = TokenConfigUtils.getChainTokenSymbols(chain);
        if (tokenSymbols.length === 0) {
            console.warn(`No tokens configured for chain ${chain}`);
            return false;
        }
        let success = true;
        for (const tokenSymbol of tokenSymbols) {
            const result = await this.addAddressForToken(address, chain, tokenSymbol);
            if (!result) {
                success = false;
            }
        }
        return success;
    }
    // Remove address from watch
    removeAddress(address, chain) {
        if (!this.chains.has(chain))
            return false;
        const chainAddresses = this.watchedAddresses.get(chain);
        const normalizedAddress = this.validateAndNormalizeAddress(address);
        if (!normalizedAddress)
            return false;
        const removed = chainAddresses.delete(normalizedAddress);
        if (removed) {
            console.log(`Removed ${normalizedAddress} from watch on ${chain}`);
            // Stop worker if no addresses left
            this.checkAndStop();
        }
        return removed;
    }
    // Smart remove: only remove if no active transactions exist for this address
    async removeAddressIfNoActiveTransactions(address, chain) {
        try {
            const normalizedAddress = this.validateAndNormalizeAddress(address);
            if (!normalizedAddress)
                return false;
            // Check if there are still active transactions for this address
            const activeTransactions = await this.getTransactionService().getPendingTransactionsByChainAndAddress(chain, normalizedAddress);
            if (activeTransactions.length === 0) {
                // No active transactions, safe to remove
                return this.removeAddress(normalizedAddress, chain);
            }
            else {
                console.log(`Keeping ${normalizedAddress} on ${chain} - ${activeTransactions.length} active transactions remaining`);
                return false;
            }
        }
        catch (error) {
            console.error(`Error checking active transactions for ${address} on ${chain}:`, error);
            return false;
        }
    }
    // Load active transactions on startup
    async loadActiveTransactions() {
        try {
            await this.ensureInitialized();
            console.log("Loading active transactions into Hypersync memory state...");
            const pendingTransactions = await this.getTransactionService().getPendingCryptoTransactions();
            const activeTransactions = pendingTransactions.filter((tx) => tx.status !== TransactionStatus.EXPIRED &&
                (!tx.expiredAt || tx.expiredAt > new Date()) &&
                tx.sourceAddress &&
                tx.sourceChain);
            let loadedCount = 0;
            // Use for...of loop to handle async operations properly
            for (const tx of activeTransactions) {
                let success = false;
                // Check if it's a native token (ETH, BNB, MATIC, etc.) or ERC20 token
                const isNativeToken = !tx.sourceCurrency ||
                    tx.sourceCurrency === "ETH" ||
                    tx.sourceCurrency === "BNB" ||
                    tx.sourceCurrency === "MATIC" ||
                    tx.sourceCurrency === "AVAX";
                if (!isNativeToken) {
                    // ERC20 token transaction - use the token symbol directly
                    success = await this.addAddressForToken(tx.sourceAddress, tx.sourceChain, tx.sourceCurrency);
                }
                else {
                    // Native token transaction
                    success = await this.addAddress(tx.sourceAddress, tx.sourceChain);
                }
                if (success)
                    loadedCount++;
            }
            console.log(`✅ Loaded ${loadedCount} active transactions into Hypersync memory state`);
            // Print current state
            this.printCurrentState();
        }
        catch (error) {
            console.error("Error loading active transactions:", error);
        }
    }
    checkAndStart() {
        const totalAddresses = this.getTotalWatchedAddresses();
        if (totalAddresses > 0 && !this.isRunning) {
            console.log(`🚀 Starting Hypersync worker (${totalAddresses} addresses across ${this.getActiveChains().length} chains)`);
            this.start();
        }
    }
    checkAndStop() {
        const totalAddresses = this.getTotalWatchedAddresses();
        if (totalAddresses === 0 && this.isRunning) {
            console.log("🛑 No addresses to watch, stopping Hypersync worker");
            this.stop();
        }
    }
    start() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        // Run immediately
        this.scanAllChains();
        // Then run every 30 seconds
        this.scanInterval = setInterval(() => {
            this.scanAllChains();
        }, 12000);
        console.log("✅ Hypersync worker started");
    }
    stop() {
        if (!this.isRunning)
            return;
        this.isRunning = false;
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
        console.log("✅ Hypersync worker stopped");
    }
    async scanAllChains() {
        const activeChains = this.getActiveChains();
        if (activeChains.length === 0) {
            this.stop();
            return;
        }
        // Scan all chains in parallel
        const scanPromises = activeChains.map((chain) => this.scanChain(chain));
        try {
            await Promise.allSettled(scanPromises);
        }
        catch (error) {
            console.error("Error in multi-chain scan:", error);
        }
    }
    async scanChain(chainName) {
        try {
            const chainConfig = this.chains.get(chainName);
            const chainAddresses = this.watchedAddresses.get(chainName);
            if (chainAddresses.size === 0)
                return;
            const addresses = Array.from(chainAddresses.keys());
            const allTokens = this.getAllTokensForChain(chainName);
            // Debug logging
            console.log(`[${chainName}] Scanning addresses:`, addresses);
            console.log(`[${chainName}] Watching tokens:`, allTokens);
            // Build query with error handling
            let query;
            try {
                query = this.buildQuery(addresses, allTokens, chainConfig.lastScannedBlock);
            }
            catch (queryError) {
                console.error(`[${chainName}] Failed to build query:`, queryError);
                return; // Skip this scan cycle
            }
            // Debug the query structure (only if logs exist)
            if (query.logs && query.logs.length > 0) {
                console.log(`[${chainName}] Query topics:`, JSON.stringify(query.logs[0].topics, null, 2));
            }
            // Execute scan
            const res = await chainConfig.client.get(query);
            // Process results
            await this.processResults(res, chainName);
            // Update last scanned block
            chainConfig.lastScannedBlock = res.nextBlock;
            console.log(`[${chainName}] Scanned to block ${res.nextBlock}, watching ${addresses.length} addresses`);
        }
        catch (error) {
            console.error(`Error scanning chain ${chainName}:`, error);
            // If it's a parsing error, log more details
            if (error instanceof Error && error.message.includes("parse")) {
                console.error(`[${chainName}] Query parsing failed - this might be due to invalid address formatting`);
                // Log current addresses for debugging
                const chainAddresses = this.watchedAddresses.get(chainName);
                const addresses = Array.from(chainAddresses.keys());
                console.error(`[${chainName}] Current addresses:`, addresses);
            }
        }
    }
    getAllTokensForChain(chainName) {
        const chainAddresses = this.watchedAddresses.get(chainName);
        const allTokens = new Set();
        chainAddresses.forEach((watchedAddr) => {
            watchedAddr.tokens.forEach((token) => allTokens.add(token));
        });
        return Array.from(allTokens);
    }
    buildQuery(addresses, tokens, fromBlock) {
        // Validate and normalize all addresses first
        const validAddresses = [];
        const addressTopicFilter = [];
        for (const addr of addresses) {
            const normalized = this.validateAndNormalizeAddress(addr);
            if (normalized) {
                validAddresses.push(normalized);
                // Create topic filter (remove 0x and pad to 64 chars)
                const cleanAddr = normalized.toLowerCase().startsWith("0x")
                    ? normalized.toLowerCase().slice(2)
                    : normalized.toLowerCase();
                if (cleanAddr.length === 40) {
                    addressTopicFilter.push("0x000000000000000000000000" + cleanAddr);
                }
            }
            else {
                console.error(`Skipping invalid address: ${addr}`);
            }
        }
        // Don't build query if no valid addresses
        if (validAddresses.length === 0) {
            throw new Error("No valid addresses to query");
        }
        // Build the query structure
        const query = {
            fromBlock,
            fieldSelection: {
                block: [BlockField.Number, BlockField.Timestamp, BlockField.Hash],
                log: [
                    LogField.Data,
                    LogField.Address,
                    LogField.Topic0,
                    LogField.Topic1,
                    LogField.Topic2,
                    LogField.Topic3,
                    LogField.BlockNumber,
                    LogField.TransactionHash,
                ],
                transaction: [
                    TransactionField.BlockNumber,
                    TransactionField.TransactionIndex,
                    TransactionField.Hash,
                    TransactionField.From,
                    TransactionField.To,
                    TransactionField.Value,
                    TransactionField.Input,
                ],
            },
        };
        // Add logs section only if we have tokens to watch
        if (tokens.length > 0 && addressTopicFilter.length > 0) {
            query.logs = [
                // Token transfers TO watched addresses
                {
                    address: tokens,
                    topics: [
                        [
                            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
                        ],
                        [], // from (any)
                        addressTopicFilter, // to (our addresses)
                    ],
                },
                // Token transfers FROM watched addresses
                {
                    address: tokens,
                    topics: [
                        [
                            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
                        ],
                        addressTopicFilter, // from (our addresses)
                        [], // to (any)
                    ],
                },
            ];
        }
        // Add transactions section for ETH transfers
        query.transactions = [{ from: validAddresses }, { to: validAddresses }];
        return query;
    }
    async processResults(res, chainName) {
        // Process ERC20 transfers
        if (res.data.logs.length > 0) {
            for (const log of res.data.logs) {
                await this.processTokenTransfer(log, chainName);
            }
        }
        // Process ETH transactions
        for (const tx of res.data.transactions) {
            await this.processEthTransaction(tx, chainName);
        }
    }
    async processTokenTransfer(log, chainName) {
        try {
            // Decode and process token transfer
            const decoder = Decoder.fromSignatures([
                "Transfer(address indexed from, address indexed to, uint amount)",
            ]);
            const decoded = await decoder.decodeLogs([log]);
            const event = decoded[0];
            if (!event)
                return;
            const tokenAddress = log.address.toLowerCase();
            const from = event.indexed[0].val;
            const to = event.indexed[1].val;
            const amountReceive = event.body[0].val;
            console.log("tokenAddress", tokenAddress);
            console.log("[To: ]", to);
            console.log("[Amount:]", amountReceive);
            await this.processTransactionMatch(chainName, to, amountReceive, log.hash, log.transactionHash, "Token");
        }
        catch (error) {
            console.error(`[${chainName}] Error processing token transfer:`, error);
            // Don't re-throw to prevent worker from crashing
        }
    }
    async processEthTransaction(tx, chainName) {
        // Process ETH transaction
        if (tx.from && tx.to && tx.value !== undefined && tx.value !== "0x0") {
            console.log(`[${chainName}] ETH transaction detected: ${tx.hash} (${tx.value} wei)`);
            const amountReceive = BigInt(tx.value);
            await this.processTransactionMatch(chainName, tx.to, amountReceive, tx.hash, tx.hash, "ETH");
        }
    }
    /**
     * Reusable method to process transaction matching and confirmation
     * Used for both token transfers and ETH transfers
     */
    async processTransactionMatch(chainName, recipientAddress, amountReceived, logHash, transactionHash, transferType) {
        try {
            const pendingTransactions = await this.getTransactionService().getPendingTransactionsByChainAndAddress(chainName, recipientAddress.toLowerCase());
            if (pendingTransactions.length === 0) {
                console.log(`[${chainName}] No pending transactions found for address ${recipientAddress}.`);
                return;
            }
            let matchedTransaction = null;
            for (const transaction of pendingTransactions) {
                // Convert source amount to wei for precise comparison
                let sourceAmountInWei;
                if (transaction.sourceCurrency.toLocaleLowerCase() !== "eth") {
                    const tokenInfo = TokenConfigUtils.getTokenInfo(chainName, transaction.sourceCurrency);
                    if (!tokenInfo) {
                        console.log(`[${chainName}] Stablecoin ${transaction.sourceCurrency} not supported on ${chainName}`);
                        return;
                    }
                    const truncatedAmount = parseFloat(transaction.sourceAmount).toFixed(tokenInfo.decimals);
                    sourceAmountInWei = ethers.parseUnits(truncatedAmount, tokenInfo.decimals);
                }
                else {
                    sourceAmountInWei = ethers.parseEther(transaction.sourceAmount);
                }
                if (amountReceived >= sourceAmountInWei) {
                    matchedTransaction = transaction;
                    console.log(`[${chainName}] Matched transaction ${transaction.transactionId} with amount ${transaction.sourceAmount} ${transferType === "ETH" ? "ETH" : "tokens"}`);
                    break;
                }
            }
            // If no exact match, use the oldest transaction (FIFO)
            if (!matchedTransaction) {
                matchedTransaction = pendingTransactions[0];
                console.log(`[${chainName}] No exact amount match, using oldest transaction ${matchedTransaction.transactionId}`);
            }
            await this.getTransactionService().updateCryptoStatus(matchedTransaction.id, TransactionStatus.CRYPTO_CONFIRMED, logHash);
            const confirmationResult = await this.getTransactionConfirmationService().processConfirmedEvmTransaction(matchedTransaction.transactionId);
            if (!confirmationResult.success) {
                console.error(`[${chainName}] Transaction confirmation failed:`, confirmationResult.error);
                // Transaction status will be updated by the confirmation service
            }
            await this.removeAddressIfNoActiveTransactions(recipientAddress, chainName);
            console.log(`[${chainName}] ${transferType} transfer detected: ${transactionHash}`);
        }
        catch (error) {
            console.error(`[${chainName}] Error processing ${transferType} transaction match:`, error);
            // Don't re-throw to prevent worker from crashing
        }
    }
    // Utility methods
    getTotalWatchedAddresses() {
        let total = 0;
        this.watchedAddresses.forEach((chainMap) => {
            total += chainMap.size;
        });
        return total;
    }
    getActiveChains() {
        const activeChains = [];
        this.watchedAddresses.forEach((chainMap, chainName) => {
            if (chainMap.size > 0) {
                activeChains.push(chainName);
            }
        });
        return activeChains;
    }
    printCurrentState() {
        console.log("\n📊 Hypersync Worker State:");
        this.watchedAddresses.forEach((chainMap, chainName) => {
            if (chainMap.size > 0) {
                console.log(`  ${chainName}: ${chainMap.size} addresses`);
                chainMap.forEach((watchedAddr, address) => {
                    const tokenCount = watchedAddr.tokens.size;
                    console.log(`    ${address}${tokenCount > 0 ? ` (${tokenCount} tokens)` : ""}`);
                });
            }
        });
        console.log(`  Status: ${this.isRunning ? "🟢 Running" : "🔴 Stopped"}\n`);
    }
    // Public API
    getStatus() {
        return {
            isRunning: this.isRunning,
            totalAddresses: this.getTotalWatchedAddresses(),
            activeChains: this.getActiveChains(),
            chainDetails: Object.fromEntries(Array.from(this.watchedAddresses.entries()).map(([chain, addresses]) => [
                chain,
                {
                    addressCount: addresses.size,
                    addresses: Array.from(addresses.keys()),
                    lastScannedBlock: this.chains.get(chain)?.lastScannedBlock || 0,
                },
            ])),
        };
    }
    // Check if hypersync can handle monitoring for a specific chain
    async canMonitorChain(chain) {
        try {
            // Check if chain is supported in token config
            const chainConfig = TokenConfigUtils.getChainConfig(chain);
            if (!chainConfig) {
                console.warn(`Chain ${chain} not found in token config`);
                return false;
            }
            // Ensure chains are initialized
            await this.ensureInitialized();
            // Check if the chain was successfully initialized
            if (!this.chains.has(chain)) {
                console.warn(`Chain ${chain} failed to initialize`);
                return false;
            }
            // Optional: Test the hypersync connection
            try {
                const chainInstance = this.chains.get(chain);
                await chainInstance.client.getHeight();
                return true;
            }
            catch (networkError) {
                console.error(`Chain ${chain} network test failed:`, networkError);
                return false;
            }
        }
        catch (error) {
            console.error(`Error checking chain ${chain} capability:`, error);
            return false;
        }
    }
    // Health check for system readiness
    async isHealthy() {
        const issues = [];
        try {
            // Ensure chains are initialized
            await this.ensureInitialized();
            // Check if we have any supported chains
            if (this.chains.size === 0) {
                issues.push("No blockchain networks available");
            }
            // Check each chain's connectivity (optional - might be slow)
            // for (const [chainName, chainConfig] of this.chains) {
            //   try {
            //     await chainConfig.client.getHeight();
            //   } catch (error) {
            //     issues.push(`${chainName} network unavailable`);
            //   }
            // }
        }
        catch (error) {
            issues.push(`Initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
        return {
            healthy: issues.length === 0,
            issues,
        };
    }
    // Force cleanup (useful for testing)
    clearAllAddresses() {
        this.watchedAddresses.forEach((chainMap) => chainMap.clear());
        this.stop();
        console.log("🧹 Cleared all watched addresses");
    }
}
// Singleton instance
export const hypersyncWorker = new HypersyncWorker();
