CREATE TABLE `budget_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`valid_from` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "budget_lines_amount_integer" CHECK(typeof("budget_lines"."amount_cents") = 'integer'),
	CONSTRAINT "budget_lines_amount_positive" CHECK("budget_lines"."amount_cents" > 0),
	CONSTRAINT "budget_lines_valid_from_month" CHECK("budget_lines"."valid_from" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budget_lines_category_valid_from_unique` ON `budget_lines` (`category_id`,`valid_from`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "categories_name_not_empty" CHECK(length(trim("categories"."name")) > 0),
	CONSTRAINT "categories_kind_valid" CHECK("categories"."kind" IN ('income', 'expense', 'repayment'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_id_kind_unique` ON `categories` (`id`,`kind`);--> statement-breakpoint
CREATE TABLE `debts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`monthly_payment_cents` integer NOT NULL,
	`balance_cents` integer NOT NULL,
	`balance_as_of` text NOT NULL,
	`remaining_installments` integer NOT NULL,
	`annual_rate_bps` integer NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "debts_name_not_empty" CHECK(length(trim("debts"."name")) > 0),
	CONSTRAINT "debts_monthly_payment_integer" CHECK(typeof("debts"."monthly_payment_cents") = 'integer'),
	CONSTRAINT "debts_balance_integer" CHECK(typeof("debts"."balance_cents") = 'integer'),
	CONSTRAINT "debts_installments_integer" CHECK(typeof("debts"."remaining_installments") = 'integer'),
	CONSTRAINT "debts_rate_integer" CHECK(typeof("debts"."annual_rate_bps") = 'integer'),
	CONSTRAINT "debts_monthly_payment_positive" CHECK("debts"."monthly_payment_cents" > 0),
	CONSTRAINT "debts_balance_not_negative" CHECK("debts"."balance_cents" >= 0),
	CONSTRAINT "debts_balance_as_of_date" CHECK("debts"."balance_as_of" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "debts_installments_not_negative" CHECK("debts"."remaining_installments" >= 0),
	CONSTRAINT "debts_rate_not_negative" CHECK("debts"."annual_rate_bps" >= 0)
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`target_amount_cents` integer NOT NULL,
	`target_date` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "goals_name_not_empty" CHECK(length(trim("goals"."name")) > 0),
	CONSTRAINT "goals_target_amount_integer" CHECK(typeof("goals"."target_amount_cents") = 'integer'),
	CONSTRAINT "goals_target_amount_positive" CHECK("goals"."target_amount_cents" > 0),
	CONSTRAINT "goals_target_date_format" CHECK("goals"."target_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`target_date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "milestones_status_valid" CHECK("milestones"."status" IN ('pending', 'in_progress', 'done')),
	CONSTRAINT "milestones_title_not_empty" CHECK(length(trim("milestones"."title")) > 0),
	CONSTRAINT "milestones_target_date_format" CHECK("milestones"."target_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
CREATE TABLE `movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`category_id` integer NOT NULL,
	`concept` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`notes` text,
	`debt_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`,`kind`) REFERENCES `categories`(`id`,`kind`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "movements_kind_valid" CHECK("movements"."kind" IN ('income', 'expense', 'repayment')),
	CONSTRAINT "movements_date_format" CHECK("movements"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "movements_amount_integer" CHECK(typeof("movements"."amount_cents") = 'integer'),
	CONSTRAINT "movements_amount_positive" CHECK("movements"."amount_cents" > 0),
	CONSTRAINT "movements_concept_not_empty" CHECK(length(trim("movements"."concept")) > 0),
	CONSTRAINT "movements_debt_only_on_repayment" CHECK("movements"."debt_id" IS NULL OR "movements"."kind" = 'repayment')
);
--> statement-breakpoint
CREATE INDEX `movements_date_idx` ON `movements` (`date`);--> statement-breakpoint
CREATE INDEX `movements_category_idx` ON `movements` (`category_id`);