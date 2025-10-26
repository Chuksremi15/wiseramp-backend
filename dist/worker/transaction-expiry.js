import { PostgresTransactionService } from "../services/transaction.service.js";
import { TransactionStatus } from "../shared/types.js";
import { hypersyncWorker } from "./hypersync-worker.js";
class TransactionExpiryWorker {
    static transactionService = new PostgresTransactionService();
    intervalId = null;
    isRunning = false;
    /**
     * Start the transaction expiry worker
     * Runs every 5 minutes to check for expired transactions
     */
    start() {
        if (this.isRunning) {
            console.log(`[${new Date().toISOString()}] Transaction expiry worker is already running`);
            return;
        }
        console.log(`[${new Date().toISOString()}] Starting transaction expiry worker...`);
        this.isRunning = true;
        // Run immediately on start
        this.checkAndExpireTransactions();
        // Then run every 5 minutes
        this.intervalId = setInterval(() => {
            this.checkAndExpireTransactions();
        }, 5 * 60 * 1000); // 5 minutes
        console.log(`[${new Date().toISOString()}] Transaction expiry worker started successfully (interval: 5 minutes)`);
    }
    /**
     * Stop the transaction expiry worker
     */
    stop() {
        if (!this.isRunning) {
            console.log(`[${new Date().toISOString()}] Transaction expiry worker is not running`);
            return;
        }
        console.log(`[${new Date().toISOString()}] Stopping transaction expiry worker...`);
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        console.log(`[${new Date().toISOString()}] Transaction expiry worker stopped successfully`);
    }
    /**
     * Check for and expire old transactions
     */
    async checkAndExpireTransactions() {
        try {
            console.log(`[${new Date().toISOString()}] Checking for expired transactions...`);
            const startTime = Date.now();
            const result = await TransactionExpiryWorker.transactionService.expireOldTransactions();
            const duration = Date.now() - startTime;
            if (result.count > 0) {
                console.log(`[${new Date().toISOString()}] Expired ${result.count} transactions in ${duration}ms`);
                // Remove expired addresses from hypersync monitoring (only if no other active transactions)
                if (result.expiredAddresses.length > 0) {
                    console.log(`[${new Date().toISOString()}] Cleaning up ${result.expiredAddresses.length} addresses from hypersync monitoring...`);
                    let removedCount = 0;
                    for (const { address, chain } of result.expiredAddresses) {
                        const removed = await hypersyncWorker.removeAddressIfNoActiveTransactions(address, chain);
                        if (removed) {
                            removedCount++;
                            console.log(`[${new Date().toISOString()}] Removed ${address} from ${chain} monitoring`);
                        }
                    }
                    console.log(`[${new Date().toISOString()}] Successfully removed ${removedCount}/${result.expiredAddresses.length} addresses from hypersync monitoring`);
                }
            }
            else {
                console.log(`[${new Date().toISOString()}] No transactions to expire (checked in ${duration}ms)`);
            }
        }
        catch (error) {
            console.error(`[${new Date().toISOString()}] Error in transaction expiry worker:`, error);
            // Don't stop the worker on error, just log and continue
            // The next interval will try again
        }
    }
    /**
     * Manually expire a specific transaction
     */
    async expireTransaction(transactionId) {
        try {
            const transaction = await TransactionExpiryWorker.transactionService.getTransactionByTransactionId(transactionId);
            if (!transaction) {
                console.log(`Transaction ${transactionId} not found`);
                return false;
            }
            if (transaction.status === TransactionStatus.EXPIRED) {
                console.log(`Transaction ${transactionId} is already expired`);
                return true;
            }
            // Use the service's expireTransaction method
            const success = await TransactionExpiryWorker.transactionService.expireTransaction(transaction.id);
            if (success) {
                console.log(`Manually expired transaction ${transactionId}`);
                // Clean up hypersync monitoring if this was the last active transaction for this address
                if (transaction.sourceAddress && transaction.sourceChain) {
                    const removed = await hypersyncWorker.removeAddressIfNoActiveTransactions(transaction.sourceAddress, transaction.sourceChain);
                    if (removed) {
                        console.log(`Removed ${transaction.sourceAddress} from ${transaction.sourceChain} monitoring (no more active transactions)`);
                    }
                }
                return true;
            }
            else {
                console.error(`Failed to expire transaction ${transactionId}`);
                return false;
            }
        }
        catch (error) {
            console.error(`Error expiring transaction ${transactionId}:`, error);
            return false;
        }
    }
    /**
     * Get status of the worker
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
        };
    }
    /**
     * Get expired transactions without expiring them (for monitoring)
     */
    async getExpiredTransactions() {
        try {
            return await TransactionExpiryWorker.transactionService.findExpiredTransactions();
        }
        catch (error) {
            console.error("Error fetching expired transactions:", error);
            return [];
        }
    }
    /**
     * Force run expiry check (useful for testing or manual triggers)
     */
    async forceExpiry() {
        try {
            console.log(`[${new Date().toISOString()}] Force running transaction expiry check...`);
            const result = await TransactionExpiryWorker.transactionService.expireOldTransactions();
            // Clean up hypersync monitoring for expired addresses (only if no other active transactions)
            if (result.expiredAddresses.length > 0) {
                console.log(`[${new Date().toISOString()}] Cleaning up ${result.expiredAddresses.length} addresses from hypersync monitoring...`);
                let removedCount = 0;
                for (const { address, chain } of result.expiredAddresses) {
                    const removed = await hypersyncWorker.removeAddressIfNoActiveTransactions(address, chain);
                    if (removed) {
                        removedCount++;
                    }
                }
                console.log(`[${new Date().toISOString()}] Removed ${removedCount}/${result.expiredAddresses.length} addresses from hypersync monitoring`);
            }
            return result.count;
        }
        catch (error) {
            console.error(`[${new Date().toISOString()}] Error in force expiry:`, error);
            return 0;
        }
    }
    /**
     * Get monitoring statistics
     */
    async getMonitoringStats() {
        try {
            const [expiredTransactions, pendingTransactions] = await Promise.all([
                TransactionExpiryWorker.transactionService.findExpiredTransactions(),
                TransactionExpiryWorker.transactionService.getPendingCryptoTransactions(),
            ]);
            return {
                hypersyncStatus: hypersyncWorker.getStatus(),
                expiredTransactionsCount: expiredTransactions.length,
                pendingTransactionsCount: pendingTransactions.length,
            };
        }
        catch (error) {
            console.error("Error getting monitoring stats:", error);
            return {
                hypersyncStatus: { error: "Failed to get hypersync status" },
                expiredTransactionsCount: 0,
                pendingTransactionsCount: 0,
            };
        }
    }
    /**
     * Health check for the worker and database connection
     */
    async healthCheck() {
        try {
            // Test database connection by trying to fetch expired transactions
            await TransactionExpiryWorker.transactionService.findExpiredTransactions();
            return {
                workerStatus: this.isRunning ? "running" : "stopped",
                databaseConnected: true,
            };
        }
        catch (error) {
            return {
                workerStatus: this.isRunning ? "running" : "stopped",
                databaseConnected: false,
                lastError: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
}
// Create singleton instance
const transactionExpiryWorker = new TransactionExpiryWorker();
// Handle graceful shutdown
process.on("SIGINT", () => {
    console.log("Received SIGINT, stopping transaction expiry worker...");
    transactionExpiryWorker.stop();
    process.exit(0);
});
process.on("SIGTERM", () => {
    console.log("Received SIGTERM, stopping transaction expiry worker...");
    transactionExpiryWorker.stop();
    process.exit(0);
});
export default transactionExpiryWorker;
