CREATE TYPE "public"."savings_goal_source" AS ENUM('accounts', 'manual');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" jsonb NOT NULL,
	CONSTRAINT "app_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "savings_goal_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"goal_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	CONSTRAINT "savings_goal_accounts_goal_account_unique" UNIQUE("goal_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "savings_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" varchar(100) NOT NULL,
	"target_cents" bigint NOT NULL,
	"target_date" date,
	"source" "savings_goal_source" DEFAULT 'accounts' NOT NULL,
	"manual_amount_cents" bigint,
	"color" varchar(16),
	"archived_at" timestamp,
	CONSTRAINT "savings_goals_target_positive" CHECK ("savings_goals"."target_cents" > 0),
	CONSTRAINT "savings_goals_manual_amount_non_negative" CHECK ("savings_goals"."manual_amount_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "savings_goal_accounts" ADD CONSTRAINT "savings_goal_accounts_goal_id_savings_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."savings_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goal_accounts" ADD CONSTRAINT "savings_goal_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "savings_goal_accounts_account_id_index" ON "savings_goal_accounts" USING btree ("account_id");