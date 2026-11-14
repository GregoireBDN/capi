ALTER TABLE "transactions" ADD COLUMN "manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "tracked" boolean DEFAULT false NOT NULL;