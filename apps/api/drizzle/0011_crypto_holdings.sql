CREATE TYPE "public"."crypto_price_source" AS ENUM('provider', 'manual');--> statement-breakpoint
CREATE TABLE "crypto_holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"account_id" uuid NOT NULL,
	"asset_id" varchar(100) NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"quantity" numeric(38, 18) NOT NULL,
	"location" varchar(100) DEFAULT '' NOT NULL,
	"invested_cents" bigint,
	"note" text,
	CONSTRAINT "crypto_holdings_account_asset_location_unique" UNIQUE("account_id","asset_id","location"),
	CONSTRAINT "crypto_holdings_quantity_non_negative" CHECK ("crypto_holdings"."quantity" >= 0),
	CONSTRAINT "crypto_holdings_invested_non_negative" CHECK ("crypto_holdings"."invested_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "crypto_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"asset_id" varchar(100) NOT NULL,
	"price_eur" numeric(38, 12) NOT NULL,
	"source" "crypto_price_source" NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "crypto_prices_asset_id_unique" UNIQUE("asset_id"),
	CONSTRAINT "crypto_prices_price_non_negative" CHECK ("crypto_prices"."price_eur" >= 0)
);
--> statement-breakpoint
ALTER TABLE "crypto_holdings" ADD CONSTRAINT "crypto_holdings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crypto_holdings_asset_id_index" ON "crypto_holdings" USING btree ("asset_id");