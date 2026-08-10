# M3 Round 4 — "The Regular" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship E2-5 (12 feats + a 4-week logbook calendar), E2-2g (settlement-order badges), and E2-2j (deposit-free payday stat) with the 100-seed sweep byte-identical.

**Architecture:** A new `engine/feats.ts` registry holds 12 feat definitions; 10 are pure predicates over the finished `GameState`+`RunEnd`, 2 cross-run "ledger" feats are judged in storage. `GameState` gains an append-only `records` field (snapshot v3→v4) capturing the four moment-facts the final state can't reconstruct. The save doc bumps v1→v2 with a `feats` map and a pure `recordFeats`. All surfaces (day-1 Logbook panel, run-end unlock lines, share-card feat line, contract priority badges) are render-only.

**Tech Stack:** TypeScript + Vite, Vitest, no runtime deps. Spec: [2026-08-09-m3-round4-the-regular-design.md](../specs/2026-08-09-m3-round4-the-regular-design.md).

**Round invariant (test-enforced in Task 11):** no price, probability, or payout changes — `runArchetype` output for 100 seeds × 3 archetypes is byte-identical before/after. (The sim never accepts contracts, so E2-2j's stat change is invisible to it; `records` feeds no game rule.)

---

## File structure

| File                                            | Change                                                                                   |
| :---------------------------------------------- | :--------------------------------------------------------------------------------------- |
| `src/engine/types.ts`                           | `RunRecords` interface + `emptyRecords()`; `GameState.records`                           |
| `src/engine/game.ts`                            | `VERGE_LOW_HULL`; records tracking at 5 sites; E2-2j `payout` fix                        |
| `src/engine/feats.ts`                           | **New** — registry, thresholds, `earnedFeats`, `featDef`                                 |
| `src/ui/storage.ts`                             | Snapshot v4 migration + `records` validation; save v2 + `recordFeats`; `calendarCells`   |
| `src/ui/screens.ts`                             | `RunMeta.logbook` + `debrief.newFeats`; `logbookPanel`; run-end feat lines; E2-2g badges |
| `src/ui/share.ts`                               | `ShareData.featNames` + card line                                                        |
| `src/main.ts`                                   | snapshot v4 literal; `recordIfEnded` feats; `buildMeta` logbook; share featNames         |
| `src/ui/styles.css`                             | `.logbook-cal`, `.cal-cell*`, `.feat-*`, `.run-end__feat`, `.contract-prio`              |
| `tests/engine/game.test.ts`                     | records + E2-2j tests                                                                    |
| `tests/engine/feats.test.ts`                    | **New** — per-feat positive/negative tests                                               |
| `tests/ui/storage.test.ts`                      | v2 migration, `recordFeats`, `calendarCells`, snapshot v4                                |
| `tests/ui/screens.test.ts`                      | Logbook, unlock lines, badges                                                            |
| `tests/engine/share.test.ts`                    | feat line                                                                                |
| `docs/ROADMAP.md`, `docs/ENGAGEMENT_BACKLOG.md` | tick rows on land                                                                        |

---

### Task 0: Capture the sim baseline

**Files:**

- Create (temporary): `tests/sim/baseline.probe.test.ts`

- [ ] **Step 1: Write the probe test**

```ts
// tests/sim/baseline.probe.test.ts — TEMPORARY, deleted in Task 11.
// Dumps every archetype × seed result so Task 11 can diff byte-for-byte.
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { runArchetype, Archetype } from "../../src/sim/simulate";

const OUT = process.env.SIM_DUMP ?? "/tmp/sim-dump.json";

it("dumps the 300-run sweep", () => {
  const rows: unknown[] = [];
  for (const k of ["cautious", "balanced", "greedy"] as Archetype[]) {
    for (let seed = 1; seed <= 100; seed++) rows.push({ k, seed, ...runArchetype(k, seed) });
  }
  writeFileSync(OUT, JSON.stringify(rows, null, 1));
});
```

- [ ] **Step 2: Run it against the untouched engine**

Run: `SIM_DUMP=/private/tmp/claude-501/-Users-shmoula-develop-Others-starlight-traders/089ffdd4-bdcd-4198-b5e4-265ce44dfda1/scratchpad/sim-baseline.json npx vitest run tests/sim/baseline.probe.test.ts`
Expected: PASS, baseline JSON written to the scratchpad.

- [ ] **Step 3: Commit the probe (it must exist on the branch for Task 11)**

```bash
git add tests/sim/baseline.probe.test.ts
git commit -m "test(sim): temporary byte-identity probe for round 4"
```

---

### Task 1: `RunRecords` on GameState + engine tracking

**Files:**

- Modify: `src/engine/types.ts` (after `LogEntry`, before `GameState`)
- Modify: `src/engine/game.ts`
- Test: `tests/engine/game.test.ts`

- [ ] **Step 1: Write the failing tests** — append a describe block to `tests/engine/game.test.ts`. It already imports `createGame`; extend its imports to include `arrive`, `payDebt`, `buy`, `resolveChoice`, and add `import { fleeDamage } from "../../src/engine/preview";` and `import { GameEvent } from "../../src/engine/types";` if not present (check the file head first — most already exist).

```ts
describe("run records (E2-5 moment facts)", () => {
  const PIRATE_EVENT: GameEvent = {
    kind: "pirates",
    title: "",
    description: "",
    choices: [
      { id: "pay", label: "" },
      { id: "flee", label: "" },
    ],
  };

  it("a fresh run starts with empty records and terra visited", () => {
    const s = createGame(42);
    expect(s.records).toEqual({
      vergeAtLowHull: false,
      visited: ["terra"],
      damageTaken: 0,
      fullHold: false,
      pirateAmbushes: 0,
    });
  });

  it("payDebt records the day the books first hit zero — once", () => {
    const s = { ...createGame(42), credits: 5000, debt: 100, day: 4 };
    const cleared = payDebt(s, 200);
    expect(cleared.debt).toBe(0);
    expect(cleared.records.debtClearedDay).toBe(4);
    // paying again (a no-op) must not move the recorded day
    expect(payDebt({ ...cleared, day: 6 }, 200).records.debtClearedDay).toBe(4);
  });

  it("a partial payment does not record a cleared day", () => {
    const s = { ...createGame(42), credits: 5000, debt: 900 };
    expect(payDebt(s, 200).records.debtClearedDay).toBeUndefined();
  });

  it("arrive() adds each station to visited exactly once", () => {
    const s = { ...createGame(42), location: "kiruna" as const };
    const once = arrive(s).state;
    expect(once.records.visited).toEqual(["terra", "kiruna"]);
    expect(arrive(once).state.records.visited).toEqual(["terra", "kiruna"]);
  });

  it("arrive() at the Verge below the threshold flags vergeAtLowHull", () => {
    const s = { ...createGame(42), location: "verge" as const, hull: 15 };
    expect(arrive(s).state.records.vergeAtLowHull).toBe(true);
  });

  it("arrive() at the Verge with healthy hull does not flag it", () => {
    const s = { ...createGame(42), location: "verge" as const };
    expect(arrive(s).state.records.vergeAtLowHull).toBe(false);
  });

  it("fleeing pirates tallies damage and the ambush", () => {
    const s = createGame(42);
    const fled = resolveChoice(s, PIRATE_EVENT, "flee");
    expect(fled.records.damageTaken).toBe(fleeDamage(s.day));
    expect(fled.records.pirateAmbushes).toBe(1);
  });

  it("paying pirates tallies the ambush but no damage", () => {
    const paid = resolveChoice(createGame(42), PIRATE_EVENT, "pay");
    expect(paid.records.pirateAmbushes).toBe(1);
    expect(paid.records.damageTaken).toBe(0);
  });

  it("filling the hold flags fullHold", () => {
    const s = { ...createGame(42), credits: 100_000 };
    const full = buy(s, "water", s.cargoCapacity);
    expect(full.records.fullHold).toBe(true);
    expect(buy(s, "water", 1).records.fullHold).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/engine/game.test.ts`
Expected: FAIL — `s.records` is undefined (property does not exist).

- [ ] **Step 3: Add the type** — in `src/engine/types.ts`, insert after the `LogEntry` interface:

```ts
/**
 * Moment facts the finished state can't reconstruct — feeds the E2-5 feat predicates
 * and nothing else (no game rule ever reads records). Append-only during a run;
 * persisted in the run snapshot (v4), so moment feats survive a same-day refresh.
 */
export interface RunRecords {
  /** Game day debt first reached 0, if it ever did. */
  debtClearedDay?: number;
  /** Docked at the Verge with hull below VERGE_LOW_HULL. */
  vergeAtLowHull: boolean;
  /** Stations docked at this run, in first-visit order; starts with the boot station. */
  visited: NodeId[];
  /** Total hull points lost this run (repairs don't subtract). */
  damageTaken: number;
  /** The hold reached capacity at least once. */
  fullHold: boolean;
  /** Pirate ambushes resolved this run — paid or fled. */
  pirateAmbushes: number;
}

/** Blank records — createGame seeds `visited` with the boot station on top of this. */
export function emptyRecords(): RunRecords {
  return { vergeAtLowHull: false, visited: [], damageTaken: 0, fullHold: false, pirateAmbushes: 0 };
}
```

and add to `GameState` (after `dayHighlights`):

```ts
/** Feat-relevant moment facts (E2-5); append-only, never read by game rules. */
records: RunRecords;
```

- [ ] **Step 4: Track in game.ts** — all edits to `src/engine/game.ts`:

(a) Import `RunRecords`, `emptyRecords` from `./types` (extend the existing import list). Add near `STARTING`:

```ts
/** Hull threshold for the Verge Runner feat (E2-5) — a docking below this is "limping in". */
export const VERGE_LOW_HULL = 20;
```

(b) In `createGame`'s returned object, after `dayHighlights: {}`:

```ts
    records: { ...emptyRecords(), visited: ["terra"] },
```

(c) Add helpers after `markDay`:

```ts
/** Merge feat-relevant moment facts (E2-5). Append-only; game rules never read these. */
function withRecords(s: GameState, patch: Partial<RunRecords>): GameState {
  return { ...s, records: { ...s.records, ...patch } };
}

/** Subtract hull and tally the loss — every damage site routes here so "Not a Scratch"
 *  can trust damageTaken. Deliberately unclamped, matching the sites it replaces:
 *  checkHullDeath floors and ends the run. */
function withHullDamage(s: GameState, dmg: number): GameState {
  return withRecords({ ...s, hull: s.hull - dmg }, { damageTaken: s.records.damageTaken + dmg });
}

/** Flag a hold that just reached capacity (E2-5 Full House). Upgrade-only. */
function trackFullHold(s: GameState): GameState {
  if (s.records.fullHold || cargoUsed(s.cargo) < s.cargoCapacity) return s;
  return withRecords(s, { fullHold: true });
}
```

(d) `buy()` — wrap the logged state in `trackFullHold`. The return becomes:

```ts
return keepEscapable(
  state,
  trackPeak(
    withLog(
      trackFullHold(next),
      `Bought ${qty} ${commodityName(id)} for ${cost}cr.`,
      "neutral",
      -cost
    )
  )
);
```

(e) `payDebt()` — record the first zero. Replace the `return keepEscapable(...)` with:

```ts
let next = withLog(
  { ...state, debt: state.debt - pay, credits: state.credits - pay },
  `Paid down ${pay}cr of debt.`,
  "good",
  -pay
);
// E2-5: the day the books first hit zero is a feat fact — recorded once, then frozen.
if (next.debt === 0 && next.records.debtClearedDay === undefined) {
  next = withRecords(next, { debtClearedDay: next.day });
}
return keepEscapable(state, trackPeak(next));
```

(f) `arrive()` — record the docking before the day-close branch. After `let s = trackPeak(settled.state);` insert:

```ts
// E2-5 moment facts: this arrival is a real docking, whatever the day check decides next.
if (!s.records.visited.includes(s.location)) {
  s = withRecords(s, { visited: [...s.records.visited, s.location] });
}
if (s.location === "verge" && s.hull < VERGE_LOW_HULL && !s.records.vergeAtLowHull) {
  s = withRecords(s, { vergeAtLowHull: true });
}
```

(g) `resolvePirates()` — count the ambush and route flee damage through the tally. The function becomes:

```ts
function resolvePirates(s: GameState, choiceId: string): GameState {
  const marked = withRecords(markDay(s, "pirates"), {
    pirateAmbushes: s.records.pirateAmbushes + 1,
  });
  const crew = crewName(marked.seed);
  if (choiceId === "pay") {
    const toll = pirateToll(marked);
    return withLog(
      { ...marked, credits: marked.credits - toll },
      `Paid ${crew} ${toll}cr to pass.`,
      "bad",
      -toll
    );
  }
  const dmg = fleeDamage(marked.day);
  return withLog(withHullDamage(marked, dmg), `Outran ${crew} — took ${dmg} hull damage.`, "bad");
}
```

(h) `resolveSalvage()` — trap damage through the tally, loot through fullHold:

```ts
if (hashSeed(s.seed, s.day) % SALVAGE_HAZARD_DIVISOR === 0) {
  return withLog(
    withHullDamage(s, SALVAGE_TRAP_DAMAGE),
    `Salvage hid a live warhead: -${SALVAGE_TRAP_DAMAGE} hull.`,
    "bad"
  );
}
const got = salvageAmount(s);
return got > 0
  ? withLog(
      trackFullHold({ ...s, cargo: { ...s.cargo, parts: s.cargo.parts + got } }),
      `Salvaged ${got} ${commodityName("parts")}.`,
      "good"
    )
  : withLog(s, `Hold full — left the salvage drifting.`, "neutral");
```

(i) `resolveEngine()` — the return becomes:

```ts
return withLog(withHullDamage({ ...s, fuel: s.fuel - burn }, strain), msg, "bad");
```

(j) `resolveDerelict()` trap branch:

```ts
return withLog(
  withHullDamage(s, DERELICT_TRAP_DAMAGE),
  `Derelict was a trap: -${DERELICT_TRAP_DAMAGE} hull.`,
  "bad"
);
```

- [ ] **Step 5: Run the new tests, then the full suite**

Run: `npx vitest run tests/engine/game.test.ts` → PASS.
Run: `npx vitest run` — expect failures ONLY where tests hand-build a `GameState` without `records` (TypeScript object-literal errors) — fix each by spreading `createGame(...)` (preferred, most already do) or adding `records: { ...emptyRecords(), visited: [...] }`. `tests/ui/storage.test.ts` snapshot fixtures will fail at Task 2 anyway — if they type-error here, add the field now.

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts src/engine/game.ts tests/
git commit -m "feat(e2-5a): GameState.records — moment facts for feat predicates"
```

---

### Task 2: Snapshot v4 (records ride the same-day resume)

**Files:**

- Modify: `src/ui/storage.ts`, `src/main.ts:113` (`syncSnapshot` version literal)
- Test: `tests/ui/storage.test.ts`

- [ ] **Step 1: Write the failing tests** — the existing suite builds `RunSnapshot` fixtures; find its snapshot helper (it constructs `{ version: 3, ... }`) and bump it to `version: 4` with `state: createGame(...)` (which now carries records). Add:

```ts
describe("snapshot v4 (E2-5 records)", () => {
  // Reuse the suite's existing valid-snapshot builder; the point is the version chain.
  function v3Raw(): string {
    const snap = validSnapshot(); // the suite's existing helper, whatever its name is
    const state = { ...snap.state } as Record<string, unknown>;
    delete state.records;
    return JSON.stringify({ ...snap, version: 3, state });
  }

  it("migrates a v3 snapshot by defaulting records", () => {
    const parsed = parseSnapshot(v3Raw(), TODAY);
    expect(parsed).not.toBeNull();
    expect(parsed!.state.records).toEqual({
      vergeAtLowHull: false,
      visited: [],
      damageTaken: 0,
      fullHold: false,
      pirateAmbushes: 0,
    });
  });

  it("rejects a v4 snapshot whose records are corrupt", () => {
    const snap = validSnapshot();
    const broken = {
      ...snap,
      state: { ...snap.state, records: { ...snap.state.records, visited: "terra" } },
    };
    expect(parseSnapshot(JSON.stringify(broken), TODAY)).toBeNull();
  });

  it("round-trips a v4 snapshot with live records", () => {
    const snap = validSnapshot();
    snap.state = {
      ...snap.state,
      records: { ...snap.state.records, damageTaken: 12, pirateAmbushes: 2 },
    };
    const parsed = parseSnapshot(JSON.stringify(snap), TODAY);
    expect(parsed!.state.records.damageTaken).toBe(12);
  });
});
```

(`validSnapshot`/`TODAY` = the suite's existing names — read the file and match them; do not invent a parallel builder.)

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/ui/storage.test.ts` → FAIL (version 3 rejected / records missing).

- [ ] **Step 3: Implement in `src/ui/storage.ts`**

(a) Extend the types import with `RunRecords`, `emptyRecords`, and change `RunSnapshot.version` to `4`.

(b) Add after `migrateV2Contracts`:

```ts
/** v3 → v4 (E2-5): pre-round runs carry no records — default them. A migrated run
 *  silently can't earn moment feats that day; run-end and ledger feats still can. */
function migrateV3Records(state: unknown): void {
  const st = state as { records?: unknown };
  if (typeof state === "object" && state !== null && st.records === undefined) {
    st.records = emptyRecords();
  }
}
```

(c) In `migrateSnapshotToCurrentVersion`, append:

```ts
if (p && p.version === 3 && typeof p.state === "object" && p.state !== null) {
  migrateV3Records(p.state);
  p.version = 4;
}
```

(d) In `parseSnapshot`, change the guard `p.version !== 3` → `p.version !== 4`.

(e) Add validation (records are load-bearing: `arrive` indexes `visited` on every jump). After `hasValidMissionFields`:

```ts
/** Records feed `arrive`'s visited lookup and the feat predicates — validate like the
 *  contract ledger: finite non-negative counters, real booleans, known node ids. */
const RECORD_COUNTER_KEYS = ["damageTaken", "pirateAmbushes"];
function isValidRecords(r: unknown): boolean {
  if (!allNonNegativeNumbers(r, RECORD_COUNTER_KEYS)) return false;
  const rec = r as Partial<RunRecords>;
  if (typeof rec.vergeAtLowHull !== "boolean" || typeof rec.fullHold !== "boolean") return false;
  if (
    rec.debtClearedDay !== undefined &&
    !(Number.isSafeInteger(rec.debtClearedDay) && rec.debtClearedDay >= 1)
  ) {
    return false;
  }
  return Array.isArray(rec.visited) && rec.visited.every((n) => NODE_IDS.includes(n as NodeId));
}
```

and in `isValidSnapshotState`, after the `hasValidMissionFields` line: `if (!isValidRecords(st.records)) return false;`

(f) `src/main.ts` `syncSnapshot`: `version: 3` → `version: 4`.

- [ ] **Step 4: Run** — `npx vitest run tests/ui/storage.test.ts` → PASS; then `npx vitest run` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/storage.ts src/main.ts tests/ui/storage.test.ts
git commit -m "feat(e2-5a): snapshot v4 — records survive the same-day resume"
```

---

### Task 3: Feat registry (`engine/feats.ts`)

**Files:**

- Create: `src/engine/feats.ts`
- Test: `tests/engine/feats.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

```ts
// tests/engine/feats.test.ts
import { describe, it, expect } from "vitest";
import {
  FEATS,
  LEDGER_FEAT_IDS,
  earnedFeats,
  featDef,
  CLEAN_SWEEP_DELIVERIES,
  GAUNTLET_AMBUSHES,
  HIGH_ROLLER_SCORE,
} from "../../src/engine/feats";
import { createGame, VERGE_LOW_HULL } from "../../src/engine/game";
import { endRun } from "../../src/engine/run-end";
import { GameState } from "../../src/engine/types";

/** A finished (banked) state with record/field overrides applied before the audit. */
function ended(
  overrides: Partial<GameState> = {},
  status: "audited" | "retired" | "lost" = "audited"
): GameState {
  const s = { ...createGame(42), day: 12, ...overrides };
  return status === "lost" ? endRun(s, "lost", "x", "hull") : endRun(s, status, "x");
}
const rec = (patch: Partial<GameState["records"]>): Partial<GameState> => ({
  records: { ...createGame(42).records, ...patch },
});

describe("registry shape", () => {
  it("holds exactly 12 feats with unique ids", () => {
    expect(FEATS).toHaveLength(12);
    expect(new Set(FEATS.map((f) => f.id)).size).toBe(12);
  });
  it("every name fits the 20-char share budget", () => {
    for (const f of FEATS) expect(f.name.length).toBeLessThanOrEqual(20);
  });
  it("exactly the two ledger feats carry no predicate", () => {
    const noPredicate = FEATS.filter((f) => f.earned === undefined).map((f) => f.id);
    expect(noPredicate.sort()).toEqual([...LEDGER_FEAT_IDS].sort());
  });
  it("featDef resolves every id", () => {
    for (const f of FEATS) expect(featDef(f.id)).toBe(f);
  });
});

describe("earnedFeats", () => {
  it("is empty while the run is playing", () => {
    expect(earnedFeats(createGame(42))).toEqual([]);
  });
  it("audited: earned by an audit, not by a retire", () => {
    expect(earnedFeats(ended())).toContain("audited");
    expect(earnedFeats(ended({}, "retired"))).not.toContain("audited");
  });
  it("clean-sweep: needs the delivery count", () => {
    const c = { delivered: CLEAN_SWEEP_DELIVERIES, expired: 0, forfeitedCr: 0 };
    expect(earnedFeats(ended({ contracts: c }))).toContain("clean-sweep");
    expect(
      earnedFeats(ended({ contracts: { ...c, delivered: CLEAN_SWEEP_DELIVERIES - 1 } }))
    ).not.toContain("clean-sweep");
  });
  it("debt-free-8: cleared day 8 counts, day 9 doesn't, never doesn't", () => {
    expect(earnedFeats(ended(rec({ debtClearedDay: 8 })))).toContain("debt-free-8");
    expect(earnedFeats(ended(rec({ debtClearedDay: 9 })))).not.toContain("debt-free-8");
    expect(earnedFeats(ended())).not.toContain("debt-free-8");
  });
  it("clean-books: banked with zero debt; a debt-free death doesn't count", () => {
    expect(earnedFeats(ended({ debt: 0 }))).toContain("clean-books");
    expect(earnedFeats(ended({ debt: 1 }))).not.toContain("clean-books");
    expect(earnedFeats(ended({ debt: 0 }, "lost"))).not.toContain("clean-books");
  });
  it("verge-runner: the low-hull docking must be survived", () => {
    expect(earnedFeats(ended(rec({ vergeAtLowHull: true })))).toContain("verge-runner");
    expect(earnedFeats(ended(rec({ vergeAtLowHull: true }), "lost"))).not.toContain("verge-runner");
    expect(earnedFeats(ended())).not.toContain("verge-runner");
  });
  it("untouched: zero damage banked; any damage or a loss disqualifies", () => {
    expect(earnedFeats(ended())).toContain("untouched");
    expect(earnedFeats(ended(rec({ damageTaken: 1 })))).not.toContain("untouched");
    expect(earnedFeats(ended({}, "lost"))).not.toContain("untouched");
  });
  it("full-house and grand-tour read their records", () => {
    expect(earnedFeats(ended(rec({ fullHold: true })))).toContain("full-house");
    expect(earnedFeats(ended())).not.toContain("full-house");
    const allFive = ["terra", "kiruna", "vulcan", "verge", "meridian"] as const;
    expect(earnedFeats(ended(rec({ visited: [...allFive] })))).toContain("grand-tour");
    expect(earnedFeats(ended())).not.toContain("grand-tour");
  });
  it("gauntlet: the ambush count must be survived", () => {
    expect(earnedFeats(ended(rec({ pirateAmbushes: GAUNTLET_AMBUSHES })))).toContain("gauntlet");
    expect(earnedFeats(ended(rec({ pirateAmbushes: GAUNTLET_AMBUSHES - 1 })))).not.toContain(
      "gauntlet"
    );
    expect(earnedFeats(ended(rec({ pirateAmbushes: GAUNTLET_AMBUSHES }), "lost"))).not.toContain(
      "gauntlet"
    );
  });
  it("high-roller keys on the banked score", () => {
    expect(earnedFeats(ended({ credits: HIGH_ROLLER_SCORE + 5000 }))).toContain("high-roller");
    expect(earnedFeats(ended({ credits: 0 }))).not.toContain("high-roller");
  });
  it("hints reference the live thresholds", () => {
    expect(featDef("verge-runner").hint).toContain(String(VERGE_LOW_HULL));
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/engine/feats.test.ts` → FAIL (module not found).

- [ ] **Step 3: Create `src/engine/feats.ts`**

```ts
// src/engine/feats.ts
//
// E2-5 feat registry — named recognition, no rewards attached (the backlog's
// no-dark-patterns constraint). Ten run feats are pure predicates over the finished
// state; the two ledger feats (cross-run facts) carry no predicate here — storage's
// recordFeats is the only place they can be judged. Evaluated exactly once, at run end.
import { GameState, RunEnd } from "./types";
import { NODE_IDS } from "./world";
import { VERGE_LOW_HULL } from "./game";

export type FeatId =
  | "first-flight"
  | "audited"
  | "clean-sweep"
  | "debt-free-8"
  | "clean-books"
  | "verge-runner"
  | "untouched"
  | "full-house"
  | "grand-tour"
  | "gauntlet"
  | "high-roller"
  | "regular";

// ⚙ tuning knobs — thresholds live here, next to the copy that quotes them.
export const CLEAN_SWEEP_DELIVERIES = 3;
export const DEBT_FREE_DAY = 8;
export const GAUNTLET_AMBUSHES = 3;
export const REGULAR_DAYS_FLOWN = 7;
/** ⚙ set from the sweep's banked-score p90 in this round's tuning task. */
export const HIGH_ROLLER_SCORE = 6000;

export interface FeatDef {
  id: FeatId;
  /** ≤ 20 chars, test-enforced — the share card quotes it on one line. */
  name: string;
  /** Unearned-state copy: the invitation shown dimmed in the Logbook roster. */
  hint: string;
  /** Run feats only; absent on the two ledger feats. */
  earned?(s: GameState, r: RunEnd): boolean;
}

const banked = (r: RunEnd) => r.status !== "lost";

export const FEATS: readonly FeatDef[] = [
  { id: "first-flight", name: "First Flight", hint: "Complete your first run." },
  {
    id: "audited",
    name: "Face the Audit",
    hint: "Reach the day-12 audit alive.",
    earned: (s, r) => r.status === "audited",
  },
  {
    id: "clean-sweep",
    name: "Clean Sweep",
    hint: `${CLEAN_SWEEP_DELIVERIES} deliveries in one run.`,
    earned: (s) => s.contracts.delivered >= CLEAN_SWEEP_DELIVERIES,
  },
  {
    id: "debt-free-8",
    name: "Out From Under",
    hint: `Clear the debt by day ${DEBT_FREE_DAY}.`,
    earned: (s) =>
      s.records.debtClearedDay !== undefined && s.records.debtClearedDay <= DEBT_FREE_DAY,
  },
  {
    id: "clean-books",
    name: "Clean Books",
    hint: "Bank a run owing nothing.",
    earned: (s, r) => banked(r) && s.debt === 0,
  },
  {
    id: "verge-runner",
    name: "Verge Runner",
    hint: `Dock at the Verge under ${VERGE_LOW_HULL} hull — and live.`,
    earned: (s, r) => banked(r) && s.records.vergeAtLowHull,
  },
  {
    id: "untouched",
    name: "Not a Scratch",
    hint: "Bank a run with zero hull damage.",
    earned: (s, r) => banked(r) && s.records.damageTaken === 0,
  },
  {
    id: "full-house",
    name: "Full House",
    hint: "Fill the hold to capacity.",
    earned: (s) => s.records.fullHold,
  },
  {
    id: "grand-tour",
    name: "Grand Tour",
    hint: "Dock at all five stations in one run.",
    earned: (s) => s.records.visited.length === NODE_IDS.length,
  },
  {
    id: "gauntlet",
    name: "Run the Gauntlet",
    hint: `Survive ${GAUNTLET_AMBUSHES} pirate ambushes in one run.`,
    earned: (s, r) => banked(r) && s.records.pirateAmbushes >= GAUNTLET_AMBUSHES,
  },
  {
    id: "high-roller",
    name: "High Roller",
    hint: `Bank a ${HIGH_ROLLER_SCORE.toLocaleString("en-US")}+ score.`,
    earned: (s, r) => r.score >= HIGH_ROLLER_SCORE,
  },
  {
    id: "regular",
    name: "Starlight Regular",
    hint: `Fly ${REGULAR_DAYS_FLOWN} different days.`,
  },
];

/** The cross-run feats judged in storage — everything else is a run feat. */
export const LEDGER_FEAT_IDS: readonly FeatId[] = ["first-flight", "regular"];

const BY_ID = new Map(FEATS.map((f) => [f.id, f]));

/** Registry lookup; total by construction — FeatId is the registry's own id union. */
export function featDef(id: FeatId): FeatDef {
  return BY_ID.get(id)!;
}

/** Run feats earned by a finished run; [] while it is still playing (feats bank once). */
export function earnedFeats(s: GameState): FeatId[] {
  const r = s.runEnd;
  if (!r) return [];
  return FEATS.filter((f) => f.earned?.(s, r)).map((f) => f.id);
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/engine/feats.test.ts` → PASS; `npx vitest run` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/feats.ts tests/engine/feats.test.ts
git commit -m "feat(e2-5a): 12-feat registry with pure run-end predicates"
```

---

### Task 4: Tune HIGH_ROLLER_SCORE from the sweep

**Files:**

- Create (temporary): `tests/sim/highroller.probe.test.ts`
- Modify: `src/engine/feats.ts:HIGH_ROLLER_SCORE`

- [ ] **Step 1: Write and run the probe**

```ts
// tests/sim/highroller.probe.test.ts — TEMPORARY, deleted this task.
import { it } from "vitest";
import { runArchetype, Archetype } from "../../src/sim/simulate";

it("prints banked-score percentiles", () => {
  const scores: number[] = [];
  for (const k of ["cautious", "balanced", "greedy"] as Archetype[]) {
    for (let seed = 1; seed <= 100; seed++) {
      const r = runArchetype(k, seed);
      if (r.status !== "lost") scores.push(r.score);
    }
  }
  scores.sort((a, b) => a - b);
  const p = (q: number) => scores[Math.floor(q * (scores.length - 1))];
  console.log(
    `banked n=${scores.length} p50=${p(0.5)} p75=${p(0.75)} p90=${p(0.9)} p95=${p(0.95)}`
  );
});
```

Run: `npx vitest run tests/sim/highroller.probe.test.ts` and read the logged line.

- [ ] **Step 2: Set the threshold** — in `src/engine/feats.ts`, set `HIGH_ROLLER_SCORE` to the printed **p90 rounded to the nearest 500** (decision: ~top decile of banked runs; sim archetypes are a proxy for competent play). Update the constant's comment to record the measured p90 and the date.

- [ ] **Step 3: Delete the probe, run the suite**

```bash
rm tests/sim/highroller.probe.test.ts
npx vitest run
```

Expected: PASS (the feats tests use the constant, so they track the new value).

- [ ] **Step 4: Commit**

```bash
git add src/engine/feats.ts
git commit -m "feat(e2-5a): set HIGH_ROLLER_SCORE from sweep p90"
```

---

### Task 5: Save v2 + `recordFeats`

**Files:**

- Modify: `src/ui/storage.ts`
- Test: `tests/ui/storage.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe("save v2 (E2-5 feats)", () => {
  it("emptySave is v2 with an empty feat map", () => {
    expect(emptySave()).toEqual({
      version: 2,
      days: {},
      allTimePB: 0,
      daysFlownCount: 0,
      feats: {},
    });
  });

  it("recordFeats stamps new feats with the date and reports them", () => {
    const base = recordRunEnd(emptySave(), KEY, banked(100)).save;
    const r = recordFeats(base, KEY, ["audited"]);
    expect(r.newFeats).toEqual(expect.arrayContaining(["audited", "first-flight"]));
    expect(r.save.feats["audited"]).toBe(KEY);
  });

  it("re-earning is a no-op — first earn keeps its date", () => {
    const base = recordRunEnd(emptySave(), KEY, banked(100)).save;
    const first = recordFeats(base, KEY, ["audited"]).save;
    const again = recordFeats(first, "2026-07-23", ["audited"]);
    expect(again.newFeats).toEqual([]);
    expect(again.save.feats["audited"]).toBe(KEY);
    expect(again.save).toBe(first); // nothing new ⇒ same object, no churn
  });

  it("first-flight fires on the first recorded run, regular on the 7th flown day", () => {
    let save = emptySave();
    for (let d = 1; d <= 7; d++) {
      save = recordRunEnd(save, `2026-07-0${d}`, banked(50)).save;
    }
    const r = recordFeats(save, "2026-07-07", []);
    expect(r.newFeats).toEqual(expect.arrayContaining(["first-flight", "regular"]));
  });

  it("loadSave migrates a v1 doc, preserving the ledger and adding feats", () => {
    localStorage.setItem(
      "starlight.save.v1",
      JSON.stringify({ version: 1, days: {}, allTimePB: 750, daysFlownCount: 3 })
    );
    const migrated = loadSave();
    expect(migrated?.allTimePB).toBe(750);
    expect(migrated?.feats).toEqual({});
  });

  it("loadSave drops unknown feat ids and non-string dates", () => {
    localStorage.setItem(
      "starlight.save.v1",
      JSON.stringify({
        version: 2,
        days: {},
        allTimePB: 0,
        daysFlownCount: 0,
        feats: { audited: KEY, "made-up-feat": KEY, "clean-sweep": 42 },
      })
    );
    expect(loadSave()?.feats).toEqual({ audited: KEY });
  });
});
```

(Mirror the file's existing localStorage setup/teardown — it already tests `loadSave`; reuse its stubbing pattern and its `KEY`/`banked` helpers.)

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/ui/storage.test.ts` → FAIL.

- [ ] **Step 3: Implement in `src/ui/storage.ts`**

(a) Add import: `import { FEATS, FeatId, REGULAR_DAYS_FLOWN } from "../engine/feats";`

(b) `StarlightSave`: `version: 1` → `version: 2`; add field:

```ts
/** Feat id → UTC dateKey first earned (E2-5). First earn wins; never removed. */
feats: Record<string, string>;
```

(c) `emptySave()`: `return { version: 2, days: {}, allTimePB: 0, daysFlownCount: 0, feats: {} };`

(d) After `recordRunEnd`, add:

```ts
const FEAT_ID_SET = new Set<string>(FEATS.map((f) => f.id));

/**
 * Fold this run's feats into the save. Ledger feats are judged here — they are
 * cross-run facts the engine never sees — so call this AFTER recordRunEnd, on the
 * save that already contains this run. `newFeats` (ids new to this save) drives
 * every unlock surface. Pure; returns the same save object when nothing is new.
 */
export function recordFeats(
  save: StarlightSave,
  dateKey: string,
  runFeats: FeatId[]
): { save: StarlightSave; newFeats: FeatId[] } {
  const earned = [...runFeats];
  if (Object.keys(save.days).length >= 1) earned.push("first-flight");
  if (save.daysFlownCount >= REGULAR_DAYS_FLOWN) earned.push("regular");
  const newFeats = earned.filter((id) => save.feats[id] === undefined);
  if (newFeats.length === 0) return { save, newFeats };
  const feats = { ...save.feats };
  for (const id of newFeats) feats[id] = dateKey;
  return { save: { ...save, feats }, newFeats };
}
```

(e) Migration + validation in `loadSave`. Replace the body of the version/shape check:

```ts
const parsed = JSON.parse(raw) as (Partial<StarlightSave> & { version?: number }) | null;
// v1 → v2 (E2-5): the ledger predates feats — start the map empty.
if (parsed && parsed.version === 1) {
  (parsed as { feats?: unknown }).feats = {};
  parsed.version = 2;
}
if (
  !parsed ||
  parsed.version !== 2 ||
  typeof parsed.days !== "object" ||
  parsed.days === null ||
  typeof parsed.allTimePB !== "number" ||
  typeof parsed.daysFlownCount !== "number" ||
  typeof parsed.feats !== "object" ||
  parsed.feats === null ||
  Array.isArray(parsed.feats)
) {
  return null;
}
// Keep only registry ids with string dates — a hand-edited or future-version entry
// is dropped, not fatal (same silent-degradation stance as the rest of the doc).
const feats: Record<string, string> = {};
for (const [k, v] of Object.entries(parsed.feats)) {
  if (FEAT_ID_SET.has(k) && typeof v === "string") feats[k] = v;
}
return { ...(parsed as StarlightSave), feats };
```

(Note `STORAGE_KEY` stays `"starlight.save.v1"` — the envelope's `version` field is the version, matching the snapshot precedent.)

- [ ] **Step 4: Run** — `npx vitest run tests/ui/storage.test.ts` → PASS; `npx vitest run` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/storage.ts tests/ui/storage.test.ts
git commit -m "feat(e2-5b): save v2 — persisted feats with recordFeats"
```

---

### Task 6: E2-2j — the payday is what you earned

**Files:**

- Modify: `src/engine/game.ts:408-420` (`settleMissions`)
- Test: `tests/engine/game.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe("E2-2j: payday stats exclude the returned deposit", () => {
  const mission = (reward: number, deposit: number): Mission => ({
    id: "m-e22j",
    commodity: "water",
    qty: 2,
    destination: "terra",
    reward,
    deposit,
    deadlineDay: 10,
  });
  const carrying = (m: Mission): GameState => ({
    ...createGame(42),
    activeMissions: [m],
    cargo: { ...createGame(42).cargo, water: m.qty },
  });

  it("biggestPayday reads the payout, not payout + deposit", () => {
    const m = mission(500, 50);
    const done = deliver(carrying(m));
    expect(done.biggestPayday?.amount).toBe(500);
  });

  it("an inflow over BIG_TRADE_CR on the refund alone marks delivery, not bigTrade", () => {
    const m = mission(BIG_TRADE_CR - 20, 60); // payout 880 < 900, inflow 940 ≥ 900
    const done = deliver(carrying(m));
    expect(done.dayHighlights[done.day]).toBe("delivery");
  });

  it("the log line still reports the full credit movement", () => {
    const m = mission(500, 50);
    const done = deliver(carrying(m));
    const line = done.log[done.log.length - 1];
    expect(line.msg).toContain("+550cr");
    expect(line.delta).toBe(550);
  });
});
```

(Extend the file's imports with `deliver`, `Mission`, `GameState`, and `BIG_TRADE_CR` from `../../src/engine/economy` as needed.)

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/engine/game.test.ts` → FAIL (amount is 550).

- [ ] **Step 3: Implement** — in `settleMissions`, two one-word changes (the log line keeps `inflow`; it reports the actual credit movement and already says "(deposit returned)"):

```ts
s = trackPayday(
  s,
  payout, // E2-2j: your own bond coming back is not a payday
  `${commodityName(m.commodity)} contract → ${NODES[m.destination].name}`
);
```

and

```ts
s = markDay(s, payout >= BIG_TRADE_CR ? "bigTrade" : "delivery");
```

- [ ] **Step 4: Run the full suite** — `npx vitest run`. If any existing test asserts an inflow-based `biggestPayday` or 💰 highlight from a contract (search: `grep -rn "biggestPayday\|bigTrade" tests/`), re-derive its expected value as reward-only and update — the test's _intent_ (stat tracks the biggest single gain) is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/engine/game.ts tests/
git commit -m "fix(e2-2j): best haul and 💰 highlight exclude the returned deposit"
```

---

### Task 7: E2-2g — settlement-order badges

**Files:**

- Modify: `src/ui/screens.ts` (`tradeHubPanel`, the `active` map at ~line 397), `src/ui/styles.css`
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe("active-contract settlement order (E2-2g)", () => {
  const m = (id: string, commodity: "water" | "parts", reward = 400): Mission => ({
    id,
    commodity,
    qty: 2,
    destination: "kiruna",
    reward,
    deposit: 40,
    deadlineDay: 10,
  });

  it("badges appear in accept order when two contracts want the same commodity", () => {
    const s = { ...createGame(42), activeMissions: [m("a", "water"), m("b", "water")] };
    const html = stationScreen(s);
    expect(html).toContain("① settles first");
    expect(html).toContain("②");
    expect(html.indexOf("①")).toBeLessThan(html.indexOf("②"));
  });

  it("no badge renders when active contracts want different commodities", () => {
    const s = { ...createGame(42), activeMissions: [m("a", "water"), m("b", "parts")] };
    const html = stationScreen(s);
    expect(html).not.toContain("settles first");
    expect(html).not.toContain("contract-prio");
  });

  it("no badge renders for a single active contract", () => {
    const s = { ...createGame(42), activeMissions: [m("a", "water")] };
    expect(stationScreen(s)).not.toContain("contract-prio");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/ui/screens.test.ts` → FAIL.

- [ ] **Step 3: Implement** — in `tradeHubPanel`, just above `const active = s.activeMissions`:

```ts
// E2-2g: hauled units settle into contracts in accept order (settleMissions iterates
// activeMissions). That order only matters when two active contracts want the same
// commodity — badge exactly that case, so the invisible rule reads as the decision
// it already is: accept the whale first.
const wanters = new Map<CommodityId, number>();
for (const m of s.activeMissions) wanters.set(m.commodity, (wanters.get(m.commodity) ?? 0) + 1);
const prioSeen = new Map<CommodityId, number>();
const PRIO_GLYPHS = ["①", "②", "③", "④", "⑤"];
```

and inside the `active` map callback, before `return`:

```ts
let prio = "";
if ((wanters.get(m.commodity) ?? 0) >= 2) {
  const nth = (prioSeen.get(m.commodity) ?? 0) + 1;
  prioSeen.set(m.commodity, nth);
  const glyph = PRIO_GLYPHS[nth - 1] ?? `#${nth}`;
  prio = ` <span class="contract-prio st-num" title="Hauled ${commodityName(m.commodity)} settles into contracts in the order they were accepted">${glyph}${nth === 1 ? " settles first" : ""}</span>`;
}
```

then splice `${prio}` into the `<li>` header line, after `${daysChip}`:

```ts
return `<li>${m.qty} ${commodityName(m.commodity)} → ${NODES[m.destination].name} by day ${m.deadlineDay} · reward ${cr(m.reward)}${daysChip}${prio}<br>${hint}</li>`;
```

Add to `src/ui/styles.css` (near the other contract classes):

```css
/* E2-2g: settlement-order badge on contested active contracts */
.contract-prio {
  color: var(--st-cyan-bright);
  font-size: 0.85em;
  white-space: nowrap;
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/ui/screens.test.ts` → PASS; `npx vitest run` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens.ts src/ui/styles.css tests/ui/screens.test.ts
git commit -m "feat(e2-2g): settlement-order badges on contested active contracts"
```

---

### Task 8: `calendarCells` — the pure calendar builder

**Files:**

- Modify: `src/ui/storage.ts`
- Test: `tests/ui/storage.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe("calendarCells (E2-5c)", () => {
  it("returns 28 cells ending today, oldest first", () => {
    const cells = calendarCells(emptySave(), "2026-08-09");
    expect(cells).toHaveLength(CALENDAR_DAYS);
    expect(cells[0].dateKey).toBe("2026-07-13");
    expect(cells[27].dateKey).toBe("2026-08-09");
    expect(cells[27].isToday).toBe(true);
    expect(cells.filter((c) => c.isToday)).toHaveLength(1);
  });

  it("joins the save ledger onto the right days", () => {
    const save = recordRunEnd(emptySave(), "2026-08-03", banked(2140)).save;
    const cells = calendarCells(save, "2026-08-09");
    const flown = cells.find((c) => c.dateKey === "2026-08-03")!;
    expect(flown.attempts).toBe(1);
    expect(flown.best).toBe(2140);
    expect(flown.outcome).toBe("audited");
    expect(flown.label).toBe("Aug 3");
    expect(cells.find((c) => c.dateKey === "2026-08-04")!.attempts).toBe(0);
  });

  it("crosses a month boundary without skipping or doubling a day", () => {
    const keys = calendarCells(emptySave(), "2026-08-02").map((c) => c.dateKey);
    expect(new Set(keys).size).toBe(CALENDAR_DAYS);
    expect(keys).toContain("2026-07-31");
    expect(keys).toContain("2026-08-01");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/ui/storage.test.ts` → FAIL.

- [ ] **Step 3: Implement in `src/ui/storage.ts`** — extend the share import to `import { formatDateLabel, utcDateKey } from "./share";` and add after `recordFeats`:

```ts
// --- E2-5c: Logbook calendar ---------------------------------------------------------

export interface CalendarCell {
  dateKey: string; // UTC "YYYY-MM-DD"
  label: string; // "Aug 3" — same formatter as the header/share date
  attempts: number; // 0 = not flown
  best: number;
  outcome?: RunEndStatus;
  isToday: boolean;
}

export const CALENDAR_DAYS = 28;

/**
 * The last 28 UTC days ending on `todayKey`, joined with the save ledger — a strip,
 * not a month grid (no weekday alignment). Pure: "today" comes in as the same UTC
 * dateKey the ledger is keyed on, so there is no second clock to disagree with.
 */
export function calendarCells(save: StarlightSave, todayKey: string): CalendarCell[] {
  const end = new Date(`${todayKey}T00:00:00Z`).getTime();
  const cells: CalendarCell[] = [];
  for (let i = CALENDAR_DAYS - 1; i >= 0; i--) {
    const d = new Date(end - i * 86_400_000);
    const dateKey = d.toISOString().slice(0, 10);
    const rec = save.days[dateKey];
    cells.push({
      dateKey,
      label: formatDateLabel(d),
      attempts: rec?.attempts ?? 0,
      best: rec?.bestScore ?? 0,
      outcome: rec?.bestOutcome,
      isToday: dateKey === todayKey,
    });
  }
  return cells;
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/ui/storage.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/storage.ts tests/ui/storage.test.ts
git commit -m "feat(e2-5c): pure calendarCells builder for the Logbook strip"
```

---

### Task 9: Logbook panel on the day-1 station screen

**Files:**

- Modify: `src/ui/screens.ts` (RunMeta at line 46, `stationScreen` rail-right), `src/main.ts` (`buildMeta`), `src/ui/styles.css`
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { FEATS } from "../../src/engine/feats";
import { calendarCells, emptySave, recordRunEnd } from "../../src/ui/storage";

function logbookMeta(save = emptySave()): RunMeta {
  return {
    runNumber: 40,
    runLabel: "The Daily",
    dateLabel: "Aug 9",
    logbook: {
      cells: calendarCells(save, "2026-08-09"),
      feats: FEATS.map((def) => ({ def, earned: save.feats[def.id] !== undefined })),
    },
  };
}

describe("Logbook panel (E2-5c)", () => {
  it("renders on day 1 with 28 aria-hidden cells and an sr-only summary", () => {
    const html = stationScreen(createGame(42), [], "", false, logbookMeta());
    expect(html).toContain("Logbook");
    expect((html.match(/class="cal-cell/g) ?? []).length).toBe(28);
    expect(html).toContain('<div class="logbook-cal" aria-hidden="true">');
    expect(html).toContain("today's board is open"); // screens render template literals unescaped
  });

  it("does not render after day 1", () => {
    const s = { ...createGame(42), day: 2 };
    expect(stationScreen(s, [], "", false, logbookMeta())).not.toContain("Logbook");
  });

  it("marks a flown day's cell with its outcome tone and titles it with the score", () => {
    const meta = logbookMeta(recordRunEnd(emptySave(), "2026-08-03", banked(2140)).save);
    const html = stationScreen(createGame(42), [], "", false, meta);
    expect(html).toContain("cal-cell--banked");
    expect(html).toContain('title="Aug 3 — best 2,140 · 1 attempt"');
  });

  it("lists every feat — earned lit, unearned dimmed with its hint", () => {
    const html = stationScreen(createGame(42), [], "", false, logbookMeta());
    expect((html.match(/class="feat-chip/g) ?? []).length).toBe(FEATS.length);
    expect(html).toContain("Fill the hold to capacity."); // an unearned hint is visible
    expect(html).toContain(`>0/${FEATS.length}<`);
  });
});
```

(`banked` = the storage suite's helper; either import a shared fixture or inline an equivalent `RunEnd` literal.)

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/ui/screens.test.ts` → FAIL (logbook not in RunMeta).

- [ ] **Step 3: Implement**

(a) `src/ui/screens.ts` imports: add `import { FeatDef, featDef, FeatId } from "../engine/feats";` and `import type { CalendarCell } from "./storage";`

(b) Extend `RunMeta`:

```ts
  debrief?: {
    pbDelta: number;
    isNewPB: boolean;
    prevBest: number;
    isFirstEver: boolean;
    /** Feats first earned by this run (E2-5d) — drives the unlock lines. */
    newFeats?: FeatId[];
  };
  /** Day-1 Logbook data (E2-5c) — save-derived in main.ts so screens stay pure. */
  logbook?: {
    cells: CalendarCell[];
    feats: { def: FeatDef; earned: boolean }[];
  };
```

(c) Add the panel (after `logPanel`):

```ts
/** The day-1 Logbook (E2-5c): 4-week calendar strip + feat roster. The grid is
 *  aria-hidden decoration — the sr-only summary carries its facts (map precedent). */
function logbookPanel(lb: NonNullable<RunMeta["logbook"]>): string {
  const flownCells = lb.cells.filter((c) => c.attempts > 0);
  const best = flownCells.reduce((m, c) => (c.best > m.best ? c : m), flownCells[0]);
  const summary = flownCells.length
    ? `Flown ${flownCells.length} of the last ${lb.cells.length} days · best ${best.best.toLocaleString()} on ${best.label}.`
    : `No runs in the last ${lb.cells.length} days — today's board is open.`;
  const cells = lb.cells
    .map((c) => {
      const tone =
        c.attempts === 0
          ? "cal-cell--off"
          : c.outcome === "lost"
            ? "cal-cell--lost"
            : "cal-cell--banked";
      const today = c.isToday ? " cal-cell--today" : "";
      const title =
        c.attempts === 0
          ? `${c.label} — not flown`
          : `${c.label} — best ${c.best.toLocaleString()} · ${c.attempts} attempt${c.attempts === 1 ? "" : "s"}`;
      return `<span class="cal-cell ${tone}${today}" title="${title}"></span>`;
    })
    .join("");
  const earned = lb.feats.filter((f) => f.earned).length;
  const chips = lb.feats
    .map((f) =>
      f.earned
        ? `<li class="feat-chip feat-chip--earned">★ ${f.def.name}</li>`
        : `<li class="feat-chip">☆ ${f.def.name} — <span class="feat-hint">${f.def.hint}</span></li>`
    )
    .join("");
  return panel(
    "Logbook",
    `<p class="st-sr-only">${summary}</p>
    <div class="logbook-cal" aria-hidden="true">${cells}</div>
    <div class="st-kv"><span class="st-kv__label">Feats</span><span class="st-kv__value st-num">${earned}/${lb.feats.length}</span></div>
    <ul class="feat-roster">${chips}</ul>`
  );
}
```

(d) In `stationScreen`'s right rail (day 1 is the launch surface — same gate `bootStats` uses):

```ts
      <div class="st-shell__rail st-shell__rail--right rail-right">
        ${logisticsPanel(s, fuelClass, retireArmed)}
        ${logPanel(s)}
        ${s.day === 1 && meta?.logbook ? logbookPanel(meta.logbook) : ""}
      </div>
```

(e) `src/main.ts` `buildMeta` — import `calendarCells` from `./ui/storage` and `FEATS` from `./engine/feats`; add to the returned object:

```ts
    logbook:
      state.day === 1
        ? {
            cells: calendarCells(save, utcDateKey(state.bootDate)),
            feats: FEATS.map((def) => ({ def, earned: save.feats[def.id] !== undefined })),
          }
        : undefined,
```

(f) `src/ui/styles.css` (near the panel styles):

```css
/* Logbook (E2-5c): 4-week calendar strip + feat roster */
.logbook-cal {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-bottom: 12px;
}
.cal-cell {
  aspect-ratio: 1;
  border-radius: 2px;
  background: var(--st-bg-inset);
}
.cal-cell--banked {
  background: var(--st-positive);
  opacity: 0.7;
}
.cal-cell--lost {
  background: var(--st-negative);
  opacity: 0.7;
}
.cal-cell--today {
  outline: 1px solid var(--st-cyan);
  outline-offset: 1px;
}
.feat-roster {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.feat-chip {
  color: var(--st-text-dim);
  font-size: 0.85em;
}
.feat-chip--earned {
  color: var(--st-gold-bright);
}
.feat-hint {
  color: var(--st-text-dim);
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/ui/screens.test.ts` → PASS; `npx vitest run` → PASS.

- [ ] **Step 5: Verify in the browser** — start the dev preview, confirm: Logbook renders under the log on day 1 (empty ledger shows the open-board line), disappears after one jump, feat chips show 0/12 dimmed with hints, layout holds at mobile width. Take a screenshot for the review.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens.ts src/main.ts src/ui/styles.css tests/ui/screens.test.ts
git commit -m "feat(e2-5c): day-1 Logbook — calendar strip + feat roster"
```

---

### Task 10: Unlock surfaces — run-end lines, share line, main.ts wiring

**Files:**

- Modify: `src/ui/screens.ts` (`runEndScreen`), `src/ui/share.ts`, `src/main.ts` (`recordIfEnded`, share handler), `src/ui/styles.css`
- Test: `tests/ui/screens.test.ts`, `tests/engine/share.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/ui/screens.test.ts`:

```ts
describe("run-end feat unlocks (E2-5d)", () => {
  const debrief = { pbDelta: 0, isNewPB: false, prevBest: 0, isFirstEver: true };
  const meta = (newFeats: FeatId[]): RunMeta => ({
    runNumber: 40,
    runLabel: "The Daily",
    dateLabel: "Aug 9",
    debrief: { ...debrief, newFeats },
  });
  const endedState = retire(createGame(42));

  it("lists up to three new feats by name", () => {
    const html = runEndScreen(
      endedState,
      endedState.runEnd!,
      false,
      meta(["audited", "clean-books"])
    );
    expect(html).toContain("★ Feat unlocked: Face the Audit");
    expect(html).toContain("★ Feat unlocked: Clean Books");
    expect(html).not.toContain("+1 more");
  });

  it("caps at three lines with a +N more overflow", () => {
    const html = runEndScreen(
      endedState,
      endedState.runEnd!,
      false,
      meta(["audited", "clean-books", "full-house", "grand-tour", "untouched"])
    );
    expect((html.match(/★ Feat unlocked:/g) ?? []).length).toBe(3);
    expect(html).toContain("+2 more");
  });

  it("renders nothing when no feat is new", () => {
    const html = runEndScreen(endedState, endedState.runEnd!, false, meta([]));
    expect(html).not.toContain("Feat unlocked");
  });
});
```

`tests/engine/share.test.ts` (match the file's existing `ShareData` fixture style):

```ts
describe("share feat line (E2-5d)", () => {
  it("appends one line naming the first new feat", () => {
    const text = shareText({ ...BASE, featNames: ["Clean Sweep"] });
    expect(text).toContain("\n★ Clean Sweep\n");
  });
  it("counts the rest instead of listing them", () => {
    const text = shareText({ ...BASE, featNames: ["Clean Sweep", "Full House", "Audited"] });
    expect(text).toContain("★ Clean Sweep +2 more");
  });
  it("a card without new feats is byte-identical to before", () => {
    expect(shareText(BASE)).toBe(shareText({ ...BASE, featNames: [] }));
    expect(shareText(BASE)).not.toContain("★");
  });
});
```

(`BASE` = the suite's existing valid `ShareData` fixture; reuse its name.)

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/ui/screens.test.ts tests/engine/share.test.ts` → FAIL.

- [ ] **Step 3: Implement**

(a) `src/ui/share.ts` — extend `ShareData`:

```ts
  /** Names of feats first earned by this run (E2-5d); the card stays byte-identical without them. */
  featNames?: string[];
```

and in `shareText`, build the line between the strip and the URL:

```ts
export function shareText(d: ShareData): string {
  const feat = d.featNames?.length
    ? [`★ ${d.featNames[0]}${d.featNames.length > 1 ? ` +${d.featNames.length - 1} more` : ""}`]
    : [];
  // The locale is pinned rather than the player's: the card is a cross-audience artifact,
  // so its thousands separator must not shift depending on who generated it.
  return [
    `🚀 Starlight #${d.runNumber} · ${d.dateLabel} · ${d.label}`,
    `Score ${d.score.toLocaleString("en-US")} · survived ${d.daysSurvived} days — ${d.endLabel}`,
    d.strip,
    ...feat,
    `Beat my run: ${GAME_URL}`,
  ].join("\n");
}
```

(b) `src/ui/screens.ts` `runEndScreen` — before the `return`, add:

```ts
const newFeats = meta?.debrief?.newFeats ?? [];
const featLines = newFeats.length
  ? `<div class="run-end__feats">${newFeats
      .slice(0, 3)
      .map((id) => `<p class="run-end__feat">★ Feat unlocked: ${featDef(id).name}</p>`)
      .join(
        ""
      )}${newFeats.length > 3 ? `<p class="run-end__feat">+${newFeats.length - 3} more</p>` : ""}</div>`
  : "";
```

and render `${featLines}` between `${pb}` and the score line:

```ts
          ${pb}
          ${featLines}
          <p class="score st-num">Score: ${r.score.toLocaleString()}</p>
```

(c) `src/main.ts`:

- imports: `earnedFeats`, `featDef`, `FEATS` from `./engine/feats`; `recordFeats`, `calendarCells` from the storage import list.
- `recordIfEnded` becomes:

```ts
function recordIfEnded() {
  if (!state.runEnd || recorded) return;
  const dateKey = utcDateKey(state.bootDate);
  const res = recordRunEnd(save, dateKey, state.runEnd);
  const feats = recordFeats(res.save, dateKey, earnedFeats(state));
  save = feats.save;
  persist(save);
  lastDebrief = {
    pbDelta: res.pbDelta,
    isNewPB: res.isNewPB,
    prevBest: res.prevBest,
    isFirstEver: res.isFirstEver,
    newFeats: feats.newFeats,
  };
  recorded = true;
}
```

- the share handler's `copyShare({...})` gains:

```ts
        featNames: (lastDebrief?.newFeats ?? []).map((id) => featDef(id).name),
```

(d) `src/ui/styles.css`:

```css
.run-end__feat {
  color: var(--st-gold-bright);
  margin: 2px 0;
}
```

- [ ] **Step 4: Run** — `npx vitest run` → PASS.

- [ ] **Step 5: Verify in the browser** — retire a day-1 run: the end screen shows "★ Feat unlocked: First Flight" (and any others), Copy score card produces the ★ line, "New run" then shows the Logbook with lit chips. Screenshot for the review.

- [ ] **Step 6: Commit**

```bash
git add src/ui/share.ts src/ui/screens.ts src/main.ts src/ui/styles.css tests/
git commit -m "feat(e2-5d): unlock surfaces — run-end lines and share feat line"
```

---

### Task 11: Round verification + docs

**Files:**

- Delete: `tests/sim/baseline.probe.test.ts`
- Modify: `docs/ROADMAP.md`, `docs/ENGAGEMENT_BACKLOG.md`

- [ ] **Step 1: Byte-identity check**

Run: `SIM_DUMP=/private/tmp/claude-501/-Users-shmoula-develop-Others-starlight-traders/089ffdd4-bdcd-4198-b5e4-265ce44dfda1/scratchpad/sim-after.json npx vitest run tests/sim/baseline.probe.test.ts`
then `diff <scratchpad>/sim-baseline.json <scratchpad>/sim-after.json`
Expected: **no output** (byte-identical). If it differs, a records/E2-2j change leaked into game rules — find and fix before proceeding; do not re-baseline.

- [ ] **Step 2: Remove the probe**

```bash
git rm tests/sim/baseline.probe.test.ts
```

- [ ] **Step 3: Full gates**

```bash
npx vitest run
npm run lint
npm run build
```

Expected: all green. (Lighthouse runs in CI; the panel is static markup + CSS, no animation.)

- [ ] **Step 4: Tick the docs**

- `docs/ROADMAP.md`: E2-5 row → `✅ **Shipped <land date>.** 12 local feats + 4-week Logbook calendar on day 1; feats earn on any run; save doc v2.`; update the M3 intro's "Next up" note to point at E2-1 only (bundling P2-2's cost-basis half and E2-2f); append the round to the "Already shipped" paragraph, including E2-2g and E2-2j.
- `docs/ENGAGEMENT_BACKLOG.md`: E2-5 row → `✅ **Shipped <land date>.**` prefix; E2-2g row → resolved (accept order surfaced with ①②③ badges when contested); E2-2j row → resolved (stat reads earned payout; log keeps gross movement).

- [ ] **Step 5: Commit**

```bash
git add -A docs tests
git commit -m "feat(m3): close round 4 — The Regular (E2-5 + E2-2g + E2-2j)"
```

---

## Self-review notes

- **Spec coverage:** decision 1 (any-run feats) → recordFeats has no Daily gate (Task 5); decision 2 → earnedFeats UI-called (Task 10c); decision 3 → Task 1; decision 4 roster → Task 3; decision 5 → Task 5; decision 6 → Tasks 8–9; decision 7 → Task 10; decision 8 → Task 7; decision 9 → Task 6; byte-identical sweep → Tasks 0 + 11.
- **Threshold provenance:** `HIGH_ROLLER_SCORE` ships sweep-derived (Task 4), not the placeholder 6000.
- **Type consistency:** `RunRecords`/`emptyRecords` (types.ts) ← game.ts, storage.ts; `FeatId`/`FeatDef`/`FEATS`/`featDef`/`earnedFeats`/`LEDGER_FEAT_IDS`/`REGULAR_DAYS_FLOWN` (feats.ts) ← storage.ts, screens.ts, main.ts; `CalendarCell`/`calendarCells`/`recordFeats` (storage.ts) ← screens.ts (type only), main.ts. No cycles: feats.ts → game.ts → types.ts; storage.ts → feats.ts.
