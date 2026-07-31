# M2 Close-out — "Priceable Decisions" (P2-1 + E1-4 + B-2 + E1-1 + P1-2 + P2-2a)

**Date:** 2026-07-31 · **Status:** approved for planning
**Source:** [ROADMAP.md](../../ROADMAP.md) Milestone 2 (all remaining rows); specs in
[ENGAGEMENT_BACKLOG.md](../../ENGAGEMENT_BACKLOG.md) §4.3 (E1-1), item rows E1-4/B-2,
and [BACKLOG.md](../../BACKLOG.md) rows P1-2, P2-1, P2-2 (intel half only).

## Scope

One round that **closes Milestone 2**. Theme: every cost, odd, and opportunity is
visible _before_ the player commits — jumps, sells, and event choices all become
priceable.

- **P2-1** Structured log — `log: string[]` → `LogEntry[] { msg, tone, delta? }`;
  the renderer's regex `toneOf` heuristic dies.
- **E1-4 + B-2** Honest events — odds join the existing stake labels on choice
  buttons; the orb danger % becomes the true raid chance (the hidden 10% pirate
  floor surfaces); the event hash stops aliasing `vulcan`/`verge`.
- **E1-1** Today's Trade Bulletin — three seeded rumor lines from the day-1 price
  grid, rendered as the scrolling **DOCK TALK** ticker lane and statically on the
  intro screen.
- **P2-2a** Market intel (pulled forward from M3) — the static **EXCH** ticker lane
  (local quotes with ▲▼ vs base, tax, dock fee) and a station intel line in the
  Trade Hub.
- **P1-2** Forecast sinks — dock fee on jump orbs, interest countdown chip on the
  debt stat, sales tax + net proceeds on the market surfaces.
- **README fix** — score formula and "no localStorage" claims are stale
  (B-5-class staleness; same treatment).

**Explicitly out of scope (deferred):** pay-vs-flee payoff rebalance (the choice
becomes _visibly_ solved; a real rework waits for the E1-5 Heat tuning pass);
P2-2's cost-basis / unrealized-P&L half (needs a new per-commodity avg-paid field —
stays in M3); live prices for non-docked stations (information scarcity is the
routing gamble and E2-3's star map is built on it); E1-5 Heat; DOM-patching
re-render (B-4 stretch); any economy tuning beyond verifying the existing sweep
bands still hold after B-2.

## Decisions made during brainstorming

1. **Round scope: full M2 close-out** — vs. information-only, foundation-only, or a
   minimal forecast slice. All five open rows land, so M3 starts from a clean line
   (same pattern as the M1 close).
2. **E1-4 depth: transparency + targeted fixes, no pay-vs-flee rebalance** — showing
   a solved choice honestly beats hiding it; rebalancing the payoff is a real balance
   change that belongs with Heat (E1-5), not here.
3. **The bulletin is a ticker, not a panel** — stock-exchange framing fits the
   fiction better than prose. Split-lane variant chosen: **EXCH lane static**
   (prices are decision inputs — they must be scannable), **DOCK TALK lane
   scrolling** (rumors are colour — motion costs nothing there). A full marquee was
   rejected because a turn-based game must not make key numbers arrive on the
   ticker's schedule.
4. **P2-2's intel half is pulled forward from M3** — the ticker's ▲▼-vs-base quotes
   _are_ P2-2's market intel; building the surface twice would be worse. The
   cost-basis half explicitly stays in M3.
5. **Orb density: jump costs on the jump, sale costs on the sale** — orbs show
   `fuel · dock fee · raid %` only. Sales tax is charged if and only if you sell, so
   it lives on the market surfaces (intel line + net proceeds on Sell buttons) and in
   the orb tooltip/sr-only text — not on the orb face. A "cost to arrive" credit
   roll-up was rejected: it hides fuel, the resource that actually strands you.
6. **Discovery during design: the derelict/salvage parity bug is already fixed** —
   both roll `hashSeed(seed, day) % N` (game.ts:370, :399), not raw day parity. The
   backlog's "replace derelict parity" item is therefore display-only here: E1-4
   shows the odds; the math stands.
7. **Old run snapshots migrate, not discard** — P2-1 changes the log shape inside
   the E0-5 live-run snapshot; loading an old-shape snapshot wraps each string as a
   neutral entry rather than deleting someone's in-progress run on upgrade day.

## Build order

1. **P2-1** structured log — foundation; everything after it emits typed entries.
2. **E1-4 + B-2** honest events — engine layer (preview odds, true raid %, hash fix).
3. **E1-1 + P2-2a + P1-2** — one UI pass; the ticker and forecast surfaces are built
   together so the cockpit top region is laid out once.
4. README + docs housekeeping ride the round.

## 1. P2-1 — Structured log (`src/engine/types.ts`, `game.ts`, `src/ui/screens.ts`, `storage.ts`)

### Type change

```ts
export type LogTone = "good" | "bad" | "neutral";
export interface LogEntry {
  msg: string;
  tone: LogTone;
  delta?: number; // signed credit movement, when the line is about money
}
// GameState.log: string[]  →  LogEntry[]
```

### Engine

- `withLog(state, msg)` → `withLog(state, msg, tone = "neutral", delta?)`. Every
  call site (≈15 in game.ts plus the `createGame` intro lines) declares its own tone
  and, for credit movements, its delta: buys/fees/tolls/bribes/interest negative;
  sales/rewards/derelict loot positive; hull/fuel-only lines carry tone without
  delta.
- The sim treats entries as inert data — no changes.

### UI

- `logPanel` and the turn report render `entry.tone` directly; the regex `toneOf`
  (screens.ts:44) and its keyword list are **deleted**. Money lines render a
  right-aligned green `+860cr` / red `−23cr` from `delta`.
- A missing/undefined `delta` renders nothing — no `+0cr` noise.

### Snapshot compatibility (decision 7)

- `RunSnapshot.version` bumps 1 → 2. `parseSnapshot` accepts v1 by wrapping each
  log string as `{ msg, tone: "neutral" }` (colors lost, run survives); v2
  validates entries field-by-field like the rest of the snapshot. The results
  ledger (`starlight.save.v1`) stores no logs — untouched.

## 2. E1-4 + B-2 — Honest events (`src/engine/events.ts`, `preview.ts`, `src/ui/screens.ts`)

### B-2 — hash fix

- `rollEvent` hashes full station identity — replace
  `from.charCodeAt(0), to.charCodeAt(0)` (events.ts:11) with the stations'
  indices in `NODE_IDS` (stable, collision-free). `vulcan`/`verge` stop sharing
  event rolls. **This reshuffles in-transit events for every seed** — see Testing.

### True raid % (the honest danger number)

- New exported `pirateChance(to: NodeId): number` in events.ts returning the
  probability `rollEvent` actually uses: `0.1 + 0.45 × NODES[to].danger`. The orb
  meta and tooltip display `Math.round(pirateChance(to) × 100)` instead of raw
  `danger × 100`: Terra/Kiruna read **10%** (today they lie with "0%"), Vulcan 17%,
  Meridian 19%, The Verge **33%** (today overstated at "50%"). Display derives from
  the same function the engine rolls with, so it can never drift (preview.ts
  precedent).
- Meridian's tooltip/sr-only text appends "customs patrol this approach" — the
  +15% customs slice matters only when hauling luxury, so it stays qualitative.

### Odds on choice buttons

- `preview.ts` gains `choiceOdds(s, e): Record<string, string>` alongside
  `choiceStakes`: salvage collect → "1-in-3 hides a hazard"; derelict board →
  "50/50"; pirates/customs/engine are deterministic outcomes — no odds string.
  The event screen renders odds beside the existing stake labels.
- No resolution math changes (decision 6): salvage stays `hash % 3`, derelict
  `hash % 2` — already seeded, already uniform across days.

## 3. The ticker — EXCH + DOCK TALK lanes (`src/engine/bulletin.ts` new, `src/ui/screens.ts`, CSS)

Two stacked lanes directly under the vitals statbar on the **station screen only**
(event screens stay focused; the run-end/debrief screens don't trade).

### EXCH lane (P2-2a — static, scannable)

- Current dock only: per commodity `SYM price ▲/▼ N%` where N is vs `basePrice`
  (world.ts:6), plus `tax N% · dock Ncr` for the docked station. Ends with the same
  data the Trade Hub uses (`getPrice`), so it can't disagree with the market rows.
- Pure presentation — no new engine state.

### DOCK TALK lane (E1-1 — scrolling flavor)

- New pure module `src/engine/bulletin.ts`: `bulletin(seed): string[]` derives
  exactly three lines from the **day-1** price grid via existing `getPrice` — no
  new RNG streams:
  1. the cheapest produce-discount ("Ice glut at Kiruna — water moving at 14cr"),
  2. the richest demand-premium ("Meridian pays 861 for luxury, and taxes 18%"),
  3. one warning from the highest `pirateChance` route ("Raider chatter thick on
     the Verge approach").
- Same lines for every player on a date; ≤70 chars/line; "word on the docks"
  voice; prices beyond day 1 drift, so lines are leads, not oracles (spec §4.3).
- Rendered as a CSS-animation marquee (duplicated content, `translateX` loop).

### Station intel line (P2-2a)

- Trade Hub panel header gains one line from `NODES[loc].produces/demands`:
  "Produces Machine Parts (−30%) · Buys Water (+40%) · Sales taxed 18%".

### Intro screen

- The full three-line bulletin renders statically on the launch surface, giving
  the first-90-seconds player a stated first move (E1-1 acceptance criterion).

### Motion accessibility (WCAG 2.2.2)

- The DOCK TALK lane pauses on hover and on focus-within, and carries a visible
  pause/play toggle (`aria-pressed`).
- `prefers-reduced-motion: reduce` disables the animation entirely — the lane
  renders all three lines statically, wrapped (never truncated); the static form
  is the fallback contract, not an afterthought.
- The EXCH lane never moves by design.

## 4. P1-2 — Forecast sinks (`src/ui/screens.ts`)

- **Jump orbs:** meta line becomes `N⛽ · Ncr · N%` (fuel · destination dock fee ·
  true raid %). Tooltip and sr-only text expand to
  "5 fuel · dock 45cr · 19% raid risk · sells taxed 18%" (tax per decision 5).
- **Interest chip:** the Debt row gains "+Ncr in Nd" — next accrual day is the next
  multiple of `INTEREST_EVERY` (game.ts:41) after the current day, amount is
  `loanInterest(debt, thatDay)` so the escalation schedule (`loanRate`) is priced
  in. Hidden when debt is 0.
- **Sell buttons:** net proceeds become visible text — "Sell 1 → 706cr net" (the
  `netProceeds` helper already exists and already feeds the ×5 aria-label); the
  aria-labels keep their current phrasing.

## 5. README + docs housekeeping

- README "How to Play": score line rewritten to the E0-2 truth — net worth at
  audit/retire/death plus a survival bonus capped at day 12 (peak net worth is a
  stat, not the score).
- README "The Daily Seed": delete "There is no save state — the game holds no
  `localStorage`, and reloading starts a fresh run"; replace with the shipped
  truth — same-day refresh resumes the run, PB/attempts persist locally, a new
  UTC day starts fresh.
- [ROADMAP.md](../../ROADMAP.md): mark E1-1, P1-2, E1-4, B-2, P2-1 ✅ on land;
  M2 header gains "fully shipped"; P2-2's M3 row is annotated "intel half shipped
  with M2 close-out; cost-basis half remains".
- [BACKLOG.md](../../BACKLOG.md) / [ENGAGEMENT_BACKLOG.md](../../ENGAGEMENT_BACKLOG.md):
  tick the matching rows.

## Testing

Vitest, following the existing pure-logic/thin-I/O split:

- **P2-1:** call-site tone/delta assertions (buy/sell/fee/interest/toll/reward);
  a "no unrecognized strings" guarantee now holds by construction — the compiler
  enforces what the regex guessed. Snapshot migration: a v1 snapshot with string
  logs loads, wraps neutral, and resumes; a corrupt entry list rejects to fresh-run.
- **E1-4/B-2:** `pirateChance` values pinned per node; `choiceOdds` strings per
  event kind; a regression test that `rollEvent(seed, day, "vulcan", x)` and
  `rollEvent(seed, day, "verge", x)` differ for some seeds (the aliasing is gone).
- **E1-1:** `bulletin(seed)` determinism (same seed → same lines); named prices
  match day-1 `getPrice` values; at least one line references a trade that is
  profitable on day 1 (buy at the produce price, sell at the demand price net of
  tax); every line ≤70 chars.
- **The 100-seed sweep re-runs** — B-2 reshuffles event sequences, so the E0-1
  bands (≥95% cautious/balanced reach the audit; greedy pre-audit death rate
  10–40%) are re-verified, not assumed. Engine-test fixtures pinned to specific
  event rolls are expected to need re-pinning — churn, not regression.
- **Screens:** EXCH lane matches Trade Hub prices; DOCK TALK carries the pause
  control and the `prefers-reduced-motion` static fallback class; orb meta shows
  fee and true raid %; interest chip math (day 4, debt 1,140 → "+69cr in 2d");
  sell-button net text matches `netProceeds`.
- **Lighthouse CI stays green** — the ticker is the one surface that could regress
  a11y.

## Error handling

- Ticker lanes are pure functions of existing state — no I/O, no new failure
  modes; if `bulletin` ever produced fewer than three lines the lane renders what
  exists (no throw).
- Snapshot migration failures (corrupt v1 log) degrade to today's fresh daily run,
  same silent-degrade contract as all E0-3/E0-5 storage paths.
- `prefers-reduced-motion` and the pause toggle are independent — either alone
  stops the motion.
- Interest chip renders nothing when debt ≤ 0 or the run is over.

## Acceptance criteria (round-level)

P2-1:

- [ ] `GameState.log` is `LogEntry[]`; every engine log line declares tone and
      (for credit movements) delta; the regex `toneOf` is deleted.
- [ ] Money lines render signed, colored deltas; unrecognized-string fallthrough is
      structurally impossible.
- [ ] A v1 run snapshot (string logs) still resumes after upgrade, entries wrapped
      neutral.

E1-4 + B-2:

- [ ] Choice buttons show odds beside stakes: salvage "1-in-3", derelict "50/50";
      resolution math unchanged.
- [ ] Orbs/tooltips show the true raid % from `pirateChance` — no surface anywhere
      still shows raw `danger × 100`.
- [ ] `rollEvent` hashes station indices; vulcan/verge event rolls diverge.
- [ ] The 100-seed sweep bands hold (≥95% cautious/balanced audited; greedy death
      10–40%).

E1-1 + P2-2a:

- [ ] Ticker renders under the statbar at dock: EXCH static (price + ▲▼ vs base +
      tax + dock fee, matching Trade Hub data), DOCK TALK scrolling with pause
      control, hover/focus pause, and reduced-motion static fallback.
- [ ] `bulletin(seed)` is deterministic, three lines ≤70 chars, at least one names a
      day-1-profitable trade; full bulletin shows statically on the intro screen.
- [ ] Trade Hub shows the station intel line (produces/demands/tax).
- [ ] No layout shift in the cockpit panels below the ticker (E1-1 AC).

P1-2:

- [ ] Jump orbs show fuel · dock fee · raid %; tax appears in tooltip/sr text and on
      market surfaces, not the orb face.
- [ ] Debt stat shows the interest countdown chip using the escalated rate for the
      accrual day; hidden at debt 0.
- [ ] Sell buttons show net proceeds as visible text.

Round:

- [ ] README score and persistence claims corrected; ROADMAP/backlog rows ticked on
      land; Milestone 2 marked fully shipped.
- [ ] Full existing suite green; Lighthouse CI green.
