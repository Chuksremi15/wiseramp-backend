import { PostgresTransactionService } from "../services/transaction.service.js";
import { TransactionStatus } from "../shared/types.js";

class TransactionExpiryWorker {
  private static transactionService = new PostgresTransactionService();

  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Start the transaction expiry worker
   * Runs every 5 minutes to check for expired transactions
   */
  public start(): void {
    if (this.isRunning) {
      console.log(
        `[${new Date().toISOString()}] Transaction expiry worker is already running`
      );
      return;
    }

    console.log(
      `[${new Date().toISOString()}] Starting transaction expiry worker...`
    );
    this.isRunning = true;

    // Run immediately on start
    this.checkAndExpireTransactions();

    // Then run every 5 minutes
    this.intervalId = setInterval(() => {
      this.checkAndExpireTransactions();
    }, 5 * 60 * 1000); // 5 minutes

    console.log(
      `[${new Date().toISOString()}] Transaction expiry worker started successfully (interval: 5 minutes)`
    );
  }

  /**
   * Stop the transaction expiry worker
   */
  public stop(): void {
    if (!this.isRunning) {
      console.log(
        `[${new Date().toISOString()}] Transaction expiry worker is not running`
      );
      return;
    }

    console.log(
      `[${new Date().toISOString()}] Stopping transaction expiry worker...`
    );
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log(
      `[${new Date().toISOString()}] Transaction expiry worker stopped successfully`
    );
  }

  /**
   * Check for and expire old transactions
   */
  private async checkAndExpireTransactions(): Promise<void> {
    try {
      console.log(
        `[${new Date().toISOString()}] Checking for expired transactions...`
      );

      const startTime = Date.now();
      const expiredCount =
        await TransactionExpiryWorker.transactionService.expireOldTransactions();
      const duration = Date.now() - startTime;

      if (expiredCount > 0) {
        console.log(
          `[${new Date().toISOString()}] Expired ${expiredCount} transactions in ${duration}ms`
        );
      } else {
        console.log(
          `[${new Date().toISOString()}] No transactions to expire (checked in ${duration}ms)`
        );
      }
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] Error in transaction expiry worker:`,
        error
      );

      // Don't stop the worker on error, just log and continue
      // The next interval will try again
    }
  }

  /**
   * Manually expire a specific transaction
   */
  public async expireTransaction(transactionId: string): Promise<boolean> {
    try {
      const transaction =
        await TransactionExpiryWorker.transactionService.getTransactionByTransactionId(
          transactionId
        );

      if (!transaction) {
        console.log(`Transaction ${transactionId} not found`);
        return false;
      }

      if (transaction.status === TransactionStatus.EXPIRED) {
        console.log(`Transaction ${transactionId} is already expired`);
        return true;
      }

      // Use the service's expireTransaction method
      const success =
        await TransactionExpiryWorker.transactionService.expireTransaction(
          transaction.id
        );

      if (success) {
        console.log(`Manually expired transaction ${transactionId}`);
        return true;
      } else {
        console.error(`Failed to expire transaction ${transactionId}`);
        return false;
      }
    } catch (error) {
      console.error(`Error expiring transaction ${transactionId}:`, error);
      return false;
    }
  }

  /**
   * Get status of the worker
   */
  public getStatus(): { isRunning: boolean; lastCheck?: Date } {
    return {
      isRunning: this.isRunning,
    };
  }

  /**
   * Get expired transactions without expiring them (for monitoring)
   */
  public async getExpiredTransactions() {
    try {
      return await TransactionExpiryWorker.transactionService.findExpiredTransactions();
    } catch (error) {
      console.error("Error fetching expired transactions:", error);
      return [];
    }
  }

  /**
   * Force run expiry check (useful for testing or manual triggers)
   */
  public async forceExpiry(): Promise<number> {
    try {
      console.log(
        `[${new Date().toISOString()}] Force running transaction expiry check...`
      );
      return await TransactionExpiryWorker.transactionService.expireOldTransactions();
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] Error in force expiry:`,
        error
      );
      return 0;
    }
  }

  /**
   * Health check for the worker and database connection
   */
  public async healthCheck(): Promise<{
    workerStatus: string;
    databaseConnected: boolean;
    lastError?: string;
  }> {
    try {
      // Test database connection by trying to fetch expired transactions
      await TransactionExpiryWorker.transactionService.findExpiredTransactions();

      return {
        workerStatus: this.isRunning ? "running" : "stopped",
        databaseConnected: true,
      };
    } catch (error) {
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
