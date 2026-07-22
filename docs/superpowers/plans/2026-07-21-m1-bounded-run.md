# M1 Round 1 — "The Run Ends" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound the daily run at 12 days with audit/retire end states, rework score to net-worth-plus-capped-bonus, make hull 0 destroy the ship, and escalate loan interest 4→6→8% — per the approved spec [2026-07-21-m1-bounded-run-design.md](../specs/2026-07-21-m1-bounded-run-design.md).

**Architecture:** A new `src/engine/run-end.ts` module owns the `RunEnd` object (status, cause, score breakdown) that every end path — audit, retire, stranding, hull breach — produces via `endRun()`. `game.ts` routes all endings through it; the UI (`render.ts`, `screens.ts`, `main.ts`) reads `state.runEnd` instead of recomputing score. The sim gains `arrive()` calls so the audit fires, and the balance suite asserts the spec's death-rate bands across 100 seeds.

**Tech Stack:** TypeScript, Vite, Vitest (`npm test` = `vitest run`). Pure-function engine, string-template UI, no framework.

**Conventions:** All paths relative to repo root. Run tests from repo root. Commit after every task. The engine is immutable-state: every mutation returns a new object via spread.

---

## File Structure

| File                                                                                                                                                  | Change                                                                                                                                                         |
| :---------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/engine/types.ts`                                                                                                                                 | Add `RunEndStatus`, `RunEnd`; extend `GameState.status`, add optional `runEnd`                                                                                 |
| `src/engine/run-end.ts`                                                                                                                               | **New** — `RUN_LENGTH`, `SURVIVAL_BONUS_PER_DAY`, `endRun()`                                                                                                   |
| `src/engine/game.ts`                                                                                                                                  | Guards on ended runs; `checkLoss` via `endRun`; `retire()`; audit in `arrive()`; hull death in `resolveChoice()`; Syndicate interest lines; new goal-line copy |
| `src/engine/economy.ts`                                                                                                                               | `loanRate(day)`, `loanInterest(debt, day)`; delete `LOAN_RATE` and `score()`                                                                                   |
| `src/engine/preview.ts`                                                                                                                               | `LETHAL_MARK` on worst-case-lethal stakes                                                                                                                      |
| `src/ui/screens.ts`                                                                                                                                   | `Day N/12`; `runEndScreen(s, runEnd)` rework; retire button; `toneOf` patterns                                                                                 |
| `src/ui/render.ts`                                                                                                                                    | Branch on `state.runEnd`; `retireArmed` in ViewModel                                                                                                           |
| `src/main.ts`                                                                                                                                         | retire/retireConfirm actions + armed flag; share reads `runEnd`; drop `scoreFn`                                                                                |
| `src/sim/simulate.ts`                                                                                                                                 | Drop `maxDays`; call `arrive()`; personas repair; result gains `status`                                                                                        |
| `tests/engine/run-end.test.ts`                                                                                                                        | **New**                                                                                                                                                        |
| `tests/engine/game.test.ts`, `tests/engine/economy.test.ts`, `tests/engine/preview.test.ts`, `tests/ui/screens.test.ts`, `tests/sim/simulate.test.ts` | Updated per task                                                                                                                                               |

Dependency check (no cycles): `run-end.ts` imports from `types.ts` + `economy.ts`; `game.ts` imports `run-end.ts`; `economy.ts` imports neither.

---

### Task 1: RunEnd core (`types.ts` + `run-end.ts`)

**Files:**

- Modify: `src/engine/types.ts`
- Create: `src/engine/run-end.ts`
- Create: `tests/engine/run-end.test.ts`

- [ ] **Step 1: Extend types**

In `src/engine/types.ts`, add above `GameState`:

```ts
export type RunEndStatus = "lost" | "audited" | "retired";

/** Banked summary of a finished run — the single source of truth for end-of-run surfaces. */
export interface RunEnd {
  status: RunEndStatus;
  cause: string; // player-facing line naming what ended the run
  daysSurvived: number; // capped at RUN_LENGTH
  netWorthAtEnd: number; // banked runs: full net worth; death: credits − debt (cargo is lost)
  survivalBonus: number; // 0 on death
  score: number; // max(0, netWorthAtEnd) + survivalBonus
}
```

In `GameState`, replace the `status` line and add `runEnd` after it:

```ts
  status: "playing" | RunEndStatus;
  runEnd?: RunEnd; // present exactly when status !== "playing"
```

- [ ] **Step 2: Write the failing tests**

Create `tests/engine/run-end.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createGame } from "../../src/engine/game";
import { RUN_LENGTH, SURVIVAL_BONUS_PER_DAY, endRun } from "../../src/engine/run-end";
import { netWorth } from "../../src/engine/economy";

describe("endRun", () => {
  it("banks net worth + survival bonus on an audited run", () => {
    const s = { ...createGame(42), day: 12, credits: 2000, debt: 0 };
    const ended = endRun(s, "audited", "Audited.");
    expect(ended.status).toBe("audited");
    expect(ended.runEnd?.netWorthAtEnd).toBe(netWorth(s));
    expect(ended.runEnd?.survivalBonus).toBe(SURVIVAL_BONUS_PER_DAY * 12);
    expect(ended.runEnd?.score).toBe(netWorth(s) + SURVIVAL_BONUS_PER_DAY * 12);
  });

  it("banks the same way on a retired run", () => {
    const s = { ...createGame(42), day: 4, credits: 3000, debt: 500 };
    const ended = endRun(s, "retired", "Retired.");
    expect(ended.status).toBe("retired");
    expect(ended.runEnd?.survivalBonus).toBe(SURVIVAL_BONUS_PER_DAY * 4);
    expect(ended.runEnd?.score).toBe(netWorth(s) + SURVIVAL_BONUS_PER_DAY * 4);
  });

  it("death loses the cargo and the survival bonus", () => {
    const s = {
      ...createGame(42),
      day: 6,
      credits: 900,
      debt: 100,
      cargo: { water: 10, parts: 0, luxury: 0 },
    };
    const ended = endRun(s, "lost", "Hull breach — your ship broke apart.");
    expect(ended.runEnd?.netWorthAtEnd).toBe(800); // credits − debt; cargo excluded
    expect(ended.runEnd?.survivalBonus).toBe(0);
    expect(ended.runEnd?.score).toBe(800);
  });

  it("floors the net-worth part at 0 but still pays the bonus", () => {
    const s = { ...createGame(42), day: 3, credits: 100, debt: 2000 };
    const ended = endRun(s, "retired", "Retired.");
    expect(ended.runEnd?.score).toBe(SURVIVAL_BONUS_PER_DAY * 3);
  });

  it("floors a death score at 0", () => {
    const s = { ...createGame(42), day: 3, credits: 100, debt: 2000 };
    const ended = endRun(s, "lost", "Stranded.");
    expect(ended.runEnd?.score).toBe(0);
  });

  it("caps daysSurvived at RUN_LENGTH", () => {
    const s = { ...createGame(42), day: 99 };
    expect(endRun(s, "audited", "Audited.").runEnd?.daysSurvived).toBe(RUN_LENGTH);
  });

  it("appends the cause to the log", () => {
    const ended = endRun(createGame(42), "retired", "Retired at Terra Hub.");
    expect(ended.log[ended.log.length - 1]).toBe("Retired at Terra Hub.");
  });

  it("is a no-op on an already-ended run", () => {
    const dead = endRun(createGame(42), "lost", "gone");
    expect(endRun(dead, "retired", "again")).toBe(dead);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/engine/run-end.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/run-end`.

- [ ] **Step 4: Implement `run-end.ts`**

Create `src/engine/run-end.ts`:

```ts
// src/engine/run-end.ts
//
// The single source of truth for how a run ends (E0-1/E0-2). Every end path — audit,
// retire, stranding, hull breach — goes through endRun(), so the end screen, share
// card, and later persistence/debrief read one banked RunEnd instead of re-deriving.
import { GameState, RunEnd, RunEndStatus } from "./types";
import { netWorth } from "./economy";

/** A daily run lasts at most this many in-game days; arrival on the last day is the audit. */
export const RUN_LENGTH = 12;

/** Score credited per day survived on a banked (audited/retired) run. Sweep-tuned knob. */
export const SURVIVAL_BONUS_PER_DAY = 50;

/**
 * End the run and attach the banked RunEnd. Death loses the cargo (it goes down with
 * the ship) and the survival bonus; audit/retire bank full net worth + the capped bonus.
 */
export function endRun(state: GameState, status: RunEndStatus, cause: string): GameState {
  if (state.status !== "playing") return state;
  const daysSurvived = Math.min(state.day, RUN_LENGTH);
  const netWorthAtEnd = status === "lost" ? state.credits - state.debt : netWorth(state);
  const survivalBonus = status === "lost" ? 0 : SURVIVAL_BONUS_PER_DAY * daysSurvived;
  const runEnd: RunEnd = {
    status,
    cause,
    daysSurvived,
    netWorthAtEnd,
    survivalBonus,
    score: Math.max(0, netWorthAtEnd) + survivalBonus,
  };
  return { ...state, status, runEnd, log: [...state.log, cause] };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/engine/run-end.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/engine/types.ts src/engine/run-end.ts tests/engine/run-end.test.ts
git commit -m "feat(engine): RunEnd core — banked end-of-run summary with E0-2 scoring"
```

---

### Task 2: Ended-run guards + stranding via `endRun`

**Files:**

- Modify: `src/engine/game.ts` (imports, `checkLoss`, `jump`)
- Test: `tests/engine/game.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/game.test.ts` (inside the file, new describe blocks at the end). Also add `retire` to the import list later (Task 3); for now add `endRun` import:

```ts
import { endRun } from "../../src/engine/run-end";

describe("ended-run guards", () => {
  it("jump is a no-op on an ended run", () => {
    const dead = endRun({ ...createGame(42), fuel: 20 }, "lost", "gone");
    const r = jump(dead, "kiruna");
    expect(r.state).toBe(dead);
    expect(r.event).toBeNull();
  });

  it("checkLoss banks a RunEnd with no survival bonus on stranding", () => {
    const s = { ...createGame(42), fuel: 0, credits: 0, cargo: { water: 0, parts: 0, luxury: 0 } };
    const lost = checkLoss(s);
    expect(lost.status).toBe("lost");
    expect(lost.runEnd?.status).toBe("lost");
    expect(lost.runEnd?.survivalBonus).toBe(0);
    expect(lost.runEnd?.score).toBe(0); // credits 0 − debt 1500 floors at 0
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npm test -- tests/engine/game.test.ts`
Expected: FAIL — `r.state` is a new object (no guard yet) and `runEnd` is undefined.

- [ ] **Step 3: Implement**

In `src/engine/game.ts`:

Add to imports:

```ts
import { RUN_LENGTH, endRun } from "./run-end";
```

(`RUN_LENGTH` is used in Task 4; importing both now avoids churn.)

Replace `checkLoss` with:

```ts
export function checkLoss(state: GameState): GameState {
  if (state.status !== "playing") return state;
  const cheapest = Math.min(
    ...NODE_IDS.filter((n) => n !== state.location).map((n) => fuelCost(state.location, n))
  );
  const canJumpNow = state.fuel >= cheapest;
  const fuelShort = Math.max(0, cheapest - state.fuel);
  const canBuyFuel = state.credits >= fuelShort * REFUEL_PRICE;
  if (!canJumpNow && !canBuyFuel) {
    return endRun(
      state,
      "lost",
      `Stranded at ${NODES[state.location].name} — not enough fuel to jump, and refueling costs more than you have.`
    );
  }
  return state;
}
```

(The stranding log line is byte-identical to before — existing tests that pin it keep passing.)

In `jump`, add a guard as the first line of the function body:

```ts
export function jump(state: GameState, to: NodeId): { state: GameState; event: GameEvent | null } {
  if (state.status !== "playing") return { state, event: null };
  if (to === state.location) return { state, event: null };
  ...
```

- [ ] **Step 4: Run the engine tests**

Run: `npm test -- tests/engine/`
Expected: PASS (all, including the pre-existing stranding-line tests).

- [ ] **Step 5: Commit**

```bash
git add src/engine/game.ts tests/engine/game.test.ts
git commit -m "feat(engine): route stranding through endRun; guard jump on ended runs"
```

---

### Task 3: `retire()`

**Files:**

- Modify: `src/engine/game.ts`
- Test: `tests/engine/game.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `retire` to the `game.ts` import list in `tests/engine/game.test.ts`, then append:

```ts
describe("retire (E0-1)", () => {
  it("ends the run as retired and banks the score", () => {
    const s = { ...createGame(42), day: 5, credits: 2000, debt: 500 };
    const r = retire(s);
    expect(r.status).toBe("retired");
    expect(r.runEnd?.status).toBe("retired");
    expect(r.runEnd?.daysSurvived).toBe(5);
    expect(r.log[r.log.length - 1]).toBe("Retired at Terra Hub — the Syndicate banks your score.");
  });

  it("is a no-op on an ended run", () => {
    const dead = endRun(createGame(42), "lost", "gone");
    expect(retire(dead)).toBe(dead);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/engine/game.test.ts`
Expected: FAIL — `retire` is not exported.

- [ ] **Step 3: Implement**

In `src/engine/game.ts`, after `payDebt`:

```ts
/** Voluntarily end the run at dock, banking the score (E0-1). No-op once the run is over. */
export function retire(state: GameState): GameState {
  return endRun(
    state,
    "retired",
    `Retired at ${NODES[state.location].name} — the Syndicate banks your score.`
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/engine/game.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/game.ts tests/engine/game.test.ts
git commit -m "feat(engine): retire() banks the run voluntarily"
```

---

### Task 4: The Daily Audit in `arrive()`

**Files:**

- Modify: `src/engine/game.ts` (`arrive`)
- Test: `tests/engine/game.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/game.test.ts`:

```ts
describe("the Daily Audit (E0-1)", () => {
  it("arrival on day 12 ends the run as audited", () => {
    const s = { ...createGame(42), day: 11, fuel: 20 };
    const j = jump(s, "kiruna"); // arrival day = 12
    const r = arrive(j.state);
    expect(r.state.status).toBe("audited");
    expect(r.state.runEnd?.daysSurvived).toBe(12);
    expect(r.state.log[r.state.log.length - 1]).toBe(
      "Day 12 — the Syndicate audits your books and banks your score."
    );
  });

  it("audit beats stranding: arriving broke on day 12 still banks the score", () => {
    // Fuel exactly covers terra→kiruna (4); nothing left to jump or refuel with after.
    const s = { ...createGame(42), day: 11, fuel: 4, credits: 30 };
    const j = jump(s, "kiruna"); // docking fee eats the last credits
    const r = arrive(j.state);
    expect(r.state.status).toBe("audited");
  });

  it("no audit before day 12", () => {
    const s = { ...createGame(42), day: 5, fuel: 20 };
    const r = arrive(jump(s, "kiruna").state);
    expect(r.state.status).toBe("playing");
  });

  it("deliveries settle before the audit banks, so the reward counts", () => {
    const contract: Mission = {
      id: "a1",
      commodity: "water",
      qty: 5,
      destination: "kiruna",
      reward: 500,
      deadlineDay: 99,
    };
    let s = createGame(42);
    s = acceptMission(s, contract);
    s = { ...s, day: 11, fuel: 20, cargo: { ...s.cargo, water: 5 } };
    const r = arrive(jump(s, "kiruna").state);
    expect(r.delivered.map((m) => m.id)).toEqual(["a1"]);
    expect(r.state.status).toBe("audited");
    // Reward was paid into credits before endRun computed net worth.
    expect(r.state.runEnd!.netWorthAtEnd).toBe(r.state.credits + 0 - r.state.debt);
  });

  it("arrive early-returns on an ended run without settling deliveries", () => {
    const dead = endRun(createGame(42), "lost", "gone");
    const r = arrive(dead);
    expect(r.state).toBe(dead);
    expect(r.delivered).toEqual([]);
    expect(r.expired).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/engine/game.test.ts`
Expected: FAIL — status stays `"playing"` past day 12; ended-run `arrive` still settles.

- [ ] **Step 3: Implement**

Replace `arrive` in `src/engine/game.ts`:

```ts
/**
 * Finalize arrival once the in-transit event is resolved: settle deliveries against the
 * cargo actually in the hold, track peak net worth, then close the day — the Day-12
 * audit banks the run (it outranks stranding: you made it), otherwise the loss check
 * runs (so a delivery reward can rescue a player who would otherwise be stranded).
 */
export function arrive(state: GameState): {
  state: GameState;
  delivered: Mission[];
  expired: Mission[];
} {
  if (state.status !== "playing") return { state, delivered: [], expired: [] };
  const settled = settleMissions(state);
  let s = trackPeak(settled.state);
  s =
    s.day >= RUN_LENGTH
      ? endRun(
          s,
          "audited",
          `Day ${RUN_LENGTH} — the Syndicate audits your books and banks your score.`
        )
      : checkLoss(s);
  return { state: s, delivered: settled.delivered, expired: settled.expired };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/engine/game.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/game.ts tests/engine/game.test.ts
git commit -m "feat(engine): Day-12 audit ends the run in arrive(); audit outranks stranding"
```

---

### Task 5: Hull 0 destroys the ship (B-6)

**Files:**

- Modify: `src/engine/game.ts` (`resolvePirates`, `resolveSalvage`, `resolveEngine`, `resolveDerelict`, `resolveChoice`, new `checkHullDeath`)
- Test: `tests/engine/game.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/game.test.ts`. Add `hashSeed` to imports: `import { hashSeed } from "../../src/engine/rng";`

```ts
describe("hull death (B-6)", () => {
  const pirates: GameEvent = {
    kind: "pirates",
    title: "",
    description: "",
    choices: [{ id: "flee", label: "" }],
  };

  it("fleeing pirates at low hull destroys the ship", () => {
    // fleeDamage(day) = 15 + (day % 10) → 16 on day 1; hull 10 cannot survive it.
    const s = { ...createGame(42), hull: 10 };
    const dead = resolveChoice(s, pirates, "flee");
    expect(dead.status).toBe("lost");
    expect(dead.hull).toBe(0);
    expect(dead.runEnd?.cause).toBe("Hull breach — your ship broke apart.");
  });

  it("fleeing at healthy hull just takes the damage", () => {
    const s = { ...createGame(42), hull: 50 };
    const fled = resolveChoice(s, pirates, "flee");
    expect(fled.status).toBe("playing");
    expect(fled.hull).toBe(50 - 16);
  });

  it("a salvage trap can kill", () => {
    // Find a trap day for this seed: resolveSalvage traps when hashSeed(seed, day) % 3 === 0.
    const trapDay = Array.from({ length: 30 }, (_, i) => i + 1).find(
      (d) => hashSeed(42, d) % 3 === 0
    )!;
    const salvage: GameEvent = {
      kind: "salvage",
      title: "",
      description: "",
      choices: [{ id: "collect", label: "" }],
    };
    const s = { ...createGame(42), day: trapDay, hull: 10 }; // SALVAGE_TRAP_DAMAGE = 10
    const dead = resolveChoice(s, salvage, "collect");
    expect(dead.status).toBe("lost");
    expect(dead.hull).toBe(0);
  });

  it("a derelict trap can kill", () => {
    // resolveDerelict traps when hashSeed(seed, day) % 2 !== 0.
    const trapDay = Array.from({ length: 30 }, (_, i) => i + 1).find(
      (d) => hashSeed(42, d) % 2 !== 0
    )!;
    const derelict: GameEvent = {
      kind: "derelict",
      title: "",
      description: "",
      choices: [{ id: "board", label: "" }],
    };
    const s = { ...createGame(42), day: trapDay, hull: 20 }; // DERELICT_TRAP_DAMAGE = 20
    const dead = resolveChoice(s, derelict, "board");
    expect(dead.status).toBe("lost");
  });

  it("engine strain on an empty tank can kill", () => {
    const engine: GameEvent = {
      kind: "engine",
      title: "",
      description: "",
      choices: [{ id: "ack", label: "" }],
    };
    // fuel 0 → strain = ENGINE_LEAK(2) × 5 = 10 hull.
    const s = { ...createGame(42), fuel: 0, hull: 10 };
    const dead = resolveChoice(s, engine, "ack");
    expect(dead.status).toBe("lost");
    expect(dead.hull).toBe(0);
  });

  it("a ship destroyed in transit does not settle its deliveries", () => {
    const contract: Mission = {
      id: "h1",
      commodity: "water",
      qty: 5,
      destination: "kiruna",
      reward: 500,
      deadlineDay: 99,
    };
    let s = createGame(42);
    s = acceptMission(s, contract);
    s = { ...s, fuel: 20, hull: 10, cargo: { ...s.cargo, water: 5 } };
    const j = jump(s, "kiruna");
    const dead = resolveChoice(j.state, pirates, "flee"); // 15+(2%10)=17 ≥ 10 → destroyed
    expect(dead.status).toBe("lost");
    const r = arrive(dead);
    expect(r.delivered).toEqual([]); // cargo went down with the ship
    expect(r.state.runEnd?.survivalBonus).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/engine/game.test.ts`
Expected: FAIL — status stays `"playing"`, hull clamps at 0 with no death.

- [ ] **Step 3: Implement**

In `src/engine/game.ts`:

Add after `trackPeak`:

```ts
/** Hull 0 destroys the ship (B-6): the run ends as a loss and cargo goes down with it. */
function checkHullDeath(s: GameState): GameState {
  if (s.hull > 0 || s.status !== "playing") return s;
  return endRun({ ...s, hull: 0 }, "lost", "Hull breach — your ship broke apart.");
}
```

Remove the `Math.max(0, …)` clamps at all four damage sites (the raw value may go
negative for one call; `checkHullDeath` floors it back to 0 when it ends the run):

In `resolvePirates`:

```ts
const dmg = fleeDamage(s.day);
return withLog({ ...s, hull: s.hull - dmg }, `Fled — took ${dmg} hull damage.`);
```

In `resolveSalvage` (trap branch):

```ts
return withLog(
  { ...s, hull: s.hull - SALVAGE_TRAP_DAMAGE },
  `Salvage hid a live warhead: -${SALVAGE_TRAP_DAMAGE} hull.`
);
```

In `resolveEngine`:

```ts
return withLog({ ...s, fuel: s.fuel - burn, hull: s.hull - strain }, msg);
```

In `resolveDerelict` (trap branch):

```ts
return withLog(
  { ...s, hull: s.hull - DERELICT_TRAP_DAMAGE },
  `Derelict was a trap: -${DERELICT_TRAP_DAMAGE} hull.`
);
```

In `resolveChoice`, replace the final `return trackPeak(s);` with:

```ts
// Loss/peak from deliveries are evaluated in `arrive`; hull death is checked here
// because a destroyed ship must not reach arrival settlement (cargo is lost).
return checkHullDeath(trackPeak(s));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/engine/game.test.ts`
Expected: PASS (the pre-existing "in-transit salvage" test still passes — its day is a non-trap day).

- [ ] **Step 5: Commit**

```bash
git add src/engine/game.ts tests/engine/game.test.ts
git commit -m "feat(engine): hull 0 destroys the ship — B-6 makes hull stakes real"
```

---

### Task 6: Loan escalation (E0-4)

**Files:**

- Modify: `src/engine/economy.ts`, `src/engine/game.ts` (interest accrual), `src/ui/screens.ts` (`toneOf` only)
- Test: `tests/engine/economy.test.ts`, `tests/engine/game.test.ts`, `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing economy tests**

In `tests/engine/economy.test.ts`, replace the `loanInterest` test with:

```ts
it("loan interest escalates 4% → 6% → 8% at days 5 and 9 (E0-4)", () => {
  expect(loanInterest(1000, 1)).toBe(40);
  expect(loanInterest(1000, 4)).toBe(40);
  expect(loanInterest(1000, 5)).toBe(60);
  expect(loanInterest(1000, 8)).toBe(60);
  expect(loanInterest(1000, 9)).toBe(80);
  expect(loanInterest(1000, 12)).toBe(80);
  expect(loanInterest(0, 9)).toBe(0);
});
```

- [ ] **Step 2: Write the failing game tests (Syndicate voice)**

Append to `tests/engine/game.test.ts`:

```ts
describe("loan escalation voice (E0-4)", () => {
  const interestLineAfterJump = (day: number): string => {
    const s = { ...createGame(42), day: day - 1, fuel: 20 };
    const j = jump(s, "kiruna");
    return j.state.log.find((l) => l.includes("Syndicate compounds")) ?? "";
  };

  it("day 3 accrues at 4% with the base line", () => {
    expect(interestLineAfterJump(3)).toBe("The Syndicate compounds: +60cr.");
  });

  it("day 6 accrues at 6% and grows impatient", () => {
    expect(interestLineAfterJump(6)).toBe("The Syndicate compounds: +90cr. It grows impatient.");
  });

  it("day 9 accrues at 8% and loses patience", () => {
    expect(interestLineAfterJump(9)).toBe(
      "The Syndicate compounds: +120cr. It is losing patience with you."
    );
  });
});
```

(Debt stays at the starting 1,500 through a single jump: ceil(1500×0.04)=60, ceil(1500×0.06)=90, ceil(1500×0.08)=120.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/engine/economy.test.ts tests/engine/game.test.ts`
Expected: FAIL — `loanInterest` takes one argument; log says "Loan interest: debt grows…".

- [ ] **Step 4: Implement**

In `src/engine/economy.ts`, replace the `LOAN_RATE` constant and `loanInterest` with:

```ts
/** Loan interest rate by day — the Syndicate's patience runs out in steps (E0-4). */
export function loanRate(day: number): number {
  return day >= 9 ? 0.08 : day >= 5 ? 0.06 : 0.04;
}

export function loanInterest(debt: number, day: number): number {
  if (debt <= 0) return 0;
  return Math.ceil(debt * loanRate(day));
}
```

In `src/engine/game.ts`, add near `withLog`:

```ts
/** The lender's voice escalates with its rate tier (E0-4). */
function interestLine(interest: number, day: number): string {
  const base = `The Syndicate compounds: +${interest}cr.`;
  if (day >= 9) return `${base} It is losing patience with you.`;
  if (day >= 5) return `${base} It grows impatient.`;
  return base;
}
```

and change the accrual block in `jump` to:

```ts
if (s.day % INTEREST_EVERY === 0 && s.debt > 0) {
  const interest = loanInterest(s.debt, s.day);
  s = withLog({ ...s, debt: s.debt + interest }, interestLine(interest, s.day));
}
```

- [ ] **Step 5: Update `toneOf` and its test**

In `src/ui/screens.ts`, the `toneOf` regex no longer matches the interest line and must learn the two new bad-news lines. Replace the "bad" regex with:

```ts
    /trap|damage|seized|expired|burned|warhead|overheated|Bribed|Paid pirates|Syndicate compounds|Hull breach|Stranded/i.test(
```

In `tests/ui/screens.test.ts`, the turn-report tone test at line ~98 uses the old copy. Change:

```ts
const html = stationScreen(createGame(42), ["Loan interest: debt grows 60cr."]);
```

to:

```ts
const html = stationScreen(createGame(42), ["The Syndicate compounds: +60cr."]);
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/engine/economy.ts src/engine/game.ts src/ui/screens.ts tests/engine/economy.test.ts tests/engine/game.test.ts tests/ui/screens.test.ts
git commit -m "feat(engine): loan escalates 4/6/8% with the Syndicate's voice (E0-4)"
```

---

### Task 7: Lethal-stake marker in previews

**Files:**

- Modify: `src/engine/preview.ts`
- Test: `tests/engine/preview.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/preview.test.ts` (it already imports `createGame` and `choiceStakes`; add `LETHAL_MARK` to the preview import):

```ts
describe("lethal-stake marker (B-6)", () => {
  it("marks a pirate flee that could destroy the ship", () => {
    const s = { ...createGame(42), hull: 10 }; // fleeDamage day 1 = 16 ≥ 10
    const stakes = choiceStakes(s, {
      kind: "pirates",
      title: "",
      description: "",
      choices: [],
    });
    expect(stakes.flee).toContain(LETHAL_MARK);
    expect(stakes.pay).not.toContain(LETHAL_MARK);
  });

  it("does not mark a survivable flee", () => {
    const s = { ...createGame(42), hull: 50 };
    const stakes = choiceStakes(s, { kind: "pirates", title: "", description: "", choices: [] });
    expect(stakes.flee).not.toContain(LETHAL_MARK);
  });

  it("marks salvage and derelict gambles at killable hull", () => {
    const s = { ...createGame(42), hull: 10 }; // salvage trap 10 ≥ 10; derelict trap 20 ≥ 10
    expect(
      choiceStakes(s, { kind: "salvage", title: "", description: "", choices: [] }).collect
    ).toContain(LETHAL_MARK);
    expect(
      choiceStakes(s, { kind: "derelict", title: "", description: "", choices: [] }).board
    ).toContain(LETHAL_MARK);
  });

  it("marks engine strain only when it could kill", () => {
    const dying = { ...createGame(42), fuel: 0, hull: 10 }; // strain 10 ≥ 10
    const fine = { ...createGame(42), fuel: 0, hull: 50 };
    expect(
      choiceStakes(dying, { kind: "engine", title: "", description: "", choices: [] }).ack
    ).toContain(LETHAL_MARK);
    expect(
      choiceStakes(fine, { kind: "engine", title: "", description: "", choices: [] }).ack
    ).not.toContain(LETHAL_MARK);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/engine/preview.test.ts`
Expected: FAIL — `LETHAL_MARK` not exported.

- [ ] **Step 3: Implement**

In `src/engine/preview.ts`, add after the imports:

```ts
/** Appended to a stake whose worst-case hull roll would destroy the ship (B-6 honesty). */
export const LETHAL_MARK = " — ⚠ could destroy you";

/** The marker when `worstCaseHull` damage would reduce this ship's hull to 0 or below. */
function lethalIf(s: GameState, worstCaseHull: number): string {
  return worstCaseHull >= s.hull ? LETHAL_MARK : "";
}
```

Update `choiceStakes` branches:

```ts
    case "pirates":
      return {
        pay: `~${pirateToll(s)}cr`,
        flee: `risk ${fleeDamage(s.day)} hull${lethalIf(s, fleeDamage(s.day))}`,
      };
    case "salvage": {
      const got = salvageAmount(s);
      const gain = got > 0 ? `+${got} ${commodityName("parts")}` : `hold full, nothing to gain`;
      return {
        collect: `${gain}, or a hazard: −${SALVAGE_TRAP_DAMAGE} hull${lethalIf(s, SALVAGE_TRAP_DAMAGE)}`,
      };
    }
    case "engine": {
      const burn = engineBurn(s);
      const strain = engineHullStrain(s);
      const parts: string[] = [];
      if (burn > 0) parts.push(`−${burn} fuel`);
      if (strain > 0) parts.push(`−${strain} hull${lethalIf(s, strain)}`);
      return { ack: parts.join(", ") };
    }
    case "derelict":
      return {
        board: `could hold ~${derelictReward(s.day)}cr, or a trap: −${DERELICT_TRAP_DAMAGE} hull${lethalIf(s, DERELICT_TRAP_DAMAGE)}`,
      };
```

(`customs` and `default` are unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/engine/preview.test.ts`
Expected: PASS (existing stake tests use full hull, so no marker leaks into them; if any existing assertion uses exact-match on a stake string at low hull, update it to `toContain`).

- [ ] **Step 5: Commit**

```bash
git add src/engine/preview.ts tests/engine/preview.test.ts
git commit -m "feat(engine): mark event stakes that could destroy the ship"
```

---

### Task 8: UI integration — end screen, Day N/12, Retire button, share

**Files:**

- Modify: `src/engine/game.ts` (goal-line copy), `src/ui/screens.ts`, `src/ui/render.ts`, `src/main.ts`
- Test: `tests/ui/screens.test.ts`, `tests/engine/game.test.ts`

- [ ] **Step 1: Update the goal line + its test**

The intro log still promises "Score = your peak fortune", which E0-2 made false. In `src/engine/game.ts` (`createGame`), replace the log line with:

```ts
    log: [
      `The Syndicate staked your ship — ${STARTING.debt.toLocaleString()}cr, compounding. Bank your fortune before the Day ${RUN_LENGTH} audit. Everyone flies today's sky.`,
    ],
```

In `tests/engine/game.test.ts`, update the goal-line test:

```ts
describe("createGame goal line", () => {
  it("opens the log by stating the stake, the deadline, and the shared sky", () => {
    expect(createGame(42).log[0]).toBe(
      "The Syndicate staked your ship — 1,500cr, compounding. Bank your fortune before the Day 12 audit. Everyone flies today's sky."
    );
  });
});
```

- [ ] **Step 2: Write the failing screen tests**

In `tests/ui/screens.test.ts`:

Update the day-identity tests (~line 113):

```ts
describe("stationScreen day identity", () => {
  it("shows the bounded day counter beside the date", () => {
    const html = stationScreen(createGame(42), [], "Jul 20");
    expect(html).toContain("Terra Hub · Day 1/12 · Jul 20");
  });

  it("omits the date segment when no label is given", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain("Terra Hub · Day 1/12</p>");
  });
});
```

Replace the two `runEndScreen` describe blocks ("wraps the run-end…" it-case and "run-end cause of death") with (add imports at the top of the file: `retire` from game, `endRun` from `../../src/engine/run-end`):

```ts
describe("runEndScreen (E0-1/E0-2)", () => {
  it("renders a retired run with breakdown, share, and restart hooks", () => {
    // credits 2000, debt 1500, day 1 → net worth 500, bonus 50, score 550 (no locale separators).
    const s = retire({ ...createGame(42), credits: 2000 });
    const html = runEndScreen(s, s.runEnd!);
    expect(html).toContain("st-panel--chamfer");
    expect(html).toContain("<h1>Retired</h1>");
    expect(html).toContain("Retired at Terra Hub — the Syndicate banks your score.");
    expect(html).toContain("Survival bonus");
    expect(html).toContain("Score: 550");
    expect(html).toContain('data-act="share"');
    expect(html).toContain('data-act="restart"');
    expect(html).not.toContain("Seed #");
  });

  it("headlines an audited run", () => {
    const s = endRun({ ...createGame(42), day: 12 }, "audited", "Day 12 — audited.");
    expect(runEndScreen(s, s.runEnd!)).toContain("<h1>Audited</h1>");
  });

  it("headlines a hull breach as Ship Destroyed and forfeits the bonus", () => {
    const s = endRun(
      { ...createGame(42), hull: 0 },
      "lost",
      "Hull breach — your ship broke apart."
    );
    const html = runEndScreen(s, s.runEnd!);
    expect(html).toContain("<h1>Ship Destroyed</h1>");
    expect(html).toContain("forfeited");
    expect(html).toContain("Hull breach — your ship broke apart.");
  });

  it("headlines a stranding as Stranded", () => {
    const s = checkLoss({ ...createGame(42), location: "vulcan" as const, fuel: 0, credits: 0 });
    expect(runEndScreen(s, s.runEnd!)).toContain("<h1>Stranded</h1>");
  });
});

describe("retire button (E0-1)", () => {
  it("offers Retire at dock", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain('data-act="retire"');
    expect(html).not.toContain('data-act="retireConfirm"');
  });

  it("shows the confirm step when armed", () => {
    const html = stationScreen(createGame(42), [], "", true);
    expect(html).toContain('data-act="retireConfirm"');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/ui/screens.test.ts tests/engine/game.test.ts`
Expected: FAIL — old signature, old copy, no retire button.

- [ ] **Step 4: Implement `screens.ts`**

In `src/ui/screens.ts`:

Add imports: `RunEnd` to the types import; `RUN_LENGTH` from `../engine/run-end`.

In `screenHead`, change the sub line to:

```ts
    <p class="screen-head__sub">${NODES[s.location].name} · Day ${s.day}/${RUN_LENGTH}${dateLabel ? ` · ${dateLabel}` : ""}</p>
```

In `logisticsPanel`, change the Day row to:

```ts
    ${kv("Day", `${s.day}/${RUN_LENGTH}`)}
```

Give `logisticsPanel` a third parameter and the retire control. Change its signature and append a retire row after the docking-fee line:

```ts
function logisticsPanel(s: GameState, fuelClass: string, retireArmed: boolean): string {
```

```ts
    <div class="st-kv"><span class="st-kv__label">Docking fee here</span><span class="fee st-kv__value st-kv__value--gold st-num">${cr(dockingFee(s.location))}</span></div>
    <hr class="st-divider" />
    ${
      retireArmed
        ? `<button class="st-btn st-btn--sell" data-act="retireConfirm">Retire — sure? This banks your score</button>`
        : `<button class="st-btn st-btn--ghost" data-act="retire">Retire &amp; bank score</button>`
    }`
```

In `stationScreen`, add the parameter and pass it through:

```ts
export function stationScreen(
  s: GameState,
  turnReport: string[] = [],
  dateLabel = "",
  retireArmed = false
): string {
```

and change the logistics call to `${logisticsPanel(s, fuelClass, retireArmed)}`.

Replace `runEndScreen` entirely:

```ts
/** Headline per end state; the two loss causes get their own names. */
function endHeadline(r: RunEnd): string {
  if (r.status === "audited") return "Audited";
  if (r.status === "retired") return "Retired";
  return r.cause.startsWith("Hull breach") ? "Ship Destroyed" : "Stranded";
}

export function runEndScreen(s: GameState, r: RunEnd): string {
  const banked = r.status !== "lost";
  return `<div class="overlay-stage">
    <div class="st-glow-wrap">
      <div class="st-panel st-panel--chamfer"><div class="st-panel__inner">
        <div class="run-end">
          <h1>${endHeadline(r)}</h1>
          <p>You survived ${r.daysSurvived} day${r.daysSurvived === 1 ? "" : "s"}.</p>
          <p class="run-end__cause">${r.cause}</p>
          <div class="run-end__breakdown">
            <div class="st-kv"><span class="st-kv__label">Net worth${banked ? "" : " (cargo lost with the ship)"}</span><span class="st-kv__value st-num">${cr(r.netWorthAtEnd)}</span></div>
            <div class="st-kv"><span class="st-kv__label">Survival bonus</span><span class="st-kv__value st-num">${banked ? `+${r.survivalBonus}` : "forfeited"}</span></div>
            <div class="st-kv"><span class="st-kv__label">Peak net worth</span><span class="st-kv__value st-num">${cr(s.peakNetWorth)}</span></div>
          </div>
          <p class="score st-num">Score: ${r.score.toLocaleString()}</p>
          <button class="st-btn" data-act="share">Copy score card</button>
          <button class="st-btn st-btn--ghost" data-act="restart">New run</button>
        </div>
      </div></div>
    </div>
  </div>`;
}
```

(The old cause-scraping comment and `Seed #` hint are gone.)

- [ ] **Step 5: Implement `render.ts`**

Replace `src/ui/render.ts` with:

```ts
// src/ui/render.ts
import { GameEvent, GameState } from "../engine/types";
import { eventScreen, runEndScreen, stationScreen } from "./screens";

export interface ViewModel {
  state: GameState;
  pendingEvent: GameEvent | null;
  /** Log entries generated during the most recent jump, surfaced as a turn report. */
  turnReport: string[];
  /** UTC date label ("Jul 20") naming today's shared seed. */
  dateLabel: string;
  /** True while the Retire button awaits its confirming second click. */
  retireArmed: boolean;
}

export function render(root: HTMLElement, vm: ViewModel): void {
  if (vm.state.runEnd) {
    root.innerHTML = runEndScreen(vm.state, vm.state.runEnd);
  } else if (vm.pendingEvent) {
    root.innerHTML = eventScreen(vm.state, vm.pendingEvent);
  } else {
    root.innerHTML = stationScreen(vm.state, vm.turnReport, vm.dateLabel, vm.retireArmed);
  }
}
```

- [ ] **Step 6: Implement `main.ts`**

In `src/main.ts`:

- Add `retire` to the `./engine/game` import list; **remove** the `import { score as scoreFn } from "./engine/economy";` line.
- Add state next to `pendingEvent`:

```ts
// Two-click retire confirm: armed by "retire", consumed by "retireConfirm",
// disarmed by any other action (including a re-render for an unrelated click).
let retireArmed = false;
```

- Update `paint()`:

```ts
function paint() {
  render(app, { state, pendingEvent, turnReport, dateLabel: dateLabelOf(state), retireArmed });
}
```

- Add cases to `applyAction` (before `restart`):

```ts
    case "retire":
      retireArmed = true;
      break;
    case "retireConfirm":
      state = retire(state);
      break;
```

- In the click handler, disarm on any other action. After `turnReport = [];` add:

```ts
if (act !== "retire") retireArmed = false;
```

- Replace the share branch:

```ts
if (act === "share") {
  if (state.runEnd) {
    await copyShare({
      dateLabel: dateLabelOf(state),
      score: state.runEnd.score,
      daysSurvived: state.runEnd.daysSurvived,
    });
  }
} else {
  applyAction(act, id, qty);
}
```

(`restart` needs no change: `bootDailyGame()` has no `runEnd`, and the disarm line above resets the confirm.)

- [ ] **Step 7: Run the suite**

Run: `npm test`
Expected: PASS except `tests/sim/simulate.test.ts` (still imports `score` from economy — untouched until Task 9; if it currently passes, fine — `economy.score` still exists).

- [ ] **Step 8: Commit**

```bash
git add src/engine/game.ts src/ui/screens.ts src/ui/render.ts src/main.ts tests/ui/screens.test.ts tests/engine/game.test.ts
git commit -m "feat(ui): per-status end screen, Day N/12, retire confirm, share from RunEnd"
```

---

### Task 9: Sim rework + balance sweep (delete `economy.score`)

**Files:**

- Modify: `src/sim/simulate.ts`, `src/engine/economy.ts`
- Test: `tests/sim/simulate.test.ts` (rewrite), `tests/engine/economy.test.ts` (drop score test)

- [ ] **Step 1: Rewrite the balance tests (failing first)**

Replace `tests/sim/simulate.test.ts` entirely:

```ts
import { describe, it, expect } from "vitest";
import { Archetype, runArchetype } from "../../src/sim/simulate";

const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);
const ALL: Archetype[] = ["cautious", "balanced", "greedy"];

describe("bounded-run balance sweep (E0-1 acceptance)", () => {
  it("every run ends by day 12 — no archetype outlives the audit", () => {
    for (const kind of ALL) {
      for (const seed of SEEDS) {
        const r = runArchetype(kind, seed);
        expect(r.status, `${kind} seed ${seed}`).not.toBe("playing");
        expect(r.daysSurvived, `${kind} seed ${seed}`).toBeLessThanOrEqual(12);
      }
    }
  });

  it("at least 95% of cautious and balanced runs reach the audit alive", () => {
    for (const kind of ["cautious", "balanced"] as Archetype[]) {
      const audited = SEEDS.filter((s) => runArchetype(kind, s).status === "audited").length;
      expect(audited, kind).toBeGreaterThanOrEqual(95);
    }
  });

  it("greedy death rate before day 12 lands between 10% and 40%", () => {
    const dead = SEEDS.filter((s) => runArchetype("greedy", s).status === "lost").length;
    expect(dead).toBeGreaterThanOrEqual(10);
    expect(dead).toBeLessThanOrEqual(40);
  });

  it("greedy outearns cautious across the sweep (spread is not inverted)", () => {
    let greedy = 0;
    let cautious = 0;
    for (const seed of SEEDS) {
      greedy += runArchetype("greedy", seed).peakNetWorth;
      cautious += runArchetype("cautious", seed).peakNetWorth;
    }
    expect(greedy).toBeGreaterThan(cautious);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/sim/simulate.test.ts`
Expected: FAIL — `runArchetype` still takes `maxDays`; runs never audit (sim never calls `arrive`).

- [ ] **Step 3: Rewrite `simulate.ts`**

Replace `src/sim/simulate.ts` with:

```ts
// src/sim/simulate.ts
import { CommodityId, GameState, NodeId } from "../engine/types";
import {
  arrive,
  buy,
  checkLoss,
  createGame,
  jump,
  refuel,
  repair,
  resolveChoice,
  sell,
} from "../engine/game";
import { NODE_IDS, fuelCost, getPrice } from "../engine/world";

export type Archetype = "cautious" | "balanced" | "greedy";

export interface SimResult {
  daysSurvived: number;
  peakNetWorth: number;
  score: number;
  status: GameState["status"];
}

/** Pick the destination + commodity that maximizes naive expected margin this turn. */
function bestTrade(
  s: GameState,
  candidates: CommodityId[]
): { to: NodeId; id: CommodityId } | null {
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

/** One full bounded run; the engine ends it by audit, stranding, or hull breach. */
export function runArchetype(kind: Archetype, seed: number): SimResult {
  let s = createGame(seed);
  const candidates: CommodityId[] =
    kind === "cautious"
      ? ["water"]
      : kind === "balanced"
        ? ["water", "parts"]
        : ["water", "parts", "luxury"];

  while (s.status === "playing") {
    // Top up fuel modestly each turn; careful personas also maintain the hull now
    // that hull 0 destroys the ship (B-6). Greedy gambles it, in persona.
    s = refuel(s, 6);
    if (kind !== "greedy" && s.hull < 50) s = repair(s, 30);

    const pick = bestTrade(s, candidates);
    if (!pick) {
      s = checkLoss(s);
      if (s.status !== "playing") break;
      // Cannot act — force a cheap jump to advance and accrue costs.
      const to = NODE_IDS.filter((n) => n !== s.location).sort(
        (a, b) => fuelCost(s.location, a) - fuelCost(s.location, b)
      )[0];
      const r = jump(s, to);
      if (r.event === null) break;
      s = resolveChoice(r.state, r.event, r.event.choices[0].id);
      s = arrive(s).state;
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
    const choice = chooseEventOption(
      kind,
      r.event.choices.map((c) => c.id)
    );
    s = resolveChoice(r.state, r.event, choice);
    // arrive() settles deliveries, banks the Day-12 audit, and runs the loss check.
    s = arrive(s).state;
    if (s.status !== "playing") break;

    // Sell everything we can at the new location.
    (["water", "parts", "luxury"] as CommodityId[]).forEach((id) => {
      if (s.cargo[id] > 0) s = sell(s, id, s.cargo[id]);
    });
    s = checkLoss(s);
  }

  return {
    daysSurvived: s.runEnd?.daysSurvived ?? Math.min(s.day, 12),
    peakNetWorth: s.peakNetWorth,
    score: s.runEnd?.score ?? 0,
    status: s.status,
  };
}

function chooseEventOption(kind: Archetype, ids: string[]): string {
  if (ids.includes("pay") && kind === "cautious") return "pay";
  if (ids.includes("flee") && kind !== "cautious") return "flee";
  // Salvage and derelict both stake hull on a gamble; only the greedy archetype takes
  // it. Cautious/balanced pick the safe option so the sim measures a real persona split
  // rather than every archetype quietly gambling hull via the fall-through.
  if (ids.includes("collect")) return kind === "greedy" ? "collect" : "ignore";
  if (ids.includes("board")) return kind === "greedy" ? "board" : "leave";
  if (ids.includes("comply")) return "comply";
  return ids[0];
}
```

- [ ] **Step 4: Delete `economy.score` and its test**

In `src/engine/economy.ts`, delete the `score` function (lines defining `export function score(...)`).
In `tests/engine/economy.test.ts`, delete the `score` import and the "score rewards both peak net worth and days survived" test.

- [ ] **Step 5: Run the sweep and tune into the band**

Run: `npm test -- tests/sim/simulate.test.ts`

The death-rate band (10–40% greedy, ≥95% cautious/balanced audited) is empirical — the first run tells you where reality landed. If assertions fail, tune in this order and re-run (each knob is one line):

1. **Greedy too deadly (>40%)**: in `simulate.ts`, let greedy repair when desperate — change the repair line to `if (s.hull < (kind === "greedy" ? 25 : 50)) s = repair(s, 30);`
2. **Greedy too safe (<10%)**: raise `DERELICT_TRAP_DAMAGE` in `src/engine/preview.ts` from 20 to 25 (its label/preview updates automatically; the game.test derelict-kill test uses hull 20, still lethal). If any existing `tests/engine/preview.test.ts` assertion exact-matches a "−20 hull" stake string, update it to the new number.
3. **Cautious/balanced dying (<95% audited)**: raise their repair threshold from `< 50` to `< 70`.

Record the final sweep numbers (audited %, death %) in the commit message. If the band cannot be reached with these knobs, stop and surface the numbers for a human decision — do not silently widen the asserted band.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — everything.

- [ ] **Step 7: Commit**

```bash
git add src/sim/simulate.ts src/engine/economy.ts tests/sim/simulate.test.ts tests/engine/economy.test.ts
git commit -m "feat(sim): bounded-run sweep asserts E0-1 death-rate bands; drop legacy score()"
```

---

### Task 10: Final verification

**Files:** none new.

- [ ] **Step 1: Full suite + typecheck/build**

Run: `npm test`
Expected: PASS, 0 failures.

Run: `npm run build`
Expected: `tsc` clean (this catches any stale `score`/`LOAN_RATE` import the per-file test runner missed), Vite build succeeds.

- [ ] **Step 2: Manual smoke test in the preview browser**

Start the dev server (Claude: `preview_start` with a `.claude/launch.json` entry running `npm run dev`; humans: `npm run dev`) and verify:

- Header reads "Day 1/12".
- Logistics panel shows the "Retire & bank score" button; first click arms it ("Retire — sure?"), clicking elsewhere disarms, second click ends the run on the Retired screen with a score breakdown.
- Play to a hull death (or force one via low hull + flee) — "Ship Destroyed" screen, bonus "forfeited".
- Reach day 12 — "Audited" screen appears after the 11th jump resolves.
- "Copy score card" works from each end screen (score matches the breakdown).

- [ ] **Step 3: Update the tracking docs**

In `docs/ROADMAP.md`, Milestone 1 table: annotate E0-1, E0-2, E0-4, B-6 as shipped (match the existing "Already shipped" style). In `docs/ENGAGEMENT_BACKLOG.md`, prefix the B-6 row's Issue text with "**Fixed —**" as B-1/B-3 do, and note under §4.1 that E0-1/E0-2/E0-4 shipped on 2026-07-21 (leave E0-3 open).

- [ ] **Step 4: Commit**

```bash
git add docs/ROADMAP.md docs/ENGAGEMENT_BACKLOG.md
git commit -m "docs(planning): mark E0-1/E0-2/E0-4/B-6 shipped in roadmap + backlog"
```

---

## Spec coverage map

| Spec section                                                                              | Tasks           |
| :---------------------------------------------------------------------------------------- | :-------------- |
| §1 End-state model (`RunEnd`, `run-end.ts`, delete `economy.score`, cause-scrape removal) | 1, 8, 9         |
| §2 Audit + Retire (RUN_LENGTH, audit-beats-stranding, `retire()`, guards, Day N/12)       | 2, 3, 4, 8      |
| §3 Hull death (all four sites, in-transit skip, lethal preview marker)                    | 5, 7            |
| §4 Scoring (formulas, bonus constant as tunable knob)                                     | 1, 9            |
| §5 Loan escalation (4/6/8%, Syndicate voice)                                              | 6               |
| §6 UI (retire confirm, per-status end screen, statbar day, share from runEnd)             | 8               |
| §7 Sim & tests (arrive in sim, 100-seed bands, suite updates)                             | 2–9, sweep in 9 |
| Error handling (no-op guards, hull floor at 0)                                            | 2, 3, 5         |
