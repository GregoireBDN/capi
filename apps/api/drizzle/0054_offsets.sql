CREATE TABLE "receivable_offsets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"contact_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"offset_on" date NOT NULL,
	"automatic" boolean DEFAULT false NOT NULL,
	CONSTRAINT "receivable_offsets_amount_positive" CHECK ("receivable_offsets"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "always_offset" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD COLUMN "offset_id" uuid;--> statement-breakpoint
ALTER TABLE "receivable_offsets" ADD CONSTRAINT "receivable_offsets_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receivable_offsets_contact_id_index" ON "receivable_offsets" USING btree ("contact_id");--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_offset_id_receivable_offsets_id_fk" FOREIGN KEY ("offset_id") REFERENCES "public"."receivable_offsets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receivable_payments_offset_id_index" ON "receivable_payments" USING btree ("offset_id");--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_offset_without_transaction" CHECK ("receivable_payments"."offset_id" is null or "receivable_payments"."transaction_id" is null);--> statement-breakpoint
CREATE TRIGGER "receivable_offsets_set_updated_at" BEFORE UPDATE ON "receivable_offsets" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- #484: an offset settles the same amount on each side, one contact's items of
-- both directions, made and undone as one. Checked at commit (its repayments are
-- written after it), on the offset and on every repayment that names one.
CREATE FUNCTION "receivable_offset_check"(checked uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  total bigint;
  contact uuid;
  owed bigint;
  owing bigint;
  strangers bigint;
BEGIN
  IF checked IS NULL THEN
    RETURN;
  END IF;
  SELECT "amount_cents", "contact_id" INTO total, contact
  FROM "receivable_offsets" WHERE "id" = checked;
  IF NOT FOUND THEN
    -- Undone: its repayments went with it.
    RETURN;
  END IF;
  SELECT
    coalesce(sum(p."amount_cents") FILTER (WHERE r."direction" = 'owed_to_me'), 0),
    coalesce(sum(p."amount_cents") FILTER (WHERE r."direction" = 'i_owe'), 0),
    count(*) FILTER (WHERE r."contact_id" <> contact)
  INTO owed, owing, strangers
  FROM "receivable_payments" p
  JOIN "receivables" r ON r."id" = p."receivable_id"
  WHERE p."offset_id" = checked;
  IF owed <> total OR owing <> total OR strangers > 0 THEN
    RAISE EXCEPTION 'An offset settles the same amount on each side of one contact'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'receivable_offsets_balanced';
  END IF;
END $$;--> statement-breakpoint
CREATE FUNCTION "receivable_offsets_balanced"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'receivable_offsets' THEN
    PERFORM "receivable_offset_check"(NEW."id");
  ELSE
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      PERFORM "receivable_offset_check"(OLD."offset_id");
    END IF;
    IF TG_OP = 'INSERT'
      OR (TG_OP = 'UPDATE' AND NEW."offset_id" IS DISTINCT FROM OLD."offset_id") THEN
      PERFORM "receivable_offset_check"(NEW."offset_id");
    END IF;
  END IF;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "receivable_offsets_balanced"
AFTER INSERT OR UPDATE ON "receivable_offsets"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "receivable_offsets_balanced"();--> statement-breakpoint
-- Only repayments of an offset queue a check: a transfer's repayment leaves no
-- pending event behind.
CREATE CONSTRAINT TRIGGER "receivable_payments_offset_balanced_insert"
AFTER INSERT ON "receivable_payments"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW WHEN (NEW."offset_id" IS NOT NULL)
EXECUTE FUNCTION "receivable_offsets_balanced"();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "receivable_payments_offset_balanced_update"
AFTER UPDATE ON "receivable_payments"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW WHEN (OLD."offset_id" IS NOT NULL OR NEW."offset_id" IS NOT NULL)
EXECUTE FUNCTION "receivable_offsets_balanced"();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "receivable_payments_offset_balanced_delete"
AFTER DELETE ON "receivable_payments"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW WHEN (OLD."offset_id" IS NOT NULL)
EXECUTE FUNCTION "receivable_offsets_balanced"();
