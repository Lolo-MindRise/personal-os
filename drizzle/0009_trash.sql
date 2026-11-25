ALTER TABLE `movements` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `transfers` ADD `deleted_at` text;--> statement-breakpoint
-- Hand-written part (the two statements above are generated and were reviewed: no DROP TABLE, no
-- rebuild; existing rows keep deleted_at NULL).
-- A trashed movement must not hold its recurring item's month slot, so the unique index only
-- covers live rows. Only the index is dropped and recreated; no row is touched.
DROP INDEX `movements_recurring_item_month_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `movements_recurring_item_month_unique` ON `movements` (`recurring_item_id`, substr(`date`, 1, 7)) WHERE `deleted_at` IS NULL;
