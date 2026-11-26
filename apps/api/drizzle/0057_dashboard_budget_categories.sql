CREATE TABLE "dashboard_widget_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"widget_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "dashboard_widget_categories_unique" UNIQUE("widget_id","category_id"),
	CONSTRAINT "dashboard_widget_categories_position_unique" UNIQUE("widget_id","position"),
	CONSTRAINT "dashboard_widget_categories_position" CHECK ("dashboard_widget_categories"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD COLUMN "categories_chosen" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dashboard_widget_categories" ADD CONSTRAINT "dashboard_widget_categories_widget_id_dashboard_widgets_id_fk" FOREIGN KEY ("widget_id") REFERENCES "public"."dashboard_widgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_widget_categories" ADD CONSTRAINT "dashboard_widget_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dashboard_widget_categories_category_id_index" ON "dashboard_widget_categories" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_categories_chosen_type" CHECK (not "dashboard_widgets"."categories_chosen" or "dashboard_widgets"."type" = 'tracked_budgets');--> statement-breakpoint
CREATE TRIGGER "dashboard_widget_categories_set_updated_at" BEFORE UPDATE ON "dashboard_widget_categories" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- #495: « Budgets suivis » names categories only while it shows chosen ones,
-- and only expense categories (a budget line to follow).
CREATE OR REPLACE FUNCTION "dashboard_widget_choice_rows"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  chosen boolean;
BEGIN
  IF TG_TABLE_NAME = 'dashboard_widget_accounts' THEN
    SELECT "accounts_chosen" INTO chosen FROM "dashboard_widgets" WHERE "id" = NEW."widget_id";
    IF chosen IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Accounts are named only on an element showing chosen accounts'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'dashboard_widget_accounts_chosen';
    END IF;
  ELSIF TG_TABLE_NAME = 'dashboard_widget_categories' THEN
    SELECT "categories_chosen" INTO chosen FROM "dashboard_widgets" WHERE "id" = NEW."widget_id";
    IF chosen IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Categories are named only on an element showing chosen categories'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'dashboard_widget_categories_chosen';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "categories" WHERE "id" = NEW."category_id" AND "kind" = 'expense') THEN
      RAISE EXCEPTION 'Only an expense category has a budget to follow'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'dashboard_widget_categories_expense';
    END IF;
  ELSE
    SELECT "envelopes_chosen" INTO chosen FROM "dashboard_widgets" WHERE "id" = NEW."widget_id";
    IF chosen IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Envelopes are named only on an element showing chosen envelopes'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'dashboard_widget_envelopes_chosen';
    END IF;
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "dashboard_widget_categories_chosen"
BEFORE INSERT OR UPDATE OF "widget_id", "category_id" ON "dashboard_widget_categories"
FOR EACH ROW EXECUTE FUNCTION "dashboard_widget_choice_rows"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "dashboard_widgets_choice_cleared"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."accounts_chosen" AND NOT NEW."accounts_chosen"
    AND EXISTS (SELECT 1 FROM "dashboard_widget_accounts" WHERE "widget_id" = NEW."id") THEN
    RAISE EXCEPTION 'Clear the chosen accounts when showing them all'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'dashboard_widget_accounts_chosen';
  END IF;
  IF OLD."envelopes_chosen" AND NOT NEW."envelopes_chosen"
    AND EXISTS (SELECT 1 FROM "dashboard_widget_envelopes" WHERE "widget_id" = NEW."id") THEN
    RAISE EXCEPTION 'Clear the chosen envelopes when showing them all'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'dashboard_widget_envelopes_chosen';
  END IF;
  IF OLD."categories_chosen" AND NOT NEW."categories_chosen"
    AND EXISTS (SELECT 1 FROM "dashboard_widget_categories" WHERE "widget_id" = NEW."id") THEN
    RAISE EXCEPTION 'Clear the chosen categories when showing the tracked ones'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'dashboard_widget_categories_chosen';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
DROP TRIGGER "dashboard_widgets_choice_cleared" ON "dashboard_widgets";--> statement-breakpoint
CREATE TRIGGER "dashboard_widgets_choice_cleared"
AFTER UPDATE OF "accounts_chosen", "envelopes_chosen", "categories_chosen" ON "dashboard_widgets"
FOR EACH ROW EXECUTE FUNCTION "dashboard_widgets_choice_cleared"();--> statement-breakpoint
-- A category that stops being an expense leaves « Budgets suivis » in the
-- same write (it has no budget to follow any more).
CREATE FUNCTION "categories_leave_dashboard_budgets"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."kind" <> 'expense' THEN
    DELETE FROM "dashboard_widget_categories" WHERE "category_id" = NEW."id";
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "categories_leave_dashboard_budgets"
AFTER UPDATE OF "kind" ON "categories"
FOR EACH ROW EXECUTE FUNCTION "categories_leave_dashboard_budgets"();
