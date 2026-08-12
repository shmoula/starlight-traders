# M4 Round 1 — "No Two Days Alike" (E3-1 + E3-2 + E3-4)

**Date:** 2026-08-12 · **Status:** draft — awaiting review
**Source:** [ROADMAP.md](../../ROADMAP.md) Milestone 4; specs in
[ENGAGEMENT_BACKLOG.md](../../ENGAGEMENT_BACKLOG.md) rows E3-1, E3-2, E3-4.

## Scope

The first M4 round — opens the milestone. One round at the round-4/5 (L)
budget. Theme: **give each day a nameable personality and make every edge of
the map earn its place.**

The problem (backlog): every day plays the same _kind_ of day — nothing beyond
price noise gives a date a personality worth talking about (E3-1); the
Kiruna↔Verge (7⛽) and Kiruna↔Meridian (8⛽) lanes are dead edges never
economically flown, so 2 of 10 lanes are wasted content (E3-2); and salvage is
strictly free money on an empty hold — the "trap when greedy" the design doc
promised doesn't exist (E3-4). All three are seeded content on the same
event/bulletin layer, guarded by the same sim sweep round 5 just re-baselined.

**In scope:**

- **E3-1a Modifier engine** — one seeded modifier per daily seed (constant for
  the whole run), drawn from an authored 7-entry pool; effects channel through
  the existing single-source functions (`fuelCost`, `getPrice`, the event
  bands) so every surface inherits them honestly.
- **E3-1b Modifier surfaces** — the bulletin leads with a `TODAY:` line naming
  the modifier; the station screen-head carries its short name all run; the
  share card line 1 gains the modifier tag (the "hard one today" chatter hook).
- **E3-2a Long-haul salvage** — the two 7–8⛽ lanes double their salvage band;
  the Navigator orb tooltip and sr-only text name them salvage-rich.
- **E3-2b Ice runs** — on seeded days, Kiruna's board carries one extra
  contract: water → the Verge at a long-haul premium on a tight deadline,
  tagged ❄ on the card; the bulletin mentions it when day 1 has one.
- **E3-4 Salvage bait** — a clean scoop is seeded ~1-in-4 to attract a pirate
  tail on the next jump; the odds show on the collect button (E1-4 rule), the
  tail is announced when it latches, and every raid % shown while it is active
  includes it.
- **Sim gate** — the sweep runs against the world with modifiers, bait, and
  long-haul salvage live: existing four assertions and the round-5 depth-decay
  and viable-loops gates stay green (thresholds re-recorded if knobs move), plus
  a new per-modifier fairness gate — no modifier makes a day type unwinnable.

**Explicitly out of scope (deferred):** E1-5 heat (its gate — "is the endgame
still flat?" — is ruled on at round close, after playtesting this round's
pressure; nothing is pre-built); P3-2 juice remainder and E3-5 image share card
(the later polish round); E3-3 distress call (backlog); modifiers that touch
sales tax, refuel price, or contract rewards (each drags a third signature
through the economy for no authored payoff this round); wealth-scaled bait
odds (heat territory — bait odds stay flat and displayable).

## Decisions

1. **One modifier per daily seed, not per in-game day.** `dailyModifier(seed)`
   in a new `src/engine/modifiers.ts` picks from the pool by
   `hashSeed(seed, MODIFIER_SALT) % pool.length` — everyone flying a date
   shares one sky all 12 days, which is what makes it nameable ("ion storms
   today"). Practice runs get whatever their random seed draws; no
   special-casing. No `GameState` field — the modifier is derivable from
   `seed` anywhere, including the sim and a rehydrated snapshot.

2. **The pool is 7 authored entries, effects limited to three hooks.** Each
   entry is data: `{id, name, glyph, bulletinLine, fuelDelta?, priceMult?,
eventTweak?, interestHoliday?}`. Numbers are ⚙ plan-time knobs tuned
   against the sweep:

   | id              | name              | effect                            |
   | :-------------- | :---------------- | :-------------------------------- |
   | `clearSkies`    | ✨ Clear skies    | none — the neutral baseline day   |
   | `ionStorms`     | ⚡ Ion storms     | every jump +1⛽                   |
   | `luxuryBoom`    | 💎 Luxury boom    | Meridian pays ×1.25 for luxury    |
   | `partsGlut`     | ⚙ Parts glut      | Vulcan sells Machine Parts ×0.8   |
   | `amnesty`       | 🕊 Pirate amnesty  | no ambushes, no salvage fields    |
   | `corsairSeason` | ☠ Corsair season  | every lane +6 pts raid risk       |
   | `syndicateRest` | 🏦 Syndicate rest | no loan interest accrues this run |

   Bulletin lines are authored per entry, ≤70 chars, `TODAY:`-prefixed (e.g.
   "TODAY: Ion storms — every jump burns +1⛽"). The pool deliberately mixes
   threat, opportunity, and calm; `clearSkies` names the plain day rather than
   leaving it nameless.

3. **`fuelCost` gains a seed and stays the only fuel authority.**
   `fuelCost(seed, from, to)` applies `fuelDelta` on top of the DISTANCE table
   (world.ts:62); `cheapestJumpCost(seed, from)` follows. Every caller — jump,
   escape math (`escapeCost`/`canEscape`), `missionFeasibility`, the sim,
   `viableLoops`, screens, and the star map — already holds a state or seed,
   so the compiler walks the change. This is the blast radius that buys
   honesty for free: on an ion-storm day the jump buttons, map labels, fuel
   warnings, feasibility cards, and stranding math all show storm prices
   because there is no second copy to go stale (B-1 rule).

4. **Price modifiers apply inside `getPrice`; `baselinePrice` is untouched.**
   `getPrice` multiplies by the modifier's `priceMult` for the matching
   (node, commodity) after `stationPriceModifier`, before the `max(1, round())`
   clamp. Mission rewards keep anchoring to the modifier-free `baselinePrice`
   (E2-2f): a seed-constant boom is not a stale anchor, and a boom day paying
   spot above contract rates is an opportunity, not an exploit. The E2-2c
   floor reads origin spot — which includes the modifier — so floors only
   rise. The exch ticker's ▲▼ vs base shows the boom automatically.

5. **Danger modifiers and the bait tail share one effective-odds helper.**
   events.ts gains
   `effectiveDanger(seed, from, to, tailed): number` =
   `amnesty ? 0 : min(DANGER_CAP, laneDanger(from, to) + corsairDelta + (tailed ? TAIL_BONUS : 0))`
   with `DANGER_CAP = 0.9` ⚙ and `TAIL_BONUS = 0.35` ⚙. `rollEvent` rolls its
   pirate band on it and the UI's `pirateChance` re-exports it, re-signed as
   `pirateChance(s: GameState, to: NodeId)` — the state carries seed, location,
   and tail, so screens and the star map cannot show a number the engine won't
   roll (E1-4). The EDGE_DANGER table itself is untouched; its [0.05, 0.35]
   pinning tests stand. Amnesty wins every stacking question by zeroing the
   band — and no tail can exist on an amnesty seed anyway (no salvage events,
   decision 6).

6. **Amnesty empties both hostile bands; long-haul doubles salvage.** In
   `rollEvent`, the salvage band becomes `amnesty ? 0 : longHaul ? 0.36 : 0.18`
   (⚙ — exactly double on long-haul lanes), where `longHaul` means the
   DISTANCE table's base fuel ≥ `LONG_HAUL_FUEL = 7` ⚙ — the storm modifier
   does not promote 6⛽ lanes into salvage-rich ones (the incentive is about
   the map's dead edges, not today's weather). Derelict, engine, and customs
   bands are unchanged; the quiet band absorbs the movement, matching the
   existing "bands grow the hostile slice" construction (events.ts:35).

7. **The ice run is an appended mission with its own RNG stream.** On days
   where `hashSeed(seed, day, ICE_SALT) % ICE_RUN_CADENCE === 0`
   (`ICE_RUN_CADENCE = 3` ⚙), `generateMissions(seed, day, "kiruna")` appends
   one extra mission from a **separate** `mulberry32` stream — existing board
   draws are byte-identical (the E2-2f precedent). Shape: water → verge,
   qty 10–14, reward `round(qty × baselinePrice("verge", "water") ×
(2.4 + rng × 0.6))` ⚙ — roughly double a normal premium, pricing the 7⛽
   burn and the 30% lane — deadline `day + 2..3` (a run, not an errand),
   standard 10% deposit, id `kiruna-{day}-ice`. `Mission` gains an optional
   `tag?: "ice"`; the offer card renders a `❄ ICE RUN` prefix and the
   feasibility card already prices the rest. No reward-floor exemption: E2-2c
   still applies (it can only raise).

8. **Bait rolls only on a clean scoop, and announces itself.** In
   `resolveSalvage`, after a successful (non-warhead, non-full-hold) collect:
   `hashSeed(s.seed, s.day, BAIT_SALT) % SALVAGE_BAIT_DIVISOR === 0`
   (`SALVAGE_BAIT_DIVISOR = 4` ⚙) sets `pirateTail: true` and logs
   "That debris was bait — a pirate tail swings in behind you." (tone bad).
   The warhead outcome does not also roll bait (no pile-ons on the victim —
   the backlog's own lens). The player learns immediately, turning the tail
   into a navigation decision rather than a gotcha: every raid % they see next
   includes it (decision 5), and the Navigator shows a
   `⚠ Pirate tail — raid risk up on every lane until you jump` banner.

9. **`pirateTail` lives on `GameState` with `boughtHere`'s lifecycle.** Set by
   resolveSalvage, read by the next `jump()`'s `rollEvent` call (pre-jump
   state), cleared unconditionally in the jump's state reset beside
   `boughtHere`/`soldHere` — the tail lasts exactly one jump, fired or not.
   Snapshot v5→v6 defaults it `false`; a pre-round snapshot resumes untailed
   (the "silently can't" degradation class). Save doc stays v2; `STORAGE_KEY`
   unchanged.

10. **Odds and stakes stay displayable, per E1-4.** `choiceOdds` for salvage
    becomes two clauses: "1-in-3 hides a hazard · clean scoop: 1-in-4 is bait"
    — both derived from the divisors the resolver actually rolls
    (SALVAGE_HAZARD_DIVISOR, SALVAGE_BAIT_DIVISOR), so retuning cannot strand
    the label. On amnesty days no salvage event fires, so no bait surface
    appears at all — the bulletin already said why.

11. **Interest holiday is honest end to end.** On a `syndicateRest` seed,
    `jump()` skips the accrual block and `interestForecast` returns `null`
    (the debt chip simply shows no forecast). `loanInterest` itself is
    unchanged — the holiday is a skip, not a rate of 0, so E0-4's escalation
    voice needs no new lines. The Syndicate's staking line and audit are
    untouched: the day is easier, not different in kind.

12. **Chatter surfaces name the day.** `bulletin(seed)` prepends the
    modifier's `TODAY:` line (4 lines total; 5 when day 1 has an ice run —
    "❄ Ice run posted at Kiruna Belt — the Verge pays for water"). The
    station `screenHead` sub-line appends `· {glyph} {name}` so the personality
    is visible past day 1. `shareText` line 1 appends `· {glyph} {name}` —
    the comparison artifact carries the day's excuse ("corsair season, and I
    still banked 2,400"). Fiction voice: bulletin lines live in the modifier
    pool (modifiers.ts), following fiction.ts's authored-strings style.

13. **The sweep gates extend rather than reset.** This round moves the economy
    (fuel, prices, event mix), so the proof obligation is round-5-style:

    - **Existing gates stay green:** every run ends ≤ day 12; ≥95% of
      cautious/balanced audited; greedy deaths 10–40%; greedy > cautious on
      peak NW; the three depth-decay gates vs the recorded pre-depth baseline;
      ≥2 viable loops/day (now measured with modifier-aware fuel and prices).
    - **Per-modifier fairness (new):** grouping the 100 sweep seeds by
      `dailyModifier(seed)`, every modifier group keeps a ≥90% ⚙
      cautious+balanced audit rate — no modifier is an unwinnable day type.
    - **Bait bite (new observability):** the greedy archetype (the only
      collector) reports tail count in `SimResult`; the plan records the
      pre/post death-rate split to show bait prices salvage without blowing
      the 10–40% band.
    - Knob changes (⚙ values above) re-record thresholds in the plan with the
      actual post-change sweep numbers, the round-5 procedure.

## Build order

1. **Modifier engine + fuel/price threading** — modifiers.ts (pool, salt,
   `dailyModifier`, per-hook accessors); `fuelCost`/`cheapestJumpCost` seed
   threading through all callers; `getPrice` multiplier; tests.
2. **Event hooks** — `effectiveDanger`, `pirateChance` re-signature, amnesty +
   corsair + long-haul bands in `rollEvent`; map/screens callers; tests.
3. **Ice runs** — `Mission.tag`, appended stream in `generateMissions`, card
   prefix, bulletin conditional line; tests.
4. **Bait tail** — `pirateTail` state + resolveSalvage roll + jump clear +
   snapshot v6; choiceOdds clause; Navigator tail banner; tests.
5. **Modifier surfaces** — bulletin TODAY line, screenHead chip, share-card
   tag; tests.
6. **Sim gates + verification** — SimResult tail counts, per-modifier
   fairness gate, knob tuning until all gates green; full suite; Lighthouse CI.

## Engine — modifiers.ts (new), world.ts, events.ts, game.ts, missions.ts, preview.ts, bulletin.ts

```ts
// modifiers.ts (new)
export type ModifierId =
  | "clearSkies"
  | "ionStorms"
  | "luxuryBoom"
  | "partsGlut"
  | "amnesty"
  | "corsairSeason"
  | "syndicateRest";
export interface DailyModifier {
  id: ModifierId;
  name: string; // "Ion storms"
  glyph: string; // "⚡"
  bulletinLine: string; // "TODAY: Ion storms — every jump burns +1⛽" (≤70 chars)
  fuelDelta?: number; // ionStorms: +1
  priceMult?: { node: NodeId; commodity: CommodityId; mult: number };
  eventTweak?: "amnesty" | "corsairs";
  interestHoliday?: boolean;
}
export const MODIFIER_POOL: readonly DailyModifier[]; // the 7 entries, authored
export const CORSAIR_DANGER_DELTA = 0.06; // ⚙
export function dailyModifier(seed: number): DailyModifier;

// world.ts — signature changes only; DISTANCE and EDGE_DANGER tables untouched
export function fuelCost(seed: number, from: NodeId, to: NodeId): number; // + fuelDelta
export function cheapestJumpCost(seed: number, from: NodeId): number;
// getPrice applies priceMult after stationPriceModifier; baselinePrice unchanged

// events.ts
export const DANGER_CAP = 0.9; // ⚙
export const TAIL_BONUS = 0.35; // ⚙
export const LONG_HAUL_FUEL = 7; // ⚙ base-table fuel that marks a lane salvage-rich
export function effectiveDanger(seed: number, from: NodeId, to: NodeId, tailed: boolean): number;
export function pirateChance(s: GameState, to: NodeId): number; // = effectiveDanger(…)
export function rollEvent(
  seed: number,
  day: number,
  from: NodeId,
  to: NodeId,
  tailed: boolean
): GameEvent;

// game.ts / preview.ts
export const SALVAGE_BAIT_DIVISOR = 4; // ⚙ (preview.ts, beside SALVAGE_HAZARD_DIVISOR)
// GameState gains: pirateTail: boolean (decision 9)

// missions.ts
export const ICE_RUN_CADENCE = 3; // ⚙
// generateMissions appends the tagged ice run from a separate rng stream (decision 7)
```

- `jump()` passes `state.pirateTail` into `rollEvent` and resets it to `false`
  beside `boughtHere`/`soldHere`; on a `syndicateRest` seed the interest block
  is skipped (decision 11).
- `resolveSalvage` rolls bait on the clean-scoop path only (decision 8).
- `bulletin(seed)` prepends the modifier line and appends the day-1 ice-run
  line (decision 12).
- The `rollEvent` local rng and draw order are unchanged — a `clearSkies`,
  non-tailed, short-lane roll is byte-identical to today's for every seed.

## Storage — snapshot migration

Run snapshot v5→v6 in the existing chain (storage.ts:520 pattern): a v5
snapshot gains `pirateTail: false`; validation extends to the new boolean and
tolerates the optional `tag` on stored missions (accept absent or `"ice"`;
reject other values). A malformed doc still returns `null` (fresh start). Save
doc stays v2.

## UI — screens.ts, map.ts, share.ts, styles.css

- **screenHead:** sub-line appends `· {glyph} {name}` from `dailyModifier`
  (both meta and no-meta branches).
- **Navigator:** orb tooltips/sr-only add "salvage-rich lane" on long-haul
  lanes; a `st-badge--alert` tail banner renders while `pirateTail` is true;
  raid % everywhere flows from the re-signed `pirateChance(s, to)`.
- **Star map:** lane labels and tones read the same `pirateChance`, so a tail
  or corsair day visibly reddens today's lanes with zero extra plumbing.
- **Contracts:** offer cards render `❄ ICE RUN — ` before tagged missions.
- **Event screen:** salvage collect stake row shows both odds clauses
  (decision 10).
- **Share card:** line 1 gains `· {glyph} {name}`; tests update the fixture
  strings. No Logbook or feats changes.

## Testing

Vitest, same pure-logic/thin-I/O split:

- **modifiers:** `dailyModifier` deterministic per seed; pool covers all ids;
  every bulletinLine ≤70 chars and `TODAY:`-prefixed; accessor honesty (a
  fuelDelta seed changes `fuelCost` by exactly that; a priceMult seed moves
  only its (node, commodity); `clearSkies` leaves every function byte-identical
  to pre-round fixtures).
- **fuel threading:** `cheapestJumpCost`/`escapeCost`/`canEscape`/`maxBuyable`
  agree on a storm seed — a run that can't afford the storm-priced cheapest
  hop ends stranded, never sits "playing" (the E2-2h class).
- **events:** amnesty seed rolls no pirates and no salvage across the fuzz
  range; corsair seed rolls with +6 pts and shows the same number in
  `pirateChance`; long-haul lanes double the salvage band, short lanes don't;
  storm modifier does not promote 6⛽ lanes (decision 6); tail adds
  TAIL_BONUS once, capped at DANGER_CAP; kind outcomes for clearSkies/untailed
  short-lane rolls byte-identical to pre-round.
- **bait:** clean scoop sets `pirateTail` on divisor days only; warhead and
  hold-full paths never roll it; jump clears it fired or not; two consecutive
  scoops on a tail day don't stack; log line and tone correct.
- **ice runs:** cadence days append exactly one tagged mission at kiruna and
  none elsewhere; non-cadence boards byte-identical to pre-round; reward,
  deadline, deposit in authored ranges; E2-2c floor still binds; feasibility
  card prices it like any mission.
- **missions/prices:** `baselinePrice` ignores modifiers; boom-seed rewards
  identical to clearSkies-seed rewards for the same board shape.
- **interest:** syndicateRest seed accrues nothing across a full run;
  `interestForecast` returns null; other seeds unchanged.
- **snapshot:** v5 resumes with `pirateTail: false`; v6 round-trips; a stored
  ice-run mission survives; malformed `pirateTail`/`tag` rejects the doc.
- **screens/map/share:** screenHead chip, tail banner presence/absence, ❄
  prefix, salvage double-odds clause, share-card tag line — string-level
  assertions in the existing style; bulletin line count 4 (5 with day-1 ice
  run).
- **sim:** decision 13's gates — existing eight assertions green,
  per-modifier fairness ≥90% ⚙, tail counts recorded, viable-loops with
  modifier-aware math.
- **Lighthouse CI stays green** — static additions only.

## Error handling

- `effectiveDanger` clamps to [0, DANGER_CAP]; no surface can show or roll a
  negative or >90% raid chance, whatever knobs stack.
- `fuelCost` with a fuelDelta still throws on a missing route pair exactly as
  today; `max(1, …)` in `getPrice` still floors boomed/glutted prices.
- A pre-round (v5) snapshot resumes untailed and otherwise plays today's
  seed-derived modifier correctly (it is state-free by decision 1) — degraded
  surfaces, never a crash. A v1 save doc is untouched.
- Storage failures degrade exactly as today (run not remembered; no surface
  breaks).
- Sim personas stay deliberately modifier-blind (`bestTrade` routes on naive
  spot margins); the gates measure outcomes, not persona IQ — the round-5
  precedent.

## Acceptance criteria (round-level)

E3-1:

- [ ] Every daily seed names exactly one modifier; bulletin, screen-head, and
      share card all carry it; `clearSkies` days are byte-identical to
      pre-round behavior.
- [ ] Modifier effects are honest on every surface: storm fuel on jump
      buttons/map/feasibility/stranding math, boom prices on the exch ▲▼,
      corsair/amnesty odds on raid % — one source each, no drift.

E3-2:

- [ ] Long-haul lanes (base 7–8⛽) roll double salvage and are named
      salvage-rich in the Navigator; short lanes are unchanged.
- [ ] Ice-run days post one ❄-tagged water → Verge contract at Kiruna at a
      long-haul premium and tight deadline; other boards are byte-identical.

E3-4:

- [ ] A clean scoop is 1-in-4 (seeded, shown on the button) to latch a
      one-jump pirate tail; the tail is announced, raises every displayed and
      rolled raid % by the same TAIL_BONUS, and clears on jump.

Round:

- [ ] Sweep gates: existing eight assertions green; per-modifier fairness
      ≥90% ⚙; greedy death rate still in the 10–40 band with bait live.
- [ ] Snapshot v6 migrates v5 silently; full suite green; Lighthouse CI green.
- [ ] ROADMAP/backlog rows ticked on land (E3-1, E3-2, E3-4) — M4 round 1
      closed; E1-5 heat gate ruled on and recorded in the roadmap.
