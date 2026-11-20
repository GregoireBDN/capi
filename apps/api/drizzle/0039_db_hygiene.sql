-- #367, ADR 0005 R3 (constraints), R4 (bank values as columns), R7 (time
-- stamps with time zone, updated_at by the database). Every rule below is
-- preceded by its unambiguous data fix; a row that breaks a rule without one
-- stops the migration with a count (never the rows).

-- R7 guard: the `timestamp` columns hold UTC wall-clock times only if the
-- server wrote its defaults (`now()`) in UTC.
DO $$
BEGIN
  IF current_setting('TimeZone') NOT IN ('UTC', 'Etc/UTC', 'GMT', 'Etc/GMT', 'UCT', 'Etc/UCT', 'Universal', 'Etc/Universal', 'Zulu', 'Etc/Zulu') THEN
    RAISE EXCEPTION 'Migration 0039 needs the server time zone to be UTC (TimeZone is %): the timestamp columns would be shifted', current_setting('TimeZone');
  END IF;
END $$;--> statement-breakpoint

-- R3: unambiguous fixes.
-- A link to another account belongs to transfers, a prepaid payment to expenses
-- (the API clears them on any change of kind).
UPDATE "transactions" SET "counterpart_account_id" = NULL WHERE "counterpart_account_id" IS NOT NULL AND "kind" <> 'transfer';--> statement-breakpoint
UPDATE "transactions" SET "prepaid_item_id" = NULL WHERE "prepaid_item_id" IS NOT NULL AND "kind" <> 'expense';--> statement-breakpoint
-- A cancellation is read on confirmed items only.
UPDATE "recurring_items" SET "ended_on" = NULL WHERE "ended_on" IS NOT NULL AND "status" <> 'confirmed';--> statement-breakpoint
-- Sync times mean nothing on a non-crypto account.
UPDATE "accounts" SET "crypto_synced_at" = NULL, "crypto_sync_failed_at" = NULL WHERE "type" <> 'crypto' AND ("crypto_synced_at" IS NOT NULL OR "crypto_sync_failed_at" IS NOT NULL);--> statement-breakpoint
-- A goal's typed amount is read for manual goals only (null reads as 0).
UPDATE "savings_goals" SET "manual_amount_cents" = NULL WHERE "source" <> 'manual' AND "manual_amount_cents" IS NOT NULL;--> statement-breakpoint
UPDATE "savings_goals" SET "manual_amount_cents" = 0 WHERE "source" = 'manual' AND "manual_amount_cents" IS NULL;--> statement-breakpoint
-- Unknown ticked steps are ignored by the month close.
UPDATE "month_closes" SET "acknowledged" = array(SELECT s FROM unnest("acknowledged") AS s WHERE s IN ('recurring', 'budget', 'savings')) WHERE NOT ("acknowledged" <@ array['recurring', 'budget', 'savings']::text[]);--> statement-breakpoint
-- A committed exchange import keeps its movements, not its preview.
ALTER TABLE "crypto_imports" ALTER COLUMN "preview" DROP NOT NULL;--> statement-breakpoint
UPDATE "crypto_imports" SET "preview" = NULL WHERE "committed_at" IS NOT NULL;--> statement-breakpoint

-- R3: the rules without a certain fix stop the migration with a count.
DO $$
DECLARE
  manual_import bigint;
  manual_hash bigint;
  manual_correction bigint;
  credit_term bigint;
BEGIN
  SELECT count(*) INTO manual_import FROM "transactions" WHERE "manual" <> ("import_id" IS NULL);
  SELECT count(*) INTO manual_hash FROM "transactions" WHERE "manual" <> ("dedupe_hash" LIKE 'manual:%');
  SELECT count(*) INTO manual_correction FROM "transactions" WHERE "manual" AND ("original_amount_cents" IS NOT NULL OR "original_booking_date" IS NOT NULL);
  SELECT count(*) INTO credit_term FROM "recurring_items" WHERE "term_months" IS NOT NULL AND "direction" <> 'debit';
  IF manual_import + manual_hash + manual_correction + credit_term > 0 THEN
    RAISE EXCEPTION 'Migration 0039: rows break a new rule (transactions manual <> no import: %, manual <> manual: hash: %, manual with a bank correction: %; recurring credits with a prepaid term: %); fix them by hand, then migrate again',
      manual_import, manual_hash, manual_correction, credit_term;
  END IF;
END $$;--> statement-breakpoint

-- R7: every `timestamp` column becomes `timestamptz`, its value read as UTC.
DO $$
DECLARE
  col record;
BEGIN
  FOR col IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.data_type = 'timestamp without time zone'
    ORDER BY c.table_name, c.column_name
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DATA TYPE timestamp with time zone USING %I AT TIME ZONE ''UTC''', col.table_name, col.column_name, col.column_name);
  END LOOP;
END $$;--> statement-breakpoint

-- R7: `updated_at` is maintained by the database, raw SQL updates included.
-- An update that sets it itself (Drizzle's `$onUpdate`, a fixed `now` in a
-- service) keeps its value.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
DO $$
DECLARE
  tbl record;
BEGIN
  FOR tbl IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.column_name = 'updated_at'
    ORDER BY c.table_name
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', tbl.table_name || '_set_updated_at', tbl.table_name);
  END LOOP;
END $$;--> statement-breakpoint

-- R4: the bank's amount and date as columns, and the index of bank data.
ALTER TABLE "transactions" ADD COLUMN "bank_amount_cents" bigint GENERATED ALWAYS AS (coalesce(original_amount_cents, amount_cents)) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "bank_booking_date" date GENERATED ALWAYS AS (coalesce(original_booking_date, booking_date)) STORED NOT NULL;--> statement-breakpoint
CREATE INDEX "transactions_account_bank_booking_date_idx" ON "transactions" USING btree ("account_id","bank_booking_date") WHERE not "transactions"."manual";--> statement-breakpoint
CREATE INDEX "transactions_needs_review_idx" ON "transactions" USING btree ("booking_date") WHERE "transactions"."needs_review";--> statement-breakpoint

-- R3: imports and exchange imports go with their account the same way: the
-- account deletion deletes them explicitly (#297).
ALTER TABLE "crypto_imports" DROP CONSTRAINT "crypto_imports_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "crypto_imports" ADD CONSTRAINT "crypto_imports_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- R3: the rules.
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_crypto_sync_only_crypto" CHECK ("accounts"."type" = 'crypto' or ("accounts"."crypto_synced_at" is null and "accounts"."crypto_sync_failed_at" is null));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_manual_iff_no_import" CHECK ("transactions"."manual" = ("transactions"."import_id" is null));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_manual_iff_manual_hash" CHECK ("transactions"."manual" = ("transactions"."dedupe_hash" like 'manual:%'));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_counterpart_only_on_transfers" CHECK ("transactions"."counterpart_account_id" is null or "transactions"."kind" = 'transfer');--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_prepaid_only_on_expenses" CHECK ("transactions"."prepaid_item_id" is null or "transactions"."kind" = 'expense');--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_correction_only_on_bank_rows" CHECK (not "transactions"."manual" or ("transactions"."original_amount_cents" is null and "transactions"."original_booking_date" is null));--> statement-breakpoint
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_ended_only_confirmed" CHECK ("recurring_items"."ended_on" is null or "recurring_items"."status" = 'confirmed');--> statement-breakpoint
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_term_only_debit" CHECK ("recurring_items"."term_months" is null or "recurring_items"."direction" = 'debit');--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_manual_amount_iff_manual" CHECK (("savings_goals"."source" = 'manual') = ("savings_goals"."manual_amount_cents" is not null));--> statement-breakpoint
ALTER TABLE "month_closes" ADD CONSTRAINT "month_closes_acknowledged_steps" CHECK ("month_closes"."acknowledged" <@ array['recurring', 'budget', 'savings']::text[]);
