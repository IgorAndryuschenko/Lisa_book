CREATE TABLE `writing_books` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`color` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_writing_books_owner` ON `writing_books` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `writing_days` (
	`book_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`date` text NOT NULL,
	`actual_chars` integer,
	`worked` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`book_id`, `date`)
);
--> statement-breakpoint
CREATE INDEX `idx_writing_days_owner_date` ON `writing_days` (`owner_id`,`date`);--> statement-breakpoint
CREATE TABLE `writing_months` (
	`book_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`month` text NOT NULL,
	`target_chars` integer DEFAULT 0 NOT NULL,
	`work_days` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`book_id`, `month`)
);
--> statement-breakpoint
CREATE INDEX `idx_writing_months_owner` ON `writing_months` (`owner_id`);