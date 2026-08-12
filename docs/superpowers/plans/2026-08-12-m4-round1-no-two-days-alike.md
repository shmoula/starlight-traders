# M4 Round 1 — "No Two Days Alike" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open Milestone 4: one seeded daily modifier per date (E3-1), salvage-rich long-haul lanes plus seeded ice-run contracts (E3-2), and salvage bait that latches a one-jump pirate tail (E3-4) — all honest on every surface and gated by the 100-seed sim sweep.

**Architecture:** A new `src/engine/modifiers.ts` owns an authored 7-entry pool and `dailyModifier(seed)`; effects channel exclusively through the existing single-source functions — `fuelCost` (gains a `seed` parameter), `getPrice` (gains a multiplier hook), and the `rollEvent` bands (amnesty/corsair via a shared `effectiveDanger`) — so jump buttons, star-map labels, feasibility cards, escape math, and raid percentages inherit modifiers with no second copy to go stale. The bait tail is one new `GameState` boolean with `boughtHere`'s lifecycle (set by a seeded roll in `resolveSalvage`, read by the next `jump`'s event roll, cleared in the jump reset), persisted by a snapshot v5→v6 migration. Ice runs append to Kiruna's board from their own RNG stream so existing boards stay byte-identical.

**Tech Stack:** TypeScript, Vite, Vitest. No new dependencies.

**Design spec:** [docs/superpowers/specs/2026-08-12-m4-round1-no-two-days-alike-design.md](../specs/2026-08-12-m4-round1-no-two-days-alike-design.md)

**Measured facts this plan is built on** (captured 2026-08-12 on master + spec commit, before any change):

- Current 100-seed sweep (seeds 1–100 — the post-depth world this round starts from):

  | kind     | audited | lost | retired | peakSum | scoreSum | netWorthSum |
  | :------- | ------: | ---: | ------: | ------: | -------: | ----------: |
  | cautious |      97 |    3 |       0 |       0 |    58200 |     −196934 |
  | balanced |     100 |    0 |       0 |  772940 |   804834 |      744834 |
  | greedy   |      74 |   26 |       0 | 1190162 |   926611 |      812651 |

- Pre-depth baseline fixture (committed, `tests/sim/fixtures/pre-depth-baseline.json`): cautious netWorthSum −190880, balanced 961128, greedy 28 lost.
- **The cautious decay gate has only ~1k of slack** (current −196934 vs threshold −195880). Amnesty seeds (no pirate tolls) and syndicateRest seeds (no interest) will _raise_ cautious's sum, so expect that gate to trip in Task 12 and be re-recorded against the measured post-round number — keeping the gate's spirit: cautious stays strictly below the pre-depth −190880.
- `MODIFIER_SALT = 0x7007` was chosen by measuring `hashSeed(seed, salt) % 7` over sweep seeds 1–100: histogram 14,14,14,13,15,13,17 (every pool slot ≥13 seeds). Reference seed → modifier map (pool order `clearSkies, ionStorms, luxuryBoom, partsGlut, amnesty, corsairSeason, syndicateRest`):
  - clearSkies: 5, 8, 13, 16, 27, 28, 35, **42**, 50 — the engine-test fixture seed 42 stays byte-identical
  - ionStorms: 1, 2, 21 · luxuryBoom: 10, 18 · partsGlut: 4, 12 · amnesty: 9, 17 · corsairSeason: 6, 14 · syndicateRest: 3, 7, 11
- Seeded fixture days (hazard = `hashSeed(seed, day) % 3 === 0`; bait = `hashSeed(seed, day, 0xba17) % 4 === 0`; ice = `hashSeed(seed, day, 0x1ce0) % 3 === 0`):
  - seed 42: hazard days 1, 2, 4, 11 · clean+bait days **8, 12** · clean no-bait days 3, 5, 6, 7, 9, 10 · ice days **9, 11** (day 1 has NO ice run → 4-line bulletin)
  - seed 5 (clearSkies): ice days include **1** (day-1 ice run → 5-line bulletin)

**Plan-time deviation from the spec (record in the spec on land):** `LONG_HAUL_FUEL` and `isLongHaul` live in **world.ts** beside the DISTANCE table they read, not events.ts — events.ts already imports world.ts, and the reverse import would be a cycle.

---

## File structure

| File                             | Change                                                                                              |
| :------------------------------- | :-------------------------------------------------------------------------------------------------- |
| `src/engine/modifiers.ts`        | **Create:** pool, `dailyModifier`, `fuelDelta`, `priceMultiplier`, `CORSAIR_DANGER_DELTA`           |
| `src/engine/world.ts`            | `fuelCost(seed, …)`/`cheapestJumpCost(seed, …)`, `getPrice` multiplier hook, `isLongHaul`           |
| `src/engine/events.ts`           | `effectiveDanger`, `pirateChance(s, to)`, `rollEvent(…, tailed)`, amnesty/corsair/long-haul bands   |
| `src/engine/types.ts`            | `GameState.pirateTail`, `Mission.tag?: "ice"`                                                       |
| `src/engine/game.ts`             | createGame init, interest holiday, bait roll in `resolveSalvage`, jump passes/clears tail           |
| `src/engine/preview.ts`          | `SALVAGE_BAIT_DIVISOR`, bait clause in `choiceOdds`                                                 |
| `src/engine/missions.ts`         | `iceRunDay`, ice-run append in `generateMissions`, `ICE_RUN_CADENCE`                                |
| `src/engine/bulletin.ts`         | `TODAY:` lead line + conditional ice-run line                                                       |
| `src/engine/economy.ts`          | `escapeCost`/`canEscape` thread seed into `cheapestJumpCost`                                        |
| `src/sim/simulate.ts`            | seed-threaded fuel calls, `SimResult.tails`, `ArchetypeSummary.tailsSum`                            |
| `src/ui/storage.ts`              | snapshot v5→v6 (`pirateTail`), mission `tag` validation                                             |
| `src/ui/screens.ts`              | screen-head modifier chip, tail banner, salvage-rich tooltip, ❄ ICE RUN prefix, seed-threaded calls |
| `src/ui/map.ts`                  | seed-threaded `fuelCost`, state-threaded `pirateChance`                                             |
| `src/ui/share.ts`                | `ShareData.modifier` + line-1 tag                                                                   |
| `src/main.ts`                    | ShareData gains modifier; snapshot literal version bump if constructed there (grep)                 |
| `tests/engine/modifiers.test.ts` | **Create**                                                                                          |
| `tests/engine/*.test.ts`         | world/events/game/missions/bulletin/preview/share updates per task                                  |
| `tests/ui/storage.test.ts`       | v6 snapshot suite                                                                                   |
| `tests/ui/screens.test.ts`       | chip/banner/prefix/tooltip assertions                                                               |
| `tests/ui/map.test.ts`           | signature updates                                                                                   |
| `tests/sim/simulate.test.ts`     | re-recorded decay thresholds + per-modifier fairness gate                                           |
| `tests/sim/bounce.test.ts`       | seed-threaded `fuelCost` calls                                                                      |

Create and work on branch `feat/m4-round1-no-two-days-alike`:

```bash
git checkout -b feat/m4-round1-no-two-days-alike
```

---

### Task 1: `modifiers.ts` — the pool and `dailyModifier`

**Files:**

- Create: `src/engine/modifiers.ts`
- Test: `tests/engine/modifiers.test.ts` (create)

- [ ] **Step 1: Write the failing tests** — create `tests/engine/modifiers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  MODIFIER_POOL,
  dailyModifier,
  fuelDelta,
  priceMultiplier,
} from "../../src/engine/modifiers";

describe("daily modifiers (E3-1)", () => {
  it("is deterministic per seed and covers the whole pool across seeds", () => {
    expect(dailyModifier(42)).toBe(dailyModifier(42));
    const seen = new Set(Array.from({ length: 200 }, (_, i) => dailyModifier(i + 1).id));
    for (const m of MODIFIER_POOL) expect(seen.has(m.id), m.id).toBe(true);
  });

  it("maps the reference seeds the rest of this round's tests rely on", () => {
    expect(dailyModifier(42).id).toBe("clearSkies");
    expect(dailyModifier(1).id).toBe("ionStorms");
    expect(dailyModifier(10).id).toBe("luxuryBoom");
    expect(dailyModifier(4).id).toBe("partsGlut");
    expect(dailyModifier(9).id).toBe("amnesty");
    expect(dailyModifier(6).id).toBe("corsairSeason");
    expect(dailyModifier(3).id).toBe("syndicateRest");
  });

  it("bulletin lines are TODAY:-prefixed and ≤70 chars", () => {
    for (const m of MODIFIER_POOL) {
      expect(m.bulletinLine.startsWith("TODAY: "), m.id).toBe(true);
      expect(m.bulletinLine.length, m.id).toBeLessThanOrEqual(70);
    }
  });

  it("accessors expose exactly the authored effects", () => {
    expect(fuelDelta(1)).toBe(1); // ionStorms
    expect(fuelDelta(42)).toBe(0); // clearSkies
    expect(priceMultiplier(10, "meridian", "luxury")).toBe(1.25); // luxuryBoom
    expect(priceMultiplier(10, "meridian", "parts")).toBe(1);
    expect(priceMultiplier(10, "verge", "luxury")).toBe(1);
    expect(priceMultiplier(4, "vulcan", "parts")).toBe(0.8); // partsGlut
    expect(priceMultiplier(42, "vulcan", "parts")).toBe(1); // clearSkies
  });
});
```

- [ ] **Step 2: Run it** — `npx vitest run tests/engine/modifiers.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Create `src/engine/modifiers.ts`:**

```ts
// src/engine/modifiers.ts
//
// Daily modifiers (E3-1): one seeded modifier per daily seed — constant for the whole
// run — gives every date a nameable personality ("ion storms today"). Effects channel
// exclusively through the existing single-source functions (fuelCost, getPrice, the
// rollEvent bands), so every surface inherits them honestly (E1-4/B-1). No GameState
// field: the modifier is derivable from `seed` anywhere, including the sim and a
// rehydrated snapshot (spec decision 1).
import { CommodityId, NodeId } from "./types";
import { hashSeed } from "./rng";

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
  /** ≤70 chars, "TODAY: "-prefixed — the bulletin's lead line (spec decision 12). */
  bulletinLine: string;
  /** Extra fuel burned by every jump (ionStorms). */
  fuelDelta?: number;
  /** Price multiplier for one (node, commodity) pair, applied inside getPrice. */
  priceMult?: { node: NodeId; commodity: CommodityId; mult: number };
  /** Event-band tweak: amnesty empties both hostile bands; corsairs raise every lane. */
  eventTweak?: "amnesty" | "corsairs";
  /** syndicateRest: jump() skips the interest accrual all run. */
  interestHoliday?: boolean;
}

/** Chosen for even coverage of sweep seeds 1–100: every pool slot gets ≥13 seeds. */
const MODIFIER_SALT = 0x7007;

/** ⚙ corsairSeason: added to every lane's danger (effectiveDanger, events.ts). */
export const CORSAIR_DANGER_DELTA = 0.06;

// Pool order is load-bearing for the seed → modifier map recorded in the round plan;
// append new entries rather than reordering.
export const MODIFIER_POOL: readonly DailyModifier[] = [
  {
    id: "clearSkies",
    name: "Clear skies",
    glyph: "✨",
    bulletinLine: "TODAY: Clear skies — no modifier, pure trading",
  },
  {
    id: "ionStorms",
    name: "Ion storms",
    glyph: "⚡",
    fuelDelta: 1, // ⚙
    bulletinLine: "TODAY: Ion storms — every jump burns +1⛽",
  },
  {
    id: "luxuryBoom",
    name: "Luxury boom",
    glyph: "💎",
    priceMult: { node: "meridian", commodity: "luxury", mult: 1.25 }, // ⚙
    bulletinLine: "TODAY: Luxury boom — Meridian pays +25% for luxury",
  },
  {
    id: "partsGlut",
    name: "Parts glut",
    glyph: "⚙",
    priceMult: { node: "vulcan", commodity: "parts", mult: 0.8 }, // ⚙
    bulletinLine: "TODAY: Parts glut — Vulcan sells Machine Parts 20% off",
  },
  {
    id: "amnesty",
    name: "Pirate amnesty",
    glyph: "🕊",
    eventTweak: "amnesty",
    bulletinLine: "TODAY: Pirate amnesty — no ambushes, no salvage fields",
  },
  {
    id: "corsairSeason",
    name: "Corsair season",
    glyph: "☠",
    eventTweak: "corsairs",
    bulletinLine: "TODAY: Corsair season — every lane +6% raid risk",
  },
  {
    id: "syndicateRest",
    name: "Syndicate rest",
    glyph: "🏦",
    interestHoliday: true,
    bulletinLine: "TODAY: The Syndicate rests — no interest compounds",
  },
];

/** Today's sky — everyone flying `seed` shares it for all 12 days (spec decision 1). */
export function dailyModifier(seed: number): DailyModifier {
  return MODIFIER_POOL[hashSeed(seed, MODIFIER_SALT) % MODIFIER_POOL.length];
}

/** Extra fuel per jump under `seed`'s modifier — 0 on ordinary days. */
export function fuelDelta(seed: number): number {
  return dailyModifier(seed).fuelDelta ?? 0;
}

/** getPrice's modifier hook: the multiplier for (node, commodity) under `seed`, else 1. */
export function priceMultiplier(seed: number, node: NodeId, commodity: CommodityId): number {
  const m = dailyModifier(seed).priceMult;
  return m && m.node === node && m.commodity === commodity ? m.mult : 1;
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/engine/modifiers.test.ts` — expect PASS. If the seed-map test fails, STOP: the salt or pool order diverged from the plan's measured map — fix the code, not the test.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(m4): daily modifier pool + dailyModifier(seed) (E3-1a)"
```

---

### Task 2: `fuelCost`/`cheapestJumpCost` gain a seed — storm fuel everywhere

**Files:**

- Modify: `src/engine/world.ts` (`fuelCost` :70, `cheapestJumpCost` :82)
- Modify: `src/engine/economy.ts` (:129, :140), `src/engine/game.ts` (:525), `src/engine/missions.ts` (:55)
- Modify: `src/ui/screens.ts` (:87, :330, :335, :504), `src/ui/map.ts` (:77, :109)
- Modify: `src/sim/simulate.ts` (:38, :88, :90, :159), `tests/sim/bounce.test.ts` (:51, :75, :79)
- Test: `tests/engine/world.test.ts`, plus every test the compiler flags

- [ ] **Step 1: Write the failing tests** — in `tests/engine/world.test.ts`, replace the two `fuelCost` tests (:21–:27) with seed-aware versions and add the storm cases:

```ts
it("fuelCost is symmetric and positive between distinct nodes (clear-skies seed)", () => {
  expect(fuelCost(42, "terra", "kiruna")).toBe(fuelCost(42, "kiruna", "terra"));
  expect(fuelCost(42, "terra", "kiruna")).toBe(4); // the raw DISTANCE table
});

it("fuelCost from a node to itself is 0, even under ion storms", () => {
  expect(fuelCost(42, "terra", "terra")).toBe(0);
  expect(fuelCost(1, "terra", "terra")).toBe(0); // seed 1 = ionStorms
});

it("ion storms add fuelDelta to every jump and to the cheapest hop (E3-1)", () => {
  expect(fuelCost(1, "terra", "kiruna")).toBe(5); // 4 + 1
  expect(fuelCost(1, "kiruna", "meridian")).toBe(9); // 8 + 1
  expect(cheapestJumpCost(1, "terra")).toBe(4); // base 3 (terra–vulcan) + 1
  expect(cheapestJumpCost(42, "terra")).toBe(3); // clear skies unchanged
});
```

(Import `cheapestJumpCost` in that file's world import if not present.)

- [ ] **Step 2: Run** — `npx vitest run tests/engine/world.test.ts` — expect FAIL (TS: expected 2 args).

- [ ] **Step 3: Change the signatures.** In `src/engine/world.ts`, import the hook and rework the two functions:

```ts
import { fuelDelta } from "./modifiers";
```

```ts
export function fuelCost(seed: number, from: NodeId, to: NodeId): number {
  if (from === to) return 0;
  const d = DISTANCE[from][to];
  if (d === undefined) throw new Error(`No route ${from}->${to}`);
  return d + fuelDelta(seed); // E3-1: ion storms tax every jump, honestly, everywhere
}
```

```ts
export function cheapestJumpCost(seed: number, from: NodeId): number {
  return Math.min(...NODE_IDS.filter((n) => n !== from).map((n) => fuelCost(seed, from, n)));
}
```

Update the doc comments to mention the seed parameter.

- [ ] **Step 4: Walk the compiler.** Run `npx tsc --noEmit` and fix every flagged call site — each caller already holds a state or seed:

| Site                              | New call                                           |
| :-------------------------------- | :------------------------------------------------- |
| `economy.ts:129` (`escapeCost`)   | `cheapestJumpCost(state.seed, state.location)`     |
| `economy.ts:140` (`canEscape`)    | `cheapestJumpCost(state.seed, state.location)`     |
| `game.ts:525` (`jump`)            | `fuelCost(state.seed, state.location, to)`         |
| `missions.ts:55` (feasibility)    | `fuelCost(s.seed, s.location, m.destination)`      |
| `screens.ts:87` (`fuelWarnClass`) | `cheapestJumpCost(s.seed, s.location)`             |
| `screens.ts:330` (nav banner)     | `cheapestJumpCost(s.seed, s.location)`             |
| `screens.ts:335` (orb cost)       | `fuelCost(s.seed, s.location, n)`                  |
| `screens.ts:504` (`canReach`)     | `fuelCost(s.seed, s.location, m.destination)`      |
| `map.ts:77` (`nodeMarkup`)        | `fuelCost(s.seed, s.location, n)`                  |
| `map.ts:109` (lane label)         | `fuelCost(s.seed, s.location, other)`              |
| `simulate.ts:38` (`bestTrade`)    | `fuelCost(s.seed, s.location, to)`                 |
| `simulate.ts:88, :90` (fallback)  | `fuelCost(s.seed, s.location, a/b/to)`             |
| `simulate.ts:159` (`viableLoops`) | `fuelCost(seed, a, b)`                             |
| `bounce.test.ts:51, :75, :79`     | thread the loop's `seed` variable as the first arg |

Plus any other test the compiler flags (e.g. `missions.test.ts` if it calls `fuelCost` directly).

- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean, then `npm test`. Everything green: seed 42 and the sim's seeds 1–100 include storm seeds now, but fuel +1 does not break any behavioral assertion — if a sim gate trips here, STOP and check whether it is the thin cautious decay gate (expected to move only in Task 12; anything else is a real regression).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(m4): thread seed through fuelCost/cheapestJumpCost — storm fuel everywhere (E3-1)"
```

---

### Task 3: `getPrice` modifier hook

**Files:**

- Modify: `src/engine/world.ts` (`getPrice` :158)
- Test: `tests/engine/world.test.ts`

- [ ] **Step 1: Write the failing tests** — in `tests/engine/world.test.ts` (the band-mirror style the events tests use — `mulberry32`/`hashSeed` are exported):

```ts
import { mulberry32, hashSeed } from "../../src/engine/rng";
import { DEMAND_PRICE_MULTIPLIER, PRODUCE_PRICE_MULTIPLIER } from "../../src/engine/world";

describe("getPrice daily-modifier hook (E3-1)", () => {
  /** Mirror of getPrice's noise draw — exact, not approximate. */
  const noiseFor = (seed: number, day: number, node: string, commodity: string, vol: number) => {
    const rng = mulberry32(
      hashSeed(
        seed,
        day,
        node.length,
        commodity.length,
        node.charCodeAt(0),
        commodity.charCodeAt(0)
      )
    );
    return (rng() * 2 - 1) * vol;
  };

  it("luxury boom multiplies Meridian luxury by exactly 1.25 before rounding", () => {
    for (let day = 1; day <= 12; day++) {
      const noise = noiseFor(10, day, "meridian", "luxury", 0.6);
      const expected = Math.max(1, Math.round(480 * (1 + noise) * DEMAND_PRICE_MULTIPLIER * 1.25));
      expect(getPrice(10, day, "meridian", "luxury"), `day ${day}`).toBe(expected);
    }
  });

  it("parts glut multiplies Vulcan parts by exactly 0.8; other pairs untouched", () => {
    const noise = noiseFor(4, 3, "vulcan", "parts", 0.35);
    const expected = Math.max(1, Math.round(120 * (1 + noise) * PRODUCE_PRICE_MULTIPLIER * 0.8));
    expect(getPrice(4, 3, "vulcan", "parts")).toBe(expected);
    // Same seed, non-matching pair: plain formula.
    const waterNoise = noiseFor(4, 3, "vulcan", "water", 0.15);
    expect(getPrice(4, 3, "vulcan", "water")).toBe(
      Math.max(1, Math.round(20 * (1 + waterNoise) * DEMAND_PRICE_MULTIPLIER))
    );
  });

  it("clear-skies prices and baselinePrice are modifier-free", () => {
    const noise = noiseFor(42, 5, "meridian", "luxury", 0.6);
    expect(getPrice(42, 5, "meridian", "luxury")).toBe(
      Math.max(1, Math.round(480 * (1 + noise) * DEMAND_PRICE_MULTIPLIER))
    );
    expect(baselinePrice("meridian", "luxury")).toBe(672); // 480 × 1.4 — never modified
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/engine/world.test.ts -t "modifier hook"` — the boom/glut tests FAIL (multiplier missing), the clear-skies test passes.

- [ ] **Step 3: Implement.** In `src/engine/world.ts`, import `priceMultiplier` from `./modifiers` (extend the Task 2 import) and change `getPrice`'s return to:

```ts
return Math.max(
  1,
  Math.round(
    c.basePrice *
      (1 + noise) *
      stationPriceModifier(node, commodity) *
      priceMultiplier(seed, node, commodity) // E3-1: today's boom/glut, if any
  )
);
```

`baselinePrice` is deliberately untouched (spec decision 4) — mission premiums stay modifier-free; the E2-2c floor reads origin spot and can only rise.

- [ ] **Step 4: Verify** — `npm test`. Green expected: seed 42 fixtures are clearSkies; the sim's boom/glut seeds shift prices slightly but no behavioral gate keys on exact prices. Investigate any failure before touching thresholds.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(m4): getPrice daily boom/glut multiplier (E3-1)"
```

---

### Task 4: Syndicate rest — the interest holiday

**Files:**

- Modify: `src/engine/game.ts` (`jump` interest block :538, `interestForecast` :300)
- Test: `tests/engine/game.test.ts`

- [ ] **Step 1: Write the failing tests** — in `tests/engine/game.test.ts`:

```ts
describe("syndicateRest interest holiday (E3-1)", () => {
  // Seed 3 = syndicateRest, seed 42 = clearSkies (modifiers.test.ts pins both).
  it("accrues no interest across a full run on a rest seed", () => {
    let s = createGame(3);
    for (const to of ["vulcan", "terra", "vulcan", "terra", "vulcan", "terra"] as const) {
      s = refuel(s, 10);
      const r = jump(s, to);
      if (r.event === null) break;
      s = arrive(resolveChoice(r.state, r.event, r.event.choices[0].id)).state;
      if (s.status !== "playing") break;
    }
    expect(s.debt).toBe(STARTING.debt); // nothing compounded
    expect(interestForecast(createGame(3))).toBeNull();
  });

  it("clear-skies seeds accrue exactly as before", () => {
    expect(interestForecast(createGame(42))).toEqual({ inDays: 2, amount: 60 }); // day 1 → tick day 3, 4% of 1500
  });
});
```

(Import `STARTING`, `refuel`, `resolveChoice`, `arrive` as needed — most are already imported in this file.)

- [ ] **Step 2: Run** — `npx vitest run tests/engine/game.test.ts -t "syndicateRest"` — expect FAIL (debt grew / forecast non-null).

- [ ] **Step 3: Implement.** In `src/engine/game.ts`, import `dailyModifier` from `./modifiers`. Guard the accrual in `jump` (:538):

```ts
  // Interest accrues on a fixed cadence — unless today's sky is a Syndicate rest (E3-1).
  if (s.day % INTEREST_EVERY === 0 && s.debt > 0 && !dailyModifier(s.seed).interestHoliday) {
```

And in `interestForecast` (:301):

```ts
if (s.debt <= 0 || s.status !== "playing" || dailyModifier(s.seed).interestHoliday) return null;
```

- [ ] **Step 4: Verify** — `npm test` green.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(m4): syndicateRest skips interest accrual + forecast (E3-1)"
```

---

### Task 5: `pirateTail` state field + snapshot v5→v6

**Files:**

- Modify: `src/engine/types.ts` (GameState, after `costBasis` :132)
- Modify: `src/engine/game.ts` (`createGame` :70)
- Modify: `src/ui/storage.ts` (`RunSnapshot` :282, migration chain :520, version check :556, `isValidSnapshotState` :358)
- Modify: `src/main.ts` if it constructs a snapshot literal (grep `version: 5`)
- Modify: any `GameState` literal the compiler flags (known: `baseState` in `tests/engine/economy.test.ts`)
- Test: `tests/engine/game.test.ts`, `tests/ui/storage.test.ts`

- [ ] **Step 1: Write the failing tests.** In `tests/engine/game.test.ts`:

```ts
it("createGame starts untailed (E3-4)", () => {
  expect(createGame(42).pirateTail).toBe(false);
});
```

In `tests/ui/storage.test.ts`, mirror the v5 suite with the same valid-snapshot builder it uses:

```ts
describe("snapshot v6 (E3-4 pirate tail)", () => {
  it("migrates a v5 snapshot by defaulting pirateTail", () => {
    const snap = makeValidSnapshot(); // the suite's existing builder
    const doc = JSON.parse(JSON.stringify(snap));
    doc.version = 5;
    delete doc.state.pirateTail;
    const parsed = parseSnapshot(JSON.stringify(doc), doc.dateKey);
    expect(parsed).not.toBeNull();
    expect(parsed!.state.pirateTail).toBe(false);
  });

  it("round-trips a live tail", () => {
    const snap = makeValidSnapshot();
    snap.state = { ...snap.state, pirateTail: true };
    const parsed = parseSnapshot(JSON.stringify(snap), snap.dateKey);
    expect(parsed!.state.pirateTail).toBe(true);
  });

  it("rejects a non-boolean pirateTail", () => {
    const snap = makeValidSnapshot();
    const doc = JSON.parse(JSON.stringify(snap));
    doc.state.pirateTail = "yes";
    expect(parseSnapshot(JSON.stringify(doc), doc.dateKey)).toBeNull();
  });
});
```

(If the suite's builder is inline rather than a named helper, copy the minimal construction the v5 suite uses — do not hand-roll a new state shape.)

- [ ] **Step 2: Run** — `npx vitest run tests/engine/game.test.ts tests/ui/storage.test.ts` — expect FAIL.

- [ ] **Step 3: Implement.**

`src/engine/types.ts`, in `GameState` directly after the `costBasis` member:

```ts
/** A salvage scoop was bait (E3-4): the next jump's ambush odds carry TAIL_BONUS.
 *  Set by resolveSalvage, read by jump's event roll, cleared in the jump reset —
 *  boughtHere's lifecycle. */
pirateTail: boolean;
```

`src/engine/game.ts` `createGame`, after the `costBasis:` line:

```ts
    pirateTail: false,
```

`src/ui/storage.ts`:

1. `RunSnapshot` (:282): `version: 5` → `version: 6`.
2. New migration after `migrateV4Depth` (:421):

```ts
/** v5 → v6 (E3-4): pre-round runs carry no tail — default it. A resumed run
 *  silently starts untailed for the day. */
function migrateV5Tail(state: unknown): void {
  const st = state as { pirateTail?: unknown };
  if (typeof state === "object" && state !== null && st.pirateTail === undefined) {
    st.pirateTail = false;
  }
}
```

3. `SNAPSHOT_MIGRATIONS` (:520): append `[5, migrateV5Tail],` and extend the chain doc comment.
4. Version check (:556): `p.version !== 5` → `p.version !== 6`.
5. `isValidSnapshotState` (:358), beside the other field checks:

```ts
if (typeof st.pirateTail !== "boolean") return false;
```

- [ ] **Step 4: Fix compile errors** — `npx tsc --noEmit`; add `pirateTail: false,` to every flagged `GameState` literal (known: `baseState` in `tests/engine/economy.test.ts`; grep `costBasis: {` in tests for others). Grep `version: 5` in `src/main.ts` and bump any snapshot literal to 6.

- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean, `npm test` green (the field is inert so far).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(m4): pirateTail state field + snapshot v6 migration (E3-4 groundwork)"
```

---

### Task 6: `effectiveDanger` — amnesty, corsairs, tail, and long-haul salvage in the event roll

**Files:**

- Modify: `src/engine/world.ts` (add `isLongHaul` + `LONG_HAUL_FUEL`)
- Modify: `src/engine/events.ts` (`pirateChance` :13, `rollEvent` :21)
- Modify: `src/engine/game.ts` (`jump` :552 passes the tail)
- Modify: `src/ui/screens.ts` (:337), `src/ui/map.ts` (:104)
- Test: `tests/engine/events.test.ts`, `tests/engine/world.test.ts`

- [ ] **Step 1: Write the failing tests.** In `tests/engine/world.test.ts`:

```ts
it("isLongHaul marks exactly the two 7–8⛽ lanes, by the base table (E3-2)", () => {
  expect(isLongHaul("kiruna", "verge")).toBe(true); // 7⛽
  expect(isLongHaul("kiruna", "meridian")).toBe(true); // 8⛽
  expect(isLongHaul("meridian", "kiruna")).toBe(true); // symmetric
  expect(isLongHaul("terra", "verge")).toBe(false); // 6⛽ — storms don't promote it
});
```

In `tests/engine/events.test.ts`, replace the `pirateChance` suite (:43–:54) — it now takes a state — and add the modifier/tail cases. Add imports: `effectiveDanger` from events, `createGame` from game, `GameState`/`NodeId` from types:

```ts
const at = (seed: number, location: NodeId, pirateTail = false): GameState => ({
  ...createGame(seed),
  location,
  pirateTail,
});

describe("pirateChance (E1-4 honest danger — per-lane, modifier- and tail-aware)", () => {
  it("clear-skies chances are the authored lane table", () => {
    expect(pirateChance(at(42, "terra"), "kiruna")).toBeCloseTo(0.05);
    expect(pirateChance(at(42, "terra"), "verge")).toBeCloseTo(0.25);
    expect(pirateChance(at(42, "kiruna"), "verge")).toBeCloseTo(0.3);
  });

  it("corsair season adds CORSAIR_DANGER_DELTA to every lane", () => {
    expect(pirateChance(at(6, "terra"), "kiruna")).toBeCloseTo(0.11); // 0.05 + 0.06
    expect(pirateChance(at(6, "kiruna"), "verge")).toBeCloseTo(0.36);
  });

  it("amnesty zeroes every lane, tail or no tail", () => {
    expect(pirateChance(at(9, "terra"), "verge")).toBe(0);
    expect(pirateChance(at(9, "terra", true), "verge")).toBe(0);
  });

  it("a pirate tail adds TAIL_BONUS, capped at DANGER_CAP", () => {
    expect(pirateChance(at(42, "terra", true), "kiruna")).toBeCloseTo(0.4); // 0.05 + 0.35
    expect(effectiveDanger(42, "kiruna", "verge", true)).toBeCloseTo(0.65); // 0.3 + 0.35
    expect(effectiveDanger(6, "kiruna", "verge", true)).toBeCloseTo(0.71); // + corsairs
  });
});
```

Then update the band-mirror suite (:82–:99): its expected-kind computation must mirror the new bands exactly —

```ts
const pPirates = effectiveDanger(seed, from, to, false);
const amnesty = dailyModifier(seed).eventTweak === "amnesty";
const salvageBand = amnesty ? 0 : isLongHaul(from, to) ? LONG_HAUL_SALVAGE_BAND : SALVAGE_BAND;
const pSalvage = pPirates + salvageBand;
```

(keep the rest of the mirror as-is, updating `rollEvent` calls to pass `false` for the tail), and add two targeted band tests:

```ts
it("amnesty seeds roll neither pirates nor salvage on any lane or day", () => {
  for (let day = 1; day <= 60; day++) {
    for (const to of ["kiruna", "verge", "meridian"] as const) {
      const kind = rollEvent(9, day, "terra", to, false).kind;
      expect(kind).not.toBe("pirates");
      expect(kind).not.toBe("salvage");
    }
  }
});

it("long-haul lanes double the salvage band; short lanes keep 0.18", () => {
  let long = 0;
  let short = 0;
  for (let day = 1; day <= 400; day++) {
    if (rollEvent(42, day, "kiruna", "verge", false).kind === "salvage") long++;
    if (rollEvent(42, day, "terra", "kiruna", false).kind === "salvage") short++;
  }
  expect(long).toBeGreaterThan(short); // 0.36 band vs 0.18 over the same 400 rolls
});
```

Finally update every other `rollEvent(...)` call in this test file to pass a trailing `false`.

- [ ] **Step 2: Run** — `npx vitest run tests/engine/events.test.ts tests/engine/world.test.ts` — expect FAIL (signatures).

- [ ] **Step 3: Implement.**

`src/engine/world.ts` (beside the DISTANCE helpers — plan-time deviation: lives here, not events.ts, to avoid an import cycle):

```ts
/** ⚙ Base-table fuel at or above this marks a lane long-haul (E3-2) — the storm
 *  modifier does not promote 6⛽ lanes; the incentive is about the map's dead
 *  edges, not today's weather. */
export const LONG_HAUL_FUEL = 7;

/** True for the map's long-haul lanes (kiruna–verge, kiruna–meridian today). */
export function isLongHaul(from: NodeId, to: NodeId): boolean {
  if (from === to) return false;
  const d = DISTANCE[from][to];
  if (d === undefined) throw new Error(`No route ${from}->${to}`);
  return d >= LONG_HAUL_FUEL;
}
```

`src/engine/events.ts` — imports gain `GameState` (types), `isLongHaul` (world), `CORSAIR_DANGER_DELTA, dailyModifier` (modifiers). Replace `pirateChance` and the band block:

```ts
export const DANGER_CAP = 0.9; // ⚙ ambush odds ceiling, whatever stacks
export const TAIL_BONUS = 0.35; // ⚙ E3-4: added to the jump after a bait scoop
export const SALVAGE_BAND = 0.18;
export const LONG_HAUL_SALVAGE_BAND = 0.36; // ⚙ E3-2: exactly double on 7–8⛽ lanes

/**
 * The one ambush-odds formula (E1-4): lane table + today's modifier + the bait tail,
 * clamped to [0, DANGER_CAP]. Amnesty wins every stacking question by zeroing the band.
 * rollEvent rolls on this and pirateChance re-exports it, so no surface can show a
 * number the engine won't roll.
 */
export function effectiveDanger(seed: number, from: NodeId, to: NodeId, tailed: boolean): number {
  const m = dailyModifier(seed);
  if (m.eventTweak === "amnesty") return 0;
  const corsair = m.eventTweak === "corsairs" ? CORSAIR_DANGER_DELTA : 0;
  return Math.min(DANGER_CAP, laneDanger(from, to) + corsair + (tailed ? TAIL_BONUS : 0));
}

/**
 * True chance of a pirate ambush on the next jump out of `s.location` — the exact
 * band rollEvent uses, including today's modifier and any live bait tail (E3-4).
 */
export function pirateChance(s: GameState, to: NodeId): number {
  return effectiveDanger(s.seed, s.location, to, s.pirateTail);
}
```

In `rollEvent`, change the signature to `(seed, day, from, to, tailed: boolean)` and the band block to:

```ts
// Probability bands grow the hostile slice with danger. Amnesty (E3-1) empties both
// hostile bands; long-haul lanes (E3-2) double the salvage slice.
const amnesty = dailyModifier(seed).eventTweak === "amnesty";
const pPirates = effectiveDanger(seed, from, to, tailed);
const salvageBand = amnesty ? 0 : isLongHaul(from, to) ? LONG_HAUL_SALVAGE_BAND : SALVAGE_BAND;
const pSalvage = pPirates + salvageBand;
```

(The rng creation and the `v` variant draw are untouched — clearSkies/untailed/short-lane rolls stay byte-identical.)

Callers:

- `game.ts:552`: `rollEvent(s.seed, s.day, state.location, to, state.pirateTail)`
- `screens.ts:337`: `Math.round(pirateChance(s, n) * 100)`
- `map.ts:104`: `pirateChance(s, other)`

- [ ] **Step 4: Verify** — `npx tsc --noEmit` clean, then `npm test`. `tests/ui/map.test.ts` and `tests/ui/screens.test.ts` may flag raid-% strings for corsair/amnesty seeds — those tests build states from `createGame(seed)`; keep their seeds on clearSkies (42) or update expected strings from the new formula. Investigate anything else.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(m4): effectiveDanger — amnesty/corsair modifiers, tail bonus, long-haul salvage band (E3-1/E3-2/E3-4)"
```

---

### Task 7: The bait roll — scoop, announce, clear on jump

**Files:**

- Modify: `src/engine/preview.ts` (constants :35–:37, `choiceOdds` :115)
- Modify: `src/engine/game.ts` (`resolveSalvage` :606, `jump` reset :528)
- Test: `tests/engine/game.test.ts`, `tests/engine/preview.test.ts`

- [ ] **Step 1: Write the failing tests.** In `tests/engine/game.test.ts` (fixture days from the plan header: seed 42 — hazard 1,2,4,11; clean+bait 8,12; clean no-bait 3,5,6,7,9,10):

```ts
describe("salvage bait (E3-4)", () => {
  const collect = (seed: number, day: number, extra: Partial<GameState> = {}) => {
    const s = { ...createGame(seed), day, ...extra };
    const e = { kind: "salvage", title: "", description: "", choices: [] } as GameEvent;
    return resolveChoice(s, e, "collect");
  };

  it("a clean scoop on a bait day latches the tail and says so", () => {
    const s = collect(42, 8);
    expect(s.pirateTail).toBe(true);
    expect(s.cargo.parts).toBeGreaterThan(0); // the scoop itself still happened
    expect(s.log[s.log.length - 1].msg).toContain("bait");
    expect(s.log[s.log.length - 1].tone).toBe("bad");
  });

  it("a clean scoop on a no-bait day stays untailed", () => {
    expect(collect(42, 5).pirateTail).toBe(false);
  });

  it("the warhead outcome never also rolls bait — no pile-ons", () => {
    const s = collect(42, 4); // hazard day
    expect(s.pirateTail).toBe(false);
    expect(s.hull).toBeLessThan(100);
  });

  it("a full hold scoops nothing and draws no tail, even on a bait day", () => {
    const s = collect(42, 8, { cargo: { water: 30, parts: 0, luxury: 0 } });
    expect(s.pirateTail).toBe(false);
  });

  it("jump clears the tail, fired or not", () => {
    const tailed = { ...createGame(42), pirateTail: true, fuel: 16 };
    const r = jump(tailed, "vulcan");
    expect(r.state.pirateTail).toBe(false);
  });
});
```

In `tests/engine/preview.test.ts`, extend the salvage odds assertion:

```ts
it("salvage odds name both the hazard and the bait draw (E3-4)", () => {
  const e = { kind: "salvage", title: "", description: "", choices: [] } as GameEvent;
  expect(choiceOdds(e).collect).toBe("1-in-3 hides a hazard · clean scoop: 1-in-4 is bait");
});
```

(Adjust the existing salvage-odds expectation in that file to the new string.)

- [ ] **Step 2: Run** — expect FAIL (`pirateTail` never set; odds string short).

- [ ] **Step 3: Implement.**

`src/engine/preview.ts`, beside `SALVAGE_HAZARD_DIVISOR`:

```ts
/** A clean scoop draws a pirate tail on 1-in-N days (game.ts resolveSalvage's `% N`). */
export const SALVAGE_BAIT_DIVISOR = 4; // ⚙ E3-4
```

and in `choiceOdds`:

```ts
    case "salvage":
      return {
        collect: `1-in-${SALVAGE_HAZARD_DIVISOR} hides a hazard · clean scoop: 1-in-${SALVAGE_BAIT_DIVISOR} is bait`,
      };
```

`src/engine/game.ts` — import `SALVAGE_BAIT_DIVISOR` from `./preview`, add near `resolveSalvage`:

```ts
/** Salts the bait draw so it is independent of the same-day hazard draw (E3-4). */
const BAIT_SALT = 0xba17;
```

Rewrite `resolveSalvage`:

```ts
function resolveSalvage(s: GameState, choiceId: string): GameState {
  if (choiceId !== "collect") return s;
  // Deterministic per seed/day via the shared hash — mulberry32's hashSeed avoids the
  // strict every-3rd-day periodicity a raw `(day*7+seed) % 3` produces (B-2 class).
  if (hashSeed(s.seed, s.day) % SALVAGE_HAZARD_DIVISOR === 0) {
    return withLog(
      withHullDamage(s, SALVAGE_TRAP_DAMAGE),
      `Salvage hid a live warhead: -${SALVAGE_TRAP_DAMAGE} hull.`,
      "bad"
    );
  }
  const got = salvageAmount(s);
  if (got <= 0) return withLog(s, `Hold full — left the salvage drifting.`, "neutral");
  let next = withLog(
    trackFullHold({ ...s, cargo: { ...s.cargo, parts: s.cargo.parts + got } }),
    `Salvaged ${got} ${commodityName("parts")}.`,
    "good"
  );
  // E3-4: a clean scoop is seeded 1-in-SALVAGE_BAIT_DIVISOR to be bait — announced
  // immediately, so the tail is a navigation decision, not a gotcha. Every raid %
  // shown until the next jump includes TAIL_BONUS (effectiveDanger). The warhead
  // path above never reaches this roll: no pile-ons on the victim.
  if (hashSeed(s.seed, s.day, BAIT_SALT) % SALVAGE_BAIT_DIVISOR === 0) {
    next = withLog(
      { ...next, pirateTail: true },
      `That debris was bait — a pirate tail swings in behind you.`,
      "bad"
    );
  }
  return next;
}
```

In `jump`'s state reset (:528, beside `soldHere`):

```ts
    pirateTail: false, // E3-4: the tail lasts exactly one jump, fired or not
```

(`rollEvent` already receives `state.pirateTail` — the _pre-jump_ state — from Task 6, so the read happens before this reset by construction.)

- [ ] **Step 4: Verify** — `npm test` green. The sim's greedy persona now collects bait-tailed salvage; the death-rate band (10–40) has room (currently 26) — investigate if it trips.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(m4): salvage bait — seeded 1-in-4 tail on clean scoops, cleared on jump (E3-4)"
```

---

### Task 8: Ice runs — the tagged long-haul contract

**Files:**

- Modify: `src/engine/types.ts` (`Mission` :22)
- Modify: `src/engine/missions.ts` (`generateMissions` :13)
- Modify: `src/ui/storage.ts` (`hasValidMissionFields` :487)
- Test: `tests/engine/missions.test.ts`, `tests/ui/storage.test.ts`

- [ ] **Step 1: Write the failing tests.** In `tests/engine/missions.test.ts` (fixture: seed 42 ice days are 9 and 11; day 3 is not one):

```ts
describe("ice runs (E3-2b)", () => {
  it("iceRunDay matches the seeded cadence", () => {
    expect(iceRunDay(42, 9)).toBe(true);
    expect(iceRunDay(42, 11)).toBe(true);
    expect(iceRunDay(42, 3)).toBe(false);
  });

  it("posts exactly one tagged water→Verge contract at Kiruna on an ice day", () => {
    const board = generateMissions(42, 9, "kiruna");
    const ice = board.filter((m) => m.tag === "ice");
    expect(ice).toHaveLength(1);
    expect(ice[0]).toMatchObject({ commodity: "water", destination: "verge" });
    expect(ice[0].id).toBe("kiruna-9-ice");
    expect(ice[0].qty).toBeGreaterThanOrEqual(10);
    expect(ice[0].qty).toBeLessThanOrEqual(14);
    expect(ice[0].deadlineDay).toBeGreaterThanOrEqual(11); // day + 2
    expect(ice[0].deadlineDay).toBeLessThanOrEqual(12); // day + 3
    expect(ice[0].deposit).toBe(Math.round(0.1 * ice[0].reward));
    // Long-haul premium: ≥ 2.4 × destination base (20cr) per unit.
    expect(ice[0].reward).toBeGreaterThanOrEqual(Math.round(ice[0].qty * 20 * 2.4));
  });

  it("no ice run off-cadence, at other stations, and no disturbance to the base board", () => {
    expect(generateMissions(42, 3, "kiruna").some((m) => m.tag === "ice")).toBe(false);
    expect(generateMissions(42, 9, "terra").some((m) => m.tag === "ice")).toBe(false);
    // The appended stream leaves the base draws byte-identical: the boards with and
    // without the ice run share their untagged prefix.
    const withIce = generateMissions(42, 9, "kiruna").filter((m) => m.tag !== "ice");
    expect(withIce.length).toBeGreaterThanOrEqual(1);
    expect(withIce.length).toBeLessThanOrEqual(3);
    expect(withIce.every((m) => m.id.startsWith("kiruna-9-") && !m.id.endsWith("ice"))).toBe(true);
  });
});
```

In `tests/ui/storage.test.ts`, in the v6 suite from Task 5:

```ts
it("accepts a stored ice-run mission and rejects an unknown tag", () => {
  const snap = makeValidSnapshot();
  const mission = {
    id: "kiruna-9-ice",
    commodity: "water",
    qty: 12,
    destination: "verge",
    reward: 700,
    deposit: 70,
    deadlineDay: 11,
    tag: "ice",
  };
  snap.state = { ...snap.state, activeMissions: [mission] };
  expect(parseSnapshot(JSON.stringify(snap), snap.dateKey)).not.toBeNull();
  const bad = JSON.parse(JSON.stringify(snap));
  bad.state.activeMissions[0].tag = "banana";
  expect(parseSnapshot(JSON.stringify(bad), bad.dateKey)).toBeNull();
});
```

- [ ] **Step 2: Run** — expect FAIL (`iceRunDay`/`tag` missing).

- [ ] **Step 3: Implement.**

`src/engine/types.ts`, in `Mission` after `deposit`:

```ts
  /** "ice" marks the seeded long-haul special (E3-2b); absent on ordinary offers. */
  tag?: "ice";
```

`src/engine/missions.ts`:

```ts
export const ICE_RUN_CADENCE = 3; // ⚙ E3-2b: roughly every third day posts an ice run
const ICE_SALT = 0x1ce0;

/** True when `day`'s Kiruna board carries the seeded ice run (E3-2b). */
export function iceRunDay(seed: number, day: number): boolean {
  return hashSeed(seed, day, ICE_SALT) % ICE_RUN_CADENCE === 0;
}
```

and at the end of `generateMissions`, before `return missions;`:

```ts
// E3-2b: on ice-run days Kiruna's board carries one extra long-haul contract from its
// OWN rng stream — the draws above are byte-identical to pre-round boards.
if (node === "kiruna" && iceRunDay(seed, day)) {
  const ice = mulberry32(hashSeed(seed, day, ICE_SALT, 1));
  const qty = 10 + Math.floor(ice() * 5); // 10..14
  // ⚙ long-haul premium: ~2× a normal offer's 1.3–1.7 band, pricing the 7⛽ burn
  // and the 30% lane. Anchored to the modifier-free destination base (E2-2f).
  const premium = Math.round(baselinePrice("verge", "water") * qty * (2.4 + ice() * 0.6));
  const originUnit = getPrice(seed, day, node, "water");
  const reward = Math.max(premium, Math.round(MISSION_REWARD_FLOOR_MULT * qty * originUnit));
  missions.push({
    id: `${node}-${day}-ice`,
    commodity: "water",
    qty,
    destination: "verge",
    reward,
    deposit: Math.round(MISSION_DEPOSIT_RATE * reward),
    deadlineDay: day + 2 + Math.floor(ice() * 2), // +2..3 — a run, not an errand
    tag: "ice",
  });
}
```

`src/ui/storage.ts` `hasValidMissionFields` — extend the `every` predicate:

```ts
const MISSION_NUMERIC_KEYS = ["deposit", "reward", "qty"];
function hasValidMissionFields(missions: unknown): boolean {
  return (
    Array.isArray(missions) &&
    missions.every((m) => {
      if (!allNonNegativeNumbers(m, MISSION_NUMERIC_KEYS)) return false;
      // E3-2b: the only tag this build writes is "ice" — reject anything else.
      const tag = (m as { tag?: unknown }).tag;
      return tag === undefined || tag === "ice";
    })
  );
}
```

- [ ] **Step 4: Verify** — `npm test` green (the appended mission changes no existing draw; `missionFeasibility` prices it like any offer).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(m4): seeded ice-run contracts at Kiruna — tagged, own rng stream (E3-2b)"
```

---

### Task 9: Bulletin — the TODAY line and the ice-run notice

**Files:**

- Modify: `src/engine/bulletin.ts` (:31)
- Test: `tests/engine/bulletin.test.ts`

- [ ] **Step 1: Write the failing tests** — in `tests/engine/bulletin.test.ts` (seed 42 has no day-1 ice run; seed 5 does — plan header fixtures; both are clearSkies):

```ts
it("leads with the modifier's TODAY line (E3-1)", () => {
  expect(bulletin(42)[0]).toBe(dailyModifier(42).bulletinLine);
  expect(bulletin(9)[0]).toContain("Pirate amnesty");
});

it("appends the ice-run notice exactly when day 1 posts one (E3-2b)", () => {
  expect(iceRunDay(5, 1)).toBe(true); // fixture guard
  expect(iceRunDay(42, 1)).toBe(false);
  const withIce = bulletin(5);
  expect(withIce).toHaveLength(5);
  expect(withIce[4]).toBe("❄ Ice run posted at Kiruna Belt — the Verge pays for water");
  expect(bulletin(42)).toHaveLength(4);
});

it("every line keeps the ≤70-char ticker budget", () => {
  for (const seed of [1, 3, 4, 5, 6, 9, 10, 42]) {
    for (const line of bulletin(seed)) expect(line.length, line).toBeLessThanOrEqual(70);
  }
});
```

Update any existing assertion that pins the line count to 3 or indexes lines 0–2 (they shift down one).

- [ ] **Step 2: Run** — expect FAIL (3 lines, no TODAY).

- [ ] **Step 3: Implement.** In `src/engine/bulletin.ts`, import `dailyModifier` from `./modifiers` and `iceRunDay` from `./missions`; change the return to:

```ts
return [
  dailyModifier(seed).bulletinLine, // E3-1: the day's personality leads
  `${commodityName(glut.commodity)} glut at ${NODES[glut.node].name} — buying at ${glut.price}cr`,
  `${NODES[premium.node].name} pays ${premium.price}cr for ${commodityName(premium.commodity)} — ${taxNote}`,
  `${capFirst(crewName(seed))} chatter thick on the ${NODES[riskA].name}–${NODES[riskB].name} lane`,
  // E3-2b: day 1 is the bulletin's grid — flag its ice run so the dead-edge content
  // is discoverable without docking at Kiruna. Later days' boards speak for themselves.
  ...(iceRunDay(seed, 1) ? ["❄ Ice run posted at Kiruna Belt — the Verge pays for water"] : []),
];
```

Update the module doc comment (the bulletin is now 4–5 lines).

- [ ] **Step 4: Verify** — `npm test` green (screens tests render the bulletin — update any snapshot-ish string assertions the extra line shifts).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(m4): bulletin leads with the TODAY modifier line + ice-run notice (E3-1b/E3-2b)"
```

---

### Task 10: Station-screen surfaces — modifier chip, tail banner, salvage-rich lanes, ❄ prefix

**Files:**

- Modify: `src/ui/screens.ts` (`screenHead` :101, `navigatorPanel` :328, `tradeHubPanel` offer cards :450)
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing tests** — in `tests/ui/screens.test.ts`, following the file's string-assertion style (build states via `createGame`; render `stationScreen(s)`):

```ts
describe("M4 round 1 station surfaces", () => {
  it("the screen head names the day's modifier (E3-1b)", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain("✨ Clear skies");
    expect(stationScreen(createGame(1))).toContain("⚡ Ion storms");
  });

  it("a live tail shows the Navigator banner; untailed shows none (E3-4)", () => {
    const tailed = { ...createGame(42), pirateTail: true };
    expect(stationScreen(tailed)).toContain("Pirate tail");
    expect(stationScreen(createGame(42))).not.toContain("Pirate tail");
  });

  it("long-haul orbs are named salvage-rich from Kiruna (E3-2a)", () => {
    const atKiruna = { ...createGame(42), location: "kiruna" as const };
    const html = stationScreen(atKiruna);
    expect(html).toContain("salvage-rich lane");
    // Terra is 4⛽ from Kiruna — its orb detail must not carry the mark. The mark
    // appears once per long-haul orb (verge + meridian), in tooltip and sr-only text.
    expect(html.match(/salvage-rich lane/g)!.length).toBe(4); // 2 orbs × (tip + sr-only)
  });

  it("ice-run offers carry the ❄ prefix (E3-2b)", () => {
    const atKirunaIceDay = { ...createGame(42), location: "kiruna" as const, day: 9 };
    expect(stationScreen(atKirunaIceDay)).toContain("❄ ICE RUN — Deliver");
  });
});
```

- [ ] **Step 2: Run** — expect FAIL.

- [ ] **Step 3: Implement** in `src/ui/screens.ts` (import `dailyModifier` from `../engine/modifiers` and `isLongHaul` from `../engine/world`):

`screenHead` — build the chip once and append to both `sub` branches:

```ts
const mod = dailyModifier(s.seed);
const modChip = ` · ${mod.glyph} ${mod.name}`; // E3-1b: the day's personality, all run
```

```ts
const sub = meta
  ? `${NODES[s.location].name} · Day ${s.day}/${RUN_LENGTH} · Starlight #${meta.runNumber} · ${meta.dateLabel} · ${meta.runLabel}${modChip}`
  : `${NODES[s.location].name} · Day ${s.day}/${RUN_LENGTH}${dateLabel ? ` · ${dateLabel}` : ""}${modChip}`;
```

`navigatorPanel` — tail banner beside the fuel banner, and the salvage-rich mark in the orb detail:

```ts
const tailBanner = s.pirateTail
  ? `<div class="st-badge st-badge--alert nav-warning" role="status">⚠ Pirate tail — raid risk up on every lane until you jump.</div>`
  : "";
```

(render it directly after `banner` in the panel body: `` `${banner}${tailBanner}${starMap(s)}…` ``), and inside the orb map:

```ts
const salvageNote = isLongHaul(s.location, n) ? " · salvage-rich lane" : "";
const detail = `${cost} fuel · dock ${cr(fee)} · ${raid}% raid risk · sells taxed ${taxPct}%${customsNote}${salvageNote}`;
```

`tradeHubPanel` offer cards — prefix the offer line:

```ts
const icePrefix = m.tag === "ice" ? "❄ ICE RUN — " : ""; // E3-2b
return `<li>${icePrefix}Deliver ${m.qty} ${commodityName(m.commodity)} → ${NODES[m.destination].name} by day ${m.deadlineDay} · reward ${cr(m.reward)}<br>${feasibility}
      ${action}</li>`;
```

- [ ] **Step 4: Verify** — `npm test` green (existing screens tests may pin the old sub-line — update them with the chip).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(m4): station surfaces — modifier chip, tail banner, salvage-rich lanes, ice-run prefix"
```

---

### Task 11: Share card carries the day's modifier

**Files:**

- Modify: `src/ui/share.ts` (`ShareData` :95, `shareText` :112)
- Modify: `src/main.ts` (the ShareData construction — grep `shareText(` / `copyShare(`)
- Test: `tests/engine/share.test.ts`

- [ ] **Step 1: Write the failing test** — in `tests/engine/share.test.ts`, extend the existing `shareText` fixture object with `modifier: "⚡ Ion storms"` and assert:

```ts
it("line 1 carries the day's modifier tag (E3-1b)", () => {
  const text = shareText({ ...baseShareData, modifier: "⚡ Ion storms" });
  expect(text.split("\n")[0]).toContain("· ⚡ Ion storms");
});
```

(`baseShareData` = whatever complete fixture the file already builds; add `modifier` to it, and update any exact-string expectations for line 1.)

- [ ] **Step 2: Run** — expect FAIL (TS: `modifier` unknown / string mismatch).

- [ ] **Step 3: Implement.** In `src/ui/share.ts`:

```ts
/** "{glyph} {name}" of the day's modifier (E3-1b) — the card's built-in excuse/brag. */
modifier: string;
```

(added to `ShareData`), and line 1 of `shareText`:

```ts
    `🚀 Starlight #${d.runNumber} · ${d.dateLabel} · ${d.label} · ${d.modifier}`,
```

In `src/main.ts`, find the ShareData construction (grep `copyShare(` / `shareText(`) and add, importing `dailyModifier` from `./engine/modifiers`:

```ts
    modifier: `${dailyModifier(state.seed).glyph} ${dailyModifier(state.seed).name}`,
```

(hoist `const mod = dailyModifier(state.seed);` if it reads better in context).

- [ ] **Step 4: Verify** — `npm test` green; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(m4): share card line 1 carries the daily modifier tag (E3-1b)"
```

---

### Task 12: Sim gates — tails observability, per-modifier fairness, re-recorded thresholds

**Files:**

- Modify: `src/sim/simulate.ts` (`SimResult` :19, `runArchetype` :71, `ArchetypeSummary` :167, `sweepSummary` :178)
- Modify: `tests/sim/simulate.test.ts`
- Test: `tests/sim/simulate.test.ts`

- [ ] **Step 1: Add tails observability.** In `src/sim/simulate.ts`:

`SimResult` gains:

```ts
/** Bait tails latched during the run (E3-4) — observability for the death-rate split. */
tails: number;
```

In `runArchetype`, track a counter: declare `let tails = 0;` beside `const candidates`, and after **each** of the two `resolveChoice` calls add:

```ts
if (s.pirateTail) tails++;
```

Thread it out: `toResult(s)` becomes `toResult(s, tails)` with the extra field, and `ArchetypeSummary` gains `tailsSum: number` (initialize 0, add `sum.tailsSum += r.tails;` in the loop).

- [ ] **Step 2: Add the fairness gate** — in `tests/sim/simulate.test.ts` (import `dailyModifier` from `../../src/engine/modifiers`):

```ts
describe("per-modifier fairness (E3-1 acceptance)", () => {
  it("no modifier day-type drops cautious+balanced audit rate below 90%", () => {
    const bySlot = new Map<string, number[]>();
    for (const seed of SEEDS) {
      const id = dailyModifier(seed).id;
      if (!bySlot.has(id)) bySlot.set(id, []);
      bySlot.get(id)!.push(seed);
    }
    expect(bySlot.size).toBe(7); // salt 0x7007 covers the pool over seeds 1–100
    for (const [id, seeds] of bySlot) {
      let audited = 0;
      let total = 0;
      for (const kind of ["cautious", "balanced"] as Archetype[]) {
        for (const seed of seeds) {
          total++;
          if (runArchetype(kind, seed).status === "audited") audited++;
        }
      }
      expect(audited / total, id).toBeGreaterThanOrEqual(0.9); // ⚙
    }
  });
});
```

- [ ] **Step 3: Run the full sim suite and record.** `npx vitest run tests/sim/` — then record the new sweep numbers by running:

```bash
npx vite-node -e "import('./src/sim/simulate').then(m => console.log(JSON.stringify(m.sweepSummary(Array.from({length:100},(_,i)=>i+1)), null, 2)))"
```

(or an equivalent scratch script). Expected movements vs the plan-header table: cautious `netWorthSum` **rises** (amnesty saves tolls, syndicateRest saves interest on ~26 seeds); greedy `lost` rises a few (bait + corsairs, minus amnesty).

- [ ] **Step 4: Re-record the decay thresholds honestly.** In `tests/sim/simulate.test.ts`:

- If the cautious gate (`≤ base.cautious.netWorthSum − 5_000`, i.e. ≤ −195,880) now fails, replace it with the gate's spirit against the fixture — cautious must stay strictly below the pre-depth baseline — and pin the measured value in the comment:

```ts
// Re-anchored for M4 r1: amnesty (no tolls) and syndicateRest (no interest) legitimately
// lift cautious on ~26 of 100 seeds, eating the old −5k margin. The load-bearing claim
// stays: depth keeps the water turtle below its pre-depth earnings. Measured post-M4r1:
// <RECORD the sweep number here>.
it("the water turtle stays below its pre-depth baseline", () => {
  expect(post.cautious.netWorthSum).toBeLessThan(base.cautious.netWorthSum);
});
```

- The balanced gates (`< base` and `≥ 0.55 × base`) have ~216k of headroom — leave them; investigate if either trips (that is a real regression, not modifier drift).
- The greedy death band (10–40) has headroom from 26 — if it exceeds 40, the ⚙ knobs to pull, in order: `SALVAGE_BAIT_DIVISOR` 4 → 5, then `TAIL_BONUS` 0.35 → 0.3, then `CORSAIR_DANGER_DELTA` 0.06 → 0.05. Re-run after each change; record the final knob values and the sweep numbers in this test file's comments **and** in the plan on land.
- If the fairness gate fails for one modifier group, the same knob table applies (amnesty/rest groups cannot fail — they only help; the risk groups are corsairSeason and ionStorms).

- [ ] **Step 5: Verify the whole suite** — `npm test` fully green, including `viableLoops ≥ 2` (now measuring modifier-aware fuel and prices) and the bounce gate.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(m4): sim gates — tails observability, per-modifier fairness, re-anchored decay thresholds"
```

---

### Task 13: Round close — verification, docs, and the E1-5 ruling

**Files:**

- Modify: `docs/ROADMAP.md`, `docs/ENGAGEMENT_BACKLOG.md`, the spec (deviation note), this plan (final knob values)

- [ ] **Step 1: Full verification.**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

All four green. (Lighthouse runs in CI on push — static additions only this round.)

- [ ] **Step 2: Tick the docs.**

- `docs/ROADMAP.md`: mark E3-1, E3-2, E3-4 ✅ **Shipped <date>** in the Milestone 4 table with one-line summaries (mirror the M3 row style); add an M4 progress note above the table ("Round 1 closed <date>: E3-1 + E3-2 + E3-4 …").
- `docs/ENGAGEMENT_BACKLOG.md`: update rows E3-1, E3-2, E3-4 to ✅ shipped with the same phrasing style as E2-x rows; update the header triage summary (line 12).
- Spec: record the `LONG_HAUL_FUEL`-in-world.ts deviation and the final ⚙ knob values under a "## Deviations & final knobs" section.
- This plan: fill the recorded sweep numbers into Task 12's placeholders.

- [ ] **Step 3: The E1-5 heat gate (requires the user).** The roadmap defers Heat behind "add only if the endgame is still flat". This round added late-run pressure (bait tails, corsair days). **Ask the user to playtest a few dailies, then record their ruling** — a dated line in ROADMAP.md's Deferred table ("Ruled <kept deferred | promoted to M4 round 2> on <date> after M4 r1 playtest") — do not decide this in-code.

- [ ] **Step 4: Close-out commit + merge.**

```bash
git add -A && git commit -m "feat(m4): close round 1 — No Two Days Alike (E3-1 + E3-2 + E3-4)"
```

Then follow superpowers:finishing-a-development-branch to merge `feat/m4-round1-no-two-days-alike` into `master`.

---

## Self-review notes (already applied)

- **Spec coverage:** decisions 1–13 map to Tasks 1 (D1, D2), 2 (D3), 3 (D4), 4 (D11), 5 (D9), 6 (D5, D6), 7 (D8, D10), 8 (D7), 9–11 (D12), 12 (D13), 13 (close-out). The spec's Storage section is Task 5 + Task 8; the UI section is Tasks 10–11.
- **Ordering constraint:** `pirateTail` (Task 5) lands before `pirateChance(s, to)` (Task 6) needs to read it; `rollEvent`'s `tailed` parameter is live-wired from Task 6 but only ever `false` until Task 7 sets the flag — behavior moves one task at a time.
- **Byte-identity claims:** seed 42 is clearSkies (measured), so existing engine fixtures hold except where a task explicitly renames a surface (odds string, bulletin lines, screen-head sub, share line 1).
