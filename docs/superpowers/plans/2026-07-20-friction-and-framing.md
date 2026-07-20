# Friction & Framing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship engagement quick wins 2–4 (goal-line intro, cause-of-death line, share-card date+URL) plus UIUX P1-1 (×5/Max trade buttons + contract shortfall shortcut), resolving bug B-4 behaviorally.

**Architecture:** UI-computed explicit quantities — the engine's strict `buy`/`sell` validators stay untouched; buttons carry exact `data-qty` numbers and labels promise exactly what a click delivers (the shipped B-1 refuel-honesty precedent). A UTC `dateLabel` is computed once in main.ts beside the existing `dailySeed(new Date())` call and threaded through the render `ViewModel`, so screens stay pure string functions.

**Tech Stack:** Vanilla TypeScript + Vite, vitest (string-level UI tests), ESLint + Prettier gates.

**Spec:** [docs/superpowers/specs/2026-07-20-friction-and-framing-design.md](../specs/2026-07-20-friction-and-framing-design.md)

**Branch:** create `feat/friction-and-framing` off `master` before Task 1 (worktree optional via superpowers:using-git-worktrees).

**Commands** (from repo root):

- Tests: `npm test` (vitest run) — suite currently green at 78 tests.
- Single file: `npx vitest run tests/ui/screens.test.ts`
- Lint / format / typecheck+build: `npm run lint` / `npm run format:check` / `npm run build`

---

## File map

| File                                            | Change                                                                                         |
| :---------------------------------------------- | :--------------------------------------------------------------------------------------------- |
| `src/ui/share.ts`                               | `GAME_URL` constant, `formatDateLabel`, `ShareData.seed` → `dateLabel`                         |
| `src/engine/game.ts`                            | intro log copy (line 52), stranding message (line 192)                                         |
| `src/ui/screens.ts`                             | dated `screenHead`, `runEndScreen` cause line, market qty buttons, contract shortfall shortcut |
| `src/ui/render.ts`                              | `ViewModel.dateLabel`, pass to `stationScreen`                                                 |
| `src/main.ts`                                   | `bootDate`, share call site, `data-qty` plumbing                                               |
| `src/ui/design-system.css`                      | `.st-market__actions` wrap (line 342)                                                          |
| `src/ui/styles.css`                             | `.run-end__cause` style                                                                        |
| `tests/engine/share.test.ts`                    | rewritten for new card                                                                         |
| `tests/engine/game.test.ts`                     | intro copy + stranding message tests                                                           |
| `tests/ui/screens.test.ts`                      | date header, cause line, qty buttons, shortfall shortcut; 2 updated assertions                 |
| `docs/ENGAGEMENT_BACKLOG.md`, `docs/BACKLOG.md` | bookkeeping                                                                                    |

---

### Task 1: Share card date + URL (quick win 4)

**Files:**

- Modify: `src/ui/share.ts`
- Modify: `src/main.ts:27` (boot date), `src/main.ts:81-85` (restart), `src/main.ts:99-104` (share call)
- Test: `tests/engine/share.test.ts`

- [ ] **Step 1: Rewrite the share tests (failing)**

Replace the full contents of `tests/engine/share.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { GAME_URL, formatDateLabel, shareText } from "../../src/ui/share";

describe("shareText", () => {
  it("includes the score, day count, date, and game URL", () => {
    const txt = shareText({ dateLabel: "Jul 20", score: 84210, daysSurvived: 12 });
    expect(txt).toContain("84210");
    expect(txt).toContain("12");
    expect(txt).toContain("Jul 20");
    expect(txt).toContain(GAME_URL);
  });

  it("no longer exposes a raw seed integer", () => {
    const txt = shareText({ dateLabel: "Jul 20", score: 100, daysSurvived: 1 });
    expect(txt).not.toContain("Seed #");
  });

  it("is a single shareable blurb with the game name", () => {
    const txt = shareText({ dateLabel: "Jul 20", score: 100, daysSurvived: 1 });
    expect(txt.toLowerCase()).toContain("starlight traders");
  });
});

describe("formatDateLabel", () => {
  it("names the UTC calendar day — the same day dailySeed hashes", () => {
    // 23:30 UTC is still Jul 20 in UTC even when local time has rolled over.
    expect(formatDateLabel(new Date(Date.UTC(2026, 6, 20, 23, 30)))).toBe("Jul 20");
    expect(formatDateLabel(new Date(Date.UTC(2026, 0, 1)))).toBe("Jan 1");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/engine/share.test.ts`
Expected: FAIL — `GAME_URL`/`formatDateLabel` not exported; `dateLabel` not in `ShareData`.

- [ ] **Step 3: Implement share.ts**

Replace the full contents of `src/ui/share.ts`:

```ts
// src/ui/share.ts

/** Public home of the game — the share card's call to action. Swap once an itch.io page exists. */
export const GAME_URL = "https://github.com/shmoula/starlight-traders";

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** UTC month-day label ("Jul 20") — names the same calendar day dailySeed hashes. */
export function formatDateLabel(date: Date): string {
  return DATE_FMT.format(date);
}

export interface ShareData {
  dateLabel: string;
  score: number;
  daysSurvived: number;
}

export function shareText(d: ShareData): string {
  return [
    `🚀 Starlight Traders — ${d.dateLabel}`,
    `Score ${d.score} · survived ${d.daysSurvived} days`,
    `Beat my run: ${GAME_URL}`,
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

- [ ] **Step 4: Update the main.ts call site**

In `src/main.ts`, import `formatDateLabel` (line 20):

```ts
import { copyShare, formatDateLabel } from "./ui/share";
```

Replace line 27 (`let state: GameState = createGame(dailySeed(new Date()));`) with a tracked boot date, so the seed and every date label always name the same day — including after a restart across UTC midnight:

```ts
let bootDate = new Date();
let state: GameState = createGame(dailySeed(bootDate));
```

In `applyAction`, update the restart case (lines 81–85):

```ts
    case "restart": {
      bootDate = new Date();
      state = createGame(dailySeed(bootDate));
      pendingEvent = null;
      break;
    }
```

In the click listener, update the share call (lines 100–104):

```ts
await copyShare({
  dateLabel: formatDateLabel(bootDate),
  score: scoreFn(state.peakNetWorth, state.day),
  daysSurvived: state.day,
});
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/engine/share.test.ts` → PASS (4 tests)
Run: `npm run build` → compiles clean (tsc runs first).

- [ ] **Step 6: Commit**

```bash
git add src/ui/share.ts src/main.ts tests/engine/share.test.ts
git commit -m "feat(ui): share card names the date and links the game, drops raw seed"
```

---

### Task 2: Goal-line intro copy (quick win 2a)

**Files:**

- Modify: `src/engine/game.ts:52`
- Test: `tests/engine/game.test.ts`, `tests/ui/screens.test.ts:108` (existing assertion)

- [ ] **Step 1: Write the failing engine test**

In `tests/engine/game.test.ts`, inside the existing `describe` for game creation (or top level if none fits), add:

```ts
describe("createGame goal line", () => {
  it("opens the log by stating the stake, the objective, and the shared sky", () => {
    expect(createGame(42).log[0]).toBe(
      "The Syndicate staked your ship — 1,500cr, compounding. Score = your peak fortune. Everyone flies today's sky."
    );
  });
});
```

- [ ] **Step 2: Update the ship's-log UI assertion**

In `tests/ui/screens.test.ts` line 108, the "renders a titled, labelled log section" test asserts the old copy. Change:

```ts
expect(html).toContain("You launch from Terra Hub");
```

to:

```ts
expect(html).toContain("The Syndicate staked your ship");
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/engine/game.test.ts tests/ui/screens.test.ts`
Expected: FAIL — both new assertions (old copy still in `createGame`).

- [ ] **Step 4: Implement the copy change**

In `src/engine/game.ts` line 52, replace:

```ts
    log: ["You launch from Terra Hub, 1500 credits in debt. Make it count."],
```

with:

```ts
    log: [
      "The Syndicate staked your ship — 1,500cr, compounding. Score = your peak fortune. Everyone flies today's sky.",
    ],
```

(Note: E0-1/E0-2 will revise "peak fortune" when the scoring formula changes — accepted follow-up per the spec.)

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/engine/game.test.ts tests/ui/screens.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/game.ts tests/engine/game.test.ts tests/ui/screens.test.ts
git commit -m "feat(engine): intro log states the stake, the score goal, and the shared daily sky"
```

---

### Task 3: Stranding cause message (quick win 3a — engine half)

**Files:**

- Modify: `src/engine/game.ts:192` (`checkLoss`)
- Test: `tests/engine/game.test.ts:171-181` (existing `checkLoss` describe)

- [ ] **Step 1: Write the failing test**

In `tests/engine/game.test.ts`, add to the existing `describe("checkLoss", ...)` block:

```ts
it("names the station and cause in the stranding log line", () => {
  const s = {
    ...createGame(42),
    location: "vulcan" as const,
    fuel: 0,
    credits: 0,
    cargo: { water: 0, parts: 0, luxury: 0 },
  };
  const lost = checkLoss(s);
  expect(lost.status).toBe("lost");
  expect(lost.log[lost.log.length - 1]).toBe(
    "Stranded at Vulcan Yards — out of fuel, out of credits."
  );
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/engine/game.test.ts`
Expected: FAIL — message is still "Stranded and broke. The run ends here."

- [ ] **Step 3: Implement**

In `src/engine/game.ts` `checkLoss` (line 192), replace:

```ts
return withLog({ ...state, status: "lost" }, "Stranded and broke. The run ends here.");
```

with:

```ts
return withLog(
  { ...state, status: "lost" },
  `Stranded at ${NODES[state.location].name} — out of fuel, out of credits.`
);
```

(`NODES` is already imported in game.ts.)

- [ ] **Step 4: Run tests**

Run: `npm test` → full suite PASS (no other test asserts the old message — verified by grep).

- [ ] **Step 5: Commit**

```bash
git add src/engine/game.ts tests/engine/game.test.ts
git commit -m "feat(engine): stranding log names the station and the cause of death"
```

---

### Task 4: Dated header (quick win 2b)

**Files:**

- Modify: `src/ui/screens.ts:45-50` (`screenHead`), `src/ui/screens.ts:250` (`stationScreen` signature)
- Modify: `src/ui/render.ts`
- Modify: `src/main.ts:34-36` (`paint`)
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/ui/screens.test.ts`:

```ts
describe("stationScreen day identity (quick win 2)", () => {
  it("shows the date beside the day counter", () => {
    const html = stationScreen(createGame(42), [], "Jul 20");
    expect(html).toContain("Terra Hub · Day 1 · Jul 20");
  });

  it("omits the date segment when no label is given", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain("Terra Hub · Day 1</p>");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/ui/screens.test.ts`
Expected: FAIL — `stationScreen` has no third parameter; date never rendered.

- [ ] **Step 3: Implement**

In `src/ui/screens.ts`, change `screenHead` (lines 45–50) to:

```ts
function screenHead(s: GameState, dateLabel = ""): string {
  return `<header class="screen-head">
    <h1 class="st-screen-title">Starlight Traders</h1>
    <p class="screen-head__sub">${NODES[s.location].name} · Day ${s.day}${dateLabel ? ` · ${dateLabel}` : ""}</p>
  </header>`;
}
```

Change the `stationScreen` signature (line 250) and its `screenHead` call:

```ts
export function stationScreen(s: GameState, turnReport: string[] = [], dateLabel = ""): string {
```

```ts
    ${screenHead(s, dateLabel)}
```

(The default `""` keeps every existing call site and test valid.)

In `src/ui/render.ts`, add the field and pass it through:

```ts
export interface ViewModel {
  state: GameState;
  pendingEvent: GameEvent | null;
  /** Log entries generated during the most recent jump, surfaced as a turn report. */
  turnReport: string[];
  /** UTC date label ("Jul 20") naming today's shared seed. */
  dateLabel: string;
}
```

```ts
root.innerHTML = stationScreen(vm.state, vm.turnReport, vm.dateLabel);
```

In `src/main.ts`, update `paint` (lines 34–36):

```ts
function paint() {
  render(app, { state, pendingEvent, turnReport, dateLabel: formatDateLabel(bootDate) });
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/ui/screens.test.ts` → PASS.
Run: `npm run build` → compiles clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens.ts src/ui/render.ts src/main.ts tests/ui/screens.test.ts
git commit -m "feat(ui): header names the calendar day of the shared seed"
```

---

### Task 5: End-screen cause line (quick win 3b — UI half)

**Files:**

- Modify: `src/ui/screens.ts:309-324` (`runEndScreen`)
- Modify: `src/ui/styles.css` (append near the existing `.run-end` rules — grep `.run-end`)
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `checkLoss` to the game imports at the top of `tests/ui/screens.test.ts`:

```ts
import { createGame, missionsHere, refuel, checkLoss } from "../../src/engine/game";
```

Add:

```ts
describe("run-end cause of death (quick win 3)", () => {
  it("shows the final log line as the cause when the run is lost", () => {
    const s = checkLoss({ ...createGame(42), location: "vulcan" as const, fuel: 0, credits: 0 });
    const html = runEndScreen(s, 0);
    expect(html).toContain('class="run-end__cause"');
    expect(html).toContain("Stranded at Vulcan Yards — out of fuel, out of credits.");
  });

  it("omits the cause line while the run is not lost", () => {
    const html = runEndScreen(createGame(42), 999);
    expect(html).not.toContain("run-end__cause");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/ui/screens.test.ts`
Expected: FAIL — no `run-end__cause` in output.

- [ ] **Step 3: Implement**

In `src/ui/screens.ts`, change `runEndScreen` (lines 309–324) to:

```ts
export function runEndScreen(s: GameState, score: number): string {
  // checkLoss is the only site that sets status "lost", and it appends the cause
  // message in the same call — so on a lost run the newest log entry names what
  // ended it. Guarded by status so future non-lost end states never mislabel.
  const cause = s.status === "lost" ? (s.log[s.log.length - 1] ?? "") : "";
  return `<div class="overlay-stage">
    <div class="st-glow-wrap">
      <div class="st-panel st-panel--chamfer"><div class="st-panel__inner">
        <div class="run-end">
          <h1>Run Over</h1>
          <p>You survived ${s.day} days.</p>
          ${cause ? `<p class="run-end__cause">${cause}</p>` : ""}
          <p class="score st-num">Score: ${score.toLocaleString()}</p>
          <p class="hint">Seed #${s.seed}</p>
          <button class="st-btn" data-act="share">Copy score card</button>
          <button class="st-btn st-btn--ghost" data-act="restart">New run</button>
        </div>
      </div></div>
    </div>
  </div>`;
}
```

In `src/ui/styles.css`, append beside the existing `.run-end` rules:

```css
.run-end__cause {
  color: var(--st-text-dim);
  font-style: italic;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/ui/screens.test.ts` → PASS (including the untouched "wraps the run-end in a chamfered card" test — its fixture is not lost, so no cause line appears).

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens.ts src/ui/styles.css tests/ui/screens.test.ts
git commit -m "feat(ui): end screen names the cause of death"
```

---

### Task 6: ×5 / Max market buttons (P1-1 core)

**Files:**

- Modify: `src/ui/screens.ts:178-196` (`tradeHubPanel` market rows), imports at `src/ui/screens.ts:4`
- Modify: `src/main.ts:38-46` (`applyAction` qty), `src/main.ts:89-109` (click handler)
- Modify: `src/ui/design-system.css:342` (`.st-market__actions`)
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `getPrice` to the world imports at the top of `tests/ui/screens.test.ts`:

```ts
import { COMMODITIES, NODES, commodityName, getPrice } from "../../src/engine/world";
```

Add:

```ts
describe("market quantity buttons (P1-1)", () => {
  it("renders ×5 and Max buy buttons that pass exact clamped quantities", () => {
    const s = createGame(42);
    const price = getPrice(s.seed, s.day, s.location, "water");
    const maxBuy = Math.min(Math.floor(s.credits / price), s.cargoCapacity);
    const html = stationScreen(s);
    expect(html).toContain(`data-act="buy" data-id="water" data-qty="5"`);
    expect(html).toContain(`data-act="buy" data-id="water" data-qty="${maxBuy}"`);
    expect(html).toContain(`Max ×${maxBuy}`);
  });

  it("disables ×5 buy with a pointer to Max when fewer than 5 are affordable", () => {
    const s = createGame(42);
    const price = getPrice(s.seed, s.day, s.location, "water");
    const html = stationScreen({ ...s, credits: price * 3 });
    expect(html).toContain(
      `data-act="buy" data-id="water" data-qty="5" aria-label="Buy 5 Water / Ice for ${(5 * price).toLocaleString()}cr" disabled title="Can only manage 3 — use Max"`
    );
  });

  it("sell buttons pass the held quantity and All sells everything", () => {
    const s = { ...createGame(42), cargo: { water: 7, parts: 0, luxury: 0 } };
    const html = stationScreen(s);
    expect(html).toContain(`data-act="sell" data-id="water" data-qty="7"`);
    expect(html).toContain("All ×7");
  });

  it("disables ×5 sell when fewer than 5 are held", () => {
    const s = { ...createGame(42), cargo: { water: 3, parts: 0, luxury: 0 } };
    const html = stationScreen(s);
    expect(html).toContain(`disabled title="Only 3 in hold — use All"`);
  });

  it("keeps Max disabled with the standard reason at zero purchasing power", () => {
    const html = stationScreen({ ...createGame(42), credits: 0 });
    expect(html).not.toContain("Max ×");
    expect(html).toContain(`disabled title="Not enough credits"`);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/ui/screens.test.ts`
Expected: FAIL — no `data-qty` attributes rendered.

- [ ] **Step 3: Implement the market row buttons**

In `src/ui/screens.ts`, add `taxOnSale` to the economy import (line 4):

```ts
import {
  REFUEL_PRICE,
  REPAIR_PRICE,
  cargoUsed,
  dockingFee,
  netWorth,
  taxOnSale,
} from "../engine/economy";
```

Replace the `marketRows` map body in `tradeHubPanel` (lines 179–196) with:

```ts
const marketRows = COMMODITIES.map((c) => {
  const price = getPrice(s.seed, s.day, s.location, c.id);
  const held = s.cargo[c.id];
  const room = s.cargoCapacity - cargoUsed(s.cargo);
  const cantAfford = price > s.credits;
  const holdFull = room < 1;
  const buyDisabled = cantAfford || holdFull;
  const buyTitle = cantAfford ? "Not enough credits" : "Cargo hold full";
  // Exact clamped quantities: the button promises precisely what the engine
  // will do, so an enabled click never silently no-ops (B-1 precedent).
  const maxBuy = Math.max(0, Math.min(Math.floor(s.credits / price), room));
  const buy5Disabled = maxBuy < 5;
  const buy5Title = buyDisabled ? buyTitle : `Can only manage ${maxBuy} — use Max`;
  const maxBuyAttrs = buyDisabled
    ? disabledAttr(true, buyTitle)
    : ` title="Buy ${maxBuy} for ${cr(maxBuy * price)}"`;
  const sellNet = (n: number): number => {
    const gross = n * price;
    return gross - taxOnSale(s.location, gross);
  };
  const sellDisabled = held < 1;
  const sell5Disabled = held < 5;
  const sell5Title = sellDisabled ? "None in hold" : `Only ${held} in hold — use All`;
  const sellAllAttrs = sellDisabled
    ? disabledAttr(true, "None in hold")
    : ` title="Sell ${held} for ${cr(sellNet(held))}"`;
  return `<div class="st-market__row" role="group" aria-label="${c.name}">
      ${iconBox(c.id)}
      <span class="st-market__name">${c.name}</span>
      <span class="st-market__prices st-num" aria-label="Market price ${price} credits"><span class="st-market__buy-price">${cr(price)}</span></span>
      <span class="st-market__held st-num" aria-label="${held} units held">×${held}</span>
      <span class="st-market__actions">
        <button class="st-btn st-btn--sm" data-act="buy" data-id="${c.id}" data-qty="1" aria-label="Buy 1 ${c.name}"${disabledAttr(buyDisabled, buyTitle)}>Buy 1</button>
        <button class="st-btn st-btn--sm" data-act="buy" data-id="${c.id}" data-qty="5" aria-label="Buy 5 ${c.name} for ${cr(5 * price)}"${disabledAttr(buy5Disabled, buy5Title)}>×5</button>
        <button class="st-btn st-btn--sm" data-act="buy" data-id="${c.id}" data-qty="${maxBuy}" aria-label="Buy ${maxBuy} ${c.name} for ${cr(maxBuy * price)}"${maxBuyAttrs}>Max${maxBuy > 0 ? ` ×${maxBuy}` : ""}</button>
        <button class="st-btn st-btn--sell st-btn--sm" data-act="sell" data-id="${c.id}" data-qty="1" aria-label="Sell 1 ${c.name}"${disabledAttr(sellDisabled, "None in hold")}>Sell 1</button>
        <button class="st-btn st-btn--sell st-btn--sm" data-act="sell" data-id="${c.id}" data-qty="5" aria-label="Sell 5 ${c.name} for ${cr(sellNet(5))}"${disabledAttr(sell5Disabled, sell5Title)}>×5</button>
        <button class="st-btn st-btn--sell st-btn--sm" data-act="sell" data-id="${c.id}" data-qty="${held}" aria-label="Sell all ${held} ${c.name} for ${cr(sellNet(held))}"${sellAllAttrs}>All${held > 0 ? ` ×${held}` : ""}</button>
      </span>
    </div>`;
}).join("");
```

(Behavior notes: `holdFull` is the existing `cargoUsed + 1 > capacity` check restated as `room < 1`; `maxBuy` mirrors the engine's `buy` validation one-for-one — price, credits, hold room. Sell tooltips show net-of-tax proceeds so Meridian's 18% never surprises.)

- [ ] **Step 4: Plumb data-qty through main.ts**

In `src/main.ts`, change `applyAction`'s signature and the buy/sell cases (lines 38–46):

```ts
function applyAction(act: string | undefined, id: string | undefined, qty: number) {
  switch (act) {
    case "buy":
      state = buy(state, id as CommodityId, qty);
      break;
    case "sell":
      state = sell(state, id as CommodityId, qty);
      break;
```

In the click listener, parse the quantity and pass it (the `applyAction(act, id)` call becomes):

```ts
// data-qty carries the exact clamped quantity computed by the renderer;
// absent/garbage values fall back to 1 (Number("") → 0, Number("x") → NaN).
const qty = Math.max(1, Math.floor(Number(btn.dataset.qty ?? "1")) || 1);
```

```ts
applyAction(act, id, qty);
```

- [ ] **Step 5: Let the actions cell wrap**

In `src/ui/design-system.css` line 342, change `.st-market__actions` to:

```css
.st-market__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--st-space-2);
  justify-content: flex-end;
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run tests/ui/screens.test.ts` → PASS, including the pre-existing `aria-label="Buy 1 ${c.name}"` accessibility test (label text unchanged).
Run: `npm run build` → compiles clean.

- [ ] **Step 7: Commit**

```bash
git add src/ui/screens.ts src/main.ts src/ui/design-system.css tests/ui/screens.test.ts
git commit -m "feat(ui): ×5/Max/All trade buttons with exact clamped quantities (P1-1, fixes B-4)"
```

---

### Task 7: Contract shortfall shortcut (P1-1 contract half)

**Files:**

- Modify: `src/ui/screens.ts:209-230` (`tradeHubPanel` active-missions map)
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/ui/screens.test.ts` (reuses the existing `withMission` helper at the top of the file):

```ts
describe("active contract shortfall shortcut (P1-1)", () => {
  const mission: Mission = {
    id: "m2",
    commodity: "water",
    qty: 10,
    destination: "verge",
    reward: 500,
    deadlineDay: 30,
  };

  it("offers a one-click buy of the missing units at the local price", () => {
    const s = withMission(mission, { cargo: { water: 3, parts: 0, luxury: 0 } });
    const price = getPrice(s.seed, s.day, s.location, "water");
    const html = stationScreen(s);
    expect(html).toContain(
      `data-act="buy" data-id="water" data-qty="7" aria-label="Buy 7 Water / Ice for ${(7 * price).toLocaleString()}cr"`
    );
    expect(html).toContain(`buy 7 for ${(7 * price).toLocaleString()}cr`);
  });

  it("disables the shortcut with a reason when unaffordable", () => {
    const s = withMission(mission, { cargo: { water: 3, parts: 0, luxury: 0 }, credits: 0 });
    const html = stationScreen(s);
    expect(html).toContain(`aria-disabled="true" aria-describedby="buy-hint-${mission.id}"`);
    expect(html).toContain("(not enough credits)");
  });

  it("shows no shortcut once the cargo is ready", () => {
    const s = withMission(mission); // helper fills cargo to the full qty
    const html = stationScreen(s);
    expect(html).not.toContain("buy-hint-");
    expect(html).toContain("✓ carrying 10/10");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/ui/screens.test.ts`
Expected: FAIL — not-ready contracts still render the static "buy N more" text.

- [ ] **Step 3: Implement**

In `src/ui/screens.ts`, inside the `active` missions map (lines 209–230), the not-ready branch currently ends with:

```ts
          : `<span class="bad">✗ carrying ${have}/${m.qty} — buy ${m.qty - have} more ${commodityName(m.commodity)}</span>`;
```

Add the shortfall computation after the existing `jumpHintId` declaration and replace that branch. The full updated map body:

```ts
const active = s.activeMissions
  .map((m) => {
    const have = s.cargo[m.commodity];
    const ready = have >= m.qty;
    const expired = s.day > m.deadlineDay;
    const atDestination = s.location === m.destination;
    const canReach = atDestination || s.fuel >= fuelCost(s.location, m.destination);
    const jumpHintId = `jump-hint-${m.id}`;
    // Shortfall shortcut: buys the full missing amount at the local price, or
    // is disabled with a reason — never a silent partial (B-1 precedent).
    const shortfall = m.qty - have;
    const unitPrice = getPrice(s.seed, s.day, s.location, m.commodity);
    const shortfallCost = shortfall * unitPrice;
    const roomLeft = s.cargoCapacity - cargoUsed(s.cargo);
    const shortfallBlocked =
      shortfallCost > s.credits
        ? "not enough credits"
        : shortfall > roomLeft
          ? "not enough hold space"
          : "";
    const buyHintId = `buy-hint-${m.id}`;
    const shortfallBtn = shortfallBlocked
      ? `<button class="jump-link" data-act="buy" data-id="${m.commodity}" data-qty="${shortfall}" aria-label="Buy ${shortfall} ${commodityName(m.commodity)} for ${cr(shortfallCost)}" aria-disabled="true" aria-describedby="${buyHintId}">buy ${shortfall} for ${cr(shortfallCost)}</button> <span id="${buyHintId}" class="bad">(${shortfallBlocked})</span>`
      : `<button class="jump-link" data-act="buy" data-id="${m.commodity}" data-qty="${shortfall}" aria-label="Buy ${shortfall} ${commodityName(m.commodity)} for ${cr(shortfallCost)}">buy ${shortfall} for ${cr(shortfallCost)}</button>`;
    const jumpBtn = canReach
      ? `<button class="jump-link" data-act="jump" data-id="${m.destination}" aria-label="Jump to ${NODES[m.destination].name} to deliver">jump to ${NODES[m.destination].name}</button>`
      : `<button class="jump-link" data-act="jump" data-id="${m.destination}" aria-label="Jump to ${NODES[m.destination].name} to deliver" aria-disabled="true" aria-describedby="${jumpHintId}">jump to ${NODES[m.destination].name}</button> <span id="${jumpHintId}" class="bad">(not enough fuel to jump)</span>`;
    const readyBtn = atDestination
      ? `<button class="jump-link" data-act="deliver" aria-label="Deliver to ${NODES[m.destination].name}">deliver</button>`
      : jumpBtn;
    const hint = expired
      ? `<span class="bad">✗ deadline passed</span>`
      : ready
        ? `<span class="good">✓ carrying ${have}/${m.qty} — ready, ${readyBtn}</span>`
        : `<span class="bad">✗ carrying ${have}/${m.qty} — ${shortfallBtn}</span>`;
    return `<li>${m.qty} ${commodityName(m.commodity)} → ${NODES[m.destination].name} by day ${m.deadlineDay} · reward ${cr(m.reward)}<br>${hint}</li>`;
  })
  .join("");
```

(`getPrice` and `cargoUsed` are already imported in screens.ts. The expired and ready branches are unchanged, so the shortcut can never appear on an expired or fulfilled contract.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/ui/screens.test.ts` → PASS, including the pre-existing "ready contract jump control" describe (ready/expired branches untouched).

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens.ts tests/ui/screens.test.ts
git commit -m "feat(ui): one-click shortfall buy on active contract cards (P1-1)"
```

---

### Task 8: Backlog bookkeeping

**Files:**

- Modify: `docs/ENGAGEMENT_BACKLOG.md` (§5 quick wins, B-4 row)
- Modify: `docs/BACKLOG.md` (P1-1 row)

- [ ] **Step 1: Mark the engagement quick wins**

In `docs/ENGAGEMENT_BACKLOG.md` §5, annotate the shipped items (keep the list numbering):

- Item 1 (score cap): prefix with **"Folded into E0-1/E0-2 —"** and note: "deliberately not shipped as a stopgap so score semantics change once, not twice (2026-07-20 prioritization)."
- Items 2, 3, 4: prefix each with **"Shipped (2026-07-20) —"**.

In the Bugs table, update the B-4 row's Fix cell to: "**Resolved behaviorally (2026-07-20)** by UIUX P1-1's ×5/Max/All + shortfall buttons — rapid clicking is no longer required. Root cause (full-DOM re-render) stays open as the P1-1 stretch."

- [ ] **Step 2: Mark P1-1 in the UI/UX backlog**

In `docs/BACKLOG.md`, move P1-1 out of the P1 table into the "Already shipped" section at the top with: "×5/Max/All quantity buttons and the active-contract shortfall shortcut shipped 2026-07-20; the stretch (patch changed DOM nodes instead of full `innerHTML` swaps) remains open and is tracked as the B-4 root cause."

- [ ] **Step 3: Commit**

```bash
git add docs/ENGAGEMENT_BACKLOG.md docs/BACKLOG.md
git commit -m "docs(backlog): record friction & framing PR shipping quick wins 2-4 and P1-1"
```

---

### Task 9: Full verification + browser proof

**Files:** none (verification only)

- [ ] **Step 1: Full gates**

Run: `npm test` → all tests PASS (expect 94: 78 pre-existing + 16 added, of which share.test.ts nets +2).
Run: `npm run lint` → clean.
Run: `npm run format:check` → clean (run `npm run format` first if it flags the new code).
Run: `npm run build` → tsc + vite build clean.

- [ ] **Step 2: Browser verification (preview tools, not Bash)**

Start the Vite dev server via the preview tooling (`.claude/launch.json` entry `runtimeExecutable: "npm"`, `runtimeArgs: ["run", "dev"]`, port 5173) and verify:

1. Header reads "{Station} · Day 1 · {today's UTC date}".
2. Ship's log opens with "The Syndicate staked your ship…".
3. Market rows: click "Max ×N" once — credits drop by exactly N × price, held count reads ×N; "All ×N" sells everything; ×5 disabled states show reason tooltips.
4. Accept a contract, buy part of its cargo elsewhere is not needed — check the card shows "buy N for Xcr" and one click fills it.
5. Strand a run (jump until out of fuel and credits — fastest: dump credits into cargo at high prices, then jump repeatedly): end screen shows "Stranded at {station} — out of fuel, out of credits." and "Copy score card" puts date + URL (no "Seed #") on the clipboard.
6. No console errors during the above.

Take a screenshot of the station screen (new buttons) and the end screen (cause line) as proof.

- [ ] **Step 3: Done — hand off**

Use superpowers:finishing-a-development-branch to choose merge/PR. PR description follows the user's global format (type `feat(ui)`, Changed/Fixed sections, Why/Context referencing ENGAGEMENT_BACKLOG §5 and UIUX P1-1/B-4).
