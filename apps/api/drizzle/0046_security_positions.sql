-- ADR 0006 (#413): an ISIN is 2 letters, 9 letters or digits and a check
-- digit; letters count as A = 10 … Z = 35 and the Luhn sum must end in 0.
-- The country prefix is not checked (synthetic fixtures use `ZZ`).
CREATE FUNCTION "isin_is_valid"(isin text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  digits text := '';
  c text;
  d int;
  total int := 0;
  double boolean := true;
BEGIN
  IF isin !~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$' THEN
    RETURN false;
  END IF;
  FOR i IN 1..11 LOOP
    c := substr(isin, i, 1);
    IF c ~ '[0-9]' THEN
      digits := digits || c;
    ELSE
      digits := digits || (ascii(c) - 55)::text;
    END IF;
  END LOOP;
  FOR i IN REVERSE length(digits)..1 LOOP
    d := substr(digits, i, 1)::int;
    IF double THEN
      d := d * 2;
      IF d > 9 THEN d := d - 9; END IF;
    END IF;
    total := total + d;
    double := NOT double;
  END LOOP;
  RETURN (10 - total % 10) % 10 = substr(isin, 12, 1)::int;
END $$;--> statement-breakpoint
CREATE TYPE "public"."position_statement_source" AS ENUM('typed', 'mcp');--> statement-breakpoint
CREATE TYPE "public"."security_price_source" AS ENUM('manual', 'statement', 'provider');--> statement-breakpoint
CREATE TABLE "position_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"statement_id" uuid NOT NULL,
	"security_id" uuid NOT NULL,
	"quantity" numeric(38, 18) NOT NULL,
	"unit_cost_eur" numeric(38, 12),
	CONSTRAINT "position_lines_statement_security_unique" UNIQUE("statement_id","security_id"),
	CONSTRAINT "position_lines_quantity_positive" CHECK ("position_lines"."quantity" > 0),
	CONSTRAINT "position_lines_unit_cost_non_negative" CHECK ("position_lines"."unit_cost_eur" IS NULL OR "position_lines"."unit_cost_eur" >= 0)
);
--> statement-breakpoint
CREATE TABLE "position_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"account_id" uuid NOT NULL,
	"as_of" date NOT NULL,
	"cash_cents" bigint DEFAULT 0 NOT NULL,
	"source" "position_statement_source" NOT NULL,
	CONSTRAINT "position_statements_account_day_unique" UNIQUE("account_id","as_of"),
	CONSTRAINT "position_statements_cash_non_negative" CHECK ("position_statements"."cash_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "securities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"isin" char(12) NOT NULL,
	"name" varchar(200) NOT NULL,
	"ticker" varchar(20),
	"exchange" varchar(10),
	CONSTRAINT "securities_isin_unique" UNIQUE("isin"),
	CONSTRAINT "securities_isin_valid" CHECK (isin_is_valid("securities"."isin")),
	CONSTRAINT "securities_name_not_blank" CHECK (btrim("securities"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "security_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"security_id" uuid NOT NULL,
	"day" date NOT NULL,
	"price_eur" numeric(38, 12) NOT NULL,
	"source" "security_price_source" NOT NULL,
	CONSTRAINT "security_prices_security_day_unique" UNIQUE("security_id","day"),
	CONSTRAINT "security_prices_positive" CHECK ("security_prices"."price_eur" > 0)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "opened_on" date;--> statement-breakpoint
ALTER TABLE "position_lines" ADD CONSTRAINT "position_lines_statement_id_position_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."position_statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_lines" ADD CONSTRAINT "position_lines_security_id_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."securities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_statements" ADD CONSTRAINT "position_statements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_prices" ADD CONSTRAINT "security_prices_security_id_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."securities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "position_lines_security_id_index" ON "position_lines" USING btree ("security_id");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_opened_on_type" CHECK ("accounts"."opened_on" IS NULL OR "accounts"."type" IN ('brokerage', 'life_insurance', 'employee_savings'));--> statement-breakpoint
CREATE TRIGGER "securities_set_updated_at" BEFORE UPDATE ON "securities" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER "security_prices_set_updated_at" BEFORE UPDATE ON "security_prices" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER "position_statements_set_updated_at" BEFORE UPDATE ON "position_statements" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER "position_lines_set_updated_at" BEFORE UPDATE ON "position_lines" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- Positions only on the account types that hold securities
-- (`POSITION_ACCOUNT_TYPES`): a PEA now, a compte-titres next (#414).
CREATE FUNCTION "position_statements_account_type"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  takes boolean;
BEGIN
  SELECT a.type IN ('brokerage') INTO takes FROM accounts a WHERE a.id = NEW.account_id;
  IF takes IS NOT TRUE THEN
    RAISE EXCEPTION 'Only a PEA holds security positions'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'position_statements_account_type', TABLE = 'position_statements';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "position_statements_account_type" BEFORE INSERT OR UPDATE OF "account_id" ON "position_statements" FOR EACH ROW EXECUTE FUNCTION position_statements_account_type();--> statement-breakpoint
-- A crypto account's values are computed by its daily close (#366); an
-- account holding positions has computed values too, from its priced lines,
-- only on days its statements cover (ADR 0006); every other value is typed.
CREATE OR REPLACE FUNCTION balance_snapshots_source_by_type() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  account_type account_type;
BEGIN
  SELECT a.type INTO account_type FROM accounts a WHERE a.id = NEW.account_id;
  IF account_type = 'crypto' THEN
    IF NEW.source <> 'computed' THEN
      RAISE EXCEPTION 'A crypto account''s values are computed, every other account''s typed'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'balance_snapshots_source_by_type', TABLE = 'balance_snapshots';
    END IF;
  ELSIF NEW.source = 'computed' AND NOT EXISTS (
    SELECT 1 FROM position_statements p WHERE p.account_id = NEW.account_id AND p.as_of <= NEW.date
  ) THEN
    RAISE EXCEPTION 'Only a crypto account or an account valued by its lines has computed values'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'balance_snapshots_source_by_type', TABLE = 'balance_snapshots';
  END IF;
  RETURN NEW;
END $$;
