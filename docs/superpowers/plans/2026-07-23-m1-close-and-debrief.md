# M1 Close + First Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Milestone 1 (localStorage persistence + a11y polish) and ship the first M2 retention hook (an enhanced run debrief), so a finished run banks an honest, comparable result and hands the player a reason to run again.

**Architecture:** Persistence lives at the UI boundary (`src/ui/storage.ts`), never in the pure engine, so the balance sim never touches `localStorage`. The engine gains one new field (`biggestPayday`) tracked in `sell`/`deliver`. `main.ts` reads the save on boot, records exactly once on the play→ended transition, and threads a `RunMeta` view-object (run number, Daily/Practice label, boot stats, debrief facts) through `render` into the screens. Pure logic is TDD'd against Vitest; DOM glue in `main.ts` (focus, `document.title`, save wiring) is verified in the browser preview, matching the codebase's existing test boundary.

**Tech Stack:** TypeScript 5 (strict, no UI framework — HTML-string rendering), Vite 8, Vitest 4. `npm test` runs the suite once; `npm run build` type-checks + builds.

**Spec:** [docs/superpowers/specs/2026-07-23-m1-close-and-debrief-design.md](../specs/2026-07-23-m1-close-and-debrief-design.md)

---

## File structure

| File | Responsibility | Change |
| :--- | :--- | :--- |
| `src/ui/storage.ts` | Versioned save document + pure record/label logic + silent-fail I/O | **Create** |
| `tests/ui/storage.test.ts` | Persistence unit tests | **Create** |
| `src/ui/share.ts` | Date/identity helpers (`utcDateKey`, `runNumber`) + share card w/ label | Modify |
| `tests/engine/share.test.ts` | Share + identity-helper tests | Modify |
| `src/engine/types.ts` | `biggestPayday` field on `GameState` | Modify |
| `src/engine/game.ts` | Track biggest single payday in `sell`/`deliver` | Modify |
| `tests/engine/game.test.ts` | `biggestPayday` tests | Modify |
| `src/ui/screens.ts` | `RunMeta` type; debrief rows; restart confirm; header identity + boot stats; `<h1>` tabindex; export `endHeadline` | Modify |
| `tests/ui/screens.test.ts` | Debrief + header render tests | Modify |
| `src/ui/render.ts` | `ViewModel` gains `restartArmed` + `meta`; pass-through | Modify |
| `src/main.ts` | Load/record/persist; label; meta builder; restart confirm; focus restore; `document.title` | Modify |
| `README.md` | Delete false luxury-modifier claim (B-5) | Modify |

Task order is bottom-up: each task is independently testable and committable, and later tasks depend only on earlier ones. Screen-signature additions are **optional params**, so `render.ts` keeps compiling until the wiring task supplies them.

---

## Task 1: B-5 — Fix the README luxury claim

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Confirm the false claims**

Run: `grep -n "attracts both pirates and customs" README.md`
Expected: two matches (the Key Features "Three commodities…" line and the How-to-Play "Buy where a commodity is produced…" line).

- [ ] **Step 2: Edit the Key Features line**

Find:
```
- Three commodities spanning distinct risk tiers: Water/Ice (stable, thin margins), Machine Parts (mid), and Luxury Goods (volatile, and it attracts both pirates and customs).
```
Replace with:
```
- Three commodities spanning distinct risk tiers: Water/Ice (stable, thin margins), Machine Parts (mid), and Luxury Goods (volatile, high-value — the biggest paydays and the biggest swings).
```

- [ ] **Step 3: Edit the How-to-Play line**

Find the line ending:
```
The Verge and Meridian both pay a premium for Luxury Goods.
```
Leave it as-is if it makes no pirate/customs claim. Then find:
```
its routes draw customs inspections.
```
This describes *Meridian's* danger (per-destination, true), not a cargo modifier — leave it. Re-run `grep -n "attracts both pirates and customs" README.md` — expected: **no matches**.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): drop the nonexistent luxury pirate/customs modifier (B-5)"
```

---

## Task 2: Date & identity helpers + share-card label

Adds the pure `utcDateKey`/`runNumber` helpers (home for all date logic, alongside the existing `formatDateLabel`) and puts the Daily/Practice label + run number on the existing share card. Full share-card v2 stays out of scope.

**Files:**
- Modify: `src/ui/share.ts`
- Test: `tests/engine/share.test.ts`

- [ ] **Step 1: Write failing tests for `utcDateKey` and `runNumber`**

Add to `tests/engine/share.test.ts`:
```ts
import { GAME_URL, formatDateLabel, shareText, utcDateKey, runNumber } from "../../src/ui/share";

describe("utcDateKey", () => {
  it("returns the UTC calendar day as YYYY-MM-DD", () => {
    expect(utcDateKey(new Date(Date.UTC(2026, 6, 20, 23, 30)).toISOString())).toBe("2026-07-20");
    expect(utcDateKey(new Date(Date.UTC(2026, 0, 1, 0, 0)).toISOString())).toBe("2026-01-01");
  });
});

describe("runNumber", () => {
  it("is #1 on the epoch day and +1 per UTC day", () => {
    expect(runNumber(new Date(Date.UTC(2026, 6, 1)).toISOString())).toBe(1);
    expect(runNumber(new Date(Date.UTC(2026, 6, 22, 18, 0)).toISOString())).toBe(22);
  });
  it("is stable across the whole UTC day", () => {
    expect(runNumber(new Date(Date.UTC(2026, 6, 22, 0, 0)).toISOString())).toBe(
      runNumber(new Date(Date.UTC(2026, 6, 22, 23, 59)).toISOString())
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/share.test.ts`
Expected: FAIL — `utcDateKey`/`runNumber` are not exported.

- [ ] **Step 3: Implement the helpers in `src/ui/share.ts`**

Add below `formatDateLabel`:
```ts
/** Fixed epoch for the shared daily index — the game's first daily. */
const RUN_NUMBER_EPOCH_UTC = Date.UTC(2026, 6, 1); // 2026-07-01

/** UTC "YYYY-MM-DD" for an ISO instant — the human-facing key for a day's runs. */
export function utcDateKey(bootISO: string): string {
  return new Date(bootISO).toISOString().slice(0, 10);
}

/** Shared daily index: #1 on 2026-07-01, +1 per UTC day. Identical for all players on a date. */
export function runNumber(bootISO: string): number {
  const d = new Date(bootISO);
  const midnightUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((midnightUTC - RUN_NUMBER_EPOCH_UTC) / 86_400_000) + 1;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine/share.test.ts`
Expected: the two new describe blocks PASS; the existing `shareText` block now FAILS to compile (next step fixes it).

- [ ] **Step 5: Update `ShareData` + `shareText` for the label**

In `src/ui/share.ts` replace the `ShareData` interface and `shareText`:
```ts
export interface ShareData {
  dateLabel: string;
  score: number;
  daysSurvived: number;
  runNumber: number;
  label: string; // "The Daily" | "Practice"
}

export function shareText(d: ShareData): string {
  return [
    `🚀 Starlight #${d.runNumber} — ${d.dateLabel} · ${d.label}`,
    `Score ${d.score} · survived ${d.daysSurvived} days`,
    `Beat my run: ${GAME_URL}`,
  ].join("\n");
}
```

- [ ] **Step 6: Update the existing `shareText` tests**

In `tests/engine/share.test.ts`, update all three `shareText` cases to pass the new fields and assert the label/number, e.g.:
```ts
it("includes the score, day count, date, run number, label, and game URL", () => {
  const txt = shareText({ dateLabel: "Jul 20", score: 84210, daysSurvived: 12, runNumber: 20, label: "The Daily" });
  expect(txt).toContain("84210");
  expect(txt).toContain("12");
  expect(txt).toContain("Jul 20");
  expect(txt).toContain("#20");
  expect(txt).toContain("The Daily");
  expect(txt).toContain(GAME_URL);
});
```
Give the other two cases the same two extra fields (`runNumber: 20, label: "Practice"`) and add `expect(txt).toContain("Practice")` to one.

- [ ] **Step 7: Run the full share test file**

Run: `npx vitest run tests/engine/share.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ui/share.ts tests/engine/share.test.ts
git commit -m "feat(share): add utcDateKey/runNumber helpers and Daily/Practice label on the card (E0-3)"
```

---

## Task 3: `biggestPayday` engine tracking

Tracks the single largest credit inflow of a run for the debrief's "best haul" line. Gross payday (sale net proceeds or delivery reward), not margin — margin needs cost-basis (deferred P2-2).

**Files:**
- Modify: `src/engine/types.ts:64-82` (the `GameState` interface)
- Modify: `src/engine/game.ts` (`sell`, `settleMissions`, new `trackPayday` helper)
- Test: `tests/engine/game.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/engine/game.test.ts` (import `sell`, `deliver`, `acceptMission`, `createGame`, `missionsHere` as needed — check the file's existing imports and extend them):
```ts
describe("biggestPayday (E1-3 best haul)", () => {
  it("records a sale's net proceeds as the biggest payday", () => {
    let s = createGame(42);
    s = { ...s, cargo: { ...s.cargo, water: 10 }, location: "vulcan" }; // Vulcan demands water
    s = sell(s, "water", 10);
    expect(s.biggestPayday).toBeDefined();
    expect(s.biggestPayday!.amount).toBeGreaterThan(0);
    expect(s.biggestPayday!.label).toContain("Water / Ice");
  });

  it("keeps the larger of two paydays", () => {
    let s = createGame(42);
    s = { ...s, cargo: { ...s.cargo, water: 20 }, location: "vulcan" };
    const first = sell(s, "water", 1);
    const small = first.biggestPayday!.amount;
    const big = sell(first, "water", 19);
    expect(big.biggestPayday!.amount).toBeGreaterThan(small);
  });

  it("leaves biggestPayday undefined when nothing was earned", () => {
    expect(createGame(42).biggestPayday).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/game.test.ts`
Expected: FAIL — `biggestPayday` is not a property of `GameState`.

- [ ] **Step 3: Add the field to `GameState`**

In `src/engine/types.ts`, inside the `GameState` interface (after `peakNetWorth: number;`):
```ts
  /** Largest single credit inflow of the run (sale net proceeds or delivery reward) — the debrief's "best haul". */
  biggestPayday?: { amount: number; label: string };
```

- [ ] **Step 4: Add the `trackPayday` helper in `game.ts`**

In `src/engine/game.ts`, next to `trackPeak` (around line 86):
```ts
/** Keep the single largest credit inflow of the run (E1-3 "best haul"). */
function trackPayday(state: GameState, amount: number, label: string): GameState {
  if (amount <= 0) return state;
  if (state.biggestPayday && state.biggestPayday.amount >= amount) return state;
  return { ...state, biggestPayday: { amount, label } };
}
```

- [ ] **Step 5: Track the payday in `sell`**

Replace the body of `sell` (lines 123-136) with:
```ts
export function sell(state: GameState, id: CommodityId, qty: number): GameState {
  if (qty <= 0 || state.cargo[id] < qty) return state;
  const price = getPrice(state.seed, state.day, state.location, id);
  const proceeds = price * qty;
  const tax = taxOnSale(state.location, proceeds);
  let next: GameState = {
    ...state,
    credits: state.credits + proceeds - tax,
    cargo: { ...state.cargo, [id]: state.cargo[id] - qty },
  };
  next = trackPayday(next, proceeds - tax, `${commodityName(id)} at ${NODES[state.location].name}`);
  return trackPeak(
    withLog(next, `Sold ${qty} ${commodityName(id)} for ${proceeds}cr (tax ${tax}).`)
  );
}
```

- [ ] **Step 6: Track the payday in `settleMissions`**

In `settleMissions` (game.ts:238-246), inside the delivery branch, after `credits: s.credits + m.reward,` block and before the `withLog(... "Delivery complete")`:
```ts
      s = {
        ...s,
        cargo: { ...s.cargo, [m.commodity]: s.cargo[m.commodity] - m.qty },
        credits: s.credits + m.reward,
      };
      s = trackPayday(s, m.reward, `${commodityName(m.commodity)} contract → ${NODES[m.destination].name}`);
      s = withLog(s, `Delivery complete: +${m.reward}cr.`);
      delivered.push(m);
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/engine/game.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/engine/types.ts src/engine/game.ts tests/engine/game.test.ts
git commit -m "feat(engine): track the run's biggest single payday for the debrief (E1-3)"
```

---

## Task 4: Persistence — pure record & label logic

The versioned save document and its pure transitions. No `localStorage` yet (Task 5).

**Files:**
- Create: `src/ui/storage.ts`
- Test: `tests/ui/storage.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/storage.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { emptySave, labelForDay, recordRunEnd } from "../../src/ui/storage";
import { RunEnd } from "../../src/engine/types";

const KEY = "2026-07-22";

function banked(score: number, status: "audited" | "retired" = "audited"): RunEnd {
  return { status, cause: "x", daysSurvived: 12, netWorthAtEnd: score, survivalBonus: 0, score };
}
function lost(score: number): RunEnd {
  return { status: "lost", cause: "x", daysSurvived: 3, netWorthAtEnd: score, survivalBonus: 0, score, lossCause: "fuel" };
}

describe("labelForDay", () => {
  it("is The Daily before any completed run today", () => {
    expect(labelForDay(emptySave(), KEY)).toBe("The Daily");
  });
  it("is Practice once a run today has completed", () => {
    const { save } = recordRunEnd(emptySave(), KEY, banked(100));
    expect(labelForDay(save, KEY)).toBe("Practice");
  });
});

describe("recordRunEnd", () => {
  it("the first completed run of a day is The Daily — even a death", () => {
    const r = recordRunEnd(emptySave(), KEY, lost(0));
    expect(r.save.days[KEY].attempts).toBe(1);
    expect(r.save.days[KEY].firstTryOutcome).toBe("lost");
    expect(r.save.daysFlownCount).toBe(1);
    expect(r.isFirstEver).toBe(true);
    expect(r.isNewPB).toBe(false);
  });

  it("later runs that day increment attempts and lift the day best", () => {
    const first = recordRunEnd(emptySave(), KEY, banked(100));
    const second = recordRunEnd(first.save, KEY, banked(300));
    expect(second.save.days[KEY].attempts).toBe(2);
    expect(second.save.days[KEY].bestScore).toBe(300);
    expect(second.save.days[KEY].firstTryScore).toBe(100); // The Daily result is frozen
    expect(second.isNewPB).toBe(true);
    expect(second.pbDelta).toBe(200);
    expect(second.prevBest).toBe(100);
  });

  it("increments daysFlown at most once per day", () => {
    const a = recordRunEnd(emptySave(), KEY, banked(100));
    const b = recordRunEnd(a.save, KEY, banked(50));
    expect(b.save.daysFlownCount).toBe(1);
  });

  it("counts a new day separately", () => {
    const a = recordRunEnd(emptySave(), "2026-07-22", banked(100));
    const b = recordRunEnd(a.save, "2026-07-23", banked(50));
    expect(b.save.daysFlownCount).toBe(2);
    expect(labelForDay(b.save, "2026-07-23")).toBe("Practice");
  });

  it("tracks all-time PB across days", () => {
    const a = recordRunEnd(emptySave(), "2026-07-22", banked(100));
    const b = recordRunEnd(a.save, "2026-07-23", banked(400));
    expect(b.save.allTimePB).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui/storage.test.ts`
Expected: FAIL — cannot find module `../../src/ui/storage`.

- [ ] **Step 3: Create `src/ui/storage.ts` (types + pure logic)**

```ts
// src/ui/storage.ts
//
// Per-player persistence for Starlight Traders (E0-3). Lives at the UI boundary so the
// pure engine and the balance sim never touch localStorage. Pure logic is separated
// from the I/O wrapper: `recordRunEnd`/`labelForDay` are deterministic and unit-tested;
// `loadSave`/`persist` are the only browser-only functions and degrade silently.
import { RunEnd, RunEndStatus } from "../engine/types";

export interface DayRecord {
  attempts: number; // completed runs this UTC day
  bestScore: number;
  bestOutcome: RunEndStatus;
  firstTryScore: number; // "The Daily" result — first completed run, any outcome
  firstTryOutcome: RunEndStatus;
}

export interface StarlightSave {
  version: 1;
  days: Record<string, DayRecord>; // key = UTC "YYYY-MM-DD"
  allTimePB: number;
  daysFlownCount: number;
}

export function emptySave(): StarlightSave {
  return { version: 1, days: {}, allTimePB: 0, daysFlownCount: 0 };
}

/** The run about to start is The Daily until a run has *completed* today. */
export function labelForDay(save: StarlightSave, dateKey: string): "The Daily" | "Practice" {
  return (save.days[dateKey]?.attempts ?? 0) >= 1 ? "Practice" : "The Daily";
}

export interface RecordResult {
  save: StarlightSave;
  pbDelta: number;
  isNewPB: boolean;
  prevBest: number;
  isFirstEver: boolean;
}

/** Fold a finished run into the save; returns the next save + debrief facts. Pure. */
export function recordRunEnd(save: StarlightSave, dateKey: string, runEnd: RunEnd): RecordResult {
  const isFirstEver = Object.keys(save.days).length === 0;
  const prevBest = save.allTimePB;
  const pbDelta = runEnd.score - prevBest;
  const isNewPB = !isFirstEver && runEnd.score > prevBest;

  const days = { ...save.days };
  const existing = days[dateKey];
  let daysFlownCount = save.daysFlownCount;

  if (!existing) {
    days[dateKey] = {
      attempts: 1,
      bestScore: runEnd.score,
      bestOutcome: runEnd.status,
      firstTryScore: runEnd.score,
      firstTryOutcome: runEnd.status,
    };
    daysFlownCount += 1;
  } else {
    days[dateKey] = {
      ...existing,
      attempts: existing.attempts + 1,
      bestScore: Math.max(existing.bestScore, runEnd.score),
      bestOutcome: runEnd.score > existing.bestScore ? runEnd.status : existing.bestOutcome,
    };
  }

  return {
    save: {
      ...save,
      days,
      allTimePB: Math.max(save.allTimePB, runEnd.score),
      daysFlownCount,
    },
    pbDelta,
    isNewPB,
    prevBest,
    isFirstEver,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ui/storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/storage.ts tests/ui/storage.test.ts
git commit -m "feat(storage): pure per-day record + Daily/Practice label logic (E0-3)"
```

---

## Task 5: Persistence — silent-fail I/O wrapper

The only browser-only functions: read/write the save, swallowing private-mode/quota/corruption.

**Files:**
- Modify: `src/ui/storage.ts`
- Test: `tests/ui/storage.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/storage.test.ts`:
```ts
import { vi, afterEach } from "vitest";
import { loadSave, persist } from "../../src/ui/storage";

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("loadSave / persist", () => {
  it("round-trips a save", () => {
    vi.stubGlobal("localStorage", memStore());
    const s = recordRunEnd(emptySave(), KEY, banked(250)).save;
    persist(s);
    expect(loadSave()).toEqual(s);
  });

  it("returns null when nothing is stored", () => {
    vi.stubGlobal("localStorage", memStore());
    expect(loadSave()).toBeNull();
  });

  it("returns null on a version mismatch", () => {
    const store = memStore();
    store.setItem("starlight.save.v1", JSON.stringify({ version: 2, days: {}, allTimePB: 0, daysFlownCount: 0 }));
    vi.stubGlobal("localStorage", store);
    expect(loadSave()).toBeNull();
  });

  it("degrades silently when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("private mode"); },
      setItem: () => { throw new Error("quota"); },
    });
    expect(loadSave()).toBeNull();
    expect(() => persist(emptySave())).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui/storage.test.ts`
Expected: FAIL — `loadSave`/`persist` are not exported.

- [ ] **Step 3: Add the I/O wrapper to `src/ui/storage.ts`**

Append:
```ts
const STORAGE_KEY = "starlight.save.v1";

/** Read the save, or null on absence / parse error / unknown version / private-mode throw. */
export function loadSave(): StarlightSave | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StarlightSave;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

/** Write the save; a failure (private mode, quota) means the run simply isn't remembered. */
export function persist(save: StarlightSave): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    /* intentionally ignored — degrade to no-memory behaviour */
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ui/storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/storage.ts tests/ui/storage.test.ts
git commit -m "feat(storage): silent-fail localStorage load/persist wrapper (E0-3)"
```

---

## Task 6: Debrief rendering — identity, PB delta, best haul

Enhances `runEndScreen` with the `RunMeta` view-object. New params are optional so `render.ts` still compiles.

**Files:**
- Modify: `src/ui/screens.ts` (add `RunMeta`, export `endHeadline`, rewrite `runEndScreen`)
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/ui/screens.test.ts` (extend the top imports with `endHeadline` and any needed types):
```ts
import { RunMeta } from "../../src/ui/screens";

const META: RunMeta = {
  runNumber: 22,
  runLabel: "The Daily",
  dateLabel: "Jul 22",
  debrief: { pbDelta: 300, isNewPB: true, prevBest: 2440, isFirstEver: false },
};

describe("runEndScreen debrief (E1-3)", () => {
  it("shows the run identity line", () => {
    const s = { ...createGame(42), day: 12 };
    const r = endRun(s, "audited", "Audited.").runEnd!;
    const html = runEndScreen(endRun(s, "audited", "Audited."), r, false, META); // see note below
    expect(html).toContain("Starlight #22");
    expect(html).toContain("Jul 22");
    expect(html).toContain("The Daily");
  });

  it("shows a new-personal-best line when isNewPB", () => {
    const s = { ...createGame(42), day: 12 };
    const r = endRun(s, "audited", "Audited.").runEnd!;
    const html = runEndScreen(endRun(s, "audited", "Audited."), r, false, META);
    expect(html).toContain("New personal best");
  });

  it("shows the first-banked-run line when isFirstEver", () => {
    const s = { ...createGame(42), day: 12 };
    const r = endRun(s, "audited", "Audited.").runEnd!;
    const meta: RunMeta = { ...META, debrief: { pbDelta: 0, isNewPB: false, prevBest: 0, isFirstEver: true } };
    const html = runEndScreen(endRun(s, "audited", "Audited."), r, false, meta);
    expect(html).toContain("first banked run");
  });

  it("shows the best haul when the run had a payday", () => {
    const base = { ...createGame(42), day: 12, biggestPayday: { amount: 2140, label: "Luxury Goods at Meridian" } };
    const r = endRun(base, "audited", "Audited.").runEnd!;
    const html = runEndScreen(endRun(base, "audited", "Audited."), r, false, META);
    expect(html).toContain("2,140cr");
    expect(html).toContain("Luxury Goods at Meridian");
  });
});
```

> **Note for the implementer:** `runEndScreen(state, runEnd, restartArmed?, meta?)` — the first arg is the game state (for `peakNetWorth`/`biggestPayday`), the second is the `RunEnd`. In these tests `endRun(...)` returns a state whose `.runEnd` is `r`; pass that state as the first arg and `r` as the second. Simplify by binding `const ended = endRun(s, "audited", "Audited."); const html = runEndScreen(ended, ended.runEnd!, false, META);`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui/screens.test.ts`
Expected: FAIL — `RunMeta` not exported / `runEndScreen` arity.

- [ ] **Step 3: Add `RunMeta` and export `endHeadline`**

In `src/ui/screens.ts`, add near the top (after the imports):
```ts
export interface RunMeta {
  runNumber: number;
  runLabel: "The Daily" | "Practice";
  dateLabel: string;
  bootStats?: { attemptsToday: number; bestToday: number | null; allTimePB: number };
  debrief?: { pbDelta: number; isNewPB: boolean; prevBest: number; isFirstEver: boolean };
}
```
Change `function endHeadline` (line 368) to `export function endHeadline`.

- [ ] **Step 4: Add the PB-delta line helper**

Above `runEndScreen`:
```ts
function pbDeltaLine(d: NonNullable<RunMeta["debrief"]>, score: number): string {
  if (d.isFirstEver) {
    return `<p class="run-end__pb">Your first banked run — ${score.toLocaleString()} to beat.</p>`;
  }
  if (d.isNewPB) {
    return `<p class="run-end__pb run-end__pb--best">🏆 New personal best!  ▲ +${d.pbDelta.toLocaleString()}</p>`;
  }
  const sign = d.pbDelta >= 0 ? `▲ +${d.pbDelta.toLocaleString()}` : `▼ ${Math.abs(d.pbDelta).toLocaleString()}`;
  return `<p class="run-end__pb">${sign} vs your best (${d.prevBest.toLocaleString()})</p>`;
}
```

- [ ] **Step 5: Rewrite `runEndScreen`**

Replace the whole `runEndScreen` function with:
```ts
export function runEndScreen(s: GameState, r: RunEnd, restartArmed = false, meta?: RunMeta): string {
  const banked = r.status !== "lost";
  const identity = meta
    ? `<p class="run-end__id">🚀 Starlight #${meta.runNumber} · ${meta.dateLabel} · ${meta.runLabel}</p>`
    : "";
  const pb = meta?.debrief ? pbDeltaLine(meta.debrief, r.score) : "";
  const haul = s.biggestPayday
    ? `<div class="st-kv"><span class="st-kv__label">Best haul</span><span class="st-kv__value st-num">+${cr(s.biggestPayday.amount)} · ${s.biggestPayday.label}</span></div>`
    : "";
  const restart = restartArmed
    ? `<div class="retire-confirm">
            <button class="st-btn st-btn--ghost retire-confirm__go" data-act="restartConfirm">Start a Practice run?</button>
            <button class="st-btn st-btn--ghost retire-confirm__cancel" data-act="restartCancel" aria-label="Cancel new run" title="Cancel">✕</button>
          </div>`
    : `<button class="st-btn st-btn--ghost" data-act="restart">New run</button>`;
  return `<div class="overlay-stage">
    <div class="st-glow-wrap">
      <div class="st-panel st-panel--chamfer"><div class="st-panel__inner">
        <div class="run-end">
          <h1 tabindex="-1">${endHeadline(r)}</h1>
          ${identity}
          <p>You survived ${r.daysSurvived} day${r.daysSurvived === 1 ? "" : "s"}.</p>
          <p class="run-end__cause">${r.cause}</p>
          <div class="run-end__breakdown">
            <div class="st-kv"><span class="st-kv__label">Net worth${banked ? "" : " (cargo lost with the ship)"}</span><span class="st-kv__value st-num">${cr(r.netWorthAtEnd)}</span></div>
            <div class="st-kv"><span class="st-kv__label">Survival bonus</span><span class="st-kv__value st-num">${banked ? `+${r.survivalBonus}` : "forfeited"}</span></div>
            <div class="st-kv"><span class="st-kv__label">Peak net worth</span><span class="st-kv__value st-num">${cr(s.peakNetWorth)}</span></div>
            ${haul}
          </div>
          ${pb}
          <p class="score st-num">Score: ${r.score.toLocaleString()}</p>
          <button class="st-btn" data-act="share">Copy score card</button>
          ${restart}
        </div>
      </div></div>
    </div>
  </div>`;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/ui/screens.test.ts`
Expected: PASS. (Existing `runEndScreen` tests that call it with two args still pass — the new params are optional.)

- [ ] **Step 7: Commit**

```bash
git add src/ui/screens.ts tests/ui/screens.test.ts
git commit -m "feat(ui): debrief with run identity, PB delta, and best-haul line (E1-3)"
```

---

## Task 7: Restart confirm (verify the two-click render)

The rendering already landed in Task 6 (`restartArmed`). This task locks it with a test.

**Files:**
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/ui/screens.test.ts`:
```ts
describe("runEndScreen restart confirm (P3-3)", () => {
  it("offers a plain New run button when disarmed", () => {
    const ended = endRun({ ...createGame(42), day: 12 }, "audited", "Audited.");
    const html = runEndScreen(ended, ended.runEnd!, false, META);
    expect(html).toContain('data-act="restart"');
    expect(html).not.toContain('data-act="restartConfirm"');
  });

  it("asks for confirmation when armed", () => {
    const ended = endRun({ ...createGame(42), day: 12 }, "audited", "Audited.");
    const html = runEndScreen(ended, ended.runEnd!, true, META);
    expect(html).toContain('data-act="restartConfirm"');
    expect(html).toContain('data-act="restartCancel"');
    expect(html).toContain("Start a Practice run?");
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/ui/screens.test.ts`
Expected: PASS immediately (Task 6 implemented the branch). If it fails, fix the `restart` ternary in `runEndScreen`.

- [ ] **Step 3: Commit**

```bash
git add tests/ui/screens.test.ts
git commit -m "test(ui): cover the two-click restart confirm (P3-3)"
```

---

## Task 8: Cockpit header identity + boot stats

Puts the run number + Daily/Practice label in the header, and today's attempts/best/PB on the day-1 intro.

**Files:**
- Modify: `src/ui/screens.ts` (`screenHead`, `stationScreen`)
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/ui/screens.test.ts`:
```ts
describe("stationScreen header identity (E0-3)", () => {
  it("shows run number and Daily/Practice label when meta is present", () => {
    const html = stationScreen(createGame(42), [], "Jul 22", false, META);
    expect(html).toContain("#22");
    expect(html).toContain("The Daily");
  });

  it("shows today's attempts / best / PB on day 1", () => {
    const meta: RunMeta = { ...META, bootStats: { attemptsToday: 2, bestToday: 2140, allTimePB: 3010 } };
    const html = stationScreen(createGame(42), [], "Jul 22", false, meta);
    expect(html).toContain("3,010"); // all-time PB
    expect(html).toContain("2,140"); // today's best
  });

  it("hides boot stats after day 1", () => {
    const meta: RunMeta = { ...META, bootStats: { attemptsToday: 2, bestToday: 2140, allTimePB: 3010 } };
    const html = stationScreen({ ...createGame(42), day: 5 }, [], "Jul 22", false, meta);
    expect(html).not.toContain("all-time PB");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui/screens.test.ts`
Expected: FAIL — `stationScreen` ignores meta.

- [ ] **Step 3: Rewrite `screenHead`**

Replace `screenHead` (lines 50-55) with:
```ts
function screenHead(s: GameState, dateLabel = "", meta?: RunMeta): string {
  const sub = meta
    ? `${NODES[s.location].name} · Day ${s.day}/${RUN_LENGTH} · Starlight #${meta.runNumber} · ${meta.dateLabel} · ${meta.runLabel}`
    : `${NODES[s.location].name} · Day ${s.day}/${RUN_LENGTH}${dateLabel ? ` · ${dateLabel}` : ""}`;
  const stats =
    meta?.bootStats && s.day === 1
      ? `<p class="screen-head__stats">Today: ${meta.bootStats.attemptsToday} flown · best ${
          meta.bootStats.bestToday === null ? "—" : meta.bootStats.bestToday.toLocaleString()
        } · all-time PB ${meta.bootStats.allTimePB.toLocaleString()}</p>`
      : "";
  return `<header class="screen-head">
    <h1 class="st-screen-title" tabindex="-1">Starlight Traders</h1>
    <p class="screen-head__sub">${sub}</p>
    ${stats}
  </header>`;
}
```

- [ ] **Step 4: Thread meta through `stationScreen`**

Change the `stationScreen` signature (line 303) and the `screenHead` call (line 323):
```ts
export function stationScreen(
  s: GameState,
  turnReport: string[] = [],
  dateLabel = "",
  retireArmed = false,
  meta?: RunMeta
): string {
```
and:
```ts
    ${screenHead(s, dateLabel, meta)}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/ui/screens.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens.ts tests/ui/screens.test.ts
git commit -m "feat(ui): run identity in the header + boot stats on the intro (E0-3)"
```

---

## Task 9: Wire persistence, meta, share label, and restart confirm into `main.ts`

Glue task. `main.ts` and `render.ts` change together so the build stays green. Verified by build + browser (this codebase has no `main.ts`/`render.ts` unit tests).

**Files:**
- Modify: `src/ui/render.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Extend the `ViewModel` and `render`**

In `src/ui/render.ts`:
```ts
import { GameEvent, GameState } from "../engine/types";
import { eventScreen, runEndScreen, stationScreen, RunMeta } from "./screens";

export interface ViewModel {
  state: GameState;
  pendingEvent: GameEvent | null;
  turnReport: string[];
  dateLabel: string;
  retireArmed: boolean;
  restartArmed: boolean;
  meta: RunMeta;
}

export function render(root: HTMLElement, vm: ViewModel): void {
  if (vm.state.runEnd) {
    root.innerHTML = runEndScreen(vm.state, vm.state.runEnd, vm.restartArmed, vm.meta);
  } else if (vm.pendingEvent) {
    root.innerHTML = eventScreen(vm.state, vm.pendingEvent);
  } else {
    root.innerHTML = stationScreen(vm.state, vm.turnReport, vm.dateLabel, vm.retireArmed, vm.meta);
  }
}
```

- [ ] **Step 2: Add persistence + meta wiring to `main.ts`**

Extend the imports at the top of `src/main.ts`:
```ts
import { copyShare, formatDateLabel, utcDateKey, runNumber } from "./ui/share";
import { loadSave, persist, recordRunEnd, labelForDay, emptySave } from "./ui/storage";
import { NODES } from "./engine/world";
import { RUN_LENGTH } from "./engine/run-end";
import { endHeadline, type RunMeta } from "./ui/screens";
```
(This replaces the existing `import { copyShare, formatDateLabel } from "./ui/share";` line — don't leave a duplicate. `RunMeta` is defined in `screens.ts`; keep the existing `render` import from `./ui/render`.)

Then replace the module-state + boot section (lines 40-54) with:
```ts
let save = loadSave() ?? emptySave();
let recorded = false;
let lastDebrief: RunMeta["debrief"];
let runLabel: "The Daily" | "Practice" = "The Daily";

let state: GameState = bootDailyGame();
let pendingEvent: GameEvent | null = null;
let turnReport: string[] = [];
let logMarkBeforeJump = 0;
let retireArmed = false;
let restartArmed = false;
let lastAct: { act?: string; id?: string } = {};

function startNewRun() {
  state = bootDailyGame();
  pendingEvent = null;
  recorded = false;
  lastDebrief = undefined;
  runLabel = labelForDay(save, utcDateKey(state.bootDate));
}
startNewRun();

function recordIfEnded() {
  if (!state.runEnd || recorded) return;
  const res = recordRunEnd(save, utcDateKey(state.bootDate), state.runEnd);
  save = res.save;
  persist(save);
  lastDebrief = { pbDelta: res.pbDelta, isNewPB: res.isNewPB, prevBest: res.prevBest, isFirstEver: res.isFirstEver };
  recorded = true;
}

function buildMeta(): RunMeta {
  const today = save.days[utcDateKey(state.bootDate)];
  return {
    runNumber: runNumber(state.bootDate),
    runLabel,
    dateLabel: dateLabelOf(state),
    bootStats: {
      attemptsToday: today?.attempts ?? 0,
      bestToday: today?.bestScore ?? null,
      allTimePB: save.allTimePB,
    },
    debrief: state.runEnd ? lastDebrief : undefined,
  };
}

function titleFor(s: GameState): string {
  if (s.runEnd) return `${endHeadline(s.runEnd)} · Score ${s.runEnd.score} — Starlight Traders`;
  return `Day ${s.day}/${RUN_LENGTH} · ${NODES[s.location].name} — Starlight Traders`;
}

function restoreFocus() {
  const { act, id } = lastAct;
  if (!act) return;
  const sel = id ? `[data-act="${act}"][data-id="${id}"]` : `[data-act="${act}"]`;
  const el = app.querySelector<HTMLElement>(sel);
  if (el && el.getAttribute("aria-disabled") !== "true") el.focus();
  else app.querySelector<HTMLElement>("h1")?.focus();
}
```

> **Note:** `startNewRun()` replaces the old `let state = bootDailyGame()` initializer — keep only one definition of `state`, `pendingEvent`, `turnReport`, `logMarkBeforeJump`, `retireArmed`. The `recorded`/`lastDebrief`/`runLabel` line before `bootDailyGame()` must come first; `startNewRun()` then sets `runLabel` correctly from the loaded save.

- [ ] **Step 3: Update `paint`**

Replace `paint`:
```ts
function paint() {
  render(app, {
    state,
    pendingEvent,
    turnReport,
    dateLabel: dateLabelOf(state),
    retireArmed,
    restartArmed,
    meta: buildMeta(),
  });
  document.title = titleFor(state);
  restoreFocus();
}
```

- [ ] **Step 4: Add the restart-confirm actions**

In `applyAction`, replace the `case "restart"` block:
```ts
    case "restart":
      restartArmed = true;
      break;
    case "restartConfirm":
      startNewRun();
      break;
    // "restartCancel" needs no case — the click handler disarms on any non-"restart" action.
```

- [ ] **Step 5: Disarm restart + record on every click; pass share fields**

In the click handler, after the existing `if (act !== "retire") retireArmed = false;` add:
```ts
  if (act !== "restart") restartArmed = false;
  lastAct = { act, id };
```
Replace the `share` branch to pass the new `ShareData` fields:
```ts
  if (act === "share") {
    if (state.runEnd) {
      await copyShare({
        dateLabel: dateLabelOf(state),
        score: state.runEnd.score,
        daysSurvived: state.runEnd.daysSurvived,
        runNumber: runNumber(state.bootDate),
        label: runLabel,
      });
    }
  } else {
    applyAction(act, id, qty);
    recordIfEnded();
  }
  paint();
```

- [ ] **Step 6: Type-check and build**

Run: `npm run build`
Expected: PASS (no TS errors). If the compiler flags an unused import, remove it — only `RUN_LENGTH`, `NODES`, `endHeadline`, `RunMeta`, and the storage/share functions should remain.

- [ ] **Step 7: Verify in the browser**

Start the preview (create `.claude/launch.json` for `npm run dev` on port 5173 if absent), then:
- Play a run to the Day-12 audit (or Retire). Debrief shows `🚀 Starlight #N · <date> · The Daily`, a PB line, and "Best haul: …".
- Click **New run** → it shows "Start a Practice run?" with a ✕. Confirm → header now reads **Practice**.
- Reload mid-run (F5) → a fresh run starts; the day-1 intro shows "Today: N flown · best … · all-time PB …".
- Check the browser tab title changes with day/location and on the end screen.
Capture a screenshot of the debrief. Fix any issue in source and rebuild before committing.

- [ ] **Step 8: Commit**

```bash
git add src/main.ts src/ui/render.ts
git commit -m "feat: wire persistence, run identity, share label, and restart confirm (E0-3, E1-3, P3-3)"
```

---

## Task 10: P3-3 — focus restore + `document.title` + event `<h1>` tabindex

Focus restore and `document.title` were added in Task 9's `paint`. This task adds the last focus-fallback target and verifies the a11y behaviour end-to-end.

**Files:**
- Modify: `src/ui/screens.ts` (event screen `<h1>` tabindex)

- [ ] **Step 1: Make the event heading focusable**

In `eventScreen` (screens.ts:360) change `<h1>${e.title}</h1>` to:
```ts
          <h1 tabindex="-1">${e.title}</h1><p>${e.description}</p><div class="choices">${choices}</div>
```
(The station `<h1>` got its tabindex in Task 8 and the run-end `<h1>` in Task 6 — all three screens now expose a focusable heading fallback.)

- [ ] **Step 2: Run the UI test file (no regression)**

Run: `npx vitest run tests/ui/screens.test.ts`
Expected: PASS.

- [ ] **Step 3: Verify a11y behaviour in the browser**

With the preview running:
- Buy 1 unit, then press Tab — focus should be on/after the same Buy control, not reset to the page top. Repeat for a jump and an event choice.
- Trigger an in-transit event; after resolving, focus lands on the acted control or a heading, never `<body>` (inspect `document.activeElement` via the console tool).
- Confirm the tab title reads `Day N/12 · <Station> — Starlight Traders` while playing and `<Outcome> · Score N — Starlight Traders` at the end.

- [ ] **Step 4: Commit**

```bash
git add src/ui/screens.ts
git commit -m "feat(a11y): focusable event heading for post-render focus restore (P3-3)"
```

---

## Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire suite**

Run: `npm test`
Expected: all tests pass (the ~78 pre-existing plus the new storage/share/game/screens tests). Note the final count.

- [ ] **Step 2: Type-check + production build**

Run: `npm run build`
Expected: no TypeScript errors; Vite build succeeds.

- [ ] **Step 3: Lint + format check**

Run: `npm run lint && npm run format:check`
Expected: clean. If format fails, run `npm run format` and re-commit.

- [ ] **Step 4: Browser smoke of the full acceptance flow**

With the preview running, confirm each spec acceptance criterion:
- First completed run of the day → **The Daily** in header, debrief, and share card (copy it and inspect).
- A second run same session → **Practice** in all three.
- Reload mid-run records nothing and does not consume the Daily (finish run 1 *after* a mid-run reload → still labelled The Daily).
- Debrief shows identity + PB delta (or "New personal best!"/"first banked run") + best haul.
- `daysFlownCount` in `localStorage` (DevTools → Application → Local Storage → `starlight.save.v1`) increments once per UTC day.
- "New run" is confirm-gated; focus never drops to `<body>`; tab title reflects state.

- [ ] **Step 5: Final commit (if any format/lint fixups)**

```bash
git add -A
git commit -m "chore: lint/format fixups for the M1-close + debrief round"
```

---

## Self-review notes

- **Spec coverage:** E0-3 → Tasks 2 (helpers/label), 4–5 (persistence), 8 (boot stats), 9 (wiring); E1-3 → Tasks 3 (best haul), 6 (debrief), 9 (wiring); P3-3 → Tasks 6/8 (h1 tabindex), 9 (focus/title), 10 (event h1 + verify); B-5 → Task 1. Every spec acceptance criterion maps to a verification step in Task 9 or 11.
- **Type consistency:** `RunMeta` (screens.ts) is the single view-object, imported by render.ts and main.ts; `RecordResult` fields (`pbDelta`/`isNewPB`/`prevBest`/`isFirstEver`) match `RunMeta["debrief"]`; `ShareData` gains `runNumber`+`label`, supplied at the one `copyShare` call site.
- **Out of scope (unchanged):** share card v2 emoji strip, "left on the table", cost-basis P&L, DOM-patching re-render. No economy tuning → no 100-seed sweep re-run.
