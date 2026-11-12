-- Hand-edited: adds 'weekly' to activities.recurrence.
--
-- SQLite can only change a CHECK constraint by rebuilding the table. Drizzle's
-- generated rebuild relies on `PRAGMA foreign_keys=OFF`, but the migrator runs
-- migrations inside a transaction, where that pragma is a no-op. With foreign
-- keys still on, `DROP TABLE activities` cascades: it deletes every row in
-- `submissions`, and from there every row in `submission_photos`.
--
-- So the two dependent tables are copied aside first (CREATE TABLE ... AS
-- SELECT carries no constraints, so nothing cascades into the copies) and
-- restored once the new `activities` table is in place. This is correct
-- whether foreign keys are on or off.
CREATE TABLE `__backup_submissions` AS SELECT * FROM `submissions`;--> statement-breakpoint
CREATE TABLE `__backup_submission_photos` AS SELECT * FROM `submission_photos`;--> statement-breakpoint
CREATE TABLE `__new_activities` (
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
	CONSTRAINT "activities_recurrence_check" CHECK(recurrence in ('daily', 'weekly', 'once'))
);
--> statement-breakpoint
INSERT INTO `__new_activities`("id", "reward_rule_id", "title", "description", "activity_type", "evidence_type", "recurrence", "content_url", "starts_at", "ends_at", "active") SELECT "id", "reward_rule_id", "title", "description", "activity_type", "evidence_type", "recurrence", "content_url", "starts_at", "ends_at", "active" FROM `activities`;--> statement-breakpoint
DROP TABLE `activities`;--> statement-breakpoint
ALTER TABLE `__new_activities` RENAME TO `activities`;--> statement-breakpoint
CREATE INDEX `activities_active_idx` ON `activities` (`active`,`activity_type`);--> statement-breakpoint
CREATE INDEX `activities_reward_rule_idx` ON `activities` (`reward_rule_id`);--> statement-breakpoint
-- The DROP above may have emptied these through ON DELETE CASCADE; clear any
-- survivors (foreign keys off) so the restore cannot hit a unique conflict.
DELETE FROM `submission_photos`;--> statement-breakpoint
DELETE FROM `submissions`;--> statement-breakpoint
INSERT INTO `submissions`("id", "user_id", "activity_id", "period_key", "status", "reviewed_by", "submitted_at", "reviewed_at") SELECT "id", "user_id", "activity_id", "period_key", "status", "reviewed_by", "submitted_at", "reviewed_at" FROM `__backup_submissions`;--> statement-breakpoint
INSERT INTO `submission_photos`("id", "submission_id", "storage_key", "mime_type", "size_bytes", "uploaded_at") SELECT "id", "submission_id", "storage_key", "mime_type", "size_bytes", "uploaded_at" FROM `__backup_submission_photos`;--> statement-breakpoint
DROP TABLE `__backup_submission_photos`;--> statement-breakpoint
DROP TABLE `__backup_submissions`;
