import { eq, and, or, desc, lte, inArray, gte } from "drizzle-orm";
import { getDatabase } from "../db/connection.js";
import { transactions, } from "../db/schema.js";
import { TransactionType, TransactionStatus } from "../shared/types.js";
import { hypersyncWorker } from "../worker/hypersync-worker.js";
export class PostgresTransactionService {
    // Create a new transaction
    // async createTransaction(
    //   transactionData: Partial<
    //     Omit<NewTransaction, "id" | "createdAt" | "updatedAt" | "transactionId">
    //   >
    // ): Promise<string> {
    //   // Fail fast if we can't monitor
    //   if (!hypersyncWorker.getStatus().isRunning) {
    //     throw new Error(
    //       "Payment monitoring unavailable. Please try again later."
    //     );
    //   }
    //   // Start monitoring BEFORE creating transaction
    //   const monitoringStarted = this.startHypersyncMonitoring(transactionData);
    //   if (!monitoringStarted) {
    //     throw new Error("Failed to start payment monitoring");
    //   }
    //   // Set defaults for null/undefined fields
    //   const defaultedData = this.setTransactionDefaults(transactionData);
    //   const db = getDatabase();
    //   const [result] = await db
    //     .insert(transactions)
    //     .values({
    //       ...defaultedData,
    //       transactionId: this.generateTransactionId(),
    //       expiredAt: new Date(Date.now() + 20 * 60 * 1000), // 20 minutes
    //     })
    //     .returning({ id: transactions.id });
    //   return result.id;
    // }
    async createTransaction(transactionData) {
        // 1. Comprehensive health check
        if (!transactionData.sourceChain) {
            throw new Error("Source chain is required");
        }
        // 2. Start monitoring BEFORE creating transaction (skip for fiat transactions)
        if (transactionData.sourceChain !== "fiat") {
            const monitoringStarted = await this.startHypersyncMonitoring(transactionData);
            if (!monitoringStarted) {
                throw new Error("Failed to start payment monitoring");
            }
        }
        try {
            // 3. Create transaction (monitoring already active)
            const defaultedData = this.setTransactionDefaults(transactionData);
            const db = getDatabase();
            const [result] = await db
                .insert(transactions)
                .values({
                ...defaultedData,
                transactionId: this.generateTransactionId(),
                expiredAt: new Date(Date.now() + 20 * 60 * 1000),
            })
                .returning({ id: transactions.id });
            console.log(`✅ Transaction ${result.id} created with monitoring active`);
            return result.id;
        }
        catch (error) {
            // 4. Cleanup monitoring if transaction creation fails (skip for fiat transactions)
            if (transactionData.sourceAddress &&
                transactionData.sourceChain &&
                transactionData.sourceChain !== "fiat") {
                hypersyncWorker.removeAddress(transactionData.sourceAddress, transactionData.sourceChain);
                console.log(`🧹 Cleaned up monitoring for ${transactionData.sourceAddress}`);
            }
            throw error;
        }
    }
    async startHypersyncMonitoring(transaction) {
        if (!transaction?.sourceAddress || !transaction?.sourceChain) {
            console.warn("Invalid transaction: missing address or chain");
            return false;
        }
        const { sourceAddress, sourceChain, sourceCurrency } = transaction;
        // Skip hypersync monitoring for fiat transactions
        if (sourceChain === "fiat") {
            console.log("Skipping hypersync monitoring for fiat transaction");
            return true;
        }
        try {
            if (sourceCurrency && sourceCurrency !== "ETH") {
                return await hypersyncWorker.addAddressForToken(sourceAddress, sourceChain, sourceCurrency);
            }
            else {
                return await hypersyncWorker.addAddress(sourceAddress, sourceChain);
            }
        }
        catch (error) {
            console.error("Failed to start hypersync monitoring:", error);
            return false;
        }
    }
    // Validate required fields
    validateRequiredFields(data) {
        const requiredFields = [
            "transactionType",
            "userId",
            "sourceAmount",
            "sourceCurrency",
            "destinationAmount",
            "destinationCurrency",
            "exchangeRate",
            "netAmount",
        ];
        const missingFields = requiredFields.filter((field) => !data[field]);
        if (missingFields.length > 0) {
            throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
        }
    }
    // Set defaults for transaction fields
    setTransactionDefaults(data) {
        // Validate required fields first
        this.validateRequiredFields(data);
        return {
            // Required fields - must be provided
            transactionType: data.transactionType,
            userId: data.userId,
            sourceAmount: data.sourceAmount,
            sourceCurrency: data.sourceCurrency,
            destinationAmount: data.destinationAmount,
            destinationCurrency: data.destinationCurrency,
            exchangeRate: data.exchangeRate,
            netAmount: data.netAmount,
            // Optional fields with defaults
            userEmail: data.userEmail || null,
            userName: data.userName || null,
            sourceChain: data.sourceChain || null,
            destinationChain: data.destinationChain || null,
            sourceAddress: data.sourceAddress || null,
            sourceBankAccountNumber: data.sourceBankAccountNumber || null,
            sourceBankName: data.sourceBankName || null,
            sourceBankCode: data.sourceBankCode || null,
            sourceBankAccountName: data.sourceBankAccountName || null,
            destinationAddress: data.destinationAddress || null,
            destinationBankAccountNumber: data.destinationBankAccountNumber || null,
            destinationBankName: data.destinationBankName || null,
            destinationBankCode: data.destinationBankCode || null,
            destinationAccountName: data.destinationAccountName || null,
            // Financial fields with defaults
            feeAmount: data.feeAmount || "0",
            feePercentage: data.feePercentage || "0.03",
            // Status fields with defaults
            status: data.status || "pending",
            cryptoStatus: data.cryptoStatus || "waiting_for_crypto",
            fiatStatus: data.fiatStatus || null,
            // Timestamp fields - all null by default
            cryptoReceivedAt: data.cryptoReceivedAt || null,
            cryptoSentAt: data.cryptoSentAt || null,
            fiatReceivedAt: data.fiatReceivedAt || null,
            fiatSentAt: data.fiatSentAt || null,
            completedAt: data.completedAt || null,
            expiredAt: data.expiredAt || null,
            // Transaction hash fields
            sourceTransactionHash: data.sourceTransactionHash || null,
            destinationTransactionHash: data.destinationTransactionHash || null,
            // Notes fields
            notes: data.notes || null,
            adminNotes: data.adminNotes || null,
            userNotes: data.userNotes || null,
            // Additional optional fields
            estimatedProcessingTime: data.estimatedProcessingTime || null,
            slippageTolerance: data.slippageTolerance || null,
            gasFee: data.gasFee || null,
            networkFee: data.networkFee || null,
        };
    }
    // Get transaction by ID
    async getTransactionById(id) {
        const db = getDatabase();
        const [result] = await db
            .select()
            .from(transactions)
            .where(eq(transactions.id, id));
        return result || null;
    }
    // Get transaction by transaction ID
    async getTransactionByTransactionId(transactionId) {
        const db = getDatabase();
        const [result] = await db
            .select()
            .from(transactions)
            .where(eq(transactions.transactionId, transactionId));
        return result || null;
    }
    // Get transactions by user ID
    async getTransactionsByUserId(userId, limit = 50) {
        const db = getDatabase();
        return await db
            .select()
            .from(transactions)
            .where(eq(transactions.userId, userId))
            .orderBy(desc(transactions.createdAt))
            .limit(limit);
    }
    // Get transactions by type
    async getTransactionsByType(type) {
        const db = getDatabase();
        return await db
            .select()
            .from(transactions)
            .where(eq(transactions.transactionType, type));
    }
    // Get pending crypto transactions
    async getPendingCryptoTransactions() {
        const db = getDatabase();
        return await db
            .select()
            .from(transactions)
            .where(and(inArray(transactions.cryptoStatus, [
            "waiting_for_crypto",
            "crypto_pending",
        ])
        // Only include transactions with source addresses
        // Note: In Drizzle, we need to handle null checks differently
        ));
    }
    // Update crypto status
    async updateCryptoStatus(id, status, txHash) {
        const updates = {
            cryptoStatus: status,
            updatedAt: new Date(),
        };
        if (status === "crypto_confirmed") {
            updates.cryptoReceivedAt = new Date();
            if (txHash)
                updates.sourceTransactionHash = txHash;
            // Get the transaction to determine its type
            const transaction = await this.getTransactionById(id);
            if (transaction) {
                // Update overall status based on transaction type (matching original Mongoose behavior)
                switch (transaction.transactionType) {
                    case "crypto_to_fiat":
                        updates.status = "processing_payout";
                        updates.fiatStatus = "processing_payout";
                        break;
                    case "crypto_to_crypto":
                    case "supply_stable":
                        updates.status = "processing";
                        break;
                    case "fiat_to_crypto":
                        updates.status = "processing";
                        break;
                }
            }
        }
        const db = getDatabase();
        const [result] = await db
            .update(transactions)
            .set(updates)
            .where(eq(transactions.id, id))
            .returning({ id: transactions.id });
        return !!result;
    }
    // Update fiat status
    async updateFiatStatus(id, status, txId) {
        const updates = {
            fiatStatus: status,
            updatedAt: new Date(),
        };
        if (status === "fiat_confirmed") {
            updates.fiatReceivedAt = new Date();
            if (txId)
                updates.sourceTransactionHash = txId;
            updates.status = "processing";
        }
        else if (status === "processing_payout") {
            updates.fiatSentAt = new Date();
            if (txId)
                updates.destinationTransactionHash = txId;
            updates.status = "completed";
            updates.completedAt = new Date();
        }
        const db = getDatabase();
        const [result] = await db
            .update(transactions)
            .set(updates)
            .where(eq(transactions.id, id))
            .returning({ id: transactions.id });
        return !!result;
    }
    async updateFiatStatusTransactionHash(id, status, sourceTransactionHash) {
        try {
            const db = getDatabase();
            const [result] = await db
                .update(transactions)
                .set({
                sourceTransactionHash,
                fiatStatus: status,
                fiatReceivedAt: status === "fiat_confirmed" ? new Date() : undefined,
                status: status === "fiat_confirmed" ? "processing" : undefined,
                updatedAt: new Date(),
            })
                .where(eq(transactions.id, id))
                .returning({ id: transactions.id });
            return !!result;
        }
        catch (error) {
            if (error.code === "23505") {
                // PostgreSQL unique violation
                console.log(`Duplicate transaction hash: ${sourceTransactionHash}`);
                return false;
            }
            throw error;
        }
    }
    // Complete crypto-to-crypto transaction
    async completeCryptoToCrypto(id, destinationTxHash, adminNotes) {
        const db = getDatabase();
        const [result] = await db
            .update(transactions)
            .set({
            destinationTransactionHash: destinationTxHash,
            cryptoSentAt: new Date(),
            status: "completed",
            completedAt: new Date(),
            adminNotes: adminNotes || null,
            updatedAt: new Date(),
        })
            .where(eq(transactions.id, id))
            .returning({ id: transactions.id });
        return !!result;
    }
    // Expire transaction
    async expireTransaction(id) {
        const db = getDatabase();
        const [result] = await db
            .update(transactions)
            .set({
            status: "expired",
            expiredAt: new Date(),
            updatedAt: new Date(),
        })
            .where(eq(transactions.id, id))
            .returning({ id: transactions.id });
        return !!result;
    }
    // Find expired transactions
    async findExpiredTransactions() {
        const now = new Date();
        const db = getDatabase();
        return await db
            .select()
            .from(transactions)
            .where(and(inArray(transactions.status, [
            "waiting_for_crypto",
            "waiting_for_fiat",
            "crypto_pending",
            "fiat_pending",
            "pending",
        ]), lte(transactions.expiredAt, now)));
    }
    // Expire old transactions
    async expireOldTransactions() {
        const expiredTransactions = await this.findExpiredTransactions();
        if (expiredTransactions.length === 0) {
            return { count: 0, expiredAddresses: [] };
        }
        const expiredIds = expiredTransactions.map((tx) => tx.id);
        const db = getDatabase();
        await db
            .update(transactions)
            .set({
            status: "expired",
            cryptoStatus: "expired",
            fiatStatus: "expired",
            expiredAt: new Date(),
            updatedAt: new Date(),
        })
            .where(inArray(transactions.id, expiredIds));
        // Extract unique addresses that were being monitored
        const expiredAddresses = expiredTransactions
            .filter((tx) => tx.sourceAddress && tx.sourceChain)
            .map((tx) => ({
            address: tx.sourceAddress,
            chain: tx.sourceChain,
        }))
            // Remove duplicates
            .filter((addr, index, self) => index ===
            self.findIndex((a) => a.address === addr.address && a.chain === addr.chain));
        return {
            count: expiredTransactions.length,
            expiredAddresses,
        };
    }
    // Update transaction status
    async updateTransactionStatus(id, status) {
        const db = getDatabase();
        const [result] = await db
            .update(transactions)
            .set({
            status,
            updatedAt: new Date(),
        })
            .where(eq(transactions.id, id))
            .returning({ id: transactions.id });
        return !!result;
    }
    // Helper method to create crypto-to-crypto transaction with minimal data
    async createCryptoToCryptoTransaction(params) {
        const transactionData = {
            transactionType: TransactionType.CRYPTO_TO_CRYPTO,
            userId: params.userId,
            userEmail: params.userEmail,
            userName: params.userName,
            sourceChain: params.sourceChain.toLowerCase(),
            destinationChain: params.destinationChain.toLowerCase(),
            sourceAmount: params.sourceAmount,
            sourceCurrency: params.sourceCurrency.toUpperCase(),
            sourceAddress: params.sourceAddress,
            destinationAmount: params.destinationAmount,
            destinationCurrency: params.destinationCurrency.toUpperCase(),
            destinationAddress: params.destinationAddress,
            exchangeRate: params.exchangeRate,
            feeAmount: params.feeAmount || "0",
            netAmount: params.netAmount,
            cryptoStatus: "waiting_for_crypto",
        };
        return await this.createTransaction(transactionData);
    }
    // Helper method to create crypto-to-fiat transaction
    async createCryptoToFiatTransaction(params) {
        const transactionData = {
            transactionType: TransactionType.CRYPTO_TO_FIAT,
            userId: params.userId,
            userEmail: params.userEmail,
            userName: params.userName,
            sourceChain: params.sourceChain.toLowerCase(),
            sourceAmount: params.sourceAmount,
            sourceCurrency: params.sourceCurrency.toUpperCase(),
            sourceAddress: params.sourceAddress,
            destinationAmount: params.destinationAmount,
            destinationCurrency: params.destinationCurrency.toUpperCase(),
            destinationChain: params.destinationChain,
            destinationBankAccountNumber: params.destinationBankAccountNumber,
            destinationBankName: params.destinationBankName,
            destinationBankCode: params.destinationBankCode,
            destinationAccountName: params.destinationAccountName,
            exchangeRate: params.exchangeRate,
            feeAmount: params.feeAmount || "0",
            netAmount: params.netAmount,
            cryptoStatus: TransactionStatus.WAITING_FOR_CRYPTO,
        };
        return await this.createTransaction(transactionData);
    }
    // Helper method to create fiat-to-crypto transaction
    async createFiatToCryptoTransaction(params) {
        const transactionData = {
            transactionType: TransactionType.FIAT_TO_CRYPTO,
            userId: params.userId,
            userEmail: params.userEmail,
            userName: params.userName,
            destinationChain: params.destinationChain.toLowerCase(),
            sourceAmount: params.sourceAmount,
            sourceCurrency: params.sourceCurrency.toUpperCase(),
            sourceChain: params.sourceChain,
            sourceBankAccountNumber: params.sourceBankAccountNumber,
            sourceBankName: params.sourceBankName,
            sourceBankAccountName: params.sourceBankAccountName,
            destinationAmount: params.destinationAmount,
            destinationCurrency: params.destinationCurrency.toUpperCase(),
            destinationAddress: params.destinationAddress,
            exchangeRate: params.exchangeRate,
            feeAmount: params.feeAmount || "0",
            netAmount: params.netAmount,
            fiatStatus: TransactionStatus.WAITING_FOR_FIAT,
        };
        return await this.createTransaction(transactionData);
    }
    // Generate transaction ID (same logic as Mongoose)
    generateTransactionId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `TXN${timestamp}${random}`.toUpperCase();
    }
    // Get transactions by chain and address
    async getTransactionsByChainAndAddress(chain, address) {
        const db = getDatabase();
        return await db
            .select()
            .from(transactions)
            .where(and(eq(transactions.sourceChain, chain), eq(transactions.sourceAddress, address)))
            .orderBy(desc(transactions.createdAt));
    }
    // Get pending transactions by chain
    async getPendingTransactionsByChain(chain) {
        const now = new Date();
        const db = getDatabase();
        return await db
            .select()
            .from(transactions)
            .where(and(eq(transactions.sourceChain, chain), inArray(transactions.cryptoStatus, [
            "waiting_for_crypto",
            "crypto_pending",
        ]), inArray(transactions.status, ["pending", "processing"]), 
        // Not expired - expiredAt should be greater than now
        gte(transactions.expiredAt, now)))
            .orderBy(transactions.createdAt);
    }
    // Get pending transactions by chain and address
    async getPendingTransactionsByChainAndAddress(chain, address) {
        const now = new Date();
        const db = getDatabase();
        return await db
            .select()
            .from(transactions)
            .where(and(eq(transactions.sourceChain, chain), eq(transactions.sourceAddress, address), eq(transactions.cryptoStatus, "waiting_for_crypto"), inArray(transactions.status, ["pending", "processing"]), 
        // Not expired - expiredAt should be greater than now
        gte(transactions.expiredAt, now)))
            .orderBy(transactions.createdAt); // Oldest first
    }
    // Get pending transaction by chain and email
    async getPendingTransactionsByChainAndEmail(chain, email) {
        const now = new Date();
        const db = getDatabase();
        return await db
            .select()
            .from(transactions)
            .where(and(eq(transactions.sourceChain, chain), eq(transactions.userEmail, email), eq(transactions.fiatStatus, "waiting_for_fiat"), inArray(transactions.status, ["pending", "processing"]), 
        // Not expired - expiredAt should be greater than now
        gte(transactions.expiredAt, now)))
            .orderBy(transactions.createdAt); // Oldest first
    }
    // Get expired transactions by chain and address
    async getExpiredTransactionsByChainAndAddress(chain, address) {
        const now = new Date();
        const db = getDatabase();
        return await db
            .select()
            .from(transactions)
            .where(and(eq(transactions.sourceChain, chain), eq(transactions.sourceAddress, address), or(eq(transactions.status, "expired"), lte(transactions.expiredAt, now))));
    }
    // Update admin notes for a transaction
    async updateAdminNotes(id, adminNotes) {
        const db = getDatabase();
        const [result] = await db
            .update(transactions)
            .set({
            adminNotes,
            updatedAt: new Date(),
        })
            .where(eq(transactions.id, id))
            .returning({ id: transactions.id });
        return !!result;
    }
    // Update multiple transaction fields at once
    async updateTransactionFields(id, updates) {
        const db = getDatabase();
        const [result] = await db
            .update(transactions)
            .set({
            ...updates,
            updatedAt: new Date(),
        })
            .where(eq(transactions.id, id))
            .returning({ id: transactions.id });
        return !!result;
    }
    async updateTransactionFieldsByTransactionId(transactionId, updates) {
        const db = getDatabase();
        const [result] = await db
            .update(transactions)
            .set({
            ...updates,
            updatedAt: new Date(),
        })
            .where(eq(transactions.transactionId, transactionId))
            .returning({ id: transactions.id });
        return !!result;
    }
    // Get transaction statistics
    async getTransactionStats() {
        const db = getDatabase();
        // This would require more complex aggregation queries in Drizzle
        // For now, we'll do separate queries
        const [total, pending, completed, expired, failed] = await Promise.all([
            db.select().from(transactions),
            db.select().from(transactions).where(eq(transactions.status, "pending")),
            db
                .select()
                .from(transactions)
                .where(eq(transactions.status, "completed")),
            db.select().from(transactions).where(eq(transactions.status, "expired")),
            db.select().from(transactions).where(eq(transactions.status, "failed")),
        ]);
        return {
            total: total.length,
            pending: pending.length,
            completed: completed.length,
            expired: expired.length,
            failed: failed.length,
        };
    }
}
