import { Request, Response } from "express";
import { PostgresTransactionService } from "../services/transaction.service.js";
import { TransactionStatus } from "../shared/types.js";
import { getTokenEquivalent, PRICE_FEEDS } from "../utils/price-feed.js";
import { PostgresUserService } from "../services/user.service.js";
// import { BankAccountService } from "../services/bank-account.service.js";
import Decimal from "decimal.js";
import { HDNodeWallet, Mnemonic } from "ethers";
import { normalizeAddress } from "../utils/address.js";
import { AddressWatcherService } from "../services/address-watcher.service.js";
import { BaseController } from "./base.controller.js";
import { BankAccountService } from "../services/bank-account.service.js";

export class TransactionController extends BaseController {
  private transactionService: PostgresTransactionService;
  private userService: PostgresUserService;
  private watchService: AddressWatcherService;

  constructor() {
    super();
    this.transactionService = new PostgresTransactionService();
    this.userService = new PostgresUserService();
    this.watchService = new AddressWatcherService();
  }

  // Validate and parse amount, handling comma separators
  private validateAndParseAmount(amount: string): number {
    // Remove commas and whitespace
    const cleanAmount = amount.replace(/,/g, "").trim();
    const numericAmount = parseFloat(cleanAmount);

    if (isNaN(numericAmount) || numericAmount <= 0) {
      throw new Error("Invalid amount. Must be a positive number.");
    }

    return numericAmount;
  }

  /**
   * Generates an Ethereum address from the mnemonic in the environment variable.
   * @returns {Promise<string>} The generated Ethereum address.
   */
  private async generateEthereumAddressFromMnemonic(
    userID: number
  ): Promise<string> {
    const mnemonic = process.env.MNEMONIC!;
    const ethMnemonic = Mnemonic.fromPhrase(mnemonic);
    // BIP44 path for ETH: m/44'/60'/0'/0/{userID}
    const path = `m/44'/60'/0'/0/${userID}`;
    const ethWallet = HDNodeWallet.fromMnemonic(ethMnemonic, path);
    return ethWallet.address;
  }

  // Create a fiat-to-crypto transaction
  createFiatToCryptoTransaction = this.asyncHandler(
    async (req: Request, res: Response): Promise<Response | void> => {
      if (!req.user) {
        return this.sendError(res, "User not authenticated", 401);
      }
      const { id } = req.user;

      const user = await this.userService.findByUserId(id);

      if (!user) {
        return this.sendError(res, "User not found", 404);
      }

      const {
        sourceAmount,
        sourceCurrency,
        sourceChain,
        destinationCurrency,
        destinationAddress,
        destinationChain,
      } = req.body;

      // Validation
      const validationError = this.validateRequiredFields(req.body, [
        "sourceAmount",
        "sourceCurrency",
        "destinationCurrency",
        "destinationAddress",
        "destinationChain",
        "sourceChain",
      ]);
      if (validationError) {
        return this.sendError(res, validationError);
      }

      if (sourceCurrency !== "NGN") {
        return this.sendError(
          res,
          "Source currency must be NGN for fiat-to-crypto transactions"
        );
      }

      // Check if user has accounts configured
      if (!user.reserveAccounts || user.reserveAccounts.length === 0) {
        return this.sendError(
          res,
          "User has no bank accounts configured. Please set up a reserve account first."
        );
      }

      const { accountNumber, bankName, accountName } = user.reserveAccounts[0];

      // Validate sourceAmount is a valid number
      let numericSourceAmount: number;
      try {
        numericSourceAmount = this.validateAndParseAmount(sourceAmount);
      } catch (error) {
        return this.sendError(
          res,
          error instanceof Error
            ? error.message
            : "Invalid source amount. Must be a positive number."
        );
      }

      const { destinationEquivalent, exchangeRate } = await getTokenEquivalent(
        destinationCurrency,
        sourceCurrency,
        numericSourceAmount
      );
      const feeAmount = new Decimal(numericSourceAmount).mul(0.006).toNumber();
      const netAmount = new Decimal(numericSourceAmount)
        .sub(feeAmount)
        .toNumber();

      const transactionId =
        await this.transactionService.createFiatToCryptoTransaction({
          userId: id,
          userEmail: user.email,
          userName: user.name,
          sourceAmount: numericSourceAmount.toString(),
          sourceCurrency: sourceCurrency,
          sourceChain: sourceChain,
          sourceBankAccountNumber: accountNumber,
          sourceBankName: bankName,
          sourceBankAccountName: accountName,
          destinationChain: destinationChain,
          destinationAmount: destinationEquivalent.toString(),
          destinationCurrency: destinationCurrency,
          destinationAddress: normalizeAddress(
            destinationAddress,
            destinationChain
          ),
          exchangeRate: exchangeRate.toString(),
          feeAmount: feeAmount.toString(),
          netAmount: netAmount.toString(),
        });

      const transaction = await this.transactionService.getTransactionById(
        transactionId
      );

      return this.sendSuccess(
        res,
        { transaction },
        "Fiat-to-crypto transaction created successfully",
        201
      );
    }
  );

  // Create a crypto-to-fiat transaction
  createCryptoToFiatTransaction = this.asyncHandler(
    async (req: Request, res: Response): Promise<Response | void> => {
      if (!req.user) {
        return this.sendError(res, "User not authenticated", 401);
      }
      const { id: userId } = req.user;
      const {
        sourceAmount,
        sourceCurrency,
        sourceChain,
        destinationCurrency,
        destinationChain,
        bankAccountId,
      } = req.body;

      // Validation
      const validationError = this.validateRequiredFields(req.body, [
        "sourceAmount",
        "sourceCurrency",
        "sourceChain",
        "destinationCurrency",
        "destinationChain",
        "bankAccountId",
      ]);
      if (validationError) {
        return this.sendError(res, validationError);
      }

      const bankAccount = await BankAccountService.getBankAccountById(
        bankAccountId,
        userId
      );

      if (!bankAccount) {
        return this.sendError(res, "Bank account not found", 404);
      }

      // Generate address for receiving crypto
      let sourceAddress: string;
      switch (sourceChain) {
        case "ethereum":
        case "bsc":
        case "polygon":
        case "arbitrum":
        case "optimism":
        case "avalanche":
        case "base":
          sourceAddress = await this.generateEthereumAddressFromMnemonic(
            userId
          );
          break;

        default:
          return this.sendError(res, "Unsupported source chain");
      }

      // Validate sourceAmount is a valid number
      let numericSourceAmount: number;
      try {
        numericSourceAmount = this.validateAndParseAmount(sourceAmount);
      } catch (error) {
        return this.sendError(
          res,
          error instanceof Error
            ? error.message
            : "Invalid source amount. Must be a positive number."
        );
      }

      const { destinationEquivalent, exchangeRate } = await getTokenEquivalent(
        destinationCurrency,
        sourceCurrency,
        numericSourceAmount
      );
      const feeAmount = new Decimal(numericSourceAmount).mul(0.0015).toNumber();
      const netAmount = new Decimal(numericSourceAmount)
        .sub(feeAmount)
        .toNumber();

      await this.watchService.addAddressToWatcher({
        address: sourceAddress,
        chain: sourceChain,
        timeoutMs: 30 * 60 * 1000,
      });

      const transactionId =
        await this.transactionService.createCryptoToFiatTransaction({
          userId: userId,
          sourceChain: sourceChain,
          sourceAmount: numericSourceAmount.toString(),
          sourceCurrency: sourceCurrency,
          sourceAddress: normalizeAddress(sourceAddress, sourceChain),
          destinationAmount: destinationEquivalent.toString(),
          destinationCurrency: destinationCurrency,
          destinationChain,
          destinationBankAccountNumber: bankAccount.accountNumber,
          destinationBankName: bankAccount.bankName,
          destinationBankCode: bankAccount.bankCode,
          destinationAccountName: bankAccount.accountName,
          exchangeRate: exchangeRate.toString(),
          feeAmount: feeAmount.toString(),
          netAmount: netAmount.toString(),
        });

      const transaction = await this.transactionService.getTransactionById(
        transactionId
      );

      return this.sendSuccess(
        res,
        { transaction },
        "Crypto-to-fiat transaction created successfully",
        201
      );
    }
  );

  // Create a crypto-to-crypto transaction
  createCryptoToCryptoTransaction = this.asyncHandler(
    async (req: Request, res: Response): Promise<Response | void> => {
      if (!req.user) {
        return this.sendError(res, "User not authenticated", 401);
      }
      const { id: userId } = req.user;
      const {
        sourceAmount,
        sourceCurrency,
        destinationCurrency,
        destinationAddress,
        sourceChain,
        destinationChain,
      } = req.body;

      // Validation
      const validationError = this.validateRequiredFields(req.body, [
        "sourceAmount",
        "sourceCurrency",
        "destinationCurrency",
        "destinationAddress",
        "sourceChain",
        "destinationChain",
      ]);
      if (validationError) {
        return this.sendError(res, validationError);
      }

      // Validate sourceAmount is a valid number
      let numericSourceAmount: number;
      try {
        numericSourceAmount = this.validateAndParseAmount(sourceAmount);
      } catch (error) {
        return this.sendError(
          res,
          error instanceof Error
            ? error.message
            : "Invalid source amount. Must be a positive number."
        );
      }

      let destinationAmount: number;
      let exchangeRate: number;

      try {
        const result = await getTokenEquivalent(
          destinationCurrency.toUpperCase() as keyof typeof PRICE_FEEDS,
          sourceCurrency.toUpperCase() as keyof typeof PRICE_FEEDS,
          numericSourceAmount,
          destinationChain
        );

        destinationAmount = result.destinationEquivalent;
        exchangeRate = result.exchangeRate;
      } catch (error) {
        console.error("Error getting token equivalent:", error);
        return this.sendError(
          res,
          error instanceof Error
            ? error.message
            : "Failed to calculate token equivalent"
        );
      }

      const feeAmount = new Decimal(destinationAmount).mul(0.015).toNumber();
      const netAmount = new Decimal(destinationAmount)
        .sub(feeAmount)
        .toNumber();

      // Generate source address based on chain
      let sourceAddress: string;
      if (sourceChain === "ethereum") {
        sourceAddress = await this.generateEthereumAddressFromMnemonic(userId);
      } else {
        return this.sendError(res, "Unsupported source chain");
      }

      await this.watchService.addAddressToWatcher({
        address: sourceAddress,
        chain: sourceChain,
        timeoutMs: 30 * 60 * 1000,
      });

      const transactionId =
        await this.transactionService.createCryptoToCryptoTransaction({
          userId: userId,
          sourceChain: sourceChain,
          destinationChain: destinationChain,
          sourceAmount: numericSourceAmount.toString(),
          sourceCurrency: sourceCurrency,
          sourceAddress: normalizeAddress(sourceAddress, sourceChain),
          destinationAmount: destinationAmount.toString(),
          destinationCurrency: destinationCurrency,
          destinationAddress: normalizeAddress(
            destinationAddress,
            destinationChain
          ),
          exchangeRate: exchangeRate.toString(),
          feeAmount: feeAmount.toString(),
          netAmount: netAmount.toString(),
        });

      const transaction = await this.transactionService.getTransactionById(
        transactionId
      );

      return this.sendSuccess(
        res,
        { transaction },
        "Crypto-to-crypto transaction created successfully",
        201
      );
    }
  );

  // Get transaction by ID
  getTransactionById = this.asyncHandler(
    async (req: Request, res: Response): Promise<Response | void> => {
      if (!req.user) {
        return this.sendError(res, "User not authenticated", 401);
      }

      const { transactionId } = req.params;
      const { id: userId } = req.user;

      if (!transactionId) {
        return this.sendError(res, "Transaction ID is required");
      }

      const transaction =
        await this.transactionService.getTransactionByTransactionId(
          transactionId
        );

      if (!transaction || transaction.userId !== userId) {
        return this.sendError(res, "Transaction not found", 404);
      }

      return this.sendSuccess(res, { transaction });
    }
  );

  // Get user transactions
  getUserTransactions = this.asyncHandler(
    async (req: Request, res: Response): Promise<Response | void> => {
      if (!req.user) {
        return this.sendError(res, "User not authenticated", 401);
      }
      const { id: userId } = req.user;
      const { page = 1, limit = 10, status } = req.query;

      const transactions =
        await this.transactionService.getTransactionsByUserId(
          userId,
          Number(limit)
        );

      // Filter by status if provided
      const filteredTransactions = status
        ? transactions.filter((tx: any) => tx.status === status)
        : transactions;

      // Simple pagination
      const startIndex = (Number(page) - 1) * Number(limit);
      const paginatedTransactions = filteredTransactions.slice(
        startIndex,
        startIndex + Number(limit)
      );

      return this.sendSuccess(res, {
        transactions: paginatedTransactions,
        totalPages: Math.ceil(filteredTransactions.length / Number(limit)),
        currentPage: Number(page),
        total: filteredTransactions.length,
      });
    }
  );

  // Update crypto status (for internal use)
  updateCryptoStatus = this.asyncHandler(
    async (req: Request, res: Response): Promise<Response | void> => {
      const { id } = req.params;
      const { status, txHash } = req.body;

      if (!id) {
        return this.sendError(res, "Transaction ID is required");
      }

      const validationError = this.validateRequiredFields(req.body, ["status"]);
      if (validationError) {
        return this.sendError(res, validationError);
      }

      if (!Object.values(TransactionStatus).includes(status)) {
        return this.sendError(res, "Invalid status");
      }

      const success = await this.transactionService.updateCryptoStatus(
        id,
        status,
        txHash
      );

      if (!success) {
        return this.sendError(res, "Transaction not found", 404);
      }

      return this.sendSuccess(res, {}, "Crypto status updated successfully");
    }
  );
}

// Export controller instance methods for backward compatibility
const transactionController = new TransactionController();
export const {
  createFiatToCryptoTransaction,
  createCryptoToFiatTransaction,
  createCryptoToCryptoTransaction,
  getTransactionById,
  getUserTransactions,
  updateCryptoStatus,
} = transactionController;
