# Stranding Honesty & Event Stakes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two remaining "you lose without understanding why" gaps — stranding (P0-2 + B-1 + B-3) and blind event choices (P0-1) — with zero game-math changes.

**Architecture:** Two self-contained bundles on one branch. Bundle 1 (Tasks 1–3) is pure UI in `src/ui/screens.ts`. Bundle 2 (Tasks 4–5) extracts the event-outcome formulas from `resolveChoice` into a new pure `src/engine/preview.ts` module (behavior-identical) and renders vitals + per-choice stakes on the event screen. Task 6 updates docs and runs full verification.

**Tech Stack:** Vanilla TypeScript + Vite, Vitest (`npm test`), ESLint/Prettier. UI is server-less string-template rendering — screens return HTML strings, tested by substring assertions on the rendered HTML (see `tests/ui/screens.test.ts` for the house style).

**Spec:** `docs/superpowers/specs/2026-07-19-stranding-honesty-and-event-stakes-design.md`

**Key engine facts** (verified against current code):

- `createGame(42)`: location `terra`, day 1, credits 800, debt 1500, fuel 16/20, hull 100/100, empty cargo (capacity 30).
- Fuel costs from terra: vulcan 3 (cheapest), kiruna 4, meridian 5, verge 6.
- `REFUEL_PRICE` = 8 (exported from `src/engine/economy.ts`; already imported by `screens.ts`).
- Event formulas in `resolveChoice` (`src/engine/game.ts:231`): pirate toll `min(credits, 150 + day×10)`; flee damage `15 + day%10`; salvage `min(cargoRoom, 2 + day%4)` parts; engine burn `min(fuel, 2)`; derelict reward `200 + day×8` / trap 20 hull, win iff `(day×7 + seed) % 2 === 0`; customs bribe `min(credits, luxury price here)`, comply seizes all luxury.
- `commodityName("parts")` = `"Machine Parts"`.
- The engine's `refuel(state, units)` buys `min(units, tankRoom, floor(credits/8))` — the UI hardcodes `+5` today.

---

### Task 1: Navigator stranding signals (P0-2)

**Files:**

- Modify: `src/ui/screens.ts` (add `cheapestJumpCost` + `fuelWarnClass` helpers, rework `navigatorPanel`, simplify `stationScreen`)
- Modify: `src/ui/styles.css` (`.nav-warning` spacing)
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 0: Create the feature branch** (skip if the executor already set up a worktree/branch)

```bash
git checkout -b feat/stranding-honesty-event-stakes
```

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/screens.test.ts`:

```ts
describe("navigator stranding signals (P0-2)", () => {
  it("explains each unreachable route on its disabled orb", () => {
    // From terra: vulcan costs 3 (reachable), kiruna costs 4 (not reachable).
    const html = stationScreen({ ...createGame(42), fuel: 3 });
    expect(html).toContain('data-act="jump" data-id="kiruna" disabled title="Need 4⛽, have 3"');
    expect(html).toContain("— need 4, have 3");
    expect(html).not.toContain('data-act="jump" data-id="vulcan" disabled');
  });

  it("shows a stranding banner when no jump is reachable", () => {
    const html = stationScreen({ ...createGame(42), fuel: 2 }); // cheapest from terra costs 3
    expect(html).toContain("Not enough fuel to jump anywhere — refuel below (8cr/unit)");
  });

  it("omits the banner while any jump is reachable", () => {
    const html = stationScreen({ ...createGame(42), fuel: 3 });
    expect(html).not.toContain("Not enough fuel to jump anywhere");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/ui/screens.test.ts`
Expected: the 3 new tests FAIL (missing title/banner strings); all pre-existing tests PASS.

- [ ] **Step 3: Implement**

In `src/ui/screens.ts`, add two helpers after the `disabledAttr` helper (near the top):

```ts
/** Fuel cost of the cheapest jump away from the current location. */
function cheapestJumpCost(s: GameState): number {
  return Math.min(...NODE_IDS.filter((n) => n !== s.location).map((n) => fuelCost(s.location, n)));
}

/** Statbar/bar warning class shared by the station and event screens. */
function fuelWarnClass(s: GameState): string {
  const cheapest = cheapestJumpCost(s);
  return s.fuel < cheapest ? "stat-critical" : s.fuel < cheapest * 2 ? "stat-warn" : "";
}
```

Replace `navigatorPanel` with:

```ts
function navigatorPanel(s: GameState): string {
  const banner =
    s.fuel < cheapestJumpCost(s)
      ? `<div class="st-badge st-badge--alert nav-warning" role="status">⚠ Not enough fuel to jump anywhere — refuel below (${REFUEL_PRICE}cr/unit)</div>`
      : "";
  const orbs = NODE_IDS.filter((n) => n !== s.location)
    .map((n) => {
      const cost = fuelCost(s.location, n);
      const danger = Math.round(NODES[n].danger * 100);
      const disabled = s.fuel < cost;
      const reason = disabled ? ` — need ${cost}, have ${s.fuel}` : "";
      return `<button class="st-orb" data-act="jump" data-id="${n}"${disabledAttr(disabled, `Need ${cost}⛽, have ${s.fuel}`)}>
        <span class="st-orb__sphere" style="--orb-art: ${ORB_ART[n]}" aria-hidden="true"></span>
        <span class="st-orb__label">${NODES[n].name}</span>
        <span class="st-orb__meta st-num">${cost}${fuelIcon()} · ${danger}%</span>
        <span class="st-orb__tip st-num" role="tooltip" aria-hidden="true">${cost} fuel · ${danger}% danger${reason}</span>
        <span class="st-sr-only"> — jump here, ${cost} fuel, danger ${danger}%${reason}</span>
      </button>`;
    })
    .join("");
  return panel("Navigator", `${banner}<div class="st-orb-group">${orbs}</div>`);
}
```

(The only changes vs the current code: the `banner` const and its use, `disabledAttr(...)` instead of the bare `disabled` ternary, and `${reason}` appended to the tip and sr-only spans. Enabled orbs render byte-identically to before.)

In `stationScreen`, replace the inline `cheapestJump`/`fuelClass` computation (currently lines 228–232):

```ts
const fuelClass = fuelWarnClass(s);
```

`.st-badge` / `.st-badge--alert` already exist in `src/ui/design-system.css`. Add only the spacing rule to `src/ui/styles.css`, after the `.stat-warn` block (line ~117):

```css
.nav-warning {
  margin-bottom: var(--st-space-3);
}
```

- [ ] **Step 4: Run the full suite to verify everything passes**

Run: `npm test`
Expected: PASS — every pre-existing test plus the 3 new ones. The existing orb tests (`disables orbs the fuel cannot reach`, sr-only strings for enabled orbs) must pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens.ts src/ui/styles.css tests/ui/screens.test.ts
git commit -m "feat(ui): explain unreachable jumps and warn before stranding (P0-2)"
```

---

### Task 2: Refuel honesty label (B-1)

**Files:**

- Modify: `src/ui/screens.ts` (`logisticsPanel`)
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/ui/screens.test.ts`, extend the game-engine import at the top of the file:

```ts
import { createGame, missionsHere, refuel } from "../../src/engine/game";
```

Append:

```ts
describe("refuel honesty (B-1)", () => {
  it("shows the credit-clamped amount and flags it", () => {
    // room 10, affordable floor(37/8) = 4 → buys 4 for 32cr
    const html = stationScreen({ ...createGame(42), credits: 37, fuel: 10 });
    expect(html).toContain("Refuel +4 (32cr) — all you can afford");
  });

  it("shows the room-clamped amount without the affordability flag", () => {
    const html = stationScreen({ ...createGame(42), fuel: 18 }); // room 2, credits 800
    expect(html).toContain("Refuel +2 (16cr)");
    expect(html).not.toContain("all you can afford");
  });

  it("keeps the nominal label and disabled reason when nothing can be bought", () => {
    const html = stationScreen({ ...createGame(42), credits: 0 });
    expect(html).toContain('data-act="refuel" disabled title="Not enough credits"');
    expect(html).toContain("Refuel +5 (40cr)");
  });

  it("matches what the engine actually buys", () => {
    const s = { ...createGame(42), credits: 37, fuel: 10 };
    const after = refuel(s, 5);
    expect(after.fuel - s.fuel).toBe(4);
    expect(s.credits - after.credits).toBe(32);
  });
});
```

- [ ] **Step 2: Run the tests to verify the UI ones fail**

Run: `npm test -- tests/ui/screens.test.ts`
Expected: the three label tests FAIL (label still reads `+5`); the engine-consistency test PASSES already (it pins the behavior the label must mirror).

- [ ] **Step 3: Implement**

In `logisticsPanel` (`src/ui/screens.ts`), replace the three refuel consts (currently lines 62–64):

```ts
// Mirror engine refuel(): it buys min(units, tankRoom, affordable) — the label
// must promise exactly what the click delivers (B-1).
const tankRoom = s.fuelCapacity - s.fuel;
const affordable = Math.floor(s.credits / REFUEL_PRICE);
const refuelUnits = Math.min(5, tankRoom, affordable);
const refuelDisabled = refuelUnits <= 0;
const refuelTitle = tankRoom <= 0 ? "Fuel tank full" : "Not enough credits";
const shownUnits = refuelDisabled ? 5 : refuelUnits;
const clampedByCredits = !refuelDisabled && affordable < Math.min(5, tankRoom);
const refuelLabel = `Refuel +${shownUnits} (${cr(shownUnits * REFUEL_PRICE)})${clampedByCredits ? " — all you can afford" : ""}`;
```

Replace the refuel button line (currently line 90):

```ts
      <button class="st-btn st-btn--ghost" data-act="refuel"${disabledAttr(refuelDisabled, refuelTitle)}>${fuelIcon()}${refuelLabel}</button>
```

Note: the default state (fuel 16/20, room 4) now honestly reads "Refuel +4 (32cr)" — no existing test asserts the old `+5` text.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS, including the pre-existing `keeps the services disabled hints` test (credits 0 → `refuelUnits` 0 → disabled with `"Not enough credits"`).

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens.ts tests/ui/screens.test.ts
git commit -m "feat(ui): refuel button promises exactly what it buys (B-1)"
```

---

### Task 3: Negative-credits warning (B-3)

**Files:**

- Modify: `src/ui/screens.ts` (`statbar`, `logisticsPanel`)
- Modify: `src/ui/styles.css` (`.credits-negative`)
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/screens.test.ts`:

```ts
describe("negative credits warning (B-3)", () => {
  it("marks negative credits in both the statbar and logistics", () => {
    const html = stationScreen({ ...createGame(42), credits: -33 });
    expect(html.match(/credits-negative/g)?.length).toBe(2);
    expect(html).toContain("-33cr");
  });

  it("adds no warning at zero or above", () => {
    const html = stationScreen({ ...createGame(42), credits: 0 });
    expect(html).not.toContain("credits-negative");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- tests/ui/screens.test.ts`
Expected: FAIL (`credits-negative` not rendered).

- [ ] **Step 3: Implement**

In `statbar` (`src/ui/screens.ts:41`), give the credits chip a conditional class:

```ts
function statbar(s: GameState, fuelClass: string): string {
  const creditsClass = s.credits < 0 ? " credits-negative" : "";
  return `<div class="st-statbar" aria-hidden="true">
    <span class="st-statbar__chip st-statbar__chip--gold st-num${creditsClass}">${cr(s.credits)}</span>
    <span class="st-statbar__chip st-num${fuelClass ? ` ${fuelClass}` : ""}">${fuelIcon()}Fuel ${s.fuel}/${s.fuelCapacity}</span>
    <span class="st-statbar__chip st-num">${hullIcon()}Hull ${s.hull}/${s.hullMax}</span>
    <span class="st-statbar__chip st-num">Hold ${cargoUsed(s.cargo)}/${s.cargoCapacity}</span>
  </div>`;
}
```

In `logisticsPanel`, extend the local `kv` helper with an `extra` class param and use it for the Credits row:

```ts
const kv = (label: string, value: string, gold = false, extra = "") =>
  `<div class="st-kv"><span class="st-kv__label">${label}</span><span class="st-kv__value${gold ? " st-kv__value--gold" : ""}${extra ? ` ${extra}` : ""} st-num">${value}</span></div>`;
```

```ts
    `${kv("Credits", cr(s.credits), true, s.credits < 0 ? "credits-negative" : "")}
```

(The Debt / Net worth / Day rows keep their current two- and three-argument calls — the new param defaults to `""`.)

In `src/ui/styles.css`, after the `.nav-warning` block:

```css
.credits-negative {
  color: var(--st-negative);
  text-shadow: none;
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS (existing statbar test asserts `<div class="st-statbar" aria-hidden="true">`, which is unchanged).

- [ ] **Step 5: Commit — closes Bundle 1**

```bash
git add src/ui/screens.ts src/ui/styles.css tests/ui/screens.test.ts
git commit -m "feat(ui): style negative credits as an explicit warning state (B-3)"
```

---

### Task 4: Stake-preview engine module (P0-1 foundation)

**Files:**

- Create: `src/engine/preview.ts`
- Modify: `src/engine/game.ts` (`resolveChoice` refactor, lines 230–296)
- Test: `tests/engine/preview.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/preview.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DERELICT_TRAP_DAMAGE,
  bribeCost,
  choiceStakes,
  derelictReward,
  engineBurn,
  fleeDamage,
  pirateToll,
  salvageAmount,
} from "../../src/engine/preview";
import { createGame, resolveChoice } from "../../src/engine/game";
import { GameEvent } from "../../src/engine/types";

const ev = (kind: GameEvent["kind"], ids: string[]): GameEvent => ({
  kind,
  title: "",
  description: "",
  choices: ids.map((id) => ({ id, label: id })),
});

// Every stake string must describe exactly the delta resolveChoice applies —
// the preview and the resolver share formulas, so drift is a test failure.
describe("stake previews match resolveChoice outcomes", () => {
  it("pirates: pay deducts exactly the previewed toll", () => {
    const s = { ...createGame(42), day: 8 };
    const e = ev("pirates", ["pay", "flee"]);
    expect(choiceStakes(s, e).pay).toBe(`~${pirateToll(s)}cr`);
    const after = resolveChoice(s, e, "pay");
    expect(s.credits - after.credits).toBe(pirateToll(s));
  });

  it("pirates: flee costs exactly the previewed hull", () => {
    const s = { ...createGame(42), day: 8 };
    const e = ev("pirates", ["pay", "flee"]);
    expect(choiceStakes(s, e).flee).toBe(`risk ${fleeDamage(s.day)} hull`);
    const after = resolveChoice(s, e, "flee");
    expect(s.hull - after.hull).toBe(fleeDamage(s.day));
  });

  it("salvage: collect gains exactly the previewed parts", () => {
    const s = { ...createGame(42), day: 6 };
    const e = ev("salvage", ["collect", "ignore"]);
    expect(choiceStakes(s, e).collect).toBe(`+${salvageAmount(s)} Machine Parts`);
    const after = resolveChoice(s, e, "collect");
    expect(after.cargo.parts - s.cargo.parts).toBe(salvageAmount(s));
  });

  it("engine: burns exactly the previewed fuel", () => {
    const s = { ...createGame(42), fuel: 1 };
    const e = ev("engine", ["ack"]);
    expect(choiceStakes(s, e).ack).toBe("−1 fuel");
    const after = resolveChoice(s, e, "ack");
    expect(s.fuel - after.fuel).toBe(engineBurn(s));
  });

  it("derelict: previews both outcomes; a win day pays the previewed reward", () => {
    const s = { ...createGame(42), day: 2 }; // (2×7 + 42) % 2 === 0 → win
    const e = ev("derelict", ["board", "leave"]);
    expect(choiceStakes(s, e).board).toBe(
      `could hold ~${derelictReward(s.day)}cr, or a trap: −${DERELICT_TRAP_DAMAGE} hull`
    );
    const after = resolveChoice(s, e, "board");
    expect(after.credits - s.credits).toBe(derelictReward(s.day));
  });

  it("derelict: a trap day costs the previewed hull", () => {
    const s = { ...createGame(42), day: 3 }; // (3×7 + 42) % 2 === 1 → trap
    const after = resolveChoice(s, ev("derelict", ["board", "leave"]), "board");
    expect(s.hull - after.hull).toBe(DERELICT_TRAP_DAMAGE);
  });

  it("customs: bribe and comply match their previews", () => {
    const base = createGame(42);
    const s = { ...base, location: "meridian" as const, cargo: { ...base.cargo, luxury: 3 } };
    const e = ev("customs", ["comply", "bribe"]);
    const stakes = choiceStakes(s, e);
    expect(stakes.comply).toBe("lose 3 luxury");
    expect(stakes.bribe).toBe(`~${bribeCost(s)}cr`);
    const bribed = resolveChoice(s, e, "bribe");
    expect(s.credits - bribed.credits).toBe(bribeCost(s));
    const complied = resolveChoice(s, e, "comply");
    expect(complied.cargo.luxury).toBe(0);
  });

  it("customs comply with an empty hold previews the non-loss", () => {
    const s = { ...createGame(42), location: "meridian" as const };
    expect(choiceStakes(s, ev("customs", ["comply", "bribe"])).comply).toBe("nothing to seize");
  });

  it("quiet events preview nothing", () => {
    expect(choiceStakes(createGame(42), ev("quiet", ["ack"]))).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- tests/engine/preview.test.ts`
Expected: FAIL — `src/engine/preview.ts` does not exist.

- [ ] **Step 3: Create `src/engine/preview.ts`**

```ts
// src/engine/preview.ts
//
// Pure previews of event-choice outcomes. resolveChoice (game.ts) applies these
// same formulas, so a stake label shown on a choice button can never drift from
// what the choice actually does. E1-4 (honest events pass) extends this module.
import { GameEvent, GameState } from "./types";
import { cargoUsed } from "./economy";
import { commodityName, getPrice } from "./world";

/** Pirate toll demanded today, clamped to what the player holds. */
export function pirateToll(s: GameState): number {
  return Math.min(s.credits, 150 + s.day * 10);
}

/** Hull damage taken when fleeing pirates. */
export function fleeDamage(day: number): number {
  return 15 + (day % 10);
}

/** Salvage units collected, clamped to cargo room. */
export function salvageAmount(s: GameState): number {
  const room = s.cargoCapacity - cargoUsed(s.cargo);
  return Math.min(room, 2 + (s.day % 4));
}

/** Fuel burned by engine trouble. */
export function engineBurn(s: GameState): number {
  return Math.min(s.fuel, 2);
}

/** Credits found aboard a derelict on a lucky day. */
export function derelictReward(day: number): number {
  return 200 + day * 8;
}

/** Hull damage when the derelict is a trap. */
export const DERELICT_TRAP_DAMAGE = 20;

/** Customs bribe: the going rate for luxury here, clamped to held credits. */
export function bribeCost(s: GameState): number {
  return Math.min(s.credits, getPrice(s.seed, s.day, s.location, "luxury"));
}

/**
 * Human-readable stake per choice id of a pending event. Empty string / missing
 * key means "no stake worth stating" (e.g. staying on course).
 */
export function choiceStakes(s: GameState, e: GameEvent): Record<string, string> {
  switch (e.kind) {
    case "pirates":
      return { pay: `~${pirateToll(s)}cr`, flee: `risk ${fleeDamage(s.day)} hull` };
    case "salvage": {
      const got = salvageAmount(s);
      return { collect: got > 0 ? `+${got} ${commodityName("parts")}` : "hold is full" };
    }
    case "engine":
      return { ack: `−${engineBurn(s)} fuel` };
    case "derelict":
      return {
        board: `could hold ~${derelictReward(s.day)}cr, or a trap: −${DERELICT_TRAP_DAMAGE} hull`,
      };
    case "customs":
      return {
        comply: s.cargo.luxury > 0 ? `lose ${s.cargo.luxury} luxury` : "nothing to seize",
        bribe: `~${bribeCost(s)}cr`,
      };
    default:
      return {};
  }
}
```

- [ ] **Step 4: Refactor `resolveChoice` to use the helpers**

In `src/engine/game.ts`, add the import:

```ts
import {
  DERELICT_TRAP_DAMAGE,
  bribeCost,
  derelictReward,
  engineBurn,
  fleeDamage,
  pirateToll,
  salvageAmount,
} from "./preview";
```

Replace the body of `resolveChoice` (keep the doc comment and the trailing comment about loss/peak):

```ts
export function resolveChoice(state: GameState, event: GameEvent, choiceId: string): GameState {
  let s = state;
  switch (event.kind) {
    case "pirates": {
      if (choiceId === "pay") {
        const toll = pirateToll(s);
        s = withLog({ ...s, credits: s.credits - toll }, `Paid pirates ${toll}cr.`);
      } else {
        const dmg = fleeDamage(s.day);
        s = withLog({ ...s, hull: Math.max(0, s.hull - dmg) }, `Fled — took ${dmg} hull damage.`);
      }
      break;
    }
    case "salvage": {
      if (choiceId === "collect") {
        const got = salvageAmount(s);
        s = withLog(
          { ...s, cargo: { ...s.cargo, parts: s.cargo.parts + got } },
          `Salvaged ${got} ${commodityName("parts")}.`
        );
      }
      break;
    }
    case "engine": {
      const burn = engineBurn(s);
      s = withLog({ ...s, fuel: s.fuel - burn }, `Engine trouble burned ${burn} fuel.`);
      break;
    }
    case "derelict": {
      if (choiceId === "board") {
        if ((s.day * 7 + s.seed) % 2 === 0) {
          const reward = derelictReward(s.day);
          s = withLog({ ...s, credits: s.credits + reward }, `Derelict held ${reward}cr!`);
        } else {
          s = withLog(
            { ...s, hull: Math.max(0, s.hull - DERELICT_TRAP_DAMAGE) },
            `Derelict was a trap: -${DERELICT_TRAP_DAMAGE} hull.`
          );
        }
      }
      break;
    }
    case "customs": {
      if (choiceId === "comply" && s.cargo.luxury > 0) {
        const seized = s.cargo.luxury;
        s = withLog(
          { ...s, cargo: { ...s.cargo, luxury: 0 } },
          `Customs seized ${seized} luxury goods.`
        );
      } else if (choiceId === "bribe") {
        const bribe = bribeCost(s);
        s = withLog({ ...s, credits: s.credits - bribe }, `Bribed customs ${bribe}cr.`);
      }
      break;
    }
    case "quiet":
    default:
      break;
  }
  // Loss/peak are evaluated in `arrive`, after deliveries settle against the
  // post-event cargo — keep this focused on applying the event's effect.
  return trackPeak(s);
}
```

Also delete the now-unused `luxValue` closure (the old line `const luxValue = () => getPrice(...)`). Every log string is byte-identical to before — the refactor is behavior-neutral.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — all pre-existing engine tests unchanged (the refactor proof), plus the new preview tests.

- [ ] **Step 6: Commit**

```bash
git add src/engine/preview.ts src/engine/game.ts tests/engine/preview.test.ts
git commit -m "refactor(engine): extract event formulas into preview module with stake strings"
```

---

### Task 5: Event screen — vitals statbar + stake-labeled choices (P0-1)

**Files:**

- Modify: `src/ui/screens.ts` (`statbar` signature, `eventScreen`)
- Modify: `src/ui/render.ts:17`
- Modify: `src/ui/styles.css` (event statbar visibility, stake sub-line, h1 selector)
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Update the one existing caller in the tests, and write the failing tests**

In `tests/ui/screens.test.ts`, the existing `event and run-end cards` describe block calls `eventScreen(event)` — change it to `eventScreen(createGame(42), event)`. Then append:

```ts
describe("eventScreen vitals and stakes (P0-1)", () => {
  const pirates: GameEvent = {
    kind: "pirates",
    title: "Pirate Ambush",
    description: "Raiders demand tribute.",
    choices: [
      { id: "pay", label: "Pay tribute" },
      { id: "flee", label: "Run for it" },
    ],
  };

  it("shows the vitals statbar, not hidden from assistive tech", () => {
    const html = eventScreen(createGame(42), pirates);
    expect(html).toContain('<div class="st-statbar st-statbar--event">');
    expect(html).toContain("Fuel 16/20");
    expect(html).toContain("Hull 100/100");
    expect(html).toContain("800cr");
  });

  it("labels each choice with its stake", () => {
    const s = { ...createGame(42), day: 4 };
    const html = eventScreen(s, pirates);
    expect(html).toContain('<span class="choice-stake st-num">~190cr</span>'); // 150 + 4×10
    expect(html).toContain('<span class="choice-stake st-num">risk 19 hull</span>'); // 15 + 4
  });

  it("omits the stake span for choices without one", () => {
    const quiet: GameEvent = {
      kind: "quiet",
      title: "Quiet Jump",
      description: "The void is calm.",
      choices: [{ id: "ack", label: "Continue" }],
    };
    const html = eventScreen(createGame(42), quiet);
    expect(html).not.toContain("choice-stake");
  });

  it("uses a top-level heading for the event title", () => {
    const html = eventScreen(createGame(42), pirates);
    expect(html).toContain("<h1>Pirate Ambush</h1>");
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npm test -- tests/ui/screens.test.ts`
Expected: compile error or FAIL — `eventScreen` doesn't accept a state yet. (The updated pre-existing test also fails until the signature changes.)

- [ ] **Step 3: Implement in `src/ui/screens.ts`**

Add `choiceStakes` to the engine imports:

```ts
import { missionsHere } from "../engine/game";
import { choiceStakes } from "../engine/preview";
```

Give `statbar` an options param (station-screen callers stay unchanged — defaults preserve current output byte-for-byte):

```ts
/**
 * At-a-glance vitals strip. On the station screen it duplicates panel data, so it
 * ships presentation-only (aria-hidden). On the event screen it is the ONLY vitals
 * surface, so callers there keep it exposed and always visible.
 */
function statbar(
  s: GameState,
  fuelClass: string,
  opts: { presentation?: boolean; extra?: string } = {}
): string {
  const { presentation = true, extra = "" } = opts;
  const creditsClass = s.credits < 0 ? " credits-negative" : "";
  return `<div class="st-statbar${extra ? ` ${extra}` : ""}"${presentation ? ' aria-hidden="true"' : ""}>
    <span class="st-statbar__chip st-statbar__chip--gold st-num${creditsClass}">${cr(s.credits)}</span>
    <span class="st-statbar__chip st-num${fuelClass ? ` ${fuelClass}` : ""}">${fuelIcon()}Fuel ${s.fuel}/${s.fuelCapacity}</span>
    <span class="st-statbar__chip st-num">${hullIcon()}Hull ${s.hull}/${s.hullMax}</span>
    <span class="st-statbar__chip st-num">Hold ${cargoUsed(s.cargo)}/${s.cargoCapacity}</span>
  </div>`;
}
```

Replace `eventScreen`:

```ts
export function eventScreen(s: GameState, e: GameEvent): string {
  const stakes = choiceStakes(s, e);
  const choices = e.choices
    .map((c) => {
      const stake = stakes[c.id];
      return `<button class="st-btn" data-act="resolve" data-id="${c.id}">${c.label}${
        stake ? `<span class="choice-stake st-num">${stake}</span>` : ""
      }</button>`;
    })
    .join("");
  return `<div class="overlay-stage">
    <div class="st-glow-wrap">
      <div class="st-panel st-panel--chamfer"><div class="st-panel__inner">
        <div class="event-card">
          ${statbar(s, fuelWarnClass(s), { presentation: false, extra: "st-statbar--event" })}
          <h1>${e.title}</h1><p>${e.description}</p><div class="choices">${choices}</div>
        </div>
      </div></div>
    </div>
  </div>`;
}
```

- [ ] **Step 4: Pass the state through in `src/ui/render.ts`**

```ts
  } else if (vm.pendingEvent) {
    root.innerHTML = eventScreen(vm.state, vm.pendingEvent);
  } else {
```

(`main.ts` needs no changes — it already holds both `state` and `pendingEvent` in the ViewModel.)

- [ ] **Step 5: CSS in `src/ui/styles.css`**

Change the heading selector at line 49 from `.event-card h2,` to `.event-card h1,` (the rule body is shared with `.run-end h1` and stays as-is).

Then append after the `.credits-negative` block:

```css
/* Event screen: the statbar is the sole vitals surface — inline it in the card
   and keep it visible at desktop widths where the station statbar hides. */
.st-statbar--event {
  position: static;
  justify-content: center;
  background: transparent;
  border-bottom: 1px solid var(--st-border);
  margin-bottom: var(--st-space-3);
  padding: 0 0 var(--st-space-2);
}
@media (min-width: 1100px) {
  .st-statbar.st-statbar--event {
    display: flex;
  }
}
/* Choice buttons grow a second line for the stake. */
.event-card .st-btn {
  height: auto;
  min-height: var(--st-control-h);
  padding: var(--st-space-2) var(--st-space-3);
  flex-direction: column;
  gap: 2px;
}
.choice-stake {
  display: block;
  font-size: var(--st-text-2xs);
  font-weight: 500;
  letter-spacing: normal;
  text-transform: none;
  color: var(--st-text-dim);
}
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS. The pre-existing station statbar test (`<div class="st-statbar" aria-hidden="true">`) must still pass — the default opts keep station output identical.

- [ ] **Step 7: Verify in the browser**

Start the dev server (`.claude/launch.json` name if present, else `npm run dev` via the preview tool), jump toward The Verge (danger 50% → pirates likely), and screenshot an event: statbar visible on top, stakes under each choice, negative-credit and fuel warnings styled. Check the console for errors.

- [ ] **Step 8: Commit — closes Bundle 2**

```bash
git add src/ui/screens.ts src/ui/render.ts src/ui/styles.css tests/ui/screens.test.ts
git commit -m "feat(ui): show vitals and per-choice stakes on event screens (P0-1)"
```

---

### Task 6: Backlog docs + full verification

**Files:**

- Modify: `docs/BACKLOG.md` (move P0-1/P0-2 to the shipped section)
- Modify: `docs/ENGAGEMENT_BACKLOG.md` (mark B-1, B-3 fixed)

- [ ] **Step 1: Update `docs/BACKLOG.md`**

Add both items to the "Already shipped" list (keep the existing three bullets):

```markdown
- Event screens keep the vitals statbar visible and label every choice with its
  stake (P0-1); stake strings are derived from the same engine formulas as
  `resolveChoice` via `src/engine/preview.ts`.
- Stranding is fully signalled (P0-2): disabled jump orbs carry "Need X⛽, have Y"
  reasons and a warning banner appears when no jump is reachable.
```

Delete the P0-1 and P0-2 rows (the whole P0 table and heading can go if it empties). Update the "Suggested sequencing" list: drop item 1, renumber.

- [ ] **Step 2: Update `docs/ENGAGEMENT_BACKLOG.md`**

In the "Bugs & honesty fixes" table, mark B-1 and B-3 done, e.g. prefix the Issue cell with **Fixed —** and note the resolution ("label now computes the clamped amount" / "negative credits styled as a warning state; not clamped").

- [ ] **Step 3: Full verification**

```bash
npm test && npm run lint && npm run format:check && npm run build
```

Expected: all green. If `format:check` fails, run `npm run format` and re-run.

- [ ] **Step 4: Commit**

```bash
git add docs/BACKLOG.md docs/ENGAGEMENT_BACKLOG.md
git commit -m "docs(backlog): mark P0-1, P0-2, B-1, B-3 as shipped"
```

---

### Done — integration

All six tasks complete and green → use **superpowers:finishing-a-development-branch** to merge or open the single PR (`feat/stranding-honesty-event-stakes` → `master`). PR body per the user's global template, type `feat(ui)`.
