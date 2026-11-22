ALTER TYPE "public"."crypto_import_format" ADD VALUE 'ledger_live_csv';--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD COLUMN "tx_hash_digest" varchar(64);--> statement-breakpoint
CREATE INDEX "crypto_movements_tx_hash_digest_index" ON "crypto_movements" USING btree ("tx_hash_digest");--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD CONSTRAINT "crypto_movements_tx_hash_digest" CHECK ("crypto_movements"."tx_hash_digest" IS NULL OR ("crypto_movements"."import_id" IS NOT NULL AND "crypto_movements"."tx_hash_digest" ~ '^[0-9a-f]{64}$'));--> statement-breakpoint
-- An exchange's export goes into an exchange account, a Ledger Live history
-- into a wallet (#426). Existing imports are all exchange exports.
DO $$
DECLARE
  bad integer;
BEGIN
  SELECT count(*) INTO bad FROM "crypto_imports" i JOIN "accounts" a ON a."id" = i."account_id"
    WHERE a."crypto_source" IS DISTINCT FROM 'exchange';
  IF bad > 0 THEN
    RAISE EXCEPTION 'crypto_imports: % import(s) not on an exchange account', bad;
  END IF;
END $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION crypto_imports_account_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  source text;
BEGIN
  SELECT "crypto_source"::text INTO source FROM "accounts" WHERE "id" = NEW."account_id";
  IF source IS DISTINCT FROM (CASE WHEN NEW."format"::text = 'ledger_live_csv' THEN 'wallet' ELSE 'exchange' END) THEN
    RAISE EXCEPTION 'A crypto export goes into an account of its source'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'crypto_imports_account_source', TABLE = 'crypto_imports';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "crypto_imports_account_source" BEFORE INSERT OR UPDATE OF "account_id", "format" ON "crypto_imports" FOR EACH ROW EXECUTE FUNCTION crypto_imports_account_source();
