CREATE TYPE "public"."queue_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TABLE "transfer_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"from_address" text NOT NULL,
	"amount" numeric(20, 8) NOT NULL,
	"status" "queue_status" DEFAULT 'PENDING' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp,
	"completed_at" timestamp,
	"source_chain" "chain",
	"source_currency" text NOT NULL,
	"error_message" text,
	"tx_hash" text,
	"transfer_fee" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transfer_queue" ADD CONSTRAINT "transfer_queue_transaction_id_transactions_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("transaction_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_queue" ADD CONSTRAINT "transfer_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transfer_queue_transaction_id_idx" ON "transfer_queue" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transfer_queue_status_idx" ON "transfer_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transfer_queue_user_id_idx" ON "transfer_queue" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transfer_queue_created_at_idx" ON "transfer_queue" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "transfer_queue_status_created_idx" ON "transfer_queue" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "transfer_queue_retry_count_idx" ON "transfer_queue" USING btree ("retry_count","status");