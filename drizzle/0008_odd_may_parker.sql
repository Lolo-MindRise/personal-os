CREATE TABLE `movement_tags` (
	`movement_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`movement_id`, `tag_id`),
	FOREIGN KEY (`movement_id`) REFERENCES `movements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `movement_tags_tag_idx` ON `movement_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "tags_name_not_empty" CHECK(length(trim("tags"."name")) > 0),
	CONSTRAINT "tags_name_key_trimmed" CHECK("tags"."name_key" = trim("tags"."name_key"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_key_unique` ON `tags` (`name_key`);