CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`opening_balance_cents` integer NOT NULL,
	`opening_balance_date` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "accounts_name_not_empty" CHECK(length(trim("accounts"."name")) > 0),
	CONSTRAINT "accounts_type_valid" CHECK("accounts"."type" IN ('bank', 'cash', 'savings')),
	CONSTRAINT "accounts_opening_balance_integer" CHECK(typeof("accounts"."opening_balance_cents") = 'integer'),
	CONSTRAINT "accounts_opening_balance_date" CHECK("accounts"."opening_balance_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_name_unique` ON `accounts` (`name`);--> statement-breakpoint
ALTER TABLE `movements` ADD `account_id` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- Hand-written part (the rest is generated and was reviewed: no DROP TABLE, no rebuild).
-- The default account "Principal" gets id 1. Its opening balance is 0, dated on the earliest
-- existing movement, or 2026-01-01 when there are none (fixed default, a fresh database).
-- Every existing movement already carries account_id 1 through the column default.
INSERT INTO `accounts` (`id`, `name`, `type`, `opening_balance_cents`, `opening_balance_date`)
VALUES (1, 'Principal', 'bank', 0, COALESCE((SELECT min(`date`) FROM `movements`), '2026-01-01'));--> statement-breakpoint
-- SQLite cannot add a NOT NULL column with a REFERENCES clause to an existing table, so the
-- foreign key is enforced by triggers instead.
CREATE TRIGGER `movements_account_exists_insert` BEFORE INSERT ON `movements`
WHEN NOT EXISTS (SELECT 1 FROM `accounts` WHERE `id` = NEW.`account_id`)
BEGIN
	SELECT RAISE(ABORT, 'movements.account_id must reference an existing account');
END;--> statement-breakpoint
CREATE TRIGGER `movements_account_exists_update` BEFORE UPDATE OF `account_id` ON `movements`
WHEN NOT EXISTS (SELECT 1 FROM `accounts` WHERE `id` = NEW.`account_id`)
BEGIN
	SELECT RAISE(ABORT, 'movements.account_id must reference an existing account');
END;--> statement-breakpoint
CREATE TRIGGER `accounts_in_use_delete` BEFORE DELETE ON `accounts`
WHEN EXISTS (SELECT 1 FROM `movements` WHERE `account_id` = OLD.`id`)
BEGIN
	SELECT RAISE(ABORT, 'an account with movements cannot be deleted');
END;