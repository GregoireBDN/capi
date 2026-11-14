CREATE TABLE "month_closes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"month" varchar(7) NOT NULL,
	"notes" text,
	"acknowledged" text[] DEFAULT '{}'::text[] NOT NULL,
	"closed_at" timestamp,
	"report" jsonb,
	CONSTRAINT "month_closes_month_unique" UNIQUE("month"),
	CONSTRAINT "month_closes_month_format" CHECK ("month_closes"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "month_closes_closed_has_report" CHECK (("month_closes"."closed_at" is null) = ("month_closes"."report" is null))
);
