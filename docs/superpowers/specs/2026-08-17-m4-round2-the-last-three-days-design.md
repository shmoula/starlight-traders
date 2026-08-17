# M4 Round 2 — "The Last Three Days" (E1-5 + P3-2 + P2-4)

**Date:** 2026-08-17 · **Status:** 📝 drafted
**Source:** [ROADMAP.md](../../ROADMAP.md) Milestone 4 (and its 🟡 deferred tail);
specs in [ENGAGEMENT_BACKLOG.md](../../ENGAGEMENT_BACKLOG.md) row E1-5 and
[BACKLOG.md](../../BACKLOG.md) rows P3-2, P2-4.

## Scope

The round that closes Milestone 4. One round at the round-4/5/M4-round-1 (L)
budget. Theme: **make the last three days of a run the hardest ones.**

The problem: a bounded run (E0-1) with a fixed lane-danger table (E2-3) has no
escalation in it. The only recurring pressure — the pirate toll — is authored as
`150 + day × 10`, which grows linearly while the player's fortune grows
geometrically. Late days are therefore the safest and richest part of the run:
the opposite of the intensity curve a 12-day roguelike wants, and the exact
flatness E1-5 was deferred pending.

### The E1-5 gate, ruled

E1-5's deferral condition was _"add only if the endgame is still flat after E0-1
(bounded) + E0-4 (loan escalation)"_. M4 round 1's acceptance criteria required
that gate to be ruled on at close; it was not. It is ruled **met** here, on
measured evidence — a 100-seed instrumented sweep against master at `e9b0f79`
(throwaway harness, mirroring `runArchetype`'s persona logic and recording
`netWorth`, `pirateToll`, and `pirateChance` per day):

| archetype | day |   n | med net worth | med toll | toll as % of NW | med lane danger |
| :-------- | --: | --: | ------------: | -------: | --------------: | --------------: |
| balanced  |   4 | 100 |           637 |      190 |           29.8% |           0.280 |
| balanced  |  11 | 100 |         6,249 |      260 |            4.2% |           0.280 |
| greedy    |   4 |  99 |           242 |      190 |           78.5% |           0.300 |
| greedy    |  11 |  76 |         6,499 |      260 |            4.0% |           0.280 |

Two findings, and this round has one lever for each:

1. **Stakes decay ~7×.** The toll falls from ~30% of net worth mid-run to ~4% by
   day 11. The pay-vs-flee choice degenerates into "just pay" long before the
   audit.
2. **Odds never move.** Lane danger is per-lane only, so day 11 is exactly as
   dangerous as day 1 — while the greedy archetype's deaths cluster in days 4–9
   (n falls 99 → 76) and then stop.

**In scope:**

- **E1-5a Heat (odds)** — every lane's danger gains a floor scaled to
  `peakNetWorth`, clamped, flowing through the existing single-source
  `effectiveDanger` so every surface inherits it honestly.
- **E1-5b Heat (stakes)** — the pirate toll gains a net-worth component, with
  today's flat formula surviving as its floor.
- **E1-5c Heat's voice** — an authored Syndicate line when heat crosses a
  threshold, so escalation is narrated rather than merely computed.
- **P3-2 Juice remainder** — delta-keyed stat pulse, floating credit toast, and
  green→amber→red danger pips. The pips are heat's primary glanceable readout,
  so the two items reinforce each other rather than merely co-shipping.
- **P2-4 leftovers** — statbar peak chip and `Copied ✓` / `Copy failed` share
  feedback.
- **Sim gate** — existing gates hold, plus a new **pressure-curve gate** that
  promotes the measurement above into the suite: the endgame must be
  measurably not flat.

**Explicitly out of scope (deferred):** E3-3 Distress Call and E3-5 image share
card stay ⚪ backlog — both are additive content on an acquisition surface, and
neither is corrective. Heat on the bulletin or share card (the statbar and the
map carry it; a third copy earns nothing). Heat decay / cool-off (decision 2).
Wealth-scaled bait odds, luxury-attracts-pirates (B-5's implement path), and any
cargo-composition danger term — one wealth signal is the round's budget.

## Decisions

1. **Heat is derived from `peakNetWorth`, never stored.** A pure
   `heatOf(s: GameState): number` in economy.ts reads the existing
   `peakNetWorth` field. No `GameState` field, no snapshot migration, no save-doc
   bump — the E3-1 precedent (a modifier derivable from `seed` anywhere,
   including the sim and a rehydrated snapshot). Snapshot stays v6, save doc
   stays v2.

2. **Heat ratchets up and never cools.** Reading peak rather than current net
   worth makes heat undodgeable by construction: there is no "sell everything and
   fly empty on day 11" anti-strategy to balance around — the exact class of
   degenerate play Milestone 3 spent five rounds killing, and one the sim's
   personas would never discover, so the gate would not catch it. The sympathy
   case (a wiped-out trader still hunted) is handled by the _stakes_ lever
   instead: the toll is a share of **current** net worth, still clamped to
   credits, so the demand shrinks with the player even while the odds do not.
   No decay tail: a third piece of state to persist, migrate, display, and
   explain is more machinery than a 12-day run justifies.

3. **The heat curve is a step function with a hard cap.**

   ```ts
   export const HEAT_PER_CR = 1500; // ⚙ credits of peak per heat point
   export const HEAT_STEP = 0.01; // ⚙ danger added per point
   export const HEAT_CAP = 0.15; // ⚙ ceiling, well below DANGER_CAP
   ```

   `heatOf = min(HEAT_CAP, floor(max(0, peakNetWorth) / HEAT_PER_CR) × HEAT_STEP)`.
   Steps rather than a continuous ramp so the number shown on the statbar is
   stable and quotable ("+4%"), and so the threshold-crossing voice (decision 6)
   has discrete events to fire on. At the measured day-11 medians (balanced
   6,249, greedy 6,499; greedy mean peak ≈ 11,900) the plan defaults give
   **+4 points for a median run and +7–8 for a rich one**; the cap binds only
   above 22,500 peak. Expect the plan to retune `HEAT_PER_CR` toward ~1,000 —
   these are ⚙ plan-time knobs, tuned against the sweep by the round-5
   procedure.

4. **Heat only bites players who got rich.** This falls out of decision 1 rather
   than being special-cased: the sim's cautious turtle never takes its net worth
   positive, so its `peakNetWorth` sits at 0 and it earns no heat at all. The
   progressive sink the backlog asked for, with no pile-on for the losing player
   (the backlog's own rejected-ideas lens).

5. **Heat reaches the event roll through a `JumpRisk` context, and amnesty still
   wins.** `rollEvent` and `effectiveDanger` stay pure over their inputs — the
   band-mirror tests and the sim depend on it — so the two per-jump risk inputs
   travel together instead of accreting positional arguments:

   ```ts
   export interface JumpRisk {
     tailed: boolean;
     heat: number;
   }
   export function effectiveDanger(seed, from, to, risk: JumpRisk): number;
   export function rollEvent(seed, day, from, to, risk: JumpRisk): GameEvent;
   ```

   Call sites read `{ tailed: s.pirateTail, heat: heatOf(s) }`. `pirateChance(s, to)`
   keeps its state-taking signature and builds the risk itself, so every UI
   surface — jump orbs, star map, feasibility, escape math — inherits heat with
   no second copy to go stale (B-1). Stacking order is unchanged from round 1:
   **amnesty returns 0 before heat is added**, corsairs and the bait tail add on
   top, and the total is clamped to `DANGER_CAP = 0.9`.

6. **The toll's flat formula becomes its floor.**

   ```ts
   export const TOLL_RATE = 0.1; // ⚙ share of net worth the pirates ask for
   export function pirateToll(s: GameState): number {
     return Math.max(
       0,
       Math.min(s.credits, Math.max(150 + s.day * 10, Math.round(TOLL_RATE * netWorth(s))))
     );
   }
   ```

   Early-run tolls are byte-identical: the flat term wins below the crossover
   `(150 + day × 10) / TOLL_RATE`, i.e. 1,600cr on day 1 rising to 2,700cr on
   day 12 — so nothing about the opening changes. At the measured day-11
   median the demand goes 260cr → ~625cr, restoring roughly the mid-run
   pressure share. The `min(s.credits, …)` clamp is untouched — a broke trader is
   never asked for what they do not have. `choiceStakes` already renders
   `~${pirateToll(s)}cr`, so the displayed stake tracks the change for free
   (E1-4).

   **This is the round's main balance risk, stated up front:** a larger toll
   makes fleeing attractive, fleeing costs 15–25 hull, and the greedy death rate
   currently sits at 30/100 against a 10–40 band. `TOLL_RATE` is the first knob
   to pull if that band is threatened.

7. **Heat has a voice, with no new state.** `trackPeak` (game.ts:129) already
   computes the new peak; it compares `heatOf` before and after and, when the
   value crosses an authored threshold (every `HEAT_VOICE_STEP = 0.05` ⚙), logs
   one Syndicate-flavored line (tone `bad`, no delta). The crossing is visible in
   the transition itself, so nothing needs remembering. Lines live in
   `fiction.ts` beside the other authored strings (E2-4 precedent) and reuse
   E0-4's lender voice — e.g. _"The Syndicate's ledger is public. Someone has
   been reading yours."_

8. **One `dangerTier` feeds every pip.** `dangerTier(p): "calm" | "wary" | "hot"`
   is exported once and read by both the Navigator's jump orbs and the star
   map's lanes, so the two surfaces cannot disagree about what red means.
   Thresholds are ⚙ (`< 0.15` calm, `< 0.30` wary, else hot). Pips are
   `aria-hidden`: the existing `20%☠` label and sr-only lane text already carry
   the number, and a second announcement would be noise. Because tiers read
   `pirateChance`, the map visibly reddens as heat climbs with zero extra
   plumbing — the escalation the E2-3 row anticipated.

9. **Juice reads a vitals diff, not the log.** A new pure `src/ui/pulse.ts`
   exports `vitalPulses(prev, next): { credits?: "up" | "down"; fuel?: …; hull?: … }`.
   `main.ts` holds the previous vitals across paints, the `ViewModel` carries
   `pulses`, and `statbar` renders `st-statbar__chip--pulse-up/down`. Diffing
   state rather than parsing log strings is the P2-1 lesson applied: the pulse
   cannot miss a change no keyword matched. Because `render` swaps `innerHTML`
   wholesale, a one-shot CSS animation on the fresh node plays exactly once —
   no animation bookkeeping, no double-fire.

10. **The toast lives outside the swapped root.** `index.html` gains
    `<div id="toasts" aria-hidden="true">` as a sibling of `#app`; `main.ts`
    appends a `+860cr` node after paint and the node removes itself on
    `animationend`. Inside `#app` it would be destroyed by the next
    `innerHTML` swap (the B-4 root cause). `aria-hidden` is deliberate: the
    structured log already announces every credit change, and an aria-live toast
    would double it for screen readers. Pulse and toast are both disabled under
    `prefers-reduced-motion`.

11. **P2-4's leftovers ride along.** The statbar gains `🏆 {peak}` — which stops
    being a debrief-only stat now that it is the number driving the player's
    danger — plus `☠ heat +N%` once heat is non-zero, tooltipped with what it
    does. `main.ts` stops discarding `copyShare`'s result (main.ts:329):
    `shareStatus: "idle" | "ok" | "fail"` flips the button to `Copied ✓` /
    `Copy failed` for 2s, then repaints.

12. **The sweep gains a pressure-curve gate.** This round exists to change a
    curve, so the gate measures that curve rather than only guarding against
    regressions. `SimResult` gains `earlyDanger`, `lateDanger`, and
    `lateTollShare`; the sweep asserts, for balanced and greedy:

    - `lateDanger` (days ≥ 9) ≥ `earlyDanger` (days ≤ 3) + 0.02 ⚙ — late days
      are measurably more dangerous, not merely differently priced.
    - `lateTollShare` — median toll ÷ net worth on days ≥ 9 — ≥ 0.08 ⚙, against
      today's measured 0.042.

    **Existing gates hold:** every run ends ≤ day 12; ≥95% cautious/balanced
    audited; greedy deaths 10–40%; greedy > cautious on peak; the three
    depth-decay gates; ≥2 viable loops/day; per-modifier fairness ≥90%.

    **One movement is expected, not a surprise:** the sim's cautious persona
    _pays_ tolls, so a wealth-scaled toll pushes its net worth further negative.
    The round-1 anchor guardrail (`|cautious − pre-depth| < 10,000`) may trip and
    be re-recorded against the measured post-round number, keeping its spirit —
    the turtle stays pinned near its debt floor, neither runaway-rich nor
    collapsed. Knob changes re-record thresholds in the plan with actual
    post-change sweep numbers, the round-5 procedure.

## Build order

1. **Heat engine + threading** — `heatOf` in economy.ts; `JumpRisk`;
   `effectiveDanger`/`rollEvent` re-signature and the compiler-walked call-site
   sweep (game, events, map, screens, sim, fixtures); tests.
2. **Stakes** — `pirateToll` floor/rate rework; `choiceStakes` honesty tests;
   early-run byte-identity tests.
3. **Voice** — threshold crossing in `trackPeak`, authored lines in fiction.ts;
   tests.
4. **Heat surfaces** — statbar peak + heat chips; `dangerTier` and pips on orbs
   and star-map lanes; tests.
5. **Juice + share feedback** — `pulse.ts`, `ViewModel.pulses`, statbar pulse
   classes, `#toasts` container and toast lifecycle, `shareStatus`; reduced-motion
   CSS; tests.
6. **Sim gates + verification** — `SimResult` instrumentation, pressure-curve
   gate, knob tuning until every gate is green; full suite; Lighthouse CI.

## Engine — economy.ts, events.ts, game.ts, preview.ts, fiction.ts

```ts
// economy.ts
export const HEAT_PER_CR = 1500; // ⚙
export const HEAT_STEP = 0.01; // ⚙
export const HEAT_CAP = 0.15; // ⚙
export const TOLL_RATE = 0.1; // ⚙
/** Wealth-scaled danger floor (E1-5): pirates hunt whoever has been winning. */
export function heatOf(s: GameState): number;

// events.ts
export interface JumpRisk {
  tailed: boolean;
  heat: number;
}
export function effectiveDanger(seed: number, from: NodeId, to: NodeId, risk: JumpRisk): number;
export function pirateChance(s: GameState, to: NodeId): number; // builds the risk from state
export function rollEvent(
  seed: number,
  day: number,
  from: NodeId,
  to: NodeId,
  risk: JumpRisk
): GameEvent;

// preview.ts — pirateToll gains the TOLL_RATE term (decision 6); choiceStakes unchanged
// game.ts — jump passes { tailed: state.pirateTail, heat: heatOf(state) };
//           withPeak logs a threshold crossing (decision 7)
// fiction.ts — HEAT_LINES: authored Syndicate lines, one per threshold
```

`effectiveDanger` stays `amnesty ? 0 : min(DANGER_CAP, laneDanger + corsair + heat + tail)` —
heat slots in beside the round-1 terms and inherits their clamp and their
amnesty short-circuit. The `rollEvent` local rng, draw order, and band widths are
untouched: a zero-heat, untailed, clear-skies roll is byte-identical to today's
for every seed, which is what keeps the existing fixtures meaningful.

## Storage

**No migration.** Heat derives from `peakNetWorth`, which snapshots already
carry; the juice and share-feedback work is view state that never persists. Run
snapshot stays **v6**, save doc stays **v2**, `STORAGE_KEY` unchanged. A run
resumed mid-day recomputes the same heat from the same peak.

## UI — screens.ts, map.ts, pulse.ts (new), render.ts, main.ts, index.html, styles

- **statbar:** `🏆 {peak}` chip always; `☠ heat +N%` chip when `heatOf > 0`,
  with a tooltip naming the effect; pulse classes from `ViewModel.pulses`.
- **Navigator + star map:** `dangerTier`-driven pips (`aria-hidden`) beside the
  existing raid-% text; both surfaces read the one helper (decision 8).
- **Event screen:** the pirates stake row shows the new toll automatically —
  `choiceStakes` already derives it from `pirateToll`.
- **Log:** heat's threshold lines render as ordinary `bad`-tone entries with no
  delta, collapsing under P3-1's run-collapse like any other line.
- **index.html:** `<div id="toasts" aria-hidden="true">` sibling of `#app`.
- **main.ts:** previous-vitals bookkeeping, toast append after paint,
  `shareStatus` timer, `dailyModifier`-style pure calls only — no game logic.
- **CSS:** pulse/toast keyframes and pip tiers in design-system.css beside the
  existing `st-pulse-*` keyframes; all motion inside
  `@media (prefers-reduced-motion: no-preference)`.

## Testing

Vitest, same pure-logic/thin-I/O split:

- **heat:** step boundaries (1,499 → 0 points; 1,500 → 1); cap binds above
  22,500; a negative/zero peak yields 0; heat is a pure function of the peak.
- **stacking:** amnesty zeroes a heated lane; corsairs + heat + tail sum and
  clamp to `DANGER_CAP`; a zero-heat untailed clear-skies roll is byte-identical
  to the pre-round fixtures for every seed in the existing corpus.
- **honesty:** for a sampled grid of states and lanes, the `pirateChance` a
  surface would display equals the band `rollEvent` rolls on (the E1-4 invariant,
  now with heat in it).
- **toll:** the flat formula still wins below the crossover (byte-identical
  early run); the rate wins above it; the credits clamp holds when broke;
  `choiceStakes` renders the same number the resolver charges.
- **voice:** a crossing fires exactly once per threshold; no line when the peak
  moves within a step; tone `bad`, no delta.
- **pips/pulse:** `dangerTier` boundaries; `vitalPulses` sign logic including
  no-change and multi-stat cases; statbar renders the chips and classes; the
  pips are `aria-hidden` and duplicate no announced text.
- **share feedback:** resolve → `Copied ✓`; reject → `Copy failed`; both revert.
- **sim:** decision 12's gates — existing assertions green, pressure-curve gate
  green, knob values and post-change numbers recorded in the plan.
- **Lighthouse CI stays green** — static additions plus two short animations.

## Error handling

- `heatOf` clamps to `[0, HEAT_CAP]` from `max(0, peak)`: no surface can show a
  negative or runaway heat, whatever the state says.
- `pirateToll` keeps its `min(credits, …)` clamp, so a wiped-out trader is never
  asked for more than they hold — the sympathy case decision 2 relies on.
- A missing `#toasts` container degrades to no toast rather than throwing (the
  "silently can't" class, not a crash).
- `copyShare` rejection lands on `Copy failed` instead of today's silence.
- A v6 snapshot resumes with correct heat because heat is state-free; no
  migration path exists to get wrong.
- Sim personas stay deliberately heat-blind (they route on naive spot margins);
  the gates measure outcomes, not persona IQ — the round-5 precedent.

## Acceptance criteria (round-level)

E1-5:

- [ ] Heat rises in steps with `peakNetWorth`, caps at `HEAT_CAP`, and is shown
      on the statbar, the jump orbs, and the star map — one source, no drift.
- [ ] The pirate toll scales with net worth above the flat floor; the displayed
      stake equals the charge; a broke trader is never over-charged.
- [ ] Crossing a heat threshold narrates itself once, in the Syndicate's voice.
- [ ] Amnesty still zeroes every lane; `DANGER_CAP` still binds with heat, tail,
      and corsairs stacked.

P3-2 / P2-4:

- [ ] Stat chips pulse on the correct sign, a credit toast floats and clears,
      danger pips read the same tier on both surfaces, and all motion respects
      `prefers-reduced-motion`.
- [ ] The statbar carries peak net worth; the share button confirms success and
      reports failure.

Round:

- [ ] Pressure-curve gate green: `lateDanger ≥ earlyDanger + 0.02` and
      `lateTollShare ≥ 0.08` for balanced and greedy.
- [ ] Existing sweep gates green or re-recorded with measured post-change
      numbers and a stated rationale; greedy death rate still inside 10–40.
- [ ] Full suite green; Lighthouse CI green; no snapshot or save-doc migration
      required.
- [ ] ROADMAP/backlog rows ticked on land (E1-5, P3-2, P2-4) and **Milestone 4
      closed**, with E3-3 and E3-5 left explicitly ⚪ backlog.
