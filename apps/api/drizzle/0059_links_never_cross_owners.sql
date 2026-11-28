-- ADR 0009 (#555, part 2): a link never crosses owners.
--
-- Every private table that others point at gets UNIQUE (id, user_id), and
-- every link between private tables gets a composite foreign key
-- (x_id, user_id) -> parent (id, user_id) with the same ON DELETE as the
-- link's own key (SET NULL names its column, so the owner is never nulled).
-- The single-column keys declared in the Drizzle schemas stay: the
-- composite ones are added beside them, and owner.spec.ts checks that every
-- link has one. A row of one user can't point at another user's row,
-- whatever the code does.
--
-- Existing rows all belong to the single user since 0058; a link that
-- crossed owners would stop this migration with a foreign key error.
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_id_owner_unique" UNIQUE ("id", "user_id");
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_id_owner_unique" UNIQUE ("id", "user_id");
--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_id_owner_unique" UNIQUE ("id", "user_id");
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_id_owner_unique" UNIQUE ("id", "user_id");
--> statement-breakpoint
ALTER TABLE "crypto_bitcoin_scans" ADD CONSTRAINT "crypto_bitcoin_scans_id_owner_unique" UNIQUE ("id", "user_id");
--> statement-breakpoint
ALTER TABLE "crypto_imports" ADD CONSTRAINT "crypto_imports_id_owner_unique" UNIQUE ("id", "user_id");
--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD CONSTRAINT "crypto_movements_id_owner_unique" UNIQUE ("id", "user_id");
--> statement-breakpoint
ALTER TABLE "crypto_wallet_keys" ADD CONSTRAINT "crypto_wallet_keys_id_owner_unique" UNIQUE ("id", "user_id");
--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_id_owner_unique" UNIQUE ("id", "user_id");
--> statement-breakpoint
ALTER TABLE "envelopes" ADD CONSTRAINT "envelopes_id_owner_unique" UNIQUE ("id", "user_id");
--> statement-breakpoint
ALTER TABLE "import_profiles" ADD CONSTRAINT "import_profiles_id_owner_unique" UNIQUE ("id", "user_id");
--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_id_owner_unique" UNIQUE ("id", "user_id");
--> statement-breakpoint
ALTER TABLE "position_statements" ADD CONSTRAINT "position_statements_id_owner_unique" UNIQUE ("id", "user_id");
--> statement-breakpoint
ALTER TABLE "receivable_offsets" ADD CONSTRAINT "receivable_offsets_id_owner_unique" UNIQUE ("id", "user_id");
--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_id_owner_unique" UNIQUE ("id", "user_id");
--> statement-breakpoint
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_id_owner_unique" UNIQUE ("id", "user_id");
--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_id_owner_unique" UNIQUE ("id", "user_id");
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_id_owner_unique" UNIQUE ("id", "user_id");
--> statement-breakpoint
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_account_id_owner_fk" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_account_id_owner_fk" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_category_id_owner_fk" FOREIGN KEY ("category_id", "user_id") REFERENCES "categories" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_counterpart_account_id_owner_fk" FOREIGN KEY ("counterpart_account_id", "user_id") REFERENCES "accounts" ("id", "user_id") ON DELETE SET NULL ("counterpart_account_id");
--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_account_id_owner_fk" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts" ("id", "user_id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_profile_id_owner_fk" FOREIGN KEY ("profile_id", "user_id") REFERENCES "import_profiles" ("id", "user_id") ON DELETE SET NULL ("profile_id");
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_owner_fk" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts" ("id", "user_id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_owner_fk" FOREIGN KEY ("category_id", "user_id") REFERENCES "categories" ("id", "user_id") ON DELETE SET NULL ("category_id");
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_counterpart_account_id_owner_fk" FOREIGN KEY ("counterpart_account_id", "user_id") REFERENCES "accounts" ("id", "user_id") ON DELETE SET NULL ("counterpart_account_id");
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_id_owner_fk" FOREIGN KEY ("import_id", "user_id") REFERENCES "imports" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_paid_by_contact_id_owner_fk" FOREIGN KEY ("paid_by_contact_id", "user_id") REFERENCES "contacts" ("id", "user_id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_prepaid_item_id_owner_fk" FOREIGN KEY ("prepaid_item_id", "user_id") REFERENCES "recurring_items" ("id", "user_id") ON DELETE SET NULL ("prepaid_item_id");
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_rule_id_owner_fk" FOREIGN KEY ("rule_id", "user_id") REFERENCES "categorization_rules" ("id", "user_id") ON DELETE SET NULL ("rule_id");
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_owner_fk" FOREIGN KEY ("category_id", "user_id") REFERENCES "categories" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_account_id_owner_fk" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_category_id_owner_fk" FOREIGN KEY ("category_id", "user_id") REFERENCES "categories" ("id", "user_id") ON DELETE SET NULL ("category_id");
--> statement-breakpoint
ALTER TABLE "recurring_items" ADD CONSTRAINT "recurring_items_share_contact_id_owner_fk" FOREIGN KEY ("share_contact_id", "user_id") REFERENCES "contacts" ("id", "user_id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "crypto_holdings" ADD CONSTRAINT "crypto_holdings_account_id_owner_fk" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_category_id_owner_fk" FOREIGN KEY ("category_id", "user_id") REFERENCES "categories" ("id", "user_id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transaction_id_owner_fk" FOREIGN KEY ("transaction_id", "user_id") REFERENCES "transactions" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "crypto_wallet_keys" ADD CONSTRAINT "crypto_wallet_keys_account_id_owner_fk" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "crypto_imports" ADD CONSTRAINT "crypto_imports_account_id_owner_fk" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts" ("id", "user_id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD CONSTRAINT "crypto_movements_account_id_owner_fk" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD CONSTRAINT "crypto_movements_counterpart_account_id_owner_fk" FOREIGN KEY ("counterpart_account_id", "user_id") REFERENCES "accounts" ("id", "user_id") ON DELETE SET NULL ("counterpart_account_id");
--> statement-breakpoint
ALTER TABLE "crypto_movements" ADD CONSTRAINT "crypto_movements_import_id_owner_fk" FOREIGN KEY ("import_id", "user_id") REFERENCES "crypto_imports" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "crypto_wallet_tokens" ADD CONSTRAINT "crypto_wallet_tokens_account_id_owner_fk" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "crypto_bitcoin_scan_addresses" ADD CONSTRAINT "crypto_bitcoin_scan_addresses_scan_id_owner_fk" FOREIGN KEY ("scan_id", "user_id") REFERENCES "crypto_bitcoin_scans" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "crypto_bitcoin_scans" ADD CONSTRAINT "crypto_bitcoin_scans_key_id_owner_fk" FOREIGN KEY ("key_id", "user_id") REFERENCES "crypto_wallet_keys" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_offset_id_owner_fk" FOREIGN KEY ("offset_id", "user_id") REFERENCES "receivable_offsets" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_receivable_id_owner_fk" FOREIGN KEY ("receivable_id", "user_id") REFERENCES "receivables" ("id", "user_id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_split_id_owner_fk" FOREIGN KEY ("split_id", "user_id") REFERENCES "transaction_splits" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_transaction_id_owner_fk" FOREIGN KEY ("transaction_id", "user_id") REFERENCES "transactions" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_contact_id_owner_fk" FOREIGN KEY ("contact_id", "user_id") REFERENCES "contacts" ("id", "user_id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_recurring_item_id_owner_fk" FOREIGN KEY ("recurring_item_id", "user_id") REFERENCES "recurring_items" ("id", "user_id") ON DELETE SET NULL ("recurring_item_id");
--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_split_id_owner_fk" FOREIGN KEY ("split_id", "user_id") REFERENCES "transaction_splits" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_transaction_id_owner_fk" FOREIGN KEY ("transaction_id", "user_id") REFERENCES "transactions" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "crypto_transfer_links" ADD CONSTRAINT "crypto_transfer_links_in_movement_id_owner_fk" FOREIGN KEY ("in_movement_id", "user_id") REFERENCES "crypto_movements" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "crypto_transfer_links" ADD CONSTRAINT "crypto_transfer_links_out_movement_id_owner_fk" FOREIGN KEY ("out_movement_id", "user_id") REFERENCES "crypto_movements" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "position_lines" ADD CONSTRAINT "position_lines_statement_id_owner_fk" FOREIGN KEY ("statement_id", "user_id") REFERENCES "position_statements" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "position_statements" ADD CONSTRAINT "position_statements_account_id_owner_fk" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "dividends" ADD CONSTRAINT "dividends_account_id_owner_fk" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "envelope_categories" ADD CONSTRAINT "envelope_categories_category_id_owner_fk" FOREIGN KEY ("category_id", "user_id") REFERENCES "categories" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "envelope_categories" ADD CONSTRAINT "envelope_categories_envelope_id_owner_fk" FOREIGN KEY ("envelope_id", "user_id") REFERENCES "envelopes" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "envelope_movements" ADD CONSTRAINT "envelope_movements_account_id_owner_fk" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "envelope_movements" ADD CONSTRAINT "envelope_movements_counter_envelope_id_owner_fk" FOREIGN KEY ("counter_envelope_id", "user_id") REFERENCES "envelopes" ("id", "user_id") ON DELETE SET NULL ("counter_envelope_id");
--> statement-breakpoint
ALTER TABLE "envelope_movements" ADD CONSTRAINT "envelope_movements_envelope_id_owner_fk" FOREIGN KEY ("envelope_id", "user_id") REFERENCES "envelopes" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "envelope_movements" ADD CONSTRAINT "envelope_movements_transaction_id_owner_fk" FOREIGN KEY ("transaction_id", "user_id") REFERENCES "transactions" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "envelope_offer_dismissals" ADD CONSTRAINT "envelope_offer_dismissals_transaction_id_owner_fk" FOREIGN KEY ("transaction_id", "user_id") REFERENCES "transactions" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "envelope_split_keys" ADD CONSTRAINT "envelope_split_keys_account_id_owner_fk" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "envelope_split_keys" ADD CONSTRAINT "envelope_split_keys_envelope_id_owner_fk" FOREIGN KEY ("envelope_id", "user_id") REFERENCES "envelopes" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "receivable_offsets" ADD CONSTRAINT "receivable_offsets_contact_id_owner_fk" FOREIGN KEY ("contact_id", "user_id") REFERENCES "contacts" ("id", "user_id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "dashboard_widget_accounts" ADD CONSTRAINT "dashboard_widget_accounts_account_id_owner_fk" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "dashboard_widget_accounts" ADD CONSTRAINT "dashboard_widget_accounts_widget_id_owner_fk" FOREIGN KEY ("widget_id", "user_id") REFERENCES "dashboard_widgets" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "dashboard_widget_envelopes" ADD CONSTRAINT "dashboard_widget_envelopes_envelope_id_owner_fk" FOREIGN KEY ("envelope_id", "user_id") REFERENCES "envelopes" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "dashboard_widget_envelopes" ADD CONSTRAINT "dashboard_widget_envelopes_widget_id_owner_fk" FOREIGN KEY ("widget_id", "user_id") REFERENCES "dashboard_widgets" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "dashboard_widget_categories" ADD CONSTRAINT "dashboard_widget_categories_category_id_owner_fk" FOREIGN KEY ("category_id", "user_id") REFERENCES "categories" ("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "dashboard_widget_categories" ADD CONSTRAINT "dashboard_widget_categories_widget_id_owner_fk" FOREIGN KEY ("widget_id", "user_id") REFERENCES "dashboard_widgets" ("id", "user_id") ON DELETE CASCADE;
