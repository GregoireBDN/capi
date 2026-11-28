-- ADR 0009 (#555): every private row names its owner.
--
-- app_user_id() is the owner of the rows a statement writes: the request's
-- `app.user_id` setting, or, until the request scope of #557, the only user
-- (single-user instances keep working unchanged). With no user in scope and
-- not exactly one user, it is null and `NOT NULL` refuses the write.
CREATE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$
    SELECT coalesce(
      nullif(current_setting('app.user_id', true), '')::uuid,
      (SELECT (array_agg(id))[1] FROM users HAVING count(*) = 1)
    )
  $$;
--> statement-breakpoint
-- Existing rows go to the single user, through the column default below.
-- With no user, the default categories seeded on deploy belong to nobody:
-- they are deleted (sign-up seeds them for the new owner). Any other row, or
-- several users with rows, stops the migration with a count.
DO $$
DECLARE
  users_count bigint := (SELECT count(*) FROM users);
  other_rows bigint := (SELECT count(*) FROM accounts) + (SELECT count(*) FROM balance_snapshots) + (SELECT count(*) FROM budgets) + (SELECT count(*) FROM categorization_rules) + (SELECT count(*) FROM contacts) + (SELECT count(*) FROM crypto_bitcoin_scan_addresses) + (SELECT count(*) FROM crypto_bitcoin_scans) + (SELECT count(*) FROM crypto_holdings) + (SELECT count(*) FROM crypto_imports) + (SELECT count(*) FROM crypto_movements) + (SELECT count(*) FROM crypto_transfer_links) + (SELECT count(*) FROM crypto_wallet_keys) + (SELECT count(*) FROM crypto_wallet_tokens) + (SELECT count(*) FROM dashboard_widget_accounts) + (SELECT count(*) FROM dashboard_widget_categories) + (SELECT count(*) FROM dashboard_widget_envelopes) + (SELECT count(*) FROM dashboard_widgets) + (SELECT count(*) FROM dividends) + (SELECT count(*) FROM envelope_categories) + (SELECT count(*) FROM envelope_movements) + (SELECT count(*) FROM envelope_offer_dismissals) + (SELECT count(*) FROM envelope_split_keys) + (SELECT count(*) FROM envelopes) + (SELECT count(*) FROM import_profiles) + (SELECT count(*) FROM imports) + (SELECT count(*) FROM month_closes) + (SELECT count(*) FROM position_lines) + (SELECT count(*) FROM position_statements) + (SELECT count(*) FROM receivable_offsets) + (SELECT count(*) FROM receivable_payments) + (SELECT count(*) FROM receivables) + (SELECT count(*) FROM recurring_items) + (SELECT count(*) FROM transaction_splits) + (SELECT count(*) FROM transactions) + (SELECT count(*) FROM app_settings);
  seed_rows bigint := (SELECT count(*) FROM categories) + (SELECT count(*) FROM deleted_default_categories);
BEGIN
  IF users_count = 0 AND other_rows > 0 THEN
    RAISE EXCEPTION 'owner_on_every_row: % private rows and no user to own them', other_rows;
  END IF;
  IF users_count > 1 AND other_rows + seed_rows > 0 THEN
    RAISE EXCEPTION 'owner_on_every_row: % private rows and % users, owner unknown', other_rows + seed_rows, users_count;
  END IF;
  IF users_count = 0 THEN
    DELETE FROM deleted_default_categories;
    DELETE FROM categories;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_slug_unique";--> statement-breakpoint
ALTER TABLE "deleted_default_categories" DROP CONSTRAINT "deleted_default_categories_slug_unique";--> statement-breakpoint
ALTER TABLE "import_profiles" DROP CONSTRAINT "import_profiles_header_unique";--> statement-breakpoint
ALTER TABLE "crypto_wallet_keys" DROP CONSTRAINT "crypto_wallet_keys_public_key_unique";--> statement-breakpoint
ALTER TABLE "app_settings" DROP CONSTRAINT "app_settings_key_unique";--> statement-breakpoint
ALTER TABLE "month_closes" DROP CONSTRAINT "month_closes_month_unique";--> statement-breakpoint
ALTER TABLE "dashboard_widgets" DROP CONSTRAINT "dashboard_widgets_type_unique";--> statement-breakpoint
ALTER TABLE "dashboard_widgets" DROP CONSTRAINT "dashboard_widgets_position_unique";--> statement-breakpoint
DROP INDEX "contacts_name_unique";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "balance_snapshots" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "deleted_default_categories" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "import_profiles" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_items" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "crypto_bitcoin_scan_addresses" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "crypto_bitcoin_scans" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "crypto_holdings" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "crypto_wallet_keys" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "crypto_wallet_tokens" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "month_closes" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "crypto_imports" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "crypto_transfer_links" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "receivable_offsets" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "receivables" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "dividends" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "position_lines" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "position_statements" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "envelope_categories" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "envelope_movements" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "envelope_offer_dismissals" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "envelope_split_keys" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "envelopes" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "dashboard_widget_accounts" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "dashboard_widget_categories" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "dashboard_widget_envelopes" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD COLUMN "user_id" uuid DEFAULT app_user_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deleted_default_categories" ADD CONSTRAINT "deleted_default_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_profiles" ADD CONSTRAINT "import_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_bitcoin_scan_addresses" ADD CONSTRAINT "crypto_bitcoin_scan_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_bitcoin_scans" ADD CONSTRAINT "crypto_bitcoin_scans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_holdings" ADD CONSTRAINT "crypto_holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_wallet_keys" ADD CONSTRAINT "crypto_wallet_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_wallet_tokens" ADD CONSTRAINT "crypto_wallet_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "month_closes" ADD CONSTRAINT "month_closes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_imports" ADD CONSTRAINT "crypto_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD CONSTRAINT "crypto_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crypto_transfer_links" ADD CONSTRAINT "crypto_transfer_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_offsets" ADD CONSTRAINT "receivable_offsets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividends" ADD CONSTRAINT "dividends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_lines" ADD CONSTRAINT "position_lines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_statements" ADD CONSTRAINT "position_statements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envelope_categories" ADD CONSTRAINT "envelope_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envelope_movements" ADD CONSTRAINT "envelope_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envelope_offer_dismissals" ADD CONSTRAINT "envelope_offer_dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envelope_split_keys" ADD CONSTRAINT "envelope_split_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envelopes" ADD CONSTRAINT "envelopes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_widget_accounts" ADD CONSTRAINT "dashboard_widget_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_widget_categories" ADD CONSTRAINT "dashboard_widget_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_widget_envelopes" ADD CONSTRAINT "dashboard_widget_envelopes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_name_unique" ON "contacts" USING btree ("user_id",lower("name"));--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_slug_unique" UNIQUE("user_id","slug");--> statement-breakpoint
ALTER TABLE "deleted_default_categories" ADD CONSTRAINT "deleted_default_categories_slug_unique" UNIQUE("user_id","slug");--> statement-breakpoint
ALTER TABLE "import_profiles" ADD CONSTRAINT "import_profiles_header_unique" UNIQUE("user_id","delimiter","headers");--> statement-breakpoint
ALTER TABLE "crypto_wallet_keys" ADD CONSTRAINT "crypto_wallet_keys_public_key_unique" UNIQUE("user_id","public_key");--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_key_unique" UNIQUE("user_id","key");--> statement-breakpoint
ALTER TABLE "month_closes" ADD CONSTRAINT "month_closes_month_unique" UNIQUE("user_id","month");--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_type_unique" UNIQUE("user_id","type");--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_position_unique" UNIQUE("user_id","position");