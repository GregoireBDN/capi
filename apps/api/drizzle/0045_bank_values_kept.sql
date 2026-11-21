-- #398: an imported transaction keeps the bank's amount and day (the owner's
-- decision); only one entered by hand changes them. Corrections made before
-- stay, and can only be undone: back to the bank's values, never a new one.
CREATE FUNCTION "transactions_bank_values_kept"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT NEW."manual" THEN
    IF (OLD."original_amount_cents" IS NULL AND NEW."original_amount_cents" IS NOT NULL)
      OR (OLD."original_booking_date" IS NULL AND NEW."original_booking_date" IS NOT NULL)
      -- Dropping a correction puts the bank's value back, never another.
      OR (OLD."original_amount_cents" IS NOT NULL AND NEW."original_amount_cents" IS NULL
        AND NEW."amount_cents" IS DISTINCT FROM OLD."original_amount_cents")
      OR (OLD."original_booking_date" IS NOT NULL AND NEW."original_booking_date" IS NULL
        AND NEW."booking_date" IS DISTINCT FROM OLD."original_booking_date")
      OR (NEW."amount_cents" IS DISTINCT FROM OLD."amount_cents"
        AND (NEW."amount_cents" IS DISTINCT FROM coalesce(OLD."original_amount_cents", OLD."amount_cents")
          OR NEW."original_amount_cents" IS NOT NULL))
      OR (NEW."booking_date" IS DISTINCT FROM OLD."booking_date"
        AND (NEW."booking_date" IS DISTINCT FROM coalesce(OLD."original_booking_date", OLD."booking_date")
          OR NEW."original_booking_date" IS NOT NULL))
    THEN
      RAISE EXCEPTION 'An imported transaction keeps its bank amount and date'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "transactions_bank_values_kept"
BEFORE UPDATE OF "amount_cents", "booking_date", "original_amount_cents", "original_booking_date" ON "transactions"
FOR EACH ROW EXECUTE FUNCTION "transactions_bank_values_kept"();
