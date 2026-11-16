ALTER TABLE `asset_entries` ADD `cost_basis_unit_price` real;--> statement-breakpoint
ALTER TABLE `asset_entries` ADD `manual_price` real;--> statement-breakpoint
UPDATE `asset_entries` SET `cost_basis_unit_price` = `manual_unit_price` WHERE `cost_basis_unit_price` IS NULL AND `manual_unit_price` IS NOT NULL;--> statement-breakpoint
UPDATE `asset_entries` SET `manual_price` = `manual_unit_price` WHERE `manual_price` IS NULL AND `manual_unit_price` IS NOT NULL;