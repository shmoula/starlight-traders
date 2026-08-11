# M3 Round 5 — "The Market Pushes Back" (E2-1 + E2-2f + P2-2 cost basis)

**Date:** 2026-08-10 · **Status:** draft — awaiting review
**Source:** [ROADMAP.md](../../ROADMAP.md) Milestone 3 (sequence decided 2026-08-01:
E2-1 dead last, sim-gated, bundling P2-2's cost-basis half and E2-2f); specs in
[ENGAGEMENT_BACKLOG.md](../../ENGAGEMENT_BACKLOG.md) rows E2-1, E2-2f and
[BACKLOG.md](../../BACKLOG.md) row P2-2 (cost-basis half).

## Scope

The final M3 round — closes the milestone. One round at the round-3 (L) budget.
Theme: **the economy pushes back — repeating one route exhausts it, contract
rewards stop paying on stale prices, and the player gets the P&L surface to
read the new market with.**

The problem (E2-1, backlog): the water corridor is profitable _by construction_
(produce ×0.7 vs demand ×1.4 swamps ±15% noise, world.ts:97) → infinite turtle.
Any nerf to the spread itself would hurt onboarding, so the spread stays and
the _volume_ becomes finite. Alongside it, E2-2f closes the last contract
exploit (rewards anchored to the offer-day destination price go stale), and
P2-2's remaining half gives the player cost basis and unrealized P&L — the
surface that makes depth-degraded prices readable.

**In scope:**

- **E2-1a Depth engine** — each station absorbs `MARKET_DEPTH` units per
  commodity per day at the listed price; units beyond that sell at a
  deterministic, linearly degraded price with a floor. New `soldHere` record on
  `GameState` with `boughtHere`'s lifecycle.
- **E2-1b One-source sale math** — a depth-aware `saleProceeds` helper in
  economy.ts; `sell`, the UI's `netProceeds`, `liquidationValue`, and
  `canEscape` all price through it.
- **E2-1c Depth UI** — market rows show exact remaining depth and the degraded
  next-unit price (E1-4 honesty rule); the sale log line names saturation.
- **E2-2f Reward re-anchoring** — mission rewards anchor to a day-independent
  destination base price instead of offer-day destination spot.
- **P2-2b Cost basis** — per-commodity `costBasis` on `GameState` (total
  credits paid for held units); market rows show avg paid and unrealized P&L
  computed through the depth-aware sale math.
- **Sim gate** — re-run the 100-seed × 3-archetype sweep against recorded
  pre-round baselines; new turtle-decay and ≥2-viable-loops-per-day gates;
  tighten the balance suite that would today pass a 29/30-turtle world.

**Explicitly out of scope (deferred):** buy-side depth (the measured exploit is
monoculture sale income; buying stays unlimited); depth on contract settlement
(the contract buyer is the counterparty, not the open market — E2-2d's split
is untouched); E1-5 heat (playtest-gated, decide after this round closes M3);
E2-2k (≤1cr partial-sale rounding — take only if the sell-path rewrite makes
it free, else leave); all M4 items (E3-1, E3-2, E3-4, P3-2 remainder); image
share card (E3-5).

## Decisions

1. **Depth is sell-side only, and contract settlement is exempt.** Selling is
   the exploit; buy-side depth would double the state and UI for a lane nobody
   measured as broken. `settleMissions` (game.ts:410) keeps paying plain spot
   for dockside units and the full premium for hauled units — a contract is a
   bilateral deal, not an open-market dump. Only `sell()` consumes depth.

2. **The depth curve is deterministic and linear with a floor.** With
   `t = soldHere[id]` units already sold here today, unit `t+1` sells at:

   ```
   unitPrice(t) = max(1, round(list × max(DEPTH_FLOOR, 1 − DEPTH_SLOPE × max(0, t − MARKET_DEPTH + 1))))
   ```

   where `list = getPrice(seed, day, node, id)` — the same daily price as
   today, untouched. Knobs (⚙ plan-time, tuned against the sweep):
   `MARKET_DEPTH = 15` units/commodity/day, `DEPTH_SLOPE = 0.03` (3% per unit
   past depth), `DEPTH_FLOOR = 0.4`. No RNG — the degraded price is exactly
   displayable, per the E1-4 honesty rule. With a 30-unit hold
   (game.ts:54) a monoculture dump pays list on the first 15 units and a
   decaying tail after; a mixed hold sells everything at list.

3. **`soldHere` has `boughtHere`'s exact lifecycle.** One
   `soldHere: Record<CommodityId, number>` on `GameState`: created zeroed
   (createGame), incremented by `sell()`, reset to zeroes by `jump()`
   (game.ts:513 alongside `boughtHere`). No per-station map: a jump advances
   the day, so the player occupies exactly one (station, day) pair between
   jumps — "here today" is one record. Returning to a station is always a new
   day, so depth resets per visit by construction; the turtle decays because a
   monoculture hold-load exceeds one visit's depth, not because state persists
   across days.

4. **One source of truth for sale math.** economy.ts gains

   ```ts
   export function saleProceeds(
     s: GameState,
     id: CommodityId,
     qty: number
   ): { gross: number; atList: number; degradedUnits: number };
   ```

   — the only place the depth curve lives (sums decision 2's per-unit prices;
   qty ≤ 30 so a loop is fine). `netSaleProceeds` (economy.ts:74) computes
   `gross − taxOnSale(gross)` through it, and everything downstream inherits
   depth honestly with **zero call-site changes**: `sell()` via
   `netProceeds`/`netSaleProceeds`, the UI's sell buttons via `netProceeds`,
   and — critically — `liquidationValue` → `canEscape` → `checkLoss` /
   `keepEscapable` / `spendableCredits` / `maxBuyable`. A fat hold no longer
   overvalues its own escape money, which would otherwise recreate the E2-2h
   dishonesty class (a "playing" run that cannot actually leave).

5. **`cargoValue`/`netWorth` stay spot-valued.** Depth is a constraint on
   today's _flow_, not a devaluation of the _stock_: the hold can be sold
   across days or stations at list. `cargoValue` already overstates spendable
   value by the sale tax and that precedent stands; the score's semantics
   (net worth at audit/retire/death) do not change this round. Only the
   escape math — which asks "what can a sale fetch _here, today_" — is
   liquidation-priced, exactly as it already was for tax.

6. **E2-2f: rewards anchor to a day-independent destination base.** world.ts
   gains `baselinePrice(node, commodity)` = `max(1, round(basePrice ×
produce/demand modifiers))` — the price with the noise term removed,
   exported beside `PRODUCE_PRICE_MULTIPLIER`/`DEMAND_PRICE_MULTIPLIER` so
   intel labels and missions share one definition. `generateMissions`
   (missions.ts:22–23) anchors the premium to `baselinePrice(destination,
commodity)` instead of offer-day destination spot. The E2-2c floor (1.2×
   offer-day **origin** spot) stays: offers are consumed the day they're
   generated at the origin, so that anchor cannot go stale — only the
   destination's cross-day anchor could. The reward printed at accept remains
   final; nothing about a contract changes after signing. RNG draw order in
   `generateMissions` is unchanged (same calls, same sequence), so boards keep
   the same commodities/destinations/quantities — only the reward number
   moves.

7. **Cost basis is total-paid with proportional relief.**
   `costBasis: Record<CommodityId, number>` on `GameState` — total credits
   paid for the currently-held units of each commodity. Rules, applied at
   every cargo-quantity change site:

   - `buy` adds the purchase cost.
   - `sell` and contract settlement remove `round(avg × units removed)`
     (avg = basis/qty before the removal), clamped at 0.
   - Free cargo (salvage `collect`, derelict `board` loot) adds units at zero
     cost — the average honestly dilutes.
   - Customs confiscation zeroes luxury basis along with the cargo
     (game.ts:644 already zeroes cargo + boughtHere there).

   Basis is display/state math only — no price, payout, or probability reads
   it.

8. **P&L is what a sale here would actually net.** The market row for a held
   commodity shows "paid ~Ncr/u" (basis/qty, rounded) and an unrealized P&L
   chip = `netSaleProceeds(s, id, qty) − costBasis[id]` — depth- and
   tax-honest by construction, not `spot × qty`. Zero-qty rows show neither.

9. **Depth UI shows exact numbers.** Market sell side shows remaining
   at-list depth ("buys 15 at 28cr"; after selling 6: "9 more at 28cr, then
   falling"); once past depth, the next-unit price is shown ("next unit
   26cr ▼"). Sell buttons already label through `netProceeds`, so the button
   amount is depth-true with no extra work. A sale that crosses depth logs:
   `Sold 30 Water / Ice for 740cr (tax 30) — market saturated after 15.`
   The existing log format for un-degraded sales is unchanged.

10. **Snapshot v4→v5.** `soldHere` and `costBasis` default to zeroed records
    in the migration chain (storage.ts:328 pattern). A resumed pre-round run
    gets zero depth consumed and zero basis for the day — the same "silently
    can't" degradation E2-5's records migration used. The save doc stays v2;
    `STORAGE_KEY` unchanged.

11. **The sweep moves this round — gates replace byte-identity.** This is the
    first economy-moving round since E2-2, so the proof obligation flips from
    "nothing changed" to "it changed the way we wanted":

    - **Baseline capture:** before any engine change lands, record the
      current sweep summary (per-archetype audited/lost counts, peak-NW and
      score sums) as fixture data in the repo.
    - **Existing gates stay green:** every run ends ≤ day 12; ≥95% of
      cautious and balanced runs audited; greedy deaths 10–40%;
      greedy > cautious on peak NW (tests/sim/simulate.test.ts).
    - **Turtle decay:** cautious (water-only — the turtle by construction)
      loses measurably vs its recorded baseline; balanced loses little
      (thresholds ⚙, set from the actual post-change sweep during planning —
      the plan records both numbers).
    - **≥2 viable loops/day** (the backlog's gate): across the sweep's seeds
      and days, each day offers ≥2 distinct profitable (route, commodity)
      first-hold loops at list price — depth must decay monoculture without
      collapsing the map into one lane.
    - **E2-2f verification:** re-run round 1's contract-line measurement
      (accept → bounce B→C→B → deliver-as-hauled vs best honest route); the
      16.1% outright-beat rate collapses to ~0 with day-independent anchors.

## Build order

1. **Engine depth math** — `MARKET_DEPTH`/`DEPTH_SLOPE`/`DEPTH_FLOOR` +
   `saleProceeds` in economy.ts; `netSaleProceeds` delegates; tests for the
   curve and the escape math. `soldHere` on `GameState`: types, createGame,
   sell increment, jump reset; snapshot v5 migration; tests.
2. **Sim gates** — capture pre-round baseline fixtures **before step 1
   merges**; then land turtle-decay + viable-loops assertions and re-tune
   ⚙ knobs until all gates pass.
3. **E2-2f** — `baselinePrice` in world.ts; `generateMissions` anchor swap;
   mission tests (same offer any day → same reward; floor still binds);
   re-run the bounce measurement.
4. **Cost basis engine** — `costBasis` field + the four mutation sites;
   snapshot v5 covers it; tests per acquisition/relief path.
5. **UI surfaces** — depth copy on market rows, saturation log line, avg-paid
   - P&L chips; styles.css classes.
6. **Verification** — full suite, sweep gates, Lighthouse CI.

## Engine — types.ts, economy.ts, world.ts, game.ts, missions.ts

```ts
// types.ts — GameState gains:
soldHere: Record<CommodityId, number>; // units sold at this dock today (decision 3)
costBasis: Record<CommodityId, number>; // total credits paid for held units (decision 7)

// economy.ts
export const MARKET_DEPTH = 15; // ⚙ units/commodity/day at list price
export const DEPTH_SLOPE = 0.03; // ⚙ price impact per unit past depth
export const DEPTH_FLOOR = 0.4; // ⚙ degraded price never falls below 40% of list
export function saleProceeds(
  s: GameState,
  id: CommodityId,
  qty: number
): { gross: number; atList: number; degradedUnits: number }; // decision 2's curve — the only copy

// world.ts
export function baselinePrice(node: NodeId, commodity: CommodityId): number; // decision 6
```

- `sell()` (game.ts:230) prices through `netProceeds`, increments
  `soldHere[id] += qty`, and appends the saturation clause to the log line
  when `degradedUnits > 0`. `trackPayday`/`bigTrade` keep reading the net
  amount — already the honest number.
- `jump()` (game.ts:513) resets `soldHere` beside `boughtHere`.
- `missionFeasibility` (missions.ts:47) is unchanged — it prices the buy
  side, which has no depth.

## Storage — snapshot migration

Run snapshot v4→v5 in the existing chain: a v4 snapshot gains
`soldHere: {water: 0, parts: 0, luxury: 0}` and `costBasis` likewise; field
validation extends to the two new records (non-negative integers keyed by the
three commodity ids); a malformed doc still returns `null` (fresh start).

## UI — screens.ts, styles.css

- Market row sell side: depth line per decision 9, derived from
  `soldHere`/`MARKET_DEPTH` and `saleProceeds` — screens stay pure, reading
  state passed in.
- Held-cargo line: "paid ~Ncr/u" + P&L chip per decision 8 (`st-good` /
  `st-bad` toning to match existing ▲/▼ intel glyphs).
- No new screens, no navigation changes, no Logbook/share-card changes.

## Testing

Vitest, same pure-logic/thin-I/O split:

- **saleProceeds:** all-at-list within depth; per-unit degradation past it;
  floor respected; `max(1, …)` holds at extreme slopes; partial-sale sequence
  (15 then 15) totals the same as 30 at once minus tax-rounding tolerance;
  `atList`/`degradedUnits` split correct.
- **sell/depth:** `soldHere` increments and resets on jump; proceeds match
  `saleProceeds`; the saturation log clause appears only when degraded;
  selling at two stations on consecutive days never cross-contaminates depth.
- **escape math:** a hold whose at-spot value covers escape but whose
  depth-degraded liquidation does not → `canEscape` false, `checkLoss` ends
  the run; `maxBuyable`/`spendableCredits` agree with the guard.
- **missions (E2-2f):** the same (seed, node, day) board generated on
  different days would price the same offer identically; reward independent
  of destination-day noise; E2-2c floor still binds on cheap-base offers;
  RNG draw order unchanged (board composition byte-identical to pre-round for
  a fixture seed, rewards excepted).
- **cost basis:** buy accumulates; sell/settlement relieve proportionally and
  clamp at 0; salvage/derelict loot dilutes avg; customs zeroes luxury basis;
  basis never negative across a fuzzed action sequence.
- **snapshot:** v4 resumes with zeroed `soldHere`/`costBasis`; v5
  round-trips; malformed new fields reject the doc.
- **screens:** depth line states (untouched / partially consumed / past
  depth); P&L chip math and toning; zero-qty rows show neither; sell button
  amount equals actual proceeds after a depth-crossing sale.
- **sim:** decision 11's five gates — baselines recorded, existing four
  assertions green, turtle decay bounded, ≥2 viable loops/day, bounce
  measurement ~0%.
- **Lighthouse CI stays green** — static row additions only.

## Error handling

- `soldHere`/`costBasis` can never go negative: `sell` already guards
  `qty ≤ cargo`, relief clamps at 0, and validation rejects negative stored
  values.
- Degraded unit prices floor at `max(1, …)` exactly like `getPrice` — no
  zero/negative price is representable.
- A pre-round (v4) snapshot resumes with zeroed new fields: no depth memory,
  no basis for that day — degraded surfaces, never a crash. A v1 save doc is
  untouched by this round.
- Storage failures degrade exactly as today (run not remembered; no surface
  breaks).
- The sim's `bestTrade` still routes on naive spot margins — personas are
  deliberately not depth-aware; the gates measure outcomes, not persona IQ.

## Acceptance criteria (round-level)

E2-1:

- [ ] Selling past `MARKET_DEPTH` units of one commodity in one dock-day pays
      the degraded curve; the first `MARKET_DEPTH` units always pay list.
- [ ] `soldHere` resets on every jump; depth cannot leak across stations or
      days.
- [ ] Sell buttons, log lines, and market rows all show the depth-true
      amounts (one math source); saturation is named in the log.
- [ ] Escape math prices the hold through the depth curve — no run sits
      "playing" while unable to afford the cheapest jump after liquidation.

E2-2f:

- [ ] Contract rewards are independent of destination-day price noise; the
      accepted reward never changes after signing.
- [ ] Round 1's bounce measurement re-run: the outright-beat rate vs honest
      routes collapses to ~0%.

P2-2 (cost-basis half):

- [ ] Held-cargo rows show avg paid and unrealized P&L netted through depth
      and tax; free cargo dilutes basis; confiscation clears it.

Round:

- [ ] Sweep gates: existing four assertions green; cautious/turtle earnings
      down vs recorded baseline; balanced near baseline; ≥2 viable loops/day
      across the sweep.
- [ ] Snapshot v5 migrates v4 silently; full suite green; Lighthouse CI
      green.
- [ ] ROADMAP/backlog rows ticked on land (E2-1, E2-2f, P2-2 remainder) —
      Milestone 3 closed.
