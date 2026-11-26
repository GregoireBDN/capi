CREATE TYPE "public"."envelope_movement_reason" AS ENUM('start', 'move', 'split', 'transfer', 'spend');--> statement-breakpoint
CREATE TABLE "envelope_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"envelope_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "envelope_categories_unique" UNIQUE("envelope_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "envelope_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"envelope_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"on_date" date NOT NULL,
	"reason" "envelope_movement_reason" NOT NULL,
	"counter_envelope_id" uuid,
	"transaction_id" uuid,
	"note" text,
	CONSTRAINT "envelope_movements_amount_not_zero" CHECK ("envelope_movements"."amount_cents" <> 0),
	CONSTRAINT "envelope_movements_transaction_iff_linked_reason" CHECK (("envelope_movements"."transaction_id" is not null) = ("envelope_movements"."reason" in ('split', 'transfer', 'spend'))),
	CONSTRAINT "envelope_movements_counter_only_on_moves" CHECK ("envelope_movements"."counter_envelope_id" is null or ("envelope_movements"."reason" = 'move' and "envelope_movements"."counter_envelope_id" <> "envelope_movements"."envelope_id")),
	CONSTRAINT "envelope_movements_start_split_positive" CHECK ("envelope_movements"."reason" not in ('start', 'split') or "envelope_movements"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "envelope_offer_dismissals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"transaction_id" uuid NOT NULL,
	CONSTRAINT "envelope_offer_dismissals_transaction_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "envelope_split_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"account_id" uuid NOT NULL,
	"envelope_id" uuid NOT NULL,
	"basis_points" integer NOT NULL,
	CONSTRAINT "envelope_split_keys_unique" UNIQUE("account_id","envelope_id"),
	CONSTRAINT "envelope_split_keys_basis_points_range" CHECK ("envelope_split_keys"."basis_points" between 1 and 10000)
);
--> statement-breakpoint
CREATE TABLE "envelopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar(100) NOT NULL,
	"icon" varchar(40),
	"color" varchar(16),
	"target_cents" bigint,
	"due_date" date,
	"archived_at" timestamp with time zone,
	CONSTRAINT "envelopes_name_not_blank" CHECK (btrim("envelopes"."name") <> ''),
	CONSTRAINT "envelopes_target_positive" CHECK ("envelopes"."target_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "envelope_categories" ADD CONSTRAINT "envelope_categories_envelope_id_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."envelopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envelope_categories" ADD CONSTRAINT "envelope_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envelope_movements" ADD CONSTRAINT "envelope_movements_envelope_id_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."envelopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envelope_movements" ADD CONSTRAINT "envelope_movements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envelope_movements" ADD CONSTRAINT "envelope_movements_counter_envelope_id_envelopes_id_fk" FOREIGN KEY ("counter_envelope_id") REFERENCES "public"."envelopes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envelope_movements" ADD CONSTRAINT "envelope_movements_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envelope_offer_dismissals" ADD CONSTRAINT "envelope_offer_dismissals_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envelope_split_keys" ADD CONSTRAINT "envelope_split_keys_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envelope_split_keys" ADD CONSTRAINT "envelope_split_keys_envelope_id_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."envelopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "envelope_categories_category_id_index" ON "envelope_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "envelope_movements_envelope_id_account_id_index" ON "envelope_movements" USING btree ("envelope_id","account_id");--> statement-breakpoint
CREATE INDEX "envelope_movements_account_id_index" ON "envelope_movements" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "envelope_movements_transaction_id_index" ON "envelope_movements" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "envelope_movements_one_envelope_per_attachment" ON "envelope_movements" USING btree ("transaction_id","account_id") WHERE "envelope_movements"."reason" in ('transfer', 'spend');--> statement-breakpoint
CREATE UNIQUE INDEX "envelope_movements_one_split_per_envelope" ON "envelope_movements" USING btree ("transaction_id","envelope_id") WHERE "envelope_movements"."reason" = 'split';--> statement-breakpoint
CREATE INDEX "envelope_split_keys_envelope_id_index" ON "envelope_split_keys" USING btree ("envelope_id");--> statement-breakpoint
CREATE TRIGGER "envelopes_set_updated_at" BEFORE UPDATE ON "envelopes" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER "envelope_categories_set_updated_at" BEFORE UPDATE ON "envelope_categories" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER "envelope_movements_set_updated_at" BEFORE UPDATE ON "envelope_movements" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER "envelope_split_keys_set_updated_at" BEFORE UPDATE ON "envelope_split_keys" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER "envelope_offer_dismissals_set_updated_at" BEFORE UPDATE ON "envelope_offer_dismissals" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- #429 (ADR 0008): an envelope pays for expense categories only, and such a
-- category keeps its kind while an envelope names it.
CREATE FUNCTION "envelope_categories_expense_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT "kind" FROM "categories" WHERE "id" = NEW."category_id") <> 'expense' THEN
    RAISE EXCEPTION 'An envelope pays for expense categories only'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'envelope_categories_expense_only';
  END IF;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE TRIGGER "envelope_categories_expense_only"
AFTER INSERT OR UPDATE OF "category_id" ON "envelope_categories"
FOR EACH ROW EXECUTE FUNCTION "envelope_categories_expense_only"();--> statement-breakpoint
CREATE FUNCTION "categories_kind_kept_for_envelopes"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."kind" <> 'expense' AND EXISTS (SELECT 1 FROM "envelope_categories" WHERE "category_id" = NEW."id") THEN
    RAISE EXCEPTION 'An envelope pays for this category: it stays an expense category'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'envelope_categories_expense_only';
  END IF;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE TRIGGER "categories_kind_kept_for_envelopes"
AFTER UPDATE OF "kind" ON "categories"
FOR EACH ROW EXECUTE FUNCTION "categories_kind_kept_for_envelopes"();--> statement-breakpoint
-- An account's split key gives at most 100 % to its envelopes.
CREATE FUNCTION "envelope_split_keys_within_account"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT sum("basis_points") FROM "envelope_split_keys" WHERE "account_id" = NEW."account_id") > 10000 THEN
    RAISE EXCEPTION 'A split key gives more than 100 %% of an account'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'envelope_split_keys_within_account';
  END IF;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE TRIGGER "envelope_split_keys_within_account"
AFTER INSERT OR UPDATE OF "basis_points", "account_id" ON "envelope_split_keys"
FOR EACH ROW EXECUTE FUNCTION "envelope_split_keys_within_account"();--> statement-breakpoint
-- A movement agrees with its transaction (ADR 0008 §9). Row triggers run at
-- the end of the statement, so both legs of a transfer are written together.
CREATE FUNCTION "envelope_movements_match_transaction"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  row_ "envelope_movements";
  tx RECORD;
  total bigint;
  legs bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    row_ := OLD;
  ELSE
    row_ := NEW;
  END IF;
  IF row_."transaction_id" IS NULL THEN
    RETURN NULL;
  END IF;
  -- The legs of a transfer still there balance (none when it was deleted).
  IF row_."reason" = 'transfer' THEN
    SELECT coalesce(sum("amount_cents"), 0) INTO legs FROM "envelope_movements"
    WHERE "transaction_id" = row_."transaction_id" AND "envelope_id" = row_."envelope_id" AND "reason" = 'transfer';
    IF legs <> 0 THEN
      RAISE EXCEPTION 'The two legs of an envelope transfer do not balance'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'envelope_movements_transfer_legs';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN NULL;
  END IF;
  SELECT "account_id", "kind", "amount_cents", "counterpart_account_id" INTO tx
  FROM "transactions" WHERE "id" = NEW."transaction_id";
  IF NEW."reason" = 'split' THEN
    SELECT sum("amount_cents") INTO total FROM "envelope_movements"
    WHERE "transaction_id" = NEW."transaction_id" AND "reason" = 'split';
    IF tx."account_id" IS DISTINCT FROM NEW."account_id" OR tx."amount_cents" <= 0
      OR tx."kind" NOT IN ('income', 'transfer') OR total > tx."amount_cents" THEN
      RAISE EXCEPTION 'An envelope split takes part of an incoming saving of its account'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'envelope_movements_match_transaction';
    END IF;
  ELSIF NEW."reason" = 'spend' THEN
    IF tx."account_id" IS DISTINCT FROM NEW."account_id" OR tx."kind" <> 'expense'
      OR sign(NEW."amount_cents") <> sign(tx."amount_cents")
      OR abs(NEW."amount_cents") > abs(tx."amount_cents") THEN
      RAISE EXCEPTION 'An envelope pays at most an expense of its account'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'envelope_movements_match_transaction';
    END IF;
  ELSIF NEW."reason" = 'transfer' THEN
    IF tx."kind" <> 'transfer' OR tx."amount_cents" >= 0 OR tx."counterpart_account_id" IS NULL
      OR NOT ((NEW."account_id" = tx."account_id" AND NEW."amount_cents" < 0 AND -NEW."amount_cents" <= -tx."amount_cents")
           OR (NEW."account_id" = tx."counterpart_account_id" AND NEW."amount_cents" > 0 AND NEW."amount_cents" <= -tx."amount_cents")) THEN
      RAISE EXCEPTION 'An envelope follows an outgoing transfer from its account to the other one'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'envelope_movements_match_transaction';
    END IF;
  END IF;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE TRIGGER "envelope_movements_match_transaction"
AFTER INSERT OR UPDATE OR DELETE ON "envelope_movements"
FOR EACH ROW EXECUTE FUNCTION "envelope_movements_match_transaction"();--> statement-breakpoint
-- Whatever path changes a transaction, the movements its new values forbid
-- go in the same statement (#367): the money is back where it was.
CREATE FUNCTION "transactions_clear_envelope_movements"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "envelope_movements" m
  WHERE m."transaction_id" = NEW."id" AND m."reason" = 'spend'
    AND (NEW."kind" <> 'expense' OR m."account_id" IS DISTINCT FROM NEW."account_id"
      OR sign(m."amount_cents") <> sign(NEW."amount_cents")
      OR abs(m."amount_cents") > abs(NEW."amount_cents"));
  IF NEW."kind" NOT IN ('income', 'transfer') OR NEW."amount_cents" <= 0
    OR NEW."account_id" IS DISTINCT FROM OLD."account_id"
    OR (SELECT sum("amount_cents") FROM "envelope_movements" WHERE "transaction_id" = NEW."id" AND "reason" = 'split') > NEW."amount_cents" THEN
    DELETE FROM "envelope_movements" WHERE "transaction_id" = NEW."id" AND "reason" = 'split';
  END IF;
  IF NEW."kind" <> 'transfer' OR NEW."amount_cents" >= 0 OR NEW."counterpart_account_id" IS NULL
    OR NEW."account_id" IS DISTINCT FROM OLD."account_id"
    OR NEW."counterpart_account_id" IS DISTINCT FROM OLD."counterpart_account_id"
    OR EXISTS (SELECT 1 FROM "envelope_movements" WHERE "transaction_id" = NEW."id" AND "reason" = 'transfer' AND abs("amount_cents") > -NEW."amount_cents") THEN
    DELETE FROM "envelope_movements" WHERE "transaction_id" = NEW."id" AND "reason" = 'transfer';
  END IF;
  RETURN NULL;
END $$;--> statement-breakpoint
CREATE TRIGGER "transactions_clear_envelope_movements"
AFTER UPDATE ON "transactions"
FOR EACH ROW
WHEN (OLD."kind" IS DISTINCT FROM NEW."kind" OR OLD."account_id" IS DISTINCT FROM NEW."account_id"
  OR OLD."amount_cents" IS DISTINCT FROM NEW."amount_cents"
  OR OLD."counterpart_account_id" IS DISTINCT FROM NEW."counterpart_account_id")
EXECUTE FUNCTION "transactions_clear_envelope_movements"();
