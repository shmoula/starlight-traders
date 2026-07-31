# M2 Close-out — "Priceable Decisions" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Milestone 2: structured log entries (P2-1), honest events + hash fix (E1-4 + B-2), the trade bulletin as a split-lane exchange ticker (E1-1 + P2-2a), forecast sinks (P1-2), and README/docs corrections.

**Architecture:** Pure engine additions first (`LogEntry`, `pirateChance`, `choiceOdds`, `bulletin`), then UI surfaces consume them. Persistence stays at the UI boundary; the run snapshot bumps to v2 with a v1 log-migration. Display values always derive from the same engine functions the rules use (B-1 precedent), so labels can't drift.

**Tech Stack:** TypeScript 5, Vite 5, Vitest 1, vanilla DOM string rendering. Tests run with `npm test` (or `npx vitest run <file>` for one file). Prettier auto-formats on write via hook — don't fight it.

**Spec:** `docs/superpowers/specs/2026-07-31-m2-closeout-priceable-decisions-design.md`

---

## File map

| File                                                               | Role in this plan                                                                          |
| :----------------------------------------------------------------- | :----------------------------------------------------------------------------------------- |
| `src/engine/types.ts`                                              | Add `LogTone`/`LogEntry`; `GameState.log` becomes `LogEntry[]`                             |
| `src/engine/game.ts`                                               | `withLog` gains tone/delta; all call sites typed; new `interestForecast`                   |
| `src/engine/run-end.ts`                                            | `endRun` appends a `LogEntry`                                                              |
| `src/engine/events.ts`                                             | B-2 hash fix; new `pirateChance`                                                           |
| `src/engine/preview.ts`                                            | New `choiceOdds`                                                                           |
| `src/engine/bulletin.ts`                                           | **New** — E1-1 rumor lines (pure)                                                          |
| `src/ui/screens.ts`                                                | Delete `toneOf`; ticker lanes; intel line; orb costs; interest chip; sell nets; event odds |
| `src/ui/render.ts`                                                 | `ViewModel` gains `tickerPaused`; `turnReport` type                                        |
| `src/ui/main.ts` → `src/main.ts`                                   | `turnReport: LogEntry[]`; snapshot `version: 2`; `tickerPause` action                      |
| `src/ui/storage.ts`                                                | Snapshot v2 + v1 log migration                                                             |
| `src/ui/styles.css`                                                | Ticker + log-delta CSS                                                                     |
| `README.md`                                                        | Fix stale score + persistence claims                                                       |
| `docs/ROADMAP.md`, `docs/BACKLOG.md`, `docs/ENGAGEMENT_BACKLOG.md` | Mark rows shipped                                                                          |

Tests touched: `tests/engine/game.test.ts`, `run-end.test.ts`, `preview.test.ts`, `events.test.ts`, **new** `tests/engine/bulletin.test.ts`, `tests/ui/screens.test.ts`, `tests/ui/storage.test.ts`. The sim suite (`tests/sim/simulate.test.ts`) re-runs unmodified as the balance gate.

---

### Task 1: P2-1 engine — `LogEntry` + tones/deltas at every log site

**Files:**

- Modify: `src/engine/types.ts:87`
- Modify: `src/engine/game.ts` (withLog + ~20 call sites)
- Modify: `src/engine/run-end.ts:48`
- Test: `tests/engine/game.test.ts`, `tests/engine/run-end.test.ts`, `tests/engine/preview.test.ts`

- [ ] **Step 1: Write failing tests for tone/delta**

Append to `tests/engine/game.test.ts` (top-level; it already imports `createGame`, `buy`, `sell` etc. — add `payDebt` and `jump` to the import if missing):

```ts
describe("structured log entries (P2-1)", () => {
  const last = (s: ReturnType<typeof createGame>) => s.log[s.log.length - 1];

  it("buy logs a neutral entry with a negative credit delta", () => {
    const s = createGame(42);
    const price = getPrice(s.seed, s.day, s.location, "water");
    const after = buy(s, "water", 2);
    expect(last(after)).toEqual({
      msg: `Bought 2 ${commodityName("water")} for ${price * 2}cr.`,
      tone: "neutral",
      delta: -(price * 2),
    });
  });

  it("sell logs a good entry whose delta is the net (post-tax) proceeds", () => {
    let s = createGame(42);
    s = { ...s, cargo: { ...s.cargo, water: 3 } };
    const after = sell(s, "water", 3);
    const entry = last(after);
    expect(entry.tone).toBe("good");
    expect(entry.delta).toBe(after.credits - s.credits);
  });

  it("interest is a bad entry with no credit delta (it moves debt, not credits)", () => {
    // Day 2 -> jump lands on day 3, an interest tick.
    const s = { ...createGame(42), day: 2, fuel: 20 };
    const r = jump(s, "vulcan");
    const entry = r.state.log.find((l) => l.msg.includes("Syndicate compounds"))!;
    expect(entry.tone).toBe("bad");
    expect(entry.delta).toBeUndefined();
  });

  it("the docking fee entry carries a negative delta", () => {
    const s = { ...createGame(42), fuel: 20 };
    const r = jump(s, "vulcan");
    const entry = r.state.log.find((l) => l.msg.startsWith("Docked at"))!;
    expect(entry).toMatchObject({ tone: "neutral", delta: -dockingFee("vulcan") });
  });

  it("paying debt logs a good entry with the negative credit delta", () => {
    const after = payDebt(createGame(42), 200);
    expect(last(after)).toEqual({ msg: "Paid down 200cr of debt.", tone: "good", delta: -200 });
  });
});
```

Add to the imports of `tests/engine/game.test.ts`: `getPrice`, `commodityName` from `../../src/engine/world` and `dockingFee` from `../../src/engine/economy` (check what's already imported first).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/engine/game.test.ts`
Expected: FAIL — TypeScript/assert errors (`log` entries are strings, `.msg` undefined).

- [ ] **Step 3: Change the type**

In `src/engine/types.ts`, above `GameState`:

```ts
/** Outcome coloring for a log line — replaces the UI's regex tone-guessing (P2-1). */
export type LogTone = "good" | "bad" | "neutral";

/** A structured log line: the engine declares tone and (for money lines) the credit delta. */
export interface LogEntry {
  msg: string;
  tone: LogTone;
  /** Signed credit movement, present only when the line is about credits. */
  delta?: number;
}
```

Change `GameState.log`:

```ts
  log: LogEntry[]; // recent player-facing messages, newest last
```

- [ ] **Step 4: Convert `withLog` and every call site in `game.ts`**

Replace `withLog`:

```ts
function withLog(
  state: GameState,
  msg: string,
  tone: LogTone = "neutral",
  delta?: number
): GameState {
  return {
    ...state,
    log: [...state.log, { msg, tone, ...(delta === undefined ? {} : { delta }) }],
  };
}
```

Add `LogTone` to the `./types` import. Update `createGame`'s intro line to an entry object:

```ts
    log: [
      {
        msg: `The Syndicate staked your ship — ${STARTING.debt.toLocaleString()}cr, compounding. Bank your fortune before the Day ${RUN_LENGTH} audit. Everyone flies today's sky.`,
        tone: "neutral" as const,
      },
    ],
```

Then apply this exact tone/delta table (tones preserve today's rendered colors except where the old regex missed money lines — that miss is the bug being fixed):

| Call site (game.ts)                         | tone        | delta                  |
| :------------------------------------------ | :---------- | :--------------------- |
| `buy` — "Bought…"                           | `"neutral"` | `-cost`                |
| `sell` — "Sold…"                            | `"good"`    | `proceeds - tax`       |
| `refuel` — "Refueled…"                      | `"neutral"` | `-cost`                |
| `repair` — "Repaired…"                      | `"neutral"` | `-cost`                |
| `payDebt` — "Paid down…"                    | `"good"`    | `-pay`                 |
| `acceptMission` — "Accepted delivery…"      | `"neutral"` | —                      |
| `settleMissions` — "Delivery complete…"     | `"good"`    | `+m.reward`            |
| `settleMissions` — "…expired."              | `"bad"`     | —                      |
| `jump` — interest line                      | `"bad"`     | — (debt, not credits)  |
| `jump` — "Docked at…, fee…"                 | `"neutral"` | `-fee`                 |
| `resolvePirates` pay — "Paid pirates…"      | `"bad"`     | `-toll`                |
| `resolvePirates` flee — "Fled…"             | `"bad"`     | —                      |
| `resolveSalvage` trap — "…warhead…"         | `"bad"`     | —                      |
| `resolveSalvage` haul — "Salvaged…"         | `"good"`    | — (cargo, not credits) |
| `resolveSalvage` full — "Hold full…"        | `"neutral"` | —                      |
| `resolveEngine` — "Engine trouble…"         | `"bad"`     | —                      |
| `resolveDerelict` loot — "Derelict held…"   | `"good"`    | `+reward`              |
| `resolveDerelict` trap — "…was a trap…"     | `"bad"`     | —                      |
| `resolveCustoms` seized — "Customs seized…" | `"bad"`     | — (cargo)              |
| `resolveCustoms` bribe — "Bribed customs…"  | `"bad"`     | `-bribe`               |

Example conversion (sell):

```ts
return trackPeak(
  withLog(
    next,
    `Sold ${qty} ${commodityName(id)} for ${proceeds}cr (tax ${tax}).`,
    "good",
    proceeds - tax
  )
);
```

In `src/engine/run-end.ts`, `endRun`'s final return:

```ts
return {
  ...state,
  status,
  runEnd,
  log: [...state.log, { msg: cause, tone: status === "lost" ? "bad" : "neutral" }],
};
```

(Import `LogEntry` is not needed — the literal satisfies the type; add `LogTone` import only if TS asks.)

- [ ] **Step 5: Fix existing string assertions**

Run `grep -n "\.log\[" tests/ -r` and update each to read `.msg`. The known sites:

- `tests/engine/game.test.ts:24` → `expect(createGame(42).log[0].msg).toBe(…)`
- `tests/engine/game.test.ts:204`, `:263`, `:279` → append `.msg` to the `log[log.length - 1]` reads
- `tests/engine/game.test.ts:446` → `return j.state.log.find((l) => l.msg.includes("Syndicate compounds"))?.msg ?? "";`
- `tests/engine/preview.test.ts:67` → `expect(after.log[after.log.length - 1].msg).toBe("Hold full — left the salvage drifting.");`
- `tests/engine/run-end.test.ts:68` → `expect(ended.log[ended.log.length - 1].msg).toBe("Retired at Terra Hub.");`
- `tests/engine/economy.test.ts:22` — the `log: []` fixture needs no change (`[]` is a valid `LogEntry[]`).

Do NOT touch `tests/ui/*` yet — screens/main still fail to compile until Task 2; that is expected mid-task. Run only the engine suites here.

- [ ] **Step 6: Run engine tests**

Run: `npx vitest run tests/engine`
Expected: PASS (all engine files). `tests/ui` and the app build are still broken — Task 2 fixes them before any full-suite run.

- [ ] **Step 7: Commit**

```bash
git add src/engine tests/engine
git commit -m "feat(engine): structured log entries with tone and credit delta (P2-1)"
```

---

### Task 2: P2-1 UI — render entries, delete `toneOf`

**Files:**

- Modify: `src/ui/screens.ts` (`toneOf`, `TONE_ICON`, `logPanel`, turn report in `stationScreen`)
- Modify: `src/ui/render.ts:9` (`turnReport` type)
- Modify: `src/main.ts:62` (`turnReport` type)
- Modify: `src/ui/styles.css`
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/ui/screens.test.ts`:

```ts
describe("structured log rendering (P2-1)", () => {
  it("renders the entry's declared tone and a signed delta", () => {
    const s = {
      ...createGame(42),
      log: [
        { msg: "Sold 5 Water / Ice for 100cr (tax 5).", tone: "good" as const, delta: 95 },
        { msg: "Docked at Meridian, fee 45cr.", tone: "neutral" as const, delta: -45 },
        { msg: "Fled — took 16 hull damage.", tone: "bad" as const },
      ],
    };
    const html = stationScreen(s);
    expect(html).toContain(`class="log-line tr-good"`);
    expect(html).toContain(`class="log-line tr-bad"`);
    expect(html).toContain(">+95cr<");
    expect(html).toContain(">−45cr<");
  });

  it("renders no delta span for entries without a delta", () => {
    const s = {
      ...createGame(42),
      log: [{ msg: "Fled — took 16 hull damage.", tone: "bad" as const }],
    };
    const html = stationScreen(s);
    expect(html).not.toContain("log-delta");
  });

  it("the turn report colors lines by entry tone", () => {
    const s = createGame(42);
    const report = [{ msg: "Delivery complete: +500cr.", tone: "good" as const, delta: 500 }];
    const html = stationScreen(s, report);
    expect(html).toContain("tr-good");
    expect(html).toContain(">+500cr<");
  });
});
```

Add `LogEntry` import if needed (type-only usage may not require it since literals are used).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/ui/screens.test.ts`
Expected: FAIL (compile errors — `stationScreen` still expects `string[]` turn report; `toneOf` typed for strings).

- [ ] **Step 3: Implement**

In `src/ui/screens.ts`:

1. Add `LogEntry` to the `../engine/types` import.
2. **Delete** the `toneOf` function and the `Tone` type alias (screens.ts:36-55). Keep `TONE_ICON` but retype it: `const TONE_ICON: Record<LogEntry["tone"], string> = { good: "✓", bad: "✗", neutral: "›" };`
3. Add a delta renderer near `cr`:

```ts
/** Right-aligned signed credit delta for a money log line; nothing when absent. */
const deltaHtml = (l: LogEntry): string =>
  l.delta === undefined
    ? ""
    : `<span class="log-delta st-num ${l.delta >= 0 ? "tr-good" : "tr-bad"}">${
        l.delta >= 0 ? "+" : "−"
      }${Math.abs(l.delta).toLocaleString()}cr</span>`;
```

4. `logPanel` body becomes:

```ts
const logEntries = s.log
  .slice(-8)
  .map((l) => `<div class="log-line tr-${l.tone}"><span>${l.msg}</span>${deltaHtml(l)}</div>`)
  .join("");
```

5. `stationScreen` signature: `turnReport: LogEntry[] = []`; the report block becomes:

```ts
      ${turnReport
        .map(
          (l) =>
            `<div class="tr-line tr-${l.tone}"><span class="tr-icon" aria-hidden="true">${TONE_ICON[l.tone]}</span><span>${l.msg}</span>${deltaHtml(l)}</div>`
        )
        .join("")}
```

In `src/ui/render.ts`: import `LogEntry` and change `turnReport: string[]` → `turnReport: LogEntry[]`.

In `src/main.ts`: import `LogEntry` from `./engine/types` and change `let turnReport: string[] = []` → `let turnReport: LogEntry[] = []` (the `state.log.slice(logMarkBeforeJump)` assignment needs no change).

In `src/ui/styles.css`, next to the existing `.log-line`/`.tr-*` rules:

```css
.log-line,
.tr-line {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}
.log-delta {
  margin-left: auto;
  white-space: nowrap;
}
```

(If `.log-line`/`.tr-line` already declare `display`, merge rather than duplicate.)

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — this is the first moment the whole tree compiles again. If `tests/ui/storage.test.ts` fails on snapshot fixtures (they embed `createGame` state, which now has entry logs), that's Task 3's territory only if the failure is about the _snapshot envelope_; state-shape fixtures should pass as-is because they use real `createGame` output.

- [ ] **Step 5: Commit**

```bash
git add src/ui src/main.ts tests/ui/screens.test.ts
git commit -m "feat(ui): render structured log entries; delete regex tone-guessing (P2-1)"
```

---

### Task 3: P2-1 storage — snapshot v2 with v1 log migration

**Files:**

- Modify: `src/ui/storage.ts` (RunSnapshot, parseSnapshot, isValidSnapshotState)
- Modify: `src/main.ts:111` (`version: 2`)
- Test: `tests/ui/storage.test.ts`

- [ ] **Step 1: Write failing tests**

In `tests/ui/storage.test.ts`, find the snapshot fixture helper (`liveSnapshot`, near line 165) and add alongside the existing parseSnapshot cases:

```ts
describe("snapshot v1 → v2 log migration (P2-1)", () => {
  it("accepts a v1 snapshot, wrapping string log lines as neutral entries", () => {
    const base = liveSnapshot({});
    const v1 = {
      ...base,
      version: 1,
      state: {
        ...base.state,
        log: ["Docked at Terra Hub, fee 40cr.", "Bought 2 Water / Ice for 30cr."],
      },
    };
    const parsed = parseSnapshot(JSON.stringify(v1), v1.dateKey);
    expect(parsed).not.toBeNull();
    expect(parsed!.version).toBe(2);
    expect(parsed!.state.log).toEqual([
      { msg: "Docked at Terra Hub, fee 40cr.", tone: "neutral" },
      { msg: "Bought 2 Water / Ice for 30cr.", tone: "neutral" },
    ]);
  });

  it("accepts a well-formed v2 snapshot", () => {
    const snap = liveSnapshot({});
    expect(parseSnapshot(JSON.stringify(snap), snap.dateKey)).not.toBeNull();
  });

  it("rejects a snapshot whose log is not an array of entries", () => {
    const base = liveSnapshot({});
    const bad = { ...base, state: { ...base.state, log: [42, { tone: "good" }] } };
    expect(parseSnapshot(JSON.stringify(bad), base.dateKey)).toBeNull();
  });
});
```

Also update the `liveSnapshot` helper's `version: 1` to `version: 2` (its `state` comes from `createGame`, so its log is already entries).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/ui/storage.test.ts`
Expected: FAIL — `version: 2` rejected (`p.version !== 1` guard), migration missing.

- [ ] **Step 3: Implement**

In `src/ui/storage.ts`:

1. `RunSnapshot.version: 1` → `version: 2`.
2. Add above `parseSnapshot`:

```ts
/** A v1 log line is a bare string; wrap it as a neutral entry so an in-progress run survives the upgrade. */
function migrateV1Log(state: unknown): void {
  const st = state as { log?: unknown[] };
  if (Array.isArray(st?.log)) {
    st.log = st.log.map((m) => (typeof m === "string" ? { msg: m, tone: "neutral" } : m));
  }
}

function isValidLog(log: unknown): boolean {
  return (
    Array.isArray(log) &&
    log.every(
      (l) => typeof l === "object" && l !== null && typeof (l as { msg?: unknown }).msg === "string"
    )
  );
}
```

3. In `parseSnapshot`, after `JSON.parse` and the null check, before the big guard:

```ts
if (p && p.version === 1 && typeof p.state === "object" && p.state !== null) {
  migrateV1Log(p.state);
  p.version = 2;
}
```

and change the version guard to `p.version !== 2`.

4. In `isValidSnapshotState`, add a log check before the final return:

```ts
if (!isValidLog(st.log)) return false;
```

In `src/main.ts` `syncSnapshot`, change `version: 1` → `version: 2`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/ui/storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/storage.ts src/main.ts tests/ui/storage.test.ts
git commit -m "feat(persistence): run snapshot v2 migrates v1 string logs to entries (P2-1)"
```

---

### Task 4: E1-4 + B-2 engine — `pirateChance`, hash fix, `choiceOdds`, event-screen odds

**Files:**

- Modify: `src/engine/events.ts`
- Modify: `src/engine/preview.ts`
- Modify: `src/ui/screens.ts` (`eventScreen`)
- Test: `tests/engine/events.test.ts`, `tests/engine/preview.test.ts`, `tests/ui/screens.test.ts`

- [ ] **Step 1: Write failing engine tests**

Append to `tests/engine/events.test.ts` (add `pirateChance` to the import):

```ts
describe("pirateChance (E1-4 honest danger)", () => {
  it("is the exact probability band rollEvent uses: 0.1 + 0.45 × danger", () => {
    expect(pirateChance("terra")).toBeCloseTo(0.1);
    expect(pirateChance("kiruna")).toBeCloseTo(0.1);
    expect(pirateChance("vulcan")).toBeCloseTo(0.1675);
    expect(pirateChance("meridian")).toBeCloseTo(0.19);
    expect(pirateChance("verge")).toBeCloseTo(0.325);
  });
});

describe("event hash aliasing (B-2)", () => {
  it("vulcan and verge no longer share event rolls (same destination, same days)", () => {
    // Pre-fix, from.charCodeAt(0) made these two origins identical: same rng, same
    // destination bands -> byte-identical event sequences. Post-fix they must diverge.
    const seq = (from: "vulcan" | "verge") =>
      Array.from({ length: 60 }, (_, i) => rollEvent(7, i + 1, from, "terra").kind).join(",");
    expect(seq("vulcan")).not.toEqual(seq("verge"));
  });
});
```

Append to `tests/engine/preview.test.ts` (import `choiceOdds`; build events via `rollEvent` or inline literals — the file already constructs `GameEvent`s, follow its pattern):

```ts
describe("choiceOdds (E1-4)", () => {
  it("prices the salvage gamble as 1-in-3", () => {
    const e = { kind: "salvage", title: "", description: "", choices: [] } as GameEvent;
    expect(choiceOdds(e)).toEqual({ collect: "1-in-3 hides a hazard" });
  });
  it("prices the derelict gamble as 50/50", () => {
    const e = { kind: "derelict", title: "", description: "", choices: [] } as GameEvent;
    expect(choiceOdds(e)).toEqual({ board: "50/50" });
  });
  it("offers no odds for deterministic events", () => {
    const e = { kind: "pirates", title: "", description: "", choices: [] } as GameEvent;
    expect(choiceOdds(e)).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/engine/events.test.ts tests/engine/preview.test.ts`
Expected: FAIL — `pirateChance`/`choiceOdds` don't exist; the aliasing test fails on identical sequences.

- [ ] **Step 3: Implement engine changes**

`src/engine/events.ts` — add `NODE_IDS` to the world import, then:

```ts
/**
 * True chance of a pirate ambush on arrival at `to` — the exact band rollEvent uses.
 * Exported so the UI shows the number the engine rolls with (E1-4): the flat 10%
 * floor means no route is ever "0%".
 */
export function pirateChance(to: NodeId): number {
  return 0.1 + NODES[to].danger * 0.45;
}
```

In `rollEvent`, replace the rng seed line and the pirate band:

```ts
// Hash full station identity (their NODE_IDS indices), not first characters —
// "vulcan"/"verge" both start with 'v' and used to share every event roll (B-2).
const rng = mulberry32(hashSeed(seed, day, NODE_IDS.indexOf(from), NODE_IDS.indexOf(to), 31));
const danger = NODES[to].danger;
const r = rng();

// Probability bands grow the hostile slice with danger.
const pPirates = pirateChance(to);
```

(The remaining bands stay exactly as they are — they build on `pPirates`.)

`src/engine/preview.ts` — append:

```ts
/**
 * Odds label per choice id, for gambles whose outcome is a seeded roll (E1-4).
 * Deterministic choices get no entry — a stake without odds is a price, not a bet.
 * The fractions mirror resolveSalvage's `% 3` and resolveDerelict's `% 2` (game.ts).
 */
export function choiceOdds(e: GameEvent): Record<string, string> {
  switch (e.kind) {
    case "salvage":
      return { collect: "1-in-3 hides a hazard" };
    case "derelict":
      return { board: "50/50" };
    default:
      return {};
  }
}
```

- [ ] **Step 4: Render odds on the event screen**

In `src/ui/screens.ts`, add `choiceOdds` to the `../engine/preview` import. In `eventScreen`:

```ts
export function eventScreen(s: GameState, e: GameEvent): string {
  const stakes = choiceStakes(s, e);
  const odds = choiceOdds(e);
  const choices = e.choices
    .map((c) => {
      const parts = [stakes[c.id], odds[c.id]].filter(Boolean);
      return `<button class="st-btn" data-act="resolve" data-id="${c.id}">${c.label}${
        parts.length ? `<span class="choice-stake st-num">${parts.join(" · ")}</span>` : ""
      }</button>`;
    })
    .join("");
```

Add to `tests/ui/screens.test.ts` (there is an existing `eventScreen` describe — extend it):

```ts
it("shows odds beside stakes on seeded gambles (E1-4)", () => {
  const s = createGame(42);
  const derelict: GameEvent = {
    kind: "derelict",
    title: "Derelict Hulk",
    description: "d",
    choices: [
      { id: "board", label: "Board it (gamble)" },
      { id: "leave", label: "Leave it be" },
    ],
  };
  expect(eventScreen(s, derelict)).toContain("50/50");
  const salvage: GameEvent = {
    kind: "salvage",
    title: "Salvage Field",
    description: "d",
    choices: [
      { id: "collect", label: "Scoop the debris (gamble)" },
      { id: "ignore", label: "Stay on course" },
    ],
  };
  expect(eventScreen(s, salvage)).toContain("1-in-3 hides a hazard");
});
```

- [ ] **Step 5: Run the full suite and re-pin shifted fixtures**

Run: `npm test`
Expected: the new tests PASS; **some existing engine/sim fixtures may fail** because B-2 reshuffles which event fires per (seed, day, route).

For each failure: the assertion's _intent_ stays, its fixture moves. If a test expected e.g. `rollEvent(3, 5, "terra", "verge").kind === "pirates"` and the kind changed, probe nearby seeds/days for one that produces the intended kind (`npx vitest run` a scratch loop, or evaluate quickly with `node --experimental-strip-types` is NOT set up — just adjust within the test file and re-run). Never weaken an assertion to `toBeTruthy()` — re-pin it.

Then the balance gate: `npx vitest run tests/sim/simulate.test.ts`
Expected: PASS — bands are ≥95 audited (cautious/balanced), greedy deaths 10–40, spread not inverted. **If a band fails, stop and report the numbers — do not retune constants inside this task.**

- [ ] **Step 6: Commit**

```bash
git add src/engine tests/engine src/ui/screens.ts tests/ui/screens.test.ts
git commit -m "feat(engine): honest event odds and true raid chance; fix vulcan/verge hash aliasing (E1-4, B-2)"
```

---

### Task 5: E1-1 — `bulletin` engine module

**Files:**

- Create: `src/engine/bulletin.ts`
- Test: create `tests/engine/bulletin.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/engine/bulletin.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { bulletin } from "../../src/engine/bulletin";
import { COMMODITIES, NODES, NODE_IDS, getPrice } from "../../src/engine/world";
import { CommodityId, NodeId } from "../../src/engine/types";

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

/** All (node, commodity) pairs the station produces, with day-1 price and ratio vs base. */
function producePairs(seed: number) {
  const out: { node: NodeId; commodity: CommodityId; price: number; ratio: number }[] = [];
  for (const n of NODE_IDS) {
    for (const c of NODES[n].produces) {
      const price = getPrice(seed, 1, n, c);
      const base = COMMODITIES.find((x) => x.id === c)!.basePrice;
      out.push({ node: n, commodity: c, price, ratio: price / base });
    }
  }
  return out;
}

describe("bulletin (E1-1)", () => {
  it("is deterministic: same seed, same three lines", () => {
    expect(bulletin(1482862887)).toEqual(bulletin(1482862887));
    expect(bulletin(1482862887)).toHaveLength(3);
  });

  it("every line stays within 70 characters across 50 seeds", () => {
    for (const seed of SEEDS) {
      for (const line of bulletin(seed)) {
        expect(line.length, `seed ${seed}: "${line}"`).toBeLessThanOrEqual(70);
      }
    }
  });

  it("the glut line names the deepest-discount day-1 produce price, verbatim", () => {
    for (const seed of SEEDS) {
      const glut = producePairs(seed).reduce((a, b) => (b.ratio < a.ratio ? b : a));
      expect(bulletin(seed)[0]).toContain(`${glut.price}cr`);
      expect(bulletin(seed)[0]).toContain(NODES[glut.node].name);
    }
  });

  it("the glut lead is actually profitable on day 1 (some station nets more after tax)", () => {
    for (const seed of SEEDS) {
      const glut = producePairs(seed).reduce((a, b) => (b.ratio < a.ratio ? b : a));
      const bestNet = Math.max(
        ...NODE_IDS.filter((n) => n !== glut.node).map((n) => {
          const gross = getPrice(seed, 1, n, glut.commodity);
          return gross - Math.round(gross * NODES[n].taxRate);
        })
      );
      expect(bestNet, `seed ${seed}`).toBeGreaterThan(glut.price);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/engine/bulletin.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `src/engine/bulletin.ts`:

```ts
// src/engine/bulletin.ts
//
// Today's Trade Bulletin (E1-1): three rumor lines derived deterministically from the
// day-1 price grid via the existing getPrice — no new RNG streams, so every player
// sees the same lines on a date. Prices drift after day 1: these are leads, not oracles.
import { CommodityId, NodeId } from "./types";
import { COMMODITIES, NODES, NODE_IDS, commodityName, getPrice } from "./world";
import { pirateChance } from "./events";

interface PricePoint {
  node: NodeId;
  commodity: CommodityId;
  price: number;
  /** Price vs base — the "how unusual is this" measure the lines rank by. */
  ratio: number;
}

function pricePoints(seed: number, kind: "produces" | "demands"): PricePoint[] {
  const out: PricePoint[] = [];
  for (const node of NODE_IDS) {
    for (const commodity of NODES[node][kind]) {
      const price = getPrice(seed, 1, node, commodity);
      const base = COMMODITIES.find((c) => c.id === commodity)!.basePrice;
      out.push({ node, commodity, price, ratio: price / base });
    }
  }
  return out;
}

/** The three "word on the docks" lines for a daily seed. Each ≤70 chars. */
export function bulletin(seed: number): string[] {
  const glut = pricePoints(seed, "produces").reduce((a, b) => (b.ratio < a.ratio ? b : a));
  const premium = pricePoints(seed, "demands").reduce((a, b) => (b.ratio > a.ratio ? b : a));
  const riskiest = NODE_IDS.reduce((a, b) => (pirateChance(b) > pirateChance(a) ? b : a));
  const taxPct = Math.round(NODES[premium.node].taxRate * 100);
  const taxNote = taxPct > 0 ? `taxed ${taxPct}%` : "tax-free";
  return [
    `${commodityName(glut.commodity)} glut at ${NODES[glut.node].name} — buying at ${glut.price}cr`,
    `${NODES[premium.node].name} pays ${premium.price}cr for ${commodityName(premium.commodity)} — ${taxNote}`,
    `Raider chatter thick on the ${NODES[riskiest].name} approach`,
  ];
}
```

Note: line 3 is constant until daily modifiers exist (E3-1) — the highest-raid-chance route doesn't vary by seed. That is accepted in the spec.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/engine/bulletin.test.ts`
Expected: PASS. (The profitability test passes by construction: produce ×0.7 vs demand ×1.4 swamps ±volatility noise for water and parts, and every produced commodity has a demanding station.)

- [ ] **Step 5: Commit**

```bash
git add src/engine/bulletin.ts tests/engine/bulletin.test.ts
git commit -m "feat(engine): deterministic Trade Bulletin lines from the day-1 price grid (E1-1)"
```

---

### Task 6: Ticker UI — EXCH + DOCK TALK lanes, station intel line

**Files:**

- Modify: `src/ui/screens.ts` (new `tickerLanes`, `stationScreen`, `tradeHubPanel`)
- Modify: `src/ui/render.ts` (`ViewModel.tickerPaused`)
- Modify: `src/main.ts` (`tickerPaused` state + action)
- Modify: `src/ui/styles.css`
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/ui/screens.test.ts`:

```ts
describe("exchange ticker (E1-1 + P2-2a)", () => {
  it("EXCH lane quotes every commodity at the docked station's live price", () => {
    const s = createGame(42);
    const html = stationScreen(s);
    for (const c of COMMODITIES) {
      const price = getPrice(s.seed, s.day, s.location, c.id);
      expect(html).toContain(`${price}`);
    }
    expect(html).toContain("ticker__lane--exch");
  });

  it("day 1 renders the full bulletin statically (the launch surface)", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain("ticker__lane--static");
    expect(html).not.toContain("ticker__marquee");
  });

  it("day 2+ renders the scrolling lane with an accessible pause toggle", () => {
    const s = { ...createGame(42), day: 3 };
    const html = stationScreen(s);
    expect(html).toContain("ticker__marquee");
    expect(html).toContain(`data-act="tickerPause"`);
    expect(html).toContain(`aria-pressed="false"`);
    const paused = stationScreen(s, [], "", false, undefined, true);
    expect(paused).toContain(`aria-pressed="true"`);
    expect(paused).toContain("ticker--paused");
  });

  it("the Trade Hub names the station's produce/demand modifiers and tax (P2-2a)", () => {
    const s = { ...createGame(42), location: "vulcan" as const };
    const html = stationScreen(s);
    expect(html).toContain("Produces Machine Parts (−30%)");
    expect(html).toContain("Buys Water / Ice (+40%)");
    expect(html).toContain("Sales taxed 4%");
  });
});
```

Note `getPrice` and `COMMODITIES` are already imported in this test file.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/ui/screens.test.ts`
Expected: FAIL — no ticker markup, `stationScreen` has no 6th parameter.

- [ ] **Step 3: Implement screens**

In `src/ui/screens.ts`:

1. Imports: add `bulletin` from `../engine/bulletin`, `pirateChance` from `../engine/events` (used in Task 7 too), and `CommodityId` from `../engine/types` if not present.
2. Add near the top:

```ts
const COMMODITY_SYM: Record<CommodityId, string> = { water: "WTR", parts: "PRT", luxury: "LUX" };
```

3. Add the lane builders (above `stationScreen`):

```ts
/** Static exchange quote board for the docked station (P2-2a): price + ▲▼ vs base + tax/fee. */
function exchLane(s: GameState): string {
  const quotes = COMMODITIES.map((c) => {
    const price = getPrice(s.seed, s.day, s.location, c.id);
    const pct = Math.round(((price - c.basePrice) / c.basePrice) * 100);
    const move =
      pct > 0
        ? `<span class="tick-up">▲ ${pct}%</span>`
        : pct < 0
          ? `<span class="tick-dn">▼ ${Math.abs(pct)}%</span>`
          : `<span class="tick-flat">▬ base</span>`;
    return `<span class="tick-q st-num"><span class="tick-sym">${COMMODITY_SYM[c.id]}</span> ${price} ${move}</span>`;
  }).join(`<span class="tick-sep" aria-hidden="true">│</span>`);
  const taxPct = Math.round(NODES[s.location].taxRate * 100);
  return `<div class="ticker__lane ticker__lane--exch">
    <span class="ticker__tag">EXCH</span>
    <span class="ticker__body">${quotes}<span class="tick-sep" aria-hidden="true">│</span><span class="tick-flat st-num">tax ${taxPct}% · dock ${cr(dockingFee(s.location))}</span></span>
  </div>`;
}

/**
 * The scrolling rumor lane (E1-1). Day 1 is the launch surface: the full bulletin
 * renders as a static list so the first-90-seconds player has a stated first move.
 * From day 2 it scrolls — pausable, paused on hover/focus, and static again under
 * prefers-reduced-motion (see styles.css).
 */
function dockTalkLane(s: GameState, paused: boolean): string {
  const lines = bulletin(s.seed);
  if (s.day === 1) {
    return `<div class="ticker__lane ticker__lane--talk ticker__lane--static">
      <span class="ticker__tag">DOCK TALK</span>
      <ul class="ticker__list">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>
    </div>`;
  }
  const strip =
    lines
      .map((l) => `<span class="talk-line">${l}</span>`)
      .join(`<span class="tick-sep" aria-hidden="true">◆</span>`) +
    `<span class="tick-sep" aria-hidden="true">◆</span>`;
  return `<div class="ticker__lane ticker__lane--talk${paused ? " ticker--paused" : ""}">
    <span class="ticker__tag">DOCK TALK</span>
    <button class="ticker__pause" data-act="tickerPause" aria-pressed="${paused}" aria-label="${paused ? "Resume" : "Pause"} the dock talk ticker">${paused ? "▶" : "❙❙"}</button>
    <span class="ticker__body ticker__body--scroll"><span class="ticker__marquee">${strip}</span><span class="ticker__marquee" aria-hidden="true">${strip}</span></span>
  </div>`;
}
```

4. `stationScreen` gains the parameter and renders the lanes right after the statbar:

```ts
export function stationScreen(
  s: GameState,
  turnReport: LogEntry[] = [],
  dateLabel = "",
  retireArmed = false,
  meta?: RunMeta,
  tickerPaused = false
): string {
```

and in the template, after `${statbar(s, fuelClass)}`:

```ts
    <div class="ticker" aria-label="Station exchange and dock talk">
      ${exchLane(s)}
      ${dockTalkLane(s, tickerPaused)}
    </div>
```

5. In `tradeHubPanel`, build the intel line and insert it directly above `<div class="st-market__head">Market Commodities</div>`:

```ts
const st = NODES[s.location];
const taxPct = Math.round(st.taxRate * 100);
const intelParts = [
  ...st.produces.map((c) => `Produces ${commodityName(c)} (−30%)`),
  ...st.demands.map((c) => `Buys ${commodityName(c)} (+40%)`),
  taxPct > 0 ? `Sales taxed ${taxPct}%` : "Tax-free port",
];
if (st.produces.length === 0 && st.demands.length === 0) {
  intelParts.unshift("A trade crossroads — no local specialities");
}
const intel = `<p class="station-intel">${intelParts.join(" · ")}</p>`;
```

```ts
        ${intel}
        <div class="st-market__head">Market Commodities</div>
```

(The −30%/+40% figures are `world.ts:97-98`'s `×0.7`/`×1.4` modifiers, stated as percentages.)

- [ ] **Step 4: Wire the pause toggle**

`src/ui/render.ts` — `ViewModel` gains `tickerPaused: boolean;` and the station branch passes it:

```ts
root.innerHTML = stationScreen(
  vm.state,
  vm.turnReport,
  vm.dateLabel,
  vm.retireArmed,
  vm.meta,
  vm.tickerPaused
);
```

`src/main.ts`:

1. Module state, next to `retireArmed`: `let tickerPaused = false;`
2. In the click handler, insert this block after the `const qty = …` line and **before** the `turnReport = [];` reset (pausing must not wipe the turn report, and `lastAct` must point at the pause button so focus restores to it after the re-render):

```ts
// Ticker pause is pure view state: no engine action, no snapshot, keep the turn report.
if (act === "tickerPause") {
  lastAct = { act };
  tickerPaused = !tickerPaused;
  safePaint();
  return;
}
```

3. `paint()` passes `tickerPaused` in the `render(app, {...})` object.

- [ ] **Step 5: CSS**

Append to `src/ui/styles.css` (adapt color variables to what tokens.css actually defines — check for existing `--st-*` color tokens and reuse the good/bad/accent ones used by `.tr-good`/`.tr-bad`):

```css
/* Exchange ticker (E1-1 + P2-2a) */
.ticker {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 8px 0;
}
.ticker__lane {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  border: 1px solid var(--st-border, #1d2942);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 0.85em;
}
.ticker__tag {
  flex: none;
  font-size: 0.7em;
  letter-spacing: 0.12em;
  opacity: 0.8;
}
.ticker__body {
  white-space: nowrap;
  overflow: hidden;
}
.ticker__body--scroll {
  flex: 1;
}
.ticker__marquee {
  display: inline-block;
  padding-right: 2rem;
  animation: st-ticker 30s linear infinite;
}
@keyframes st-ticker {
  to {
    transform: translateX(-100%);
  }
}
.ticker__lane--talk:hover .ticker__marquee,
.ticker__lane--talk:focus-within .ticker__marquee,
.ticker--paused .ticker__marquee {
  animation-play-state: paused;
}
.ticker__pause {
  flex: none;
  background: none;
  border: 1px solid var(--st-border, #1d2942);
  border-radius: 4px;
  color: inherit;
  font-size: 0.75em;
  padding: 0 6px;
  cursor: pointer;
}
.ticker__list {
  margin: 0;
  padding-left: 1.1em;
}
.tick-sep {
  opacity: 0.4;
  padding: 0 6px;
}
.tick-up {
  color: var(--st-good, #6ee7a0);
}
.tick-dn {
  color: var(--st-bad, #ff7b7b);
}
.tick-flat {
  opacity: 0.6;
}
/* WCAG 2.2.2 + reduced motion: the static form is the contract, not an afterthought. */
@media (prefers-reduced-motion: reduce) {
  .ticker__marquee {
    animation: none;
  }
  .ticker__marquee[aria-hidden="true"] {
    display: none;
  }
  .ticker__body--scroll {
    white-space: normal;
  }
}
.station-intel {
  margin: 0;
  padding: 6px 10px 0;
  font-size: 0.8em;
  opacity: 0.75;
}
```

**Before writing, grep `src/ui/tokens.css` and `src/ui/design-system.css` for the real color-variable names** (`grep -n "^\s*--" src/ui/tokens.css | head -30`) and substitute them for the `--st-border/--st-good/--st-bad` fallbacks above.

- [ ] **Step 6: Run tests, then eyeball it**

Run: `npm test`
Expected: PASS.

Then start the dev server (`.claude/launch.json` name if defined, else `npm run dev` via the preview tool) and verify by eye: lanes under the statbar, day-1 static list, marquee scrolls on day 2+ (jump once), pause button stops it, prices in EXCH match the Trade Hub rows. Note: the marquee restarts from position 0 on every action (full innerHTML re-render) — known cost of the pre-B-4 render architecture, accepted; do not attempt DOM patching here.

- [ ] **Step 7: Commit**

```bash
git add src/ui src/main.ts tests/ui/screens.test.ts
git commit -m "feat(ui): exchange ticker — static EXCH quotes and scrolling DOCK TALK bulletin (E1-1, P2-2a)"
```

---

### Task 7: P1-2 — forecast sinks (orb costs, interest chip, sell nets)

**Files:**

- Modify: `src/engine/game.ts` (new `interestForecast`)
- Modify: `src/ui/screens.ts` (`navigatorPanel`, `logisticsPanel`, `tradeHubPanel` sell buttons)
- Test: `tests/engine/game.test.ts`, `tests/ui/screens.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/engine/game.test.ts` (import `interestForecast`):

```ts
describe("interestForecast (P1-2)", () => {
  it("prices the next tick with the escalated rate for that day", () => {
    // Day 4, debt 1,140: next tick day 6, rate 6% (day >= LOAN_STEP_IMPATIENT) -> ceil(68.4).
    const s = { ...createGame(42), day: 4, debt: 1140 };
    expect(interestForecast(s)).toEqual({ inDays: 2, amount: 69 });
  });

  it("a tick day forecasts the following tick, not itself", () => {
    const s = { ...createGame(42), day: 6, debt: 1000 };
    expect(interestForecast(s)).toEqual({ inDays: 3, amount: Math.ceil(1000 * 0.08) });
  });

  it("is null with no debt or a finished run", () => {
    expect(interestForecast({ ...createGame(42), debt: 0 })).toBeNull();
    expect(interestForecast({ ...createGame(42), status: "retired" as const })).toBeNull();
  });
});
```

`tests/ui/screens.test.ts`:

```ts
describe("forecast sinks (P1-2)", () => {
  it("jump orbs carry fuel, destination dock fee, and the true raid chance", () => {
    const html = stationScreen(createGame(42)); // docked at terra
    expect(html).toContain(`${cr2(dockingFee("verge"))} · 33%`);
    expect(html).toContain("10%"); // kiruna's floor, never "0%"
    // Raw danger×100 for verge is gone. Scoped to the orb-meta "· N%" format so a
    // legitimate "▲ 50%" in the EXCH lane can't false-positive this assertion.
    expect(html).not.toContain("· 50%");
  });

  it("meridian's tooltip mentions the sales tax and customs", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain("sells taxed 18%");
    expect(html).toContain("customs patrol this approach");
  });

  it("the debt row shows the interest countdown chip", () => {
    const s = { ...createGame(42), day: 4, debt: 1140 };
    expect(stationScreen(s)).toContain("+69cr in 2d");
  });

  it("no chip at zero debt", () => {
    const s = { ...createGame(42), debt: 0 };
    expect(stationScreen(s)).not.toContain("debt-forecast");
  });

  it("sell buttons state net (post-tax) proceeds", () => {
    const s = { ...createGame(42), cargo: { water: 5, parts: 0, luxury: 0 } };
    const net1 = netProceeds(s, "water", 1);
    expect(stationScreen(s)).toContain(`Sell 1 (${net1.toLocaleString()}cr)`);
  });
});
```

Add helper + imports at the top of the file: `import { dockingFee } from "../../src/engine/economy";`, `import { netProceeds } from "../../src/engine/game";`, and `const cr2 = (n: number) => `${n.toLocaleString()}cr`;` (mirrors screens' private `cr`).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/engine/game.test.ts tests/ui/screens.test.ts`
Expected: FAIL — `interestForecast` missing; orbs show raw danger; no chip; sell label plain.

- [ ] **Step 3: Implement `interestForecast`**

In `src/engine/game.ts`, after `netProceeds`:

```ts
/**
 * The Syndicate's next interest tick (P1-2 forecast): how many days away, and how much
 * at THAT day's escalated rate — the same INTEREST_EVERY cadence and loanInterest math
 * jump() applies, so the chip can never disagree with the accrual.
 */
export function interestForecast(s: GameState): { inDays: number; amount: number } | null {
  if (s.debt <= 0 || s.status !== "playing") return null;
  const inDays = INTEREST_EVERY - (s.day % INTEREST_EVERY);
  return { inDays, amount: loanInterest(s.debt, s.day + inDays) };
}
```

- [ ] **Step 4: Implement the three surfaces in `screens.ts`**

1. Imports: `interestForecast` from `../engine/game`; `pirateChance` from `../engine/events` (added in Task 6 — verify).

2. `navigatorPanel` orb loop — replace the `danger` line and expand the texts:

```ts
const cost = fuelCost(s.location, n);
const fee = dockingFee(n);
const raid = Math.round(pirateChance(n) * 100);
const taxPct = Math.round(NODES[n].taxRate * 100);
const customsNote = n === "meridian" ? " · customs patrol this approach" : "";
const disabled = s.fuel < cost;
const reason = disabled ? ` — need ${cost}, have ${s.fuel}` : "";
const detail = `${cost} fuel · dock ${cr(fee)} · ${raid}% raid risk · sells taxed ${taxPct}%${customsNote}`;
return `<button class="st-orb" data-act="jump" data-id="${n}"${disabledAttr(disabled, `Need ${cost}⛽, have ${s.fuel}`)}>
        <span class="st-orb__sphere" style="--orb-art: ${ORB_ART[n]}" aria-hidden="true"></span>
        <span class="st-orb__label">${NODES[n].name}</span>
        <span class="st-orb__meta st-num">${cost}${fuelIcon()} · ${cr(fee)} · ${raid}%</span>
        <span class="st-orb__tip st-num" role="tooltip" aria-hidden="true">${detail}${reason}</span>
        <span class="st-sr-only"> — jump here, ${detail}${reason}</span>
      </button>`;
```

3. `logisticsPanel` — the Debt row:

```ts
const fc = interestForecast(s);
const debtValue = `${cr(s.debt)}${fc ? ` <span class="debt-forecast">+${fc.amount}cr in ${fc.inDays}d</span>` : ""}`;
```

and change `${kv("Debt", cr(s.debt), true)}` to `${kv("Debt", debtValue, true)}`.

4. `tradeHubPanel` sell buttons — visible nets:

```ts
        <button class="st-btn st-btn--sell st-btn--sm" data-act="sell" data-id="${c.id}" data-qty="1" aria-label="Sell 1 ${c.name} for ${cr(netProceeds(s, c.id, 1))} net"${disabledAttr(sellDisabled, "None in hold")}>Sell 1 (${cr(netProceeds(s, c.id, 1))})</button>
        <button class="st-btn st-btn--sell st-btn--sm" data-act="sell" data-id="${c.id}" data-qty="5" aria-label="Sell ×5 ${c.name} for ${cr(netProceeds(s, c.id, 5))} net"${disabledAttr(sell5Disabled, sell5Title)}>×5 (${cr(netProceeds(s, c.id, 5))})</button>
```

5. CSS (styles.css):

```css
.debt-forecast {
  font-size: 0.75em;
  opacity: 0.8;
  white-space: nowrap;
}
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS. Existing screens tests asserting the old `aria-label="Sell 1 ${c.name}"` will fail — update them to the new label text (`Sell 1 ${c.name} for …cr net`); that's the assertion following the surface, not a weakening.

- [ ] **Step 6: Visual check**

Reload the dev preview: orbs read `3⛽ · 40cr · 10%`-style, debt row shows the chip, sell buttons show nets, Meridian tooltip mentions tax + customs. Screenshot for the record.

- [ ] **Step 7: Commit**

```bash
git add src/engine/game.ts src/ui tests
git commit -m "feat(ui): forecast every sink — orb dock fees and true raid %, interest countdown, net sell proceeds (P1-2)"
```

---

### Task 8: README + docs housekeeping + final verification

**Files:**

- Modify: `README.md:60`, `README.md:62-64`
- Modify: `docs/ROADMAP.md`, `docs/BACKLOG.md`, `docs/ENGAGEMENT_BACKLOG.md`

- [ ] **Step 1: Fix README**

Replace line 60 ("Your score is peak net worth…"):

```markdown
- Your score is your net worth when the run ends (audit, retire, or death) plus a survival bonus per day, capped at day 12. Peak net worth is tracked as a stat, but it is not the score.
```

Replace the "The Daily Seed" section body (lines 63-64):

```markdown
The seed comes from the calendar date, so prices, events, and contracts are identical for every player on a given day. Your progress persists locally: a refresh on the same UTC day resumes your in-progress run exactly where it was, your personal best and attempt history live in `localStorage`, and once the UTC day rolls over a fresh daily begins. The first completed run of a day is "The Daily"; later runs are labeled "Practice".
```

Also check the Key Features bullet list for the same stale claims (`grep -n "peak\|localStorage\|no save" README.md`) and align any hits.

- [ ] **Step 2: Tick the roadmap and backlogs**

- `docs/ROADMAP.md`: mark **E1-1**, **P1-2**, **E1-4**, **B-2**, **P2-1** as ✅ **Shipped 2026-07-31** in the M2 table; update the M2 heading/"Already shipped" paragraph to say Milestone 2 is fully shipped; annotate the M3 **P2-2** row: "intel half (▲▼ vs base + station intel) shipped 2026-07-31 with the M2 close-out; cost-basis/P&L half remains".
- `docs/BACKLOG.md`: mark P1-2 and P2-1 shipped; note P2-2's partial ship on its row.
- `docs/ENGAGEMENT_BACKLOG.md`: mark E1-1, E1-4, B-2 rows shipped (B-2 is in the Bugs table); note in §4.3 that E1-1 shipped as the ticker.

- [ ] **Step 3: Full verification**

```bash
npm test
```

Expected: all suites PASS, including the sim sweep.

```bash
npm run lint && npm run build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add README.md docs
git commit -m "docs: correct stale score/persistence claims; mark Milestone 2 fully shipped"
```

---

## Post-plan notes for the executor

- **Task order is load-bearing:** 1 → 2 → 3 restore a compiling tree in stages (the repo does not compile between Tasks 1 and 2 — don't run `npm run build` there). 4 and 5 are engine-independent of each other; 6 depends on 5 (bulletin) and 4 (pirateChance); 7 depends on 4.
- **B-2 fixture churn is expected** (Task 4 Step 5). Re-pin, never weaken. If the sim bands fail, stop and report the numbers — retuning is out of scope.
- **The marquee resets on every re-render** (full innerHTML swap). Accepted; the fix is the B-4 DOM-patching stretch, not this round.
- **Prettier hook** reformats files on write; if an Edit's `old_string` misses, re-read the file first.
