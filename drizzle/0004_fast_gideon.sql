-- Written by hand (like 0002): drizzle-kit rebuilds the whole table for a new CHECK, and a
-- DROP TABLE inside the migrator's transaction would cascade to recurring_skips and null the
-- movements' recurring_item_id. A plain ADD COLUMN keeps every row and is purely additive.
ALTER TABLE `recurring_items` ADD `debt_id` integer REFERENCES `debts`(`id`) CONSTRAINT "recurring_items_debt_only_on_repayment" CHECK ("debt_id" IS NULL OR "kind" = 'repayment');
