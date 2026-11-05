CREATE TYPE "public"."account_type" AS ENUM('checking', 'savings', 'brokerage', 'life_insurance', 'employee_savings', 'crypto');--> statement-breakpoint
CREATE TYPE "public"."rule_match_type" AS ENUM('contains', 'regex');--> statement-breakpoint
CREATE TYPE "public"."transaction_kind" AS ENUM('expense', 'income', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."import_source" AS ENUM('cic_csv', 'spreadsheet');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" "account_type" NOT NULL,
	"institution" varchar(100),
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "balance_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"account_id" uuid NOT NULL,
	"date" date NOT NULL,
	"value_cents" bigint NOT NULL,
	"contributions_cents" bigint,
	"note" text,
	CONSTRAINT "balance_snapshots_account_date_unique" UNIQUE("account_id","date")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(100) NOT NULL,
	"kind" "transaction_kind" NOT NULL,
	"color" varchar(16),
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "categorization_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"position" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"match_type" "rule_match_type" DEFAULT 'contains' NOT NULL,
	"label_pattern" varchar(255) NOT NULL,
	"account_id" uuid,
	"min_amount_cents" bigint,
	"max_amount_cents" bigint,
	"category_id" uuid NOT NULL,
	"kind" "transaction_kind",
	"merchant" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"account_id" uuid NOT NULL,
	"source" "import_source" NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_hash" varchar(64) NOT NULL,
	"period_start" date,
	"period_end" date,
	"row_count" integer DEFAULT 0 NOT NULL,
	"inserted_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"committed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"account_id" uuid NOT NULL,
	"import_id" uuid,
	"booking_date" date NOT NULL,
	"value_date" date,
	"amount_cents" bigint NOT NULL,
	"balance_after_cents" bigint,
	"raw_label" text NOT NULL,
	"merchant" varchar(255),
	"kind" "transaction_kind" NOT NULL,
	"category_id" uuid,
	"rule_id" uuid,
	"needs_review" boolean DEFAULT false NOT NULL,
	"is_one_off" boolean DEFAULT false NOT NULL,
	"note" text,
	"dedupe_hash" varchar(64) NOT NULL,
	CONSTRAINT "transactions_account_dedupe_hash_unique" UNIQUE("account_id","dedupe_hash")
);
--> statement-breakpoint
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_rule_id_categorization_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."categorization_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "balance_snapshots_date_index" ON "balance_snapshots" USING btree ("date");--> statement-breakpoint
CREATE INDEX "categorization_rules_position_index" ON "categorization_rules" USING btree ("position");--> statement-breakpoint
CREATE INDEX "imports_account_id_index" ON "imports" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "imports_file_hash_index" ON "imports" USING btree ("file_hash");--> statement-breakpoint
CREATE INDEX "transactions_account_id_booking_date_index" ON "transactions" USING btree ("account_id","booking_date");--> statement-breakpoint
CREATE INDEX "transactions_booking_date_index" ON "transactions" USING btree ("booking_date");--> statement-breakpoint
CREATE INDEX "transactions_category_id_index" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "transactions_import_id_index" ON "transactions" USING btree ("import_id");