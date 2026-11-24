CREATE TABLE `app_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`initial_savings_cents` integer NOT NULL,
	`initial_savings_date` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "app_settings_single_row" CHECK("app_settings"."id" = 1),
	CONSTRAINT "app_settings_initial_savings_integer" CHECK(typeof("app_settings"."initial_savings_cents") = 'integer'),
	CONSTRAINT "app_settings_initial_savings_not_negative" CHECK("app_settings"."initial_savings_cents" >= 0),
	CONSTRAINT "app_settings_initial_savings_date" CHECK("app_settings"."initial_savings_date" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')
);
