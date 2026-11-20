CREATE TYPE "public"."receivable_direction" AS ENUM('owed_to_me', 'i_owe');--> statement-breakpoint
CREATE TYPE "public"."receivable_origin" AS ENUM('manual', 'recurring');--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar(60) NOT NULL,
	"match_labels" text[] DEFAULT '{}'::text[] NOT NULL,
	"repayment_day" smallint,
	"archived_at" timestamp with time zone,
	CONSTRAINT "contacts_repayment_day_range" CHECK ("contacts"."repayment_day" is null or ("contacts"."repayment_day" >= 1 and "contacts"."repayment_day" <= 31))
);
--> statement-breakpoint
CREATE TABLE "receivable_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"receivable_id" uuid NOT NULL,
	"transaction_id" uuid,
	"split_id" uuid,
	"amount_cents" bigint NOT NULL,
	"paid_on" date NOT NULL,
	"note" text,
	CONSTRAINT "receivable_payments_amount_positive" CHECK ("receivable_payments"."amount_cents" > 0),
	CONSTRAINT "receivable_payments_split_needs_transaction" CHECK ("receivable_payments"."split_id" is null or "receivable_payments"."transaction_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "receivables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"direction" "receivable_direction" NOT NULL,
	"transaction_id" uuid NOT NULL,
	"split_id" uuid,
	"contact_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"origin" "receivable_origin" DEFAULT 'manual' NOT NULL,
	"recurring_item_id" uuid,
	"note" text,
	"bill_cents" bigint,
	"forgiven_at" timestamp with time zone,
	"forgiven_note" text,
	CONSTRAINT "receivables_transaction_contact_unique" UNIQUE("transaction_id","contact_id"),
	CONSTRAINT "receivables_amount_positive" CHECK ("receivables"."amount_cents" > 0),
	CONSTRAINT "receivables_bill_covers_amount" CHECK ("receivables"."bill_cents" is null or "receivables"."bill_cents" >= "receivables"."amount_cents")
);
--> statement-breakpoint
DROP VIEW "public"."transaction_lines";--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "paid_by_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "recurring_items" ADD COLUMN "share_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "recurring_items" ADD COLUMN "share_bps" smallint;--> statement-breakpoint
ALTER TABLE "recurring_items" ADD COLUMN "share_amount_cents" bigint;--> statement-breakpoint
ALTER TABLE "recurring_items" ADD COLUMN "share_from" date;--> statement-breakpoint
ALTER TABLE "recurring_items" ADD COLUMN "share_applied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_receivable_id_receivables_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."receivables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_split_id_transaction_splits_id_fk" FOREIGN KEY ("split_id") REFERENCES "public"."transaction_splits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_split_id_transaction_splits_id_fk" FOREIGN KEY ("split_id") REFERENCES "public"."transaction_splits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_recurring_item_id_recurring_items_id_fk" FOREIGN KEY ("recurring_item_id") REFERENCES "public"."recurring_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_name_unique" ON "contacts" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "receivable_payments_receivable_id_index" ON "receivable_payments" USING btree ("receivable_id");--> statement-breakpoint
CREATE INDEX "receivable_payments_transaction_id_index" ON "receivable_payments" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "receivables_contact_id_index" ON "receivables" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "receivables_recurring_item_id_index" ON "receivables" USING btree ("recurring_item_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_paid_by_contact_id_contacts_id_fk" FOREIGN KEY ("paid_by_contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_share_contact_id_contacts_id_fk" FOREIGN KEY ("share_contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_paid_by_contact_id_index" ON "transactions" USING btree ("paid_by_contact_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_or_paid_by" CHECK (("transactions"."account_id" is null) = ("transactions"."paid_by_contact_id" is not null));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_paid_by_manual_expense" CHECK ("transactions"."paid_by_contact_id" is null or ("transactions"."manual" and "transactions"."kind" = 'expense'));--> statement-breakpoint
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_share_complete" CHECK (("recurring_items"."share_contact_id" is null and "recurring_items"."share_bps" is null and "recurring_items"."share_amount_cents" is null and "recurring_items"."share_from" is null) or ("recurring_items"."share_contact_id" is not null and "recurring_items"."share_from" is not null and (("recurring_items"."share_bps" is null) <> ("recurring_items"."share_amount_cents" is null))));--> statement-breakpoint
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_share_range" CHECK (("recurring_items"."share_bps" is null or ("recurring_items"."share_bps" >= 1 and "recurring_items"."share_bps" <= 10000)) and ("recurring_items"."share_amount_cents" is null or "recurring_items"."share_amount_cents" > 0));--> statement-breakpoint
CREATE VIEW "public"."transaction_lines" AS (select t.id, s.id as split_id, t.account_id, t.import_id, t.booking_date, ((case when s.id is null then t.amount_cents else s.amount_cents end) + coalesce(ra.adjust_cents, 0) + (case when (case when s.id is null then t.amount_cents else s.amount_cents end) < 0 then 1 else -1 end) * coalesce(pa.settled_cents, 0))::bigint as amount_cents, case when s.id is null then t.amount_cents else s.amount_cents end as gross_amount_cents, t.raw_label, t.merchant, coalesce(lc.kind, t.kind) as kind, coalesce(s.category_id, t.category_id) as category_id, t.needs_review, (t.is_one_off or t.prepaid_item_id is not null) as is_one_off, t.manual, t.prepaid_item_id, t.paid_by_contact_id from transactions t left join transaction_splits s on s.transaction_id = t.id left join categories lc on lc.id = coalesce(s.category_id, t.category_id) left join (select r.transaction_id, r.split_id, sum(case when r.direction = 'owed_to_me' then (case when r.forgiven_at is null then r.amount_cents else coalesce(rp.paid_cents, 0) end) else (case when r.forgiven_at is null then 0 else r.amount_cents - coalesce(rp.paid_cents, 0) end) end) as adjust_cents from receivables r left join (select receivable_id, sum(amount_cents) as paid_cents from receivable_payments group by receivable_id) rp on rp.receivable_id = r.id group by r.transaction_id, r.split_id) ra on ra.transaction_id = t.id and coalesce(ra.split_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(s.id, '00000000-0000-0000-0000-000000000000'::uuid) left join (select transaction_id, split_id, sum(amount_cents) as settled_cents from receivable_payments where transaction_id is not null group by transaction_id, split_id) pa on pa.transaction_id = t.id and coalesce(pa.split_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(s.id, '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
-- #367: `updated_at` maintained by the database on the new tables too.
CREATE TRIGGER "contacts_set_updated_at" BEFORE UPDATE ON "contacts" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER "receivables_set_updated_at" BEFORE UPDATE ON "receivables" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER "receivable_payments_set_updated_at" BEFORE UPDATE ON "receivable_payments" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
