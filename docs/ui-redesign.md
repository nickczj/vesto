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
| 1 | Foundations: fix what is broken (F1–F4) | `ui-redesign-foundations` | Committed; no PR yet |
| 2 | Keyboard, failure states, page basics (F5–F8) | `ui-redesign-foundations` | Committed; no PR yet |
| 3 | Ledger table (U1, U4, U5, U7) | — | Not started |
| 4 | Header and net-worth hero (U2, U3) | — | Not started |
| 5 | Palette, type scale, flatter surfaces | — | Not started |
| 6 | Add/edit dialog (U6) | — | Not started |

All slices are developed on `ui-redesign-foundations`, in this order, with at
least one commit per slice. The PR is opened on request, not per slice. Slices
1 and 2 change behaviour without changing the look, so they do not depend on
any decision below.

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
  **Known limit:** below about 1015px wide the table scrolls sideways inside
  its shell and the header does not stick. The ledger table in slice 3 should
  drop the 980px minimum.
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

- [ ] Right-aligned figures; currency in the column header.
- [ ] Subtotals, total assets, total liabilities and net worth in their columns,
      with the rules described above.
- [ ] Padded section headers; one placeholder for "no value".
- [ ] Row actions in a menu; the delete confirm names the row.
- [ ] Quantity, return and weight columns (needs a decision, below).

### Slice 4 — Header and net-worth hero

- [ ] Slim header: status, refresh, View, export, theme, one primary "Add".
- [ ] Net worth headline with assets less liabilities and the FX line.
- [ ] History beside the headline; drop the KPI cards and the FX strip.

### Slice 5 — Palette, type scale, flatter surfaces

- [ ] Replace the current variables with the tokens above in both themes.
- [ ] Four type sizes; sentence-case labels.
- [ ] Remove the corner gradients and the tinted total rows.

### Slice 6 — Add/edit dialog

- [ ] Two-column form that fits a 768px-tall window.
- [ ] Resolve the ticker before saving and say what it resolved to.
- [ ] One clear primary button.

## Decisions needed

These were added in the mockup and are not agreed yet. None blocks slices 1–2.

| # | Question | Affects |
| --- | --- | --- |
| Q1 | Add quantity, return % and portfolio weight columns? Quantity is stored; the other two are derived. | Slice 3 |
| Q2 | Show "change since the 08:00 snapshot" in the headline? It is current net worth minus the latest history row. | Slice 4 |
| Q3 | Add a 30 days / 90 days / 1 year / All switch to the chart? `GET /api/history?days=` already takes a window. | Slice 4 |
| Q4 | Replace "Add Asset" and "Add Liability" with one "Add" menu? | Slice 4 |
| Q5 | Keep the current green primary or move to ink as the only action colour? | Slice 5 |

## Contract changes

Later slices change lines in the `AGENTS.md` UI contract. Each must update
`AGENTS.md` in the same PR.

| Contract line | Change | Slice |
| --- | --- | --- |
| "The net-worth history card sits above the table." | History moves beside the headline. | 4 |
| View popover: "KPI card count" | No KPI cards remain, so the setting goes. | 4 |
| "The existing Source/Native column toggles use the same store." | Toggles move into the View popover; the store is unchanged. | 3 |
| "Use modal forms for CRUD." | Unchanged; the dialog is still modal. | 6 |

Unchanged throughout: SGD headline for history, complete days only, the
backfill sentence, per-device preferences, hidden sections filtering rows only,
the fixed 45s poll, and a complete Excel export.

## Verifying locally

Node 24 is required. Use a copy of the database so nothing real is edited.

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
