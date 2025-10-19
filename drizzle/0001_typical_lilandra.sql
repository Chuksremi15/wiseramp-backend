CREATE TYPE "public"."chain" AS ENUM('ethereum', 'bsc', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'base', 'fiat');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'waiting_for_crypto', 'crypto_pending', 'crypto_confirmed', 'processing', 'processing_payout', 'waiting_for_fiat', 'fiat_pending', 'fiat_confirmed', 'balance_verification_failed', 'token_to_vault_transfer_failed', 'token_from_vault_transfer_failed', 'token_to_vault_transfer_queued', 'internal_supply_failed', 'internal_supply_completed', 'completed', 'cancelled', 'failed', 'expired');--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" text NOT NULL,
	"transaction_type" text DEFAULT 'deposit' NOT NULL,
	"user_id" integer NOT NULL,
	"user_email" text,
	"user_name" text,
	"source_chain" "chain",
	"destination_chain" "chain",
	"source_amount" numeric(20, 8) NOT NULL,
	"source_currency" text NOT NULL,
	"source_address" text,
	"source_bank_account_number" text,
	"source_bank_name" text,
	"source_bank_code" text,
	"source_bank_account_name" text,
	"source_fee" text,
	"source_usd_value" text,
	"destination_amount" numeric(20, 8) NOT NULL,
	"destination_currency" text NOT NULL,
	"destination_address" text,
	"destination_bank_account_number" text,
	"destination_bank_name" text,
	"destination_bank_code" text,
	"destination_account_name" text,
	"destination_fee" text,
	"destination_usd_value" text,
	"token_amount" text,
	"token_address" text,
	"exchange_rate" numeric(20, 8) DEFAULT '1' NOT NULL,
	"fee_amount" numeric(20, 8) DEFAULT '0' NOT NULL,
	"fee_percentage" numeric(5, 4) DEFAULT '0' NOT NULL,
	"net_amount" numeric(20, 8) DEFAULT '0' NOT NULL,
	"status" "transaction_status" DEFAULT 'pending' NOT NULL,
	"crypto_status" "transaction_status",
	"fiat_status" "transaction_status",
	"internal_transfer_status" "transaction_status",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"crypto_received_at" timestamp,
	"crypto_sent_at" timestamp,
	"fiat_received_at" timestamp,
	"fiat_sent_at" timestamp,
	"completed_at" timestamp,
	"expired_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"source_transaction_hash" text,
	"destination_transaction_hash" text,
	"notes" text,
	"admin_notes" text,
	"sweep_admin_notes" text,
	"user_notes" text,
	"estimated_processing_time" text,
	"slippage_tolerance" numeric(5, 4),
	"gas_fee" numeric(20, 8),
	"network_fee" numeric(20, 8),
	CONSTRAINT "transactions_transaction_id_unique" UNIQUE("transaction_id"),
	CONSTRAINT "transactions_source_transaction_hash_unique" UNIQUE("source_transaction_hash")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reserve_account_ref" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "reserve_accounts" jsonb;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_id_idx" ON "transactions" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "user_id_idx" ON "transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "source_chain_status_idx" ON "transactions" USING btree ("source_chain","crypto_status","source_address");--> statement-breakpoint
CREATE INDEX "expired_status_idx" ON "transactions" USING btree ("expired_at","status");--> statement-breakpoint
CREATE INDEX "user_created_idx" ON "transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "source_address_status_idx" ON "transactions" USING btree ("source_address","crypto_status");--> statement-breakpoint
CREATE INDEX "status_expired_idx" ON "transactions" USING btree ("status","expired_at");