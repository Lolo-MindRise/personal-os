CREATE TABLE `transfers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`from_account_id` integer NOT NULL,
	`to_account_id` integer NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`from_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transfers_date_format" CHECK("transfers"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
	CONSTRAINT "transfers_amount_integer" CHECK(typeof("transfers"."amount_cents") = 'integer'),
	CONSTRAINT "transfers_amount_positive" CHECK("transfers"."amount_cents" > 0),
	CONSTRAINT "transfers_accounts_differ" CHECK("transfers"."from_account_id" <> "transfers"."to_account_id")
);
--> statement-breakpoint
CREATE INDEX `transfers_date_idx` ON `transfers` (`date`);--> statement-breakpoint
CREATE INDEX `transfers_from_idx` ON `transfers` (`from_account_id`);--> statement-breakpoint
CREATE INDEX `transfers_to_idx` ON `transfers` (`to_account_id`);