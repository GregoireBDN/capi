CREATE TYPE "public"."dashboard_widget_size" AS ENUM('small', 'large');--> statement-breakpoint
CREATE TYPE "public"."dashboard_widget_type" AS ENUM('todo', 'left_to_spend', 'forecast', 'net_worth', 'tracked_budgets', 'balances', 'owed', 'upcoming_debits', 'month_flows', 'envelopes', 'investments');--> statement-breakpoint
CREATE TABLE "dashboard_widget_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"widget_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	CONSTRAINT "dashboard_widget_accounts_unique" UNIQUE("widget_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "dashboard_widget_envelopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"widget_id" uuid NOT NULL,
	"envelope_id" uuid NOT NULL,
	CONSTRAINT "dashboard_widget_envelopes_unique" UNIQUE("widget_id","envelope_id")
);
--> statement-breakpoint
CREATE TABLE "dashboard_widgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" "dashboard_widget_type" NOT NULL,
	"position" integer NOT NULL,
	"size" "dashboard_widget_size" NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"accounts_chosen" boolean DEFAULT false NOT NULL,
	"envelopes_chosen" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "dashboard_widgets_type_unique" UNIQUE("type"),
	CONSTRAINT "dashboard_widgets_position_unique" UNIQUE("position"),
	CONSTRAINT "dashboard_widgets_position_positive" CHECK ("dashboard_widgets"."position" >= 0),
	CONSTRAINT "dashboard_widgets_settings_object" CHECK (jsonb_typeof("dashboard_widgets"."settings") = 'object'),
	CONSTRAINT "dashboard_widgets_accounts_chosen_type" CHECK (not "dashboard_widgets"."accounts_chosen" or "dashboard_widgets"."type" in ('forecast', 'net_worth', 'balances', 'upcoming_debits', 'investments')),
	CONSTRAINT "dashboard_widgets_envelopes_chosen_type" CHECK (not "dashboard_widgets"."envelopes_chosen" or "dashboard_widgets"."type" = 'envelopes')
);
--> statement-breakpoint
ALTER TABLE "dashboard_widget_accounts" ADD CONSTRAINT "dashboard_widget_accounts_widget_id_dashboard_widgets_id_fk" FOREIGN KEY ("widget_id") REFERENCES "public"."dashboard_widgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_widget_accounts" ADD CONSTRAINT "dashboard_widget_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_widget_envelopes" ADD CONSTRAINT "dashboard_widget_envelopes_widget_id_dashboard_widgets_id_fk" FOREIGN KEY ("widget_id") REFERENCES "public"."dashboard_widgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_widget_envelopes" ADD CONSTRAINT "dashboard_widget_envelopes_envelope_id_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."envelopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dashboard_widget_accounts_account_id_index" ON "dashboard_widget_accounts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "dashboard_widget_envelopes_envelope_id_index" ON "dashboard_widget_envelopes" USING btree ("envelope_id");--> statement-breakpoint
CREATE TRIGGER "dashboard_widgets_set_updated_at" BEFORE UPDATE ON "dashboard_widgets" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER "dashboard_widget_accounts_set_updated_at" BEFORE UPDATE ON "dashboard_widget_accounts" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER "dashboard_widget_envelopes_set_updated_at" BEFORE UPDATE ON "dashboard_widget_envelopes" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- #495: an element names accounts (envelopes) only while it shows the chosen
-- ones; going back to « tous » clears them in the same write.
CREATE FUNCTION "dashboard_widget_choice_rows"() RETURNS trigger
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
  ELSE
    SELECT "envelopes_chosen" INTO chosen FROM "dashboard_widgets" WHERE "id" = NEW."widget_id";
    IF chosen IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Envelopes are named only on an element showing chosen envelopes'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'dashboard_widget_envelopes_chosen';
    END IF;
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "dashboard_widget_accounts_chosen"
BEFORE INSERT OR UPDATE OF "widget_id" ON "dashboard_widget_accounts"
FOR EACH ROW EXECUTE FUNCTION "dashboard_widget_choice_rows"();--> statement-breakpoint
CREATE TRIGGER "dashboard_widget_envelopes_chosen"
BEFORE INSERT OR UPDATE OF "widget_id" ON "dashboard_widget_envelopes"
FOR EACH ROW EXECUTE FUNCTION "dashboard_widget_choice_rows"();--> statement-breakpoint
CREATE FUNCTION "dashboard_widgets_choice_cleared"() RETURNS trigger
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
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "dashboard_widgets_choice_cleared"
AFTER UPDATE OF "accounts_chosen", "envelopes_chosen" ON "dashboard_widgets"
FOR EACH ROW EXECUTE FUNCTION "dashboard_widgets_choice_cleared"();
