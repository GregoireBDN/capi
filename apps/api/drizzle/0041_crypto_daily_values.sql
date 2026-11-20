CREATE TYPE "public"."snapshot_source" AS ENUM('typed', 'computed');--> statement-breakpoint
CREATE TABLE "crypto_price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"asset_id" varchar(100) NOT NULL,
	"day" date NOT NULL,
	"price_eur" numeric(38, 12) NOT NULL,
	"source" "crypto_price_source" NOT NULL,
	CONSTRAINT "crypto_price_history_asset_day_unique" UNIQUE("asset_id","day"),
	CONSTRAINT "crypto_price_history_price_non_negative" CHECK ("crypto_price_history"."price_eur" >= 0)
);
--> statement-breakpoint
ALTER TABLE "balance_snapshots" ADD COLUMN "source" "snapshot_source" DEFAULT 'typed' NOT NULL;--> statement-breakpoint
-- #366: a crypto account's values were always holdings × price, never typed.
UPDATE "balance_snapshots" SET "source" = 'computed' FROM "accounts" WHERE "accounts"."id" = "balance_snapshots"."account_id" AND "accounts"."type" = 'crypto';
--> statement-breakpoint
CREATE TRIGGER "crypto_price_history_set_updated_at" BEFORE UPDATE ON "crypto_price_history" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- A crypto account's values are computed by its daily close, every other
-- account's typed (#366): a forgotten write path fails loudly.
CREATE OR REPLACE FUNCTION balance_snapshots_source_by_type() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  is_crypto boolean;
BEGIN
  SELECT a.type = 'crypto' INTO is_crypto FROM accounts a WHERE a.id = NEW.account_id;
  IF is_crypto IS DISTINCT FROM (NEW.source = 'computed') THEN
    RAISE EXCEPTION 'A crypto account''s values are computed, every other account''s typed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'balance_snapshots_source_by_type', TABLE = 'balance_snapshots';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "balance_snapshots_source_by_type" BEFORE INSERT OR UPDATE OF "source", "account_id" ON "balance_snapshots" FOR EACH ROW EXECUTE FUNCTION balance_snapshots_source_by_type();
