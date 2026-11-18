CREATE TABLE "crypto_bitcoin_scan_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"scan_id" uuid NOT NULL,
	"branch" smallint NOT NULL,
	"address_index" integer NOT NULL,
	"used" boolean NOT NULL,
	"balance_sats" bigint NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "crypto_bitcoin_scan_addresses_unique" UNIQUE("scan_id","branch","address_index"),
	CONSTRAINT "crypto_bitcoin_scan_addresses_branch" CHECK ("crypto_bitcoin_scan_addresses"."branch" in (0, 1)),
	CONSTRAINT "crypto_bitcoin_scan_addresses_index_non_negative" CHECK ("crypto_bitcoin_scan_addresses"."address_index" >= 0),
	CONSTRAINT "crypto_bitcoin_scan_addresses_balance_non_negative" CHECK ("crypto_bitcoin_scan_addresses"."balance_sats" >= 0)
);
--> statement-breakpoint
CREATE TABLE "crypto_bitcoin_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"key_id" uuid NOT NULL,
	"address_type" bitcoin_address_type NOT NULL,
	"pass_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "crypto_bitcoin_scans_key_type_unique" UNIQUE("key_id","address_type")
);
--> statement-breakpoint
ALTER TABLE "crypto_bitcoin_scan_addresses" ADD CONSTRAINT "crypto_bitcoin_scan_addresses_scan_id_crypto_bitcoin_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."crypto_bitcoin_scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_bitcoin_scans" ADD CONSTRAINT "crypto_bitcoin_scans_key_id_crypto_wallet_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."crypto_wallet_keys"("id") ON DELETE cascade ON UPDATE no action;