CREATE TABLE `appearances` (
	`snapshot` text NOT NULL,
	`match` text NOT NULL,
	`user` text NOT NULL,
	`opponent` text NOT NULL,
	`country` integer NOT NULL,
	`enemy` integer NOT NULL,
	`result` integer NOT NULL,
	`start` integer NOT NULL,
	`map` text NOT NULL,
	PRIMARY KEY(`snapshot`, `match`, `user`)
);
--> statement-breakpoint
CREATE INDEX `appearance_filter` ON `appearances` (`snapshot`,`user`,`start`);--> statement-breakpoint
CREATE INDEX `appearance_start` ON `appearances` (`snapshot`,`start`);--> statement-breakpoint
CREATE TABLE `site_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `games` (
	`snapshot` text NOT NULL,
	`match` text NOT NULL,
	`start` integer NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`snapshot`, `match`)
);
--> statement-breakpoint
CREATE INDEX `games_start` ON `games` (`snapshot`,`start`);--> statement-breakpoint
CREATE TABLE `sync_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`data` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pending` (
	`snapshot` text NOT NULL,
	`match` text NOT NULL,
	`user` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`snapshot`, `match`, `user`)
);
--> statement-breakpoint
CREATE TABLE `rankings` (
	`snapshot` text NOT NULL,
	`user` text NOT NULL,
	`rank` integer NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`snapshot`, `user`)
);
--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`season` integer NOT NULL,
	`cutoff` integer NOT NULL,
	`created` integer NOT NULL,
	`status` text NOT NULL,
	`meta` text NOT NULL
);
