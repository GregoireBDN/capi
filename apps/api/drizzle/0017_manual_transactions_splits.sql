CREATE TABLE "transaction_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "transaction_splits_position_unique" UNIQUE("transaction_id","position")
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "original_amount_cents" bigint;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "original_booking_date" date;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_splits_category_id_index" ON "transaction_splits" USING btree ("category_id");--> statement-breakpoint
CREATE VIEW "public"."transaction_lines" AS (select t.id, s.id as split_id, t.account_id, t.import_id, t.booking_date, case when s.id is null then t.amount_cents else s.amount_cents end as amount_cents, t.raw_label, t.merchant, t.kind, case when s.id is null then t.category_id else s.category_id end as category_id, t.needs_review, t.is_one_off, t.manual from transactions t left join transaction_splits s on s.transaction_id = t.id);