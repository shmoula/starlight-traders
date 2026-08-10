# M3 Round 5 — "The Market Pushes Back" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Milestone 3: sell-side market depth (E2-1), day-independent contract reward anchoring (E2-2f), and cost-basis/unrealized-P&L surfaces (P2-2's remaining half), gated by a re-tuned 100-seed sim sweep.

**Architecture:** Depth is a stateful price input threaded through one seam — a new `saleProceeds` helper in economy.ts that `sell()`, the UI's `netProceeds`, and the `canEscape` escape math all price through. State lives in two new zeroed-by-default `Record<CommodityId, number>` fields on `GameState` (`soldHere`, reset on jump like `boughtHere`; `costBasis`, relieved proportionally on removal). Contract rewards swap their anchor from offer-day destination spot to a noise-free `baselinePrice`. The sim sweep's byte-identity proof is replaced by decay/viability gates against a committed pre-round baseline fixture.

**Tech Stack:** TypeScript, Vite, Vitest. No new dependencies.

**Design spec:** [docs/superpowers/specs/2026-08-10-m3-round5-market-depth-design.md](../specs/2026-08-10-m3-round5-market-depth-design.md)

**Measured facts this plan is built on** (captured 2026-08-10 on master + spec commit, before any change):

- 100-seed sweep baseline (seeds 1–100, archetypes cautious/balanced/greedy):

  | kind     | audited | lost | retired | peakSum | scoreSum | netWorthSum |
  | :------- | ------: | ---: | ------: | ------: | -------: | ----------: |
  | cautious |      98 |    2 |       0 |       0 |    58800 |     −190880 |
  | balanced |     100 |    0 |       0 |  964047 |  1021128 |      961128 |
  | greedy   |      72 |   28 |       0 | 1350101 |  1096619 |      987678 |

- Cautious's `scoreSum` is **exactly** 98 audited runs × 12 days × `SURVIVAL_BONUS_PER_DAY`(50) = 58,800 — its net worth is ≤ 0 in every audited run, so score and `peakSum` carry **zero trading signal** for that archetype. Turtle-decay gates therefore run on `netWorthAtEnd` sums, which is why `sweepSummary` must expose them.
- Bounce line (buy at destination, B→C→B re-qualify, deliver as hauled) vs a 3-day best-arbitrage-with-same-capital comparator over 5,949 generated contracts (seeds 1–100, days 1–6, all origins): **8 outright wins under the current offer-day anchor, 0 under the baseline anchor.** The Task 7 test asserts ≤ 5, so it is red before the anchor swap and green after.

---

## File structure

| File                                         | Change                                                                                                       |
| :------------------------------------------- | :----------------------------------------------------------------------------------------------------------- |
| `src/engine/types.ts`                        | `GameState` gains `soldHere`, `costBasis`                                                                    |
| `src/engine/economy.ts`                      | `MARKET_DEPTH`/`DEPTH_SLOPE`/`DEPTH_FLOOR`, `saleProceeds`; `netSaleProceeds` delegates                      |
| `src/engine/game.ts`                         | createGame zero-init; `sell()` depth + saturation log; `jump()` resets `soldHere`; cost-basis mutation sites |
| `src/engine/world.ts`                        | `baselinePrice`                                                                                              |
| `src/engine/missions.ts`                     | reward anchor swap (one line + comment)                                                                      |
| `src/sim/simulate.ts`                        | `SimResult.netWorthAtEnd`, `sweepSummary`, `viableLoops`                                                     |
| `src/ui/storage.ts`                          | snapshot v4→v5 migration + validation                                                                        |
| `src/ui/screens.ts`                          | depth line + avg-paid/P&L chips in `tradeHubPanel`                                                           |
| `src/ui/styles.css`                          | `.st-market__depth`, `.st-market__pnl`                                                                       |
| `src/main.ts`                                | snapshot literal `version: 4` → `5` (if constructed there — grep)                                            |
| `tests/sim/fixtures/pre-depth-baseline.json` | **Create:** committed sweep baseline                                                                         |
| `tests/sim/simulate.test.ts`                 | baseline exact-match (temporary) → decay/viability gates                                                     |
| `tests/sim/bounce.test.ts`                   | **Create:** bounce-vs-honest-alternative gate                                                                |
| `tests/engine/economy.test.ts`               | depth curve, escape math                                                                                     |
| `tests/engine/game.test.ts`                  | sell/jump depth wiring, saturation log, cost basis                                                           |
| `tests/engine/world.test.ts`                 | `baselinePrice`                                                                                              |
| `tests/engine/missions.test.ts`              | anchor properties                                                                                            |
| `tests/ui/storage.test.ts`                   | v5 snapshot suite                                                                                            |
| `tests/ui/screens.test.ts`                   | depth line + P&L chip rendering                                                                              |

Work on the existing branch `feat/m3-round5-market-depth`.

---

### Task 1: `soldHere` + `costBasis` fields on GameState

**Files:**

- Modify: `src/engine/types.ts` (GameState, after `boughtHere` at :125)
- Modify: `src/engine/game.ts` (`createGame`, :68)
- Modify: `tests/engine/economy.test.ts` (`baseState`, :5) and any other GameState literal the compiler flags
- Test: `tests/engine/game.test.ts`

- [ ] **Step 1: Write the failing test** — in `tests/engine/game.test.ts`, next to the existing createGame assertions:

```ts
describe("market depth + cost basis state (E2-1/P2-2)", () => {
  it("createGame zeroes soldHere and costBasis", () => {
    const s = createGame(42);
    expect(s.soldHere).toEqual({ water: 0, parts: 0, luxury: 0 });
    expect(s.costBasis).toEqual({ water: 0, parts: 0, luxury: 0 });
  });
});
```

- [ ] **Step 2: Run it** — `npx vitest run tests/engine/game.test.ts -t "zeroes soldHere"` — expect FAIL (property missing / TS error).

- [ ] **Step 3: Add the fields.** In `src/engine/types.ts`, inside `GameState` directly after the `boughtHere` member:

```ts
/** Units of each commodity sold at the current dock today — reset on jump (E2-1).
 *  Feeds the market-depth curve: sales past MARKET_DEPTH degrade the price. */
soldHere: Record<CommodityId, number>;
/** Total credits paid for the currently-held units of each commodity (P2-2).
 *  Display/state math only — no game rule reads it. Free cargo (salvage) adds units
 *  at zero cost, honestly diluting the average. */
costBasis: Record<CommodityId, number>;
```

In `src/engine/game.ts` `createGame`, directly after the `boughtHere:` line:

```ts
    soldHere: { water: 0, parts: 0, luxury: 0 },
    costBasis: { water: 0, parts: 0, luxury: 0 },
```

- [ ] **Step 4: Fix compile errors in test fixtures.** Run `npx tsc --noEmit`. Every complete `GameState` literal now fails — known one: `baseState` in `tests/engine/economy.test.ts:5`. Add to each flagged literal (same two lines as createGame):

```ts
    soldHere: { water: 0, parts: 0, luxury: 0 },
    costBasis: { water: 0, parts: 0, luxury: 0 },
```

- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean, then `npm test` — all green (new fields are inert so far; object spreads in game.ts carry them through).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(m3): add soldHere + costBasis state fields (E2-1/P2-2 groundwork)"
```

---

### Task 2: Snapshot v4→v5 migration + validation

**Files:**

- Modify: `src/ui/storage.ts` (`RunSnapshot` :281, migration chain :508, version check :535, `isValidSnapshotState` :358)
- Modify: `src/main.ts` if it constructs a `RunSnapshot` literal (grep `version: 4`)
- Test: `tests/ui/storage.test.ts`

- [ ] **Step 1: Write the failing tests** — mirror the "snapshot v4 (E2-5 records)" suite at `tests/ui/storage.test.ts:575`, reusing that suite's valid-snapshot builder helper:

```ts
describe("snapshot v5 (E2-1 depth + P2-2 basis)", () => {
  it("migrates a v4 snapshot by defaulting soldHere and costBasis", () => {
    // Build a valid snapshot (suite helper), then strip the new fields and mark it v4,
    // exactly how the v3→v4 records test constructs its legacy doc.
    const snap = makeValidSnapshot(); // reuse the suite's existing builder
    const doc = JSON.parse(JSON.stringify(snap));
    doc.version = 4;
    delete doc.state.soldHere;
    delete doc.state.costBasis;
    const parsed = parseSnapshot(JSON.stringify(doc), doc.dateKey);
    expect(parsed).not.toBeNull();
    expect(parsed!.state.soldHere).toEqual({ water: 0, parts: 0, luxury: 0 });
    expect(parsed!.state.costBasis).toEqual({ water: 0, parts: 0, luxury: 0 });
  });

  it("round-trips a v5 snapshot with live depth and basis", () => {
    const snap = makeValidSnapshot();
    snap.state = {
      ...snap.state,
      soldHere: { water: 17, parts: 0, luxury: 0 },
      costBasis: { water: 240, parts: 0, luxury: 0 },
    };
    const parsed = parseSnapshot(JSON.stringify(snap), snap.dateKey);
    expect(parsed!.state.soldHere.water).toBe(17);
    expect(parsed!.state.costBasis.water).toBe(240);
  });

  it("rejects a v5 snapshot with a negative or missing depth counter", () => {
    const snap = makeValidSnapshot();
    const doc = JSON.parse(JSON.stringify(snap));
    doc.state.soldHere = { water: -1, parts: 0, luxury: 0 };
    expect(parseSnapshot(JSON.stringify(doc), doc.dateKey)).toBeNull();
    doc.state.soldHere = { water: 0, parts: 0 }; // luxury missing
    expect(parseSnapshot(JSON.stringify(doc), doc.dateKey)).toBeNull();
  });
});
```

(If the suite's builder is inline rather than a named helper, extract or copy the minimal construction it uses — do not hand-roll a new state shape.)

- [ ] **Step 2: Run** — `npx vitest run tests/ui/storage.test.ts -t "v5"` — expect FAIL (v5 docs rejected: version mismatch).

- [ ] **Step 3: Implement.** In `src/ui/storage.ts`:

`RunSnapshot` (:282): `version: 4` → `version: 5`.

New migration after `migrateV3Records` (:404):

```ts
/** v4 → v5 (E2-1/P2-2): pre-round runs carry no depth or basis state — default them.
 *  A resumed run silently has no memory of today's sales; basis starts blank. */
function migrateV4Depth(state: unknown): void {
  const st = state as { soldHere?: unknown; costBasis?: unknown };
  if (typeof state === "object" && state !== null) {
    if (st.soldHere === undefined) st.soldHere = { water: 0, parts: 0, luxury: 0 };
    if (st.costBasis === undefined) st.costBasis = { water: 0, parts: 0, luxury: 0 };
  }
}
```

Extend `migrateSnapshotToCurrentVersion` (:508) after the v3→v4 step:

```ts
if (p && p.version === 4 && typeof p.state === "object" && p.state !== null) {
  migrateV4Depth(p.state);
  p.version = 5;
}
```

The version guard at :535: `p.version !== 4` → `p.version !== 5`. Update the function's doc comment (:500–506) to mention the v5 step.

In `isValidSnapshotState` (:358), after the `isValidBoughtHere` line:

```ts
if (!allNonNegativeNumbers(st.soldHere, COMMODITY_KEYS)) return false;
if (!allNonNegativeNumbers(st.costBasis, COMMODITY_KEYS)) return false;
```

- [ ] **Step 4: Update snapshot constructors.** `grep -rn "version: 4" src/` — change every `RunSnapshot` literal (expected in `src/main.ts`) to `version: 5`. TypeScript enforces this once the interface changes.

- [ ] **Step 5: Verify** — `npm test` — all green (older-version suites still pass: their docs now migrate one step further).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(m3): snapshot v5 — persist soldHere + costBasis with v4 migration"
```

---

### Task 3: `sweepSummary` + committed pre-depth baseline

**Files:**

- Modify: `src/sim/simulate.ts`
- Create: `tests/sim/fixtures/pre-depth-baseline.json`
- Test: `tests/sim/simulate.test.ts`

- [ ] **Step 1: Extend `SimResult` and add `sweepSummary`** in `src/sim/simulate.ts`:

In `SimResult`, after `score`:

```ts
/** runEnd.netWorthAtEnd (0 if somehow absent) — the decay gates' metric: cautious's
 *  score is pure survival bonus and its peak sits at 0, so only this shows trading. */
netWorthAtEnd: number;
```

In `toResult`, after the `score` line:

```ts
    netWorthAtEnd: s.runEnd?.netWorthAtEnd ?? 0,
```

At the bottom of the file:

```ts
export interface ArchetypeSummary {
  kind: Archetype;
  audited: number;
  lost: number;
  retired: number;
  peakSum: number;
  scoreSum: number;
  netWorthSum: number;
}

/** Aggregate sweep outcomes per archetype — the balance gates' one shared shape. */
export function sweepSummary(seeds: readonly number[]): ArchetypeSummary[] {
  return (["cautious", "balanced", "greedy"] as Archetype[]).map((kind) => {
    const sum: ArchetypeSummary = {
      kind,
      audited: 0,
      lost: 0,
      retired: 0,
      peakSum: 0,
      scoreSum: 0,
      netWorthSum: 0,
    };
    for (const seed of seeds) {
      const r = runArchetype(kind, seed);
      sum.peakSum += r.peakNetWorth;
      sum.scoreSum += r.score;
      sum.netWorthSum += r.netWorthAtEnd;
      if (r.status === "audited") sum.audited++;
      else if (r.status === "lost") sum.lost++;
      else sum.retired++;
    }
    return sum;
  });
}
```

- [ ] **Step 2: Generate the fixture from the real code** (never hand-type it). Temporary dump test, then delete it:

```ts
// tests/sim/__dump.test.ts (TEMPORARY)
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { sweepSummary } from "../../src/sim/simulate";
it("dump", () => {
  const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);
  writeFileSync(
    "tests/sim/fixtures/pre-depth-baseline.json",
    JSON.stringify(sweepSummary(SEEDS), null, 2) + "\n"
  );
});
```

```bash
mkdir -p tests/sim/fixtures
npx vitest run tests/sim/__dump.test.ts && rm tests/sim/__dump.test.ts && cat tests/sim/fixtures/pre-depth-baseline.json
```

Expected contents (verify against the table in the plan header — audited/lost/peakSum/scoreSum must match it exactly; `netWorthSum` expected: cautious −190880, balanced 961128, greedy 987678):

- [ ] **Step 3: Add the temporary exact-match test** at the bottom of `tests/sim/simulate.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { sweepSummary } from "../../src/sim/simulate";

const BASELINE = JSON.parse(
  readFileSync(new URL("./fixtures/pre-depth-baseline.json", import.meta.url), "utf8")
);

describe("pre-depth baseline (E2-1) — replaced by decay gates when depth lands", () => {
  it("sweep matches the recorded baseline exactly", () => {
    expect(sweepSummary(SEEDS)).toEqual(BASELINE);
  });
});
```

- [ ] **Step 4: Verify** — `npx vitest run tests/sim/simulate.test.ts` — 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "test(m3): record pre-depth sweep baseline + sweepSummary helper"
```

---

### Task 4: Depth constants + `saleProceeds`

**Files:**

- Modify: `src/engine/economy.ts`
- Test: `tests/engine/economy.test.ts`

- [ ] **Step 1: Write the failing tests.** In `tests/engine/economy.test.ts` (extend imports with `saleProceeds, MARKET_DEPTH, DEPTH_SLOPE, DEPTH_FLOOR` from economy and `getPrice` from world; `baseState` already exists in this file — Task 1 added the new fields to it):

```ts
describe("market depth curve (E2-1)", () => {
  const at = (soldHere: number, cargo = 60) =>
    baseState({
      location: "kiruna",
      cargo: { water: cargo, parts: 0, luxury: 0 },
      soldHere: { water: soldHere, parts: 0, luxury: 0 },
    });
  const list = () => getPrice(1, 1, "kiruna", "water"); // seed 1, day 1 — baseState's identity

  it("the first MARKET_DEPTH units all sell at list", () => {
    const r = saleProceeds(at(0), "water", MARKET_DEPTH);
    expect(r.gross).toBe(MARKET_DEPTH * list());
    expect(r.atList).toBe(MARKET_DEPTH);
    expect(r.degradedUnits).toBe(0);
  });

  it("units past depth degrade by DEPTH_SLOPE per unit", () => {
    const r = saleProceeds(at(MARKET_DEPTH), "water", 2);
    const l = list();
    expect(r.gross).toBe(
      Math.max(1, Math.round(l * (1 - DEPTH_SLOPE))) +
        Math.max(1, Math.round(l * (1 - 2 * DEPTH_SLOPE)))
    );
    expect(r.atList).toBe(0);
    expect(r.degradedUnits).toBe(2);
  });

  it("degradation floors at DEPTH_FLOOR × list", () => {
    const r = saleProceeds(at(MARKET_DEPTH + 1000), "water", 1);
    expect(r.gross).toBe(Math.max(1, Math.round(list() * DEPTH_FLOOR)));
  });

  it("every unit is worth at least 1cr however deep the market", () => {
    const r = saleProceeds(at(10_000), "water", 30);
    expect(r.gross).toBeGreaterThanOrEqual(30);
  });

  it("a split sale grosses the same as one big sale (positional curve)", () => {
    const whole = saleProceeds(at(0), "water", 30).gross;
    const first = saleProceeds(at(0), "water", 15).gross;
    const second = saleProceeds(at(15), "water", 15).gross;
    expect(first + second).toBe(whole);
  });

  it("the atList/degraded split is positional, not price-based", () => {
    const r = saleProceeds(at(MARKET_DEPTH - 3), "water", 10);
    expect(r.atList).toBe(3);
    expect(r.degradedUnits).toBe(7);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/engine/economy.test.ts` — expect FAIL (no export `saleProceeds`).

- [ ] **Step 3: Implement.** In `src/engine/economy.ts`, after the `taxOnSale` block (:44):

```ts
// --- Market depth (E2-1) -------------------------------------------------------------
// A station absorbs only MARKET_DEPTH units per commodity per day at the listed price;
// each further unit sells at a linearly degraded price with a floor. Deterministic — the
// degraded price is exactly displayable (E1-4 honesty). The spread itself is untouched:
// depth constrains today's flow, not the price function.

export const MARKET_DEPTH = 15; // ⚙ units/commodity/day at list price
export const DEPTH_SLOPE = 0.03; // ⚙ price impact per unit past depth
export const DEPTH_FLOOR = 0.4; // ⚙ degraded price never falls below this × list

/** Sale price of one unit given `t` units already sold here today. */
function depthUnitPrice(list: number, t: number): number {
  const past = Math.max(0, t - MARKET_DEPTH + 1);
  return Math.max(1, Math.round(list * Math.max(DEPTH_FLOOR, 1 - DEPTH_SLOPE * past)));
}

export interface SaleProceeds {
  gross: number;
  /** Units (of this sale) that sold at the listed price — positional, not price-equality. */
  atList: number;
  degradedUnits: number;
}

/**
 * What selling `qty` of `id` here right now grosses, unit by unit down the depth curve —
 * the ONLY copy of the curve. sell(), the UI's netProceeds labels, and the escape math
 * (via netSaleProceeds → liquidationValue → canEscape) all price through this, so no
 * surface can promise proceeds the market won't pay (B-1).
 */
export function saleProceeds(s: GameState, id: CommodityId, qty: number): SaleProceeds {
  const list = getPrice(s.seed, s.day, s.location, id);
  const sold = s.soldHere[id];
  let gross = 0;
  for (let i = 0; i < qty; i++) gross += depthUnitPrice(list, sold + i);
  const atList = Math.min(qty, Math.max(0, MARKET_DEPTH - sold));
  return { gross, atList, degradedUnits: qty - atList };
}
```

(`getPrice`, `GameState`, `CommodityId` are already imported in economy.ts.)

- [ ] **Step 4: Run** — `npx vitest run tests/engine/economy.test.ts` — all PASS. Full `npm test` still green (nothing calls it yet).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(m3): market depth curve — saleProceeds + knobs (E2-1a)"
```

---

### Task 5: Route `netSaleProceeds` through the curve — escape math inherits depth

**Files:**

- Modify: `src/engine/economy.ts` (`netSaleProceeds`, :74)
- Test: `tests/engine/economy.test.ts`

- [ ] **Step 1: Write the failing test** (the E2-2h dishonesty class this prevents: a hold whose spot value affords escape but whose actual liquidation doesn't):

```ts
describe("escape math prices the hold through depth (E2-1/E2-2h)", () => {
  it("a saturated market can strand a ship that spot pricing would call safe", () => {
    // Meridian, tank empty: escape needs cheapestJumpCost(meridian)=5 fuel × 8cr = 40cr.
    // Find a water qty whose UNSATURATED net sale covers the fare…
    const fresh = (qty: number) =>
      baseState({
        location: "meridian",
        fuel: 0,
        credits: 0,
        cargo: { water: qty, parts: 0, luxury: 0 },
      });
    let qty = 1;
    while (netSaleProceeds(fresh(qty), "water", qty) < escapeCost(fresh(qty))) qty++;
    expect(canEscape(fresh(qty))).toBe(true);
    // …then saturate the market: the same hold at the depth floor no longer covers it.
    const saturated = {
      ...fresh(qty),
      soldHere: { water: MARKET_DEPTH + 1000, parts: 0, luxury: 0 },
    };
    // Sanity: floor pricing genuinely undercuts the fare for this qty; grow qty… no —
    // the loop found the MINIMAL qty covering the fare at list, and floor pays ≤ 40% of
    // list, so the saturated sale cannot cover a fare the list sale only just covered.
    expect(netSaleProceeds(saturated, "water", qty)).toBeLessThan(escapeCost(saturated));
    expect(canEscape(saturated)).toBe(false);
  });
});
```

(Add `netSaleProceeds, escapeCost, canEscape` to the economy imports.)

- [ ] **Step 2: Run** — expect FAIL on the final assertion (`canEscape` still spot-prices the hold).

- [ ] **Step 3: Implement.** Replace `netSaleProceeds` (:74):

```ts
/** Net credits a sale of `qty` `id` yields at the current dock — down the depth curve
 *  (E2-1), after the local tax. */
export function netSaleProceeds(state: GameState, id: CommodityId, qty: number): number {
  const { gross } = saleProceeds(state, id, qty);
  return gross - taxOnSale(state.location, gross);
}
```

`liquidationValue`, `canEscape`, `spendableCredits`, and game.ts's `netProceeds`/`maxBuyable`/`buyBlockReason` need **no edits** — they already flow through this function.

- [ ] **Step 4: Run** — `npm test` — all green. (Existing tests keep passing because `soldHere` is still always 0 and single sales ≤ `MARKET_DEPTH` in fixtures price identically. If any fixture sells > 15 units in one call, its expected value changes — update it to the depth-true number and note it in the commit.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(m3): netSaleProceeds prices the depth curve — escape math inherits (E2-1b)"
```

---

### Task 6: Wire `sell()`/`jump()` + saturation log + sweep decay gates

This is the round's economy-moving moment: the temporary exact-match baseline test is replaced by gates **in the same task**.

**Files:**

- Modify: `src/engine/game.ts` (`sell` :230, `jump` :508)
- Modify: `tests/sim/simulate.test.ts`
- Test: `tests/engine/game.test.ts`

- [ ] **Step 1: Write the failing engine tests** in `tests/engine/game.test.ts`:

```ts
describe("sell consumes market depth (E2-1)", () => {
  // createGame(42) starts at terra with 800cr; give it cargo directly.
  const withWater = (qty: number) => {
    const s = createGame(42);
    return { ...s, cargo: { ...s.cargo, water: qty } };
  };

  it("a sale increments soldHere and pays saleProceeds' gross", () => {
    const s = withWater(30);
    const expected = saleProceeds(s, "water", 30);
    const after = sell(s, "water", 30);
    expect(after.soldHere.water).toBe(30);
    expect(after.credits).toBe(s.credits + expected.gross - taxOnSale("terra", expected.gross));
  });

  it("a depth-crossing sale names the saturation in the log", () => {
    const after = sell(withWater(30), "water", 30);
    expect(after.log[after.log.length - 1].msg).toContain(`market saturated after ${MARKET_DEPTH}`);
  });

  it("a within-depth sale logs exactly as before", () => {
    const after = sell(withWater(5), "water", 5);
    expect(after.log[after.log.length - 1].msg).not.toContain("saturated");
    expect(after.log[after.log.length - 1].msg).toMatch(/^Sold 5 .* for \d+cr \(tax \d+\)\.$/);
  });

  it("jump resets soldHere alongside boughtHere", () => {
    const sold = sell(withWater(5), "water", 5);
    const { state } = jump(refuel(sold, 10), "vulcan");
    expect(state.soldHere).toEqual({ water: 0, parts: 0, luxury: 0 });
  });
});
```

(Extend this file's imports with `saleProceeds, MARKET_DEPTH, taxOnSale` from economy.)

- [ ] **Step 2: Run** — `npx vitest run tests/engine/game.test.ts -t "market depth"` — expect FAIL.

- [ ] **Step 3: Implement.** Replace the body of `sell()` (:230–251):

```ts
export function sell(state: GameState, id: CommodityId, qty: number): GameState {
  if (qty <= 0 || state.cargo[id] < qty) return state;
  // E2-1: gross walks the depth curve; the log names the saturation when it bites.
  const { gross, degradedUnits } = saleProceeds(state, id, qty);
  const tax = taxOnSale(state.location, gross);
  let next: GameState = {
    ...state,
    credits: state.credits + gross - tax,
    cargo: { ...state.cargo, [id]: state.cargo[id] - qty },
    boughtHere: { ...state.boughtHere, [id]: Math.max(0, state.boughtHere[id] - qty) },
    soldHere: { ...state.soldHere, [id]: state.soldHere[id] + qty },
  };
  next = trackPayday(next, gross - tax, `${commodityName(id)} at ${NODES[state.location].name}`);
  if (gross - tax >= BIG_TRADE_CR) next = markDay(next, "bigTrade");
  const saturated = degradedUnits > 0 ? ` — market saturated after ${MARKET_DEPTH}` : "";
  return trackPeak(
    withLog(
      next,
      `Sold ${qty} ${commodityName(id)} for ${gross}cr (tax ${tax})${saturated}.`,
      "good",
      gross - tax
    )
  );
}
```

Note the period placement: the base line still ends `(tax N).` — the saturation clause slots in before it. Import `saleProceeds, MARKET_DEPTH` in game.ts (economy import block).

In `jump()` (:513), after the `boughtHere` reset line:

```ts
    soldHere: { water: 0, parts: 0, luxury: 0 },
```

- [ ] **Step 4: Run engine tests** — `npx vitest run tests/engine` — fix any fixture whose sale now crosses depth (expected values move to the depth-true number).

- [ ] **Step 5: Replace the baseline exact-match with decay gates.** In `tests/sim/simulate.test.ts`, delete the Task 3 exact-match `describe` and add:

```ts
describe("market depth decay gates (E2-1) — vs tests/sim/fixtures/pre-depth-baseline.json", () => {
  const base = Object.fromEntries(BASELINE.map((b: { kind: string }) => [b.kind, b]));
  const post = Object.fromEntries(sweepSummary(SEEDS).map((s) => [s.kind, s]));

  it("the water turtle decays: cautious loses measurably more than baseline", () => {
    expect(post.cautious.netWorthSum).toBeLessThanOrEqual(base.cautious.netWorthSum - 15_000);
  });

  it("depth touches monoculture dumps across the board: balanced earns less than baseline", () => {
    expect(post.balanced.netWorthSum).toBeLessThan(base.balanced.netWorthSum);
  });

  it("the map is not collapsed: balanced keeps most of its baseline earnings", () => {
    expect(post.balanced.netWorthSum).toBeGreaterThanOrEqual(0.55 * base.balanced.netWorthSum);
  });
});
```

- [ ] **Step 6: Run the full sim suite** — `npx vitest run tests/sim` — the four pre-existing gates AND the three new gates must all pass.

**Tuning loop (⚙, run until green):** if a gate fails, adjust knobs in `src/engine/economy.ts` — decay too weak → lower `MARKET_DEPTH` or raise `DEPTH_SLOPE`; balanced collapsed or the survival gates (≥95% audited, greedy 10–40% dead) broken → raise `MARKET_DEPTH`, lower `DEPTH_SLOPE`, or raise `DEPTH_FLOOR`. One knob per iteration; re-run `tests/sim` + `tests/engine` each time. If no knob setting satisfies all gates simultaneously, STOP and surface it — the gate constants themselves need a human decision, not silent loosening. Record the final knob values in the commit message.

- [ ] **Step 7: Full suite** — `npm test` — green.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(m3): sell consumes market depth; sweep decay gates replace byte-identity (E2-1)"
```

---

### Task 7: `viableLoops` gate — ≥2 honest loops per day

**Files:**

- Modify: `src/sim/simulate.ts`
- Test: `tests/sim/simulate.test.ts`

- [ ] **Step 1: Write the test** (this is a world property that should already hold — it guards the tuned world from future regressions):

```ts
describe("route viability (E2-1 acceptance)", () => {
  it("every day offers at least 2 profitable first-hold loops at list price", () => {
    for (const seed of SEEDS) {
      for (let day = 1; day <= 11; day++) {
        expect(viableLoops(seed, day), `seed ${seed} day ${day}`).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
```

- [ ] **Step 2: Implement** in `src/sim/simulate.ts` (add `REFUEL_PRICE, dockingFee, MARKET_DEPTH` to its engine imports and `COMMODITIES` to the world import):

```ts
/**
 * Distinct single-jump loops on `day` where a first-hold load (≤ MARKET_DEPTH units, so
 * every unit sells at list) turns a profit net of fuel and the destination dock fee.
 * The E2-1 gate: depth must decay monoculture without collapsing the map into one lane.
 */
export function viableLoops(seed: number, day: number): number {
  let count = 0;
  for (const a of NODE_IDS) {
    for (const b of NODE_IDS) {
      if (a === b) continue;
      const profitable = COMMODITIES.some((c) => {
        const margin = getPrice(seed, day + 1, b, c.id) - getPrice(seed, day, a, c.id);
        return MARKET_DEPTH * margin - fuelCost(a, b) * REFUEL_PRICE - dockingFee(b) > 0;
      });
      if (profitable) count++;
    }
  }
  return count;
}
```

- [ ] **Step 3: Run** — `npx vitest run tests/sim` — PASS. If this gate fails after Task 6's knob tuning (e.g. `MARKET_DEPTH` was lowered a lot), re-enter the Task 6 tuning loop — both gates must hold with one knob set.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test(m3): viable-loops gate — ≥2 honest first-hold loops per day (E2-1)"
```

---### Task 8: E2-2f — `baselinePrice` anchor + bounce gate

The bounce gate is this task's failing-first test: it measures the exploit the anchor swap kills (8 wins today, 0 after — see plan header).

**Files:**

- Modify: `src/engine/world.ts`
- Modify: `src/engine/missions.ts` (:22–23)
- Create: `tests/sim/bounce.test.ts`
- Test: `tests/engine/world.test.ts`, `tests/engine/missions.test.ts`

- [ ] **Step 1: Write the failing bounce gate** — `tests/sim/bounce.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateMissions } from "../../src/engine/missions";
import { COMMODITIES, NODE_IDS, getPrice, fuelCost } from "../../src/engine/world";
import { REFUEL_PRICE, dockingFee } from "../../src/engine/economy";

/** Best single-jump arbitrage profit on `day` with capital K and a 30-unit hold. */
function bestArb(seed: number, day: number, K: number): number {
  let best = 0;
  for (const a of NODE_IDS) {
    for (const b of NODE_IDS) {
      if (a === b) continue;
      for (const c of COMMODITIES) {
        const buyP = getPrice(seed, day, a, c.id);
        const units = Math.min(30, Math.floor(K / buyP));
        const p =
          units * (getPrice(seed, day + 1, b, c.id) - buyP) -
          fuelCost(a, b) * REFUEL_PRICE -
          dockingFee(b);
        if (p > best) best = p;
      }
    }
  }
  return best;
}

describe("contract bounce line (E2-2f)", () => {
  it("buy-at-destination + B→C→B re-qualification beats honest play in ≤5 of ~6k contracts", () => {
    let beats = 0;
    for (let seed = 1; seed <= 100; seed++) {
      for (let day = 1; day <= 6; day++) {
        for (const origin of NODE_IDS) {
          for (const m of generateMissions(seed, day, origin)) {
            if (m.destination === origin || day + 3 > m.deadlineDay) continue;
            const B = m.destination;
            const C = NODE_IDS.filter((n) => n !== B && n !== origin).sort(
              (a, b) => fuelCost(B, a) - fuelCost(B, b)
            )[0];
            const K =
              m.qty * getPrice(seed, day + 1, B, m.commodity) +
              (fuelCost(origin, B) + fuelCost(B, C) + fuelCost(C, B)) * REFUEL_PRICE +
              2 * dockingFee(B) +
              dockingFee(C);
            const bounceProfit = m.reward - K;
            const honest3 =
              bestArb(seed, day, K) + bestArb(seed, day + 1, K) + bestArb(seed, day + 2, K);
            if (bounceProfit > 0 && bounceProfit > honest3) beats++;
          }
        }
      }
    }
    expect(beats).toBeLessThanOrEqual(5);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/sim/bounce.test.ts` — expect FAIL with `beats = 8` (the measured pre-change rate; if the number differs slightly the world changed since measurement — investigate before proceeding).

- [ ] **Step 3: Write the anchor tests.** In `tests/engine/world.test.ts`:

```ts
describe("baselinePrice (E2-2f)", () => {
  it("is basePrice under the station's produce/demand modifiers, no noise", () => {
    expect(baselinePrice("terra", "water")).toBe(20); // no speciality
    expect(baselinePrice("kiruna", "water")).toBe(14); // produces: ×0.7
    expect(baselinePrice("vulcan", "water")).toBe(28); // demands: ×1.4
    expect(baselinePrice("vulcan", "parts")).toBe(84); // produces: ×0.7
    expect(baselinePrice("meridian", "luxury")).toBe(672); // demands: ×1.4
  });
});
```

In `tests/engine/missions.test.ts`:

```ts
describe("reward anchoring (E2-2f)", () => {
  it("rewards never exceed the premium band over the day-independent base", () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (let day = 1; day <= 8; day++) {
        for (const origin of NODE_IDS) {
          for (const m of generateMissions(seed, day, origin)) {
            const base = baselinePrice(m.destination, m.commodity);
            const floor = Math.round(
              MISSION_REWARD_FLOOR_MULT * m.qty * getPrice(seed, day, origin, m.commodity)
            );
            expect(m.reward).toBeLessThanOrEqual(Math.max(Math.round(1.7 * base * m.qty), floor));
            expect(m.reward).toBeGreaterThanOrEqual(
              Math.min(Math.floor(1.3 * base * m.qty), floor)
            );
          }
        }
      }
    }
  });
});
```

- [ ] **Step 4: Implement.** In `src/engine/world.ts`, after `getPrice`:

```ts
/**
 * The day-independent price of `commodity` at `node`: basePrice under the station's
 * produce/demand modifiers with the noise term removed (E2-2f). Mission rewards anchor
 * here, so a volatile offer-day spot can never lock a stale premium into a contract.
 */
export function baselinePrice(node: NodeId, commodity: CommodityId): number {
  const c = COMMODITY_BY_ID[commodity];
  const station = NODES[node];
  let modifier = 1;
  if (station.produces.includes(commodity)) modifier *= PRODUCE_PRICE_MULTIPLIER;
  if (station.demands.includes(commodity)) modifier *= DEMAND_PRICE_MULTIPLIER;
  return Math.max(1, Math.round(c.basePrice * modifier));
}
```

In `src/engine/missions.ts` (:22), replace the `destUnit` line (add `baselinePrice` to the world import; `getPrice` stays — the floor uses it):

```ts
// E2-2f: the premium anchors to the destination's day-independent base, not the
// offer-day spot — a volatility spike can no longer lock in a stale reward the
// player later buys under at the destination. RNG draw order is unchanged.
const destUnit = baselinePrice(destination, commodity);
```

- [ ] **Step 5: Run everything** — `npm test`. The bounce gate now passes (expected `beats = 0`). Any missions/screens test pinning an old reward number: recompute the expectation from `baselinePrice` (composition — commodity/destination/qty/deadline — is unchanged because `getPrice` consumes no shared RNG; only reward values move). The sim sweep is untouched (archetypes never accept contracts) — `tests/sim/simulate.test.ts` must stay green with zero drift.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(m3): contract rewards anchor to day-independent base — bounce line dead (E2-2f)"
```

---

### Task 9: Cost basis engine (P2-2b)

**Files:**

- Modify: `src/engine/game.ts` (`buy` :201, `sell` :230, `settleMissions` :431, `resolveCustoms` :644)
- Test: `tests/engine/game.test.ts`

- [ ] **Step 1: Write the failing tests:**

```ts
describe("cost basis (P2-2)", () => {
  it("buy accumulates the credits paid", () => {
    const s = createGame(42);
    const price = getPrice(s.seed, s.day, s.location, "water");
    const after = buy(buy(s, "water", 3), "water", 2);
    expect(after.costBasis.water).toBe(5 * price);
  });

  it("sell relieves basis proportionally and clamps at zero", () => {
    const s = { ...createGame(42), cargo: { water: 10, parts: 0, luxury: 0 } };
    const withBasis = { ...s, costBasis: { water: 100, parts: 0, luxury: 0 } };
    const after = sell(withBasis, "water", 4);
    expect(after.costBasis.water).toBe(60); // 100 − round(100×4/10)
    const emptied = sell(withBasis, "water", 10);
    expect(emptied.costBasis.water).toBe(0);
  });

  it("free salvage cargo dilutes the average (basis unchanged, units added)", () => {
    // resolveSalvage adds parts at zero cost — no basis mutation site exists for it,
    // which IS the rule: assert the invariant survives a real salvage resolution.
    // Drive a collect through resolveChoice on a seed/day where salvage pays out
    // (hashSeed(seed, day) % SALVAGE_HAZARD_DIVISOR !== 0) — reuse the existing
    // salvage test's fixture seed in this file.
    // expect(after.costBasis.parts).toBe(before.costBasis.parts);
  });

  it("customs confiscation zeroes luxury basis with the cargo", () => {
    const s = {
      ...createGame(42),
      cargo: { water: 0, parts: 0, luxury: 5 },
      costBasis: { water: 0, parts: 0, luxury: 900 },
    };
    const after = resolveChoice(
      s,
      { kind: "customs", title: "", description: "", choices: [{ id: "comply", label: "" }] },
      "comply"
    );
    expect(after.costBasis.luxury).toBe(0);
  });

  it("contract settlement relieves the basis of the removed units", () => {
    // Reuse this file's existing delivery fixture (a state at a mission's destination
    // with qty in cargo); set costBasis[commodity] = 500 before deliver() and assert
    // it drops by round(500 × m.qty / cargoBefore).
  });
});
```

Fill the two comment-marked tests against this file's existing salvage and delivery fixtures — reuse their seeds/mission builders rather than inventing new ones; the assertions are spelled out in the comments.

- [ ] **Step 2: Run** — expect FAIL (basis never moves).

- [ ] **Step 3: Implement.** In `src/engine/game.ts`, next to `withRecords` (:145):

```ts
/** Proportional cost-basis relief for removing `qty` of `id` from the hold (P2-2):
 *  compute BEFORE the cargo decrement; clamped so basis can never go negative. */
function relieveBasis(s: GameState, id: CommodityId, qty: number): Record<CommodityId, number> {
  const held = s.cargo[id];
  const relieved =
    held > 0
      ? Math.min(s.costBasis[id], Math.round((s.costBasis[id] * qty) / held))
      : s.costBasis[id];
  return { ...s.costBasis, [id]: s.costBasis[id] - relieved };
}
```

- `buy()` (:211): add to the `next` literal: `costBasis: { ...state.costBasis, [id]: state.costBasis[id] + cost },`
- `sell()`: add to the `next` literal: `costBasis: relieveBasis(state, id, qty),`
- `settleMissions()` delivery branch (:431): add to the settlement state literal: `costBasis: relieveBasis(s, m.commodity, m.qty),`
- `resolveCustoms()` comply branch (:644): extend the literal with `costBasis: { ...s.costBasis, luxury: 0 },`

Salvage/derelict need no edit — zero-cost acquisition is the absence of a mutation.

- [ ] **Step 4: Run** — `npm test` — green (sim gates unaffected: basis feeds no rule; the sweep numbers must not move — the Task 6 gate tests will catch it if they do).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(m3): cost basis — total-paid with proportional relief (P2-2b)"
```

---

### Task 10: UI — depth line, avg-paid + P&L chips

**Files:**

- Modify: `src/ui/screens.ts` (`tradeHubPanel`, :389–422)
- Modify: `src/ui/styles.css`
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing tests:**

```ts
describe("market depth + P&L surfaces (E2-1c/P2-2b)", () => {
  it("an untouched market names its full depth at list", () => {
    const s = createGame(42);
    const html = stationScreen(s);
    const price = getPrice(s.seed, s.day, s.location, "water");
    expect(html).toContain(`buys ${MARKET_DEPTH} at ${price.toLocaleString()}cr`);
  });

  it("a part-consumed market counts down and warns of the fall", () => {
    const s = { ...createGame(42), soldHere: { water: 6, parts: 0, luxury: 0 } };
    const html = stationScreen(s);
    const price = getPrice(s.seed, s.day, s.location, "water");
    expect(html).toContain(`${MARKET_DEPTH - 6} more at ${price.toLocaleString()}cr, then falling`);
  });

  it("a saturated market shows the exact next-unit price", () => {
    const s = { ...createGame(42), soldHere: { water: MARKET_DEPTH + 4, parts: 0, luxury: 0 } };
    const html = stationScreen(s);
    const next = saleProceeds(s, "water", 1).gross;
    expect(html).toContain(`next unit ${next.toLocaleString()}cr ▼`);
  });

  it("held cargo shows avg paid and a depth-and-tax-honest P&L chip", () => {
    const base = createGame(42);
    const s = {
      ...base,
      cargo: { ...base.cargo, water: 10 },
      costBasis: { water: 100, parts: 0, luxury: 0 },
    };
    const html = stationScreen(s);
    const pnl = netProceeds(s, "water", 10) - 100;
    expect(html).toContain("paid ~10cr/u");
    expect(html).toContain(`${pnl >= 0 ? "▲ +" : "▼ −"}${Math.abs(pnl).toLocaleString()}cr`);
  });

  it("empty rows carry neither basis nor P&L", () => {
    const html = stationScreen(createGame(42));
    expect(html).not.toContain("paid ~");
  });
});
```

(Extend imports: `MARKET_DEPTH, saleProceeds` from economy.)

- [ ] **Step 2: Run** — expect FAIL.

- [ ] **Step 3: Implement.** In `tradeHubPanel` (screens.ts:390), inside the `marketRows` map after the `price` const:

```ts
// E2-1c: exact depth honesty — what the market still buys at list, or the real
// next-unit price once saturated. Numbers come from the engine's one curve.
const sold = s.soldHere[c.id];
const atListLeft = Math.max(0, MARKET_DEPTH - sold);
const depthLine =
  atListLeft === MARKET_DEPTH
    ? `buys ${MARKET_DEPTH} at ${cr(price)}`
    : atListLeft > 0
      ? `${atListLeft} more at ${cr(price)}, then falling`
      : `next unit ${cr(saleProceeds(s, c.id, 1).gross)} ▼`;
// P2-2b: what you paid and what selling the stack here would actually net.
const basis = s.costBasis[c.id];
const pnl = held > 0 ? netProceeds(s, c.id, held) - basis : 0;
const pnlChip =
  held > 0
    ? `<span class="st-market__pnl st-num ${pnl >= 0 ? "tick-up" : "tick-dn"}">paid ~${Math.round(
        basis / held
      )}cr/u · ${pnl >= 0 ? "▲ +" : "▼ −"}${Math.abs(pnl).toLocaleString()}cr</span>`
    : "";
```

Then in the row template: append `<span class="st-market__depth st-num">${depthLine}</span>` inside the `st-market__prices` span (after the buy-price span), and `${pnlChip}` inside the `st-market__held` span (after the `×${held}` text). Extend the two spans' `aria-label`s to include the same facts (e.g. `aria-label="Market price ${price} credits — ${depthLine}"`).

Imports: add `MARKET_DEPTH, saleProceeds` to screens.ts's economy import.

In `src/ui/styles.css`, next to `.st-market__held` (:454):

```css
.st-market__depth {
  display: block;
  font-size: 0.72em;
  opacity: 0.75;
}
.st-market__pnl {
  display: block;
  font-size: 0.72em;
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/ui` — green; then `npm test` full.

- [ ] **Step 5: Eyeball it** — `npm run dev`, open the station screen: sell 20+ water at a demander and watch the depth line count down, flip to the ▼ next-unit price, and the P&L chip track it. No layout breakage at mobile width.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(m3): market depth line + avg-paid/P&L chips (E2-1c + P2-2b)"
```

---

### Task 11: Docs tick + final verification

**Files:**

- Modify: `docs/ROADMAP.md`, `docs/ENGAGEMENT_BACKLOG.md`, `docs/BACKLOG.md`

- [ ] **Step 1: Full verification** (fix anything red before touching docs):

```bash
npm test && npm run lint && npm run build
```

- [ ] **Step 2: Tick the rows.**
  - `ROADMAP.md`: E2-1 row → `✅ **Shipped <date>.**` with one line naming the mechanic + final knob values; P2-2 row → cost-basis half shipped; the M3 intro paragraph (:52) → "Milestone 3 closed <date>"; the "Already shipped" section gains this round's sentence.
  - `ENGAGEMENT_BACKLOG.md`: E2-1 row (:120) → ✅ with the sweep-gate outcome (decayed turtle numbers vs baseline, viable-loops gate); E2-2f row (:132) → ✅ Resolved, noting the bounce gate went 8→0 under the arbitrage comparator.
  - `BACKLOG.md`: P2-2 row (:49) → fully shipped.
- [ ] **Step 3: Commit**

```bash
git add docs && git commit -m "docs(m3): close Milestone 3 — E2-1 + E2-2f + P2-2 shipped"
```

- [ ] **Step 4:** Invoke `superpowers:finishing-a-development-branch` (Lighthouse runs in CI on the PR).

---

## Self-review notes

- **Spec coverage:** decision 1 (Task 6 + settlement untouched — no edit made there for depth, asserted by existing settlement tests paying spot), 2 (Task 4), 3 (Tasks 1/6), 4 (Tasks 4/5), 5 (no task — `cargoValue`/`netWorth` deliberately untouched; nothing edits them), 6 (Task 8), 7 (Task 9), 8/9 (Task 10), 10 (Task 2), 11 (Tasks 3/6/7/8).
- **Type consistency:** `saleProceeds(s, id, qty) → { gross, atList, degradedUnits }` used identically in Tasks 4, 5, 6, 10; `relieveBasis` private to game.ts (Task 9); `sweepSummary`/`viableLoops` exported from simulate.ts (Tasks 3, 6, 7).
- **Known judgment calls for the executor:** Task 2 reuses the storage suite's snapshot builder (named per that file's local convention); Task 8/9 may surface reward-value updates in existing missions/screens expectations — values move, structure doesn't; Task 6's tuning loop is bounded by "stop and surface" rather than silent gate-loosening.
