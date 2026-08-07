# M3 Round 3 — Star Map + Per-Edge Danger (E2-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move danger from stations to lanes (a 10-entry edge table) and render a clickable star map in the Navigator, so path-planning becomes a real decision class.

**Architecture:** `EDGE_DANGER` in world.ts becomes the single truth for ambush odds; `pirateChance(from, to)` is a table lookup, so the % shown is the % rolled (E1-4 honesty by construction). A new pure string renderer `src/ui/map.ts` draws the SVG map inside the Navigator panel as a pointer-only enhancement (`aria-hidden`); the orb list — now showing per-lane raid % — stays the accessible surface. One-line delegation widen in main.ts lets SVG nodes dispatch the existing jump action.

**Tech Stack:** TypeScript, Vite, Vitest (environment: **node** — all UI tests are string assertions on rendered HTML; there is no jsdom), plain CSS with the tokens in `src/ui/tokens.css`.

**Spec:** [docs/superpowers/specs/2026-08-07-m3-round3-star-map-design.md](../specs/2026-08-07-m3-round3-star-map-design.md)

**Plan-level deviations from the spec (intentional, noted here once):**

1. **Lane tone bands are `<10% safe / <25% warn / ≥25% hot`** (spec said `<20%` for warn). With the authored table (5–8%, 20–22%, 25–30%) the spec's bands leave `warn` empty; these bands map exactly onto the table's three story tiers (patrolled / direct-but-raided / frontier).
2. **No unit test for the main.ts delegation widen** — the spec's "main delegation regression" test needs a DOM and the suite runs in node. Coverage: map markup carries the exact attributes the delegation honors (tested), plus the manual dev-server check in Task 9.

**Conventions used throughout:**

- Run a single test file: `npx vitest run tests/engine/world.test.ts`
- Run everything: `npm test`
- After every implementation step the full suite must be green before committing.
- Alphabetical NodeId order (used by `edgeKey`): `kiruna < meridian < terra < verge < vulcan`.

---

## Task 0: Baseline sweep record (temporary file — never committed)

Capture the pre-change balance bands so Task 8 can show what E2-3 moved.

**Files:**

- Create: `tests/sim/sweep-report.test.ts` (temporary; deleted in Task 8)

- [ ] **Step 1: Write the report spec**

```ts
// tests/sim/sweep-report.test.ts — TEMPORARY observability, not an assertion.
// Prints the 100-seed band summary so the plan can record before/after E2-3.
// Delete this file in Task 8; never commit it.
import { describe, it } from "vitest";
import { Archetype, runArchetype } from "../../src/sim/simulate";

const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);

describe("sweep report (temporary)", () => {
  it("prints per-archetype bands", () => {
    for (const kind of ["cautious", "balanced", "greedy"] as Archetype[]) {
      const rs = SEEDS.map((s) => runArchetype(kind, s));
      const audited = rs.filter((r) => r.status === "audited").length;
      const lost = rs.filter((r) => r.status === "lost").length;
      const peaks = rs.map((r) => r.peakNetWorth).sort((a, b) => a - b);
      console.log(`${kind}: audited=${audited}/100 lost=${lost}/100 medianPeakNW=${peaks[50]}`);
    }
  });
});
```

- [ ] **Step 2: Run it and record the output**

Run: `npx vitest run tests/sim/sweep-report.test.ts`
Expected: PASS, with three `console.log` lines. **Copy those three lines into the "Sweep record" section at the bottom of this plan file, under "Before".**

- [ ] **Step 3: Do NOT commit** — leave the file in the working tree (it is deleted in Task 8). Confirm `git status` shows it untracked and nothing staged.

---

## Task 1: `EDGE_DANGER` table + helpers in world.ts (add-only)

Adds the table and helpers without touching `StationNode.danger` yet, so every task stays green. `pirateChance` still reads the old field until Task 2.

**Files:**

- Modify: `src/engine/world.ts` (after the `DISTANCE` matrix / `fuelCost`, around line 80)
- Test: `tests/engine/world.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/world.test.ts` (extend the existing import from `../../src/engine/world` with the new names):

```ts
import {
  COMMODITIES,
  fuelCost,
  getPrice,
  NODE_IDS,
  EDGE_DANGER,
  edgeKey,
  laneDanger,
  safestApproach,
  riskiestLane,
} from "../../src/engine/world";
```

```ts
describe("EDGE_DANGER (E2-3a)", () => {
  it("has exactly one entry per unordered station pair (10 lanes for 5 nodes)", () => {
    const expected = new Set<string>();
    for (const a of NODE_IDS) {
      for (const b of NODE_IDS) {
        if (a < b) expected.add(edgeKey(a, b));
      }
    }
    expect(new Set(Object.keys(EDGE_DANGER))).toEqual(expected);
    expect(Object.keys(EDGE_DANGER)).toHaveLength(10);
  });

  it("every lane sits in the honesty band [0.05, 0.35] — no lane is ever 0%", () => {
    for (const [key, danger] of Object.entries(EDGE_DANGER)) {
      expect(danger, key).toBeGreaterThanOrEqual(0.05);
      expect(danger, key).toBeLessThanOrEqual(0.35);
    }
  });

  it("laneDanger is order-insensitive and throws on a self-lane (fuelCost's contract)", () => {
    expect(laneDanger("terra", "verge")).toBe(laneDanger("verge", "terra"));
    expect(laneDanger("terra", "verge")).toBeCloseTo(0.25);
    expect(() => laneDanger("terra", "terra")).toThrow();
  });

  it("safestApproach: only The Verge has no safe way in (≥ 0.1)", () => {
    expect(safestApproach("verge")).toBeGreaterThanOrEqual(0.1);
    for (const n of NODE_IDS.filter((n) => n !== "verge")) {
      expect(safestApproach(n), n).toBeLessThan(0.1);
    }
  });

  it("riskiestLane picks the max-danger pair deterministically (tie → key order)", () => {
    expect(riskiestLane()).toEqual(["kiruna", "verge"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/world.test.ts`
Expected: FAIL — `EDGE_DANGER`, `edgeKey`, etc. are not exported.

- [ ] **Step 3: Implement in world.ts**

Insert after the `fuelCost` function (world.ts, after current line 80):

```ts
/**
 * Per-lane ambush odds (E2-3a). Keyed by edgeKey(a, b) — the sorted pair — so an
 * asymmetric lane is unrepresentable. Values ARE the final probability rollEvent
 * uses and the UI shows (E1-4 honesty): no floor-plus-slope formula anywhere.
 *
 * Authored story (spec decision 3): the Terra core triangle and the
 * Terra–Meridian corridor are patrolled space (5–8%); direct approaches to
 * Meridian are raided (20–22%); no approach to The Verge is safe (25–30%).
 * Tests pin every lane to [0.05, 0.35] — no lane is ever "0%".
 */
export type EdgeKey = `${NodeId}-${NodeId}`;

/** Canonical lookup key for an unordered station pair. */
export function edgeKey(a: NodeId, b: NodeId): EdgeKey {
  return (a < b ? `${a}-${b}` : `${b}-${a}`) as EdgeKey;
}

export const EDGE_DANGER: Partial<Record<EdgeKey, number>> = {
  "kiruna-terra": 0.05,
  "meridian-terra": 0.06,
  "terra-vulcan": 0.07,
  "kiruna-vulcan": 0.08,
  "meridian-vulcan": 0.2,
  "kiruna-meridian": 0.22,
  "terra-verge": 0.25,
  "verge-vulcan": 0.28,
  "kiruna-verge": 0.3,
  "meridian-verge": 0.3,
};

/** Ambush odds on the lane between two stations — throws like fuelCost on a missing pair. */
export function laneDanger(a: NodeId, b: NodeId): number {
  const d = EDGE_DANGER[edgeKey(a, b)];
  if (d === undefined) throw new Error(`No lane ${a}<->${b}`);
  return d;
}

/** The safest way into a station — the dossier presence rule keys on this (E2-3, spec decision 5). */
export function safestApproach(id: NodeId): number {
  return Math.min(...NODE_IDS.filter((n) => n !== id).map((n) => laneDanger(id, n)));
}

/** The single most dangerous lane (max EDGE_DANGER; ties broken by sorted key order). */
export function riskiestLane(): [NodeId, NodeId] {
  const keys = (Object.keys(EDGE_DANGER) as EdgeKey[]).sort();
  const top = keys.reduce((a, b) => (EDGE_DANGER[b]! > EDGE_DANGER[a]! ? b : a));
  return top.split("-") as [NodeId, NodeId];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine/world.test.ts` → PASS.
Run: `npm test` → everything else still green (nothing consumes the table yet).

- [ ] **Step 5: Commit**

```bash
git add src/engine/world.ts tests/engine/world.test.ts
git commit -m "feat(engine): add per-lane EDGE_DANGER table (E2-3a)"
```

---

## Task 2: `pirateChance(from, to)` — danger reads the lane everywhere

One signature change, three consumers (rollEvent, navigator orbs, bulletin), all in one task so `tsc` stays green. This is the round's mechanics change: event kinds shift wherever the lane's odds differ from the old destination odds.

**Files:**

- Modify: `src/engine/events.ts:7-14` (pirateChance), `src/engine/events.ts:35` (rollEvent), `src/engine/events.ts:17` (docstring)
- Modify: `src/engine/bulletin.ts:8` (imports), `src/engine/bulletin.ts:40-46` (riskiest line)
- Modify: `src/ui/screens.ts:279` (orb raid %)
- Test: `tests/engine/events.test.ts`, `tests/engine/bulletin.test.ts`, `tests/ui/screens.test.ts`

- [ ] **Step 1: Update the events tests**

In `tests/engine/events.test.ts`:

Replace the `pirateChance` describe block (lines 43–51) with:

```ts
describe("pirateChance (E1-4 honest danger, per-lane since E2-3)", () => {
  it("is the exact per-lane probability rollEvent rolls with — straight from EDGE_DANGER", () => {
    expect(pirateChance("terra", "kiruna")).toBeCloseTo(0.05);
    expect(pirateChance("terra", "meridian")).toBeCloseTo(0.06);
    expect(pirateChance("terra", "vulcan")).toBeCloseTo(0.07);
    expect(pirateChance("vulcan", "meridian")).toBeCloseTo(0.2);
    expect(pirateChance("kiruna", "meridian")).toBeCloseTo(0.22);
    expect(pirateChance("terra", "verge")).toBeCloseTo(0.25);
    expect(pirateChance("kiruna", "verge")).toBeCloseTo(0.3);
    // Symmetric: the lane, not the direction, carries the danger.
    expect(pirateChance("meridian", "terra")).toBe(pirateChance("terra", "meridian"));
  });
});
```

In the "RNG order preservation (E2-4c)" test, change line 78 from:

```ts
const pPirates = pirateChance(to);
```

to:

```ts
const pPirates = pirateChance(from, to);
```

Leave "produces more pirate events on high-danger routes" untouched — terra→verge (25%) vs terra→kiruna (5%) still separates cleanly.

- [ ] **Step 2: Update the bulletin tests**

In `tests/engine/bulletin.test.ts`:

Add `CREW_ROSTER` to the fiction import (line 5):

```ts
import { crewName, capFirst, CREW_ROSTER } from "../../src/engine/fiction";
```

Replace the riskiest-line test (lines 68–74) with:

```ts
it("the riskiest line names today's crew on the most dangerous lane (E2-3d)", () => {
  // Max EDGE_DANGER is the kiruna–verge / meridian–verge tie at 30%;
  // riskiestLane breaks ties by sorted key order → kiruna–verge.
  for (const seed of SEEDS) {
    expect(bulletin(seed)[2]).toBe(
      `${capFirst(crewName(seed))} chatter thick on the Kiruna Belt–The Verge lane`
    );
  }
});

it("the lane line stays within the 70-char budget for every pair and crew", () => {
  const longestCrew = CREW_ROSTER.reduce((a, b) => (b.length > a.length ? b : a));
  for (const a of NODE_IDS) {
    for (const b of NODE_IDS) {
      if (a >= b) continue;
      const line = `${capFirst(longestCrew)} chatter thick on the ${NODES[a].name}–${NODES[b].name} lane`;
      expect(line.length, line).toBeLessThanOrEqual(70);
    }
  }
});
```

- [ ] **Step 3: Update the screens tests**

In `tests/ui/screens.test.ts` (navigator describe, lines 235–254), update the two exact sr-only strings to the new lane numbers (kiruna from terra: 5%; verge from terra: 25%):

```ts
expect(html).toContain(
  '<span class="st-sr-only"> — jump here, 4 fuel · dock 15cr · 5% raid risk · sells taxed 2%</span>'
);
expect(html).toContain(
  '<span class="st-sr-only"> — jump here, 6 fuel · dock 18cr · 25% raid risk · sells taxed 0%</span>'
);
```

And add a new test to the same describe block:

```ts
it("raid % is per-lane: Meridian reads 6% from Terra but 20% from Vulcan (E2-3d)", () => {
  const fromTerra = stationScreen(createGame(42)); // starts at terra
  expect(fromTerra).toContain("5 fuel · dock 45cr · 6% raid risk");
  const fromVulcan = stationScreen({ ...createGame(42), location: "vulcan" });
  expect(fromVulcan).toContain("6 fuel · dock 45cr · 20% raid risk");
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run tests/engine/events.test.ts tests/engine/bulletin.test.ts tests/ui/screens.test.ts`
Expected: FAIL — `pirateChance` still takes one argument; bulletin still says "approach to The Verge"; orb still shows 10%/33%.

- [ ] **Step 5: Implement — events.ts**

Replace lines 7–14 (docstring + `pirateChance`) with:

```ts
/**
 * True chance of a pirate ambush on the from→to lane — the exact band rollEvent
 * uses. Exported so the UI shows the number the engine rolls with (E1-4). Since
 * E2-3 this is a straight EDGE_DANGER lookup: the authored 5% floor means no
 * lane is ever "0%", and the same lane reads the same both directions.
 */
export function pirateChance(from: NodeId, to: NodeId): number {
  return laneDanger(from, to);
}
```

Update the import on line 3 to pull `laneDanger`:

```ts
import { NODE_IDS, laneDanger } from "./world";
```

(`NODES` is no longer used by events.ts after this change — remove it from the import.)

Update the `rollEvent` docstring (line 17): "Hostility scales with destination danger" → "Hostility scales with the lane's danger (E2-3)."

In `rollEvent`, change line 35 from:

```ts
const pPirates = pirateChance(to);
```

to:

```ts
const pPirates = pirateChance(from, to);
```

- [ ] **Step 6: Implement — bulletin.ts**

Change the world import (line 7) to add `riskiestLane`, and drop the events import (line 8) entirely — `pirateChance` is no longer used here:

```ts
import { COMMODITIES, NODES, NODE_IDS, commodityName, getPrice, riskiestLane } from "./world";
```

Replace the riskiest computation and line 3 (lines 40 and 46). Delete:

```ts
const riskiest = NODE_IDS.reduce((a, b) => (pirateChance(b) > pirateChance(a) ? b : a));
```

Insert:

```ts
const [riskA, riskB] = riskiestLane();
```

And change the third returned line from:

```ts
    `${capFirst(crewName(seed))} chatter thick on the approach to ${NODES[riskiest].name}`,
```

to:

```ts
    `${capFirst(crewName(seed))} chatter thick on the ${NODES[riskA].name}–${NODES[riskB].name} lane`,
```

- [ ] **Step 7: Implement — screens.ts orb loop**

Change line 279 from:

```ts
const raid = Math.round(pirateChance(n) * 100);
```

to:

```ts
const raid = Math.round(pirateChance(s.location, n) * 100);
```

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS. If `tests/sim/simulate.test.ts` fails a band here, do not tune yet — note it and continue; Task 8 owns tuning (the sweep gates only mean something once the whole round is in).

- [ ] **Step 9: Commit**

```bash
git add src/engine/events.ts src/engine/bulletin.ts src/ui/screens.ts tests/engine/events.test.ts tests/engine/bulletin.test.ts tests/ui/screens.test.ts
git commit -m "feat(engine): pirate danger reads the lane, not the destination (E2-3a/d)"
```

---

## Task 3: Remove `StationNode.danger` — the table is the single truth

**Files:**

- Modify: `src/engine/types.ts:16` (drop the field)
- Modify: `src/engine/world.ts` (drop `danger:` from all five NODES entries)
- Test: `tests/engine/fiction.test.ts` (rekey the dossier rule)

- [ ] **Step 1: Update the fiction test**

In `tests/engine/fiction.test.ts`, extend the world import (line 51):

```ts
import { NODE_IDS, safestApproach } from "../../src/engine/world";
```

In the "each dossier teaches its station's mechanic" test, update the stale comment (lines 64–66) to:

```ts
// The consequence each station's numbers imply, as a checkable keyword:
// terra fee 1.6× → "fees"; kiruna fee 0.6× → "dock"; vulcan's Verge lane
// runs 28% → "approach"; verge has no safe approach → "raiders";
// meridian tax 0.18 → "18%".
```

And add a new test to the `STATION_DOSSIERS` describe block:

```ts
it("a station with no safe approach voices the danger (E2-3 presence rule)", () => {
  for (const node of NODE_IDS) {
    if (safestApproach(node) >= 0.1) {
      expect(STATION_DOSSIERS[node].toLowerCase()).toMatch(/raider|pirat|danger/);
    }
  }
});
```

- [ ] **Step 2: Run to verify it passes already** (the rule is true today — this is a pin, not a change)

Run: `npx vitest run tests/engine/fiction.test.ts` → PASS.

- [ ] **Step 3: Remove the field**

In `src/engine/types.ts`, delete line 16 from `StationNode`:

```ts
danger: number; // 0..1, scales hostile event chance
```

In `src/engine/world.ts`, delete the `danger: …,` line from each of the five `NODES` entries (`terra`, `kiruna`, `vulcan`, `verge`, `meridian`).

- [ ] **Step 4: Sweep for stragglers**

Run: `grep -rn "\.danger\b\|danger:" src tests --include="*.ts"`
Expected: only `EDGE_DANGER` / `laneDanger` / comment mentions remain. If any code still reads `NODES[x].danger`, fix it (there should be none after Task 2).

- [ ] **Step 5: Run the full suite and the type check**

Run: `npm test` → PASS.
Run: `npx tsc --noEmit` → no errors (vitest doesn't type-check; this catches any missed consumer).

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts src/engine/world.ts tests/engine/fiction.test.ts
git commit -m "refactor(engine): drop StationNode.danger — EDGE_DANGER is the single truth (E2-3)"
```

---

## Task 4: Extract `ORB_COLORS` in art.ts (shared palette for map gradients)

The map's SVG `<radialGradient>` needs the same three color stops the orb CSS gradients use. Extract the stops once so the two can't drift.

**Files:**

- Modify: `src/ui/art.ts:46-52`
- Test: `tests/ui/art.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/ui/art.test.ts` (extend the art import with `ORB_COLORS`):

```ts
import { BACKDROP_SVG, COMMODITY_ACCENT, ORB_ART, ORB_COLORS, iconBox } from "../../src/ui/art";
```

```ts
describe("orb palette (E2-3)", () => {
  it("ORB_ART derives from ORB_COLORS, so the map and orbs share one palette", () => {
    for (const n of NODE_IDS) {
      const [light, mid, dark] = ORB_COLORS[n];
      expect(ORB_ART[n]).toBe(
        `radial-gradient(circle at 35% 30%, ${light}, ${mid} 55%, ${dark} 82%)`
      );
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ui/art.test.ts` → FAIL (`ORB_COLORS` not exported).

- [ ] **Step 3: Implement**

Replace the `ORB_ART` block in `src/ui/art.ts` (lines 45–52) with:

```ts
/** Planet color stops (light, mid, dark) — one source for the orb CSS gradients
 *  and the star map's SVG gradients (E2-3), so the two can't drift. */
export const ORB_COLORS: Record<NodeId, [string, string, string]> = {
  terra: ["#7ec8e3", "#1d4e6e", "#0c2431"],
  kiruna: ["#9aa8b4", "#3a4750", "#161d23"],
  vulcan: ["#e0956a", "#6e3a24", "#26140c"],
  verge: ["#a98fd8", "#4a3378", "#1c1230"],
  meridian: ["#e8c17a", "#7a5a24", "#2b1f0d"],
};

/** Planet art per station (decorative layer — exempt from the functional accent rule). */
export const ORB_ART: Record<NodeId, string> = Object.fromEntries(
  Object.entries(ORB_COLORS).map(([id, [light, mid, dark]]) => [
    id,
    `radial-gradient(circle at 35% 30%, ${light}, ${mid} 55%, ${dark} 82%)`,
  ])
) as Record<NodeId, string>;
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/ui/art.test.ts` → PASS (including the pre-existing "radial-gradient for every station" test — the derived strings are byte-identical to the old literals).

- [ ] **Step 5: Commit**

```bash
git add src/ui/art.ts tests/ui/art.test.ts
git commit -m "refactor(ui): extract ORB_COLORS so map gradients share the orb palette"
```

---

## Task 5: `src/ui/map.ts` — the star map renderer

Pure string renderer, same contract as screens.ts panels: no DOM access, testable in node.

**Files:**

- Create: `src/ui/map.ts`
- Test: `tests/ui/map.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/ui/map.test.ts
import { describe, it, expect } from "vitest";
import { starMap, MAP_LAYOUT, MAP_VIEW } from "../../src/ui/map";
import { createGame } from "../../src/engine/game";
import { NODE_IDS } from "../../src/engine/world";

const atTerra = () => starMap(createGame(42)); // createGame starts at terra

describe("starMap (E2-3c)", () => {
  it("is a pointer-only enhancement: aria-hidden container, nothing focusable", () => {
    const h = atTerra();
    expect(h).toContain('<div class="star-map" aria-hidden="true">');
    expect(h).not.toContain("tabindex");
    expect(h).not.toContain("<button");
  });

  it("renders a jump target per non-current station and none for the current one", () => {
    const h = atTerra();
    for (const id of ["kiruna", "vulcan", "verge", "meridian"]) {
      expect(h).toContain(`data-act="jump" data-id="${id}"`);
    }
    expect(h).not.toContain('data-id="terra"');
    expect(h).toContain("map-node--here");
  });

  it("labels exactly the four incident lanes with fuel and raid %", () => {
    const h = atTerra();
    expect(h.match(/class="map-label/g)).toHaveLength(4);
    expect(h).toContain("4⛽ · 5%"); // terra–kiruna
    expect(h).toContain("5⛽ · 6%"); // terra–meridian
    expect(h).toContain("3⛽ · 7%"); // terra–vulcan
    expect(h).toContain("6⛽ · 25%"); // terra–verge
  });

  it("tone-classes incident lanes by danger band and dims non-incident lanes", () => {
    const fromTerra = atTerra();
    expect(fromTerra.match(/map-edge--safe/g)).toHaveLength(3); // kiruna 5, meridian 6, vulcan 7
    expect(fromTerra.match(/map-edge--hot/g)).toHaveLength(1); // verge 25
    expect(fromTerra.match(/map-edge--far/g)).toHaveLength(6);
    const fromVulcan = starMap({ ...createGame(42), location: "vulcan" });
    expect(fromVulcan.match(/map-edge--warn/g)).toHaveLength(1); // meridian 20
    expect(fromVulcan.match(/map-edge--hot/g)).toHaveLength(1); // verge 28
  });

  it("marks unreachable stations aria-disabled when fuel is short", () => {
    const h = starMap({ ...createGame(42), fuel: 0 });
    expect(h.match(/aria-disabled="true"/g)).toHaveLength(4);
    expect(h.match(/map-node--unreachable/g)).toHaveLength(4);
    expect(atTerra()).not.toContain("map-node--unreachable");
  });

  it("gives Meridian the weenie treatment", () => {
    const h = atTerra();
    expect(h).toContain("map-node--weenie");
    expect(h).toContain('class="map-weenie-halo"');
  });

  it("keeps every lane label inside the viewBox from every location", () => {
    for (const loc of NODE_IDS) {
      const h = starMap({ ...createGame(42), location: loc });
      for (const m of h.matchAll(/<text class="map-label st-num" x="([\d.]+)" y="([\d.]+)"/g)) {
        const x = Number(m[1]);
        const y = Number(m[2]);
        expect(x, `${loc}: x`).toBeGreaterThanOrEqual(0);
        expect(x, `${loc}: x`).toBeLessThanOrEqual(MAP_VIEW.w);
        expect(y, `${loc}: y`).toBeGreaterThanOrEqual(0);
        expect(y, `${loc}: y`).toBeLessThanOrEqual(MAP_VIEW.h);
      }
    }
  });

  it("lays out every station inside the viewBox", () => {
    for (const n of NODE_IDS) {
      expect(MAP_LAYOUT[n].x).toBeGreaterThan(0);
      expect(MAP_LAYOUT[n].x).toBeLessThan(MAP_VIEW.w);
      expect(MAP_LAYOUT[n].y).toBeGreaterThan(0);
      expect(MAP_LAYOUT[n].y).toBeLessThan(MAP_VIEW.h);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ui/map.test.ts` → FAIL (module does not exist).

- [ ] **Step 3: Implement `src/ui/map.ts`**

```ts
// src/ui/map.ts — the Navigator's star map (E2-3c).
//
// Pure string renderer, same contract as screens.ts panels: no DOM access, safe
// to test in node. The map is a pointer-only enhancement — the whole SVG sits in
// an aria-hidden container and adds no focusable elements (SVG shapes are not
// focusable by default; no tabindex anywhere). The orb list below it remains the
// accessible jump surface and carries every fact shown here, so nothing is
// hidden from assistive tech that isn't available in text.
import { GameState, NodeId } from "../engine/types";
import { NODES, NODE_IDS, fuelCost } from "../engine/world";
import { pirateChance } from "../engine/events";
import { ORB_COLORS } from "./art";

export const MAP_VIEW = { w: 640, h: 360 } as const;

/** Hand-laid safe-west/rich-east geometry (spec decision 10). */
export const MAP_LAYOUT: Record<NodeId, { x: number; y: number }> = {
  kiruna: { x: 84, y: 168 },
  vulcan: { x: 238, y: 274 },
  terra: { x: 306, y: 104 },
  meridian: { x: 484, y: 210 },
  verge: { x: 574, y: 66 },
};

const NODE_R = 14;

/** Tone class per danger band — the table's three story tiers (plan deviation 1):
 *  patrolled (<10%), direct-but-raided (<25%), frontier (≥25%). */
function laneTone(p: number): "safe" | "warn" | "hot" {
  return p < 0.1 ? "safe" : p < 0.25 ? "warn" : "hot";
}

/** Label anchor: 45% along the lane from the current node, nudged up — close
 *  enough to "here" to dodge the K5 center pile-up. */
function labelPos(here: { x: number; y: number }, other: { x: number; y: number }) {
  return {
    x: Math.round(here.x + (other.x - here.x) * 0.45),
    y: Math.round(here.y + (other.y - here.y) * 0.45) - 8,
  };
}

function gradientDefs(): string {
  const stops = NODE_IDS.map((n) => {
    const [light, mid, dark] = ORB_COLORS[n];
    return (
      `<radialGradient id="map-orb-${n}" cx="35%" cy="30%" r="75%">` +
      `<stop offset="0%" stop-color="${light}"/>` +
      `<stop offset="55%" stop-color="${mid}"/>` +
      `<stop offset="100%" stop-color="${dark}"/>` +
      `</radialGradient>`
    );
  }).join("");
  return `<defs>${stops}</defs>`;
}

function nodeMarkup(s: GameState, n: NodeId): string {
  const { x, y } = MAP_LAYOUT[n];
  const weenie = n === "meridian" ? " map-node--weenie" : "";
  const halo =
    n === "meridian"
      ? `<circle class="map-weenie-halo" cx="${x}" cy="${y}" r="${NODE_R + 7}"/>`
      : "";
  const orb = `<circle cx="${x}" cy="${y}" r="${NODE_R}" fill="url(#map-orb-${n})"/>`;
  const name = `<text class="map-name" x="${x}" y="${y + NODE_R + 14}">${NODES[n].name}</text>`;
  if (n === s.location) {
    const ring = `<circle class="map-here-ring" cx="${x}" cy="${y}" r="${NODE_R + 5}"/>`;
    return `<g class="map-node map-node--here${weenie}">${halo}${ring}${orb}${name}</g>`;
  }
  const unreachable = s.fuel < fuelCost(s.location, n);
  const cls = unreachable ? " map-node--unreachable" : "";
  const dis = unreachable ? ' aria-disabled="true"' : "";
  return `<g class="map-node${weenie}${cls}" data-act="jump" data-id="${n}"${dis}>${halo}${orb}${name}</g>`;
}

/**
 * The Navigator's star map. Renders all 10 lanes — the 4 incident to the current
 * location emphasized, tone-classed, and labeled `fuel⛽ · raid%`; the other 6
 * dimmed and unlabeled (spec decision 9) — then the 5 station nodes on top.
 */
export function starMap(s: GameState): string {
  const here = MAP_LAYOUT[s.location];
  const lanes: string[] = [];
  const labels: string[] = [];
  for (const a of NODE_IDS) {
    for (const b of NODE_IDS) {
      if (a >= b) continue;
      const pa = MAP_LAYOUT[a];
      const pb = MAP_LAYOUT[b];
      const line = (cls: string) =>
        `<line class="map-edge ${cls}" x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}"/>`;
      if (a !== s.location && b !== s.location) {
        lanes.push(line("map-edge--far"));
        continue;
      }
      const other = a === s.location ? b : a;
      const risk = pirateChance(s.location, other);
      lanes.push(line(`map-edge--${laneTone(risk)}`));
      const lp = labelPos(here, MAP_LAYOUT[other]);
      labels.push(
        `<text class="map-label st-num" x="${lp.x}" y="${lp.y}">` +
          `${fuelCost(s.location, other)}⛽ · ${Math.round(risk * 100)}%</text>`
      );
    }
  }
  const nodes = NODE_IDS.map((n) => nodeMarkup(s, n)).join("");
  return (
    `<div class="star-map" aria-hidden="true">` +
    `<svg viewBox="0 0 ${MAP_VIEW.w} ${MAP_VIEW.h}" xmlns="http://www.w3.org/2000/svg">` +
    `${gradientDefs()}${lanes.join("")}${labels.join("")}${nodes}</svg></div>`
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/ui/map.test.ts` → PASS.
Run: `npm test` → all green (nothing renders the map yet).

- [ ] **Step 5: Commit**

```bash
git add src/ui/map.ts tests/ui/map.test.ts
git commit -m "feat(ui): star map renderer (E2-3c)"
```

---

## Task 6: Render the map in the Navigator + styles

**Files:**

- Modify: `src/ui/screens.ts` (import + `navigatorPanel`, line 270-295)
- Modify: `src/ui/styles.css` (map classes; hook the existing reduced-motion block at line ~480)
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the "stationScreen navigator and cargo" describe in `tests/ui/screens.test.ts`:

```ts
it("renders the star map above the jump orbs (E2-3c)", () => {
  const html = stationScreen(createGame(42));
  expect(html).toContain('<div class="star-map" aria-hidden="true">');
  expect(html.indexOf("star-map")).toBeLessThan(html.indexOf("st-orb-group"));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/ui/screens.test.ts` → FAIL (no star-map in output).

- [ ] **Step 3: Implement — screens.ts**

Add the import near the other ui imports (screens.ts, top of file):

```ts
import { starMap } from "./map";
```

In `navigatorPanel` (line 294), change the return from:

```ts
return panel("Navigator", `${banner}<div class="st-orb-group">${orbs}</div>`);
```

to:

```ts
return panel("Navigator", `${banner}${starMap(s)}<div class="st-orb-group">${orbs}</div>`);
```

(The fuel-warning banner stays first — it is an alert; the map follows; the orb list last.)

- [ ] **Step 4: Implement — styles.css**

Add after the `.st-orb` rules (around line 365), following the existing token conventions:

```css
/* ── Star map (E2-3) ──────────────────────────────────────────────────────
 * Pointer-only enhancement inside the Navigator panel; aria-hidden, so the
 * dimmed far lanes are exempt from the AA contrast floor (decoration). */
.star-map {
  display: block;
  margin-bottom: var(--st-space-3);
}
.star-map svg {
  display: block;
  width: 100%;
  height: auto;
}
.map-edge {
  stroke-width: 1.5;
}
.map-edge--far {
  stroke: rgba(120, 170, 196, 0.16);
  stroke-dasharray: 3 5;
}
.map-edge--safe {
  stroke: var(--st-cyan);
  opacity: 0.55;
}
.map-edge--warn {
  stroke: var(--st-gold);
  opacity: 0.7;
}
.map-edge--hot {
  stroke: var(--st-orange);
  opacity: 0.75;
}
.map-label {
  font-size: 12px;
  fill: var(--st-text-hi);
  text-anchor: middle;
  paint-order: stroke;
  stroke: var(--st-bg-panel-solid);
  stroke-width: 4px;
  stroke-linejoin: round;
}
.map-name {
  font-size: 11px;
  fill: var(--st-text-dim);
  text-anchor: middle;
}
.map-node[data-act] {
  cursor: pointer;
}
.map-node--unreachable {
  opacity: 0.45;
}
.map-node--unreachable[data-act] {
  cursor: default;
}
.map-here-ring {
  fill: none;
  stroke: var(--st-cyan);
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
}
.map-weenie-halo {
  fill: none;
  stroke: var(--st-gold);
  stroke-width: 1.5;
  opacity: 0.6;
  animation: map-weenie-pulse 3.2s ease-in-out infinite;
}
@keyframes map-weenie-pulse {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.8;
  }
}
```

Then add the halo to the existing `@media (prefers-reduced-motion: reduce)` block (line ~480), alongside the rules already there:

```css
.map-weenie-halo {
  animation: none;
}
```

- [ ] **Step 5: Run the full suite**

Run: `npm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens.ts src/ui/styles.css tests/ui/screens.test.ts
git commit -m "feat(ui): render the star map in the Navigator panel (E2-3c)"
```

---

## Task 7: Delegation widen in main.ts

Lets the map's `<g data-act="jump">` dispatch through the existing click handler. No unit test (plan deviation 2 — node test env); the map tests already pin the attributes this path honors (`data-act`, `data-id`, `aria-disabled`), and Task 9 verifies end-to-end in the browser.

**Files:**

- Modify: `src/main.ts:286`

- [ ] **Step 1: Implement**

Change line 286 from:

```ts
const btn = (e.target as HTMLElement).closest("button");
```

to:

```ts
// Buttons, plus any element carrying data-act — the star map's SVG nodes (E2-3c).
const btn = (e.target as Element).closest<HTMLElement | SVGElement>("button, [data-act]");
```

Everything downstream already works for both: the `aria-disabled` guard (line 288) uses `getAttribute`, and `dataset` exists on `SVGElement` via the `HTMLOrSVGElement` mixin. Buttons without `data-act` keep falling through the `act` switch exactly as before.

- [ ] **Step 2: Type-check and run the suite**

Run: `npx tsc --noEmit` → no errors.
Run: `npm test` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(ui): let star-map SVG nodes dispatch actions via delegation (E2-3c)"
```

---

## Task 8: Post-change sweep, tuning contingency, cleanup

**Files:**

- Delete: `tests/sim/sweep-report.test.ts` (the Task 0 temp file)
- Possibly modify: `src/engine/world.ts` (EDGE_DANGER values, only if a gate breaks)

- [ ] **Step 1: Run the balance gates**

Run: `npx vitest run tests/sim/simulate.test.ts`
Expected: PASS — the three property gates (≥95% cautious/balanced audited, greedy deaths in [10, 40], greedy outearns cautious).

- [ ] **Step 2: Run the sweep report and record**

Run: `npx vitest run tests/sim/sweep-report.test.ts`
**Copy the three output lines into the "Sweep record" section below, under "After".**

- [ ] **Step 3: Tuning contingency — only if Step 1 failed**

Retune inside the spec's story (core stays safest, Verge stays hostile, everything in [0.05, 0.35]):

- **Greedy deaths < 10:** raise the frontier — `kiruna-verge` and `meridian-verge` to `0.33`, `verge-vulcan` to `0.3`, `terra-verge` to `0.28`.
- **Greedy deaths > 40:** lower the frontier — `terra-verge` to `0.22`, `verge-vulcan` to `0.25`, both `0.3` lanes to `0.28`.
- **Cautious/balanced audited < 95:** lower the core — `kiruna-vulcan` and `terra-vulcan` to `0.05` (the cautious water loop flies Kiruna⇄Vulcan).

After any retune, update the exact values pinned in tests (`tests/engine/world.test.ts` laneDanger 0.25, `tests/engine/events.test.ts` pirateChance block, `tests/ui/screens.test.ts` raid strings, `tests/ui/map.test.ts` label strings and tone counts) and in the spec's decision-3 table (edit the spec file, note "retuned during Task 8"), then re-run Steps 1–2. Keep `kiruna-verge` a strict-or-tied maximum so `riskiestLane()` and the bulletin test stay valid.

- [ ] **Step 4: Delete the temp report file**

```bash
rm tests/sim/sweep-report.test.ts
```

- [ ] **Step 5: Full suite**

Run: `npm test` → PASS.

- [ ] **Step 6: Commit (only if Step 3 changed anything)**

```bash
git add -A src tests docs/superpowers/specs
git commit -m "balance(engine): retune EDGE_DANGER to hold the sweep gates"
```

---

## Task 9: Docs, verification, ship

**Files:**

- Modify: `docs/ROADMAP.md` (E2-3 row, M3 intro, "Already shipped")
- Modify: `docs/ENGAGEMENT_BACKLOG.md` (E2-3 row)

- [ ] **Step 1: Tick the roadmap**

In `docs/ROADMAP.md`:

- E2-3 row (line 59): change the Notes cell to
  `✅ **Shipped 2026-08-07.** Danger moved to a 10-entry per-lane table; clickable SVG star map in the Navigator; orb metas and bulletin read per-lane.`
- The M3 intro line (line 52): change `**Round 1 closed 2026-08-02; round 2 (E2-4 + P3-1) closed 2026-08-04.** Next up: E2-3 (star map).` to
  `**Round 1 closed 2026-08-02; round 2 closed 2026-08-04; round 3 (E2-3 star map) closed 2026-08-07.** Next up: E2-5 (achievements-lite + calendar), then E2-1 last (sim-gated, bundling P2-2's cost-basis half and E2-2f).`
- Append to the "Already shipped (context)" paragraph: `E2-3 (star map + per-edge danger) shipped 2026-08-07 with M3 round 3.`

In `docs/ENGAGEMENT_BACKLOG.md`, prefix the E2-3 row's "Proposed feature" cell (line 122) with `✅ **Shipped 2026-08-07.**` (same convention as the E2-4 row above it).

- [ ] **Step 2: Full verification (evidence before claims)**

Run each and confirm:

```bash
npm test          # all suites green
npx tsc --noEmit  # clean
npm run lint      # clean
npm run build     # tsc + vite build succeed
```

- [ ] **Step 3: Manual browser check**

Start the dev server (`npm run dev`) and verify in the browser:

1. The Navigator shows the map; current station ringed; Meridian halo glows.
2. Exactly 4 lanes are bright and labeled; labels read `N⛽ · M%` and match the orb metas below.
3. Clicking a map node jumps (event screen appears); clicking the current node's ring does nothing; with fuel 0 (spend it down or start and jump around), unreachable nodes are dimmed and inert.
4. Jump somewhere — the map re-centers its emphasis on the new location and the same destination now shows a different raid % where the lane differs.
5. Keyboard Tab order never enters the map; orbs still fully operable.

- [ ] **Step 4: Commit the docs**

```bash
git add docs/ROADMAP.md docs/ENGAGEMENT_BACKLOG.md
git commit -m "docs: tick E2-3 in ROADMAP and engagement backlog"
```

- [ ] **Step 5: Push / finish per the finishing-a-development-branch skill** (CI runs the suite + Lighthouse; confirm green before calling the round closed).

---

## Sweep record

Filled in during execution (Task 0 / Task 8).

**Before (destination-based danger):**

```
cautious: audited=98/100 lost=2/100 medianPeakNW=0
balanced: audited=100/100 lost=0/100 medianPeakNW=9608
greedy: audited=75/100 lost=25/100 medianPeakNW=11717
```

**After (per-lane danger):**

```
cautious: audited=98/100 lost=2/100 medianPeakNW=0
balanced: audited=100/100 lost=0/100 medianPeakNW=9693
greedy: audited=72/100 lost=28/100 medianPeakNW=10920
```

**Notes:** No retune needed. All three balance gates held on the authored EDGE_DANGER
table (cautious/balanced ≥95% audited; greedy deaths 28 ∈ [10,40]; greedy still
outearns cautious). Moving danger from stations to lanes nudged greedy deaths 25→28
and shaved greedy median peak net worth (11717→10920) as the frontier Verge lanes
(25–30%) bite harder than the old destination model, while the patrolled core lanes
(5–8%) left cautious/balanced survival untouched. EDGE_DANGER values shipped as
authored in Task 1.
