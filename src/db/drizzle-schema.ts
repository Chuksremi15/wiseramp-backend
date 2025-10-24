import { TransactionStatus, Chain } from "../shared/types";

import {
  pgTable,
  text,
  integer,
  decimal,
  timestamp,
  pgEnum,
  index,
  uniqueIndex,
  serial,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const chainEnum = pgEnum(
  "chain",
  Object.values(Chain) as [string, ...string[]]
);

export const transactionStatusEnum = pgEnum(
  "transaction_status",
  Object.values(TransactionStatus) as [string, ...string[]]
);

export const queueStatusEnum = pgEnum("queue_status", [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
]);

// Types for accounts field
export type Account = {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
};

export type AccountsArray = Account[];

// Users table (basic structure for reference)
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(), // PostgreSQL auto-incremented PK
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email").notNull(),
    password: text("password"),
    avatar: text("avatar"),

    isDeployedWallet: boolean("is_deployed_wallet").notNull().default(false),

    reserveAccountRef: text("reserve_account_ref"),
    //Reserve Account - array of bank accounts
    reserveAccounts: jsonb("reserve_accounts").$type<AccountsArray>(),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    phoneIdx: uniqueIndex("phone_idx").on(table.phone),
    emailIdx: uniqueIndex("email_idx").on(table.email),
  })
);

// Transactions table
export const transactions = pgTable(
  "transactions",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    transactionId: text("transaction_id").notNull().unique(),
    transactionType: text("transaction_type").notNull().default("deposit"),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    userEmail: text("user_email"),
    userName: text("user_name"),

    // Chain information
    sourceChain: chainEnum("source_chain"),
    destinationChain: chainEnum("destination_chain"),

    // Source details
    sourceAmount: decimal("source_amount", {
      precision: 20,
      scale: 8,
    }).notNull(),
    sourceCurrency: text("source_currency").notNull(),
    sourceAddress: text("source_address"),
    sourceBankAccountNumber: text("source_bank_account_number"),
    sourceBankName: text("source_bank_name"),
    sourceBankCode: text("source_bank_code"),
    sourceBankAccountName: text("source_bank_account_name"),
    sourceFee: text("source_fee"),
    sourceUsdvalue: text("source_usd_value"),

    // Destination details
    destinationAmount: decimal("destination_amount", {
      precision: 20,
      scale: 8,
    }).notNull(),
    destinationCurrency: text("destination_currency").notNull(),
    destinationAddress: text("destination_address"),
    destinationBankAccountNumber: text("destination_bank_account_number"),
    destinationBankName: text("destination_bank_name"),
    destinationBankCode: text("destination_bank_code"),
    destinationAccountName: text("destination_account_name"),
    destinationFee: text("destination_fee"),
    destinationUsdvalue: text("destination_usd_value"),

    //ERC20 token transfer
    tokenAmount: text("token_amount"),

    tokenAddress: text("token_address"),

    // Exchange details
    exchangeRate: decimal("exchange_rate", {
      precision: 20,
      scale: 8,
    })
      .notNull()
      .default("1"),
    feeAmount: decimal("fee_amount", { precision: 20, scale: 8 })
      .notNull()
      .default("0"),
    feePercentage: decimal("fee_percentage", { precision: 5, scale: 4 })
      .notNull()
      .default("0"),
    netAmount: decimal("net_amount", { precision: 20, scale: 8 })
      .notNull()
      .default("0"),

    // Status tracking
    status: transactionStatusEnum("status").notNull().default("pending"),
    cryptoStatus: transactionStatusEnum("crypto_status"),
    fiatStatus: transactionStatusEnum("fiat_status"),
    internalTransferStatus: transactionStatusEnum("internal_transfer_status"),

    // Timestamps
    createdAt: timestamp("created_at").notNull().defaultNow(),
    cryptoReceivedAt: timestamp("crypto_received_at"),
    cryptoSentAt: timestamp("crypto_sent_at"),
    fiatReceivedAt: timestamp("fiat_received_at"),
    fiatSentAt: timestamp("fiat_sent_at"),
    completedAt: timestamp("completed_at"),
    expiredAt: timestamp("expired_at"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),

    // Transaction hashes
    sourceTransactionHash: text("source_transaction_hash").unique(),
    destinationTransactionHash: text("destination_transaction_hash"),

    // Metadata
    notes: text("notes"),
    adminNotes: text("admin_notes"),
    sweepAdminNotes: text("sweep_admin_notes"),
    userNotes: text("user_notes"),

    // Additional fields
    estimatedProcessingTime: text("estimated_processing_time"),
    slippageTolerance: decimal("slippage_tolerance", {
      precision: 5,
      scale: 4,
    }),
    gasFee: decimal("gas_fee", { precision: 20, scale: 8 }),
    networkFee: decimal("network_fee", { precision: 20, scale: 8 }),
  },
  (table) => ({
    transactionIdIdx: uniqueIndex("transaction_id_idx").on(table.transactionId),
    userIdIdx: index("user_id_idx").on(table.userId),
    sourceChainStatusIdx: index("source_chain_status_idx").on(
      table.sourceChain,
      table.cryptoStatus,
      table.sourceAddress
    ),
    expiredStatusIdx: index("expired_status_idx").on(
      table.expiredAt,
      table.status
    ),
    userCreatedIdx: index("user_created_idx").on(table.userId, table.createdAt),
    sourceAddressStatusIdx: index("source_address_status_idx").on(
      table.sourceAddress,
      table.cryptoStatus
    ),
    statusExpiredIdx: index("status_expired_idx").on(
      table.status,
      table.expiredAt
    ),
  })
);

export const BankAccount = pgTable("bank_account", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  accountName: text("account_name").notNull(),
  bankName: text("bank_name").notNull(),
  accountNumber: text("account_number").notNull(),
  bankCode: text("bank_code").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const UserAddress = pgTable("user_address", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  chain: text("chain"),
  addressName: text("address_name"),
  userAddress: text("user_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Transfer Queue table
export const transferQueue = pgTable(
  "transfer_queue",
  {
    id: serial("id").primaryKey(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.transactionId),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    fromAddress: text("from_address").notNull(),
    amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
    status: queueStatusEnum("status").notNull().default("PENDING"),
    retryCount: integer("retry_count").notNull().default(0),
    maxRetries: integer("max_retries").notNull().default(3),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at"),
    completedAt: timestamp("completed_at"),
    sourceChain: chainEnum("source_chain"),
    sourceCurrency: text("source_currency").notNull(),
    errorMessage: text("error_message"),
    txHash: text("tx_hash"),
    transferFee: text("transfer_fee"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("transfer_queue_transaction_id_idx").on(table.transactionId),
    index("transfer_queue_status_idx").on(table.status),
    index("transfer_queue_user_id_idx").on(table.userId),
    index("transfer_queue_created_at_idx").on(table.createdAt),
    index("transfer_queue_status_created_idx").on(
      table.status,
      table.createdAt
    ),
    index("transfer_queue_retry_count_idx").on(table.retryCount, table.status),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

export type BankAccountType = typeof BankAccount.$inferSelect;
export type NewBankAccount = typeof BankAccount.$inferInsert;

export type UserAddressType = typeof UserAddress.$inferSelect;
export type NewUserAddress = typeof UserAddress.$inferInsert;

// Transfer Queue types
export type TransferQueue = typeof transferQueue.$inferSelect;
export type NewTransferQueue = typeof transferQueue.$inferInsert;
