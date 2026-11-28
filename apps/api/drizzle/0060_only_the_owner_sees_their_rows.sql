-- #557, ADR 0009 §2: Postgres refuses every private row to anyone but its
-- owner, whatever the query. Each private table gets row-level security,
-- forced (the table owner too, unless superuser or BYPASSRLS), and one
-- policy: a row is read, written, changed or deleted only when its
-- `user_id` is `app_user_id()`, the transaction's `app.user_id` (set for
-- every request, #557 part 1) or, while a single user exists, that user.
--
-- The API connects as `capi_app` (no superuser, no BYPASSRLS, created and
-- granted by `migrate.ts`); migrations and seeds keep the owner role.
-- Referential checks and cascades bypass the policies, as Postgres does.
-- `(SELECT app_user_id())`: computed once per query, not once per row.
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "accounts_owner" ON "accounts" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "app_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "app_settings_owner" ON "app_settings" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "balance_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "balance_snapshots" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "balance_snapshots_owner" ON "balance_snapshots" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "budgets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "budgets_owner" ON "budgets" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "categories" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "categories_owner" ON "categories" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "categorization_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "categorization_rules" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "categorization_rules_owner" ON "categorization_rules" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contacts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "contacts_owner" ON "contacts" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "crypto_bitcoin_scan_addresses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crypto_bitcoin_scan_addresses" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "crypto_bitcoin_scan_addresses_owner" ON "crypto_bitcoin_scan_addresses" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "crypto_bitcoin_scans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crypto_bitcoin_scans" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "crypto_bitcoin_scans_owner" ON "crypto_bitcoin_scans" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "crypto_holdings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crypto_holdings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "crypto_holdings_owner" ON "crypto_holdings" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "crypto_imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crypto_imports" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "crypto_imports_owner" ON "crypto_imports" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "crypto_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crypto_movements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "crypto_movements_owner" ON "crypto_movements" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "crypto_transfer_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crypto_transfer_links" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "crypto_transfer_links_owner" ON "crypto_transfer_links" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "crypto_wallet_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crypto_wallet_keys" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "crypto_wallet_keys_owner" ON "crypto_wallet_keys" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "crypto_wallet_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crypto_wallet_tokens" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "crypto_wallet_tokens_owner" ON "crypto_wallet_tokens" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "dashboard_widget_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dashboard_widget_accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "dashboard_widget_accounts_owner" ON "dashboard_widget_accounts" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "dashboard_widget_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dashboard_widget_categories" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "dashboard_widget_categories_owner" ON "dashboard_widget_categories" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "dashboard_widget_envelopes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dashboard_widget_envelopes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "dashboard_widget_envelopes_owner" ON "dashboard_widget_envelopes" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dashboard_widgets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "dashboard_widgets_owner" ON "dashboard_widgets" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "deleted_default_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deleted_default_categories" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "deleted_default_categories_owner" ON "deleted_default_categories" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "dividends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dividends" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "dividends_owner" ON "dividends" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "envelope_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "envelope_categories" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "envelope_categories_owner" ON "envelope_categories" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "envelope_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "envelope_movements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "envelope_movements_owner" ON "envelope_movements" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "envelope_offer_dismissals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "envelope_offer_dismissals" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "envelope_offer_dismissals_owner" ON "envelope_offer_dismissals" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "envelope_split_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "envelope_split_keys" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "envelope_split_keys_owner" ON "envelope_split_keys" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "envelopes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "envelopes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "envelopes_owner" ON "envelopes" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "import_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "import_profiles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "import_profiles_owner" ON "import_profiles" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "imports" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "imports_owner" ON "imports" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "month_closes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "month_closes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "month_closes_owner" ON "month_closes" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "position_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "position_lines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "position_lines_owner" ON "position_lines" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "position_statements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "position_statements" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "position_statements_owner" ON "position_statements" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "receivable_offsets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "receivable_offsets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "receivable_offsets_owner" ON "receivable_offsets" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "receivable_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "receivable_payments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "receivable_payments_owner" ON "receivable_payments" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "receivables" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "receivables" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "receivables_owner" ON "receivables" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "recurring_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recurring_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "recurring_items_owner" ON "recurring_items" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "transaction_splits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transaction_splits" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "transaction_splits_owner" ON "transaction_splits" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "transactions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "transactions_owner" ON "transactions" USING ("user_id" = (SELECT app_user_id())) WITH CHECK ("user_id" = (SELECT app_user_id()));--> statement-breakpoint
-- The view reads its tables as the user who queries it, so their policies
-- apply (a view runs as its owner otherwise).
ALTER VIEW "transaction_lines" SET (security_invoker = true);
