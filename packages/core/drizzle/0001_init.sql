CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`bucket` text NOT NULL,
	`manifest_key` text DEFAULT 'stories.json' NOT NULL,
	`public_base_url` text NOT NULL,
	`credentials_json` text NOT NULL,
	`last_connection_check` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_name_unique` ON `projects` (`name`);--> statement-breakpoint
CREATE TABLE `publish_history` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`manifest_version` integer NOT NULL,
	`content_json` text NOT NULL,
	`story_ids_json` text NOT NULL,
	`result` text NOT NULL,
	`error_detail` text,
	`published_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `stories` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`type` text NOT NULL,
	`media_key` text NOT NULL,
	`poster_key` text,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`duration_seconds` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`cleaned_at` integer,
	`last_cleanup_error` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `story_media_pending_deletion` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text NOT NULL,
	`project_id` text NOT NULL,
	`media_key` text NOT NULL,
	`poster_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
