# M3 Round 1 — "Contract Integrity" (E2-2 + P2-3)

**Date:** 2026-08-01 · **Status:** draft — awaiting review
**Source:** [ROADMAP.md](../../ROADMAP.md) Milestone 3 round 1 (decided 2026-08-01);
specs in [ENGAGEMENT_BACKLOG.md](../../ENGAGEMENT_BACKLOG.md) row E2-2 and
[BACKLOG.md](../../BACKLOG.md) row P2-3 (open half).

## Scope

One round that makes contracts an honest instrument. Theme: **a contract is a bond,
not a free option** — accepting one costs something, breaking one costs something,
and the card tells you whether it's worth signing before you do.

Contracts today are riskless in three independent ways (E2-2):

1. **No deposit** — `acceptMission` (game.ts:276) just appends to `activeMissions`;
   accepting every offer on every board is strictly optimal.
2. **No expiry penalty** — a blown deadline is one bad-tone log line
   (game.ts:320) and the mission silently drops.
3. **Instant-settle exploit** — rewards are `1.3–1.7× destination spot`
   (missions.ts:17); `deliver()` (game.ts:290) settles without jumping, so the
   optimal line is: accept at A, jump to B, buy the qty dockside at B, click
   deliver, pocket a ~30–70% riskless margin.

And the boards are cluttered (E2-2 + P2-3): junk 63cr offers (3 water → a
produce-discount station) share the list with four-digit whales, and no card shows
cost, fuel, estimated profit, or days left.

**In scope:**

- **E2-2a Deposit** — 10% of reward, escrowed on accept, refunded on delivery,
  forfeited on expiry. Accept is blocked (engine guard + disabled button) when
  credits can't cover it.
- **E2-2b Expiry consequence** — the forfeiture is the penalty; expiries and
  forfeited credits are counted and named on the run-end/debrief screen.
- **E2-2c Reward floor** — no offer pays under 1.2× its cargo cost at the offering
  station, so every card on the board is at least marginally worth reading.
- **E2-2d Instant-settle nerf** — units bought at the destination station pay
  **spot only**; only hauled units earn the contract premium. Proportional, so
  topping up a shortfall dockside stays legal — it just isn't the whole business.
- **P2-3 Feasibility card** — offer cards gain
  `cost ~180cr · 7⛽ · est. +65cr · deposit 25cr · 8 days left`; days-left turns
  amber at ≤ 2; numbers come from one engine helper so the card can't drift from
  what accepting actually does.

**Explicitly out of scope (deferred):** market depth / per-day volume (E2-1 — dead
last in M3 by the 2026-08-01 decision, after the star map reshapes routes); P2-2's
cost-basis/P&L half (rides with E2-1); contract chains, reputation, or negotiated
rewards (new systems, not integrity fixes); any change to mission _generation_
beyond the reward floor — count, qty, destinations, and deadlines keep their
current distributions and RNG draw order; pirate/customs interactions with
contract cargo (E1-5 Heat territory).

## Decisions

1. **Deposit is an escrow, accounted once per direction** — accept debits
   `deposit` with a `-deposit` log delta; delivery pays back
   `payout + deposit` as one credited delta; expiry logs the forfeiture with **no**
   delta (the money already moved at accept). No double-counting, and the log's
   running deltas still sum to the credit balance.
2. **Deposit is a real commitment, not UI theater** — a debited deposit can
   contribute to stranding (checkLoss already sees the lower credits), and
   deposits on contracts still open at audit/retire/death are simply sunk. Retiring
   with open bonds is priced, which is the point of a bond. No refund path exists
   outside delivery.
3. **Provenance tracking for the instant-settle nerf** — `GameState` gains
   `boughtHere: Record<CommodityId, number>`: units bought at the current dock.
   Reset to zeros on every `jump`; `buy` increments; `sell` consumes bought-here
   units **first** (so buy-then-sell at one dock is a wash and can't launder units
   into "hauled"); in-transit gains (salvage, derelict) never touch it — loot that
   arrives with you _is_ hauled. Chosen over a binary "any dockside unit → whole
   mission pays spot" rule, which would punish the legitimate 8-hauled-2-topped-up
   delivery, and over deadline/turn-count rules, which don't actually close the
   exploit.
4. **Settlement is proportional** — per mission:
   `hauledUsed = min(qty, hauled available)`, `boughtUsed = qty − hauledUsed`,
   `payout = round(reward × hauledUsed / qty) + spot(destination, today) × boughtUsed`.
   Buying dockside at spot and delivering at spot is a wash — the exploit pays 0,
   not a nerfed-but-still-free margin. Missions settle in list order against a
   shared hauled pool.
5. **Reward floor uses the offering station's offer-day price** — the same
   `cost` number P2-3 prints on the card:
   `reward = max(premium roll, round(1.2 × qty × getPrice(seed, day, node, commodity)))`.
   A pure `max` after the existing draws — **no new RNG calls**, so ids, quantities,
   destinations, and deadlines are unchanged for every seed; only junk rewards rise.
   The floor is deliberately **cargo-cost only** — it ignores fuel and dock fees.
   Measured over 200 seeds × 12 days × 5 nodes (23,897 offers), it cuts the share of
   offers with negative est. profit from 37.7% → 19.4% but does not eliminate them:
   ~2,235 offers it actively lifted are still underwater once fuel and the
   destination dock fee are priced in, and the sweep's minimum reward is 65cr — the
   scope section's "junk 63cr offers" survive, just barely repriced. This is
   accepted, not a gap: a fuel-inclusive floor would make generation
   route-dependent and rebalance every board (an E2-1 concern, dead last in M3),
   and **P2-3 is the actual fix for junk offers** — an honest `est. −66cr` on the
   card kills a bad contract faster than a bigger number on it would. Read the
   E2-2c acceptance criterion as the mechanical rule it states, not as "every card
   is profitable."
6. **Feasibility numbers come from the engine, not the template** — new
   `missionFeasibility(s, m)` in missions.ts (netProceeds/interestForecast
   precedent): the card and the engine share one definition of cost and profit,
   so they can't disagree. Est. profit is defined as
   `reward − cargo cost here − fuel × REFUEL_PRICE − destination dock fee`; the
   deposit is **excluded** (it comes back on success) and shown as its own chip.
7. **Sim sweep is unaffected by construction** — `src/sim/simulate.ts` strategies
   never call `acceptMission`; no mission code path runs in the sweep, and the
   floor changes no RNG draw order. One sweep re-run rides the round as a sanity
   check, but this round is not sim-gated (that's E2-1's burden).
8. **Snapshot version bumps 2 → 3** — `Mission` gains a required `deposit` field
   and `GameState` gains `boughtHere` + contract counters. A v2 snapshot migrates:
   missions wrapped with `deposit: 0` (no deposit was paid under the old rules, so
   none is owed back — no free money on upgrade day), `boughtHere` zeroed,
   counters zeroed. v1 chains through the existing log migration first.

## Build order

1. **E2-2c reward floor + deposit field** (missions.ts) — generation first; every
   later step reads `mission.deposit`.
2. **E2-2a/b/d engine pass** (game.ts, types.ts) — accept guard, escrow, provenance,
   proportional settlement, expiry forfeiture, contract counters.
3. **Snapshot migration** (storage.ts) — v3 envelope before any UI ships state
   with the new shape.
4. **P2-3 + surfaces** (screens.ts) — feasibility card, deposit on accept, amber
   deadlines, debrief line.

## 1. E2-2c — Reward floor + deposit (`src/engine/missions.ts`, `types.ts`)

### Type change

```ts
export interface Mission {
  id: string;
  commodity: CommodityId;
  qty: number;
  destination: NodeId;
  reward: number;
  deposit: number; // 10% of reward, rounded — escrowed on accept
  deadlineDay: number;
}
```

### Generation

- After the existing reward roll:
  `reward = Math.max(reward, Math.round(1.2 * qty * getPrice(seed, day, node, commodity)))`.
  No new `rng()` calls anywhere in the loop (decision 5).
- `deposit = Math.round(0.1 * reward)` — derived, deterministic, stored on the
  mission so accept/refund/forfeit all read one number.

## 2. E2-2a/b/d — Engine pass (`src/engine/game.ts`, `types.ts`)

### State

```ts
// GameState additions
boughtHere: Record<CommodityId, number>; // units bought at the current dock; reset on jump
contracts: {
  delivered: number;
  expired: number;
  forfeitedCr: number;
}
```

`createGame` initializes both to zeros.

### Accept (escrow)

- `acceptMission` guards `state.credits >= mission.deposit`; otherwise returns
  state unchanged (same silent-guard contract as `buy`).
- On accept: `credits -= deposit`, log
  `Accepted delivery to <dest> — <deposit>cr deposit held.` tone `neutral`,
  delta `-deposit`.

### Provenance (decision 3)

- `buy`: `boughtHere[id] += qty`.
- `sell`: `boughtHere[id] = max(0, boughtHere[id] - qty)` — bought-here units go
  first.
- `jump`: `boughtHere` resets to zeros (before the in-transit event, so salvage
  and derelict loot land as hauled).

### Settlement (decision 4)

In `settleMissions`, for each deliverable mission:

- `hauled = max(0, cargo[c] − boughtHere[c])` (pool shared across missions,
  consumed in list order).
- `hauledUsed = min(qty, hauled)`, `boughtUsed = qty − hauledUsed`.
- `payout = round(reward × hauledUsed / qty) + getPrice(seed, day, destination, c) × boughtUsed`.
- `credits += payout + deposit`; `boughtHere[c] −= boughtUsed`; cargo −= qty as today.
- `trackPayday`/`markDay` use `payout + deposit` — the actual inflow, not the
  face reward.
- Log, full rate: `Delivery complete: +252cr (deposit returned).` tone `good`,
  delta `payout + deposit`. Spot-rate units present:
  `Delivery complete: +178cr — 10 bought dockside paid spot (deposit returned).`
  The player is told _why_ the number shrank, in the moment.
- `contracts.delivered += 1`.

### Expiry (decision 1)

- Log becomes `Delivery to <dest> expired — <deposit>cr deposit forfeit.` tone
  `bad`, **no delta**.
- `contracts.expired += 1`, `contracts.forfeitedCr += deposit`.

## 3. Snapshot v3 (`src/ui/storage.ts`)

- `RunSnapshot.version`: 2 → 3. `migrateSnapshot` chains v1 → v2 (existing log
  wrap) → v3: each active mission gains `deposit: 0` (decision 8), `boughtHere`
  and `contracts` default to zeros.
- `parseSnapshot` v3 validation extends field-by-field: every mission needs a
  finite `deposit ≥ 0`; `boughtHere` needs all three commodity keys numeric ≥ 0;
  `contracts` needs the three counters numeric ≥ 0. Corrupt → fresh run, the
  standing silent-degrade contract.
- The results ledger (`starlight.save.v1`) stores no missions — untouched.

## 4. P2-3 — Feasibility card + surfaces (`src/engine/missions.ts`, `src/ui/screens.ts`)

### Engine helper (decision 6)

```ts
export function missionFeasibility(
  s: GameState,
  m: Mission
): {
  cargoCost: number; // qty × local price today
  fuel: number; // fuelCost(s.location, m.destination); 0 at destination
  estProfit: number; // reward − cargoCost − fuel × REFUEL_PRICE − dockingFee(m.destination)
  daysLeft: number; // m.deadlineDay − s.day
};
```

### Offer cards (Contracts list, screens.ts:260)

- Each card gains a second line:
  `cost ~180cr · 7⛽ · est. +65cr · deposit 25cr · 8 days left`
  (`~` on cost because prices drift and the player may buy elsewhere; est. can go
  negative and renders honestly as `est. −12cr`).
- `days left` chip gets an amber class when `daysLeft ≤ 2` (offer and active cards
  share the rule).
- Accept button: aria-label gains the deposit
  (`… for a 25cr deposit`); when `credits < deposit` it renders aria-disabled with
  an adjacent hint `(need 25cr deposit)` — the composed-button-plus-hint pattern
  from the shortfall buy button (screens.ts:295).

### Active contracts (screens.ts:270)

- The header line appends `· N days left` with the same amber-at-≤2 treatment
  (deadline stays absolute alongside — "by day 12" is the contract, days-left is
  the countdown).
- The carrying hint distinguishes provenance when it matters: when part of the
  hold is dockside-bought, `✓ carrying 10/10 — 4 bought here pay spot` replaces
  the plain ready line, so the nerf is visible **before** the deliver click, not
  after.

### Run-end / debrief (screens.ts `runEndScreen`)

- Breakdown gains one row when any contract was accepted this run:
  `Contracts — 2 delivered · 1 expired (−25cr deposit)` (forfeit total from
  `contracts.forfeitedCr`; row absent at 0 accepted, no empty-state noise).

## Testing

Vitest, same pure-logic/thin-I/O split:

- **missions:** every offer across a seed × day × node sweep satisfies
  `reward ≥ 1.2 × qty × origin price` and `deposit === round(0.1 × reward)`;
  ids/qty/destination/deadline are byte-identical to pre-change fixtures for a
  pinned seed (RNG order preserved — only rewards may differ, only upward).
- **accept:** debits deposit with delta; blocked accept leaves state identical;
  double-accept still no-ops.
- **settlement:** full-haul pays `reward + deposit`; all-dockside pays
  `spot × qty + deposit` (a wash against the dockside buy); 8-hauled-2-bought pays
  the proportional split; two missions on one commodity drain the hauled pool in
  list order; `boughtHere` resets on jump; sell consumes bought-here first
  (buy-10-sell-10 at one dock leaves hauled unchanged); salvage/derelict gains
  count as hauled.
- **expiry:** counters and forfeitedCr accumulate; log line names the amount,
  carries no delta; credits are untouched at expiry time.
- **conservation:** for a scripted run, summing all log deltas equals
  `credits − STARTING.credits` — the escrow accounting holds (decision 1).
- **feasibility:** `missionFeasibility` numbers match `getPrice`/`fuelCost`/
  `dockingFee`/`REFUEL_PRICE` composition; `fuel = 0` at destination; negative
  estProfit passes through unrounded semantics.
- **storage:** a v2 snapshot with active missions resumes with `deposit: 0`,
  zeroed `boughtHere`/counters; v1 chains both migrations; corrupt v3 fields
  reject to fresh run.
- **screens:** offer card renders the feasibility line and deposit; amber class
  toggles exactly at daysLeft ≤ 2; blocked accept renders aria-disabled + hint;
  ready-line provenance variant appears when boughtHere overlaps a deliverable
  mission; debrief contract row present/absent per counters.
- **sim:** one 100-seed sweep re-run as sanity (decision 7) — bands expected
  byte-identical since no strategy touches missions and no RNG order changed.
- **Lighthouse CI stays green** — the feasibility line adds text, not motion.

## Error handling

- Blocked accept is a silent engine no-op; the UI hint is the player-facing
  explanation (same division as buy/jump guards).
- Deposit-induced stranding is not special-cased: checkLoss already reads the
  post-escrow credits — that risk is the mechanic working (decision 2).
- Rounding: `round(reward × hauledUsed / qty)` can drop ≤ 1cr on split
  settlements; acceptable, always in the house's favor, and full-haul
  (`hauledUsed === qty`) pays reward exactly.
- Migration failures degrade to a fresh daily run — no new failure surface beyond
  the standing storage contract.

## Acceptance criteria (round-level)

E2-2:

- [ ] Accepting a contract escrows a 10% deposit (visible in the log with a
      negative delta) and is blocked — engine and button — when credits are short.
- [ ] Delivery pays reward + deposit for hauled cargo; units bought at the
      destination since docking pay spot only, proportionally, and the log says so.
- [ ] Expiry forfeits the deposit, logged with the amount and counted on the
      debrief; no other credit movement occurs at expiry time.
- [ ] No offer on any board pays under 1.2× its offer-day cargo cost at the
      offering station; mission identity (id/qty/destination/deadline) is unchanged
      per seed.
- [ ] Sum of log deltas equals net credit movement for a full run (escrow
      accounting is conservative).

P2-3:

- [ ] Offer cards show cost, fuel, est. profit, deposit, and days left, from
      `missionFeasibility` — no template-side price math.
- [ ] Days-left renders amber at ≤ 2 days on offer and active cards.
- [ ] Active cards surface dockside-bought units before the deliver click.
- [ ] Run-end shows the contracts row when any contract was accepted.

Round:

- [ ] Snapshot v3 migration: same-day v2 runs resume with deposit-free legacy
      missions; corrupt snapshots reject to fresh.
- [ ] Full suite green; 100-seed sweep bands unchanged; Lighthouse CI green.
- [ ] ROADMAP/backlog rows ticked on land (E2-2, P2-3).
