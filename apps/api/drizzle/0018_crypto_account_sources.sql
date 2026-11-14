CREATE TYPE "public"."crypto_account_source" AS ENUM('exchange', 'wallet', 'manual');--> statement-breakpoint
CREATE TYPE "public"."crypto_exchange_provider" AS ENUM('binance', 'coinbase', 'other');--> statement-breakpoint
CREATE TYPE "public"."crypto_chain" AS ENUM('bitcoin', 'ethereum', 'arbitrum', 'base', 'optimism', 'polygon', 'bsc');--> statement-breakpoint
CREATE TYPE "public"."crypto_holding_origin" AS ENUM('import', 'sync', 'manual');--> statement-breakpoint
CREATE TYPE "public"."crypto_key_family" AS ENUM('bitcoin', 'evm');--> statement-breakpoint
CREATE TABLE "crypto_wallet_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"account_id" uuid NOT NULL,
	"family" "crypto_key_family" NOT NULL,
	"public_key" varchar(150) NOT NULL,
	"chains" "crypto_chain"[] NOT NULL,
	"label" varchar(100),
	CONSTRAINT "crypto_wallet_keys_public_key_unique" UNIQUE("public_key"),
	CONSTRAINT "crypto_wallet_keys_chains_not_empty" CHECK (cardinality("crypto_wallet_keys"."chains") > 0)
);
--> statement-breakpoint
ALTER TABLE "crypto_holdings" DROP CONSTRAINT "crypto_holdings_account_asset_location_unique";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "crypto_source" "crypto_account_source";--> statement-breakpoint
-- Crypto accounts created before sources hold holdings typed by hand.
UPDATE "accounts" SET "crypto_source" = 'manual' WHERE "type" = 'crypto';--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "crypto_provider" "crypto_exchange_provider";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "crypto_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crypto_holdings" ADD COLUMN "origin" "crypto_holding_origin" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "crypto_wallet_keys" ADD CONSTRAINT "crypto_wallet_keys_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crypto_wallet_keys_account_id_index" ON "crypto_wallet_keys" USING btree ("account_id");--> statement-breakpoint
ALTER TABLE "crypto_holdings" ADD CONSTRAINT "crypto_holdings_account_asset_location_origin_unique" UNIQUE("account_id","asset_id","location","origin");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_crypto_source_iff_crypto" CHECK (("accounts"."type" = 'crypto') = ("accounts"."crypto_source" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_crypto_provider_iff_exchange" CHECK (("accounts"."crypto_source" IS NOT DISTINCT FROM 'exchange') = ("accounts"."crypto_provider" IS NOT NULL));