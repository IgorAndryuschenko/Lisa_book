CREATE TABLE `todo_dates` (
	`todo_id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_todo_dates_date` ON `todo_dates` (`date`);
