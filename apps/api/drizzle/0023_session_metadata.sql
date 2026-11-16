ALTER TABLE "refresh_tokens" ADD COLUMN "sign_in_method" varchar(16);--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "device" varchar(64);