CREATE TYPE "public"."crypto_import_format" AS ENUM('binance_csv', 'coinbase_csv');--> statement-breakpoint
CREATE TYPE "public"."crypto_movement_kind" AS ENUM('buy', 'sell', 'convert', 'fee', 'deposit', 'withdrawal', 'transfer_internal', 'income', 'other');--> statement-breakpoint
CREATE TABLE "crypto_asset_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ticker" varchar(20) NOT NULL,
	"asset_id" varchar(100) NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	CONSTRAINT "crypto_asset_aliases_ticker_unique" UNIQUE("ticker")
);
--> statement-breakpoint
CREATE TABLE "crypto_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"account_id" uuid NOT NULL,
	"format" "crypto_import_format" NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_hash" varchar(64) NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"row_count" integer DEFAULT 0 NOT NULL,
	"new_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"issue_count" integer DEFAULT 0 NOT NULL,
	"inserted_count" integer DEFAULT 0 NOT NULL,
	"preview" jsonb NOT NULL,
	"committed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crypto_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"account_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"wallet" varchar(50),
	"operation" varchar(100) NOT NULL,
	"kind" "crypto_movement_kind" NOT NULL,
	"asset" varchar(20) NOT NULL,
	"quantity" numeric(38, 18) NOT NULL,
	"eur_cents" bigint,
	"source_ref" varchar(100),
	"dedupe_hash" varchar(64) NOT NULL,
	CONSTRAINT "crypto_movements_account_hash_unique" UNIQUE("account_id","dedupe_hash")
);
--> statement-breakpoint
ALTER TABLE "crypto_imports" ADD CONSTRAINT "crypto_imports_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD CONSTRAINT "crypto_movements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD CONSTRAINT "crypto_movements_import_id_crypto_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."crypto_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crypto_imports_account_id_index" ON "crypto_imports" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "crypto_movements_account_id_occurred_at_index" ON "crypto_movements" USING btree ("account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "crypto_movements_import_id_index" ON "crypto_movements" USING btree ("import_id");