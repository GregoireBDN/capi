-- #439: a prepaid term belongs to a confirmed item. An item left for another
-- status loses it (the fix is certain: leaving `confirmed` now clears it), and
-- its payments are unlinked, as clearing the term does.
UPDATE "transactions" SET "prepaid_item_id" = NULL
WHERE "prepaid_item_id" IN (
  SELECT "id" FROM "recurring_items"
  WHERE "term_months" IS NOT NULL AND "status" <> 'confirmed'
);--> statement-breakpoint
UPDATE "recurring_items" SET "term_months" = NULL, "renewal_kept_on" = NULL
WHERE "term_months" IS NOT NULL AND "status" <> 'confirmed';--> statement-breakpoint
-- A confirmed debit series charged every quarter or year is prepaid for 3 or
-- 12 months (#439). Its charges are linked as its payments by the next
-- detection run (merchant keys are computed by the app, not here).
UPDATE "recurring_items"
SET "term_months" = CASE coalesce("cadence_override", "cadence")
    WHEN 'quarterly' THEN 3 ELSE 12 END,
  "renewal_kept_on" = NULL
WHERE "status" = 'confirmed' AND "direction" = 'debit'
  AND "term_months" IS NULL
  AND coalesce("cadence_override", "cadence") IN ('quarterly', 'yearly');--> statement-breakpoint
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_term_only_confirmed" CHECK ("recurring_items"."term_months" is null or "recurring_items"."status" = 'confirmed');
