ALTER TABLE "month_closes" ADD COLUMN "report_version" smallint;--> statement-breakpoint
-- Reports frozen before #369 are version 1: upgradeReport fills what they lack.
UPDATE "month_closes" SET "report_version" = 1 WHERE "report" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "month_closes" ADD CONSTRAINT "month_closes_report_has_version" CHECK (("month_closes"."report" is null) = ("month_closes"."report_version" is null));
