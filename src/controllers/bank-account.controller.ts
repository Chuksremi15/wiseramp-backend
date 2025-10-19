import { Request, Response } from "express";
import { BankAccountService } from "../services/bank-account.service.js";
import { BaseController } from "./base.controller.js";

export class BankAccountController extends BaseController {
  private bankAccountService: BankAccountService;

  constructor() {
    super();
    this.bankAccountService = new BankAccountService();
  }
  /**
   * Create a new bank account
   */
  createBankAccount = this.asyncHandler(
    async (req: Request, res: Response): Promise<Response | void> => {
      if (!req.user) {
        return this.sendError(res, "User not authenticated", 401);
      }

      const { id: userId } = req.user;
      const { accountName, bankName, accountNumber, bankCode } = req.body;

      // Validation
      const validationError = this.validateRequiredFields(req.body, [
        "accountName",
        "bankName",
        "accountNumber",
        "bankCode",
      ]);
      if (validationError) {
        return this.sendError(res, validationError);
      }

      // Validate account number is numeric (preserve leading zeros)
      if (!/^\d+$/.test(accountNumber) || accountNumber.length === 0) {
        return this.sendError(res, "Account number must contain only digits");
      }

      try {
        const bankAccount = await BankAccountService.createBankAccount({
          userId,
          accountName: accountName.trim(),
          bankName: bankName.trim(),
          accountNumber: accountNumber.trim(),
          bankCode: bankCode.trim(),
        });

        return this.sendSuccess(
          res,
          { data: bankAccount },
          "Bank account created successfully",
          201
        );
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes("already exists")) {
            return this.sendError(res, error.message, 409);
          }
          if (error.message.includes("not found")) {
            return this.sendError(res, error.message, 404);
          }
        }
        throw error; // Let asyncHandler catch it
      }
    }
  );

  /**
   * Get all bank accounts for the authenticated user
   */
  getUserBankAccounts = this.asyncHandler(
    async (req: Request, res: Response): Promise<Response | void> => {
      if (!req.user) {
        return this.sendError(res, "User not authenticated", 401);
      }

      const { id: userId } = req.user;
      const bankAccounts = await BankAccountService.getUserBankAccounts(userId);

      return this.sendSuccess(res, {
        data: bankAccounts,
        total: bankAccounts.length,
      });
    }
  );

  /**
   * Get a specific bank account by ID
   */
  getBankAccountById = this.asyncHandler(
    async (req: Request, res: Response): Promise<Response | void> => {
      if (!req.user) {
        return this.sendError(res, "User not authenticated", 401);
      }

      const { id: userId } = req.user;
      const { accountId } = req.params;

      if (!accountId) {
        return this.sendError(res, "Account ID is required");
      }

      const bankAccount = await BankAccountService.getBankAccountById(
        accountId,
        userId
      );

      if (!bankAccount) {
        return this.sendError(res, "Bank account not found", 404);
      }

      return this.sendSuccess(res, { data: bankAccount });
    }
  );
  /**
   * Update a bank account
   */
  updateBankAccount = this.asyncHandler(
    async (req: Request, res: Response): Promise<Response | void> => {
      if (!req.user) {
        return this.sendError(res, "User not authenticated", 401);
      }

      const { id: userId } = req.user;
      const { accountId } = req.params;
      const { accountName, bankName, accountNumber, bankCode } = req.body;

      if (!accountId) {
        return this.sendError(res, "Account ID is required");
      }

      // Prepare updates object
      const updates: any = {};
      if (accountName !== undefined) updates.accountName = accountName.trim();
      if (bankName !== undefined) updates.bankName = bankName.trim();
      if (accountNumber !== undefined) {
        if (!/^\d+$/.test(accountNumber) || accountNumber.length === 0) {
          return this.sendError(res, "Account number must contain only digits");
        }
        updates.accountNumber = accountNumber.trim();
      }
      if (bankCode !== undefined) updates.bankCode = bankCode.trim();

      // Check if there are any updates
      if (Object.keys(updates).length === 0) {
        return this.sendError(res, "No valid fields to update");
      }

      try {
        const updatedAccount = await BankAccountService.updateBankAccount(
          accountId,
          userId,
          updates
        );

        if (!updatedAccount) {
          return this.sendError(
            res,
            "Bank account not found or access denied",
            404
          );
        }

        return this.sendSuccess(
          res,
          { data: updatedAccount },
          "Bank account updated successfully"
        );
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes("already exists")) {
            return this.sendError(res, error.message, 409);
          }
          if (
            error.message.includes("not found") ||
            error.message.includes("access denied")
          ) {
            return this.sendError(res, error.message, 404);
          }
        }
        throw error; // Let asyncHandler catch it
      }
    }
  );

  /**
   * Delete a bank account
   */
  deleteBankAccount = this.asyncHandler(
    async (req: Request, res: Response): Promise<Response | void> => {
      if (!req.user) {
        return this.sendError(res, "User not authenticated", 401);
      }

      const { id: userId } = req.user;
      const { accountId } = req.params;

      if (!accountId) {
        return this.sendError(res, "Account ID is required");
      }

      const deleted = await BankAccountService.deleteBankAccount(
        accountId,
        userId
      );

      if (!deleted) {
        return this.sendError(
          res,
          "Bank account not found or access denied",
          404
        );
      }

      return this.sendSuccess(res, {}, "Bank account deleted successfully");
    }
  );

  /**
   * Get bank account by account number (for internal use)
   */
  getBankAccountByNumber = this.asyncHandler(
    async (req: Request, res: Response): Promise<Response | void> => {
      if (!req.user) {
        return this.sendError(res, "User not authenticated", 401);
      }

      const { id: userId } = req.user;
      const { accountNumber } = req.params;

      if (!accountNumber) {
        return this.sendError(res, "Account number is required");
      }

      if (!/^\d+$/.test(accountNumber)) {
        return this.sendError(res, "Invalid account number format");
      }

      const bankAccount = await BankAccountService.getBankAccountByNumber(
        accountNumber,
        userId
      );

      if (!bankAccount) {
        return this.sendError(res, "Bank account not found", 404);
      }

      return this.sendSuccess(res, { data: bankAccount });
    }
  );

  /**
   * Check if user has bank accounts
   */
  checkUserHasBankAccounts = this.asyncHandler(
    async (req: Request, res: Response): Promise<Response | void> => {
      if (!req.user) {
        return this.sendError(res, "User not authenticated", 401);
      }

      const { id: userId } = req.user;
      const hasBankAccounts = await BankAccountService.userHasBankAccounts(
        userId
      );
      const accountCount = await BankAccountService.getUserBankAccountCount(
        userId
      );

      return this.sendSuccess(res, {
        data: {
          hasBankAccounts,
          accountCount,
        },
      });
    }
  );
}

// Export controller instance methods for backward compatibility
const bankAccountController = new BankAccountController();
export const {
  createBankAccount,
  getUserBankAccounts,
  getBankAccountById,
  updateBankAccount,
  deleteBankAccount,
  getBankAccountByNumber,
  checkUserHasBankAccounts,
} = bankAccountController;
