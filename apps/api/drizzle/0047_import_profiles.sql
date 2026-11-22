-- #431: CSV import profiles (ADR 0007). A profile's column mapping names
-- only fields of its target and columns of its own header, each column once,
-- with the fields its target needs; kind values map to the standard kinds.
CREATE FUNCTION "import_profile_columns_valid"(target text, columns jsonb, headers text[]) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  allowed text[];
  field text;
  header jsonb;
  seen text[] := '{}';
BEGIN
  IF jsonb_typeof(columns) <> 'object' THEN
    RETURN false;
  END IF;
  allowed := CASE target
    WHEN 'cash' THEN ARRAY['date', 'valueDate', 'label', 'amount', 'debit', 'credit', 'balance']
    WHEN 'investment' THEN ARRAY['date', 'kind', 'isin', 'asset', 'quantity', 'price', 'fees', 'amount', 'label']
  END;
  IF allowed IS NULL THEN
    RETURN false;
  END IF;
  FOR field, header IN SELECT key, value FROM jsonb_each(columns) LOOP
    IF NOT (field = ANY (allowed))
      OR jsonb_typeof(header) <> 'string'
      OR NOT ((header #>> '{}') = ANY (headers))
      OR (header #>> '{}') = ANY (seen)
    THEN
      RETURN false;
    END IF;
    seen := seen || (header #>> '{}');
  END LOOP;
  IF target = 'cash' THEN
    RETURN columns ? 'date' AND columns ? 'label'
      AND ((columns ? 'amount' AND NOT columns ? 'debit' AND NOT columns ? 'credit')
        OR (NOT columns ? 'amount' AND columns ? 'debit' AND columns ? 'credit'));
  END IF;
  RETURN columns ? 'date' AND columns ? 'kind' AND columns ? 'amount';
END $$;--> statement-breakpoint
CREATE FUNCTION "import_profile_kind_values_valid"(kind_values jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT jsonb_typeof(kind_values) = 'object'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_each(kind_values) AS e(key, value)
      WHERE jsonb_typeof(e.value) <> 'string'
        OR NOT ((e.value #>> '{}') = ANY (ARRAY['buy', 'sell', 'deposit', 'withdrawal', 'dividend', 'interest', 'fee', 'tax']))
    )
$$;--> statement-breakpoint
CREATE TYPE "public"."import_profile_target" AS ENUM('cash', 'investment');--> statement-breakpoint
ALTER TYPE "public"."import_source" ADD VALUE 'standard_csv';--> statement-breakpoint
ALTER TYPE "public"."import_source" ADD VALUE 'csv_profile';--> statement-breakpoint
CREATE TABLE "import_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar(100) NOT NULL,
	"target" "import_profile_target" NOT NULL,
	"encoding" varchar(20) NOT NULL,
	"delimiter" varchar(1) NOT NULL,
	"decimal_separator" varchar(1) NOT NULL,
	"date_format" varchar(10) NOT NULL,
	"headers" text[] NOT NULL,
	"columns" jsonb NOT NULL,
	"kind_values" jsonb,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "import_profiles_header_unique" UNIQUE("delimiter","headers"),
	CONSTRAINT "import_profiles_name_not_blank" CHECK (btrim("import_profiles"."name") <> ''),
	CONSTRAINT "import_profiles_encoding_known" CHECK ("import_profiles"."encoding" IN ('utf-8', 'windows-1252')),
	CONSTRAINT "import_profiles_delimiter_known" CHECK ("import_profiles"."delimiter" IN (chr(59), ',', chr(9))),
	CONSTRAINT "import_profiles_decimal_separator_known" CHECK ("import_profiles"."decimal_separator" IN (',', '.')),
	CONSTRAINT "import_profiles_date_format_known" CHECK ("import_profiles"."date_format" IN ('yyyy-mm-dd', 'dd/mm/yyyy', 'dd-mm-yyyy', 'dd.mm.yyyy', 'dd/mm/yy', 'mm/dd/yyyy')),
	CONSTRAINT "import_profiles_headers_size" CHECK (cardinality("import_profiles"."headers") BETWEEN 1 AND 200),
	CONSTRAINT "import_profiles_columns_valid" CHECK (import_profile_columns_valid("import_profiles"."target"::text, "import_profiles"."columns", "import_profiles"."headers")),
	CONSTRAINT "import_profiles_kind_values_valid" CHECK ("import_profiles"."kind_values" IS NULL OR ("import_profiles"."target" = 'investment' AND import_profile_kind_values_valid("import_profiles"."kind_values")))
);
--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "profile_id" uuid;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_profile_id_import_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."import_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "imports_profile_id_index" ON "imports" USING btree ("profile_id");--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_profile_source" CHECK ("imports"."profile_id" IS NULL OR "imports"."source"::text = 'csv_profile');--> statement-breakpoint
CREATE TRIGGER "import_profiles_set_updated_at" BEFORE UPDATE ON "import_profiles" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
