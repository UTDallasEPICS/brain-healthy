CREATE TABLE `coin_transaction` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`amount` integer NOT NULL,
	`type` text NOT NULL,
	`reason` text NOT NULL,
	`referenceId` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coin_transaction_activity_unique` ON `coin_transaction` (`userId`,`reason`,`referenceId`);--> statement-breakpoint
CREATE INDEX `coin_transaction_user_created_idx` ON `coin_transaction` (`userId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `reward_configuration` (
	`activityType` text PRIMARY KEY NOT NULL,
	`coinAmount` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `reward_configuration` (`activityType`, `coinAmount`, `updatedAt`) VALUES
	('individual_quest_completion', 1, unixepoch()),
	('qr_event_check_in', 5, unixepoch()),
	('social_engagement', 5, unixepoch()),
	('verified_friend_referral', 30, unixepoch());
