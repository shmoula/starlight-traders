# Stranding Honesty & Event Stakes — Design

Date: 2026-07-19
Status: approved
Covers: UIUX **P0-1**, **P0-2** ([BACKLOG.md](../../BACKLOG.md)) plus engagement items
**B-1**, **B-3** ([ENGAGEMENT_BACKLOG.md](../../ENGAGEMENT_BACKLOG.md)).

## Decision summary

The two P0 items share a goal — closing the remaining ways a player loses without
understanding why — but touch disjoint code, so they ship as **two independent
bundles** (separate branches/PRs), Bundle 1 first:

1. **Bundle 1 — Stranding honesty** (P0-2 + B-1 + B-3): S effort, UI-only.
2. **Bundle 2 — Event stakes** (P0-1): M effort, UI plus a pure engine refactor.

Explicitly **out of scope**: any game-math change. E1-4 (honest events pass:
pay-vs-flee retune, derelict parity fix, odds display) comes later and plugs into
the seams this work creates. B-3 is done as styling only for the same reason —
clamping credits at 0 would change the economy.

## Bundle 1 — Stranding honesty (P0-2 + B-1 + B-3)

All changes in `src/ui/screens.ts` (+ CSS).

### Per-route disabled reasons (P0-2)

Disabled jump orbs in `navigatorPanel` (screens.ts:116) currently carry no reason.
Each disabled orb gets:

- `title="Need {cost}⛽, have {fuel}"`;
- the same reason appended to the existing `.st-orb__tip` tooltip text and the
  `.st-sr-only` screen-reader span (a `title` alone never surfaces on touch).

### Stranding banner (P0-2)

When `s.fuel < cheapestJump` (value already computed in `stationScreen`,
screens.ts:228), the Navigator panel renders a warning banner above the orbs:

> ⚠ Not enough fuel to jump anywhere — refuel below ({REFUEL_PRICE}cr/unit)

Invariant: whenever the banner shows, refueling is affordable — `checkLoss`
(game.ts:174) has already ended the run otherwise — so the banner is always
actionable and never a death notice.

### Refuel honesty label (B-1)

The refuel button (screens.ts:90) always says "+5" but the engine buys
`min(5, tankRoom, floor(credits / REFUEL_PRICE))`. The label now computes that
same `n` and renders:

- `Refuel +{n} ({n×8}cr)` when unclamped or clamped by tank room;
- `Refuel +{n} ({n×8}cr) — all you can afford` when clamped by credits;
- disabled only when `n === 0` (tank full, or credits < 1 unit), with the
  existing title-reason behavior.

### Negative-credits warning (B-3)

When `credits < 0`, the statbar credits chip and the Logistics "Credits" row get
a warning/danger class (red). Styling only; the value is not clamped.

## Bundle 2 — Event stakes (P0-1)

### Stake-preview module (engine)

Extract the event-outcome formulas inlined in `resolveChoice` (game.ts:231) into
exported, pure helpers:

- `pirateToll(s)` → `min(credits, 150 + day×10)`
- `fleeDamage(day)` → `15 + day % 10`
- `salvageAmount(s)` → `min(cargoRoom, 2 + day % 4)`
- `engineBurn(s)` → `min(fuel, 2)`
- `derelictReward(day)` → `200 + day×8` (trap damage stays the constant 20)
- `bribeCost(s)` → `min(credits, luxury spot price at current location)`

`resolveChoice` is refactored to call these helpers — behavior-identical; the
existing test suite must pass unchanged.

A new pure function `choiceStakes(state, event)` maps each choice id of the
pending event to a short stake string using the same helpers, so the labels can
never drift from the resolution math. This module is the seam **E1-4** later
extends with odds display and retuned math.

### Event screen (UI)

`eventScreen` gains the `GameState` parameter (`render.ts:17` passes it) and:

- renders the existing `statbar()` strip above the event card — the fuel-warning
  class computation is extracted from `stationScreen` into a shared helper so
  both screens use it;
- each choice button shows its stake as a muted sub-line, e.g.
  "Pay tribute — ~230cr" · "Flee — risk 18 hull" · "Comply — lose 3 luxury" ·
  "Bribe — ~780cr";
- the derelict "Board it" choice shows **both** outcomes without odds
  ("could hold ~296cr, or a trap: −20 hull"). Odds stay hidden until E1-4:
  advertising a fake 50/50 would lie, and advertising the real day-parity
  determinism would break the game;
- the event heading becomes `<h1>` (the P3-3 a11y note) since this markup is
  being rebuilt anyway.

Known, accepted side effect: honest stake labels make "flee usually beats pay"
visible to attentive players. Honesty first; the retune is E1-4's job.

## Testing

- **Stake accuracy**: for each event kind and choice, assert the stake string's
  numbers equal the delta `resolveChoice` actually applies to a matching state.
- **Refuel label**: assert the rendered `n`/cost match what the engine buys in
  the clamped-by-credits, clamped-by-room, and unclamped cases; disabled only at
  `n === 0`.
- **Stranding surfaces**: banner renders iff `fuel < cheapestJump`; disabled orbs
  carry the correct need/have numbers; negative credits get the warning class.
- **No-regression**: full existing suite passes; the only engine diff is the
  pure formula extraction.

## Delivery

Two branches/PRs, Bundle 1 first. PR messages follow the user's global
conventional-commits template.
