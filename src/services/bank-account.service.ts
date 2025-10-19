import { eq, and } from "drizzle-orm";
import { getDatabase } from "../db/connection.js";
import { BankAccount, users } from "../db/schema.js";

export type BankAccountData = typeof BankAccount.$inferSelect;
export type NewBankAccountData = typeof BankAccount.$inferInsert;

export class BankAccountService {
  /**
   * Create a new bank account for a user
   */
  static async createBankAccount(data: {
    userId: number;
    accountName: string;
    bankName: string;
    accountNumber: string;
    bankCode: string;
  }): Promise<BankAccountData> {
    try {
      const db = getDatabase();

      // Check if user exists
      const user = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, data.userId))
        .limit(1);

      if (!user.length) {
        throw new Error("User not found");
      }

      // Check if account number already exists for this user

      const existingAccount = await db
        .select()
        .from(BankAccount)
        .where(
          and(
            eq(BankAccount.userId, data.userId),
            eq(BankAccount.accountNumber, data.accountNumber)
          )
        )
        .limit(1);

      if (existingAccount.length > 0) {
        throw new Error("Bank account already exists for this user");
      }

      const [newAccount] = await db
        .insert(BankAccount)
        .values({
          userId: data.userId,
          accountName: data.accountName,
          bankName: data.bankName,
          accountNumber: data.accountNumber,
          bankCode: data.bankCode,
        })
        .returning();

      return newAccount;
    } catch (error) {
      console.error("Error creating bank account:", error);
      throw error;
    }
  }

  /**
   * Get all bank accounts for a user
   */
  static async getUserBankAccounts(userId: number): Promise<BankAccountData[]> {
    try {
      const db = getDatabase();

      const accounts = await db
        .select()
        .from(BankAccount)
        .where(eq(BankAccount.userId, userId));

      return accounts;
    } catch (error) {
      console.error("Error getting user bank accounts:", error);
      throw new Error("Failed to get user bank accounts");
    }
  }

  /**
   * Get a specific bank account by ID
   */
  static async getBankAccountById(
    accountId: string,
    userId?: number
  ): Promise<BankAccountData | null> {
    try {
      const conditions = [eq(BankAccount.id, accountId)];
      if (userId) {
        conditions.push(eq(BankAccount.userId, userId));
      }

      const db = getDatabase();

      const [account] = await db
        .select()
        .from(BankAccount)
        .where(and(...conditions))
        .limit(1);

      return account || null;
    } catch (error) {
      console.error("Error getting bank account by ID:", error);
      throw new Error("Failed to get bank account");
    }
  }

  /**
   * Get bank account by account number
   */
  static async getBankAccountByNumber(
    accountNumber: string,
    userId?: number
  ): Promise<BankAccountData | null> {
    try {
      const conditions = [eq(BankAccount.accountNumber, accountNumber)];
      if (userId) {
        conditions.push(eq(BankAccount.userId, userId));
      }

      const db = getDatabase();

      const [account] = await db
        .select()
        .from(BankAccount)
        .where(and(...conditions))
        .limit(1);

      return account || null;
    } catch (error) {
      console.error("Error getting bank account by number:", error);
      throw new Error("Failed to get bank account");
    }
  }

  /**
   * Update a bank account
   */
  static async updateBankAccount(
    accountId: string,
    userId: number,
    updates: {
      accountName?: string;
      bankName?: string;
      accountNumber?: string;
      bankCode?: string;
    }
  ): Promise<BankAccountData | null> {
    try {
      // Verify ownership
      const existingAccount = await this.getBankAccountById(accountId, userId);
      if (!existingAccount) {
        throw new Error("Bank account not found or access denied");
      }

      // If updating account number, check for duplicates
      if (
        updates.accountNumber &&
        updates.accountNumber !== existingAccount.accountNumber
      ) {
        const duplicate = await this.getBankAccountByNumber(
          updates.accountNumber,
          userId
        );
        if (duplicate && duplicate.id !== accountId) {
          throw new Error("Account number already exists for this user");
        }
      }

      const db = getDatabase();

      const [updatedAccount] = await db
        .update(BankAccount)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(
          and(eq(BankAccount.id, accountId), eq(BankAccount.userId, userId))
        )
        .returning();

      return updatedAccount || null;
    } catch (error) {
      console.error("Error updating bank account:", error);
      throw error;
    }
  }

  /**
   * Delete a bank account
   */
  static async deleteBankAccount(
    accountId: string,
    userId: number
  ): Promise<boolean> {
    try {
      const db = getDatabase();

      const result = await db
        .delete(BankAccount)
        .where(
          and(eq(BankAccount.id, accountId), eq(BankAccount.userId, userId))
        )
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error("Error deleting bank account:", error);
      throw new Error("Failed to delete bank account");
    }
  }

  /**
   * Check if user has any bank accounts
   */
  static async userHasBankAccounts(userId: number): Promise<boolean> {
    try {
      const db = getDatabase();

      const [account] = await db
        .select({ id: BankAccount.id })
        .from(BankAccount)
        .where(eq(BankAccount.userId, userId))
        .limit(1);

      return !!account;
    } catch (error) {
      console.error("Error checking user bank accounts:", error);
      return false;
    }
  }

  /**
   * Get bank account count for user
   */
  static async getUserBankAccountCount(userId: number): Promise<number> {
    try {
      const db = getDatabase();
      const accounts = await db
        .select({ id: BankAccount.id })
        .from(BankAccount)
        .where(eq(BankAccount.userId, userId));

      return accounts.length;
    } catch (error) {
      console.error("Error getting user bank account count:", error);
      return 0;
    }
  }
}
