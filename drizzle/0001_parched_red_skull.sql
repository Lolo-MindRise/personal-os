CREATE TABLE `recurring_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`category_id` integer NOT NULL,
	`concept` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`expected_day` integer NOT NULL,
	`start_month` text NOT NULL,
	`end_month` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`category_id`,`kind`) REFERENCES `categories`(`id`,`kind`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recurring_items_kind_valid" CHECK("recurring_items"."kind" IN ('income', 'expense', 'repayment')),
	CONSTRAINT "recurring_items_concept_not_empty" CHECK(length(trim("recurring_items"."concept")) > 0),
	CONSTRAINT "recurring_items_amount_integer" CHECK(typeof("recurring_items"."amount_cents") = 'integer'),
	CONSTRAINT "recurring_items_amount_positive" CHECK("recurring_items"."amount_cents" > 0),
	CONSTRAINT "recurring_items_day_integer" CHECK(typeof("recurring_items"."expected_day") = 'integer'),
	CONSTRAINT "recurring_items_day_range" CHECK("recurring_items"."expected_day" BETWEEN 1 AND 31),
	CONSTRAINT "recurring_items_start_month_format" CHECK("recurring_items"."start_month" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
	CONSTRAINT "recurring_items_end_month_format" CHECK("recurring_items"."end_month" IS NULL OR "recurring_items"."end_month" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
	CONSTRAINT "recurring_items_end_not_before_start" CHECK("recurring_items"."end_month" IS NULL OR "recurring_items"."end_month" >= "recurring_items"."start_month")
);
--> statement-breakpoint
CREATE TABLE `recurring_skips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recurring_item_id` integer NOT NULL,
	`month` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`recurring_item_id`) REFERENCES `recurring_items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "recurring_skips_month_format" CHECK("recurring_skips"."month" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recurring_skips_item_month_unique` ON `recurring_skips` (`recurring_item_id`,`month`);--> statement-breakpoint
-- Edited by hand: drizzle-kit omits ON DELETE for an added column. Deleting a recurring
-- item must keep its confirmed movements (the link becomes NULL), per ADR-0005 / task 0007.
ALTER TABLE `movements` ADD `recurring_item_id` integer REFERENCES recurring_items(id) ON DELETE set null;