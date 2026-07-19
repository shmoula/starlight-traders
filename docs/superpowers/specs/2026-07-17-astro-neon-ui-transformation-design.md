# Astro-Neon UI Transformation — Design Spec

**Date:** 2026-07-17
**Status:** Approved design, pending implementation plan
**Type:** UI transformation — restyle the existing game to the Astro-Neon concept
**Depends on:** the Astro-Neon design system on `feat/design-system`
(`src/ui/tokens.css`, `src/ui/design-system.css`, spec in `docs/design/design-system.md`)

---

## 1. Goal

Transform the current single-column, utilitarian game UI into the "Astro-Neon" holographic
cockpit shown in the approved concept art: a three-rail HUD over a starfield, glowing
panels, segmented resource bars, and the four-accent functional color language — while
changing **zero engine behavior** and keeping every current action reachable on one screen.

Success looks like: a player opens the game at 1280px and sees the concept's cockpit
(navigator orbs, cargo tiles, Trade Hub window, ship logistics, log feed on a starfield);
`npm test`, `npm run lint`, `npm run format:check`, and the Lighthouse CI budgets all stay
green; the game remains fully playable at phone widths.

### Clarified decisions

| Question           | Decision                                                                 |
| ------------------ | ------------------------------------------------------------------------ |
| Solar-system map   | **Decorative backdrop only** — static orbit art; no interactive map      |
| Dock tab bar       | **None** — one cockpit screen holds everything; no tab bar rendered      |
| Webfonts           | **Google Fonts CDN** — Orbitron + Exo 2 via one `<link>`, `display=swap` |
| Responsive posture | **Desktop-first cockpit** with the design system's collapse rules        |

### Non-goals

- No engine or economy changes. One price per commodity stays (the concept's
  `120 CR / 135 CR` buy/sell spread does not exist in this game and is not being added).
- No renaming: stations stay `Terra Hub`, `Kiruna Belt`, `Vulcan Yards`, `The Verge`,
  `Meridian`; commodities stay `Water / Ice`, `Machine Parts`, `Luxury Goods`. The
  concept's `AETHEL` / `RARE EARTHS` etc. are placeholder art copy.
- No interactive star map, no functional tab bar, no new screens.
- No renderer rework: whole-screen innerHTML re-render (and its focus loss after each
  action) is a pre-existing trait, out of scope — logged as backlog, not fixed here.
- No self-hosted fonts, no PWA/offline work.

---

## 2. Approach

**Template re-skin on the existing renderer.** Keep the innerHTML string templates, the
`data-act`/`data-id` event delegation in `main.ts`, and the tri-state `render()`
(station / event / run-end). Rewrite `stationScreen` as a composition of small panel
template functions that emit design-system (`st-`) classes. `styles.css` shrinks to:
token + design-system imports, restyles for preserved legacy contract classes, and a
little screen glue.

Alternatives rejected:

- _Keyed DOM patching (lit-html or hand-rolled)_ — fixes re-render flicker/focus loss, but
  adds a dependency and test churn a 5-station game doesn't justify. Backlog.
- _Component framework port_ — strictly more machinery for the same output. Rejected.

---

## 3. Screen architecture (station screen)

The station screen becomes the design system's HUD shell (`st-shell`, §5 of
`docs/design/design-system.md`):

```
st-app-bg + backdrop art (fixed, aria-hidden, z: --st-z-bg)
┌──────────────────────────────────────────────────────────────────┐
│ page header: "Starlight Traders" (st-screen-title) · station/day │
│ st-statbar (sticky, <1100px only)                                │
│ ┌─ left rail 260px ─┐ ┌─ stage 1fr ──────┐ ┌─ right rail 300px ─┐│
│ │ NAVIGATOR         │ │ turn-report      │ │ SHIP LOGISTICS     ││
│ │ CARGO             │ │ TRADE HUB (tab   │ │ SHIP'S LOG         ││
│ │                   │ │ panel)           │ │                    ││
│ └───────────────────┘ └──────────────────┘ └────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

### 3.1 Page header

`st-screen-title` wordmark "Starlight Traders" with a sub-line
`<station name> · Day <n>` (display face, `--st-text-dim`). Replaces the current
`<h1>` + sticky `.stats` header.

### 3.2 Navigator panel (left rail)

- `st-panel` titled `NAVIGATOR`. Body: `st-orb-group` with one `st-orb` **button** per
  station except the current one (4 orbs), `data-act="jump" data-id="<node>"`.
- Orb caption: station name, plus a second caption line with gameplay-critical route info:
  `4⛽ · 15%` (fuel cost via `fuelCost(current, node)`, danger as `Math.round(danger*100)`).
  This information stays visible — never tooltip-only.
- Disabled when `s.fuel < fuelCost(...)` using the native `disabled` attribute (same as
  today's route buttons). Accessible name = visible text (name + cost + danger), e.g.
  `aria-label="Jump to Kiruna Belt (4 fuel, danger 0%)"`.
- Orb art via `--orb-art` inline style, one fixed radial-gradient per station (art layer,
  exempt from the functional-accent rule):
  - terra `#7ec8e3 / #1d4e6e` (blue marble) · kiruna `#9aa8b4 / #3a4750` (grey rock) ·
    vulcan `#e0956a / #6e3a24` (ember rock) · verge `#a98fd8 / #4a3378` (violet) ·
    meridian `#e8c17a / #7a5a24` (gilded)
- The current-location station is **not** an orb; it's named in the header and the Trade
  Hub title (matches the concept, where you dock _at_ a place and see the others).

### 3.3 Cargo panel (left rail)

- `st-panel` titled `CARGO`, body: capacity `st-kv` (`HOLD` / `3/30` tabular) on top, then
  one `st-tile` per commodity, always all three, at 40% opacity when quantity is 0.
- Tile anatomy: `st-icon-box` (icon per commodity) + name + `<qty> units` meta.
- Commodity accent mapping (used everywhere: tiles, market rows):
  - `Water / Ice` — cyan, droplet glyph
  - `Machine Parts` — cyan, cog glyph (both are standard goods; cyan is the default
    category)
  - `Luxury Goods` — gold, crate glyph (high-value, mirrors the concept's Rare Earths)
- Magenta is **not** used for any commodity: in this game fuel is a ship resource, not
  cargo. Magenta remains the Sell/consumable accent.

### 3.4 Center stage: turn report + Trade Hub

- **Turn report** renders first on the stage, styled as the flash-in banner. The existing
  markup contract is preserved verbatim — classes `turn-report`, `turn-report__title`,
  `tr-line`, `tr-icon`, `tr-good/bad/neutral`, `role="status"`, `aria-live="polite"` —
  and restyled via tokens (good → `--st-positive`, bad → `--st-negative`, panel styling
  from `st-panel` tokens). Tests assert these strings; they must keep passing unchanged.
- **Trade Hub** is the `st-panel--tab` window, title `TRADE HUB — <STATION NAME>`
  (display face, uppercase). Frame contains, top to bottom:
  1. `st-market__head`: `MARKET COMMODITIES`
  2. One `st-market__row` per commodity: icon box · name · price (`st-num`,
     `--st-text-hi`) · held count (`×2`, dim) · actions `Buy 1` (`st-btn st-btn--sm`) and
     `Sell 1` (`st-btn st-btn--sell st-btn--sm`). Grid template gains a `held` column:
     `auto minmax(0,1fr) auto auto auto` (screen-level glue rule, not a design-system
     change). Existing aria-labels (`"Buy 1 Water / Ice"` …) and disabled + `title` logic
     carry over exactly.
  3. `st-panel__subhead`: `CONTRACTS` — offered contracts as rows: text
     `Deliver <qty> <commodity> → <station> by day <d> · reward <cr>` with an `Accept`
     ghost button (`data-act="accept"`, existing aria-label) or `✓ Accepted` (class
     `accepted`). Empty state: `None today.`
  4. `st-panel__subhead`: `ACTIVE CONTRACTS` + the auto-complete hint line, then active
     missions with the **exact current semantics and strings**: carrying `n/m` status
     (good/bad), `jump-link` buttons with `data-act="jump"|"deliver"`, `aria-disabled`,
     `aria-describedby="jump-hint-<id>"`, and `(not enough fuel to jump)` hint. These are
     test-asserted contracts; only surrounding layout/classes may change. Empty state
     keeps today's guidance line (`None accepted. Accept a contract, …`).

### 3.5 Ship Logistics panel (right rail)

`st-panel` titled `SHIP LOGISTICS`:

- `st-kv` rows: `CREDITS` (gold value + text glow), `DEBT` (gold), `NET WORTH` (gold),
  `DAY` (plain). Values tabular via `st-num`.
- `FUEL` `st-bar-label` + segmented gold bar: `--st-segments: 20` (= `fuelCapacity`),
  `--st-value: (fuel/fuelCapacity*100)%`. Threshold classes reuse today's logic
  (`cheapestJump`): fuel < cheapest jump → `st-bar--critical`; < 2× → `st-bar--warn`;
  else gold.
- `HULL` label + continuous cyan bar (`hull/hullMax`, start 100/100).
- `st-divider`, then `SERVICES` label and the three service controls as ghost buttons,
  preserving today's `data-act`, disabled conditions, and `title` hints:
  `Refuel +5 (40cr)` · `Repair +20 (120cr)` · `Pay 200 debt`. Docking fee as a final
  `st-kv` row (`DOCKING FEE HERE` / gold).

### 3.6 Ship's Log panel (right rail)

`st-panel` titled `SHIP'S LOG` (kept — the concept's "MESSAGES" label buys nothing and
the current title/aria-label are test-asserted). Section keeps
`aria-label="Ship's log"`. Body: last 8 `log-line` entries, tone classes `tr-*` as today,
colors mapped to tokens; scroll behavior as today (`max-height` + overflow).

### 3.7 Mobile statbar

New `st-statbar` (screen-level component in `styles.css`, built from `st-kv` pieces):
a slim sticky top strip shown **only below 1100px**, with four chips — credits (gold),
fuel `16/20`, hull `100/100`, hold `0/30` — reproducing the current sticky `.stats`
value at a glance while the logistics panel is off-screen. Hidden ≥1100px. The fuel chip
reuses the warn/critical text classes.

### 3.8 Event and run-end screens

Same tri-state flow (`render()` untouched). Both render as a centered
`st-glow-wrap > st-panel--chamfer > st-panel__inner` card (max-width ~480px) on the
starfield backdrop:

- **Event**: keeps `event-card` class and structure (`<h2>` title, description,
  `choices`); choice buttons become standard cyan `st-btn`s (`data-act="resolve"`).
- **Run-end**: keeps `run-end` and `score` classes; score value gold with text glow;
  `Copy score card` (cyan) and `New run` (ghost) buttons.

### 3.9 Backdrop art

New `src/ui/art.ts` exporting two string constants:

- `BACKDROP_SVG` — one inline SVG: 3 elliptical orbit strokes (`--st-border`-alpha
  stroke, no fill), 2–3 small planet circles with fixed radial fills, ~40 star dots at
  **hardcoded deterministic coordinates** (no runtime randomness), `viewBox="0 0 1440 810"`,
  `preserveAspectRatio="xMidYMid slice"`.
- Commodity/glyph SVGs (droplet, cog, crate, warning triangle) as template snippets used
  by the panel templates — same monoline rules as the design system (§4).

`index.html` hosts the backdrop: `<div id="backdrop" aria-hidden="true">` fixed,
`inset: 0`, `z-index: var(--st-z-bg)`, `pointer-events: none`, populated once at startup
in `main.ts` (one line — outside the re-render cycle). `#app` sits above it.

---

## 4. CSS strategy

`styles.css` becomes, in order:

1. `@import "./tokens.css"; @import "./design-system.css";`
2. Base: `body` uses `st-app-bg` styling (class on `<body>` in `index.html`), type
   defaults from tokens; `#app` drops the 760px `max-width` in favor of the shell's own
   `max-width: 1440px; margin: 0 auto`.
3. Preserved-contract restyles: `.turn-report`, `.tr-*`, `.log-line`, `.jump-link`,
   `.accepted`, `.hint`, `.fee`, `.event-card`, `.run-end`, `.score`, and the
   `.stat-warn` / `.stat-critical` fuel-threshold classes (reused by the statbar chip) —
   colors and spacing re-expressed **only** through tokens.
4. Screen glue: `.st-statbar`, market `held` column, backdrop container, panel-order
   overrides for the collapse breakpoints.
5. Deleted: `.stats`, old `section`/`table`/`button` element styling (superseded by
   `st-` components), hardcoded hex colors — no raw hex left outside `tokens.css` and
   orb/backdrop art values.

Fonts: one `<link>` in `index.html` —
`https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700&family=Orbitron:wght@500;600;700&display=swap`
with the two `preconnect` hints. Known trade-off (user-accepted): third-party runtime
request; offline/dev-without-network degrades to the token fallback stacks.

---

## 5. Accessibility & responsiveness

- **Preserved contracts** (§3.4, §3.6): every existing aria-label string, `role="status"`
  - `aria-live` on the turn report, `jump-link` disabled semantics, log region label.
- Headings: page `h1` = wordmark; panel titles `h2` (`st-panel__title` accepts any
  heading tag); Trade Hub subsections use the subhead strips, not headings.
- All interactive elements are `<button>`s (as today); focus = the design system's cyan
  `:focus-visible` ring; animations die under `prefers-reduced-motion` (already in the
  component sheet).
- Information never rides on color alone: tones keep their `✓ ✗ ›` icons; bars keep
  numeric labels; commodity accents pair with distinct glyphs.
- Breakpoints (from `st-shell`): ≥1100 three rails · 760–1100 two columns, right rail
  content flowing below the stage · <760 single column, order: statbar (sticky) →
  turn report → Trade Hub → Navigator → Cargo → Logistics → Log. The statbar is sticky
  and visible at **both** collapsed breakpoints (everything below 1100px). Touch targets
  stay ≥40px rows / ≥26px buttons with row spacing.

---

## 6. Testing & verification

**Must stay green unchanged:** all suites in `tests/`, notably `tests/ui/screens.test.ts`
(aria-labels, jump-link semantics, turn-report classes/strings, log section). This is the
regression net for the whole restyle.

**New assertions** (extend `tests/ui/screens.test.ts`):

- Navigator: renders one `data-act="jump"` orb per non-current station; disabled exactly
  when fuel is insufficient; caption includes fuel cost and danger %.
- Cargo: capacity readout `x/30` present; a tile per commodity.
- Logistics: fuel bar carries `--st-value` and warn/critical class at the documented
  thresholds; services keep their disabled `title` hints.
- Statbar: present in station screen markup with credits/fuel/hull/hold chips.
- Event/run-end: chamfer card wrapper present; existing `data-act` hooks intact.

**Manual/browser verification** (dev server, per repo `verify` habits): screenshots at
1280×800 and 375×812 compared against the concept; hover/focus states on market buttons
and orbs; reduced-motion spot check; Lighthouse CI (`.lighthouserc.json`) budgets green —
the backdrop is static SVG, panels don't use `backdrop-filter` by default, and pulses are
opacity-only, so paint cost stays flat.

---

## 7. Risks & notes

- **Google Fonts CDN** is a runtime third-party dependency (also a mild GDPR
  consideration for EU distribution). Accepted for now; self-hosting is a drop-in later
  (the token stacks don't change).
- **20 segmented fuel cells** at the narrowest right-rail width (~240px) are ~11px wide —
  verified readable in the style guide's 20-cell demo; if it ever feels noisy, halve to
  10 cells of 2 fuel each (pure CSS `--st-segments` change).
- **Re-render focus loss** after every action is pre-existing and unchanged; backlog
  candidate: focus restoration by `data-act`+`data-id` after `paint()`.
- The concept image shows content the game doesn't have (buy/sell spread, MISSION LOG
  button, PAY ALL, planet thumbnails in a NAVIGATOR list). Where the game lacks the
  concept's data, the layout is kept and the game's real data substituted — the shape
  matches even where the numbers differ.

---

## 8. Implementation order (input to the plan)

1. Shell: fonts link, backdrop container + `art.ts`, `st-app-bg` body, `st-shell` grid in
   `stationScreen`, panels stubbed with current content.
2. Right rail: Ship Logistics (kv + bars + services), Ship's Log, statbar.
3. Left rail: Navigator orbs, Cargo tiles.
4. Stage: Trade Hub (market rows, contracts, active contracts), turn-report restyle.
5. Event + run-end chamfer cards.
6. CSS cleanup (delete superseded rules), new tests, browser + Lighthouse verification.

Each step leaves the game playable and tests green.
