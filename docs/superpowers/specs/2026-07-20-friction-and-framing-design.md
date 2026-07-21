# Friction & Framing — Design

Date: 2026-07-20
Status: approved
Covers: engagement quick wins **2–4** (§5 of
[ENGAGEMENT_BACKLOG.md](../../ENGAGEMENT_BACKLOG.md)) plus UIUX **P1-1**
([BACKLOG.md](../../BACKLOG.md)), which resolves bug **B-4** behaviorally.

## Decision summary

One PR bundling the cheap identity/framing fixes with the one UI item both
backlogs agree is a bug, ahead of the E0-1 Daily Audit:

1. **Goal line + day identity** (quick win 2) — intro copy + dated header.
2. **Cause-of-death line** (quick win 3) — engine message + end-screen surface.
3. **Share card date + URL** (quick win 4) — drop the raw seed integer.
4. **×5/Max trading + contract shortcut** (P1-1) — kills the B-4 rapid-click
   scenario without the render refactor.

Sequencing rationale (from the prioritization discussion): the E0 arc is the
existential fix and comes next; **quick win 1 (score-day cap) is deliberately
folded into E0-1/E0-2** rather than shipped as a stopgap, so score semantics
change once, not twice. UIUX **P1-2** (forecast sinks) and **P2-3** (contract
feasibility) are deferred to their natural partners — E1-4/E1-5 rework the jump
buttons and E2-2 changes the contract economics they would display.

Explicitly **out of scope**: any game-math change; the P1-1 stretch
(DOM patching instead of full `innerHTML` swaps — stays open, root cause of
B-4); P2-4's "Copied ✓" feedback; P3-3's `document.title`.

## 1. Goal line + day identity (quick win 2)

**Intro log line** (`createGame`, game.ts:52) becomes:

> The Syndicate staked your ship — 1,500cr, compounding. Score = your peak
> fortune. Everyone flies today's sky.

E0-1/E0-2 will revise "peak fortune" when the scoring formula changes —
accepted one-line follow-up in that delivery.

**Dated header**: `screenHead` (screens.ts:45) subtitle becomes
"{Station} · Day N · Jul 20". The date label is formatted **UTC**
(`Intl.DateTimeFormat`, `month: "short", day: "numeric", timeZone: "UTC"`) so
it always names the same calendar day `dailySeed` hashed (rng.ts:26 uses UTC
parts). It is computed once in main.ts beside the existing `new Date()` and
passed through the render `ViewModel` as `dateLabel: string` — screens stay
pure string functions of their inputs.

## 2. Cause-of-death line (quick win 3)

**Engine**: the `checkLoss` message (game.ts:192) is enriched with the
location: `Stranded at {NODES[location].name} — out of fuel, out of credits.`

**UI**: `runEndScreen` (screens.ts:309) renders the run's final log entry as a
cause line under "You survived N days.". Invariant making this safe:
`checkLoss` is the only site that sets `status: "lost"` and it appends the
message in the same call, so whenever the end screen renders, the newest log
entry is the cause. No new `GameState` field — E1-3's structured debrief adds
one later if needed.

## 3. Share card date + URL (quick win 4)

`shareText` (share.ts:9) drops `Seed #{seed}` and becomes:

```
🚀 Starlight Traders — Jul 20
Score 524 · survived 13 days
Beat my run: https://github.com/shmoula/starlight-traders
```

- `ShareData.seed` is replaced by `dateLabel: string` (same label as the
  header, passed from main.ts).
- The URL is a named constant `GAME_URL` in share.ts — a single swap point for
  a future itch.io page. The full v2 card (emoji run-strip, Daily/Practice
  label) remains E1-2.

## 4. ×5/Max trading + contract shortcut (P1-1)

**Approach: UI-computed explicit quantities.** The UI computes the clamped
quantity and passes an exact number via `data-qty`; the engine's strict
`buy`/`sell` validators (game.ts:72, game.ts:86) are untouched. This follows
the shipped B-1 refuel precedent: the label promises exactly what the click
delivers, and an enabled button never silently no-ops. Engine-side clamping
was rejected (changes semantics the sim harness and test suite rely on, and
the UI still needs the same math for honest labels).

**Market rows** (`tradeHubPanel`, screens.ts:178) gain quantity buttons:

- Buy side: **Buy 1 / ×5 / Max ×N** where `N = min(⌊credits/price⌋,
cargoCapacity − cargoUsed)`.
- Sell side: **Sell 1 / ×5 / All ×N** where `N = units held`.
- ×5 is disabled with a reason tooltip when fewer than 5 are possible; Max/All
  covers the remainder. Max/All labels show the actual computed count; exact
  cost/proceeds go in `title` and `aria-label` (the unit price is already on
  the row).
- Buttons carry `data-qty`; `applyAction` (main.ts:40) reads
  `Number(btn.dataset.qty ?? 1)` for `buy`/`sell`.
- Disabled states reuse the existing `disabledAttr` helper and mirror the
  engine checks one-for-one (credits, hold room, units held).

**Active-contract shortcut**: each unfulfilled active-contract card
(screens.ts:209) gains a one-click **"Buy {shortfall} for {cost}cr"** button —
`shortfall = m.qty − held`, priced at the current station. Disabled with a
reason when credits or hold space fall short; it buys the full shortfall or
nothing, never a silent partial. Rendered only when `shortfall > 0` and the
contract is not expired.

**B-4 disposition**: with one-click Max/shortfall buys, the rapid-click
scenario disappears in practice; the full-DOM re-render root cause stays
documented as the open P1-1 stretch.

## Testing

- **Engine** (tests/engine/game.test.ts): update the stranding-message
  assertion; add a case asserting the location name appears.
- **Share** (tests/engine/share.test.ts): update `shareText` expectations —
  date line present, seed absent, URL present.
- **UI** (tests/ui/screens.test.ts, existing string-level style): market rows
  render ×5/Max with correct computed quantities and disabled states at
  boundary credit/hold values; active-contract card renders the shortfall
  shortcut (enabled/disabled/hidden cases); end screen renders the cause line;
  header carries the date label.
- Full suite (`vitest`) green; lint/format per CI gates.

## Backlog bookkeeping (same PR)

- ENGAGEMENT_BACKLOG §5: mark quick wins 2–4 shipped; note quick win 1 is
  folded into E0-1/E0-2. Mark B-4 resolved behaviorally (root cause open as
  P1-1 stretch).
- BACKLOG.md: mark P1-1 shipped except the stretch; update the B-4
  cross-reference.
