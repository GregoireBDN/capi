CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"category_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"monthly_target_cents" integer,
	"note" text,
	CONSTRAINT "budgets_category_effective_from_unique" UNIQUE("category_id","effective_from"),
	CONSTRAINT "budgets_effective_from_first_of_month" CHECK (extract(day from "budgets"."effective_from") = 1),
	CONSTRAINT "budgets_monthly_target_positive" CHECK ("budgets"."monthly_target_cents" is null or "budgets"."monthly_target_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budgets_effective_from_index" ON "budgets" USING btree ("effective_from");