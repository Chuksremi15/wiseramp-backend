import { Request, Response } from "express";
import { PostgresTransactionService } from "../services/transaction.service.js";
import { TransactionStatus, TransactionType } from "../shared/types.js";

import { getTokenEquivalent, PRICE_FEEDS } from "../utils/price-feed.js";
import { PostgresUserService } from "../services/user.service.js";
// import { BankAccountService } from "../services/bank-account.service.js";
import Decimal from "decimal.js";
import { HDNodeWallet, Mnemonic } from "ethers";
import { normalizeAddress } from "../utils/address.js";

export class TransactionController {
  private static transactionService = new PostgresTransactionService();
  private static useService = new PostgresUserService();

  // Validate and parse amount, handling comma separators
  private static validateAndParseAmount(amount: string): number {
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
  private static async generateEthereumAddressFromMnemonic(
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
  static async createFiatToCryptoTransaction(req: Request, res: Response) {
    try {
      if (!req.user) {
        res.status(401).json({ message: "User not authenticated" });
        return;
      }
      const { id } = req.user;

      const user = await this.useService.findByUserId(id);

      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      const {
        sourceAmount,
        sourceCurrency,
        sourceChain,
        destinationCurrency,
        destinationAddress,
        destinationChain,
      } = req.body;

      if (
        !sourceAmount ||
        !sourceCurrency ||
        !destinationCurrency ||
        !destinationAddress ||
        !destinationChain ||
        !sourceChain ||
        sourceCurrency !== "NGN"
      ) {
        res
          .status(400)
          .json({ message: "Missing required fields for fiat-to-crypto" });
        return;
      }

      // Check if user has accounts configured
      if (!user.reserveAccounts || user.reserveAccounts.length === 0) {
        res.status(400).json({
          message:
            "User has no bank accounts configured. Please set up a reserve account first.",
        });
        return;
      }

      const { accountNumber, bankName, accountName } = user.reserveAccounts[0];

      // Validate sourceAmount is a valid number
      let numericSourceAmount: number;
      try {
        numericSourceAmount =
          TransactionController.validateAndParseAmount(sourceAmount);
      } catch (error) {
        res.status(400).json({
          message:
            error instanceof Error
              ? error.message
              : "Invalid source amount. Must be a positive number.",
        });
        return;
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

      res.status(201).json({
        success: true,
        transaction,
      });
    } catch (error) {
      console.error("Error creating fiat-to-crypto transaction:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }

  // Create a crypto-to-fiat transaction
  static async createCryptoToFiatTransaction(req: Request, res: Response) {
    try {
      if (!req.user) {
        res.status(401).json({ message: "User not authenticated" });
        return;
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

      if (
        !sourceAmount ||
        !sourceCurrency ||
        !sourceChain ||
        !destinationCurrency ||
        !destinationChain ||
        !bankAccountId
      ) {
        res
          .status(400)
          .json({ message: "Missing required fields for crypto-to-fiat" });
        return;
      }

      let bankAccount: any;

      //   const bankAccount = await BankAccountService.getBankAccountById(
      //     bankAccountId,
      //     userId
      //   );

      if (!bankAccount) {
        res.status(404).json({ message: "bankAccount not found" });
        return;
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
          res.status(400).json({ message: "Unsupported source chain" });
          return;
      }

      // Validate sourceAmount is a valid number
      let numericSourceAmount: number;
      try {
        numericSourceAmount =
          TransactionController.validateAndParseAmount(sourceAmount);
      } catch (error) {
        res.status(400).json({
          message:
            error instanceof Error
              ? error.message
              : "Invalid source amount. Must be a positive number.",
        });
        return;
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

      res.status(201).json({
        success: true,
        transaction,
      });
    } catch (error) {
      console.error("Error creating crypto-to-fiat transaction:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }

  // Create a crypto-to-crypto transaction
  static async createCryptoToCryptoTransaction(req: Request, res: Response) {
    try {
      if (!req.user) {
        res.status(401).json({ message: "User not authenticated" });
        return;
      }
      const { id: userId } = req.user;
      const {
        sourceAmount,
        sourceCurrency,
        destinationCurrency,
        destinationAddress,
        sourceChain,
        destinationChain,
        tokenMint,
      } = req.body;

      if (
        !sourceAmount ||
        !sourceCurrency ||
        !destinationCurrency ||
        !destinationAddress ||
        !sourceChain ||
        !destinationChain
      ) {
        res
          .status(400)
          .json({ message: "Missing required fields for crypto-to-crypto" });
        return;
      }

      // Validate sourceAmount is a valid number
      let numericSourceAmount: number;
      try {
        numericSourceAmount =
          TransactionController.validateAndParseAmount(sourceAmount);
      } catch (error) {
        res.status(400).json({
          message:
            error instanceof Error
              ? error.message
              : "Invalid source amount. Must be a positive number.",
        });
        return;
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
        return res.status(400).json({
          error: "Failed to calculate token equivalent",
          message: error instanceof Error ? error.message : "Unknown error",
        });
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
        res.status(400).json({ message: "Unsupported source chain" });
        return;
      }

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
          tokenMint: tokenMint,
        });

      const transaction = await this.transactionService.getTransactionById(
        transactionId
      );

      res.status(201).json({
        success: true,
        transaction,
      });
    } catch (error) {
      console.error("Error creating crypto-to-crypto transaction:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }

  // Get transaction by ID
  static async getTransactionById(req: Request, res: Response) {
    try {
      if (!req.user) {
        res.status(401).json({ message: "User not authenticated" });
        return;
      }

      const { transactionId } = req.params;
      const { id: userId } = req.user;

      const transaction =
        await this.transactionService.getTransactionByTransactionId(
          transactionId
        );

      if (!transaction || transaction.userId !== userId) {
        res.status(404).json({ message: "Transaction not found" });
        return;
      }

      res.json({ success: true, transaction });
    } catch (error) {
      console.error("Error fetching transaction:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }

  // Get user transactions
  static async getUserTransactions(req: Request, res: Response) {
    try {
      if (!req.user) {
        res.status(401).json({ message: "User not authenticated" });
        return;
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

      res.json({
        success: true,
        transactions: paginatedTransactions,
        totalPages: Math.ceil(filteredTransactions.length / Number(limit)),
        currentPage: Number(page),
        total: filteredTransactions.length,
      });
    } catch (error) {
      console.error("Error fetching user transactions:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }

  // Update crypto status (for internal use)
  static async updateCryptoStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, txHash } = req.body;

      if (!Object.values(TransactionStatus).includes(status)) {
        res.status(400).json({ message: "Invalid status" });
        return;
      }

      const success = await this.transactionService.updateCryptoStatus(
        id,
        status,
        txHash
      );

      if (!success) {
        res.status(404).json({ message: "Transaction not found" });
        return;
      }

      res.json({ message: "Crypto status updated successfully" });
    } catch (error) {
      console.error("Error updating crypto status:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
}
