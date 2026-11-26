-- #495: an element's chosen accounts keep their order (« Mon ordre »).
-- Rows saved before take the order they were created in, which is certain.
ALTER TABLE "dashboard_widget_accounts" ADD COLUMN "position" integer;--> statement-breakpoint
UPDATE "dashboard_widget_accounts" AS a SET "position" = o.rank
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "widget_id" ORDER BY "created_at", "id") - 1 AS rank
  FROM "dashboard_widget_accounts"
) AS o
WHERE a."id" = o."id";--> statement-breakpoint
ALTER TABLE "dashboard_widget_accounts" ALTER COLUMN "position" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dashboard_widget_accounts" ADD CONSTRAINT "dashboard_widget_accounts_position_unique" UNIQUE("widget_id","position");--> statement-breakpoint
ALTER TABLE "dashboard_widget_accounts" ADD CONSTRAINT "dashboard_widget_accounts_position" CHECK ("dashboard_widget_accounts"."position" >= 0);
