DROP VIEW "public"."transaction_lines";--> statement-breakpoint
ALTER TABLE "receivables" ADD COLUMN "forgiven_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
-- #437: what was let go is an amount. Repaid + let go never exceed the share;
-- a row already repaid past its share can't be fixed for sure, so stop with a count.
DO $$
DECLARE over_repaid bigint;
BEGIN
  SELECT count(*) INTO over_repaid FROM "receivables" r
  WHERE r."amount_cents" < (SELECT coalesce(sum(p."amount_cents"), 0) FROM "receivable_payments" p WHERE p."receivable_id" = r."id");
  IF over_repaid > 0 THEN
    RAISE EXCEPTION 'finances: % receivable(s) repaid past their share, fix them before migrating (#437)', over_repaid;
  END IF;
END $$;--> statement-breakpoint
-- An item let go before keeps its meaning: let go = the share − what was repaid then.
UPDATE "receivables" r SET "forgiven_cents" = r."amount_cents" - (SELECT coalesce(sum(p."amount_cents"), 0) FROM "receivable_payments" p WHERE p."receivable_id" = r."id")
WHERE r."forgiven_at" IS NOT NULL;--> statement-breakpoint
-- Let go once fully repaid: nothing was let go (it counted as repaid already).
UPDATE "receivables" SET "forgiven_at" = NULL, "forgiven_note" = NULL WHERE "forgiven_at" IS NOT NULL AND "forgiven_cents" = 0;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_forgiven_within_share" CHECK ("receivables"."forgiven_cents" >= 0 and "receivables"."forgiven_cents" <= "receivables"."amount_cents");--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_forgiven_dated" CHECK (("receivables"."forgiven_cents" > 0) = ("receivables"."forgiven_at" is not null));--> statement-breakpoint
CREATE VIEW "public"."transaction_lines" AS (select t.id, s.id as split_id, t.account_id, t.import_id, t.booking_date, ((case when s.id is null then t.amount_cents else s.amount_cents end) + coalesce(ra.adjust_cents, 0) + (case when (case when s.id is null then t.amount_cents else s.amount_cents end) < 0 then 1 else -1 end) * coalesce(pa.settled_cents, 0))::bigint as amount_cents, case when s.id is null then t.amount_cents else s.amount_cents end as gross_amount_cents, t.raw_label, t.merchant, coalesce(lc.kind, t.kind) as kind, coalesce(s.category_id, t.category_id) as category_id, t.needs_review, (t.is_one_off or t.prepaid_item_id is not null) as is_one_off, t.manual, t.prepaid_item_id, t.paid_by_contact_id from transactions t left join transaction_splits s on s.transaction_id = t.id left join categories lc on lc.id = coalesce(s.category_id, t.category_id) left join (select r.transaction_id, r.split_id, sum(case when r.direction = 'owed_to_me' then r.amount_cents - r.forgiven_cents else r.forgiven_cents end) as adjust_cents from receivables r group by r.transaction_id, r.split_id) ra on ra.transaction_id = t.id and coalesce(ra.split_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(s.id, '00000000-0000-0000-0000-000000000000'::uuid) left join (select transaction_id, split_id, sum(amount_cents) as settled_cents from receivable_payments where transaction_id is not null group by transaction_id, split_id) pa on pa.transaction_id = t.id and coalesce(pa.split_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(s.id, '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
-- #437: repaid + let go never exceed the share, whichever side is written.
-- The item is locked so two repayments at once can't both pass.
CREATE FUNCTION "receivables_settled_within_share"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  item_id uuid;
  share bigint;
  forgiven bigint;
  paid bigint;
BEGIN
  IF TG_TABLE_NAME = 'receivables' THEN
    item_id := NEW."id";
  ELSE
    item_id := NEW."receivable_id";
  END IF;
  SELECT "amount_cents", "forgiven_cents" INTO share, forgiven
  FROM "receivables" WHERE "id" = item_id FOR UPDATE;
  SELECT coalesce(sum("amount_cents"), 0) INTO paid
  FROM "receivable_payments" WHERE "receivable_id" = item_id;
  IF paid + forgiven > share THEN
    RAISE EXCEPTION 'What was repaid and let go exceeds the share'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'receivables_settled_within_share';
  END IF;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE TRIGGER "receivables_settled_within_share"
AFTER INSERT OR UPDATE OF "amount_cents", "forgiven_cents" ON "receivables"
FOR EACH ROW EXECUTE FUNCTION "receivables_settled_within_share"();--> statement-breakpoint
CREATE TRIGGER "receivable_payments_within_share"
AFTER INSERT OR UPDATE OF "amount_cents", "receivable_id" ON "receivable_payments"
FOR EACH ROW EXECUTE FUNCTION "receivables_settled_within_share"();
