CREATE TYPE "public"."webauthn_challenge_purpose" AS ENUM('registration', 'authentication');--> statement-breakpoint
CREATE TABLE "webauthn_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"purpose" "webauthn_challenge_purpose" NOT NULL,
	"challenge" varchar(255) NOT NULL,
	"user_id" uuid,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "webauthn_challenges_challenge_unique" UNIQUE("challenge")
);
--> statement-breakpoint
CREATE TABLE "webauthn_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" varchar(1024) NOT NULL,
	"public_key" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"transports" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"device_type" varchar(32) NOT NULL,
	"backed_up" boolean DEFAULT false NOT NULL,
	"name" varchar(100) NOT NULL,
	"last_used_at" timestamp,
	CONSTRAINT "webauthn_credentials_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "authenticated_at" timestamp;--> statement-breakpoint
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webauthn_challenges_expires_at_idx" ON "webauthn_challenges" USING btree ("expires_at");