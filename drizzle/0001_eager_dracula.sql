CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`reward_rule_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`activity_type` text NOT NULL,
	`evidence_type` text NOT NULL,
	`recurrence` text NOT NULL,
	`content_url` text,
	`starts_at` integer,
	`ends_at` integer,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`reward_rule_id`) REFERENCES `reward_rules`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "activities_type_check" CHECK(activity_type in ('quest', 'event')),
	CONSTRAINT "activities_evidence_check" CHECK(evidence_type in ('self_report', 'photo')),
	CONSTRAINT "activities_recurrence_check" CHECK(recurrence in ('daily', 'once'))
);
--> statement-breakpoint
CREATE INDEX `activities_active_idx` ON `activities` (`active`,`activity_type`);--> statement-breakpoint
CREATE INDEX `activities_reward_rule_idx` ON `activities` (`reward_rule_id`);--> statement-breakpoint
CREATE TABLE `reward_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`action_code` text NOT NULL,
	`coin_amount` integer NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	CONSTRAINT "reward_rules_coin_amount_check" CHECK(coin_amount >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reward_rules_action_code_unique` ON `reward_rules` (`action_code`);--> statement-breakpoint
CREATE TABLE `submission_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_at` integer NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "submission_photos_size_check" CHECK(size_bytes > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submission_photos_storage_key_unique` ON `submission_photos` (`storage_key`);--> statement-breakpoint
CREATE INDEX `submission_photos_submission_idx` ON `submission_photos` (`submission_id`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`period_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` text,
	`submitted_at` integer NOT NULL,
	`reviewed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "submissions_status_check" CHECK(status in ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_user_activity_period_idx` ON `submissions` (`user_id`,`activity_id`,`period_key`);--> statement-breakpoint
CREATE INDEX `submissions_status_idx` ON `submissions` (`status`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `submissions_user_idx` ON `submissions` (`user_id`);--> statement-breakpoint
CREATE INDEX `submissions_activity_idx` ON `submissions` (`activity_id`);--> statement-breakpoint
CREATE TABLE `decor_items` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`price_coins` integer NOT NULL,
	`asset_key` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	CONSTRAINT "decor_items_price_check" CHECK(price_coins >= 0)
);
--> statement-breakpoint
CREATE INDEX `decor_items_active_idx` ON `decor_items` (`active`,`category`);--> statement-breakpoint
CREATE TABLE `houses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`base_asset_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `houses_user_id_unique` ON `houses` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`placed_house_id` text,
	`purchase_price_coins` integer NOT NULL,
	`position_x` real,
	`position_y` real,
	`rotation` real,
	`acquired_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `decor_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`placed_house_id`) REFERENCES `houses`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "user_items_price_check" CHECK(purchase_price_coins >= 0)
);
--> statement-breakpoint
CREATE INDEX `user_items_user_idx` ON `user_items` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_items_placed_idx` ON `user_items` (`placed_house_id`);--> statement-breakpoint
CREATE INDEX `user_items_item_idx` ON `user_items` (`item_id`);--> statement-breakpoint
CREATE TABLE `coin_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`reward_rule_id` text,
	`amount` integer NOT NULL,
	`transaction_type` text NOT NULL,
	`source_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reward_rule_id`) REFERENCES `reward_rules`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "coin_transactions_type_check" CHECK(transaction_type in ('activity_reward', 'referral_reward', 'purchase'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coin_transactions_source_key_unique` ON `coin_transactions` (`source_key`);--> statement-breakpoint
CREATE INDEX `coin_transactions_user_idx` ON `coin_transactions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `coin_transactions_rule_idx` ON `coin_transactions` (`reward_rule_id`);--> statement-breakpoint
CREATE TABLE `friendships` (
	`id` text PRIMARY KEY NOT NULL,
	`requester_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`pair_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`responded_at` integer,
	FOREIGN KEY (`requester_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "friendships_no_self_check" CHECK(requester_id <> recipient_id),
	CONSTRAINT "friendships_status_check" CHECK(status in ('pending', 'accepted', 'declined'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `friendships_pair_idx` ON `friendships` (`pair_key`);--> statement-breakpoint
CREATE INDEX `friendships_requester_idx` ON `friendships` (`requester_id`);--> statement-breakpoint
CREATE INDEX `friendships_recipient_idx` ON `friendships` (`recipient_id`,`status`);--> statement-breakpoint
CREATE TABLE `invite_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_codes_user_id_unique` ON `invite_codes` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invite_codes_code_unique` ON `invite_codes` (`code`);--> statement-breakpoint
CREATE TABLE `referrals` (
	`id` text PRIMARY KEY NOT NULL,
	`inviter_id` text NOT NULL,
	`invited_user_id` text NOT NULL,
	`qualified_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`inviter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "referrals_no_self_check" CHECK(inviter_id <> invited_user_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `referrals_invited_user_id_unique` ON `referrals` (`invited_user_id`);--> statement-breakpoint
CREATE INDEX `referrals_inviter_idx` ON `referrals` (`inviter_id`);--> statement-breakpoint
ALTER TABLE `session` ADD `impersonatedBy` text;--> statement-breakpoint
ALTER TABLE `user` ADD `role` text DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `user` ADD `banned` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `user` ADD `banReason` text;--> statement-breakpoint
ALTER TABLE `user` ADD `banExpires` integer;