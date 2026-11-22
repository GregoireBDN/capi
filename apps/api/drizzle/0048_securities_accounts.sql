ALTER TYPE "public"."account_type" ADD VALUE 'securities';--> statement-breakpoint
CREATE TABLE "dividends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"account_id" uuid NOT NULL,
	"paid_on" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"security_id" uuid,
	CONSTRAINT "dividends_amount_positive" CHECK ("dividends"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_invested_base_type";--> statement-breakpoint
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_opened_on_type";--> statement-breakpoint
ALTER TABLE "dividends" ADD CONSTRAINT "dividends_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividends" ADD CONSTRAINT "dividends_security_id_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."securities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dividends_account_id_paid_on_index" ON "dividends" USING btree ("account_id","paid_on");--> statement-breakpoint
CREATE INDEX "dividends_security_id_index" ON "dividends" USING btree ("security_id");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_invested_base_type" CHECK ("accounts"."invested_base_cents" IS NULL OR ("accounts"."invested_base_cents" >= 0 AND "accounts"."type"::text IN ('brokerage', 'securities', 'life_insurance', 'employee_savings')));--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_opened_on_type" CHECK ("accounts"."opened_on" IS NULL OR "accounts"."type"::text IN ('brokerage', 'securities', 'life_insurance', 'employee_savings'));--> statement-breakpoint
CREATE TRIGGER "dividends_set_updated_at" BEFORE UPDATE ON "dividends" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- Positions on the account types that hold securities
-- (`POSITION_ACCOUNT_TYPES`): a PEA and a compte-titres (#414). `type::text`:
-- the new enum value can't be used as one before this migration commits.
CREATE OR REPLACE FUNCTION "position_statements_account_type"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  takes boolean;
BEGIN
  SELECT a.type::text IN ('brokerage', 'securities') INTO takes FROM accounts a WHERE a.id = NEW.account_id;
  IF takes IS NOT TRUE THEN
    RAISE EXCEPTION 'Only a PEA or a compte-titres holds security positions'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'position_statements_account_type', TABLE = 'position_statements';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
-- Dividends on a compte-titres only (#414); an account's type never changes.
CREATE FUNCTION "dividends_account_type"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  takes boolean;
BEGIN
  SELECT a.type::text = 'securities' INTO takes FROM accounts a WHERE a.id = NEW.account_id;
  IF takes IS NOT TRUE THEN
    RAISE EXCEPTION 'Only a compte-titres records dividends'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'dividends_account_type', TABLE = 'dividends';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "dividends_account_type" BEFORE INSERT OR UPDATE OF "account_id" ON "dividends" FOR EACH ROW EXECUTE FUNCTION dividends_account_type();
