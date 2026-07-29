# M2 Round 2 — "Close the Loop" (E0-5 + E1-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Same-day resume of the live run (E0-5) and the share-card v2 emoji run-strip + cause line (E1-2), per the approved spec [2026-07-29-resume-and-share-card-design.md](../specs/2026-07-29-resume-and-share-card-design.md).

**Architecture:** The engine gains a per-day semantic highlight tracker (`GameState.dayHighlights`, upgrade-only priority) that `share.ts` maps to emoji; persistence stays at the UI boundary — `storage.ts` gains a second versioned localStorage document (`starlight.run.v1`) snapshotting `{state, pendingEvent, label, logMarkBeforeJump}` after every settled action, rehydrated at boot when same-UTC-day. The render layer already branches on `pendingEvent`, so a resumed mid-event run re-shows the event screen with no render changes.

**Tech Stack:** TypeScript + Vite, Vitest (`npm test` = `vitest run`), ESLint/Prettier. No new dependencies.

**Conventions that apply to every task:**

- Pure logic is unit-tested; thin `localStorage` wrappers use try/catch silent degradation and get only throw-safety tests (see the existing pattern in [tests/ui/storage.test.ts](../../../tests/ui/storage.test.ts)).
- The engine (`src/engine/**`, `src/sim/**`) never touches `localStorage` or the DOM.
- Every commit message ends with the trailer line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Run `npm test` from the repo root; the full suite must stay green at every commit.

---

### Task 1: `dayHighlights` field + `BIG_TRADE_CR` constant

**Files:**

- Modify: `src/engine/types.ts` (add `DayHighlightKind`, extend `GameState`)
- Modify: `src/engine/economy.ts` (add `BIG_TRADE_CR`)
- Modify: `src/engine/game.ts` (initialize in `createGame`)
- Test: `tests/engine/game.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/engine/game.test.ts`:

```ts
describe("dayHighlights", () => {
  it("starts empty in createGame", () => {
    expect(createGame(42).dayHighlights).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/game.test.ts -t "starts empty"`
Expected: FAIL — `expected undefined to deeply equal {}` (the field doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

In `src/engine/types.ts`, above `GameState`:

```ts
/** The notable thing that happened on a game day — feeds the share card's run-strip (E1-2). */
export type DayHighlightKind = "pirates" | "bigTrade" | "delivery";
```

Inside `GameState` (after `biggestPayday?`):

```ts
/** Per-day notable moment for the share strip (E1-2); key = game day. Upgrade-only via markDay. */
dayHighlights: Partial<Record<number, DayHighlightKind>>;
```

In `src/engine/economy.ts`, next to the other constants (after `REPAIR_PRICE`):

```ts
/** A single credit inflow at or above this marks the day 💰 on the share strip (E1-2). */
export const BIG_TRADE_CR = 500;
```

In `src/engine/game.ts` `createGame`, add to the returned object (after `peakNetWorth: 0,`):

```ts
    dayHighlights: {},
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: full suite PASS (the new field is inert everywhere else).

- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts src/engine/economy.ts src/engine/game.ts tests/engine/game.test.ts
git commit -m "feat(engine): add dayHighlights field and BIG_TRADE_CR constant (E1-2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `markDay` recording at the three sites

**Files:**

- Modify: `src/engine/game.ts` (`markDay` helper; `sell`, `settleMissions`, `resolvePirates`)
- Test: `tests/engine/game.test.ts`

- [ ] **Step 1: Write the failing tests**

Extend the `describe("dayHighlights", ...)` block from Task 1. Note: `createGame` starts on day 1 at `terra`; `jump` advances to day 2. Luxury `basePrice` is 480, so 5 units sell for ≥ ~1,170cr net even at worst-case modifiers — always over `BIG_TRADE_CR`; 1 water unit nets ≤ ~32cr — always under.

```ts
describe("dayHighlights", () => {
  it("starts empty in createGame", () => {
    expect(createGame(42).dayHighlights).toEqual({});
  });

  const piratesEvt: GameEvent = {
    kind: "pirates",
    title: "",
    description: "",
    choices: [
      { id: "pay", label: "" },
      { id: "flee", label: "" },
    ],
  };

  it("marks a pirate day whether paying or fleeing", () => {
    let s = createGame(42);
    s = { ...s, fuel: 20, credits: 5000 };
    s = jump(s, "kiruna").state; // day 2
    expect(resolveChoice(s, piratesEvt, "pay").dayHighlights[2]).toBe("pirates");
    expect(resolveChoice(s, piratesEvt, "flee").dayHighlights[2]).toBe("pirates");
  });

  it("marks a big sale as bigTrade", () => {
    let s = createGame(42);
    s = { ...s, cargo: { ...s.cargo, luxury: 5 } };
    s = sell(s, "luxury", 5); // ≥ ~1,170cr net — always over BIG_TRADE_CR
    expect(s.dayHighlights[1]).toBe("bigTrade");
  });

  it("does not mark a small sale", () => {
    let s = createGame(42);
    s = { ...s, cargo: { ...s.cargo, water: 1 } };
    s = sell(s, "water", 1); // ≤ ~32cr net — always under BIG_TRADE_CR
    expect(s.dayHighlights[1]).toBeUndefined();
  });

  it("marks a modest delivery as delivery", () => {
    let s = createGame(42);
    s = acceptMission(s, {
      id: "d1",
      commodity: "water",
      qty: 2,
      destination: "terra",
      reward: 100,
      deadlineDay: 99,
    });
    s = { ...s, cargo: { ...s.cargo, water: 2 } };
    s = deliver(s);
    expect(s.dayHighlights[1]).toBe("delivery");
  });

  it("upgrades a whale delivery to bigTrade", () => {
    let s = createGame(42);
    s = acceptMission(s, {
      id: "w1",
      commodity: "water",
      qty: 2,
      destination: "terra",
      reward: 5000,
      deadlineDay: 99,
    });
    s = { ...s, cargo: { ...s.cargo, water: 2 } };
    s = deliver(s);
    expect(s.dayHighlights[1]).toBe("bigTrade");
  });

  it("never downgrades a day's highlight", () => {
    let s = createGame(42);
    s = { ...s, fuel: 20, credits: 5000, cargo: { ...s.cargo, luxury: 5 } };
    s = jump(s, "kiruna").state; // day 2
    s = resolveChoice(s, piratesEvt, "pay"); // pirates on day 2
    s = sell(s, "luxury", 5); // big sale, same day
    expect(s.dayHighlights[2]).toBe("pirates"); // pirates outranks bigTrade
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/game.test.ts -t "dayHighlights"`
Expected: the Task-1 test passes; every new test FAILS with `expected undefined to be 'pirates'` (etc.).

- [ ] **Step 3: Write the implementation**

In `src/engine/game.ts`:

Add `BIG_TRADE_CR` to the existing import from `./economy`, and `DayHighlightKind` to the import from `./types`.

Add below `trackPayday` (near the other small helpers):

```ts
const HIGHLIGHT_RANK: Record<DayHighlightKind, number> = { pirates: 3, bigTrade: 2, delivery: 1 };

/** Record the current day's notable moment for the share strip (E1-2). Upgrade-only. */
function markDay(s: GameState, kind: DayHighlightKind): GameState {
  const cur = s.dayHighlights[s.day];
  if (cur && HIGHLIGHT_RANK[cur] >= HIGHLIGHT_RANK[kind]) return s;
  return { ...s, dayHighlights: { ...s.dayHighlights, [s.day]: kind } };
}
```

In `sell()`, after the `next = trackPayday(...)` line and before the `return`:

```ts
if (proceeds - tax >= BIG_TRADE_CR) next = markDay(next, "bigTrade");
```

In `settleMissions()`, inside the delivered branch, after the `s = withLog(s, \`Delivery complete: +${m.reward}cr.\`);` line:

```ts
s = markDay(s, "delivery");
if (m.reward >= BIG_TRADE_CR) s = markDay(s, "bigTrade");
```

Replace `resolvePirates` so the mark applies on both choices:

```ts
function resolvePirates(s: GameState, choiceId: string): GameState {
  const marked = markDay(s, "pirates");
  if (choiceId === "pay") {
    const toll = pirateToll(marked);
    return withLog({ ...marked, credits: marked.credits - toll }, `Paid pirates ${toll}cr.`);
  }
  const dmg = fleeDamage(marked.day);
  return withLog({ ...marked, hull: marked.hull - dmg }, `Fled — took ${dmg} hull damage.`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: full suite PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/game.ts tests/engine/game.test.ts
git commit -m "feat(engine): record per-day highlights for the share strip (E1-2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 💰-band sim check, tune `BIG_TRADE_CR`

**Files:**

- Modify: `src/sim/simulate.ts` (add `bigTradeDays` to `SimResult`)
- Scratch (create then **delete**): `tests/sim/bigtrade-band.check.test.ts`

- [ ] **Step 1: Add `bigTradeDays` to the sim result**

In `src/sim/simulate.ts`, add to `SimResult`:

```ts
/** Days whose highlight is 💰 — observability for E1-2's BIG_TRADE_CR tuning. */
bigTradeDays: number;
```

And in `toResult`:

```ts
    bigTradeDays: Object.values(s.dayHighlights).filter((k) => k === "bigTrade").length,
```

- [ ] **Step 2: Run the suite — fix `toEqual`-style sim assertions if any break**

Run: `npm test`
Expected: PASS. If `tests/sim/simulate.test.ts` compares whole `SimResult` objects with `toEqual`, extend the expected objects with the new field rather than weakening the assertion.

- [ ] **Step 3: Write the scratch band check**

Create `tests/sim/bigtrade-band.check.test.ts`:

```ts
import { describe, it } from "vitest";
import { runArchetype } from "../../src/sim/simulate";

describe("BIG_TRADE_CR band check (scratch — delete after reading)", () => {
  it("prints the 💰-days distribution across 100 seeds", () => {
    for (const kind of ["cautious", "balanced", "greedy"] as const) {
      const counts = Array.from(
        { length: 100 },
        (_, i) => runArchetype(kind, 1000 + i).bigTradeDays
      );
      counts.sort((a, b) => a - b);
      console.log(
        `${kind}: median ${counts[50]}, p25 ${counts[25]}, p75 ${counts[75]}, max ${counts[99]}`
      );
    }
  });
});
```

- [ ] **Step 4: Run it and read the band**

Run: `npx vitest run tests/sim/bigtrade-band.check.test.ts`
Expected output: three `console.log` lines. **Acceptance band: the `balanced` median is 1–3.**

- Median 0 → lower `BIG_TRADE_CR` in `src/engine/economy.ts` (try 400, then 300) and re-run.
- Median > 5 → raise it (try 750, then 1000) and re-run.
- In band → no change.

- [ ] **Step 5: Delete the scratch file, verify, commit**

```bash
rm tests/sim/bigtrade-band.check.test.ts
npm test
git add src/sim/simulate.ts src/engine/economy.ts tests/sim
git commit -m "feat(sim): expose bigTradeDays; tune BIG_TRADE_CR against the 100-seed band

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(If `BIG_TRADE_CR` stayed 500, the `economy.ts` add is a no-op in this commit — that's fine.)

---

### Task 4: `runStrip` in share.ts

**Files:**

- Modify: `src/ui/share.ts`
- Test: `tests/engine/share.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/share.test.ts` (add `runStrip` to the existing import from `../../src/ui/share`):

```ts
describe("runStrip", () => {
  it("renders one default glyph per day survived", () => {
    expect(runStrip({}, 12, "audited")).toBe("🟦".repeat(12));
  });

  it("maps highlights to their glyphs", () => {
    expect(runStrip({ 2: "pirates", 3: "bigTrade", 4: "delivery" }, 5, "retired")).toBe(
      "🟦🟥💰🟨🟦"
    );
  });

  it("stamps 💀 on the final day of a lost run only", () => {
    expect(runStrip({ 3: "pirates" }, 3, "lost")).toBe("🟦🟦💀"); // 💀 outranks the day's own mark
    expect(runStrip({}, 1, "lost")).toBe("💀"); // day-1 death is a single skull
    expect(runStrip({}, 3, "audited")).toBe("🟦🟦🟦"); // banked runs never show 💀
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/share.test.ts -t "runStrip"`
Expected: FAIL — `runStrip is not a function` (not exported yet).

- [ ] **Step 3: Write the implementation**

In `src/ui/share.ts`, add the import at the top and the function below `runNumber`:

```ts
import { DayHighlightKind, RunEndStatus } from "../engine/types";
```

```ts
const STRIP_GLYPHS: Record<DayHighlightKind, string> = {
  pirates: "🟥",
  bigTrade: "💰",
  delivery: "🟨",
};

/**
 * One glyph per day survived — the spoiler-free story of the run (E1-2). 💀 stamps the
 * final day of a lost run (derived from RunEnd, not recorded); unmarked days are 🟦.
 */
export function runStrip(
  highlights: Partial<Record<number, DayHighlightKind>>,
  daysSurvived: number,
  status: RunEndStatus
): string {
  let out = "";
  for (let day = 1; day <= daysSurvived; day++) {
    if (day === daysSurvived && status === "lost") {
      out += "💀";
      continue;
    }
    const kind = highlights[day];
    out += kind ? STRIP_GLYPHS[kind] : "🟦";
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine/share.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/share.ts tests/engine/share.test.ts
git commit -m "feat(ui): emoji run-strip renderer for the share card (E1-2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: shareText v2 — four-line card with strip + cause

**Files:**

- Modify: `src/ui/share.ts` (`ShareData`, `shareText`)
- Test: `tests/engine/share.test.ts` (update 3 existing tests + add format test)

- [ ] **Step 1: Update existing tests and add the format test**

The three existing `shareText` tests construct `ShareData` — add the two new fields to each call: `strip: "🟦"` and `cause: "Audited"` (any values; the assertions don't inspect them). Then append:

```ts
it("is the four-line v2 card: identity, score+cause, strip, URL", () => {
  const txt = shareText({
    dateLabel: "Jul 29",
    score: 2140,
    daysSurvived: 12,
    runNumber: 29,
    label: "The Daily",
    strip: "🟦🟦🟥💰🟦🟨🟦🟦💰🟦🟦🟦",
    cause: "Audited",
  });
  const lines = txt.split("\n");
  expect(lines).toHaveLength(4);
  expect(lines[0]).toBe("🚀 Starlight #29 · Jul 29 · The Daily");
  expect(lines[1]).toBe("Score 2,140 · survived 12 days — Audited");
  expect(lines[2]).toBe("🟦🟦🟥💰🟦🟨🟦🟦💰🟦🟦🟦");
  expect(lines[3]).toBe(`Beat my run: ${GAME_URL}`);
});
```

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `npx vitest run tests/engine/share.test.ts`
Expected: the new format test FAILS (the old `shareText` emits the three-line layout). The updated existing tests still PASS — vitest strips types without checking them, so the extra `strip`/`cause` fields are simply ignored at runtime; that's fine, the format test is the one proving the change.

- [ ] **Step 3: Write the implementation**

In `src/ui/share.ts`, replace `ShareData` and `shareText`:

```ts
export interface ShareData {
  dateLabel: string;
  score: number;
  daysSurvived: number;
  runNumber: number;
  label: "The Daily" | "Practice";
  /** Emoji run-strip from runStrip() — one glyph per day. */
  strip: string;
  /** Short end headline ("Audited" / "Retired" / "Ship Destroyed" / "Stranded"). */
  cause: string;
}

export function shareText(d: ShareData): string {
  return [
    `🚀 Starlight #${d.runNumber} · ${d.dateLabel} · ${d.label}`,
    `Score ${d.score.toLocaleString("en-US")} · survived ${d.daysSurvived} days — ${d.cause}`,
    d.strip,
    `Beat my run: ${GAME_URL}`,
  ].join("\n");
}
```

(`"en-US"` is pinned so the card's thousands separator doesn't vary with the player's locale — the card is a cross-audience artifact.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: full suite PASS (only `main.ts` consumes `ShareData`; it's fixed next task — if `npm test` surfaces a type error there, note it and proceed: vitest doesn't typecheck `main.ts`, and Task 6 resolves it before any build).

- [ ] **Step 5: Commit**

```bash
git add src/ui/share.ts tests/engine/share.test.ts
git commit -m "feat(ui): four-line share card v2 — strip and cause line (E1-2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Wire the v2 card in main.ts

**Files:**

- Modify: `src/main.ts` (share handler, ~line 217)

- [ ] **Step 1: Update the share handler**

In `src/main.ts`, add `runStrip` to the import from `./ui/share` (`endHeadline` is already imported from `./ui/screens`). Replace the `copyShare` call:

```ts
if (act === "share") {
  if (state.runEnd) {
    await copyShare({
      dateLabel: dateLabelOf(state),
      score: state.runEnd.score,
      daysSurvived: state.runEnd.daysSurvived,
      runNumber: runNumber(state.bootDate),
      label: runLabel,
      strip: runStrip(state.dayHighlights, state.runEnd.daysSurvived, state.runEnd.status),
      cause: endHeadline(state.runEnd),
    });
  }
}
```

- [ ] **Step 2: Verify build + suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; full suite PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(ui): pass run-strip and cause into the share card (E1-2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: `RunSnapshot` — parse, load, persist, clear (E0-5)

**Files:**

- Modify: `src/ui/storage.ts`
- Test: `tests/ui/storage.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/storage.test.ts`. Extend the imports: add `parseSnapshot, loadSnapshot, persistSnapshot, clearSnapshot` and type `RunSnapshot` from `../../src/ui/storage`; add `createGame` from `../../src/engine/game`, `utcDateKey` from `../../src/ui/share`, and `GameEvent` to the types import. (`memStore()` and the `afterEach(vi.unstubAllGlobals)` already exist in this file — reuse them.)

```ts
const BOOT = new Date(Date.UTC(2026, 6, 29, 10, 0)).toISOString();
const TODAY = utcDateKey(BOOT); // "2026-07-29"

function liveSnapshot(overrides: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    version: 1,
    dateKey: TODAY,
    label: "The Daily",
    state: createGame(42, BOOT),
    pendingEvent: null,
    logMarkBeforeJump: 0,
    ...overrides,
  };
}

describe("parseSnapshot", () => {
  it("round-trips a live snapshot", () => {
    const snap = liveSnapshot();
    expect(parseSnapshot(JSON.stringify(snap), TODAY)).toEqual(snap);
  });

  it("round-trips a pending in-transit event (resume INTO the event screen)", () => {
    const evt: GameEvent = {
      kind: "pirates",
      title: "Pirate Ambush",
      description: "d",
      choices: [
        { id: "pay", label: "Pay" },
        { id: "flee", label: "Flee" },
      ],
    };
    const snap = liveSnapshot({ pendingEvent: evt, logMarkBeforeJump: 3 });
    expect(parseSnapshot(JSON.stringify(snap), TODAY)).toEqual(snap);
  });

  it("rejects a snapshot from another UTC day (stale — day rolled over)", () => {
    const snap = liveSnapshot({ dateKey: "2026-07-28" });
    expect(parseSnapshot(JSON.stringify(snap), TODAY)).toBeNull();
  });

  it("rejects an ended run — only live runs resume", () => {
    const snap = liveSnapshot();
    const ended = { ...snap, state: { ...snap.state, status: "audited" } };
    expect(parseSnapshot(JSON.stringify(ended), TODAY)).toBeNull();
  });

  it.each([
    ["a wrong version", { version: 2 }],
    ["a bad label", { label: "Casual" }],
    ["a non-numeric logMarkBeforeJump", { logMarkBeforeJump: "3" }],
    ["a null state", { state: null }],
    ["an unknown location", { state: { ...createGame(42, BOOT), location: "atlantis" } }],
    [
      "an event with no choices",
      { pendingEvent: { kind: "pirates", title: "", description: "", choices: [] } },
    ],
    [
      "an event with malformed choices",
      {
        pendingEvent: {
          kind: "pirates",
          title: "",
          description: "",
          choices: [{ label: "no id" }],
        },
      },
    ],
    ["a missing pendingEvent field", { pendingEvent: undefined }],
  ])("rejects %s", (_why, override) => {
    const snap = { ...liveSnapshot(), ...(override as object) };
    expect(parseSnapshot(JSON.stringify(snap), TODAY)).toBeNull();
  });

  it("rejects garbage and absence", () => {
    expect(parseSnapshot("{not json", TODAY)).toBeNull();
    expect(parseSnapshot(null, TODAY)).toBeNull();
  });
});

describe("loadSnapshot / persistSnapshot / clearSnapshot", () => {
  it("round-trips through storage", () => {
    vi.stubGlobal("localStorage", memStore());
    const snap = liveSnapshot();
    persistSnapshot(snap);
    expect(loadSnapshot(TODAY)).toEqual(snap);
  });

  it("clearSnapshot removes it", () => {
    vi.stubGlobal("localStorage", memStore());
    persistSnapshot(liveSnapshot());
    clearSnapshot();
    expect(loadSnapshot(TODAY)).toBeNull();
  });

  it("is stored under its own key, separate from the results ledger", () => {
    const store = memStore();
    vi.stubGlobal("localStorage", store);
    persistSnapshot(liveSnapshot());
    expect(store.getItem("starlight.run.v1")).not.toBeNull();
    expect(store.getItem("starlight.save.v1")).toBeNull();
  });

  it("degrades silently when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("private mode");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("private mode");
      },
    });
    expect(loadSnapshot(TODAY)).toBeNull();
    expect(() => persistSnapshot(liveSnapshot())).not.toThrow();
    expect(() => clearSnapshot()).not.toThrow();
  });
});
```

Note: `JSON.stringify` drops the `pendingEvent: undefined` key entirely — exactly the "missing field" case the validator must reject.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui/storage.test.ts`
Expected: existing tests PASS; every new test FAILS (`parseSnapshot is not a function`).

- [ ] **Step 3: Write the implementation**

In `src/ui/storage.ts`: extend the types import to `import { GameEvent, GameState, NodeId, RunEnd, RunEndStatus } from "../engine/types";` and add `import { NODE_IDS } from "../engine/world";`. Append at the end of the file:

```ts
// --- E0-5: live-run snapshot (same-day resume) -------------------------------------
//
// Its own document under its own key, fully separate from the results ledger above.
// The snapshot is written post-decision (after an action settles, in main.ts) and
// captures a pending in-transit event, so a refresh resumes — never re-rolls, never
// un-sees. Same pure-logic/thin-I/O split as the save: parseSnapshot is deterministic
// and unit-tested; the wrappers degrade silently.

export interface RunSnapshot {
  version: 1;
  dateKey: string; // UTC "YYYY-MM-DD" of the run (from state.bootDate)
  label: "The Daily" | "Practice";
  state: GameState;
  pendingEvent: GameEvent | null; // non-null ⇒ resume INTO the event screen
  logMarkBeforeJump: number; // so a post-resume resolve still yields a turn report
}

const SNAPSHOT_KEY = "starlight.run.v1";

function isValidEvent(e: unknown): e is GameEvent | null {
  if (e === null) return true;
  if (typeof e !== "object" || e === undefined) return false;
  const ev = e as Partial<GameEvent>;
  return (
    typeof ev.kind === "string" &&
    Array.isArray(ev.choices) &&
    ev.choices.length > 0 &&
    ev.choices.every((c) => typeof (c as { id?: unknown } | null)?.id === "string")
  );
}

/**
 * Validate a raw snapshot string against today's UTC key. Field-by-field on the
 * envelope plus the load-bearing state fields; deeper state corruption is caught by
 * the try/catch around the rehydrating first paint in main.ts.
 */
export function parseSnapshot(raw: string | null, todayKey: string): RunSnapshot | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<RunSnapshot> | null;
    if (
      !p ||
      p.version !== 1 ||
      p.dateKey !== todayKey ||
      (p.label !== "The Daily" && p.label !== "Practice") ||
      typeof p.logMarkBeforeJump !== "number" ||
      typeof p.state !== "object" ||
      p.state === null ||
      p.state.status !== "playing" ||
      typeof p.state.day !== "number" ||
      typeof p.state.seed !== "number" ||
      !NODE_IDS.includes(p.state.location as NodeId) ||
      !("pendingEvent" in p) ||
      !isValidEvent(p.pendingEvent)
    ) {
      return null;
    }
    return p as RunSnapshot;
  } catch {
    return null;
  }
}

/** Read today's live-run snapshot, or null on absence / staleness / corruption / throw. */
export function loadSnapshot(todayKey: string): RunSnapshot | null {
  try {
    return parseSnapshot(localStorage.getItem(SNAPSHOT_KEY), todayKey);
  } catch {
    return null;
  }
}

/** Write the live-run snapshot; a failure means a refresh simply won't resume. */
export function persistSnapshot(snap: RunSnapshot): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
  } catch {
    /* intentionally ignored — degrade to no-resume behaviour */
  }
}

/** Drop the live-run snapshot (run ended, or it failed validation at boot). */
export function clearSnapshot(): void {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    /* intentionally ignored */
  }
}
```

(The final types import line is exactly `import { GameEvent, GameState, NodeId, RunEnd, RunEndStatus } from "../engine/types";` — `RunEnd`/`RunEndStatus` were already there for the results ledger, `GameEvent`/`GameState`/`NodeId` are new.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ui/storage.test.ts`
Expected: PASS, including all `it.each` rejection cases.

- [ ] **Step 5: Commit**

```bash
git add src/ui/storage.ts tests/ui/storage.test.ts
git commit -m "feat(ui): versioned live-run snapshot with field-validated parse (E0-5)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Boot-time resume + per-action snapshot sync in main.ts

**Files:**

- Modify: `src/main.ts`

- [ ] **Step 1: Add resume + sync wiring**

In `src/main.ts`:

1. Extend the storage import:

```ts
import {
  loadSave,
  persist,
  recordRunEnd,
  labelForDay,
  emptySave,
  loadSnapshot,
  persistSnapshot,
  clearSnapshot,
} from "./ui/storage";
```

2. Add below `startNewRun` (which stays untouched — "New run" always starts fresh):

```ts
/**
 * E0-5: rehydrate a same-day live run from the snapshot. Boot-only — a hit restores
 * the exact post-decision state (including a pending in-transit event), a miss/stale/
 * corrupt snapshot falls through to a fresh daily. Never called on "New run".
 */
function tryResume(): boolean {
  const snap = loadSnapshot(utcDateKey(new Date().toISOString()));
  if (!snap) return false;
  state = snap.state;
  pendingEvent = snap.pendingEvent;
  logMarkBeforeJump = snap.logMarkBeforeJump;
  runLabel = snap.label;
  recorded = false;
  lastDebrief = undefined;
  return true;
}

/**
 * E0-5: mirror the live run to storage after every settled action — always
 * post-decision by construction. An ended run clears the snapshot in the same tick
 * recordIfEnded banks it, so no finished run can ever rehydrate.
 */
function syncSnapshot(): void {
  if (state.status === "playing") {
    persistSnapshot({
      version: 1,
      dateKey: utcDateKey(state.bootDate),
      label: runLabel,
      state,
      pendingEvent,
      logMarkBeforeJump,
    });
  } else {
    clearSnapshot();
  }
}
```

3. In the click handler, add `syncSnapshot();` immediately after `recordIfEnded();`:

```ts
  } else {
    applyAction(act, id, qty);
    recordIfEnded();
    syncSnapshot();
  }
```

4. Replace the module-level boot. Line 69's bare `startNewRun();` becomes:

```ts
if (!tryResume()) startNewRun();
```

And the trailing `paint();` at the bottom of the file becomes:

```ts
try {
  paint();
} catch {
  // A structurally-valid but internally-corrupt snapshot can only surface here —
  // discard it and reboot today's fresh daily instead of a blank screen.
  clearSnapshot();
  startNewRun();
  paint();
}
```

- [ ] **Step 2: Verify build + suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; full suite PASS.

- [ ] **Step 3: Manual browser verification**

Start the dev server (`npm run dev`, or via the Browser pane's launch config) and verify each flow; the checks marked (console) are run in devtools:

1. **Dock resume:** play 2–3 days (buy, jump, resolve, sell), note day/credits/cargo, reload → identical state resumes, header still shows "The Daily", log intact.
2. **Mid-event resume:** jump, land on an event choice screen, reload → the _same_ event screen returns; resolving it produces a normal turn report.
3. **Run end clears:** retire → debrief shows; (console) `localStorage.getItem("starlight.run.v1")` → `null`; reload → fresh run labelled Practice.
4. **Practice resumes:** start the Practice run, play a day, reload → Practice run resumes with its label.
5. **Stale day discards:** (console) overwrite the stored `dateKey` with yesterday's date, reload → fresh daily run, snapshot replaced.
6. **No double-record:** finish a run, reload twice → boot stats show the same attempt count (no extra attempts).

Expected: all six behave as described. Fix and re-verify anything that doesn't before committing.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat(ui): same-day resume of the live run, snapshot synced per action (E0-5)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Docs housekeeping + final verification

**Files:**

- Modify: `docs/ROADMAP.md`
- Modify: `docs/BACKLOG.md`
- Modify: `docs/ENGAGEMENT_BACKLOG.md`

- [ ] **Step 1: Mark the four already-shipped items + this round in ROADMAP.md**

In the **Milestone 1 table**:

- E0-3 Notes → `✅ **Shipped 2026-07-29.** After E0-1's end states exist. Spec in ENGAGEMENT §4.2.`
- P3-3 Notes → `✅ **Shipped.** Focus restore, document.title, one-\`<h1>\`-per-screen, and restart confirm all verified in code (main.ts/screens.ts).`

In the **Milestone 2 table**:

- E1-3 Notes → prepend `✅ **Shipped 2026-07-29.** `
- B-5 Notes → prepend `✅ **Shipped 2026-07-29** (README claim rewritten). `
- E0-5 Notes → prepend `✅ **Shipped 2026-07-29.** ` (use the actual land date if this task runs on a later day — `date -u +%F` gives it)
- E1-2 Notes → prepend `✅ **Shipped 2026-07-29.** ` (same date rule)

Rewrite the **"Already shipped (context)"** closing lines: Milestone 1 is fully shipped (E0-1, E0-2, E0-3, E0-4, B-6, P3-3); Milestone 2 has shipped E1-3, E0-5, E1-2, B-5, with E1-1 + P1-2, E1-4 + B-2, and P2-1 remaining.

- [ ] **Step 2: Tick the matching backlog rows**

- `docs/BACKLOG.md` P3-3 row: prefix the issue cell with `**Shipped —** ` (mirroring the `**Fixed —**` convention used by B-1/B-3).
- `docs/ENGAGEMENT_BACKLOG.md`: add shipped blockquotes in the style of the existing `> **Shipped 2026-07-21 — E0-1, E0-2, E0-4.**` note: one under §4.2 for E0-3 + E1-3 (shipped 2026-07-29), one under §4.4 for E0-5 + E1-2 (shipped today).

- [ ] **Step 3: Full verification**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run format:check`
Expected: all green. (If `format:check` flags the edited markdown, run `npm run format` and re-check.)

- [ ] **Step 4: Commit**

```bash
git add docs/ROADMAP.md docs/BACKLOG.md docs/ENGAGEMENT_BACKLOG.md
git commit -m "docs(roadmap): mark E0-3/E1-3/P3-3/B-5 shipped; land E0-5 + E1-2

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Spec acceptance-criteria map

| Spec AC                                         | Covered by                                 |
| :---------------------------------------------- | :----------------------------------------- |
| Same-day refresh resumes (incl. pending event)  | Task 7 (parse), Task 8 (wiring + QA 1–2)   |
| Day rollover starts fresh, discards stale       | Task 7 (stale test), Task 8 (QA 5)         |
| No re-roll / no dodge of a revealed event       | Task 7 (event round-trip), Task 8 (QA 2)   |
| Clear on end; "New run" overwrites; record-once | Task 8 (`syncSnapshot`, QA 3, 6)           |
| Practice resumes with label                     | Task 7 (label validation), Task 8 (QA 4)   |
| Storage failures degrade silently               | Task 7 (throwing-store tests)              |
| Four-line card, strip length = daysSurvived     | Task 4 (length test), Task 5 (format test) |
| Glyph priority incl. 💀-final-day, whale 💰     | Task 2 (recording), Task 4 (rendering)     |
| No downgrade; empty at createGame               | Tasks 1–2                                  |
| 💰 band median ~1–3 (sim)                       | Task 3                                     |
| Roadmap/backlog housekeeping                    | Task 9                                     |
| New tests green, suite stays green              | every task's run steps                     |
