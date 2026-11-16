CREATE TABLE `valuation_history` (
	`as_of_date` text PRIMARY KEY NOT NULL,
	`captured_at` text NOT NULL,
	`net_worth_usd` real NOT NULL,
	`net_worth_sgd` real NOT NULL,
	`assets_usd` real NOT NULL,
	`liabilities_usd` real NOT NULL,
	`fx_usd_sgd` real NOT NULL,
	`priced` integer NOT NULL,
	`unpriced` integer NOT NULL,
	`is_complete` integer NOT NULL
);
