CREATE TABLE `reconciliations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`date` text NOT NULL,
	`bank_balance_cents` integer NOT NULL,
	`app_balance_cents` integer NOT NULL,
	`difference_cents` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reconciliations_date_format" CHECK("reconciliations"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "reconciliations_bank_integer" CHECK(typeof("reconciliations"."bank_balance_cents") = 'integer'),
	CONSTRAINT "reconciliations_app_integer" CHECK(typeof("reconciliations"."app_balance_cents") = 'integer'),
	CONSTRAINT "reconciliations_difference_integer" CHECK(typeof("reconciliations"."difference_cents") = 'integer'),
	CONSTRAINT "reconciliations_difference_consistent" CHECK("reconciliations"."difference_cents" = "reconciliations"."bank_balance_cents" - "reconciliations"."app_balance_cents")
);
--> statement-breakpoint
CREATE INDEX `reconciliations_account_idx` ON `reconciliations` (`account_id`,`date`);