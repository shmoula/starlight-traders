# M3 Round 1 — "Contract Integrity" (E2-2 + P2-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make contracts an honest instrument: a 10% deposit escrowed on accept (refunded on delivery, forfeited on expiry), a reward floor that kills junk offers, a provenance rule that makes buy-at-destination instant settles a wash, and a feasibility card that prices the decision before you sign.

**Architecture:** Pure engine changes first (`Mission.deposit` + reward floor, `boughtHere` provenance, escrow/settlement/forfeiture in game.ts, `missionFeasibility`), then the snapshot bumps to v3 with a v2 migration, then the UI consumes the new engine helpers. Display values always derive from the same engine functions the rules use (B-1 precedent), so cards can't drift from what accepting/delivering actually does.

**Tech Stack:** TypeScript 5, Vite 5, Vitest, vanilla DOM string rendering. Tests run with `npm test` (or `npx vitest run <file>` for one file). Prettier auto-formats on write via hook — don't fight it.

**Spec:** `docs/superpowers/specs/2026-08-01-m3-round1-contract-integrity-design.md`

---

## File map

| File                                                               | Role in this plan                                                                                |
| :----------------------------------------------------------------- | :----------------------------------------------------------------------------------------------- |
| `src/engine/types.ts`                                              | `Mission` gains `deposit`; `GameState` gains `boughtHere` + `contracts`                          |
| `src/engine/missions.ts`                                           | Reward floor; deposit on generation; **new** `missionFeasibility`                                |
| `src/engine/game.ts`                                               | Accept guard/escrow; provenance in buy/sell/jump; proportional settlement; expiry forfeiture     |
| `src/ui/storage.ts`                                                | Snapshot v3 + v2→v3 migration; new load-bearing validation                                       |
| `src/ui/screens.ts`                                                | Offer-card feasibility line; deposit-aware Accept; days-left amber; provenance hint; debrief row |
| `src/ui/styles.css`                                                | `.contract-feas` + `.contract-days--amber` rules                                                 |
| `docs/ROADMAP.md`, `docs/BACKLOG.md`, `docs/ENGAGEMENT_BACKLOG.md` | Mark E2-2 + P2-3 shipped                                                                         |

Tests touched: `tests/engine/missions.test.ts`, `tests/engine/game.test.ts`, `tests/ui/storage.test.ts`, `tests/ui/screens.test.ts`. The sim suite (`tests/sim/simulate.test.ts`) re-runs unmodified as a sanity check — no sim strategy calls `acceptMission`, so the 100-seed bands must come back identical.

**Engine constants used throughout** (for reading the assertions): water base 20cr; Kiruna produces water (×0.7), fee 15cr (25×0.6), tax 2%; Terra fee 40cr (25×1.6); `fuelCost("terra","kiruna")` = 4; `REFUEL_PRICE` = 8; starting credits 800.

---

### Task 1: `Mission.deposit` + reward floor (E2-2a generation + E2-2c)

**Files:**

- Modify: `src/engine/types.ts:23-30`
- Modify: `src/engine/missions.ts:16-19`
- Modify: `tests/engine/missions.test.ts`
- Modify: `tests/engine/game.test.ts` (6 Mission literals), `tests/ui/screens.test.ts` (2 Mission literals)

- [ ] **Step 1: Write the failing tests**

Replace the import block at the top of `tests/engine/missions.test.ts` and append the new describes:

```ts
import { describe, it, expect } from "vitest";
import { generateMissions } from "../../src/engine/missions";
import { COMMODITIES, NODE_IDS, getPrice } from "../../src/engine/world";
import { mulberry32, hashSeed } from "../../src/engine/rng";
import { NodeId } from "../../src/engine/types";
```

```ts
describe("reward floor + deposit (E2-2)", () => {
  it("floors every reward at 1.2× the cargo's cost at the offering station", () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (let day = 1; day <= 12; day++) {
        for (const node of NODE_IDS) {
          for (const m of generateMissions(seed, day, node)) {
            const originCost = m.qty * getPrice(seed, day, node, m.commodity);
            expect(m.reward).toBeGreaterThanOrEqual(Math.round(1.2 * originCost));
          }
        }
      }
    }
  });

  it("carries a deposit of 10% of the reward, rounded", () => {
    for (const node of NODE_IDS) {
      for (const m of generateMissions(7, 3, node)) {
        expect(m.deposit).toBe(Math.round(0.1 * m.reward));
      }
    }
  });

  it("keeps mission identity unchanged by the floor (RNG draw order preserved)", () => {
    // Reference implementation of the pre-floor generator: identical draws, no floor.
    // The floor may only raise rewards — id/commodity/qty/destination/deadline must not shift.
    const reference = (seed: number, day: number, node: NodeId) => {
      const rng = mulberry32(hashSeed(seed, day, node.charCodeAt(0), 777));
      const count = 1 + Math.floor(rng() * 3);
      const others = NODE_IDS.filter((n) => n !== node);
      const out = [];
      for (let i = 0; i < count; i++) {
        const commodity = COMMODITIES[Math.floor(rng() * COMMODITIES.length)].id;
        const destination = others[Math.floor(rng() * others.length)];
        const qty = 3 + Math.floor(rng() * 8);
        rng(); // the reward draw — value unused for identity
        const deadlineDay = day + 4 + Math.floor(rng() * 5);
        out.push({ id: `${node}-${day}-${i}`, commodity, destination, qty, deadlineDay });
      }
      return out;
    };
    for (let seed = 1; seed <= 10; seed++) {
      for (const node of NODE_IDS) {
        const actual = generateMissions(seed, 3, node).map(
          ({ id, commodity, destination, qty, deadlineDay }) => ({
            id,
            commodity,
            destination,
            qty,
            deadlineDay,
          })
        );
        expect(actual).toEqual(reference(seed, 3, node));
      }
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/engine/missions.test.ts`
Expected: FAIL — TypeScript error (`deposit` does not exist on `Mission`) and/or floor assertions failing.

- [ ] **Step 3: Implement**

`src/engine/types.ts` — replace the `Mission` interface:

```ts
export interface Mission {
  id: string;
  commodity: CommodityId;
  qty: number;
  destination: NodeId;
  reward: number;
  /** 10% of reward, rounded — escrowed on accept, returned on delivery, forfeited on expiry (E2-2). */
  deposit: number;
  deadlineDay: number; // absolute game day by which cargo must arrive
}
```

`src/engine/missions.ts` — replace the loop body (lines 13–19). Draw order is untouched: commodity, destination, qty, reward roll, deadline — the floor is a pure `max` after the reward draw.

```ts
for (let i = 0; i < count; i++) {
  const commodity = COMMODITIES[Math.floor(rng() * COMMODITIES.length)].id as CommodityId;
  const destination = others[Math.floor(rng() * others.length)];
  const qty = 3 + Math.floor(rng() * 8); // 3..10
  const unit = getPrice(seed, day, destination, commodity);
  const premium = Math.round(unit * qty * (1.3 + rng() * 0.4)); // premium over destination spot
  // E2-2c: never pay under 1.2× what the cargo costs at this board's own dock today.
  const reward = Math.max(premium, Math.round(1.2 * qty * getPrice(seed, day, node, commodity)));
  const deadlineDay = day + 4 + Math.floor(rng() * 5); // +4..+8 days
  missions.push({
    id: `${node}-${day}-${i}`,
    commodity,
    qty,
    destination,
    reward,
    deposit: Math.round(0.1 * reward),
    deadlineDay,
  });
}
```

- [ ] **Step 4: Fix the eight Mission literals in other test files**

`Mission` now requires `deposit` — the suite won't compile until every literal has one (always `round(0.1 × reward)` for consistency):

`tests/engine/game.test.ts`:

- `contract` (~line 34, reward 500): add `deposit: 50,` before `deadlineDay: 99,`
- `partsContract` (~line 74, reward 600): add `deposit: 60,`
- `a1` (~line 305, reward 500): add `deposit: 50,`
- `h1` (~line 404, reward 500): add `deposit: 50,`
- `d1` (~line 511, reward 100): add `deposit: 10,`
- `w1` (~line 526, reward 5000): add `deposit: 500,`

`tests/ui/screens.test.ts`:

- `m1` (~line 55, reward 500): add `deposit: 50,`
- `m2` (~line 707, reward 500): add `deposit: 50,`

Verify none is missed: `grep -rn "deadlineDay:" tests/ | grep -v deposit` should only show lines where `deposit` sits on the line above (spot-check each hit).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS (deposit is inert data until Task 4 — no behavior consumes it yet).

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts src/engine/missions.ts tests/engine/missions.test.ts tests/engine/game.test.ts tests/ui/screens.test.ts
git commit -m "feat(engine): mission reward floor + deposit field (E2-2a/c)"
```

---

### Task 2: `missionFeasibility` helper (P2-3 engine half)

**Files:**

- Modify: `src/engine/missions.ts`
- Test: `tests/engine/missions.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/missions.test.ts` (extend imports):

```ts
import { generateMissions, missionFeasibility } from "../../src/engine/missions";
import { createGame } from "../../src/engine/game";
import { fuelCost } from "../../src/engine/world";
import { REFUEL_PRICE, dockingFee } from "../../src/engine/economy";
import { Mission, NodeId } from "../../src/engine/types";
```

```ts
describe("missionFeasibility (P2-3)", () => {
  const m: Mission = {
    id: "f1",
    commodity: "water",
    qty: 10,
    destination: "kiruna",
    reward: 500,
    deposit: 50,
    deadlineDay: 9,
  };

  it("composes cost, fuel, est. profit, and days left from the live engine numbers", () => {
    const s = createGame(42); // terra, day 1
    const f = missionFeasibility(s, m);
    const cargoCost = 10 * getPrice(42, 1, "terra", "water");
    const fuel = fuelCost("terra", "kiruna"); // 4
    expect(f).toEqual({
      cargoCost,
      fuel,
      estProfit: 500 - cargoCost - fuel * REFUEL_PRICE - dockingFee("kiruna"),
      daysLeft: 8,
    });
  });

  it("skips fuel and dock fee when already at the destination (no jump, no fee)", () => {
    const s = { ...createGame(42), location: "kiruna" as const };
    const f = missionFeasibility(s, m);
    expect(f.fuel).toBe(0);
    expect(f.estProfit).toBe(500 - 10 * getPrice(42, 1, "kiruna", "water"));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/engine/missions.test.ts`
Expected: FAIL — `missionFeasibility` is not exported.

- [ ] **Step 3: Implement**

Append to `src/engine/missions.ts` (extend the imports: `fuelCost` from `./world`, `REFUEL_PRICE`, `dockingFee` from `./economy`, `GameState` from `./types` — economy imports only types/world, so no cycle):

```ts
/**
 * What serving `m` costs from where the player stands (P2-3). Pure display math: buy the
 * full qty here today, burn the direct jump's fuel at replacement price, pay the
 * destination dock fee (skipped when already there — no jump, no fee). The deposit is
 * excluded — it returns on delivery — so the card shows it as its own chip instead.
 */
export function missionFeasibility(
  s: GameState,
  m: Mission
): { cargoCost: number; fuel: number; estProfit: number; daysLeft: number } {
  const cargoCost = m.qty * getPrice(s.seed, s.day, s.location, m.commodity);
  const fuel = fuelCost(s.location, m.destination);
  const dock = fuel > 0 ? dockingFee(m.destination) : 0;
  return {
    cargoCost,
    fuel,
    estProfit: m.reward - cargoCost - fuel * REFUEL_PRICE - dock,
    daysLeft: m.deadlineDay - s.day,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/engine/missions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/missions.ts tests/engine/missions.test.ts
git commit -m "feat(engine): missionFeasibility card math (P2-3)"
```

---

### Task 3: Provenance + counter state (`boughtHere`, `contracts`)

**Files:**

- Modify: `src/engine/types.ts:78-100` (GameState)
- Modify: `src/engine/game.ts` (`createGame`, `buy`, `sell`, `jump`)
- Test: `tests/engine/game.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/game.test.ts`:

```ts
describe("dockside provenance (E2-2d state)", () => {
  it("starts with zeroed provenance and contract counters", () => {
    const s = createGame(42);
    expect(s.boughtHere).toEqual({ water: 0, parts: 0, luxury: 0 });
    expect(s.contracts).toEqual({ delivered: 0, expired: 0, forfeitedCr: 0 });
  });

  it("buy marks units as bought at this dock", () => {
    const s = buy(createGame(42), "water", 5);
    expect(s.boughtHere.water).toBe(5);
  });

  it("selling consumes dockside units first (no laundering)", () => {
    let s = createGame(42);
    s = { ...s, cargo: { ...s.cargo, water: 5 } }; // 5 hauled
    s = buy(s, "water", 5); // +5 dockside
    s = sell(s, "water", 5);
    expect(s.boughtHere.water).toBe(0); // the dockside units went first
    expect(s.cargo.water).toBe(5); // the hauled 5 remain hauled
  });

  it("boughtHere resets on jump — cargo that traveled is hauled", () => {
    let s = buy(createGame(42), "water", 5);
    s = { ...s, fuel: 20 };
    s = jump(s, "kiruna").state;
    expect(s.boughtHere).toEqual({ water: 0, parts: 0, luxury: 0 });
  });

  it("event loot never counts as dockside", () => {
    // Find a clean (non-trap) salvage day for seed 42: hashSeed(42, d) % 3 !== 0.
    const cleanDay = Array.from({ length: 30 }, (_, i) => i + 1).find(
      (d) => hashSeed(42, d) % 3 !== 0
    )!;
    const salvage: GameEvent = {
      kind: "salvage",
      title: "",
      description: "",
      choices: [{ id: "collect", label: "" }],
    };
    const s = resolveChoice({ ...createGame(42), day: cleanDay }, salvage, "collect");
    expect(s.cargo.parts).toBeGreaterThan(0);
    expect(s.boughtHere.parts).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/engine/game.test.ts`
Expected: FAIL — `boughtHere`/`contracts` do not exist on `GameState`.

- [ ] **Step 3: Implement**

`src/engine/types.ts` — add to `GameState` after `activeMissions`:

```ts
/** Units of each commodity bought at the current dock since arrival — reset on jump.
 *  Delivery pays the contract premium only on units that are NOT in here (E2-2d). */
boughtHere: Record<CommodityId, number>;
/** Run-long contract ledger for the debrief (E2-2b). */
contracts: {
  delivered: number;
  expired: number;
  forfeitedCr: number;
}
```

`src/engine/game.ts`:

In `createGame`, after `activeMissions: [],`:

```ts
boughtHere: { water: 0, parts: 0, luxury: 0 },
contracts: { delivered: 0, expired: 0, forfeitedCr: 0 },
```

In `buy` (the `next` object):

```ts
const next = {
  ...state,
  credits: state.credits - cost,
  cargo: { ...state.cargo, [id]: state.cargo[id] + qty },
  boughtHere: { ...state.boughtHere, [id]: state.boughtHere[id] + qty },
};
```

In `sell` (the `next` object) — dockside units sell first, so buy-then-sell at one dock is a wash and can't launder units into "hauled":

```ts
let next: GameState = {
  ...state,
  credits: state.credits + proceeds - tax,
  cargo: { ...state.cargo, [id]: state.cargo[id] - qty },
  boughtHere: { ...state.boughtHere, [id]: Math.max(0, state.boughtHere[id] - qty) },
};
```

In `jump` (the initial `s` object) — reset before the in-transit event, so salvage/derelict loot lands as hauled:

```ts
let s: GameState = {
  ...state,
  fuel: state.fuel - cost,
  location: to,
  day: state.day + 1,
  boughtHere: { water: 0, parts: 0, luxury: 0 },
};
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts src/engine/game.ts tests/engine/game.test.ts
git commit -m "feat(engine): dockside provenance + contract counters (E2-2d state)"
```

---

### Task 4: Deposit escrow on accept (E2-2a)

**Files:**

- Modify: `src/engine/game.ts:276-282` (`acceptMission`)
- Test: `tests/engine/game.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/game.test.ts`:

```ts
describe("contract deposit escrow (E2-2a)", () => {
  const bonded: Mission = {
    id: "b1",
    commodity: "water",
    qty: 5,
    destination: "kiruna",
    reward: 500,
    deposit: 50,
    deadlineDay: 99,
  };

  it("accept debits the deposit and logs the escrow", () => {
    const s = createGame(42);
    const after = acceptMission(s, bonded);
    expect(after.credits).toBe(s.credits - 50);
    expect(after.log[after.log.length - 1]).toEqual({
      msg: "Accepted delivery to Kiruna Belt — 50cr deposit held.",
      tone: "neutral",
      delta: -50,
    });
  });

  it("accept is a silent no-op when credits cannot cover the deposit", () => {
    const s = { ...createGame(42), credits: 49 };
    expect(acceptMission(s, bonded)).toBe(s);
  });

  it("double-accept still no-ops (no double escrow)", () => {
    const once = acceptMission(createGame(42), bonded);
    expect(acceptMission(once, bonded)).toBe(once);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/engine/game.test.ts -t "deposit escrow"`
Expected: FAIL — credits unchanged, log msg is the old "Accepted delivery to Kiruna Belt."

- [ ] **Step 3: Implement**

Replace `acceptMission` in `src/engine/game.ts`:

```ts
export function acceptMission(state: GameState, mission: Mission): GameState {
  if (state.activeMissions.some((m) => m.id === mission.id)) return state;
  if (state.credits < mission.deposit) return state; // E2-2a: can't post the bond
  return withLog(
    {
      ...state,
      credits: state.credits - mission.deposit,
      activeMissions: [...state.activeMissions, mission],
    },
    `Accepted delivery to ${NODES[mission.destination].name} — ${mission.deposit}cr deposit held.`,
    "neutral",
    -mission.deposit
  );
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS. (Existing fixtures accept with deposits ≤ 500 against 800 starting credits, so no guard trips. If any test pinned the old accept log line, update it to the new escrow wording.)

- [ ] **Step 5: Commit**

```bash
git add src/engine/game.ts tests/engine/game.test.ts
git commit -m "feat(engine): escrow the contract deposit on accept (E2-2a)"
```

---

### Task 5: Proportional settlement + deposit refund (E2-2d)

**Files:**

- Modify: `src/engine/game.ts:295-327` (`settleMissions`)
- Test: `tests/engine/game.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/game.test.ts` (inside a new describe; `mission()` builder local to it):

```ts
describe("proportional settlement (E2-2d)", () => {
  const mission = (over: Partial<Mission> = {}): Mission => ({
    id: "pv1",
    commodity: "water",
    qty: 10,
    destination: "kiruna",
    reward: 500,
    deposit: 50,
    deadlineDay: 99,
    ...over,
  });

  it("a fully hauled delivery pays reward + deposit and counts as delivered", () => {
    let s = acceptMission(createGame(42), mission());
    s = { ...s, fuel: 20, cargo: { ...s.cargo, water: 10 } }; // hauled (never bought here)
    const before = arrive(jump(s, "kiruna").state);
    expect(before.delivered.map((m) => m.id)).toEqual(["pv1"]);
    const entry = before.state.log[before.state.log.length - 1];
    expect(entry).toEqual({
      msg: "Delivery complete: +550cr (deposit returned).",
      tone: "good",
      delta: 550,
    });
    expect(before.state.contracts.delivered).toBe(1);
  });

  it("an all-dockside delivery pays spot only — the instant settle is a wash", () => {
    let s = acceptMission(createGame(42), mission());
    s = { ...s, fuel: 20 };
    s = arrive(jump(s, "kiruna").state).state; // arrive empty-handed, day 2
    const spot = getPrice(s.seed, s.day, "kiruna", "water");
    const before = s.credits;
    s = buy(s, "water", 10); // dockside
    s = deliver(s);
    expect(s.credits - before).toBe(50); // -10×spot buy, +10×spot payout, +50cr deposit back
    const entry = s.log[s.log.length - 1];
    expect(entry.msg).toBe(
      `Delivery complete: +${spot * 10 + 50}cr — 10 bought dockside paid spot (deposit returned).`
    );
    expect(entry.delta).toBe(spot * 10 + 50);
  });

  it("a topped-up delivery pays the premium only on hauled units", () => {
    let s = acceptMission(createGame(42), mission());
    s = { ...s, fuel: 20, cargo: { ...s.cargo, water: 8 } }; // hauled 8, short 2
    s = arrive(jump(s, "kiruna").state).state; // mission stays active
    expect(s.activeMissions.map((m) => m.id)).toEqual(["pv1"]);
    const spot = getPrice(s.seed, s.day, "kiruna", "water");
    s = buy(s, "water", 2);
    const before = s.credits;
    s = deliver(s);
    // 8/10 of the reward + 2 units at spot + the deposit back
    expect(s.credits - before).toBe(Math.round((500 * 8) / 10) + spot * 2 + 50);
  });

  it("two missions on one commodity drain the hauled pool in list order", () => {
    let s = acceptMission(createGame(42), mission({ id: "pv2", qty: 5, reward: 300, deposit: 30 }));
    s = acceptMission(s, mission({ id: "pv3", qty: 5, reward: 300, deposit: 30 }));
    s = { ...s, fuel: 20, cargo: { ...s.cargo, water: 5 } }; // hauled covers only the first
    s = arrive(jump(s, "kiruna").state).state; // settles pv2 fully hauled; pv3 stays (short)
    const spot = getPrice(s.seed, s.day, "kiruna", "water");
    s = buy(s, "water", 5); // dockside top-up for pv3
    const before = s.credits;
    s = deliver(s);
    expect(s.credits - before).toBe(spot * 5 + 30); // pv3: all five dockside → spot + deposit
    expect(s.contracts.delivered).toBe(2);
  });

  it("the delivery payday records the actual inflow, not the face reward", () => {
    let s = acceptMission(createGame(42), mission());
    s = { ...s, fuel: 20, cargo: { ...s.cargo, water: 10 } };
    s = arrive(jump(s, "kiruna").state).state;
    expect(s.biggestPayday!.amount).toBe(550); // reward 500 + deposit 50
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/engine/game.test.ts -t "proportional settlement"`
Expected: FAIL — payouts are the face reward with no refund, log lines lack "(deposit returned)".

- [ ] **Step 3: Implement**

Replace the deliverable branch of `settleMissions` in `src/engine/game.ts` (the `if (m.destination === s.location && ...)` arm):

```ts
if (m.destination === s.location && s.cargo[m.commodity] >= m.qty && s.day <= m.deadlineDay) {
  // E2-2d: only hauled units earn the contract premium; units bought at this dock
  // since arrival settle at today's local spot — the instant-settle wash.
  const boughtAvailable = Math.min(s.boughtHere[m.commodity], s.cargo[m.commodity]);
  const hauledUsed = Math.min(m.qty, s.cargo[m.commodity] - boughtAvailable);
  const boughtUsed = m.qty - hauledUsed;
  const spot = getPrice(s.seed, s.day, m.destination, m.commodity);
  const payout = Math.round((m.reward * hauledUsed) / m.qty) + spot * boughtUsed;
  const inflow = payout + m.deposit;
  s = {
    ...s,
    cargo: { ...s.cargo, [m.commodity]: s.cargo[m.commodity] - m.qty },
    boughtHere: {
      ...s.boughtHere,
      [m.commodity]: Math.max(0, s.boughtHere[m.commodity] - boughtUsed),
    },
    credits: s.credits + inflow,
    contracts: { ...s.contracts, delivered: s.contracts.delivered + 1 },
  };
  s = trackPayday(
    s,
    inflow,
    `${commodityName(m.commodity)} contract → ${NODES[m.destination].name}`
  );
  const dockside = boughtUsed > 0 ? ` — ${boughtUsed} bought dockside paid spot` : "";
  s = withLog(s, `Delivery complete: +${inflow}cr${dockside} (deposit returned).`, "good", inflow);
  s = markDay(s, inflow >= BIG_TRADE_CR ? "bigTrade" : "delivery");
  delivered.push(m);
}
```

(Consuming `boughtUsed` from both `cargo` and `boughtHere` keeps the invariant for the next mission in the loop: its hauled pool recomputes correctly from the updated state.)

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS. Two existing tests read delivery inflows and may need their expectations bumped by the deposit refund — check `"marks a modest delivery as delivery"` (d1: inflow 110, still < 900 → passes as-is) and `"upgrades a whale delivery to bigTrade"` (w1: inflow 5500, still ≥ 900 → passes as-is). If any test pins the old `Delivery complete: +${reward}cr.` string, update it to the new wording.

- [ ] **Step 5: Commit**

```bash
git add src/engine/game.ts tests/engine/game.test.ts
git commit -m "feat(engine): proportional settlement — dockside units pay spot (E2-2d)"
```

---

### Task 6: Expiry forfeiture + conservation (E2-2b)

**Files:**

- Modify: `src/engine/game.ts` (`settleMissions` expiry arm)
- Test: `tests/engine/game.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/game.test.ts` (add `GameState` to the types import at the top of the file):

```ts
describe("expiry forfeiture (E2-2b)", () => {
  const bond: Mission = {
    id: "x1",
    commodity: "water",
    qty: 5,
    destination: "kiruna",
    reward: 500,
    deposit: 50,
    deadlineDay: 1,
  };

  it("expiry forfeits the deposit into the counters with no credit movement", () => {
    let s = acceptMission(createGame(42), bond);
    const creditsAfterAccept = s.credits;
    s = { ...s, fuel: 20 };
    s = arrive(jump(s, "kiruna").state).state; // day 2 > deadline 1
    expect(s.credits).toBe(creditsAfterAccept - dockingFee("kiruna")); // only the dock fee moved
    expect(s.contracts).toEqual({ delivered: 0, expired: 1, forfeitedCr: 50 });
    const entry = s.log.find((l) => l.msg.includes("expired"))!;
    expect(entry.msg).toBe("Delivery to Kiruna Belt expired — 50cr deposit forfeit.");
    expect(entry.tone).toBe("bad");
    expect(entry.delta).toBeUndefined();
  });
});

describe("escrow accounting is conservative (E2-2)", () => {
  const sumDeltas = (s: GameState) => s.log.reduce((t, l) => t + (l.delta ?? 0), 0);
  const bond: Mission = {
    id: "c9",
    commodity: "water",
    qty: 5,
    destination: "kiruna",
    reward: 500,
    deposit: 50,
    deadlineDay: 99,
  };

  it("log deltas sum to net credit movement across accept → jump → buy → deliver", () => {
    let s = acceptMission(createGame(42), bond);
    s = { ...s, fuel: 20 };
    s = arrive(jump(s, "kiruna").state).state;
    s = buy(s, "water", 5);
    s = deliver(s);
    expect(sumDeltas(s)).toBe(s.credits - STARTING.credits);
  });

  it("log deltas sum to net credit movement across accept → expire", () => {
    let s = acceptMission(createGame(42), { ...bond, deadlineDay: 1 });
    s = { ...s, fuel: 20 };
    s = arrive(jump(s, "kiruna").state).state;
    expect(sumDeltas(s)).toBe(s.credits - STARTING.credits);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/engine/game.test.ts -t "expiry forfeiture"`
Expected: FAIL — old log wording, counters untouched. (The conservation tests may already pass once Task 5 landed — that's fine; they're the regression net for the whole escrow design.)

- [ ] **Step 3: Implement**

Replace the expiry arm of `settleMissions` in `src/engine/game.ts`:

```ts
} else if (s.day > m.deadlineDay) {
  // E2-2b: the bond is the penalty — the credits moved at accept, so no delta here.
  s = withLog(
    {
      ...s,
      contracts: {
        ...s.contracts,
        expired: s.contracts.expired + 1,
        forfeitedCr: s.contracts.forfeitedCr + m.deposit,
      },
    },
    `Delivery to ${NODES[m.destination].name} expired — ${m.deposit}cr deposit forfeit.`,
    "bad"
  );
  expired.push(m);
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/game.ts tests/engine/game.test.ts
git commit -m "feat(engine): expiry forfeits the deposit into the run ledger (E2-2b)"
```

---

### Task 7: Snapshot v3 + v2 migration

**Files:**

- Modify: `src/ui/storage.ts`
- Test: `tests/ui/storage.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/storage.test.ts` (after the v1→v2 describe; `liveSnapshot` already exists at ~line 165):

```ts
describe("snapshot v2 → v3 contract migration (E2-2)", () => {
  it("accepts a v2 snapshot: legacy missions get deposit 0, provenance and counters zero", () => {
    const base = liveSnapshot({});
    const legacyMission = {
      id: "m-old",
      commodity: "water",
      qty: 5,
      destination: "kiruna",
      reward: 500,
      deadlineDay: 9,
    }; // no deposit — accepted under the old rules, so none is owed back
    const v2state = { ...base.state, activeMissions: [legacyMission] } as Record<string, unknown>;
    delete v2state.boughtHere;
    delete v2state.contracts;
    const v2 = { ...base, version: 2, state: v2state };
    const parsed = parseSnapshot(JSON.stringify(v2), TODAY);
    expect(parsed).not.toBeNull();
    expect(parsed!.version).toBe(3);
    expect(parsed!.state.activeMissions[0].deposit).toBe(0);
    expect(parsed!.state.boughtHere).toEqual({ water: 0, parts: 0, luxury: 0 });
    expect(parsed!.state.contracts).toEqual({ delivered: 0, expired: 0, forfeitedCr: 0 });
  });

  it("chains v1 → v2 → v3 (string logs wrapped AND contract fields defaulted)", () => {
    const base = liveSnapshot({});
    const v1state = { ...base.state, log: ["Docked at Terra Hub, fee 40cr."] } as Record<
      string,
      unknown
    >;
    delete v1state.boughtHere;
    delete v1state.contracts;
    const v1 = { ...base, version: 1, state: v1state };
    const parsed = parseSnapshot(JSON.stringify(v1), TODAY);
    expect(parsed).not.toBeNull();
    expect(parsed!.version).toBe(3);
    expect(parsed!.state.log).toEqual([{ msg: "Docked at Terra Hub, fee 40cr.", tone: "neutral" }]);
    expect(parsed!.state.boughtHere).toEqual({ water: 0, parts: 0, luxury: 0 });
  });

  it.each([
    [
      "a mission with a non-numeric deposit",
      (s: ReturnType<typeof createGame>) => ({
        ...s,
        activeMissions: [
          {
            id: "m",
            commodity: "water",
            qty: 5,
            destination: "kiruna",
            reward: 500,
            deposit: "50",
            deadlineDay: 9,
          },
        ],
      }),
    ],
    [
      "a negative boughtHere entry",
      (s: ReturnType<typeof createGame>) => ({
        ...s,
        boughtHere: { water: -1, parts: 0, luxury: 0 },
      }),
    ],
    [
      "a boughtHere missing a commodity key",
      (s: ReturnType<typeof createGame>) => ({ ...s, boughtHere: { water: 0, parts: 0 } }),
    ],
    [
      "contract counters of the wrong type",
      (s: ReturnType<typeof createGame>) => ({
        ...s,
        contracts: { delivered: "1", expired: 0, forfeitedCr: 0 },
      }),
    ],
  ] as [string, (s: ReturnType<typeof createGame>) => unknown][])("rejects %s", (_why, mutate) => {
    const snap = { ...liveSnapshot(), state: mutate(createGame(42, BOOT)) };
    expect(parseSnapshot(JSON.stringify(snap), TODAY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/ui/storage.test.ts`
Expected: FAIL — v3 parses as null (unknown version), corrupt fields are accepted.

- [ ] **Step 3: Implement**

In `src/ui/storage.ts`:

1. `RunSnapshot.version` type: `2` → `3` (line 140).
2. Add after `migrateV1Log`:

```ts
/**
 * v2 → v3 (E2-2): legacy missions predate deposits — none was paid, so none is owed
 * back (`deposit: 0` refunds/forfeits nothing). Provenance and counters default to
 * zeros; a one-time upgrade-day launder of dockside units is accepted.
 */
function migrateV2Contracts(state: unknown): void {
  const st = state as {
    activeMissions?: unknown[];
    boughtHere?: unknown;
    contracts?: unknown;
  };
  if (Array.isArray(st?.activeMissions)) {
    st.activeMissions = st.activeMissions.map((m) =>
      typeof m === "object" && m !== null && !("deposit" in m) ? { ...m, deposit: 0 } : m
    );
  }
  if (typeof state === "object" && state !== null) {
    if (st.boughtHere === undefined) st.boughtHere = { water: 0, parts: 0, luxury: 0 };
    if (st.contracts === undefined) st.contracts = { delivered: 0, expired: 0, forfeitedCr: 0 };
  }
}
```

3. Extend `migrateSnapshotToCurrentVersion` — chained, so a v1 doc passes through both:

```ts
function migrateSnapshotToCurrentVersion(p: ParsedSnapshot): void {
  if (p && p.version === 1 && typeof p.state === "object" && p.state !== null) {
    migrateV1Log(p.state);
    p.version = 2;
  }
  if (p && p.version === 2 && typeof p.state === "object" && p.state !== null) {
    migrateV2Contracts(p.state);
    p.version = 3;
  }
}
```

4. In `parseSnapshot`, change `p.version !== 2` → `p.version !== 3`.
5. Add validators near `isValidLogEntry`, and wire them into `isValidSnapshotState` (import `CommodityId` from `../engine/types`):

```ts
const COMMODITY_KEYS: CommodityId[] = ["water", "parts", "luxury"];

/** boughtHere feeds settlement math on resume — a missing key or negative count is corrupt. */
function isValidBoughtHere(b: unknown): boolean {
  if (typeof b !== "object" || b === null) return false;
  const rec = b as Record<string, unknown>;
  return COMMODITY_KEYS.every((k) => typeof rec[k] === "number" && (rec[k] as number) >= 0);
}

function isValidContracts(c: unknown): boolean {
  if (typeof c !== "object" || c === null) return false;
  const rec = c as Record<string, unknown>;
  return ["delivered", "expired", "forfeitedCr"].every(
    (k) => typeof rec[k] === "number" && (rec[k] as number) >= 0
  );
}

/** Only `deposit` is validated on missions — it is the one field the refund math reads. */
function hasValidDeposits(missions: unknown): boolean {
  return (
    Array.isArray(missions) &&
    missions.every(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        typeof (m as { deposit?: unknown }).deposit === "number" &&
        (m as { deposit: number }).deposit >= 0
    )
  );
}
```

In `isValidSnapshotState`, before the final `return`:

```ts
if (!isValidBoughtHere(st.boughtHere)) return false;
if (!isValidContracts(st.contracts)) return false;
if (!hasValidDeposits(st.activeMissions)) return false;
```

- [ ] **Step 4: Update the stale v2 fixtures**

In `tests/ui/storage.test.ts`:

- `liveSnapshot()` (~line 167): `version: 2` → `version: 3` (its state comes from `createGame`, which now carries the new fields).
- The rejection case `["a wrong version", { version: 3 }]` (~line 227): → `{ version: 4 }`.
- The v1→v2 migration describe: `expect(parsed!.version).toBe(2)` → `.toBe(3)` (it now chains).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/storage.ts tests/ui/storage.test.ts
git commit -m "feat(persistence): snapshot v3 — contract deposits, provenance, counters"
```

---

### Task 8: Offer cards — feasibility line + deposit-aware Accept (P2-3)

**Files:**

- Modify: `src/ui/screens.ts:259-268` (offer cards), imports
- Modify: `src/ui/styles.css`
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing tests**

The existing Accept aria-label pin (`tests/ui/screens.test.ts` ~line 40, "gives each Accept button an accessible name describing the contract") changes — update it in place and append the new describe. Extend the test file's engine imports with `missionFeasibility` from `../../src/engine/missions`.

Updated existing test:

```ts
it("gives each Accept button an accessible name describing the contract and its deposit", () => {
  const s = createGame(42);
  const offered = missionsHere(s);
  expect(offered.length).toBeGreaterThan(0);
  const html = stationScreen(s);
  for (const m of offered) {
    expect(html).toContain(
      `aria-label="Accept contract: deliver ${m.qty} ${commodityName(m.commodity)} to ${NODES[m.destination].name} for a ${cr2(m.deposit)} deposit"`
    );
  }
});
```

New describe:

```ts
describe("contract feasibility card (P2-3)", () => {
  it("prints cost, fuel, est. profit, deposit, and days left from missionFeasibility", () => {
    const s = createGame(42);
    const html = stationScreen(s);
    for (const m of missionsHere(s)) {
      const f = missionFeasibility(s, m);
      const est =
        f.estProfit >= 0 ? `est. +${cr2(f.estProfit)}` : `est. −${cr2(Math.abs(f.estProfit))}`;
      expect(html).toContain(
        `cost ~${cr2(f.cargoCost)} · ${f.fuel}⛽ · ${est} · deposit ${cr2(m.deposit)}`
      );
      expect(html).toContain(`${f.daysLeft} days left`);
    }
  });

  it("disables Accept with a reason when credits cannot cover the deposit", () => {
    const s = { ...createGame(42), credits: 0 };
    const html = stationScreen(s);
    const m = missionsHere(s)[0];
    expect(html).toContain(`aria-disabled="true" aria-describedby="accept-hint-${m.id}"`);
    expect(html).toContain(`(need ${cr2(m.deposit)} deposit)`);
  });
});
```

Note: offer deadlines are always `day+4..+8`, so an offer card can never sit ≤ 2 days out — the amber class is exercised only on **active** cards, and Task 9 owns those assertions. The offer-card markup still carries the shared `contract-days` span so both card kinds render the countdown identically.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/ui/screens.test.ts`
Expected: FAIL — no feasibility line, old aria-label, no disabled state.

- [ ] **Step 3: Implement**

In `src/ui/screens.ts`, add `missionFeasibility` to the missions import, then replace the offer-card map (lines 259–268):

```ts
const acceptedIds = new Set(s.activeMissions.map((m) => m.id));
const missions = missionsHere(s)
  .map((m) => {
    const f = missionFeasibility(s, m);
    const est =
      f.estProfit >= 0 ? `est. +${cr(f.estProfit)}` : `est. −${cr(Math.abs(f.estProfit))}`;
    const days = `<span class="contract-days${f.daysLeft <= 2 ? " contract-days--amber" : ""}">${f.daysLeft} day${f.daysLeft === 1 ? "" : "s"} left</span>`;
    const feasibility = `<span class="contract-feas st-num">cost ~${cr(f.cargoCost)} · ${f.fuel}⛽ · ${est} · deposit ${cr(m.deposit)} · ${days}</span>`;
    const acceptHintId = `accept-hint-${m.id}`;
    const canAfford = s.credits >= m.deposit;
    // Composed button + hint, aria-disabled to stay focusable — the shortfall-buy pattern.
    const action = acceptedIds.has(m.id)
      ? `<span class="accepted">✓ Accepted</span>`
      : `<button class="st-btn st-btn--ghost st-btn--sm" data-act="accept" data-id="${m.id}" aria-label="Accept contract: deliver ${m.qty} ${commodityName(m.commodity)} to ${NODES[m.destination].name} for a ${cr(m.deposit)} deposit"${
          canAfford ? "" : ` aria-disabled="true" aria-describedby="${acceptHintId}"`
        }>Accept</button>` +
        (canAfford
          ? ""
          : ` <span id="${acceptHintId}" class="bad">(need ${cr(m.deposit)} deposit)</span>`);
    return `<li>Deliver ${m.qty} ${commodityName(m.commodity)} → ${NODES[m.destination].name} by day ${m.deadlineDay} · reward ${cr(m.reward)}<br>${feasibility}
    ${action}</li>`;
  })
  .join("");
```

(No main.ts change: the global aria-disabled click guard at `src/main.ts:288` already swallows clicks on disabled controls, and the engine guard from Task 4 backstops it.)

Append to `src/ui/styles.css`:

```css
/* P2-3 contract feasibility line */
.contract-feas {
  display: inline-block;
  font-size: 0.9em;
  opacity: 0.85;
}

.contract-days--amber {
  color: var(--st-accent-alert);
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens.ts src/ui/styles.css tests/ui/screens.test.ts
git commit -m "feat(ui): contract feasibility card + deposit-aware accept (P2-3)"
```

---

### Task 9: Active cards — days-left countdown + provenance hint

**Files:**

- Modify: `src/ui/screens.ts:270-315` (active cards)
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/screens.test.ts` (the `withMission` helper at the top of the file builds a state carrying a mission; `mission` fixture `m1` from ~line 55 already has `deposit: 50`):

```ts
describe("active contract countdown + provenance (E2-2d/P2-3)", () => {
  const mission: Mission = {
    id: "m3",
    commodity: "water",
    qty: 10,
    destination: "verge",
    reward: 500,
    deposit: 50,
    deadlineDay: 5,
  };

  it("shows days left on the active card, amber at ≤ 2 days", () => {
    const far = withMission(mission); // day 1 → 4 days left
    expect(stationScreen(far)).toContain("4 days left");
    expect(stationScreen(far)).not.toContain("contract-days--amber");
    const near = { ...withMission(mission), day: 3 }; // 2 days left
    expect(stationScreen(near)).toContain(
      `<span class="contract-days contract-days--amber">2 days left</span>`
    );
  });

  it("names dockside units on a ready card before the deliver click", () => {
    const s = {
      ...withMission({ ...mission, destination: "terra" }), // ready at the current dock
      boughtHere: { water: 4, parts: 0, luxury: 0 },
    };
    expect(stationScreen(s)).toContain("✓ carrying 10/10 — 4 bought here pay spot");
  });

  it("keeps the plain ready line when everything was hauled", () => {
    const s = withMission({ ...mission, destination: "terra" });
    expect(stationScreen(s)).toContain("✓ carrying 10/10 — ready,");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/ui/screens.test.ts -t "active contract countdown"`
Expected: FAIL — no days-left chip, no provenance wording.

- [ ] **Step 3: Implement**

In the active-card map of `src/ui/screens.ts` (starts ~line 270), add after `const atDestination = ...`:

```ts
const daysLeft = m.deadlineDay - s.day;
const daysChip =
  daysLeft >= 0
    ? ` · <span class="contract-days${daysLeft <= 2 ? " contract-days--amber" : ""}">${daysLeft} day${daysLeft === 1 ? "" : "s"} left</span>`
    : "";
// Mirror settlement's provenance math so the nerf is visible before the click (E2-2d).
const boughtUsed = Math.max(
  0,
  m.qty - Math.max(0, s.cargo[m.commodity] - s.boughtHere[m.commodity])
);
const provenance = ready && boughtUsed > 0 ? ` — ${boughtUsed} bought here pay spot` : "";
```

Change the ready hint line from:

```ts
: `<span class="good">✓ carrying ${have}/${m.qty} — ready, ${readyBtn}</span>`
```

to:

```ts
: `<span class="good">✓ carrying ${have}/${m.qty}${provenance} — ready, ${readyBtn}</span>`
```

And change the card header return from:

```ts
return `<li>${m.qty} ${commodityName(m.commodity)} → ${NODES[m.destination].name} by day ${m.deadlineDay} · reward ${cr(m.reward)}<br>${hint}</li>`;
```

to:

```ts
return `<li>${m.qty} ${commodityName(m.commodity)} → ${NODES[m.destination].name} by day ${m.deadlineDay} · reward ${cr(m.reward)}${daysChip}<br>${hint}</li>`;
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS. (These are the only amber assertions in the suite — offer cards can never reach ≤ 2 days by construction, so the active card is the anchor for `.contract-days--amber`.)

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens.ts tests/ui/screens.test.ts
git commit -m "feat(ui): active-contract countdown and dockside provenance hint"
```

---

### Task 10: Run-end contracts row

**Files:**

- Modify: `src/ui/screens.ts` (`runEndScreen`, ~line 512)
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/screens.test.ts` (the file already imports `runEndScreen`, `endRun`, `retire`):

```ts
describe("run-end contracts row (E2-2b)", () => {
  const ended = (contracts: { delivered: number; expired: number; forfeitedCr: number }) => {
    const s = { ...retire({ ...createGame(42), fuel: 20 }), contracts };
    return runEndScreen(s, s.runEnd!);
  };

  it("shows delivered and expired counts with the forfeited total", () => {
    const html = ended({ delivered: 2, expired: 1, forfeitedCr: 25 });
    expect(html).toContain("2 delivered · 1 expired (−25cr deposit)");
  });

  it("omits the forfeit note when nothing was forfeited", () => {
    const html = ended({ delivered: 3, expired: 0, forfeitedCr: 0 });
    expect(html).toContain("3 delivered · 0 expired");
    expect(html).not.toContain("deposit)");
  });

  it("omits the row entirely when no contract resolved", () => {
    expect(ended({ delivered: 0, expired: 0, forfeitedCr: 0 })).not.toContain("Contracts");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/ui/screens.test.ts -t "run-end contracts row"`
Expected: FAIL — no Contracts row rendered.

- [ ] **Step 3: Implement**

In `runEndScreen` (`src/ui/screens.ts`), after the `haul` const:

```ts
const contractsRow =
  s.contracts.delivered + s.contracts.expired > 0
    ? `<div class="st-kv"><span class="st-kv__label">Contracts</span><span class="st-kv__value st-num">${s.contracts.delivered} delivered · ${s.contracts.expired} expired${
        s.contracts.forfeitedCr > 0 ? ` (−${cr(s.contracts.forfeitedCr)} deposit)` : ""
      }</span></div>`
    : "";
```

And render it inside `run-end__breakdown`, after `${haul}`:

```ts
${haul}
${contractsRow}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens.ts tests/ui/screens.test.ts
git commit -m "feat(ui): contracts ledger on the run-end debrief (E2-2b)"
```

---

### Task 11: Round verification + docs housekeeping

**Files:**

- Modify: `docs/ROADMAP.md`, `docs/BACKLOG.md`, `docs/ENGAGEMENT_BACKLOG.md`

- [ ] **Step 1: Full verification**

```bash
npm test && npm run lint && npm run build
```

Expected: all green. The sim suite ran inside `npm test` — its 100-seed bands must be untouched (no strategy calls `acceptMission`; the floor added no RNG draws). If a sim assertion moved, STOP: something changed draw order — re-check Task 1 against the reference-implementation test.

- [ ] **Step 2: Tick the docs**

- `docs/ROADMAP.md` M3 table: E2-2 row → `✅ **Shipped 2026-08-01.** …`; P2-3 row → `✅ **Shipped 2026-08-01** (bundled with E2-2).`; note round 1 closed in the M3 sequence paragraph.
- `docs/BACKLOG.md` row P2-3 (~line 51): mark the "still open" half done (feasibility line + amber deadline shipped).
- `docs/ENGAGEMENT_BACKLOG.md` row E2-2 (~line 121) and iteration-order item 10: mark shipped 2026-08-01.

- [ ] **Step 3: Commit**

```bash
git add docs/ROADMAP.md docs/BACKLOG.md docs/ENGAGEMENT_BACKLOG.md
git commit -m "feat(m3): close round 1 — contract integrity (E2-2 + P2-3)"
```

---

## Self-review notes

- **Spec coverage:** E2-2a deposit (Tasks 1, 4), E2-2b expiry + debrief (Tasks 6, 10), E2-2c floor (Task 1), E2-2d provenance + proportional settlement (Tasks 3, 5, 9), P2-3 card (Tasks 2, 8, 9), snapshot v3 (Task 7), conservation AC (Task 6), sim sanity + docs (Task 11). Manual browser check of a same-day resume (old snapshot upgrading live) rides Task 7's land — do it once before closing the round.
- **Known accepted quirks (from the spec):** split-settlement rounding may drop ≤1cr (house-favorable); the active-card provenance hint mirrors settlement for the _first_ deliverable mission — with two same-commodity ready missions the second card's hint is approximate until the first settles; upgrade-day snapshots launder dockside units once (migration zeroes `boughtHere`).
- **Plan omission found during execution:** Task 7's file list and `git add` line name only `storage.ts` and its test, but `syncSnapshot` in `src/main.ts` writes the envelope's `version` and must move 2 → 3 with it. `tsc` catches this (`Type '2' is not assignable to type '3'`), so it can't ship broken — but the step was missing. The M2-closeout plan did include it.
- **Quirks found during execution (2026-08-01):**
  - The floor is cargo-cost only, so ~19% of offers still price out net-negative once fuel and dock fees are counted — accepted by design, see spec decision 5. P2-3's honest `est. −Ncr` is the junk-offer fix, not the floor.
  - `Math.round(0.1 × reward) === 0` needs `reward ≤ 4`; the floor plus real prices put the observed minimum reward at 65cr (deposit 7cr), so a zero-deposit generated contract is unreachable. Task 4's `credits < deposit` guard is never trivially satisfied — but no later task should _assume_ `deposit > 0`, since Task 7 migrates legacy missions to exactly 0.
  - **The instant settle is dead; a 2-jump variant survives and is fine.** Verified over 2,406 real generated offers: accept at A → jump to B → buy qty dockside → deliver nets −39cr to −109cr, profitable in **0** cases — exactly the fuel and dock fee. The residual leak belongs to decision 3, not to settlement: because `boughtHere` resets on jump, buying at destination B then jumping B→C→B re-qualifies those units as hauled. Measured over 1,606 offers it beats the direct haul in 455 (28%) but averages **−4.5% of reward** and costs 2 days, 2 dock fees, 6+ fuel and 2 event rolls — dominated on average, nothing like the original riskless margin. Backlog note, not a blocker. (Salvage/derelict loot counting as hauled is intended by decision 3.)
  - **`biggestPayday` and the `bigTrade` threshold now include the player's own returned bond.** "Best haul" on a 5,000cr contract reads 5,500cr, and an 850cr contract can cross `BIG_TRADE_CR = 900` on the refund alone. Spec-sanctioned (decision 1 says `trackPayday` uses the actual inflow) and arguably right — the stat then matches the log line — but worth a look before any further share-strip work.
  - **Spec decision 2 overclaims the stranding coverage.** "checkLoss already sees the lower credits" holds only for the post-jump case: `checkLoss` has exactly one caller, inside `arrive`. If the escrow strands you _at the current dock_, `jump` returns unchanged on `fuel < cost`, so `arrive` — and therefore `checkLoss` — never runs, and `status` stays `playing`. Reachable with ordinary numbers: at Terra with `fuel: 0, credits: 60`, `checkLoss` passes (cheapest jump 3 fuel = 24cr); accept a 50cr bond → credits 10, every jump refused, and the only exit is Retire, which pays a **survival bonus**. So escrowing yourself into a dock-lock currently scores better than being stranded. Pre-existing class (`repair` does the same; `buy` mostly escapes it because cargo sells back), but E2-2a adds an entry point that is irreversible by design. Not fixed in this round — verify and decide in Task 11.
  - **`deliver()` is missing `trackPeak`.** `arrive()` wraps `settleMissions` in `trackPeak`; `deliver()` does not, so a dockside delivery raises net worth without updating `peakNetWorth`. Pre-existing and out of scope, but **Task 5 edits `settleMissions`, which makes it the natural place to fix** — decide there rather than discovering it later. (Related: this is also why `acceptMission` must _not_ call `trackPeak` — an accept strictly lowers net worth, so it can never raise a high-water mark, and tracking there would belatedly record a stale peak.)
  - **The `jump` reset's stated rationale is unfalsifiable — the real reason is different.** Task 3 Step 3 and spec decision 3 justify resetting `boughtHere` "before the in-transit event, so salvage/derelict loot lands as hauled." No event writes `boughtHere` (`buy` is its only writer), and `jump` returns `{state, event}` with every call site running `jump → resolveChoice → arrive`, so no reachable state can distinguish before-event from after-event. What the placement _does_ buy: resetting inside `jump` rather than `arrive` keeps the invariant `boughtHere[c] ≤ cargo[c]` intact through `resolveCustoms`, which zeroes `cargo.luxury` without touching `boughtHere`. Keep the reset where it is; don't trust the stated reason.
  - **Merge this round as a unit, not task-by-task.** Between Task 1 and Task 7, `Mission.deposit` is required while `storage.ts` still parses v2 snapshots, so `isValidSnapshotState`'s `s is GameState` predicate lies about resumed missions. Harmless while nothing reads `deposit` (verified: zero consumers in `src/` at Task 1), but Task 7's migration keys on `!("deposit" in m)` and therefore cannot distinguish a mission generated between Tasks 1 and 4 (deposit present, never escrowed) from one generated after Task 4 (escrow actually paid) — a snapshot from that window would be refunded a deposit it never paid. The window only exists if the round deploys mid-flight.
