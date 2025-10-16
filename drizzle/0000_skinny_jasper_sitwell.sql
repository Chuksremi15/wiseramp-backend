CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text NOT NULL,
	"password" text,
	"avatar" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "phone_idx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "email_idx" ON "users" USING btree ("email");