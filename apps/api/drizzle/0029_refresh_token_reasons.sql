ALTER TABLE "refresh_tokens" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "revoked_reason" varchar(16);--> statement-breakpoint
CREATE INDEX "refresh_tokens_parent_id_idx" ON "refresh_tokens" USING btree ("parent_id");