ALTER TABLE "crypto_wallet_tokens" ADD COLUMN "chain" "crypto_chain";--> statement-breakpoint
ALTER TABLE "crypto_wallet_tokens" ADD COLUMN "contract" varchar(42);--> statement-breakpoint
ALTER TABLE "crypto_wallet_tokens" ADD COLUMN "decimals" smallint;--> statement-breakpoint
ALTER TABLE "crypto_wallet_tokens" ADD CONSTRAINT "crypto_wallet_tokens_contract_complete" CHECK (("crypto_wallet_tokens"."chain" is null) = ("crypto_wallet_tokens"."contract" is null) and ("crypto_wallet_tokens"."contract" is null) = ("crypto_wallet_tokens"."decimals" is null));--> statement-breakpoint
ALTER TABLE "crypto_wallet_tokens" ADD CONSTRAINT "crypto_wallet_tokens_decimals_range" CHECK ("crypto_wallet_tokens"."decimals" between 0 and 36);