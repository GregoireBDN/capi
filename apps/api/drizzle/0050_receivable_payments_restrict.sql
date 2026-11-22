-- #438: a repaid share is never removed implicitly (its repayment would
-- silently count as income). Deleting a receivable that still has repayments
-- now fails; undoing an import and deleting an account delete the
-- repayments first. Existing rows already satisfy the reference.
ALTER TABLE "receivable_payments" DROP CONSTRAINT "receivable_payments_receivable_id_receivables_id_fk";
--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_receivable_id_receivables_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."receivables"("id") ON DELETE restrict ON UPDATE no action;
