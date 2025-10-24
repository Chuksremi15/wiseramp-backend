import { PostgresTransactionService } from "./transaction.service.js";
import { Chain, TransactionStatus } from "../shared/types.js";
import { WalletTransferService } from "./wallet-transfer.service.js";
import { Transaction } from "../db/schema.js";
import { TokenConfigUtils } from "../utils/token-config.js";
import { SweeperQueueService } from "./sweeper-queue.service.js";

export class TransactionConfirmationService {
  private transactionService: PostgresTransactionService;

  constructor() {
    this.transactionService = new PostgresTransactionService();
  }

  /**
   * Validates transaction for confirmation processing
   */
  private async validateTransactionForConfirmation(
    transactionId: string
  ): Promise<{ success: boolean; transaction?: Transaction; error?: string }> {
    const transaction =
      await this.transactionService.getTransactionByTransactionId(
        transactionId
      );

    if (!transaction) {
      return { success: false, error: "Transaction not found" };
    }

    // Add additional validation logic here as needed
    // For example, check if transaction is in correct status for confirmation

    return { success: true, transaction };
  }

  /**
   * Handles balance verification failure by updating transaction status and sending error response
   */
  private async handleBalanceVerificationFailure(
    transaction: any,
    currency: string,
    error: string
  ): Promise<{ success: boolean; error?: string }> {
    console.log(
      `[CONFIRMATION] ${currency} balance verification failed for ${transaction.sourceAddress}: ${error}`
    );

    // Update transaction status to indicate balance verification failed
    const response = await this.transactionService.updateTransactionFields(
      transaction.id,
      {
        cryptoStatus: TransactionStatus.BALANCE_VERIFICATION_FAILED,
        status: TransactionStatus.FAILED,
        adminNotes: `${currency} balance verification failed: ${error}`,
      }
    );

    return { success: response, error: "Transaction not found" };
  }

  /**
   * Handles transfer failure by updating transaction status
   */
  private async handleTransferFailure(
    transaction: any,
    transferType: string,
    cryptoStatus: TransactionStatus,
    error: string
  ): Promise<{ success: false; error: string }> {
    console.log(`[CONFIRMATION] ${transferType} failed: ${error}`);

    // Update transaction status
    await this.transactionService.updateTransactionFields(transaction.id, {
      cryptoStatus: cryptoStatus,
      status: TransactionStatus.FAILED,
      adminNotes: `${transferType} failed: ${error}`,
    });

    return { success: false, error: `${transferType} failed: ${error}` };
  }

  /**
   * Process confirmed EVM transaction
   */
  async processConfirmedEvmTransaction(transactionId: string): Promise<{
    success: boolean;
    data?: {
      transactionId: string;
      destinationTransactionHash?: string;
      balance?: string;
    };
    error?: string;
  }> {
    try {
      // Validate required fields
      if (!transactionId) {
        return { success: false, error: "Transaction ID is required" };
      }

      console.log(
        `[CONFIRMATION] Processing confirmed transaction: ${transactionId}`
      );

      // 1. Verify the transaction exists and is in correct status
      const {
        success: validatationSuccess,
        error: validationError,
        transaction,
      } = await this.validateTransactionForConfirmation(transactionId);
      if (!validatationSuccess || !transaction) {
        return { success: false, error: validationError };
      }

      const tokenInfo = TokenConfigUtils.getTokenInfo(
        transaction.sourceChain!,
        transaction.sourceCurrency
      );

      //2. Check if the address actually has the expected balance
      //Note: WalletTransferService needs to be imported
      const balanceCheck = await WalletTransferService.verifyTokenBalance(
        transaction.sourceAddress!,
        Number(transaction.sourceAmount),
        transaction.sourceCurrency,
        tokenInfo?.address
      );

      if (!balanceCheck.success) {
        await this.handleBalanceVerificationFailure(
          transaction,
          transaction.sourceCurrency as string,
          balanceCheck.error!
        );
        return { success: false, error: balanceCheck.error };
      }

      console.log(
        `[CONFIRMATION] Balance verified: ${transaction.sourceAddress} has ${balanceCheck.balance} ${transaction.sourceCurrency}`
      );

      // Validate required fields before queuing
      if (
        !transaction.sourceAddress ||
        !transaction.sourceChain ||
        !transaction.sourceCurrency
      ) {
        return {
          success: false,
          error:
            "Missing required fields: sourceAddress, sourceChain, or sourceCurrency",
        };
      }

      // Note: SweeperQueueService needs to be imported
      const queueResult = await SweeperQueueService.queueTransfer({
        transactionId: transaction.transactionId,
        userId: transaction.userId,
        fromAddress: transaction.sourceAddress,
        amount: transaction.sourceAmount,
        sourceChain: transaction.sourceChain,
        sourceCurrency: transaction.sourceCurrency,
      });

      if (!queueResult.success) {
        console.error(
          `[CONFIRMATION] ${transaction.sourceCurrency.toUpperCase()} Failed to queue transfer: ${
            queueResult.error
          }`
        );
      } else {
        console.log(
          `[CONFIRMATION] ${transaction.sourceCurrency.toUpperCase()} transfer queued for background processing, proceeding to destination transfer`
        );
      }

      if (
        !transaction.destinationAddress &&
        transaction.destinationChain !== Chain.FIAT
      ) {
        return { success: false, error: "Destination address is missing" };
      }

      let destinationTransfer: {
        success: boolean;
        txHash?: string;
        transferFee?: string;
        error?: string;
      };

      switch (transaction.destinationChain) {
        // case Chain.FIAT: {
        //   if (
        //     !transaction.destinationBankAccountNumber ||
        //     !transaction.destinationBankCode
        //   ) {
        //     destinationTransfer = {
        //       success: false,
        //       error:
        //         "Destination account name or bank code is missing for fiat transfer",
        //     };
        //     break;
        //   }

        //   destinationTransfer = await monifyController.executeVaultTransfer({
        //     amount: parseFloat(transaction.destinationAmount),
        //     accountNumber: transaction.destinationBankAccountNumber,
        //     bankCode: transaction.destinationBankCode,
        //     narration: "Custom transfer description",
        //     customReference: generateMonifyReference(),
        //   });
        //   break;
        // }

        default: {
          destinationTransfer = {
            success: false,
            error: "Destination chain does not exist",
          };
        }
      }

      if (!destinationTransfer.success) {
        return await this.handleTransferFailure(
          transaction,
          `${transaction.destinationChain} transfer`,
          TransactionStatus.TOKEN_FROM_VAULT_TRANSFER_FAILED,
          destinationTransfer.error!
        );
      }

      // 4. Update transaction status to completed
      await this.transactionService.updateTransactionFields(transaction.id, {
        cryptoStatus: TransactionStatus.COMPLETED,
        status: TransactionStatus.COMPLETED,
        destinationTransactionHash: destinationTransfer.txHash,
        completedAt: new Date(),
        adminNotes: `Transaction completed successfully - ${transaction.sourceCurrency} transferred to ${transaction.destinationCurrency}`,
      });

      console.log(
        `[CONFIRMATION] Transaction ${transactionId} completed successfully`
      );

      return {
        success: true,
        data: {
          transactionId,
          destinationTransactionHash: destinationTransfer.txHash,
          // balance: balanceCheck.balance, // Uncomment when balance check is implemented
        },
      };
    } catch (error) {
      console.error("[CONFIRMATION] Error processing confirmation:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      };
    }
  }
}
