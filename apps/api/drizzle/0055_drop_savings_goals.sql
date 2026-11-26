-- #493: the savings goals became envelopes in #430. `db:seed` converts them and
-- empties both tables, but it runs AFTER the migrations of a deploy: this
-- migration must only reach a database where a deploy of #430 has already
-- seeded. Any goal still there has not been converted, so stop with a count
-- (never the rows) rather than lose it.
DO $$
DECLARE
  goals integer;
  links integer;
BEGIN
  SELECT count(*) INTO goals FROM "savings_goals";
  SELECT count(*) INTO links FROM "savings_goal_accounts";
  IF goals > 0 OR links > 0 THEN
    RAISE EXCEPTION '% savings goal(s) and % goal link(s) not yet converted into envelopes: deploy #430 and run db:seed before this migration', goals, links;
  END IF;
END $$;--> statement-breakpoint
DROP TABLE "savings_goal_accounts";--> statement-breakpoint
DROP TABLE "savings_goals";--> statement-breakpoint
DROP TYPE "public"."savings_goal_source";
