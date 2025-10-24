import { Request, Response } from "express";
import { BaseController } from "./base.controller.js";
import { TransactionConfirmationService } from "../services/transaction-confirmation.service.js";

export class TransactionConfirmationController extends BaseController {
  private confirmationService: TransactionConfirmationService;

  constructor() {
    super();
    this.confirmationService = new TransactionConfirmationService();
  }

  onConfirmedEvmTx = this.asyncHandler(
    async (req: Request, res: Response): Promise<Response | void> => {
      const { transactionId, address } = req.body;

      // Validate required fields
      const validationError = this.validateRequiredFields(req.body, [
        "transactionId",
      ]);
      if (validationError) {
        return this.sendError(res, validationError);
      }

      // Use the service to process the transaction
      const result =
        await this.confirmationService.processConfirmedEvmTransaction(
          transactionId
        );

      if (!result.success) {
        return this.sendError(res, result.error!, 500);
      }

      return this.sendSuccess(
        res,
        result.data!,
        "Transaction confirmed and processed successfully"
      );
    }
  );
}

// Export controller instance methods for backward compatibility
const transactionConfirmationController =
  new TransactionConfirmationController();
export const { onConfirmedEvmTx } = transactionConfirmationController;
