# M3 Round 4 — "The Regular" (E2-5 + E2-2g + E2-2j)

**Date:** 2026-08-09 · **Status:** draft — awaiting review
**Source:** [ROADMAP.md](../../ROADMAP.md) Milestone 3 (sequence decided 2026-08-01:
E2-5 after the star map, before E2-1's sim gate); specs in
[ENGAGEMENT_BACKLOG.md](../../ENGAGEMENT_BACKLOG.md) rows E2-5, E2-2g, E2-2j.

## Scope

One round at the M+S budget of rounds 1 and 2. Theme: **identity accrual — the
returning player gets recognized, and the last invisible contract rule becomes
visible.**

The problem (E2-5, backlog): nothing accrues across days even after E0-3 — no
reason to open the game on a bad day, nothing to collect. The save ledger has
been accumulating per-day records since July and renders three numbers on one
line (screens.ts:91); feats were reserved in the E0-3 schema sketch but never
built.

**In scope:**

- **E2-5a Feat registry** — ~12 local feats as pure predicates in a new
  `src/engine/feats.ts`, evaluated once at run end; a small `records` field on
  `GameState` captures the four "moment" facts the final state doesn't hold.
- **E2-5b Persistence** — save doc v1→v2: `feats: Record<FeatId, string>`
  (feat id → UTC dateKey earned); pure `recordFeats` alongside `recordRunEnd`.
- **E2-5c Logbook panel** — day-1 station screen gains a panel with a 4-week
  calendar strip (from `save.days`) and the feat roster (earned lit, unearned
  dimmed with hint text).
- **E2-5d Unlock surfaces** — run-end screen shows "★ Feat unlocked" lines for
  feats new this run; the share card gains one optional feat line.
- **E2-2g Settlement-order badges** — active contract cards show accept-order
  priority (①②③) when 2+ active contracts want the same commodity. The engine
  rule is untouched; the invisible rule becomes a visible, player-controlled
  decision (accept the whale first).
- **E2-2j Honest payday stat** — `biggestPayday` and the `bigTrade` day
  highlight read the earned payout, not the gross inflow that includes the
  player's own returned deposit.

**Explicitly out of scope (deferred):** market depth + contract reward
re-anchoring (E2-1 + E2-2f + P2-2's cost-basis half — final M3 round,
sim-gated); any reward, currency, or unlock attached to feats (recognition
only — the backlog's no-dark-patterns constraint); streak mechanics or guilt
copy (E0-3's rule stands); heat (E1-5 — playtest-gated); image share card
(E3-5); a separate Logbook screen or any new navigation; changes to the share
strip glyph set (E1-2 surface — only the E2-2j accounting under it moves);
E2-2k (accepted ≤1cr quirk).

## Decisions

1. **Any run earns feats — Daily and Practice alike.** Feats are personal
   collectibles, not comparable social objects; the share card already brands
   Daily runs, so comparability lives there. No "it didn't count" moments, no
   second rule to explain.
2. **Feats are engine-defined, UI-evaluated.** `feats.ts` exports the registry
   and `earnedFeats(state): FeatId[]`; the UI calls it when folding a finished
   run into the save (main.ts run-end path). `endRun` stays untouched and the
   sim never evaluates feats — the engine owns the definitions, the UI owns
   the moment of evaluation, storage owns memory.
3. **`GameState.records` captures moments; everything else derives.** One
   append-only field:

   ```ts
   records: {
     debtClearedDay?: number; // payDebt (game.ts:305) when debt first hits 0
     vergeAtLowHull: boolean; // arrive (game.ts:508) at verge with hull < 20
     visited: NodeId[];       // arrive — dock counts, in order, no repeats
     damageTaken: number;     // summed at every hull-decrease site
                              // (game.ts:541, 553, 575, 592)
     fullHold: boolean;       // set wherever cargo gains reach capacity
     pirateAmbushes: number;  // pirates resolution (markDay "pirates", game.ts:528)
   }
   ```

   Updated only at existing engine points — no new rule, probability, price,
   or payout changes. The run snapshot bumps v3→v4; the migration defaults
   `records` (chain pattern already exists, storage.ts:328), so a resumed
   pre-round run silently can't earn moment feats that day.

4. **The roster (names get the E2-4 fiction voice pass; thresholds marked
   ⚙ are plan-time tuning knobs):**

   | id           | Name                 | Earned when                                | Facts read               |
   | :----------- | :------------------- | :----------------------------------------- | :----------------------- |
   | first-flight | First Flight         | first completed run ever                   | ledger (save.days empty) |
   | audited      | Face the Audit       | reach the day-12 audit alive               | runEnd.status            |
   | clean-sweep  | Clean Sweep          | 3 deliveries in one run                    | contracts.delivered      |
   | debt-free-8  | Out From Under       | debt cleared by day 8 ⚙                    | records.debtClearedDay   |
   | clean-books  | Clean Books          | bank a run (audit/retire) with zero debt   | runEnd.status, debt      |
   | verge-runner | Verge Runner         | dock at the Verge below 20 hull ⚙, survive | records.vergeAtLowHull   |
   | untouched    | Not a Scratch        | bank a run with zero hull damage           | records.damageTaken      |
   | full-house   | Full House           | fill the hold to capacity                  | records.fullHold         |
   | grand-tour   | Grand Tour           | dock at all five stations in one run       | records.visited          |
   | gauntlet     | Running the Gauntlet | survive 3 pirate ambushes in one run ⚙     | records.pirateAmbushes   |
   | high-roller  | High Roller          | score ≥ threshold (sweep ~top decile) ⚙    | runEnd.score             |
   | regular      | Starlight Regular    | fly 7 different days ⚙                     | ledger (daysFlownCount)  |

   Ten are run feats (engine predicates over `state` + `runEnd`); two are
   ledger feats (first-flight, regular) computed in the storage layer over the
   save doc, since they're cross-run facts the engine never sees.

5. **Save v2, forward-migrated, field-validated.** `feats` maps feat id →
   dateKey earned (first earn wins; re-earning is a no-op). `loadSave` migrates
   a valid v1 doc by adding `feats: {}` and drops unknown or malformed feat
   entries the same field-by-field way it validates everything else. A brand-new
   `recordFeats(save, dateKey, earned): { save, newFeats }` stays pure beside
   `recordRunEnd`; `newFeats` (ids new this run) drives every unlock surface.
6. **The Logbook renders on day 1 only** — the same `s.day === 1` gate
   `bootStats` uses (screens.ts:91), because day 1 is the launch surface. The
   calendar is a 4-week strip: 28 cells ending today (UTC), no weekday
   alignment — a strip, not a month grid. Cell tone by that day's best outcome
   (banked good / lost bad / not-flown dim), today ringed. The grid is
   `aria-hidden` decoration; an adjacent sr-only summary carries the facts
   ("Flown 5 of the last 28 days · best 2,140 on Aug 3"), and each cell's
   `title` names date · best score · attempts for pointer users. The feat
   roster is real text (not hidden): earned chips lit with name, unearned
   dimmed with name + hint — the hint is the invitation, so it must be
   readable, not a mystery slot.
7. **Unlock lines are capped.** Run-end screen shows at most 3 "★ Feat
   unlocked: <name>" lines (new-this-run only) between the PB line and the
   score, "+N more" beyond. The share card appends one line only when the run
   unlocked something: `★ <first new feat name>` (`+N more` when several) —
   silence otherwise; a card without feats is byte-identical to today's.
   Feat names stay ≤ 20 chars, test-enforced, so the line never wraps.
8. **E2-2g shows the rule only where it bites.** Priority badges render only
   when 2+ active contracts want the same commodity — the sole case accept
   order matters. Badge = ① ② ③ in `activeMissions` order with "settles
   first" on ①. Pure screens.ts change; settlement itself is untouched, so
   the round keeps its no-mechanics property.
9. **E2-2j: the payday is what you earned.** `settleMissions` passes `payout`
   (reward for hauled units + spot for dockside units) instead of `inflow`
   (payout + returned deposit) to `trackPayday` and the `BIG_TRADE_CR`
   comparison (game.ts:410–420). The log line keeps `inflow` — it reports the
   actual credit movement and already says "(deposit returned)". Best haul,
   the 💰 glyph, and high-roller's input all read the honest number. No money
   moves differently; only stats and highlights change.

## Build order

1. **engine records** — `records` on `GameState` + updates at the five engine
   sites; types, initial state, snapshot v4 migration; tests.
2. **engine feats.ts** — registry, `earnedFeats`, per-feat predicate tests
   (positive + negative each). Engine-complete and green before any UI change.
3. **storage v2** — `feats` field, migration, `recordFeats`; tests mirroring
   the v1 validation suite.
4. **E2-2j stat fix** — `payout` into `trackPayday`/`markDay`; update the
   affected game/share tests.
5. **UI surfaces** — Logbook panel (calendar + roster), run-end unlock lines,
   share-card feat line, E2-2g badges; `RunMeta` grows a `logbook` slot;
   styles.css classes.
6. **Verification** — full suite, 100-seed sweep byte-identical check,
   Lighthouse CI.

## Engine — types.ts, game.ts, feats.ts

```ts
// types.ts
export interface RunRecords {
  /* decision 3 */
}
// GameState gains: records: RunRecords;

// feats.ts
export type FeatId = "first-flight" | "audited" | /* … */ "regular";
export interface FeatDef {
  id: FeatId;
  name: string; // ≤ 20 chars
  hint: string; // unearned-state copy, present tense, no spoiler mechanics
  /** Run feats only; absent on the two ledger feats, whose earning lives in storage. */
  earned?(s: GameState, r: RunEnd): boolean;
}
export const FEATS: readonly FeatDef[]; // all 12 — the one registry every surface renders from
export const LEDGER_FEAT_IDS: readonly FeatId[]; // ["first-flight", "regular"]
export function earnedFeats(s: GameState): FeatId[]; // evaluates the 10 run feats; [] while playing
```

- `earnedFeats` returns `[]` unless `s.runEnd` is present — feats bank exactly
  once, at the end the run already has.
- `FEATS` holds all 12 defs so the roster renders from one registry; the two
  ledger feats carry no `earned` predicate — storage's `recordFeats` is the
  only place they can be judged (decision 4), and `earnedFeats` skips them.

## Storage — storage.ts

```ts
export interface StarlightSave {
  version: 2;
  days: Record<string, DayRecord>;
  allTimePB: number;
  daysFlownCount: number;
  feats: Record<string, string>; // FeatId -> dateKey earned
}
export function recordFeats(
  save: StarlightSave,
  dateKey: string,
  earned: FeatId[]
): { save: StarlightSave; newFeats: FeatId[] };
```

- `recordFeats` also computes the two ledger feats from the (already updated)
  save doc, so main.ts calls `recordRunEnd` then `recordFeats` and gets one
  `newFeats` list.
- `STORAGE_KEY` stays `starlight.save.v1` — the envelope's `version` field is
  the version, matching the snapshot's precedent of migrating in place.

## UI — screens.ts, share.ts, main.ts, styles.css

- `RunMeta` gains
  `logbook?: { cells: CalendarCell[]; feats: { def: FeatDef; earned: boolean }[]; flownOfWindow: number }`
  — main.ts derives it from the save at render time; screens stay pure.
- `runEndScreen` takes `newFeats` via `RunMeta.debrief` (one new optional
  field) and renders decision 7's capped lines.
- share.ts appends decision 7's feat line; the existing card is unchanged when
  `newFeats` is empty.
- Contract card: badge span with `st-num` styling; sr-only "settles 1st"
  equivalent for the visible ① glyph.

## Testing

Vitest, same pure-logic/thin-I/O split:

- **records:** each of the six facts has a test driving the engine through the
  moment (pay debt to zero on day N, arrive at verge under 20 hull, dock at
  all five, take damage at each site class, fill the hold, survive 3
  ambushes) and asserting the record; a no-moment run leaves defaults.
- **feats:** every feat gets a positive and a negative test through
  `earnedFeats` (or `recordFeats` for the two ledger feats); `earnedFeats`
  returns `[]` mid-run; names ≤ 20 chars enforced over the registry.
- **storage:** v1 doc migrates (gains `feats: {}`, data preserved); malformed
  feat entries dropped; `recordFeats` first-earn-wins, re-earn no-op,
  `newFeats` correctness; first-flight fires only on the first-ever record;
  regular fires when `daysFlownCount` crosses the threshold.
- **snapshot:** v3 snapshot resumes with default `records`; v4 round-trips.
- **game (E2-2j):** a delivery with a deposit sets `biggestPayday.amount` to
  `payout`, not `payout + deposit`; a contract whose payout is under
  `BIG_TRADE_CR` but whose inflow crosses it marks `delivery`, not `bigTrade`;
  the log delta still shows the full inflow.
- **screens:** Logbook present on day 1, absent on day 2+; 28 cells; today
  ringed; cell title carries date/score/attempts; sr-only summary present;
  earned chip lit / unearned dimmed with hint; run-end shows ≤3 unlock lines
  plus "+N more"; E2-2g badges appear only when 2+ active contracts share a
  commodity, numbered in accept order.
- **share:** card with no new feats is byte-identical to today's; with feats,
  exactly one added line matching decision 7's format.
- **sim:** the 100-seed sweep summary is byte-identical — this round moves no
  economic outcome. (E2-2j changes stats/highlights, which the sweep summary
  does not read; the sweep asserting byte-identity is the proof.)
- **Lighthouse CI stays green** — static panel, no animation.

## Error handling

- Storage failures (private mode, quota) degrade exactly as today: the run
  isn't remembered, no feat is earned, no surface breaks — `logbook` renders
  from `emptySave()`'s empty ledger.
- A v1 save or v3 snapshot from before this round loads via migration; a doc
  that fails field validation still returns `null` (fresh start), never a
  crash.
- Unknown feat ids in a stored doc (hand-edited, or from a future version) are
  dropped on load and never rendered — the roster renders only registry ids.
- `earnedFeats` on a `playing` state returns `[]` — feats cannot bank early
  even if a surface calls it at the wrong time.
- The calendar derives "today" from the same UTC dateKey helper the ledger
  already uses (share.ts `utcDateKey`) — no second clock to disagree with.

## Acceptance criteria (round-level)

E2-5:

- [ ] 12 feats defined in one registry; every feat has positive + negative
      tests; feats earn on any run (Daily or Practice).
- [ ] Earned feats persist across reloads in save v2; a v1 save migrates with
      data intact; storage failure degrades silently.
- [ ] Day-1 station screen shows the Logbook: 4-week calendar strip with
      per-day best scores (title + sr-only), and the full roster — earned lit,
      unearned dimmed with hint.
- [ ] Run-end screen lists feats new this run (≤3 + "+N more"); the share card
      gains one feat line only when something was unlocked.
- [ ] Moment feats survive a same-day refresh (records in snapshot v4).

E2-2g:

- [ ] When 2+ active contracts want the same commodity, cards show accept-order
      priority with "settles first" on ①; otherwise no badge renders.

E2-2j:

- [ ] Best haul and the 💰 highlight read earned payout (deposit excluded);
      the delivery log line still shows the full credit movement.

Round:

- [ ] Economy untouched: no price, probability, or payout change; 100-seed
      sweep summary byte-identical.
- [ ] Full suite green; Lighthouse CI green.
- [ ] ROADMAP/backlog rows ticked on land (E2-5, E2-2g, E2-2j).
