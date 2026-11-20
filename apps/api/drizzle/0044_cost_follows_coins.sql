CREATE TYPE "public"."crypto_movement_resolution" AS ENUM('bought', 'gift', 'disposed');--> statement-breakpoint
CREATE TYPE "public"."crypto_transfer_match" AS ENUM('auto', 'manual');--> statement-breakpoint
-- #373: the new kinds are used by this migration, so the type is made again
-- rather than extended (a value added by ALTER TYPE is unusable until commit).
ALTER TYPE "public"."crypto_movement_kind" RENAME TO "crypto_movement_kind_before_0044";--> statement-breakpoint
CREATE TYPE "public"."crypto_movement_kind" AS ENUM('buy', 'sell', 'convert', 'fee', 'deposit', 'withdrawal', 'transfer_internal', 'income', 'other', 'observed_in', 'observed_out');--> statement-breakpoint
ALTER TABLE "crypto_movements" ALTER COLUMN "kind" TYPE "public"."crypto_movement_kind" USING "kind"::text::"public"."crypto_movement_kind";--> statement-breakpoint
DROP TYPE "public"."crypto_movement_kind_before_0044";--> statement-breakpoint
CREATE TABLE "crypto_transfer_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"out_movement_id" uuid NOT NULL,
	"in_movement_id" uuid NOT NULL,
	"matched" "crypto_transfer_match" NOT NULL,
	CONSTRAINT "crypto_transfer_links_out_unique" UNIQUE("out_movement_id"),
	CONSTRAINT "crypto_transfer_links_in_unique" UNIQUE("in_movement_id"),
	CONSTRAINT "crypto_transfer_links_two_sides" CHECK ("crypto_transfer_links"."out_movement_id" <> "crypto_transfer_links"."in_movement_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_invested_base_type";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "crypto_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crypto_movements" ALTER COLUMN "import_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD COLUMN "observed_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD COLUMN "asset_id" varchar(100);--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD COLUMN "resolution" "crypto_movement_resolution";--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD COLUMN "auto_match" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "crypto_transfer_links" ADD CONSTRAINT "crypto_transfer_links_out_movement_id_crypto_movements_id_fk" FOREIGN KEY ("out_movement_id") REFERENCES "public"."crypto_movements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_transfer_links" ADD CONSTRAINT "crypto_transfer_links_in_movement_id_crypto_movements_id_fk" FOREIGN KEY ("in_movement_id") REFERENCES "public"."crypto_movements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- data: begin
-- #373: a wallet's opening position is what its last sync read, a manual
-- account's what its lines hold (each asset from its first line), as
-- observed movements; the replay starts from them.
INSERT INTO "crypto_movements" ("account_id", "occurred_at", "operation", "kind", "asset", "asset_id", "quantity", "dedupe_hash")
SELECT h."account_id",
  CASE WHEN a."crypto_source" = 'wallet' THEN coalesce(a."crypto_synced_at", min(h."created_at")) ELSE min(h."created_at") END,
  'opening', 'observed_in', min(h."symbol"), h."asset_id", sum(h."quantity"),
  'observed:' || gen_random_uuid()
FROM "crypto_holdings" h
JOIN "accounts" a ON a."id" = h."account_id"
WHERE (a."crypto_source" = 'wallet' AND h."origin" = 'sync') OR (a."crypto_source" = 'manual' AND h."origin" = 'manual')
GROUP BY h."account_id", a."crypto_source", a."crypto_synced_at", h."asset_id"
HAVING sum(h."quantity") > 0;
--> statement-breakpoint
-- A manual account's lines that all carry an invested amount answer their
-- opening (« Achetés ailleurs » at that cost).
UPDATE "crypto_movements" m SET "resolution" = 'bought', "cost_cents" = c."cost"
FROM (
  SELECT h."account_id", h."asset_id", sum(h."invested_cents") AS "cost"
  FROM "crypto_holdings" h JOIN "accounts" a ON a."id" = h."account_id"
  WHERE a."crypto_source" = 'manual' AND h."origin" = 'manual'
  GROUP BY h."account_id", h."asset_id"
  HAVING bool_and(h."invested_cents" IS NOT NULL)
) c
WHERE m."account_id" = c."account_id" AND m."asset_id" = c."asset_id" AND m."kind" = 'observed_in' AND m."operation" = 'opening';
--> statement-breakpoint
-- #358's invested base of a crypto account becomes the cost of its opening
-- when it holds one asset: the base minus the coins linked to it up to its
-- day (those keep their own cost); otherwise it is typed again per asset.
DO $$
DECLARE
  migrated integer;
  dropped integer;
BEGIN
  WITH single AS (
    SELECT m."id", a."invested_base_cents" AS "base", a."invested_base_on" AS "on", a."id" AS "account_id"
    FROM "accounts" a
    JOIN "crypto_movements" m ON m."account_id" = a."id" AND m."kind" = 'observed_in' AND m."operation" = 'opening'
    WHERE a."type" = 'crypto' AND a."invested_base_cents" IS NOT NULL
      AND (SELECT count(*) FROM "crypto_movements" o WHERE o."account_id" = a."id" AND o."kind" = 'observed_in' AND o."operation" = 'opening') = 1
  ), answered AS (
    UPDATE "crypto_movements" m SET "resolution" = 'bought', "cost_cents" = greatest(s."base" - coalesce((
      SELECT sum(w."cost_cents") FROM "crypto_movements" w
      WHERE w."counterpart_account_id" = s."account_id" AND w."kind" = 'withdrawal'
        AND (w."occurred_at" AT TIME ZONE 'Europe/Paris')::date <= s."on"
    ), 0), 0)
    FROM single s WHERE m."id" = s."id"
    RETURNING m."id"
  )
  SELECT count(*) INTO migrated FROM answered;
  SELECT count(*) - migrated INTO dropped FROM "accounts" WHERE "type" = 'crypto' AND "invested_base_cents" IS NOT NULL;
  IF migrated > 0 THEN
    RAISE NOTICE 'finances: % crypto invested amount(s) moved to their asset''s opening cost (#373)', migrated;
  END IF;
  IF dropped > 0 THEN
    RAISE NOTICE 'finances: % crypto invested amount(s) on several assets to type again per asset in « À préciser » (#373)', dropped;
  END IF;
END $$;
--> statement-breakpoint
UPDATE "accounts" SET "invested_base_cents" = NULL, "invested_base_on" = NULL WHERE "type" = 'crypto' AND "invested_base_cents" IS NOT NULL;
--> statement-breakpoint
-- Withdrawal costs were computed and stored; the replay computes them now and
-- the column only holds what the owner gives.
UPDATE "crypto_movements" SET "cost_cents" = NULL WHERE "resolution" IS NULL AND "cost_cents" IS NOT NULL;
--> statement-breakpoint
-- #370 (R2): contributions hold typed figures only; a crypto value's invested
-- amount is computed on read.
UPDATE "balance_snapshots" SET "contributions_cents" = NULL WHERE "source" = 'computed' AND "contributions_cents" IS NOT NULL;
--> statement-breakpoint
-- The last complete read of each wallet, the last edit of each manual account
-- with lines: later movements are observed after it.
UPDATE "accounts" a SET "crypto_observed_at" = o."at"
FROM (SELECT "account_id", max("occurred_at") AS "at" FROM "crypto_movements" WHERE "kind" = 'observed_in' GROUP BY "account_id") o
WHERE a."id" = o."account_id";
--> statement-breakpoint
UPDATE "accounts" SET "crypto_observed_at" = "crypto_synced_at" WHERE "crypto_source" = 'wallet' AND "crypto_observed_at" IS NULL AND "crypto_synced_at" IS NOT NULL;
--> statement-breakpoint
-- data: end
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_crypto_observed_only_wallet_or_manual" CHECK ("accounts"."crypto_observed_at" IS NULL OR "accounts"."crypto_source" IN ('wallet', 'manual'));--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_invested_base_type" CHECK ("accounts"."invested_base_cents" IS NULL OR ("accounts"."invested_base_cents" >= 0 AND "accounts"."type" IN ('brokerage', 'life_insurance', 'employee_savings')));--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD CONSTRAINT "crypto_movements_observed_shape" CHECK (("crypto_movements"."kind" IN ('observed_in', 'observed_out')) = ("crypto_movements"."import_id" IS NULL) AND ("crypto_movements"."kind" IN ('observed_in', 'observed_out')) = ("crypto_movements"."asset_id" IS NOT NULL) AND ("crypto_movements"."observed_since" IS NULL OR "crypto_movements"."kind" IN ('observed_in', 'observed_out')));--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD CONSTRAINT "crypto_movements_observed_sign" CHECK (("crypto_movements"."kind" <> 'observed_in' OR "crypto_movements"."quantity" > 0) AND ("crypto_movements"."kind" <> 'observed_out' OR "crypto_movements"."quantity" < 0));--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD CONSTRAINT "crypto_movements_resolution_kind" CHECK ("crypto_movements"."resolution" IS NULL OR ("crypto_movements"."resolution" IN ('bought', 'gift') AND "crypto_movements"."kind" IN ('deposit', 'observed_in')) OR ("crypto_movements"."resolution" = 'disposed' AND "crypto_movements"."kind" IN ('withdrawal', 'observed_out')));--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD CONSTRAINT "crypto_movements_given_cost" CHECK (("crypto_movements"."cost_cents" IS NOT NULL) = COALESCE("crypto_movements"."resolution" IN ('bought', 'gift'), false) AND ("crypto_movements"."resolution" IS DISTINCT FROM 'gift' OR "crypto_movements"."cost_cents" = 0) AND ("crypto_movements"."cost_cents" IS NULL OR "crypto_movements"."cost_cents" >= 0));--> statement-breakpoint
CREATE TRIGGER "crypto_transfer_links_set_updated_at" BEFORE UPDATE ON "crypto_transfer_links" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- A transfer goes from what left one account to what arrived in another,
-- neither answered otherwise, never an opening (#373).
CREATE OR REPLACE FUNCTION crypto_transfer_links_sides() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  out_row record;
  in_row record;
BEGIN
  SELECT "account_id", "kind", "resolution" INTO out_row FROM "crypto_movements" WHERE "id" = NEW."out_movement_id";
  SELECT "account_id", "kind", "resolution", "observed_since" INTO in_row FROM "crypto_movements" WHERE "id" = NEW."in_movement_id";
  IF out_row."kind" NOT IN ('withdrawal', 'observed_out')
    OR in_row."kind" NOT IN ('deposit', 'observed_in')
    OR (in_row."kind" = 'observed_in' AND in_row."observed_since" IS NULL)
    OR out_row."account_id" = in_row."account_id"
    OR out_row."resolution" IS NOT NULL OR in_row."resolution" IS NOT NULL THEN
    RAISE EXCEPTION 'A crypto transfer links a departure to an arrival of another account'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'crypto_transfer_links_sides', TABLE = 'crypto_transfer_links';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "crypto_transfer_links_sides" BEFORE INSERT OR UPDATE ON "crypto_transfer_links" FOR EACH ROW EXECUTE FUNCTION crypto_transfer_links_sides();--> statement-breakpoint
-- A side of a transfer is not answered otherwise (#373).
CREATE OR REPLACE FUNCTION crypto_movements_linked_unanswered() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."resolution" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "crypto_transfer_links" l WHERE l."out_movement_id" = NEW."id" OR l."in_movement_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'A side of a crypto transfer has no other answer'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'crypto_movements_linked_unanswered', TABLE = 'crypto_movements';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "crypto_movements_linked_unanswered" BEFORE UPDATE OF "resolution" ON "crypto_movements" FOR EACH ROW EXECUTE FUNCTION crypto_movements_linked_unanswered();
