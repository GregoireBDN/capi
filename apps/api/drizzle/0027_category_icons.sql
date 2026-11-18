ALTER TABLE "categories" ADD COLUMN "icon" varchar(32);--> statement-breakpoint
-- Default categories get their icon (#266); categories created by hand stay without one.
UPDATE "categories" AS c SET "icon" = d.icon
FROM (VALUES
  ('rent', 'house'),
  ('energy', 'zap'),
  ('groceries', 'shopping-cart'),
  ('restaurants_cafes', 'utensils'),
  ('transport', 'train-front'),
  ('subscriptions', 'repeat'),
  ('insurance', 'shield'),
  ('telecom', 'smartphone'),
  ('health', 'heart-pulse'),
  ('shopping', 'shopping-bag'),
  ('leisure', 'ticket'),
  ('travel', 'plane'),
  ('bank_fees', 'landmark'),
  ('cash_withdrawal', 'banknote'),
  ('taxes', 'receipt'),
  ('gifts', 'gift'),
  ('shared_expenses', 'users'),
  ('other_expenses', 'tag'),
  ('salary', 'briefcase'),
  ('family_support', 'hand-heart'),
  ('benefits', 'hand-coins'),
  ('refunds', 'undo-2'),
  ('other_income', 'coins'),
  ('internal_transfer', 'arrow-left-right'),
  ('savings_transfer', 'piggy-bank'),
  ('investment_transfer', 'trending-up')
) AS d(slug, icon)
WHERE c.slug = d.slug AND c.icon IS NULL;
