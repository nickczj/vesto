CREATE TABLE IF NOT EXISTS `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `asset_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`symbol` text,
	`market` text,
	`cpf_bucket` text,
	`currency` text DEFAULT 'SGD' NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`quantity` real,
	`manual_unit_price` real,
	`valuation_mode` text DEFAULT 'live_preferred' NOT NULL,
	`notes` text,
	`external_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "asset_entries_kind_check" CHECK("asset_entries"."kind" IN ('investment', 'cpf', 'cash_savings', 'manual')),
	CONSTRAINT "asset_entries_cpf_bucket_check" CHECK("asset_entries"."cpf_bucket" IN ('OA', 'SA', 'MA', 'RA')),
	CONSTRAINT "asset_entries_currency_check" CHECK("asset_entries"."currency" IN ('USD', 'SGD')),
	CONSTRAINT "asset_entries_valuation_mode_check" CHECK("asset_entries"."valuation_mode" IN ('live_preferred', 'manual_only'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `asset_entries_external_id_unique` ON `asset_entries` (`external_id`) WHERE "asset_entries"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `liability_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`currency` text DEFAULT 'SGD' NOT NULL,
	`outstanding_amount` real DEFAULT 0 NOT NULL,
	`notes` text,
	`external_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "liability_entries_type_check" CHECK("liability_entries"."type" IN ('loan', 'credit_card', 'other')),
	CONSTRAINT "liability_entries_currency_check" CHECK("liability_entries"."currency" IN ('USD', 'SGD'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `liability_entries_external_id_unique` ON `liability_entries` (`external_id`) WHERE "liability_entries"."external_id" IS NOT NULL;