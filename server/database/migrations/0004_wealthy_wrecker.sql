PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_asset_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`symbol` text,
	`market` text,
	`cpf_bucket` text,
	`currency` text DEFAULT 'SGD' NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`quantity` real,
	`cost_basis_unit_price` real,
	`manual_price` real,
	`valuation_mode` text DEFAULT 'live_preferred' NOT NULL,
	`notes` text,
	`external_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "asset_entries_kind_check" CHECK("__new_asset_entries"."kind" IN ('investment', 'cpf', 'cash_savings', 'manual')),
	CONSTRAINT "asset_entries_cpf_bucket_check" CHECK("__new_asset_entries"."cpf_bucket" IN ('OA', 'SA', 'MA', 'RA')),
	CONSTRAINT "asset_entries_currency_check" CHECK("__new_asset_entries"."currency" IN ('USD', 'SGD', 'HKD')),
	CONSTRAINT "asset_entries_valuation_mode_check" CHECK("__new_asset_entries"."valuation_mode" IN ('live_preferred', 'manual_only'))
);
--> statement-breakpoint
INSERT INTO `__new_asset_entries`("id", "kind", "name", "symbol", "market", "cpf_bucket", "currency", "amount", "quantity", "cost_basis_unit_price", "manual_price", "valuation_mode", "notes", "external_id", "created_at", "updated_at") SELECT "id", "kind", "name", "symbol", "market", "cpf_bucket", "currency", "amount", "quantity", "cost_basis_unit_price", "manual_price", "valuation_mode", "notes", "external_id", "created_at", "updated_at" FROM `asset_entries`;--> statement-breakpoint
DROP TABLE `asset_entries`;--> statement-breakpoint
ALTER TABLE `__new_asset_entries` RENAME TO `asset_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `asset_entries_external_id_unique` ON `asset_entries` (`external_id`) WHERE "asset_entries"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_liability_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`currency` text DEFAULT 'SGD' NOT NULL,
	`outstanding_amount` real DEFAULT 0 NOT NULL,
	`notes` text,
	`external_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "liability_entries_type_check" CHECK("__new_liability_entries"."type" IN ('loan', 'credit_card', 'other')),
	CONSTRAINT "liability_entries_currency_check" CHECK("__new_liability_entries"."currency" IN ('USD', 'SGD', 'HKD'))
);
--> statement-breakpoint
INSERT INTO `__new_liability_entries`("id", "type", "name", "currency", "outstanding_amount", "notes", "external_id", "created_at", "updated_at") SELECT "id", "type", "name", "currency", "outstanding_amount", "notes", "external_id", "created_at", "updated_at" FROM `liability_entries`;--> statement-breakpoint
DROP TABLE `liability_entries`;--> statement-breakpoint
ALTER TABLE `__new_liability_entries` RENAME TO `liability_entries`;--> statement-breakpoint
CREATE UNIQUE INDEX `liability_entries_external_id_unique` ON `liability_entries` (`external_id`) WHERE "liability_entries"."external_id" IS NOT NULL;