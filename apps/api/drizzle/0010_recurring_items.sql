CREATE TYPE "public"."recurring_amount_type" AS ENUM('fixed', 'variable');--> statement-breakpoint
CREATE TYPE "public"."recurring_cadence" AS ENUM('weekly', 'monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."recurring_direction" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."recurring_status" AS ENUM('suggested', 'confirmed', 'dismissed');--> statement-breakpoint
CREATE TABLE "recurring_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"account_id" uuid NOT NULL,
	"merchant_key" varchar(255) NOT NULL,
	"direction" "recurring_direction" NOT NULL,
	"name" varchar(255) NOT NULL,
	"category_id" uuid,
	"status" "recurring_status" DEFAULT 'suggested' NOT NULL,
	"is_fixed_cost" boolean NOT NULL,
	"cadence" "recurring_cadence" NOT NULL,
	"cadence_override" "recurring_cadence",
	"amount_type" "recurring_amount_type" NOT NULL,
	"typical_amount_cents" bigint NOT NULL,
	"confidence" real NOT NULL,
	"last_seen_date" date NOT NULL,
	"next_expected_date" date,
	"notes" text,
	CONSTRAINT "recurring_items_account_merchant_direction_unique" UNIQUE("account_id","merchant_key","direction"),
	CONSTRAINT "recurring_items_typical_amount_positive" CHECK ("recurring_items"."typical_amount_cents" >= 0),
	CONSTRAINT "recurring_items_confidence_range" CHECK ("recurring_items"."confidence" >= 0 and "recurring_items"."confidence" <= 1)
);
--> statement-breakpoint
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_items_status_index" ON "recurring_items" USING btree ("status");