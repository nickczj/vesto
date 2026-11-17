# UI redesign

Tracks the redesign of the balance-sheet page that came out of the 2026-11-17
UI review. It records the direction, the findings, the slices and what has
shipped.

`AGENTS.md` stays authoritative for the UI contract. Where this document
proposes something the contract does not allow yet, the contract wins until the
slice that changes it merges (see [Contract changes](#contract-changes)).

Mockup (private canvas, sample figures only):
<https://claude.ai/artifact/Q5MzcA7Nr1b65yidPn5qby>

## Status

| Slice | Scope | Branch | Status |
| --- | --- | --- | --- |
| 1 | Foundations: fix what is broken (F1–F4) | `ui-redesign-foundations` | Merged in #24 |
| 2 | Keyboard, failure states, page basics (F5–F8) | `ui-redesign-foundations` | Merged in #24 |
| 3 | Ledger table (U1, U4, U5, U7) | `ui-redesign-foundations` | Merged in #24 |
| 4 | Header and net-worth hero (U2, U3) | `ui-redesign-foundations` | Merged in #24 |
| 5 | Palette, type scale, flatter surfaces | `ui-redesign-foundations` | Merged in #24 |
| 6 | Add/edit dialog (U6) | `ui-redesign-foundations` | Merged in #24 |

All six slices were developed on `ui-redesign-foundations`, in this order, with
at least one commit per slice, then squash-merged to `main` as `d945565`
(PR #24) on 2026-11-17 and deployed (run `44042860285`). The branch is deleted
locally and on the remote. Slices 1 and 2 changed behaviour without changing
the look, so they did not depend on any decision below.

Verified live after the merge (2026-11-17, 16:19 SGT): the ledger, the
net-worth headline, the change since the 08:00 snapshot, the drawdown, the
history card and parentheses for losses all render, and the header chip reports
the last quote time. A cold load with `prefers-color-scheme: dark` and a stored
`light` preference stays light and keeps `color-scheme: light`, which closes the
slice 2 check. The deployed image is tagged
`sha-d945565ea00a765c7f1195b35e758d81f804fefd`; the docs commit that followed it
redeployed the same code. Playwright e2e is still unrun.

## Direction

**A statement, not a dashboard.** The page is a personal balance sheet, so it
borrows from the ledger rather than from the card grid.

- **One headline.** Net worth is the largest thing on the page, with
  "assets less liabilities" beneath it. It replaces the four KPI cards.
- **The table is the page.** No box around the header, no separate FX card.
  History sits beside the headline at a fixed height.
- **Ledger conventions.** Figures are right-aligned and tabular. The currency is
  named once in the column header. A single rule sits above each subtotal and a
  double rule under net worth. Losses and liabilities are in parentheses; gains
  carry a plus sign.
- **Colour only means something.** Green is gain, red is loss, amber is a price
  that is not live. The one primary action is solid ink. Nothing else is
  coloured.

### Tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| paper | `#F3F5F0` | `#0F151B` | Page ground |
| ink | `#15212B` | `#E8EDEF` | Text, strong rules, primary button |
| muted | `#55626B` | `#9BA8B1` | Labels, secondary figures |
| rule | `#DCE2D9` | `#232E37` | Row lines, chart grid |
| control | `#FFFFFF` | `#18212A` | Button and input fill |
| edge | `#7F8A83` | `#66747F` | Control borders (3:1 on paper) |
| gain | `#0A6B3B` | `#63D391` | Positive P&L |
| loss | `#B42318` | `#FF9288` | Negative P&L |
| amber | `#8A5000` / dot `#C77800` | `#F2B65C` | Stale or last-close price |

Text pairs were checked at 4.5:1 or better in both themes.

Type: IBM Plex Sans (already loaded) at 400, 500 and 600. Four sizes: 12
(captions, column heads), 14 (body, table), 16 (page title, net-worth row) and
48 (headline figure). Labels are sentence case.

## Findings

Verified in the browser against a local run on 2026-11-17.

### Broken

| ID | Finding | Slice |
| --- | --- | --- |
| F1 | Nuxt UI and Tailwind CSS are never imported, so every `UButton` renders as a raw browser button and `color`, `variant` and `:loading` do nothing. | 1 |
| F2 | The sticky header does not stick: `.table-shell` has `overflow: auto`, which makes it the scroll container. | 1 |
| F3 | A descending sort reverses the section order (Liabilities first), because the section comparator is inverted with the value. | 1 |
| F4 | The history chart scales with the page width (398px tall at 1440px, ~21px axis labels) and pushes the table below the fold. | 1 |
| F5 | Modals ignore the keyboard: focus stays on the trigger, Esc only works once focus is inside, Tab walks the page behind. | 2 |
| F6 | Failure states mislead: "Last snapshot" advances on a failed refresh, the provider chip reads the same whether one scraper flaked or the backend is down, and the banner prints raw fetch errors. | 2 |
| F7 | Stale prices are invisible unless the Source column is on. | 2 |
| F8 | No `<title>`, `lang` or `color-scheme`; the theme is applied client-side only, so dark users likely see a light first paint. | 2 |

### Usability

| ID | Finding | Slice |
| --- | --- | --- |
| U1 | Figures are left-aligned; subtotals and totals are a sentence in one merged cell. | 3 |
| U2 | Nothing is the headline: net worth is body-sized and appears four times. | 4 |
| U3 | Seven equal-weight header buttons and two lines of permanent instructional copy. | 4 |
| U4 | Edit and Delete on every row (42 buttons); the delete confirm does not name the row. | 3 |
| U5 | No quantity, ticker, return or weight columns; Bought/Current are empty for non-investments. | 3 |
| U6 | Add Asset is one 690px-wide column, 841px tall; a bad ticker saves silently. | 6 |
| U7 | Section headers are unpadded; `-` and `—` are mixed; view options live in two places. | 3 |

## Slices

### Slice 1 — Foundations

Fixes only. The page should look the way the existing code already intends.

- [x] **F1** Import `tailwindcss` and `@nuxt/ui` in `app/assets/css/main.css`;
      repair what the Tailwind reset changes (heading weight, list bullets,
      line height); keep one owner for the `dark` class.
- [x] **F2** Sticky header works with page scroll whenever the table fits its
      container.
- [x] **F3** Sorting keeps the section order and keeps empty values last in
      both directions; covered by a unit test.
- [x] **F4** The history chart has a fixed height and draws at the measured
      width, so its text no longer scales.

How each was done, and what is left open:

- **F1** `nuxt.config.ts` sets `ui.colorMode: false`, so
  `app/plugins/theme.client.ts` stays the only owner of the `dark` class and
  `data-theme`. Nuxt UI's `primary` and `warning` colours are pointed at the
  page's own `--primary` and `--warning`, so the buttons match in both themes.
  Tailwind v4 no longer gives buttons a pointer cursor; a base rule restores it.
  Slice 2 (F8) should hand the theme to Nuxt UI's colour mode instead, because
  that is what gets the first paint right.
- **F2** The shell keeps `overflow: auto` only while the table is wider than
  it. A `ResizeObserver` in `BalanceSheetTable.vue` adds `fits-width` when the
  table fits, and that class switches the shell to `overflow: clip`, which is
  not a scroll container. `.page-shell` got `grid-template-columns:
  minmax(0, 1fr)`; without it the clipped shell widened the whole page to the
  table's 980px minimum on a narrow window.
  **Known limit:** while the table is wider than its shell it scrolls sideways
  inside the shell and the header does not stick. Slice 3 dropped the 980px
  minimum: the ledger fits at 1024px, and below about 900px it scrolls.
- **F3** `app/utils/section-sort.ts` holds the comparator. TanStack negates a
  sorting function's result for a descending sort, so the section order and
  "empty last" are negated first. `tests/unit/section-sort.test.ts` runs it
  through TanStack's own sorted row model.
- **F4** `app/utils/history-chart.ts` builds the geometry for a measured width
  and a fixed 190px height; `ValuationHistoryCard.vue` measures the card with
  a `ResizeObserver`. Axis labels are a true 11px at every width.

### Slice 2 — Keyboard, failure states, page basics

- [x] F5: focus moves into the dialog, is trapped there, and returns to the
      trigger; Esc always closes.
- [x] F6: show the time prices were last fetched, not the time of the last
      attempt; distinguish "backend unreachable" from "one provider degraded";
      plain-language warnings without internal URLs.
- [x] F7: mark a stale price on the price itself.
- [x] F8: `<title>`, `lang`, `color-scheme`, and a theme that is right on first
      paint.

How each was done:

- **F5** `FormDialog.vue` wraps Nuxt UI's `UModal` around the existing form
  markup and `simple-modal` classes, so the look is unchanged. Focus starts on
  the first field, not the Close button.
- **F6** `BalanceSheetResponse.marketData` reports how the last call to
  vesto-go went (`ok`, `degraded`, `unreachable`, `unknown`) and when quotes
  last arrived. The header shows that time instead of `generatedAt`. The
  status chip reads "Market data unreachable" from the sheet's own last call,
  which is faster than the five-minute provider-health read.
  `shared/utils/request-failure.ts` turns a fetch error into a plain sentence;
  the raw error goes to the server log.
- **F7** A stale price carries an amber dot with a text label, and the table
  gets a one-line legend whenever any row has one.
- **F8** The colour-mode module owns the theme again (`storageKey:
  'vesto:theme-mode'`, `dataValue: 'theme'`), so its inline head script sets
  `dark` and `data-theme` before first paint. `app/plugins/theme.client.ts` is
  gone. This replaces the `ui.colorMode: false` stopgap from slice 1.

### Slice 3 — Ledger table

- [x] Right-aligned figures; currency in the column header.
- [x] Subtotals, total assets, total liabilities and net worth in their columns,
      with the rules described above.
- [x] Padded section headers; one placeholder for "no value".
- [x] Row actions in a menu; the delete confirm names the row.
- [x] Quantity, return and weight columns.

How each was done:

- **Columns.** `Holding` carries the ticker in muted text; `Ccy`, `Quantity`,
  `Unit cost`, `Unit price` (stale dot), `Value USD`, `Value SGD`,
  `Gain/loss SGD`, `Return` and `Weight` follow. Figures are right-aligned and
  tabular; the currency is named in the header, so cells are bare numbers.
  `BalanceSheetRow` now carries `quantity`, which the Excel detail sheet also
  exports.
- **Totals.** Subtotals, total assets, total liabilities and net worth are real
  cells. A single rule sits above each subtotal and total; a double rule sits
  under net worth. Total assets is rendered after the last asset section, the
  way a balance sheet reads. Parentheses mark losses and liabilities, gains
  carry a plus, and weights are unsigned.
- **Derived values.** Return is `P&L / cost basis` and weight is the row's
  share of total assets. Rows that never had a market price (manual prices,
  cash, CPF) stay out of return rather than diluting it. The rules live in
  `app/utils/ledger.ts` with unit tests.
- **Placeholder.** `—` is the single placeholder for a value that applies but
  is unknown (unpriced, no cost basis, no FX). A blank cell means the column
  does not apply to that row at all, such as quantity on a liability.
- **Rows.** Section labels are padded. Each row has one menu with Edit and
  Delete, and the delete confirm names the holding. The Source and Native
  toggles moved from the table toolbar into the View popover; the store is
  unchanged.
- **Width.** The table no longer has a 980px minimum. It fits at 1024px and
  scrolls sideways below that; the sticky-header limit described under slice 1
  still applies while it scrolls.

### Slice 4 — Header and net-worth hero

- [x] Slim header: status, refresh, View, export, theme, one primary "Add".
- [x] Net worth headline with assets less liabilities and the FX line.
- [x] History beside the headline; drop the KPI cards and the FX strip.

How each was done:

- **Header.** The title is "Vesto · Balance sheet". The chip now reports the
  page's own market-data call and when prices arrived ("Prices updated 10:57",
  "Some prices stale · 10:57", "Market data unreachable · prices from 16 Nov");
  its panel still reports provider health. The controls are Refresh, View,
  Export, Theme and one ink Add menu with "Add asset" and "Add liability".
  The permanent instructional copy is gone.
- **Hero.** Net worth is the 48px figure with an SGD/USD switch on the same
  store as the View popover. Beneath it: "Assets … less liabilities …", the
  other currency and the USD/SGD rate with its date, "+x since the 08:00
  snapshot" (the latest complete history row; the date is named when it is not
  today), and the drawdown from the all-time peak. The last two are hidden
  when there is no history or no FX rate.
- **History.** The card sits beside the hero and stacks under 1000px. The
  series is read once for the API's full window (3650 days) and the
  30/90/1y/All switch filters it client-side, so the chart range cannot change
  the meaning of the peak or the drawdown. The stat boxes and the card's own
  Refresh button are gone; the header Refresh reloads both the sheet and the
  history. The backfill sentence stays.
- **Removed.** KPI cards, the FX strip, the `kpiCards` preference and its
  parser branch, and the two lines of header instructions. Stored preferences
  from older builds are tolerated; an unknown `kpiCards` key is ignored.

### Slice 5 — Palette, type scale, flatter surfaces

- [x] Replace the current variables with the tokens above in both themes.
- [x] Four type sizes; sentence-case labels.
- [x] Remove the corner gradients and the tinted total rows.

How each was done:

- **Tokens.** `main.css` now defines only the nine ledger tokens and the few
  values that do not derive from them (overlay, backdrop, shadow). Dark mode
  overrides the tokens, not the rules. The old palette variables and the
  role aliases are gone.
- **Surfaces.** The page is flat paper: no radial gradients, no card around the
  header or the history chart, no box around the table, and no tint on section,
  liability, subtotal or total rows. Rules and the double rule under net worth
  carry the structure.
- **Type.** Four sizes: 12 for captions, column heads and metadata; 14 for the
  table and body; 16 for the page title and net-worth row; 48 for the headline.
  Labels and table headers are sentence case. The chart axis labels stay 11px
  so the plot does not lose width.
- **Colour.** Ink is the one action colour; the Add button and active segments
  are solid ink. Gain, loss and amber are the only other colours. Buttons and
  inputs use the control fill with an edge border; panels and dialogs sit on
  the control surface.
- **Currency.** `formatCurrency` now returns `S$` and `US$` explicitly, because
  the `en-SG` locale renders the Singapore dollar as a bare `$`. Compact chart
  labels therefore read `S$160K`.

### Slice 6 — Add/edit dialog

- [x] Two-column form that fits a 768px-tall window.
- [x] Resolve the ticker before saving and say what it resolved to.
- [x] One clear primary button.

How each was done:

- **Layout.** The asset dialog has kind tabs (Investment, CPF, Cash, Other)
  and a two-column grid with a three-column quantity/cost/currency row. The
  liability dialog uses the same grid. The form fits a 1440×768 window and
  stacks to one column under 720px; the dialog scrolls rather than overflowing.
- **Resolution.** A new `GET /api/instruments/resolve?symbol=&market=` BFF
  route calls vesto-go's existing `/v1/quotes/latest`; the browser still never
  calls vesto-go. The dialog resolves on blur and on submit and shows the
  resolved exchange, currency and last price. A definitive `not_found` blocks
  a live-priced save and names the problem; a rate limit or an outage shows an
  amber warning and still allows the save, because a provider problem must not
  lose the entry. `manual_only` skips resolution entirely. A resolved market
  fills the exchange field when it was left blank.
- **Saving.** One ink primary button ("Add asset"/"Save changes", "Add
  liability"/"Save changes") and a secondary Cancel. The button is disabled
  while resolving or saving. A failed save keeps the dialog open and shows the
  plain sentence inline instead of closing over a banner. Empty optional
  numbers are sent as null, not as empty strings.
- **No vesto-go change.** The existing single-quote endpoint returns the
  resolved market, currency and price; no Go code was needed.

## Decisions

Agreed 2026-11-17 from the mockup review. All follow the mockup.

| # | Question | Decision | Affects |
| --- | --- | --- | --- |
| Q1 | Add quantity, return % and portfolio weight columns? | Yes, all three, always visible. Quantity is stored; return and weight are derived in the UI. Source/Native stay optional. | Slice 3 |
| Q2 | Show "change since the 08:00 snapshot" in the headline? | Yes: current net worth minus the latest complete history row. The label names the date when the latest row is not today; hidden when there is no history. | Slice 4 |
| Q3 | Add a 30 days / 90 days / 1 year / All switch to the chart? | Yes. The full series is fetched once and the chart is filtered client-side, so the peak and drawdown remain all-time and do not change with the range. | Slice 4 |
| Q4 | Replace "Add Asset" and "Add Liability" with one "Add" menu? | Yes: one ink Add menu with "Add asset" and "Add liability". | Slice 4 |
| Q5 | Keep the current green primary or move to ink as the only action colour? | Ink. Green is gain, red is loss, amber is stale; nothing else is coloured. | Slice 5 |
| Q6 | Should the status chip merge provider health with the price time? | Yes: one market-data chip with the last call's outcome and when prices arrived; its panel still shows provider health. Row valuation state stays in the table. | Slice 4 |

## Contract changes

Later slices change lines in the `AGENTS.md` UI contract. Each must update
`AGENTS.md` in the same PR.

| Contract line | Change | Slice |
| --- | --- | --- |
| "The net-worth history card sits above the table." | History moves beside the headline. | 4 |
| View popover: "KPI card count" | No KPI cards remain, so the setting goes. | 4 |
| "The existing Source/Native column toggles use the same store." | Toggles live in the View popover; the store is unchanged. | 3 |
| "The header has one provider-status chip. It reports provider health…" | One market-data chip: the last call's outcome and when prices arrived. Its panel still reports provider health; row valuation state stays in the table. | 4 |
| "Use modal forms for CRUD." | Unchanged; the dialog is still modal. | 6 |

Slices 3 and 4 applied their rows to `AGENTS.md` in the same commits. The
slice 6 line records that the dialog stays modal; it is not a change.

Unchanged throughout: SGD headline for history, complete days only, the
backfill sentence, per-device preferences, hidden sections filtering rows only,
the fixed 45s poll, and a complete Excel export.

## Verifying locally

Node 26 is required (`.nvmrc`). Use a copy of the database so nothing real is edited.

```bash
cd vesto-go && make db-up && make run
cd vesto-v2 && sqlite3 data/vesto-v2.db ".backup '/tmp/vesto-ui.db'"
NUXT_DATABASE_PATH=/tmp/vesto-ui.db NUXT_VESTO_GO_BASE_URL=http://127.0.0.1:8080 npm run dev
npm test && npm run typecheck
```

The history card needs at least two complete rows in `valuation_history` to
draw a chart; a fresh copy has none until the snapshot sidecar has run twice.

## Log

- **2026-11-17** — Review and mockup done. Branch `ui-redesign-foundations`
  created for slice 1.
- **2026-11-17** — Slice 1 implemented. Checked in the browser against a copy
  of the database at 1440, 1024, 900 and 390px wide, in both themes: buttons
  are styled, the table header sticks at 1024px and up, a descending sort
  keeps Investments → CPF → Cash → Liabilities with empty values last, and the
  chart is 190px tall at every width (at 1440px the table now starts 590px
  down the page, up from about 815px). `npm test` (65 tests, 10 new),
  `npm run typecheck` and `npm run build` pass. `npm run test:e2e` was not
  run: Playwright's browsers are not installed on this machine. Committed on
  the branch; later slices continue on the same branch and no PR is open yet.
- **2026-11-17** — Slice 2 implemented and committed. Checked in the browser:
  dialogs by keyboard alone (open, Tab stays inside, Esc and outside-click
  close, focus returns to the trigger), the theme toggle and stored choice,
  stale-price dots, and the backend-down state by stopping vesto-go (chip,
  header time and warnings all correct, and all recover when it returns).
  `npm test` (84), `npm run typecheck` and `npm run build` pass. Not run:
  Playwright e2e. Not checked: the first paint on a cold load in light mode on
  a dark OS, only that the inline script is in the served `<head>`.
- **2026-11-17** — Slice 3 implemented and committed. The ledger table has
  ticker-aware holdings, right-aligned figures, real-column subtotals and
  totals, padded sections, one placeholder, and a per-row actions menu; the
  Source/Native toggles moved into the View popover. Checked in the browser at
  1440, 1024, 900 and 390px in both themes: the table fits at 1024px, scrolls
  inside its shell below that, the sticky header still sticks at 1440px, totals
  and rules line up, and the row menu offers Edit/Delete. `npm test` (94, 10
  new), `npm run typecheck` and `npm run build` pass. Not run: Playwright e2e.
  The browser check used cached stale quotes (vesto-go was not running), which
  is why every source shows `· stale`; that is the expected fallback, not a
  regression.
- **2026-11-17** — Slice 4 implemented and committed. The header is one slim
  bar (status chip, Refresh, View, Export, Theme, one ink Add menu) with no
  instructional copy. The hero is the net-worth figure with assets less
  liabilities, the FX line, the change since the latest complete snapshot and
  the drawdown from the all-time peak; the history card sits beside it with the
  30/90/1y/All switch and stacks under 1000px. KPI cards, the FX strip and the
  `kpiCards` preference are gone. The chip now carries the market-data state
  and price time, with provider health in its panel. Checked in the browser at
  1440, 1024, 900 and 390px in both themes: currency switch, Add menu, View
  popover, provider panel, hidden-section note and the range switch. Seeded
  four synthetic rows into the `/tmp` database copy to check the chart, the
  snapshot delta and the peak line; the real database was not touched.
  `npm test` (104, 10 new), `npm run typecheck` and `npm run build` pass. Not
  run: Playwright e2e. vesto-go was not running, so the page used cached stale
  quotes, which is the expected fallback.
- **2026-11-17** — Slice 5 implemented and committed. The page uses only the
  ledger tokens in both themes: flat paper, no gradients, no card around the
  header or the chart, no box around the table and no tinted section or total
  rows. The type scale is 12/14/16/48 with sentence-case labels; the chart
  axis labels stay 11px. Ink is the only action colour, and active segments are
  solid ink. `formatCurrency` returns `S$` and `US$` explicitly because the
  `en-SG` locale renders SGD as a bare `$`. Checked at 1440, 1024, 900 and
  390px in both themes, including the Add dialog, the View panel and the
  totals. `npm test` (105), `npm run typecheck` and `npm run build` pass. Not
  run: Playwright e2e.
- **2026-11-17** — Slice 6 implemented and committed. The add/edit dialogs are
  a two-column form with kind tabs (Investment, CPF, Cash, Other), a
  quantity/cost/currency row, a price-source switch and one ink primary
  button. A new `GET /api/instruments/resolve` BFF route resolves a ticker on
  blur and on submit through vesto-go's existing single-quote endpoint and
  says what it resolved to; a not-found blocks a live-priced save, while a
  rate limit or outage warns and still allows it. `manual_only` skips the
  lookup. Failed saves keep the dialog open with the sentence inline. Checked
  at 1440×768 and 390px, including the CPF tab, the provider-down warning, a
  liability save and a delete; the test rows were removed afterwards from the
  `/tmp` copy. `npm test` (110, 5 new), `npm run typecheck` and
  `npm run build` pass. Not run: Playwright e2e.
- **2026-11-17** — All six slices committed on `ui-redesign-foundations`. The
  branch is local only and no PR is open; the redesign is complete in code,
  pending review.
- **2026-11-17** — PR #24 squash-merged to `main` as `d945565` and deployed
  (run `44042860285`). The tree at `4616d2b` is identical to `d945565`, so the
  squash lost nothing. The branch is deleted locally and on the remote.
- **2026-11-17, 16:19 SGT — live check.** The deployed page at
  `finance.nickczj.com` renders the ledger, the S$ headline, "since the 08:00
  snapshot", the drawdown, the history card and parenthesised losses. With
  `prefers-color-scheme: dark` emulated and a stored `light` preference, a cold
  load stays light and keeps `color-scheme: light`; the inline theme script is
  in `<head>`. That closes the slice 2 check. Playwright e2e remains unrun.
