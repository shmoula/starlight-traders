# Starlight Traders MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playable, shareable browser vertical slice of Starlight Traders — a roguelike trade-run game with a faucet/sink economy, daily seed, and a share card.

**Architecture:** Pure, framework-free TypeScript game engine (no DOM, fully unit-tested under TDD) wrapped by a thin DOM render layer. The engine exposes immutable state transitions; the UI calls them and re-renders from state. Determinism comes from a seeded RNG so a given daily seed always produces the same map, prices, and events.

**Tech Stack:** TypeScript, Vite (dev server + build), Vitest (unit tests). No game framework — vanilla DOM rendering. Single-page app, deployable as static files to itch.io.

---

## File Structure

```
starlight-traders/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  src/
    engine/
      rng.ts          # seeded RNG (mulberry32) + daily seed
      types.ts        # all domain types
      world.ts        # 5 nodes, distances, commodity defs, price generation
      economy.ts      # fuel/fees/tax/repair/loan math, net worth, score
      missions.ts     # mission generation + completion
      events.ts       # in-transit event table + resolution
      game.ts         # state machine: createGame, buy/sell/jump/etc, loss check
    sim/
      simulate.ts     # per-run archetype simulation for balance validation
    ui/
      render.ts       # top-level render(state) dispatcher
      screens.ts      # station / map / event / run-end screen builders
      share.ts        # score card text + clipboard
      styles.css
    main.ts           # wires engine + UI, owns the mutable state ref
  tests/
    engine/
      rng.test.ts
      world.test.ts
      economy.test.ts
      missions.test.ts
      events.test.ts
      game.test.ts
    sim/
      simulate.test.ts
```

Engine modules are pure (no DOM, no globals) so each is unit-testable in isolation. UI modules are thin and verified by smoke tests + manual checks in the browser.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/ui/styles.css`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "starlight-traders",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.5.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  test: { globals: true, environment: "node" },
});
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Starlight Traders</title>
    <link rel="stylesheet" href="/src/ui/styles.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create placeholder `src/main.ts`**

```ts
const app = document.querySelector<HTMLDivElement>("#app")!;
app.textContent = "Starlight Traders — booting…";
```

- [ ] **Step 6: Create empty `src/ui/styles.css`**

```css
:root { color-scheme: dark; }
body { margin: 0; font-family: system-ui, sans-serif; background: #0b1020; color: #e6ecff; }
```

- [ ] **Step 7: Install and verify dev server boots**

Run: `npm install && npm run dev`
Expected: Vite prints a local URL; opening it shows "Starlight Traders — booting…". Stop the server (Ctrl-C).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + TS + Vitest project"
```

---

## Task 2: Seeded RNG

**Files:**
- Create: `src/engine/rng.ts`
- Test: `tests/engine/rng.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { mulberry32, dailySeed, hashSeed } from "../../src/engine/rng";

describe("mulberry32", () => {
  it("is deterministic for the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });

  it("returns floats in [0,1)", () => {
    const r = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("produces different streams for different seeds", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe("hashSeed", () => {
  it("combines numbers into a stable 32-bit seed", () => {
    expect(hashSeed(1, 2, 3)).toBe(hashSeed(1, 2, 3));
    expect(hashSeed(1, 2, 3)).not.toBe(hashSeed(3, 2, 1));
  });
});

describe("dailySeed", () => {
  it("is stable within a calendar day and changes across days (UTC)", () => {
    const d1 = dailySeed(new Date("2026-06-18T09:00:00Z"));
    const d2 = dailySeed(new Date("2026-06-18T23:00:00Z"));
    const d3 = dailySeed(new Date("2026-06-19T00:00:00Z"));
    expect(d1).toBe(d2);
    expect(d1).not.toBe(d3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/rng.test.ts`
Expected: FAIL — cannot find module `rng`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/engine/rng.ts

/** Deterministic PRNG. Returns a function yielding floats in [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Combine integers into a stable 32-bit unsigned seed (order matters). */
export function hashSeed(...nums: number[]): number {
  let h = 2166136261 >>> 0;
  for (const n of nums) {
    h ^= n | 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable seed for the UTC calendar day of the given date. */
export function dailySeed(date: Date): number {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  return hashSeed(y, m, d);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/rng.test.ts`
Expected: PASS (3 + 1 + 1 assertions across 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/rng.ts tests/engine/rng.test.ts
git commit -m "feat: deterministic seeded RNG and daily seed"
```

---

## Task 3: Domain types

**Files:**
- Create: `src/engine/types.ts`

No test (type-only module; consumed and validated by later tasks).

- [ ] **Step 1: Create the types file**

```ts
// src/engine/types.ts

export type CommodityId = "water" | "parts" | "luxury";
export type NodeId = "terra" | "kiruna" | "vulcan" | "verge" | "meridian";

export interface Commodity {
  id: CommodityId;
  name: string;
  basePrice: number;   // median credits per unit
  volatility: number;  // 0..1 fractional daily swing
}

export interface StationNode {
  id: NodeId;
  name: string;
  danger: number;        // 0..1, scales hostile event chance
  feeMultiplier: number; // multiplies base docking fee
  taxRate: number;       // fraction taxed on sale proceeds
  produces: CommodityId[]; // commodities cheap here
  demands: CommodityId[];  // commodities that sell high here
}

export interface Mission {
  id: string;
  commodity: CommodityId;
  qty: number;
  destination: NodeId;
  reward: number;
  deadlineDay: number; // absolute game day by which cargo must arrive
}

export interface GameState {
  seed: number;
  day: number;
  credits: number;
  debt: number;
  location: NodeId;
  fuel: number;
  fuelCapacity: number;
  hull: number;
  hullMax: number;
  cargo: Record<CommodityId, number>;
  cargoCapacity: number;
  activeMissions: Mission[];
  peakNetWorth: number;
  status: "playing" | "lost";
  log: string[]; // recent player-facing messages, newest last
}

export type GameEventKind =
  | "quiet"
  | "pirates"
  | "salvage"
  | "derelict"
  | "customs"
  | "engine";

export interface GameEvent {
  kind: GameEventKind;
  title: string;
  description: string;
  /** Choices the player can pick; resolved by game.resolveChoice. */
  choices: EventChoice[];
}

export interface EventChoice {
  id: string;
  label: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/engine/types.ts
git commit -m "feat: domain types for game state"
```

---

## Task 4: World data and price generation

**Files:**
- Create: `src/engine/world.ts`
- Test: `tests/engine/world.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  NODES, COMMODITIES, fuelCost, getPrice, NODE_IDS,
} from "../../src/engine/world";

describe("world data", () => {
  it("has exactly 5 nodes and 3 commodities", () => {
    expect(NODE_IDS).toHaveLength(5);
    expect(COMMODITIES).toHaveLength(3);
  });

  it("fuelCost is symmetric and positive between distinct nodes", () => {
    expect(fuelCost("terra", "kiruna")).toBe(fuelCost("kiruna", "terra"));
    expect(fuelCost("terra", "kiruna")).toBeGreaterThan(0);
  });

  it("fuelCost from a node to itself is 0", () => {
    expect(fuelCost("terra", "terra")).toBe(0);
  });
});

describe("getPrice", () => {
  it("is deterministic for the same seed/day/node/commodity", () => {
    const a = getPrice(123, 4, "terra", "water");
    const b = getPrice(123, 4, "terra", "water");
    expect(a).toBe(b);
  });

  it("changes across days", () => {
    const d1 = getPrice(123, 1, "terra", "luxury");
    const d2 = getPrice(123, 2, "terra", "luxury");
    expect(d1).not.toBe(d2);
  });

  it("is cheaper where produced than where demanded (on average)", () => {
    // Water is produced at kiruna, demanded at vulcan.
    let cheap = 0, dear = 0;
    for (let day = 1; day <= 50; day++) {
      cheap += getPrice(7, day, "kiruna", "water");
      dear += getPrice(7, day, "vulcan", "water");
    }
    expect(cheap).toBeLessThan(dear);
  });

  it("returns positive integers", () => {
    const p = getPrice(1, 1, "meridian", "luxury");
    expect(Number.isInteger(p)).toBe(true);
    expect(p).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/world.test.ts`
Expected: FAIL — cannot find module `world`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/engine/world.ts
import { Commodity, CommodityId, NodeId, StationNode } from "./types";
import { mulberry32, hashSeed } from "./rng";

export const COMMODITIES: Commodity[] = [
  { id: "water", name: "Water / Ice", basePrice: 20, volatility: 0.15 },
  { id: "parts", name: "Machine Parts", basePrice: 120, volatility: 0.35 },
  { id: "luxury", name: "Luxury Goods", basePrice: 480, volatility: 0.6 },
];

export const NODES: Record<NodeId, StationNode> = {
  terra: {
    id: "terra", name: "Terra Hub", danger: 0, feeMultiplier: 1.6, taxRate: 0.05,
    produces: [], demands: [],
  },
  kiruna: {
    id: "kiruna", name: "Kiruna Belt", danger: 0, feeMultiplier: 0.6, taxRate: 0.02,
    produces: ["water"], demands: [],
  },
  vulcan: {
    id: "vulcan", name: "Vulcan Yards", danger: 0.15, feeMultiplier: 0.9, taxRate: 0.04,
    produces: ["parts"], demands: ["water"],
  },
  verge: {
    id: "verge", name: "The Verge", danger: 0.5, feeMultiplier: 0.7, taxRate: 0,
    produces: [], demands: ["luxury", "parts"],
  },
  meridian: {
    id: "meridian", name: "Meridian", danger: 0.2, feeMultiplier: 1.8, taxRate: 0.18,
    produces: [], demands: ["luxury"],
  },
};

export const NODE_IDS = Object.keys(NODES) as NodeId[];

// Fuel distance matrix (symmetric). Units = fuel consumed to make the jump.
const DISTANCE: Record<NodeId, Partial<Record<NodeId, number>>> = {
  terra:    { kiruna: 4, vulcan: 3, verge: 6, meridian: 5 },
  kiruna:   { terra: 4, vulcan: 3, verge: 7, meridian: 8 },
  vulcan:   { terra: 3, kiruna: 3, verge: 4, meridian: 6 },
  verge:    { terra: 6, kiruna: 7, vulcan: 4, meridian: 5 },
  meridian: { terra: 5, kiruna: 8, vulcan: 6, verge: 5 },
};

export function fuelCost(from: NodeId, to: NodeId): number {
  if (from === to) return 0;
  const d = DISTANCE[from][to];
  if (d === undefined) throw new Error(`No route ${from}->${to}`);
  return d;
}

const COMMODITY_BY_ID: Record<CommodityId, Commodity> = Object.fromEntries(
  COMMODITIES.map((c) => [c.id, c]),
) as Record<CommodityId, Commodity>;

/**
 * Deterministic local price for a commodity at a node on a given day.
 * Produced -> discounted; demanded -> premium; plus seeded daily noise.
 */
export function getPrice(
  seed: number, day: number, node: NodeId, commodity: CommodityId,
): number {
  const c = COMMODITY_BY_ID[commodity];
  const station = NODES[node];
  const rng = mulberry32(hashSeed(seed, day, node.length, commodity.length, node.charCodeAt(0), commodity.charCodeAt(0)));
  const noise = (rng() * 2 - 1) * c.volatility; // -vol..+vol
  let modifier = 1 + noise;
  if (station.produces.includes(commodity)) modifier *= 0.7;
  if (station.demands.includes(commodity)) modifier *= 1.4;
  const price = Math.round(c.basePrice * modifier);
  return Math.max(1, price);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/world.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/world.ts tests/engine/world.test.ts
git commit -m "feat: world nodes, distances, and seeded price generation"
```

---

## Task 5: Economy math

**Files:**
- Create: `src/engine/economy.ts`
- Test: `tests/engine/economy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  dockingFee, taxOnSale, loanInterest, cargoUsed, netWorth, score, REFUEL_PRICE, REPAIR_PRICE,
} from "../../src/engine/economy";
import { GameState } from "../../src/engine/types";

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    seed: 1, day: 1, credits: 1000, debt: 500, location: "terra",
    fuel: 10, fuelCapacity: 20, hull: 80, hullMax: 100,
    cargo: { water: 0, parts: 0, luxury: 0 }, cargoCapacity: 30,
    activeMissions: [], peakNetWorth: 0, status: "playing", log: [],
    ...overrides,
  };
}

describe("economy", () => {
  it("docking fee scales with node fee multiplier", () => {
    expect(dockingFee("meridian")).toBeGreaterThan(dockingFee("kiruna"));
  });

  it("tax is a fraction of positive sale proceeds and zero at tax-free nodes", () => {
    expect(taxOnSale("verge", 1000)).toBe(0);
    expect(taxOnSale("meridian", 1000)).toBe(180);
  });

  it("loan interest is a positive fraction of remaining debt, zero when debt-free", () => {
    expect(loanInterest(1000)).toBeGreaterThan(0);
    expect(loanInterest(0)).toBe(0);
  });

  it("cargoUsed sums all commodity stacks", () => {
    expect(cargoUsed({ water: 5, parts: 2, luxury: 1 })).toBe(8);
  });

  it("netWorth = credits + cargo value - debt", () => {
    const s = baseState({ credits: 1000, debt: 500, cargo: { water: 10, parts: 0, luxury: 0 } });
    const nw = netWorth(s);
    expect(nw).toBeGreaterThan(500); // 1000 - 500 + value of 10 water
  });

  it("score rewards both peak net worth and days survived", () => {
    expect(score(10000, 8)).toBeGreaterThan(score(10000, 4));
    expect(score(20000, 4)).toBeGreaterThan(score(10000, 4));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/economy.test.ts`
Expected: FAIL — cannot find module `economy`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/engine/economy.ts
import { CommodityId, GameState, NodeId } from "./types";
import { NODES, getPrice } from "./world";

export const BASE_DOCKING_FEE = 25;
export const REFUEL_PRICE = 8;   // credits per fuel unit
export const REPAIR_PRICE = 6;   // credits per hull point
export const LOAN_RATE = 0.04;   // interest fraction applied per accrual

export function dockingFee(node: NodeId): number {
  return Math.round(BASE_DOCKING_FEE * NODES[node].feeMultiplier);
}

export function taxOnSale(node: NodeId, proceeds: number): number {
  if (proceeds <= 0) return 0;
  return Math.round(proceeds * NODES[node].taxRate);
}

export function loanInterest(debt: number): number {
  if (debt <= 0) return 0;
  return Math.ceil(debt * LOAN_RATE);
}

export function cargoUsed(cargo: Record<CommodityId, number>): number {
  return cargo.water + cargo.parts + cargo.luxury;
}

/** Value of held cargo at current location's prices. */
export function cargoValue(state: GameState): number {
  let total = 0;
  (Object.keys(state.cargo) as CommodityId[]).forEach((id) => {
    total += state.cargo[id] * getPrice(state.seed, state.day, state.location, id);
  });
  return total;
}

export function netWorth(state: GameState): number {
  return state.credits + cargoValue(state) - state.debt;
}

export function score(peakNetWorth: number, daysSurvived: number): number {
  return Math.max(0, Math.round(peakNetWorth * (1 + daysSurvived * 0.1)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/economy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/economy.ts tests/engine/economy.test.ts
git commit -m "feat: economy math (fees, tax, loan interest, net worth, score)"
```

---

## Task 6: Mission generation and completion

**Files:**
- Create: `src/engine/missions.ts`
- Test: `tests/engine/missions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { generateMissions } from "../../src/engine/missions";

describe("generateMissions", () => {
  it("is deterministic for the same seed/day/node", () => {
    const a = generateMissions(5, 3, "terra");
    const b = generateMissions(5, 3, "terra");
    expect(a).toEqual(b);
  });

  it("returns 1-3 missions whose destination is never the origin", () => {
    for (let day = 1; day <= 20; day++) {
      const ms = generateMissions(9, day, "terra");
      expect(ms.length).toBeGreaterThanOrEqual(1);
      expect(ms.length).toBeLessThanOrEqual(3);
      ms.forEach((m) => expect(m.destination).not.toBe("terra"));
    }
  });

  it("gives positive reward, qty, and a future deadline", () => {
    const ms = generateMissions(1, 2, "vulcan");
    ms.forEach((m) => {
      expect(m.reward).toBeGreaterThan(0);
      expect(m.qty).toBeGreaterThan(0);
      expect(m.deadlineDay).toBeGreaterThan(2);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/missions.test.ts`
Expected: FAIL — cannot find module `missions`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/engine/missions.ts
import { CommodityId, Mission, NodeId } from "./types";
import { COMMODITIES, NODE_IDS, getPrice } from "./world";
import { mulberry32, hashSeed } from "./rng";

/** Deterministic set of delivery missions offered at a node on a given day. */
export function generateMissions(seed: number, day: number, node: NodeId): Mission[] {
  const rng = mulberry32(hashSeed(seed, day, node.charCodeAt(0), 777));
  const count = 1 + Math.floor(rng() * 3); // 1..3
  const others = NODE_IDS.filter((n) => n !== node);
  const missions: Mission[] = [];
  for (let i = 0; i < count; i++) {
    const commodity = COMMODITIES[Math.floor(rng() * COMMODITIES.length)].id as CommodityId;
    const destination = others[Math.floor(rng() * others.length)];
    const qty = 3 + Math.floor(rng() * 8); // 3..10
    const unit = getPrice(seed, day, destination, commodity);
    const reward = Math.round(unit * qty * (1.3 + rng() * 0.4)); // premium over spot
    const deadlineDay = day + 4 + Math.floor(rng() * 5); // +4..+8 days
    missions.push({ id: `${node}-${day}-${i}`, commodity, qty, destination, reward, deadlineDay });
  }
  return missions;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/missions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/missions.ts tests/engine/missions.test.ts
git commit -m "feat: deterministic delivery mission generation"
```

---

## Task 7: In-transit events

**Files:**
- Create: `src/engine/events.ts`
- Test: `tests/engine/events.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { rollEvent } from "../../src/engine/events";

describe("rollEvent", () => {
  it("is deterministic for the same seed/day/route", () => {
    const a = rollEvent(3, 5, "terra", "verge");
    const b = rollEvent(3, 5, "terra", "verge");
    expect(a.kind).toBe(b.kind);
  });

  it("always returns a known event kind with at least one choice", () => {
    const known = ["quiet", "pirates", "salvage", "derelict", "customs", "engine"];
    for (let day = 1; day <= 60; day++) {
      const e = rollEvent(11, day, "terra", "verge");
      expect(known).toContain(e.kind);
      expect(e.choices.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("produces more pirate events on high-danger routes than safe ones", () => {
    let dangerous = 0, safe = 0;
    for (let day = 1; day <= 200; day++) {
      if (rollEvent(2, day, "terra", "verge").kind === "pirates") dangerous++;
      if (rollEvent(2, day, "terra", "kiruna").kind === "pirates") safe++;
    }
    expect(dangerous).toBeGreaterThan(safe);
  });

  it("only fires customs on routes into meridian", () => {
    let customsElsewhere = 0;
    for (let day = 1; day <= 200; day++) {
      if (rollEvent(4, day, "terra", "kiruna").kind === "customs") customsElsewhere++;
    }
    expect(customsElsewhere).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/events.test.ts`
Expected: FAIL — cannot find module `events`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/engine/events.ts
import { GameEvent, NodeId } from "./types";
import { NODES } from "./world";
import { mulberry32, hashSeed } from "./rng";

/**
 * Roll the in-transit event for a jump. Hostility scales with destination danger.
 * Customs only fires when arriving at meridian.
 */
export function rollEvent(seed: number, day: number, from: NodeId, to: NodeId): GameEvent {
  const rng = mulberry32(hashSeed(seed, day, from.charCodeAt(0), to.charCodeAt(0), 31));
  const danger = NODES[to].danger;
  const r = rng();

  // Probability bands grow the hostile slice with danger.
  const pPirates = 0.1 + danger * 0.45;
  const pSalvage = pPirates + 0.18;
  const pEngine = pSalvage + 0.1;
  const pDerelict = pEngine + 0.12;
  const pCustoms = to === "meridian" ? pDerelict + 0.15 : pDerelict;

  if (r < pPirates) return pirates();
  if (r < pSalvage) return salvage();
  if (r < pEngine) return engine();
  if (r < pDerelict) return derelict();
  if (r < pCustoms) return customs();
  return quiet();
}

function pirates(): GameEvent {
  return {
    kind: "pirates", title: "Pirate Ambush",
    description: "Raiders demand tribute. Pay them off, or run and risk hull damage.",
    choices: [
      { id: "pay", label: "Pay tribute (lose credits)" },
      { id: "flee", label: "Run for it (risk hull)" },
    ],
  };
}
function salvage(): GameEvent {
  return {
    kind: "salvage", title: "Salvage Field",
    description: "Debris drifts nearby. Scoop it up for free goods?",
    choices: [{ id: "collect", label: "Collect salvage" }, { id: "ignore", label: "Stay on course" }],
  };
}
function engine(): GameEvent {
  return {
    kind: "engine", title: "Engine Trouble",
    description: "A coolant leak burns extra fuel before you patch it.",
    choices: [{ id: "ack", label: "Patch it up" }],
  };
}
function derelict(): GameEvent {
  return {
    kind: "derelict", title: "Derelict Hulk",
    description: "An abandoned freighter floats silent. Board it? Could be treasure — or a trap.",
    choices: [{ id: "board", label: "Board it (gamble)" }, { id: "leave", label: "Leave it be" }],
  };
}
function customs(): GameEvent {
  return {
    kind: "customs", title: "Meridian Customs",
    description: "Inspectors scan your hold. Undeclared luxury goods may be seized.",
    choices: [{ id: "comply", label: "Submit to inspection" }, { id: "bribe", label: "Bribe the inspector" }],
  };
}
function quiet(): GameEvent {
  return {
    kind: "quiet", title: "Quiet Jump",
    description: "The void is calm. You arrive without incident.",
    choices: [{ id: "ack", label: "Continue" }],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/events.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/events.ts tests/engine/events.test.ts
git commit -m "feat: danger-weighted in-transit event roller"
```

---

## Task 8: Game state machine

**Files:**
- Create: `src/engine/game.ts`
- Test: `tests/engine/game.test.ts`

This task assembles the engine. All state transitions return a **new** `GameState` (immutable updates) and append to `log`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  createGame, buy, sell, refuel, repair, acceptMission, jump, resolveChoice,
  checkLoss, STARTING,
} from "../../src/engine/game";
import { getPrice } from "../../src/engine/world";

describe("createGame", () => {
  it("starts at terra with starting credits, debt, fuel, and full hull", () => {
    const s = createGame(42);
    expect(s.location).toBe("terra");
    expect(s.credits).toBe(STARTING.credits);
    expect(s.debt).toBe(STARTING.debt);
    expect(s.fuel).toBe(STARTING.fuel);
    expect(s.hull).toBe(s.hullMax);
    expect(s.status).toBe("playing");
    expect(s.day).toBe(1);
  });
});

describe("buy/sell", () => {
  it("buying decreases credits and increases cargo", () => {
    const s = createGame(42);
    const price = getPrice(s.seed, s.day, s.location, "water");
    const s2 = buy(s, "water", 3);
    expect(s2.cargo.water).toBe(3);
    expect(s2.credits).toBe(s.credits - price * 3);
  });

  it("cannot buy beyond cargo capacity or affordability", () => {
    const s = createGame(42);
    const huge = buy(s, "luxury", 9999);
    expect(huge).toBe(s); // rejected, unchanged
  });

  it("selling increases credits (minus tax) and decreases cargo", () => {
    const s = buy(createGame(42), "water", 5);
    const before = s.credits;
    const s2 = sell(s, "water", 5);
    expect(s2.cargo.water).toBe(0);
    expect(s2.credits).toBeGreaterThan(before);
  });
});

describe("refuel/repair", () => {
  it("refuel adds fuel up to capacity and charges credits", () => {
    const s = createGame(42);
    const s2 = refuel(s, 5);
    expect(s2.fuel).toBe(Math.min(s.fuelCapacity, s.fuel + 5));
    expect(s2.credits).toBeLessThan(s.credits);
  });

  it("repair restores hull up to max and charges credits", () => {
    const s = { ...createGame(42), hull: 50 };
    const s2 = repair(s, 30);
    expect(s2.hull).toBe(80);
    expect(s2.credits).toBeLessThan(s.credits);
  });
});

describe("jump", () => {
  it("consumes fuel, advances the day, accrues interest and docking fee, and returns a pending event", () => {
    const s = createGame(42);
    const { state, event } = jump(s, "kiruna");
    expect(state.location).toBe("kiruna");
    expect(state.day).toBe(2);
    expect(state.fuel).toBeLessThan(s.fuel);
    expect(event).toBeTruthy();
  });

  it("refuses to jump without enough fuel", () => {
    const s = { ...createGame(42), fuel: 0 };
    const result = jump(s, "kiruna");
    expect(result.state).toBe(s);
    expect(result.event).toBeNull();
  });
});

describe("checkLoss", () => {
  it("marks lost when stranded: no fuel and cannot afford the cheapest jump", () => {
    const s = { ...createGame(42), fuel: 0, credits: 0, cargo: { water: 0, parts: 0, luxury: 0 } };
    expect(checkLoss(s).status).toBe("lost");
  });

  it("stays playing when a jump is still affordable", () => {
    const s = createGame(42);
    expect(checkLoss(s).status).toBe("playing");
  });
});

describe("resolveChoice", () => {
  it("resolving a pirate 'pay' choice reduces credits", () => {
    const s = createGame(42);
    const evt = { kind: "pirates" as const, title: "", description: "", choices: [{ id: "pay", label: "" }] };
    const s2 = resolveChoice(s, evt, "pay");
    expect(s2.credits).toBeLessThanOrEqual(s.credits);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/game.test.ts`
Expected: FAIL — cannot find module `game`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/engine/game.ts
import { CommodityId, GameEvent, GameState, Mission, NodeId } from "./types";
import { NODE_IDS, fuelCost, getPrice } from "./world";
import {
  REFUEL_PRICE, REPAIR_PRICE, dockingFee, taxOnSale, loanInterest, cargoUsed, netWorth,
} from "./economy";
import { generateMissions } from "./missions";
import { rollEvent } from "./events";

export const STARTING = {
  credits: 800,
  debt: 1500,
  fuel: 16,
  fuelCapacity: 20,
  hull: 100,
  cargoCapacity: 30,
};

const INTEREST_EVERY = 3; // days between interest accruals

export function createGame(seed: number): GameState {
  return {
    seed,
    day: 1,
    credits: STARTING.credits,
    debt: STARTING.debt,
    location: "terra",
    fuel: STARTING.fuel,
    fuelCapacity: STARTING.fuelCapacity,
    hull: STARTING.hull,
    hullMax: STARTING.hull,
    cargo: { water: 0, parts: 0, luxury: 0 },
    cargoCapacity: STARTING.cargoCapacity,
    activeMissions: [],
    peakNetWorth: 0,
    status: "playing",
    log: ["You launch from Terra Hub, 1500 credits in debt. Make it count."],
  };
}

function withLog(state: GameState, msg: string): GameState {
  return { ...state, log: [...state.log, msg].slice(-12) };
}

function trackPeak(state: GameState): GameState {
  const nw = netWorth(state);
  return nw > state.peakNetWorth ? { ...state, peakNetWorth: nw } : state;
}

export function missionsHere(state: GameState): Mission[] {
  return generateMissions(state.seed, state.day, state.location);
}

export function buy(state: GameState, id: CommodityId, qty: number): GameState {
  if (qty <= 0) return state;
  const price = getPrice(state.seed, state.day, state.location, id);
  const cost = price * qty;
  if (cost > state.credits) return state;
  if (cargoUsed(state.cargo) + qty > state.cargoCapacity) return state;
  const next = {
    ...state,
    credits: state.credits - cost,
    cargo: { ...state.cargo, [id]: state.cargo[id] + qty },
  };
  return trackPeak(withLog(next, `Bought ${qty} ${id} for ${cost}cr.`));
}

export function sell(state: GameState, id: CommodityId, qty: number): GameState {
  if (qty <= 0 || state.cargo[id] < qty) return state;
  const price = getPrice(state.seed, state.day, state.location, id);
  const proceeds = price * qty;
  const tax = taxOnSale(state.location, proceeds);
  const next = {
    ...state,
    credits: state.credits + proceeds - tax,
    cargo: { ...state.cargo, [id]: state.cargo[id] - qty },
  };
  return trackPeak(withLog(next, `Sold ${qty} ${id} for ${proceeds}cr (tax ${tax}).`));
}

export function refuel(state: GameState, units: number): GameState {
  const room = state.fuelCapacity - state.fuel;
  const buyUnits = Math.min(units, room);
  if (buyUnits <= 0) return state;
  const cost = buyUnits * REFUEL_PRICE;
  if (cost > state.credits) return state;
  return withLog(
    { ...state, fuel: state.fuel + buyUnits, credits: state.credits - cost },
    `Refueled ${buyUnits} for ${cost}cr.`,
  );
}

export function repair(state: GameState, points: number): GameState {
  const room = state.hullMax - state.hull;
  const fix = Math.min(points, room);
  if (fix <= 0) return state;
  const cost = fix * REPAIR_PRICE;
  if (cost > state.credits) return state;
  return withLog(
    { ...state, hull: state.hull + fix, credits: state.credits - cost },
    `Repaired ${fix} hull for ${cost}cr.`,
  );
}

export function payDebt(state: GameState, amount: number): GameState {
  const pay = Math.min(amount, state.debt, state.credits);
  if (pay <= 0) return state;
  return trackPeak(withLog(
    { ...state, debt: state.debt - pay, credits: state.credits - pay },
    `Paid down ${pay}cr of debt.`,
  ));
}

export function acceptMission(state: GameState, mission: Mission): GameState {
  if (state.activeMissions.some((m) => m.id === mission.id)) return state;
  return withLog(
    { ...state, activeMissions: [...state.activeMissions, mission] },
    `Accepted delivery to ${mission.destination}.`,
  );
}

/** Complete any active missions satisfied by current location + cargo, paying rewards. */
function settleMissions(state: GameState): GameState {
  let s = state;
  const remaining: Mission[] = [];
  for (const m of s.activeMissions) {
    if (m.destination === s.location && s.cargo[m.commodity] >= m.qty && s.day <= m.deadlineDay) {
      s = {
        ...s,
        cargo: { ...s.cargo, [m.commodity]: s.cargo[m.commodity] - m.qty },
        credits: s.credits + m.reward,
      };
      s = withLog(s, `Delivery complete: +${m.reward}cr.`);
    } else if (s.day > m.deadlineDay) {
      s = withLog(s, `Delivery to ${m.destination} expired.`);
    } else {
      remaining.push(m);
    }
  }
  return { ...s, activeMissions: remaining };
}

export function checkLoss(state: GameState): GameState {
  if (state.status === "lost") return state;
  const cheapest = Math.min(
    ...NODE_IDS.filter((n) => n !== state.location).map((n) => fuelCost(state.location, n)),
  );
  const canJumpNow = state.fuel >= cheapest;
  const fuelShort = Math.max(0, cheapest - state.fuel);
  const canBuyFuel = state.credits >= fuelShort * REFUEL_PRICE;
  if (!canJumpNow && !canBuyFuel) {
    return withLog({ ...state, status: "lost" }, "Stranded and broke. The run ends here.");
  }
  return state;
}

/**
 * Jump to a destination: spend fuel, advance the day, accrue interest, pay docking,
 * settle deliveries, then return the pending in-transit event for the UI to resolve.
 */
export function jump(state: GameState, to: NodeId): { state: GameState; event: GameEvent | null } {
  if (to === state.location) return { state, event: null };
  const cost = fuelCost(state.location, to);
  if (state.fuel < cost) return { state, event: null };

  let s: GameState = { ...state, fuel: state.fuel - cost, location: to, day: state.day + 1 };

  // Interest accrues on a fixed cadence.
  if (s.day % INTEREST_EVERY === 0 && s.debt > 0) {
    const interest = loanInterest(s.debt);
    s = withLog({ ...s, debt: s.debt + interest }, `Loan interest +${interest}cr.`);
  }

  // Docking fee on arrival.
  const fee = dockingFee(to);
  s = withLog({ ...s, credits: s.credits - fee }, `Docked at ${to}, fee ${fee}cr.`);

  s = settleMissions(s);
  s = trackPeak(s);

  const event = rollEvent(s.seed, s.day, state.location, to);
  return { state: s, event };
}

/** Apply the consequences of an event choice. Deterministic per seed/day. */
export function resolveChoice(state: GameState, event: GameEvent, choiceId: string): GameState {
  let s = state;
  const luxValue = () => getPrice(s.seed, s.day, s.location, "luxury");
  switch (event.kind) {
    case "pirates": {
      if (choiceId === "pay") {
        const toll = Math.min(s.credits, 150 + s.day * 10);
        s = withLog({ ...s, credits: s.credits - toll }, `Paid pirates ${toll}cr.`);
      } else {
        const dmg = 15 + (s.day % 10);
        s = withLog({ ...s, hull: Math.max(0, s.hull - dmg) }, `Fled — took ${dmg} hull damage.`);
      }
      break;
    }
    case "salvage": {
      if (choiceId === "collect") {
        const room = s.cargoCapacity - cargoUsed(s.cargo);
        const got = Math.min(room, 2 + (s.day % 4));
        s = withLog({ ...s, cargo: { ...s.cargo, parts: s.cargo.parts + got } }, `Salvaged ${got} parts.`);
      }
      break;
    }
    case "engine": {
      const burn = Math.min(s.fuel, 2);
      s = withLog({ ...s, fuel: s.fuel - burn }, `Engine trouble burned ${burn} fuel.`);
      break;
    }
    case "derelict": {
      if (choiceId === "board") {
        if ((s.day * 7 + s.seed) % 2 === 0) {
          const reward = 200 + s.day * 8;
          s = withLog({ ...s, credits: s.credits + reward }, `Derelict held ${reward}cr!`);
        } else {
          const dmg = 20;
          s = withLog({ ...s, hull: Math.max(0, s.hull - dmg) }, `Derelict was a trap: -${dmg} hull.`);
        }
      }
      break;
    }
    case "customs": {
      if (choiceId === "comply" && s.cargo.luxury > 0) {
        const seized = s.cargo.luxury;
        s = withLog({ ...s, cargo: { ...s.cargo, luxury: 0 } }, `Customs seized ${seized} luxury goods.`);
      } else if (choiceId === "bribe") {
        const bribe = Math.min(s.credits, luxValue());
        s = withLog({ ...s, credits: s.credits - bribe }, `Bribed customs ${bribe}cr.`);
      }
      break;
    }
    case "quiet":
    default:
      break;
  }
  return checkLoss(trackPeak(s));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/game.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full engine suite**

Run: `npx vitest run`
Expected: all engine tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/game.ts tests/engine/game.test.ts
git commit -m "feat: game state machine (trade, jump, events, loss, score)"
```

---

## Task 9: Balance simulation (validate the faucet/sink tuning)

**Files:**
- Create: `src/sim/simulate.ts`
- Test: `tests/sim/simulate.test.ts`

This implements the spec's per-run archetype validation: a passive/cautious player should trend toward going broke (net flow slightly negative), while a skilled arbitrage player should be able to profit. This guards the core tuning principle.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { runArchetype } from "../../src/sim/simulate";

describe("balance simulation", () => {
  it("cautious players (water-only safe loop) trend toward losing", () => {
    // Average peak net worth across seeds should be modest / often negative-trending.
    let survivedLong = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const r = runArchetype("cautious", seed, 30);
      if (r.daysSurvived >= 25) survivedLong++;
    }
    // The safety loop should NOT trivially survive every run to day 25.
    expect(survivedLong).toBeLessThan(30);
  });

  it("greedy arbitrage players reach higher peak net worth than cautious on average", () => {
    let greedy = 0, cautious = 0;
    for (let seed = 1; seed <= 30; seed++) {
      greedy += runArchetype("greedy", seed, 30).peakNetWorth;
      cautious += runArchetype("cautious", seed, 30).peakNetWorth;
    }
    expect(greedy).toBeGreaterThan(cautious);
  });

  it("every run terminates (no infinite loop) and reports a score", () => {
    const r = runArchetype("balanced", 5, 30);
    expect(r.daysSurvived).toBeGreaterThan(0);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim/simulate.test.ts`
Expected: FAIL — cannot find module `simulate`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/sim/simulate.ts
import { CommodityId, GameState, NodeId } from "../engine/types";
import { createGame, buy, sell, refuel, jump, resolveChoice, checkLoss } from "../engine/game";
import { NODE_IDS, fuelCost, getPrice } from "../engine/world";
import { score as scoreFn } from "../engine/economy";

export type Archetype = "cautious" | "balanced" | "greedy";

export interface SimResult {
  daysSurvived: number;
  peakNetWorth: number;
  score: number;
}

/** Pick the destination + commodity that maximizes naive expected margin this turn. */
function bestTrade(s: GameState, candidates: CommodityId[]): { to: NodeId; id: CommodityId } | null {
  let best: { to: NodeId; id: CommodityId; margin: number } | null = null;
  for (const to of NODE_IDS.filter((n) => n !== s.location)) {
    const f = fuelCost(s.location, to);
    if (s.fuel < f) continue;
    for (const id of candidates) {
      const buyP = getPrice(s.seed, s.day, s.location, id);
      const sellP = getPrice(s.seed, s.day + 1, to, id);
      const margin = sellP - buyP;
      if (best === null || margin > best.margin) best = { to, id, margin };
    }
  }
  return best ? { to: best.to, id: best.id } : null;
}

export function runArchetype(kind: Archetype, seed: number, maxDays: number): SimResult {
  let s = createGame(seed);
  const candidates: CommodityId[] =
    kind === "cautious" ? ["water"] : kind === "balanced" ? ["water", "parts"] : ["water", "parts", "luxury"];

  while (s.status === "playing" && s.day < maxDays) {
    // Top up fuel modestly each turn.
    s = refuel(s, 6);

    const pick = bestTrade(s, candidates);
    if (!pick) {
      s = checkLoss(s);
      if (s.status === "lost") break;
      // Cannot act — force a cheap jump to advance and accrue costs.
      const to = NODE_IDS.filter((n) => n !== s.location)
        .sort((a, b) => fuelCost(s.location, a) - fuelCost(s.location, b))[0];
      const r = jump(s, to);
      if (r.event === null) break;
      s = resolveChoice(r.state, r.event, r.event.choices[0].id);
      continue;
    }

    // Buy as much of the chosen commodity as affordable/space allows.
    let qty = 0;
    while (true) {
      const next = buy(s, pick.id, 1);
      if (next === s) break;
      s = next;
      qty++;
      if (qty > s.cargoCapacity) break;
    }

    const r = jump(s, pick.to);
    if (r.event === null) {
      s = checkLoss(s);
      break;
    }
    // Cautious pays pirates; greedy flees to save credits. Take first salvage/derelict gamble for greedy.
    const choice = chooseEventOption(kind, r.event.choices.map((c) => c.id));
    s = resolveChoice(r.state, r.event, choice);

    // Sell everything we can at the new location.
    (["water", "parts", "luxury"] as CommodityId[]).forEach((id) => {
      if (s.cargo[id] > 0) s = sell(s, id, s.cargo[id]);
    });
    s = checkLoss(s);
  }

  return {
    daysSurvived: s.day,
    peakNetWorth: s.peakNetWorth,
    score: scoreFn(s.peakNetWorth, s.day),
  };
}

function chooseEventOption(kind: Archetype, ids: string[]): string {
  if (ids.includes("pay") && kind === "cautious") return "pay";
  if (ids.includes("flee") && kind !== "cautious") return "flee";
  if (ids.includes("collect")) return "collect";
  if (ids.includes("board") && kind === "greedy") return "board";
  if (ids.includes("comply")) return "comply";
  return ids[0];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim/simulate.test.ts`
Expected: PASS.

> If a balance test fails, tune ONE constant at a time in `economy.ts`/`game.ts` (per the game-balancing skill's "small changes, measured impact" rule): adjust by ~10-20%, re-run, repeat. Likely levers: `STARTING.debt`, `LOAN_RATE`, `INTEREST_EVERY`, `REFUEL_PRICE`, docking `feeMultiplier`s.

- [ ] **Step 5: Commit**

```bash
git add src/sim/simulate.ts tests/sim/simulate.test.ts
git commit -m "feat: archetype balance simulation validating faucet/sink tuning"
```

---

## Task 10: Share card

**Files:**
- Create: `src/ui/share.ts`
- Test: `tests/engine/share.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { shareText } from "../../src/ui/share";

describe("shareText", () => {
  it("includes the score, day count, and seed for comparability", () => {
    const txt = shareText({ seed: 20260618, score: 84210, daysSurvived: 12 });
    expect(txt).toContain("84210");
    expect(txt).toContain("12");
    expect(txt).toContain("20260618");
  });

  it("is a single shareable blurb with the game name", () => {
    const txt = shareText({ seed: 1, score: 100, daysSurvived: 1 });
    expect(txt.toLowerCase()).toContain("starlight traders");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/share.test.ts`
Expected: FAIL — cannot find module `share`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/ui/share.ts

export interface ShareData {
  seed: number;
  score: number;
  daysSurvived: number;
}

export function shareText(d: ShareData): string {
  return [
    `🚀 Starlight Traders — Daily Run`,
    `Score ${d.score} · survived ${d.daysSurvived} days`,
    `Seed #${d.seed} — beat my run!`,
  ].join("\n");
}

/** Copy share text to clipboard; returns true on success. Browser-only. */
export async function copyShare(d: ShareData): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(shareText(d));
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/share.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/share.ts tests/engine/share.test.ts
git commit -m "feat: shareable daily-seed score card text"
```

---

## Task 11: UI render layer

**Files:**
- Create: `src/ui/screens.ts`, `src/ui/render.ts`
- Modify: `src/ui/styles.css`

UI is verified by manual browser checks (DOM rendering does not TDD cleanly). Keep all game decisions in the engine; these functions only read state and emit HTML + wire buttons through a single `dispatch` callback.

- [ ] **Step 1: Define the action contract and screen builders in `src/ui/screens.ts`**

```ts
// src/ui/screens.ts
import { GameEvent, GameState } from "../engine/types";
import { COMMODITIES, NODES, NODE_IDS, fuelCost, getPrice } from "../engine/world";
import { dockingFee, netWorth } from "../engine/economy";
import { missionsHere } from "../engine/game";

export type Action =
  | { type: "buy"; id: string; qty: number }
  | { type: "sell"; id: string; qty: number }
  | { type: "refuel"; units: number }
  | { type: "repair"; points: number }
  | { type: "payDebt"; amount: number }
  | { type: "acceptMission"; missionId: string }
  | { type: "jump"; to: string }
  | { type: "resolve"; choiceId: string }
  | { type: "restart" };

const cr = (n: number) => `${n.toLocaleString()}cr`;

export function stationScreen(s: GameState): string {
  const node = NODES[s.location];
  const market = COMMODITIES.map((c) => {
    const price = getPrice(s.seed, s.day, s.location, c.id);
    return `<tr>
      <td>${c.name}</td><td>${cr(price)}</td><td>${s.cargo[c.id]}</td>
      <td>
        <button data-act="buy" data-id="${c.id}">Buy 1</button>
        <button data-act="sell" data-id="${c.id}">Sell 1</button>
      </td></tr>`;
  }).join("");

  const missions = missionsHere(s).map((m) =>
    `<li>Deliver ${m.qty} ${m.commodity} → ${NODES[m.destination].name} by day ${m.deadlineDay} · reward ${cr(m.reward)}
      <button data-act="accept" data-id="${m.id}">Accept</button></li>`,
  ).join("");

  const routes = NODE_IDS.filter((n) => n !== s.location).map((n) =>
    `<button data-act="jump" data-id="${n}" ${s.fuel < fuelCost(s.location, n) ? "disabled" : ""}>
      Jump to ${NODES[n].name} (${fuelCost(s.location, n)}⛽, danger ${Math.round(NODES[n].danger * 100)}%)
    </button>`,
  ).join("");

  return `
    <header>
      <h1>${node.name} · Day ${s.day}</h1>
      <div class="stats">
        <span>💰 ${cr(s.credits)}</span>
        <span>🏦 debt ${cr(s.debt)}</span>
        <span>⛽ ${s.fuel}/${s.fuelCapacity}</span>
        <span>🛡️ ${s.hull}/${s.hullMax}</span>
        <span>📦 ${s.cargo.water + s.cargo.parts + s.cargo.luxury}/${s.cargoCapacity}</span>
        <span>📈 net ${cr(netWorth(s))}</span>
      </div>
    </header>
    <section><h2>Market</h2><table>${market}</table></section>
    <section><h2>Contracts</h2><ul>${missions || "<li>None today.</li>"}</ul></section>
    <section class="services">
      <button data-act="refuel">Refuel +5 (${cr(40)})</button>
      <button data-act="repair">Repair +20 (${cr(120)})</button>
      <button data-act="payDebt">Pay 200 debt</button>
      <span class="fee">Docking fee here: ${cr(dockingFee(s.location))}</span>
    </section>
    <section><h2>Navigate</h2><div class="routes">${routes}</div></section>
    <aside class="log">${s.log.slice(-6).map((l) => `<div>${l}</div>`).join("")}</aside>
  `;
}

export function eventScreen(e: GameEvent): string {
  const choices = e.choices.map((c) =>
    `<button data-act="resolve" data-id="${c.id}">${c.label}</button>`,
  ).join("");
  return `<div class="event-card">
    <h2>${e.title}</h2><p>${e.description}</p><div class="choices">${choices}</div>
  </div>`;
}

export function runEndScreen(s: GameState, score: number): string {
  return `<div class="run-end">
    <h1>Run Over</h1>
    <p>You survived ${s.day} days.</p>
    <p class="score">Score: ${score.toLocaleString()}</p>
    <p>Seed #${s.seed}</p>
    <button data-act="share">Copy score card</button>
    <button data-act="restart">New run</button>
  </div>`;
}
```

- [ ] **Step 2: Define the render dispatcher in `src/ui/render.ts`**

```ts
// src/ui/render.ts
import { GameEvent, GameState } from "../engine/types";
import { score as scoreFn } from "../engine/economy";
import { eventScreen, runEndScreen, stationScreen } from "./screens";

export interface ViewModel {
  state: GameState;
  pendingEvent: GameEvent | null;
}

export function render(root: HTMLElement, vm: ViewModel): void {
  if (vm.state.status === "lost") {
    root.innerHTML = runEndScreen(vm.state, scoreFn(vm.state.peakNetWorth, vm.state.day));
  } else if (vm.pendingEvent) {
    root.innerHTML = eventScreen(vm.pendingEvent);
  } else {
    root.innerHTML = stationScreen(vm.state);
  }
}
```

- [ ] **Step 3: Append layout styles to `src/ui/styles.css`**

```css
#app { max-width: 760px; margin: 0 auto; padding: 16px; }
header h1 { margin: 0 0 8px; }
.stats { display: flex; flex-wrap: wrap; gap: 12px; font-size: 14px; opacity: 0.9; }
section { border: 1px solid #1e2a4a; border-radius: 8px; padding: 12px; margin: 12px 0; }
table { width: 100%; border-collapse: collapse; }
td { padding: 4px 6px; border-bottom: 1px solid #16203c; }
button { background: #2a3c66; color: #e6ecff; border: 0; border-radius: 6px; padding: 6px 10px; margin: 2px; cursor: pointer; }
button:disabled { opacity: 0.4; cursor: not-allowed; }
.routes { display: flex; flex-wrap: wrap; gap: 8px; }
.event-card, .run-end { text-align: center; padding: 40px 20px; }
.run-end .score { font-size: 28px; font-weight: 700; }
.log { font-size: 12px; opacity: 0.7; }
.log div { padding: 2px 0; }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens.ts src/ui/render.ts src/ui/styles.css
git commit -m "feat: DOM render layer (station/event/run-end screens)"
```

---

## Task 12: Wire it together in `main.ts`

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Replace `src/main.ts` with the wiring**

```ts
// src/main.ts
import { dailySeed } from "./engine/rng";
import {
  createGame, buy, sell, refuel, repair, payDebt, acceptMission, jump, resolveChoice, missionsHere,
} from "./engine/game";
import { score as scoreFn } from "./engine/economy";
import { CommodityId, GameEvent, GameState, NodeId } from "./engine/types";
import { render } from "./ui/render";
import { copyShare } from "./ui/share";

const app = document.querySelector<HTMLDivElement>("#app")!;

let state: GameState = createGame(dailySeed(new Date()));
let pendingEvent: GameEvent | null = null;

function paint() {
  render(app, { state, pendingEvent });
}

app.addEventListener("click", async (e) => {
  const btn = (e.target as HTMLElement).closest("button");
  if (!btn) return;
  const act = btn.dataset.act;
  const id = btn.dataset.id;

  switch (act) {
    case "buy": state = buy(state, id as CommodityId, 1); break;
    case "sell": state = sell(state, id as CommodityId, 1); break;
    case "refuel": state = refuel(state, 5); break;
    case "repair": state = repair(state, 20); break;
    case "payDebt": state = payDebt(state, 200); break;
    case "accept": {
      const m = missionsHere(state).find((x) => x.id === id);
      if (m) state = acceptMission(state, m);
      break;
    }
    case "jump": {
      const r = jump(state, id as NodeId);
      state = r.state;
      pendingEvent = r.event;
      break;
    }
    case "resolve": {
      if (pendingEvent) state = resolveChoice(state, pendingEvent, id!);
      pendingEvent = null;
      break;
    }
    case "share": {
      await copyShare({ seed: state.seed, score: scoreFn(state.peakNetWorth, state.day), daysSurvived: state.day });
      break;
    }
    case "restart": {
      state = createGame(dailySeed(new Date()));
      pendingEvent = null;
      break;
    }
  }
  paint();
});

paint();
```

- [ ] **Step 2: Manual browser verification**

Run: `npm run dev`, open the URL. Confirm:
- Station screen shows market, contracts, services, navigate buttons, and the stat bar.
- Buying water then jumping to Vulcan and selling yields profit.
- A jump shows an event card; resolving it returns to the station.
- Refuel/repair/pay-debt buttons change the stats.
- Deliberately burning fuel + credits eventually triggers the Run Over screen with a score and a working "Copy score card" button.

- [ ] **Step 3: Run the full test suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 4: Build for production**

Run: `npm run build`
Expected: `dist/` produced with no errors (this is the static bundle to upload to itch.io).

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire engine to UI — playable vertical slice"
```

---

## Task 13: README and itch.io deploy notes

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Starlight Traders

A daily roguelike trade-run. Buy low, sell high, survive a faucet/sink economy
that constantly drains your wallet. New seed every day — same map for everyone.

## Develop
- `npm install`
- `npm run dev` — local dev server
- `npm test` — run the engine + balance test suite
- `npm run build` — produce static `dist/` for deploy

## Deploy (itch.io)
1. `npm run build`
2. Zip the contents of `dist/` (not the folder itself).
3. On itch.io: new project → Kind "HTML" → upload zip → check "This file will be played in the browser".
4. Set viewport to ~800×640, enable fullscreen button.

## Design
See `docs/superpowers/specs/2026-06-18-starlight-traders-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with dev and itch.io deploy notes"
```

---

## Self-Review Notes

**Spec coverage check:**
- Core loop (turn = jump, sell/buy/refuel/repair/jump) → Tasks 8, 11, 12 ✓
- 3 faucets: delivery missions (Task 6, settle in Task 8), arbitrage (pricing Task 4 + buy/sell Task 8), salvage (event in Tasks 7-8) ✓
- 5 sinks: fuel (Tasks 4, 8), docking fees (Tasks 5, 8), taxes (Tasks 5, 8), repairs (Tasks 5, 7-8), loan interest (Tasks 5, 8) ✓
- 5 nodes + 3 commodities (Task 4) ✓
- 6-event table incl. danger weighting + customs-on-meridian (Task 7) ✓
- Loss condition (stranded + broke) and score formula (Tasks 5, 8) ✓
- Daily seed determinism (Tasks 2, 4, 6, 7) ✓
- Share card with seed/score/days (Task 10) ✓
- Slightly-negative-net-flow tuning validated by archetype sim (Task 9) ✓
- Four screens: station/map(routes folded into station)/event/run-end (Task 11) ✓
- YAGNI: no upgrade tree, multiplayer, accounts, audio — none added ✓

**Note on map screen:** the spec listed Star Map as a separate screen; this plan folds route selection into the station's "Navigate" section to keep the MVP to a single interactive view. This is a deliberate simplification consistent with the vertical-slice goal; a standalone map view is a low-risk post-MVP polish task.

**Type consistency:** `GameState`, `Mission`, `GameEvent`, `CommodityId`, `NodeId` defined once in Task 3 and used consistently. Engine function names (`buy`, `sell`, `refuel`, `repair`, `payDebt`, `acceptMission`, `jump`, `resolveChoice`, `checkLoss`, `missionsHere`) match between definition (Task 8) and callers (Tasks 9, 11, 12).
