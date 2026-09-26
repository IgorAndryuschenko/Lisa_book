CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`kind` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`transcript` text,
	`audio_key` text,
	`duration` integer,
	`sticker` text
);
--> statement-breakpoint
CREATE INDEX `idx_entries_owner_date` ON `entries` (`owner_id`,`date`);--> statement-breakpoint
CREATE TABLE `stickers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`mime_type` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_stickers_owner` ON `stickers` (`owner_id`);--> statement-breakpoint
CREATE TABLE `todos` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_todos_owner` ON `todos` (`owner_id`);