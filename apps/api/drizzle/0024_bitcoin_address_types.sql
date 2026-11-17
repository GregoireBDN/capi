CREATE TYPE "public"."bitcoin_address_type" AS ENUM('legacy', 'nested_segwit', 'native_segwit', 'taproot');--> statement-breakpoint
ALTER TABLE "crypto_wallet_keys" ADD COLUMN "address_types" bitcoin_address_type[];--> statement-breakpoint
ALTER TABLE "crypto_wallet_keys" ADD COLUMN "detect_address_types" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Keys saved before #248 keep reading the address type of their prefix.
UPDATE "crypto_wallet_keys" SET "address_types" = CASE left("public_key", 4)
  WHEN 'xpub' THEN '{legacy}'::bitcoin_address_type[]
  WHEN 'ypub' THEN '{nested_segwit}'::bitcoin_address_type[]
  WHEN 'zpub' THEN '{native_segwit}'::bitcoin_address_type[]
END WHERE "family" = 'bitcoin';
