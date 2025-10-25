import { BaseController } from "./base.controller.js";
import { Request, Response } from "express";
import { PostgresUserService } from "../services/user.service.js";
import { MonifyService } from "../services/monify-service.js";
import monifyAxios from "../services/monify-axios.service.js";
import crypto from "crypto";
import { PostgresTransactionService } from "../services/transaction.service.js";
import { Transaction } from "../db/schema.js";
import { TransactionStatus } from "../shared/types.js";
import { WalletTransferService } from "../services/wallet-transfer.service.js";

export class MonifyController extends BaseController {
  private userService: PostgresUserService;
  private transactionService: PostgresTransactionService;
  private monifyService: MonifyService;

  constructor() {
    super();
    this.userService = new PostgresUserService();
    this.transactionService = new PostgresTransactionService();
    this.monifyService = new MonifyService();
  }

  createReserveAccount = this.asyncHandler(
    async (req: Request, res: Response): Promise<Response | void> => {
      try {
        const { email } = req.body;

        if (!email) {
          return res
            .status(400)
            .json({ message: "Missing required fields: email" });
        }

        const result = await this.monifyService.createReserveAccount({ email });

        return res.status(200).json({
          success: true,
          data: result,
        });
      } catch (error: any) {
        console.error("Create reserve account error:", error);

        // Handle specific error cases
        if (error.message === "User not found") {
          return res.status(404).json({
            success: false,
            message: error.message,
          });
        }

        if (error.message === "Missing required field: email") {
          return res.status(400).json({
            success: false,
            message: error.message,
          });
        }

        return res.status(500).json({
          success: false,
          message: "Failed to create reserve account",
          error: error.message,
        });
      }
    }
  );

  getReserveAccount = this.asyncHandler(
    async (req: Request, res: Response): Promise<Response | void> => {
      try {
        const { email } = req.body;

        if (!email) {
          return res
            .status(400)
            .json({ message: "Missing required fields: email" });
        }

        const result = await this.monifyService.getReserveAccount({ email });

        return res.status(200).json({
          success: true,
          data: result,
        });
      } catch (error: any) {
        console.error("Get reserve account error:", error);

        // Handle specific error cases
        if (error.message === "User not found") {
          return res.status(404).json({
            success: false,
            message: error.message,
          });
        }

        if (error.message === "Missing required field: email") {
          return res.status(400).json({
            success: false,
            message: error.message,
          });
        }

        if (
          error.message === "User does not have a reserve account reference"
        ) {
          return res.status(400).json({
            success: false,
            message: error.message,
          });
        }

        return res.status(500).json({
          success: false,
          message: "Failed to get reserve account",
          error: error.message,
        });
      }
    }
  );

  confirmTransfer = this.asyncHandler(
    async (req: Request, res: Response): Promise<Response | void> => {
      try {
        const { reference, authorizationCode } = req.body;

        // Validate required fields
        if (!reference || !authorizationCode) {
          return res.status(400).json({
            success: false,
            message: "Missing required fields: reference, authorizationCode",
          });
        }

        // Prepare the transfer data
        const confirmationData = {
          reference,
          authorizationCode,
        };

        // Make POST request to the mock transfer API
        const response = await monifyAxios.post(
          "/api/v2/disbursements/single/validate-otp",
          confirmationData
        );

        return res.status(200).json({
          success: true,
          data: response.data,
        });
      } catch (error: any) {
        console.error("Transfer to reserve account error:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to transfer to reserve account",
          error: error.response?.data || error.message,
        });
      }
    }
  );

  // Webhook handler for payment notifications
  handlePaymentWebhook = this.asyncHandler(
    async (req: Request, res: Response): Promise<Response | void> => {
      try {
        const webhookData = req.body;

        // Extract payment information from webhook early for idempotency
        const { eventType, eventData } = webhookData;

        // Validate webhook structure
        if (!eventType || !eventData) {
          console.error(
            "Invalid webhook structure: missing eventType or eventData"
          );
          return res.status(400).json({ message: "Invalid webhook structure" });
        }

        // Optional: Verify signature from Monnify (for security)
        const signature = req.headers["monnify-signature"];
        if (signature && process.env.MONNIFY_SECRET_KEY) {
          const computedSignature = crypto
            .createHmac("sha512", process.env.MONNIFY_SECRET_KEY)
            .update(JSON.stringify(webhookData))
            .digest("hex");

          if (signature !== computedSignature) {
            console.error("Invalid signature");
            return res.status(400).send("Invalid signature");
          }
        }

        console.log(`📥 Processing webhook: ${eventType}`);

        // Handle different event types asynchronously (non-blocking)
        switch (eventType) {
          case "SUCCESSFUL_TRANSACTION":
            this.handleSuccessfulPayment(eventData).catch((error) => {
              console.error("❌ Error processing successful payment:", error);
            });
            break;
          case "FAILED_TRANSACTION":
            this.handleFailedPayment(eventData).catch((error) => {
              console.error("❌ Error processing failed payment:", error);
            });
            break;
          case "REVERSED_TRANSACTION":
            this.handleReversedPayment(eventData).catch((error) => {
              console.error("❌ Error processing reversed payment:", error);
            });
            break;
          default:
            console.log(`⚠️ Unhandled event type: ${eventType}`);
        }

        // Always respond with 200 OK to acknowledge receipt
        return res.status(200).json({
          success: true,
          message: "Webhook received and processed successfully",
        });
      } catch (error: any) {
        console.error("❌ Webhook processing error:", error);

        return res.status(200).json({
          success: false,
          message: "Webhook received but processing failed",
          error: error.message,
        });
      }
    }
  );

  // Handle successful payment
  private async handleSuccessfulPayment(eventData: any): Promise<void> {
    try {
      const { customer, amountPaid, transactionReference, paidOn } = eventData;

      console.log("✅ Processing successful payment...");

      // Find user by email or account reference
      let user = null;
      if (customer?.email) {
        user = await this.userService.findByEmail(customer.email);
      }

      if (user) {
        // Update user's account balance or transaction history
        console.log(`📅 Paid on: ${paidOn}`);

        // Find all pending transactions for this email and currency
        const pendingTransactions =
          await this.transactionService.getPendingTransactionsByChainAndEmail(
            "fiat",
            user.email
          );

        let matchedTransaction: Transaction | null = null;

        console.log(
          `[Fiat] Looking for amount: ${amountPaid} (type: ${typeof amountPaid})`
        );
        console.log(
          `[Fiat] Found ${pendingTransactions.length} pending transactions`
        );

        for (const transaction of pendingTransactions) {
          const transactionAmount = parseFloat(transaction.sourceAmount);
          const paidAmount = parseFloat(amountPaid);

          console.log(
            `[Fiat] Comparing transaction ${transaction.transactionId}: ${transactionAmount} vs ${paidAmount}`
          );

          if (Math.abs(transactionAmount - paidAmount) < 0.01) {
            matchedTransaction = transaction;
            console.log(
              `[Fiat] Matched transaction ${transaction.transactionId} with amount ${transaction.sourceAmount} NGN`
            );
            break;
          }
        }

        console.log(
          `[Fiat] matchedTransaction after loop:`,
          matchedTransaction
            ? `Found: ${matchedTransaction.transactionId}`
            : "null"
        );

        if (!matchedTransaction) {
          console.log(`[Fiat] No exact amount match`);
          return;
        }

        console.log(
          `[Fiat] 🔍 Checking transaction status: ${matchedTransaction.status}`
        );
        console.log(`[Fiat] 🔍 Expected status: ${TransactionStatus.PENDING}`);
        console.log(
          `[Fiat] 🔍 Status comparison: ${
            matchedTransaction.status === TransactionStatus.PENDING
          }`
        );

        // Check if transaction is already processed or being processed
        if (matchedTransaction.status !== TransactionStatus.PENDING) {
          console.log(
            `[Fiat] ❌ Transaction ${matchedTransaction.transactionId} already processed with status: ${matchedTransaction.status}`
          );
          return;
        }

        console.log(
          `[Fiat] ✅ Transaction status is PENDING, proceeding with update...`
        );

        // Update the matched transaction status with atomic operation
        try {
          await this.transactionService.updateFiatStatusTransactionHash(
            matchedTransaction.id,
            TransactionStatus.FIAT_CONFIRMED,
            transactionReference
          );
        } catch (error) {
          console.error(`[Fiat] ❌ Error updating transaction status:`, error);
          return;
        }

        let destinationTransfer: {
          success: boolean;
          txHash?: string;
          transferFee?: string;
          error?: string;
        };

        // Validate all required destination fields exist
        if (
          !matchedTransaction.destinationAddress ||
          !matchedTransaction.destinationChain ||
          !matchedTransaction.destinationCurrency ||
          !matchedTransaction.destinationAmount
        ) {
          console.log(`[Fiat] ❌ Missing required destination fields`);
          destinationTransfer = {
            success: false,
            error:
              "Missing required destination fields (address, chain, currency, or amount)",
          };
        } else {
          try {
            destinationTransfer =
              await WalletTransferService.sendTokenToAddress({
                chainName: matchedTransaction.destinationChain,
                tokenSymbol: matchedTransaction.destinationCurrency,
                destinationAddress: matchedTransaction.destinationAddress,
                amount: matchedTransaction.destinationAmount,
              });
            console.log(
              `[Fiat] 📊 Token transfer result:`,
              destinationTransfer
            );
          } catch (error) {
            console.error(`[Fiat] ❌ Error during token transfer:`, error);
            destinationTransfer = {
              success: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }

        if (!destinationTransfer.success) {
          // Update transaction status
          await this.transactionService.updateTransactionFields(
            matchedTransaction.id,
            {
              status: TransactionStatus.FAILED,
              adminNotes: `${matchedTransaction.destinationChain} transfer failed: ${destinationTransfer.error}`,
            }
          );
          return;
        }

        // Update transaction status to completed
        await this.transactionService.updateTransactionFields(
          matchedTransaction.id,
          {
            status: TransactionStatus.COMPLETED,
            destinationTransactionHash: destinationTransfer.txHash,
            completedAt: new Date(),
            adminNotes:
              "Transaction completed successfully - funds transferred to address",
          }
        );
      } else {
        console.log(
          `⚠️ User not found for payment notification. 📧 Customer email: ${customer?.email}`
        );
        return;
      }
    } catch (error) {
      console.error("Error handling successful payment:", error);
      throw error;
    }
  }

  // Handle failed payment
  private async handleFailedPayment(eventData: any): Promise<void> {
    try {
      const {
        customer,
        transactionReference,
        paymentReference,
        amountPaid,
        currency,
        paymentStatus,
      } = eventData;

      console.log("❌ Processing failed payment...");
      console.log(`💰 Failed amount: ${amountPaid} ${currency}`);
      console.log(`📋 Transaction Reference: ${transactionReference}`);
      console.log(`📋 Payment Reference: ${paymentReference}`);
      console.log(`👤 Customer: ${customer?.name} (${customer?.email})`);
      console.log(`� Statuds: ${paymentStatus}`);

      // TODO: Implement failed payment logic:
      // - Log the failure
      // - Notify user if needed
      // - Update transaction status
    } catch (error) {
      console.error("Error handling failed payment:", error);
      throw error;
    }
  }

  // Handle reversed payment
  private async handleReversedPayment(eventData: any): Promise<void> {
    try {
      const {
        customer,
        amountPaid,
        transactionReference,
        paymentReference,
        currency,
        settlementAmount,
        paidOn,
        paymentDescription,
      } = eventData;

      console.log("🔄 Processing reversed payment...");
      console.log(`💰 Reversed amount: ${amountPaid} ${currency}`);
      console.log(`💵 Settlement amount: ${settlementAmount}`);
      console.log(`📋 Transaction Reference: ${transactionReference}`);
      console.log(`� Payment Re ference: ${paymentReference}`);
      console.log(`� Customeer: ${customer?.name} (${customer?.email})`);
      console.log(`� Originaelly paid on: ${paidOn}`);

      // TODO: Implement reversal logic:
      // - Reverse user balance if applicable
      // - Update transaction status
      // - Notify user of reversal
    } catch (error) {
      console.error("Error handling reversed payment:", error);
      throw error;
    }
  }
}
