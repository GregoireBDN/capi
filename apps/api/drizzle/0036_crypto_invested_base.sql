ALTER TABLE "accounts" ADD COLUMN "invested_base_cents" bigint;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "invested_base_on" date;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_invested_base_both" CHECK (("accounts"."invested_base_cents" IS NULL) = ("accounts"."invested_base_on" IS NULL));--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_invested_base_crypto" CHECK ("accounts"."invested_base_cents" IS NULL OR ("accounts"."invested_base_cents" >= 0 AND "accounts"."crypto_source" IN ('wallet', 'manual')));