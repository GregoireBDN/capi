ALTER TABLE "categorization_rules" ADD COLUMN "counterpart_account_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "counterpart_account_id" uuid;--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD COLUMN "counterpart_account_id" uuid;--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD COLUMN "cost_cents" bigint;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_counterpart_account_id_accounts_id_fk" FOREIGN KEY ("counterpart_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_counterpart_account_id_accounts_id_fk" FOREIGN KEY ("counterpart_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD CONSTRAINT "crypto_movements_counterpart_account_id_accounts_id_fk" FOREIGN KEY ("counterpart_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_counterpart_account_id_index" ON "transactions" USING btree ("counterpart_account_id");--> statement-breakpoint
CREATE INDEX "crypto_movements_counterpart_account_id_index" ON "crypto_movements" USING btree ("counterpart_account_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_counterpart_not_own_account" CHECK ("transactions"."counterpart_account_id" <> "transactions"."account_id");