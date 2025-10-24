import { PostgresTransactionService } from "./transaction.service.js";
import { WalletTransferService } from "./wallet-transfer.service.js";
import { getDatabase } from "../db/connection.js";
import {
  transferQueue,
  NewTransferQueue,
  TransferQueue,
} from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { TransactionStatus } from "../shared/types.js";

export type QueuedTransferType = "SWEEP_ETH" | "SWEEP_ERC20";
export type QueuedTransferStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export class SweeperQueueService {
  private static transactionService: PostgresTransactionService;

  private static getTransactionService(): PostgresTransactionService {
    if (!this.transactionService) {
      this.transactionService = new PostgresTransactionService();
    }
    return this.transactionService;
  }

  /**
   * Add a transfer to the queue instead of executing immediately
   */
  static async queueTransfer({
    transactionId,
    userId,
    fromAddress,
    amount,
    sourceChain,
    sourceCurrency,
  }: {
    transactionId: string;
    userId: number;
    fromAddress: string;
    amount: string;
    sourceChain: string;
    sourceCurrency: string;
  }): Promise<{ success: boolean; queueId?: number; error?: string }> {
    try {
      const db = getDatabase();
      const newTransfer: NewTransferQueue = {
        transactionId,
        userId,
        fromAddress,
        amount: amount,
        sourceChain,
        sourceCurrency,
        status: "PENDING",
        retryCount: 0,
        maxRetries: 3,
      };

      // Insert into database
      const [insertedTransfer] = await db
        .insert(transferQueue)
        .values(newTransfer)
        .returning();

      console.log(
        `[QUEUE] Transfer queued for transaction ${transactionId} with ID ${insertedTransfer.id}`
      );

      // Process immediately in background (don't await)
      this.processQueuedTransferById(insertedTransfer.id).catch((error) => {
        console.error(
          `[QUEUE] Background processing failed for ${transactionId}:`,
          error
        );
      });

      return { success: true, queueId: insertedTransfer.id };
    } catch (error) {
      console.error(
        `[QUEUE] Failed to queue transfer for ${transactionId}:`,
        error
      );
      return { success: false, error: `Failed to queue transfer: ${error}` };
    }
  }

  /**
   * Process a queued transfer by ID (runs in background)
   */
  private static async processQueuedTransferById(
    queueId: number
  ): Promise<void> {
    try {
      const db = getDatabase();
      // Get the transfer from database
      const [queuedTransfer] = await db
        .select()
        .from(transferQueue)
        .where(eq(transferQueue.id, queueId));

      if (!queuedTransfer) {
        console.error(`[QUEUE] Transfer with ID ${queueId} not found`);
        return;
      }

      console.log(
        `[QUEUE] Processing transfer for transaction ${queuedTransfer.transactionId}`
      );

      // Update status to processing
      await db
        .update(transferQueue)
        .set({
          status: "PROCESSING",
          lastAttemptAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(transferQueue.id, queueId));

      let transferResult: {
        success: boolean;
        txHash?: string;
        transferFee?: string;
        error?: string;
      };

      if (!queuedTransfer.sourceChain || !queuedTransfer.sourceCurrency) {
        throw new Error(
          "Missing required fields: sourceChain or sourceCurrency"
        );
      }

      transferResult = await WalletTransferService.triggerSweep({
        userId: queuedTransfer.userId.toString(),
        chainName: queuedTransfer.sourceChain,
        tokenSymbol: queuedTransfer.sourceCurrency,
        sourceAddress: queuedTransfer.fromAddress,
      });

      if (transferResult.success) {
        // Transfer succeeded - update queue record
        await db
          .update(transferQueue)
          .set({
            status: "COMPLETED",
            completedAt: new Date(),
            txHash: transferResult.txHash,
            transferFee: transferResult.transferFee,
            updatedAt: new Date(),
          })
          .where(eq(transferQueue.id, queueId));

        // Update the original transaction with transfer details
        await this.getTransactionService().updateTransactionFieldsByTransactionId(
          queuedTransfer.transactionId,
          {
            sourceTransactionHash: transferResult.txHash,
            sourceFee: transferResult.transferFee,
            internalTransferStatus: TransactionStatus.INTERNAL_SUPPLY_COMPLETED,
            sweepAdminNotes:
              "Background transfer to vault completed successfully",
          }
        );

        console.log(
          `[QUEUE] Transfer completed for transaction ${queuedTransfer.transactionId}`
        );
      } else {
        // Transfer failed, handle retry logic
        await this.handleTransferFailureById(queueId, transferResult.error!);
      }
    } catch (error) {
      await this.handleTransferFailureById(
        queueId,
        `Processing error: ${error}`
      );
    }
  }

  /**
   * Handle transfer failure with retry logic
   */
  private static async handleTransferFailureById(
    queueId: number,
    error: string
  ): Promise<void> {
    try {
      const db = getDatabase();
      // Get current transfer state
      const [queuedTransfer] = await db
        .select()
        .from(transferQueue)
        .where(eq(transferQueue.id, queueId));

      if (!queuedTransfer) {
        console.error(
          `[QUEUE] Transfer with ID ${queueId} not found for failure handling`
        );
        return;
      }

      const newRetryCount = queuedTransfer.retryCount + 1;

      if (newRetryCount < queuedTransfer.maxRetries) {
        // Update for retry
        await db
          .update(transferQueue)
          .set({
            status: "PENDING",
            retryCount: newRetryCount,
            errorMessage: error,
            updatedAt: new Date(),
          })
          .where(eq(transferQueue.id, queueId));

        const retryDelay = Math.pow(2, newRetryCount) * 1000; // Exponential backoff

        console.log(
          `[QUEUE] Scheduling retry ${newRetryCount}/${queuedTransfer.maxRetries} for transaction ${queuedTransfer.transactionId} in ${retryDelay}ms`
        );

        setTimeout(() => {
          this.processQueuedTransferById(queueId).catch((retryError) => {
            console.error(
              `[QUEUE] Retry failed for ${queuedTransfer.transactionId}:`,
              retryError
            );
          });
        }, retryDelay);
      } else {
        // Max retries reached, mark as failed
        await db
          .update(transferQueue)
          .set({
            status: "FAILED",
            errorMessage: error,
            updatedAt: new Date(),
          })
          .where(eq(transferQueue.id, queueId));

        await this.getTransactionService().updateTransactionFieldsByTransactionId(
          queuedTransfer.transactionId,
          {
            internalTransferStatus: TransactionStatus.INTERNAL_SUPPLY_FAILED,
            sweepAdminNotes: `Background transfer failed after ${queuedTransfer.maxRetries} attempts: ${error}. Manual intervention required.`,
          }
        );

        console.error(
          `[QUEUE] Transfer permanently failed for transaction ${queuedTransfer.transactionId} after ${queuedTransfer.maxRetries} attempts`
        );
      }
    } catch (dbError) {
      console.error(
        `[QUEUE] Database error while handling transfer failure:`,
        dbError
      );
    }
  }

  /**
   * Get queue status for a transaction
   */
  static async getQueueStatus(
    transactionId: string
  ): Promise<TransferQueue | null> {
    try {
      const db = getDatabase();

      const [queuedTransfer] = await db
        .select()
        .from(transferQueue)
        .where(eq(transferQueue.transactionId, transactionId))
        .orderBy(sql`${transferQueue.createdAt} DESC`)
        .limit(1);

      return queuedTransfer || null;
    } catch (error) {
      console.error(
        `[QUEUE] Error getting queue status for ${transactionId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Get all transfers (for admin monitoring)
   */
  static async getAllTransfers(): Promise<TransferQueue[]> {
    try {
      const db = getDatabase();

      return await db
        .select()
        .from(transferQueue)
        .orderBy(sql`${transferQueue.createdAt} DESC`);
    } catch (error) {
      console.error(`[QUEUE] Error getting all transfers:`, error);
      return [];
    }
  }

  /**
   * Get all pending transfers (for admin monitoring)
   */
  static async getPendingTransfers(): Promise<TransferQueue[]> {
    try {
      const db = getDatabase();

      return await db
        .select()
        .from(transferQueue)
        .where(eq(transferQueue.status, "PENDING"))
        .orderBy(transferQueue.createdAt);
    } catch (error) {
      console.error(`[QUEUE] Error getting pending transfers:`, error);
      return [];
    }
  }

  /**
   * Get failed transfers (for admin intervention)
   */
  static async getFailedTransfers(): Promise<TransferQueue[]> {
    try {
      const db = getDatabase();

      return await db
        .select()
        .from(transferQueue)
        .where(eq(transferQueue.status, "FAILED"))
        .orderBy(sql`${transferQueue.updatedAt} DESC`);
    } catch (error) {
      console.error(`[QUEUE] Error getting failed transfers:`, error);
      return [];
    }
  }

  /**
   * Retry a failed transfer manually
   */
  static async retryTransfer(
    queueId: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const db = getDatabase();

      const [queuedTransfer] = await db
        .select()
        .from(transferQueue)
        .where(eq(transferQueue.id, queueId));

      if (!queuedTransfer) {
        return { success: false, error: "Transfer not found" };
      }

      if (queuedTransfer.status !== "FAILED") {
        return { success: false, error: "Transfer is not in failed state" };
      }

      // Reset for retry
      await db
        .update(transferQueue)
        .set({
          status: "PENDING",
          retryCount: 0,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(transferQueue.id, queueId));

      // Process in background
      this.processQueuedTransferById(queueId).catch((error) => {
        console.error(
          `[QUEUE] Manual retry failed for queue ID ${queueId}:`,
          error
        );
      });

      return { success: true };
    } catch (error) {
      console.error(`[QUEUE] Error retrying transfer ${queueId}:`, error);
      return { success: false, error: `Retry failed: ${error}` };
    }
  }
}
