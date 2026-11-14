CREATE TABLE "crypto_wallet_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"account_id" uuid NOT NULL,
	"asset_id" varchar(100) NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	CONSTRAINT "crypto_wallet_tokens_account_asset_unique" UNIQUE("account_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "crypto_sync_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crypto_wallet_tokens" ADD CONSTRAINT "crypto_wallet_tokens_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;