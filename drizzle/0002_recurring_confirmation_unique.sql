-- Custom SQL migration (drizzle-kit cannot generate expression indexes correctly).
-- At most one confirmed movement per recurring item and month (ADR-0005).
-- Rows without a recurring item have recurring_item_id NULL, and NULLs never collide.
CREATE UNIQUE INDEX `movements_recurring_item_month_unique` ON `movements` (`recurring_item_id`, substr(`date`, 1, 7));
