-- #368 (ADR 0005, R1): a categorized transaction always has its category's kind.
-- 1. Rows whose kind differs from their category's go to review with the
--    category's kind (their category is kept); only their count is printed.
DO $$
DECLARE
  mismatched integer;
BEGIN
  UPDATE "transactions" AS t
  SET "kind" = c."kind",
      "needs_review" = true,
      "counterpart_account_id" = CASE WHEN c."kind" = 'transfer' THEN t."counterpart_account_id" END,
      "prepaid_item_id" = CASE WHEN c."kind" = 'expense' THEN t."prepaid_item_id" END,
      "updated_at" = now()
  FROM "categories" AS c
  WHERE c."id" = t."category_id" AND t."kind" <> c."kind";
  GET DIAGNOSTICS mismatched = ROW_COUNT;
  RAISE NOTICE 'finances: % transaction(s) whose kind differed from their category''s put in review (#368)', mismatched;
END $$;--> statement-breakpoint
-- 2. Every write keeps the kind equal to the category's; a kind the category
--    changes drops what that kind no longer allows (a transfer link off a
--    transfer, a prepaid subscription off an expense).
CREATE FUNCTION "transactions_kind_follows_category"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  category_kind "transaction_kind";
BEGIN
  IF NEW."category_id" IS NOT NULL THEN
    SELECT c."kind" INTO category_kind FROM "categories" AS c WHERE c."id" = NEW."category_id";
    IF FOUND AND NEW."kind" IS DISTINCT FROM category_kind THEN
      NEW."kind" := category_kind;
      IF category_kind <> 'transfer' THEN NEW."counterpart_account_id" := NULL; END IF;
      IF category_kind <> 'expense' THEN NEW."prepaid_item_id" := NULL; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "transactions_kind_follows_category"
BEFORE INSERT OR UPDATE OF "category_id", "kind" ON "transactions"
FOR EACH ROW EXECUTE FUNCTION "transactions_kind_follows_category"();--> statement-breakpoint
-- 3. Rules no longer override the kind, and every line counts with its category's.
DROP VIEW "public"."transaction_lines";--> statement-breakpoint
ALTER TABLE "categorization_rules" DROP COLUMN "kind";--> statement-breakpoint
CREATE VIEW "public"."transaction_lines" AS (select t.id, s.id as split_id, t.account_id, t.import_id, t.booking_date, case when s.id is null then t.amount_cents else s.amount_cents end as amount_cents, t.raw_label, t.merchant, coalesce(lc.kind, t.kind) as kind, coalesce(s.category_id, t.category_id) as category_id, t.needs_review, (t.is_one_off or t.prepaid_item_id is not null) as is_one_off, t.manual, t.prepaid_item_id from transactions t left join transaction_splits s on s.transaction_id = t.id left join categories lc on lc.id = coalesce(s.category_id, t.category_id));
