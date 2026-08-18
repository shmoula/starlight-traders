# M5 Round 1 — "The Word Gets Out" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the launch round — the run card rendered as a designed 1200×630 PNG with an image-first copy path (E3-5), the seventh event: a distress beacon whose answer costs 2⛽ and a day for a seeded 60/40 reward (E3-3), and partition-neutral liquidation tax that closes the last ±1cr path across the escape line (E2-2k).

**Architecture:** The distress band inserts **after derelict, before customs**, so the four risk-outcome bands stay byte-identical per seed — only old customs/quiet rolls can re-deal. Answering routes the day cost through an extracted `accrueInterest` (one author for the cadence) and rolls its 60/40 on the **event's day** so the displayed stake can never drift from the payout (E1-4). The card is a pure display-list (`cardOps`) painted by a dumb canvas replayer, with one shared `stripKinds` derivation feeding emoji, HTML, and drawn cells. `saleTax` charges tax on the cumulative per-commodity gross derived from `soldHere` — no new state anywhere in the round.

**Tech Stack:** TypeScript, Vite, Vitest. No new dependencies. No snapshot or save-doc migration.

**Design spec:** [docs/superpowers/specs/2026-08-18-m5-round1-the-word-gets-out-design.md](../specs/2026-08-18-m5-round1-the-word-gets-out-design.md)

---

## Measured facts this plan is built on

Baseline: the 100-seed sweep recorded at the M4 round-2 close (master `609a257`), before any change:

| kind     | audited | lost |   peakSum | netWorthSum |
| :------- | ------: | ---: | --------: | ----------: |
| cautious |      97 |    3 |         0 |    −189,973 |
| balanced |     100 |    0 |   811,481 |     784,221 |
| greedy   |      65 |   35 | 1,093,701 |     664,451 |

Pre-depth baseline fixture (committed, `tests/sim/fixtures/pre-depth-baseline.json`): cautious netWorthSum −190,880, balanced 961,128. The depth-anchor gate asserts `|cautious − pre-depth| < 10,000`.

**Reference values used by tests below:**

- `createGame` starts credits 800, debt 1,500, day 1; empty hold.
- `INTEREST_EVERY = 3` (game.ts:63); `RUN_LENGTH = 12`; `endRun` caps `daysSurvived` at `RUN_LENGTH` (run-end.ts:34).
- Modifier seeds pinned by `tests/engine/modifiers.test.ts`: 42 clearSkies · 1 ionStorms · 10 luxuryBoom · 4 partsGlut · 9 amnesty · 6 corsairSeason · 3 syndicateRest.
- Market depth knobs: `MARKET_DEPTH=20`, `DEPTH_SLOPE=0.08`, `DEPTH_FLOOR=0.6`. The Verge taxes 0%, Meridian 18%.
- Event bands on a clear-skies short lane (terra→kiruna, danger 0.05): salvage +0.18, engine +0.10, derelict +0.12 → the tail starts at 0.45, so distress occupies r ∈ [0.45, 0.53).
- `distressReward(1) = 265` at the plan defaults (250 + 1×15).

**Three predictions — check them when the sweep re-records (Task 7):**

1. **Cautious is distress-inert.** The cautious persona ignores every beacon, and a re-dealt customs roll seizes nothing from a water-only hold — so its trajectories change only through E2-2k's ±1cr tax corrections. **If `|cautious − pre-depth|` moves by more than ~2,000 from its current +907, stop and find out why** — something other than this round's changes moved it.
2. **Greedy deaths may drift DOWN, not up.** A diversion day replaces a risky jump day (no event roll fires on the diverted day), so greedy takes fewer ambush rolls per run. It sits at 35/100 against a 10–40 band — watch **both** bounds.
3. **Balanced ≥95% audited is the gate at risk.** The balanced persona answers only when the diversion keeps `canEscape` true, but next-day price drift can still strand a marginal answer. If the gate trips, first tighten the persona (answer only when `fuel − DISTRESS_FUEL ≥ cheapestJumpCost + 1`), then pull the spec's named knobs in order: `DISTRESS_BAND` down, then `DISTRESS_FUEL` to 1.

## Plan-time deviations from the spec (record in the spec's "Deviations" section on land)

1. **`CardData`'s "score-breakdown lines" narrowed to one `peak` field.** Net worth + bonus are one subtraction away from the score line; peak is the E1-5-era stat worth a line of its own. YAGNI.
2. **`choiceBlockReason` lives in preview.ts, not screens.ts.** The P0-2 reason string must be engine-derived so the button and the guard cannot drift — preview.ts is the honesty module.
3. **The op vocabulary is `rect | rrect | circle | line | text`,** not the spec's `poly` — the cell glyphs draw cleaner with lines and circles, and nothing needs an arbitrary polygon.
4. **The card uses the system font stack deliberately.** Layout must be identical whether or not a web font finished loading, and nothing measures text.

---

## File structure

| File                             | Change                                                                                               |
| :------------------------------- | :--------------------------------------------------------------------------------------------------- |
| `src/engine/economy.ts`          | `grossSoldHere` (private), `saleTax`; `netSaleProceeds` charges through it                           |
| `src/engine/types.ts`            | `GameEventKind` + `"distress"`, `DayHighlightKind` + `"rescue"`                                      |
| `src/engine/fiction.ts`          | `EVENT_VARIANTS.distress` (3 authored variants)                                                      |
| `src/engine/events.ts`           | `DISTRESS_BAND`, `distress()` factory, band insertion                                                |
| `src/engine/game.ts`             | `saleTax` in `sell`; `HIGHLIGHT_RANK` renumber; `DISTRESS_SALT`; `accrueInterest`; `resolveDistress` |
| `src/engine/preview.ts`          | `DISTRESS_*` knobs, `distressReward`, `STRAND_MARK`, stakes/odds cases, `choiceBlockReason`          |
| `src/sim/simulate.ts`            | persona distress policy (state-aware), `SimResult.rescues`, `rescuesSum`                             |
| `src/ui/share.ts`                | `StripCellKind`, `stripKinds`; `runStrip`/`stripSummary` re-derive; 🟩 glyph + noun                  |
| `src/ui/storage.ts`              | `HIGHLIGHT_KIND_TABLE` + `rescue: true`                                                              |
| `src/ui/card.ts`                 | **Create:** `CARD_PALETTE`, `DrawOp`, `CardData`, `cardOps`, `paintCard`, `copyCardImage`            |
| `src/ui/screens.ts`              | `ShareStatus` widened, `shareButtonLabel`, `eventScreen` disabled answer, run-end img + Save PNG     |
| `src/main.ts`                    | `buildShareData` extraction, per-run card memo, paint hook, image-first share handler                |
| `src/ui/styles.css`              | `.run-end__card`                                                                                     |
| `tests/engine/economy.test.ts`   | `saleTax` suite                                                                                      |
| `tests/engine/game.test.ts`      | E2-2k realizability suite; distress resolution suite                                                 |
| `tests/engine/fiction.test.ts`   | distress variants suite                                                                              |
| `tests/engine/events.test.ts`    | distress band suite (+ customs/quiet re-records only)                                                |
| `tests/engine/preview.test.ts`   | distress previews suite                                                                              |
| `tests/engine/share.test.ts`     | 🟩 + summary noun; `stripKinds` suite                                                                |
| `tests/ui/storage.test.ts`       | rescue highlight accepted by the snapshot validator                                                  |
| `tests/ui/screens.test.ts`       | distress surfaces; share-button labels re-record; card img + Save PNG                                |
| `tests/ui/card.test.ts`          | **Create:** determinism, bounds, cells, texts, palette                                               |
| `tests/sim/simulate.test.ts`     | distress gates; re-recorded thresholds with rationale                                                |
| `docs/ROADMAP.md`, both backlogs | Milestone 5 section; E3-3/E3-5 shipped, E2-2k resolved                                               |

Work on the branch this round's spec was committed to:

```bash
git checkout feat/m5-round1-the-word-gets-out
```

---

### Task 1: `saleTax` — liquidation tax becomes partition-neutral (E2-2k)

**Files:**

- Modify: `src/engine/economy.ts` (`taxOnSale` :41, `netSaleProceeds` :143)
- Modify: `src/engine/game.ts` (`sell` :263)
- Test: `tests/engine/economy.test.ts`, `tests/engine/game.test.ts`

- [ ] **Step 1: Write the failing unit tests** — append to `tests/engine/economy.test.ts` (add `saleTax`, `saleProceeds`, `taxOnSale` to its economy import and `NodeId` to its types import if absent):

```ts
describe("saleTax (E2-2k) — cumulative, partition-neutral", () => {
  const at = (location: NodeId, soldWater = 0): GameState => ({
    ...createGame(42),
    location,
    soldHere: { water: soldWater, parts: 0, luxury: 0 },
  });

  it("first sale of a visit charges exactly the old per-sale amount", () => {
    expect(saleTax(at("meridian"), "water", 500)).toBe(taxOnSale("meridian", 500));
  });

  it("later sales telescope: split charges sum to the single rounded charge", () => {
    const s0 = at("meridian");
    for (const [q1, q2] of [
      [1, 9],
      [3, 7],
      [5, 5],
      [7, 3],
    ] as const) {
      const g1 = saleProceeds(s0, "water", q1).gross;
      const s1 = at("meridian", q1);
      const g2 = saleProceeds(s1, "water", q2).gross;
      const whole = saleProceeds(s0, "water", q1 + q2).gross;
      expect(g1 + g2).toBe(whole); // the depth curve is positional, so gross telescopes
      expect(saleTax(s0, "water", g1) + saleTax(s1, "water", g2)).toBe(
        taxOnSale("meridian", whole)
      );
    }
  });

  it("charges zero at the tax-free port and for a zero gross", () => {
    expect(saleTax(at("verge"), "water", 999)).toBe(0);
    expect(saleTax(at("meridian"), "water", 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Write the failing behavior tests** — append to `tests/engine/game.test.ts` (add `liquidationValue` to its economy import):

```ts
describe("liquidation is exactly what the escape math promised (E2-2k)", () => {
  it("unit-by-unit selling realizes liquidationValue to the credit", () => {
    let s: GameState = {
      ...createGame(42),
      location: "meridian",
      credits: 100,
      cargo: { water: 12, parts: 5, luxury: 3 },
    };
    const promised = liquidationValue(s);
    const before = s.credits;
    (["water", "parts", "luxury"] as CommodityId[]).forEach((id) => {
      while (s.cargo[id] > 0) s = sell(s, id, 1);
    });
    expect(s.credits - before).toBe(promised);
  });

  it("any split of a stack sale nets the same credits as selling it whole", () => {
    const base: GameState = {
      ...createGame(42),
      location: "meridian",
      cargo: { water: 30, parts: 0, luxury: 0 }, // 30 crosses MARKET_DEPTH — degraded units included
    };
    const whole = sell(base, "water", 30).credits;
    for (const q of [1, 7, 15, 19, 20, 21, 29]) {
      const split = sell(sell(base, "water", q), "water", 30 - q).credits;
      expect(split, `split ${q}/${30 - q}`).toBe(whole);
    }
  });
});
```

- [ ] **Step 3: Run** — `npx vitest run tests/engine/economy.test.ts tests/engine/game.test.ts` — expect FAIL (`saleTax` not exported; the split cases differ by ±1cr).

- [ ] **Step 4: Implement.** In `src/engine/economy.ts`, after `netWorth` (:134):

```ts
/** Gross the soldHere[id] units already sold here today fetched, walking the same
 *  depth curve saleProceeds prices with. Derived, never stored (E2-2k): soldHere
 *  already remembers the units, and the curve is deterministic over them. */
function grossSoldHere(s: GameState, id: CommodityId): number {
  const list = getPrice(s.seed, s.day, s.location, id);
  let gross = 0;
  for (let i = 0; i < s.soldHere[id]; i++) gross += depthUnitPrice(list, i);
  return gross;
}

/**
 * The tax a sale grossing `gross` more credits of `id` owes here, on top of what this
 * visit's earlier sales of it already paid (E2-2k). Charging on the CUMULATIVE gross
 * makes any partition of a stack telescope to taxOnSale(node, totalGross) exactly, so
 * liquidationValue's single-charge promise is realizable by any sequence of partial
 * sales and the escape line (E2-2h) can no longer be crossed by per-sale rounding.
 */
export function saleTax(s: GameState, id: CommodityId, gross: number): number {
  if (gross <= 0) return 0;
  const before = grossSoldHere(s, id);
  return taxOnSale(s.location, before + gross) - taxOnSale(s.location, before);
}
```

Then re-route `netSaleProceeds` (:143):

```ts
export function netSaleProceeds(state: GameState, id: CommodityId, qty: number): number {
  const { gross } = saleProceeds(state, id, qty);
  return gross - saleTax(state, id, gross);
}
```

In `src/engine/game.ts`, swap `taxOnSale` for `saleTax` in the economy import and change `sell` (:263):

```ts
const tax = saleTax(state, id, gross);
```

(If `taxOnSale` has no other use in game.ts, remove it from the import — `npx tsc --noEmit` will say.)

- [ ] **Step 5: Run the full suite** — `npm test`. The new suites pass. Existing expectations that hard-coded a net-proceeds or `(tax N)` figure may shift by ±1cr — re-record those **only**, each with a `// E2-2k cumulative tax` comment. A shift larger than 1cr per sale is a bug: stop.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(m5): cumulative saleTax makes partial sales exactly neutral (E2-2k)"
```

---

### Task 2: The new kinds exist — types, fiction, glyphs, storage, rank

**Files:**

- Modify: `src/engine/types.ts` (:72, :158), `src/engine/fiction.ts` (`EVENT_VARIANTS` :86), `src/ui/share.ts` (`STRIP_GLYPHS` :34, `STRIP_NOUNS` :61), `src/ui/storage.ts` (`HIGHLIGHT_KIND_TABLE` :313), `src/engine/game.ts` (`HIGHLIGHT_RANK` :156)
- Test: `tests/engine/fiction.test.ts`, `tests/engine/share.test.ts`, `tests/ui/storage.test.ts`

- [ ] **Step 1: Write the failing tests.** In `tests/engine/fiction.test.ts`:

```ts
describe("distress variants (E3-3)", () => {
  it("has at least 3 authored variants, each a short sentence", () => {
    expect(EVENT_VARIANTS.distress.length).toBeGreaterThanOrEqual(3);
    for (const v of EVENT_VARIANTS.distress) {
      const line = v("the Red Kestrel");
      expect(line.length).toBeLessThanOrEqual(120);
      expect(/[.?!]$/.test(line)).toBe(true);
    }
  });
});
```

In `tests/engine/share.test.ts`:

```ts
it("maps a rescue day to 🟩 and counts it in the summary (E3-3)", () => {
  expect(runStrip({ 2: "rescue" }, 3, "audited")).toBe("🟦🟩🟦");
  expect(stripSummary({ 2: "rescue" }, 3, "audited")).toContain("1 distress call answered");
});
```

In `tests/ui/storage.test.ts`: find the valid-snapshot fixture the round-trip test uses (`grep -n dayHighlights tests/ui/storage.test.ts`) and add a `"rescue"` value to its `dayHighlights` map (e.g. `{ 2: "rescue" }`) — the load must still succeed. This pins that the validator accepts the widened kind.

- [ ] **Step 2: Run** — `npx vitest run tests/engine/fiction.test.ts tests/engine/share.test.ts tests/ui/storage.test.ts` — expect FAIL (TS: `"distress"`/`"rescue"` not assignable).

- [ ] **Step 3: Widen the types.** In `src/engine/types.ts`:

```ts
export type DayHighlightKind = "pirates" | "rescue" | "bigTrade" | "delivery";
```

```ts
export type GameEventKind =
  "quiet" | "pirates" | "salvage" | "derelict" | "customs" | "engine" | "distress";
```

- [ ] **Step 4: Walk the compiler** — `npx tsc --noEmit` flags every Record the widening breaks; fill them all:

In `src/engine/fiction.ts`, append to `EVENT_VARIANTS`:

```ts
  distress: [
    () =>
      "A thin voice on the open channel: engines dead, air thinning. Answering costs fuel and a day.",
    () => "A distress beacon repeats from a debris shadow. Nobody else is slowing down for it.",
    () => "An automated mayday, hours old, still calling. Out here the law is whoever answers.",
  ],
```

In `src/ui/share.ts`, add to `STRIP_GLYPHS` and `STRIP_NOUNS` (rescue sits after pirates in both — insertion order drives the summary's clause order):

```ts
const STRIP_GLYPHS: Record<DayHighlightKind, string> = {
  pirates: "🟥",
  rescue: "🟩",
  bigTrade: "💰",
  delivery: "🟨",
};
```

```ts
const STRIP_NOUNS: Record<DayHighlightKind, [one: string, many: string]> = {
  pirates: ["pirate encounter", "pirate encounters"],
  rescue: ["distress call answered", "distress calls answered"],
  bigTrade: ["big trade", "big trades"],
  delivery: ["delivery", "deliveries"],
};
```

In `src/ui/storage.ts`:

```ts
const HIGHLIGHT_KIND_TABLE: Record<DayHighlightKind, true> = {
  pirates: true,
  rescue: true,
  bigTrade: true,
  delivery: true,
};
```

In `src/engine/game.ts` (:156) — an ambush still owns its day; a rescue outranks the money the diverted day earned:

```ts
const HIGHLIGHT_RANK: Record<DayHighlightKind, number> = {
  pirates: 4,
  rescue: 3,
  bigTrade: 2,
  delivery: 1,
};
```

- [ ] **Step 5: Verify** — `npx tsc --noEmit` clean, then the Step-1 test files PASS, then `npm test` green (no live code produces the new kinds yet).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(m5): distress event kind + rescue highlight exist across the type system (E3-3a)"
```

---

### Task 3: Distress knobs and honest previews

**Files:**

- Modify: `src/engine/preview.ts` (knobs beside `SALVAGE_BAIT_DIVISOR` :47; `choiceStakes` :83; `choiceOdds` :125)
- Test: `tests/engine/preview.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `tests/engine/preview.test.ts` (add `GameEvent` to its types import, `DISTRESS_FUEL`, `distressReward`, `STRAND_MARK`, `choiceBlockReason` to its preview import):

```ts
const distressEvent: GameEvent = {
  kind: "distress",
  title: "Distress Call",
  description: "",
  choices: [
    { id: "answer", label: "Answer the call (divert)" },
    { id: "ignore", label: "Hold your course" },
  ],
};

describe("distress previews (E3-3)", () => {
  it("prices the answer: the fuel, the day, and the reward on today's number", () => {
    const s = { ...createGame(42), fuel: 10, credits: 5000 };
    expect(choiceStakes(s, distressEvent).answer).toBe(
      `−2⛽, −1 day — a grateful trader (~${distressReward(s.day)}cr), or nothing`
    );
    expect(distressReward(1)).toBe(265);
    expect(choiceStakes(s, distressEvent).ignore).toBeUndefined();
  });

  it("warns when the diversion could strand the ship", () => {
    const s = { ...createGame(42), fuel: DISTRESS_FUEL, credits: 0 };
    expect(choiceStakes(s, distressEvent).answer).toContain(STRAND_MARK);
  });

  it("derives the odds label from the knobs", () => {
    expect(choiceOdds(distressEvent).answer).toBe("60/40");
  });

  it("blocks the answer below the fuel cost, with the honest reason", () => {
    expect(choiceBlockReason({ ...createGame(42), fuel: 1 }, distressEvent, "answer")).toBe(
      "Need 2⛽, have 1"
    );
    expect(choiceBlockReason({ ...createGame(42), fuel: 2 }, distressEvent, "answer")).toBeNull();
    expect(choiceBlockReason(createGame(42), distressEvent, "ignore")).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/engine/preview.test.ts` — expect FAIL (knobs not exported).

- [ ] **Step 3: Implement.** In `src/engine/preview.ts`, add `canEscape` to the economy import, then after `SALVAGE_BAIT_DIVISOR` (:47):

```ts
/** ⚙ Fuel burned diverting to a distress beacon (E3-3). */
export const DISTRESS_FUEL = 2;
/** ⚙ Base credits a grateful trader pays. */
export const DISTRESS_REWARD_BASE = 250;
/** ⚙ Reward growth per game day. */
export const DISTRESS_REWARD_PER_DAY = 15;
/** ⚙ Grateful outcomes per DISTRESS_GRATEFUL_DEN — the odds label derives from the pair. */
export const DISTRESS_GRATEFUL_NUM = 3;
export const DISTRESS_GRATEFUL_DEN = 5;

/** Appended to a stake whose worst case leaves the run unable to fly out (E3-3 honesty). */
export const STRAND_MARK = " — ⚠ could strand you";

/** Credits the grateful trader transfers (E3-3), priced on the day the beacon fired. */
export function distressReward(day: number): number {
  return DISTRESS_REWARD_BASE + day * DISTRESS_REWARD_PER_DAY;
}

/** The strand warning when answering would leave the ship unable to buy its way out.
 *  The event resolves at the destination dock (jump has already moved location), so
 *  canEscape prices the right station. A warning, never a gate — B-6's rule. */
function strandIf(s: GameState): string {
  return canEscape({ ...s, fuel: s.fuel - DISTRESS_FUEL }) ? "" : STRAND_MARK;
}
```

Add the `choiceStakes` case (before `default`):

```ts
    case "distress":
      return {
        answer: `−${DISTRESS_FUEL}⛽, −1 day — a grateful trader (~${distressReward(s.day)}cr), or nothing${strandIf(s)}`,
      };
```

Add the `choiceOdds` case (beside derelict):

```ts
    case "distress": {
      const pct = Math.round((100 * DISTRESS_GRATEFUL_NUM) / DISTRESS_GRATEFUL_DEN);
      return { answer: `${pct}/${100 - pct}` };
    }
```

And append, after `choiceOdds`:

```ts
/**
 * Reason a choice cannot be taken right now, or null (E3-3). Rendered as a disabled
 * button with the reason where a stake would sit — the P0-2 stranding-honesty pattern.
 */
export function choiceBlockReason(s: GameState, e: GameEvent, choiceId: string): string | null {
  if (e.kind === "distress" && choiceId === "answer" && s.fuel < DISTRESS_FUEL) {
    return `Need ${DISTRESS_FUEL}⛽, have ${s.fuel}`;
  }
  return null;
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/engine/preview.test.ts` — expect PASS. Then `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(m5): distress knobs, priced stake, derived odds, strand warning (E3-3b)"
```

---

### Task 4: The distress band

**Files:**

- Modify: `src/engine/events.ts` (knobs :13–:16, band block :87–:100, factories :105)
- Test: `tests/engine/events.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `tests/engine/events.test.ts` (the `CALM` helper already exists at the top of the file):

```ts
describe("distress band (E3-3)", () => {
  it("appears on a calm lane at roughly its band width", () => {
    let n = 0;
    for (let day = 1; day <= 400; day++) {
      if (rollEvent(42, day, "terra", "kiruna", CALM).kind === "distress") n++;
    }
    expect(n / 400).toBeGreaterThan(0.04); // band is 0.08; generous noise margin
    expect(n / 400).toBeLessThan(0.12);
  });

  it("survives amnesty — a beacon is not a pirate", () => {
    let n = 0;
    for (let day = 1; day <= 400; day++) {
      if (rollEvent(9, day, "terra", "verge", CALM).kind === "distress") n++; // seed 9 = amnesty
    }
    expect(n).toBeGreaterThan(0);
  });

  it("meridian still rolls customs above the distress band", () => {
    const kinds = new Set(
      Array.from({ length: 400 }, (_, i) => rollEvent(7, i + 1, "terra", "meridian", CALM).kind)
    );
    expect(kinds.has("customs")).toBe(true);
    expect(kinds.has("distress")).toBe(true);
  });

  it("carries the two authored choices", () => {
    let e: GameEvent | null = null;
    for (let day = 1; day <= 400 && !e; day++) {
      const r = rollEvent(42, day, "terra", "kiruna", CALM);
      if (r.kind === "distress") e = r;
    }
    expect(e).not.toBeNull();
    expect(e!.title).toBe("Distress Call");
    expect(e!.choices.map((c) => c.id)).toEqual(["answer", "ignore"]);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/engine/events.test.ts -t "distress band"` — expect FAIL (no distress kind ever rolls).

- [ ] **Step 3: Implement.** In `src/engine/events.ts`, beside `LONG_HAUL_SALVAGE_BAND` (:16):

```ts
/** Width of the distress band (E3-3) — constant on every lane: a beacon is no likelier
 *  on a frontier run than a milk run, and amnesty does not silence it (it empties only
 *  the hostile pirate/salvage bands). Inserted after derelict, before customs, so the
 *  four risk-outcome bands keep their thresholds — only old customs/quiet rolls re-deal. */
export const DISTRESS_BAND = 0.08; // ⚙
```

In `rollEvent`, replace the `pCustoms` line and the dispatch tail (:93–:100):

```ts
const pDistress = pDerelict + DISTRESS_BAND;
const pCustoms = to === "meridian" ? pDistress + 0.15 : pDistress;

if (r < pPirates) return pirates(describe("pirates"));
if (r < pSalvage) return salvage(describe("salvage"));
if (r < pEngine) return engine(describe("engine"));
if (r < pDerelict) return derelict(describe("derelict"));
if (r < pDistress) return distress(describe("distress"));
if (r < pCustoms) return customs(describe("customs"));
return quiet(describe("quiet"));
```

And add the factory beside `derelict` (:135):

```ts
function distress(description: string): GameEvent {
  return {
    kind: "distress",
    title: "Distress Call",
    description,
    choices: [
      { id: "answer", label: "Answer the call (divert)" },
      { id: "ignore", label: "Hold your course" },
    ],
  };
}
```

- [ ] **Step 4: Run the full suite** — `npm test`. The new suite passes. **Re-record discipline:** any existing expectation that now fails must be one whose expected kind was `customs` or `quiet` — re-record it to `distress` with a `// E3-3 band re-deal` comment. **A flipped `pirates`/`salvage`/`engine`/`derelict` expectation means the insertion point is wrong — STOP.** Sim-gate failures are expected here and owned by Task 7; note the numbers and continue.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(m5): distress band after derelict — risk-outcome bands untouched (E3-3c)"
```

---

### Task 5: `resolveDistress` — the answer costs a day, through the shared machinery

**Files:**

- Modify: `src/engine/game.ts` (interest block in `jump` :556–:559, `resolveChoice` :719, salts :625)
- Test: `tests/engine/game.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `tests/engine/game.test.ts` (add `DISTRESS_FUEL`, `distressReward`, `DISTRESS_GRATEFUL_DEN`, `DISTRESS_GRATEFUL_NUM` to the preview import, `DISTRESS_SALT` to the game import, `hashSeed` to the rng import, `Mission` to the types import — each if absent):

```ts
const distressEvent: GameEvent = {
  kind: "distress",
  title: "Distress Call",
  description: "",
  choices: [
    { id: "answer", label: "Answer the call (divert)" },
    { id: "ignore", label: "Hold your course" },
  ],
};

/** First day in 1..12 whose grateful roll matches `want` — keeps tests seed-honest. */
const dayWhere = (seed: number, want: boolean): number => {
  for (let d = 1; d <= 12; d++) {
    if (hashSeed(seed, d, DISTRESS_SALT) % DISTRESS_GRATEFUL_DEN < DISTRESS_GRATEFUL_NUM === want)
      return d;
  }
  throw new Error("no such day in range");
};

describe("distress resolution (E3-3)", () => {
  it("answering spends exactly the fuel and the day", () => {
    const s = { ...createGame(42), day: 3, fuel: 10 };
    const next = resolveChoice(s, distressEvent, "answer");
    expect(next.fuel).toBe(10 - DISTRESS_FUEL);
    expect(next.day).toBe(4);
  });

  it("ignoring costs nothing and marks nothing", () => {
    const s = { ...createGame(42), day: 3, fuel: 10 };
    const next = resolveChoice(s, distressEvent, "ignore");
    expect(next.fuel).toBe(10);
    expect(next.day).toBe(3);
    expect(next.dayHighlights[3]).toBeUndefined();
    expect(next.dayHighlights[4]).toBeUndefined();
  });

  it("cannot answer below the fuel cost — resolves as ignore", () => {
    const s = { ...createGame(42), day: 3, fuel: 1 };
    expect(resolveChoice(s, distressEvent, "answer")).toEqual(s);
  });

  it("pays the grateful reward on the day the beacon fired, with the log delta", () => {
    const day = dayWhere(42, true);
    const s = { ...createGame(42), day, fuel: 10 };
    const next = resolveChoice(s, distressEvent, "answer");
    expect(next.credits).toBe(s.credits + distressReward(day)); // day₀, not the advanced day
    const last = next.log[next.log.length - 1];
    expect(last.tone).toBe("good");
    expect(last.delta).toBe(distressReward(day));
  });

  it("a dead echo pays nothing and says so neutrally", () => {
    const day = dayWhere(42, false);
    const s = { ...createGame(42), day, fuel: 10 };
    const next = resolveChoice(s, distressEvent, "answer");
    expect(next.credits).toBe(s.credits);
    expect(next.log[next.log.length - 1].tone).toBe("neutral");
  });

  it("marks the spent day 🟩 whichever way the roll goes", () => {
    for (const want of [true, false]) {
      const day = dayWhere(42, want);
      const next = resolveChoice({ ...createGame(42), day, fuel: 10 }, distressEvent, "answer");
      expect(next.dayHighlights[day + 1]).toBe("rescue");
    }
  });

  it("accrues interest when the diverted day lands on the cadence", () => {
    const s = { ...createGame(42), day: 5, debt: 1500, fuel: 10 };
    const next = resolveChoice(s, distressEvent, "answer");
    expect(next.day).toBe(6); // 6 % INTEREST_EVERY === 0
    expect(next.debt).toBeGreaterThan(1500);
  });

  it("no interest when the diverted day is off-cadence", () => {
    const s = { ...createGame(42), day: 3, debt: 1500, fuel: 10 };
    expect(resolveChoice(s, distressEvent, "answer").debt).toBe(1500); // lands on day 4
  });

  it("respects the Syndicate rest holiday", () => {
    const s = { ...createGame(3), day: 5, debt: 1500, fuel: 10 }; // seed 3 → syndicateRest
    expect(resolveChoice(s, distressEvent, "answer").debt).toBe(1500);
  });

  it("the spent day expires a contract that needed it", () => {
    const m: Mission = {
      id: "m1",
      commodity: "water",
      qty: 5,
      destination: "terra",
      reward: 500,
      deposit: 50,
      deadlineDay: 4,
    };
    const base = { ...createGame(42), location: "kiruna" as const, day: 4, fuel: 10 };
    const answered = resolveChoice({ ...base, activeMissions: [m] }, distressEvent, "answer");
    expect(arrive(answered).expired.map((x) => x.id)).toContain("m1");
    const ignored = resolveChoice({ ...base, activeMissions: [m] }, distressEvent, "ignore");
    expect(arrive(ignored).expired).toHaveLength(0);
  });

  it("an answer on the day-12 transit cannot postpone the audit", () => {
    const answered = resolveChoice(
      { ...createGame(42), day: 12, fuel: 10 },
      distressEvent,
      "answer"
    );
    expect(answered.day).toBe(13);
    const landed = arrive(answered).state;
    expect(landed.status).toBe("audited");
    expect(landed.runEnd?.daysSurvived).toBe(12); // endRun caps at RUN_LENGTH
  });
});
```

(If the deadline control leg fails because `settleMissions` expires on `day >= deadlineDay` rather than `>`, shift `deadlineDay` to 5 in both legs and note it — the test's point is the delta between answer and ignore, not the comparison operator.)

- [ ] **Step 2: Run** — `npx vitest run tests/engine/game.test.ts -t "distress"` — expect FAIL (`DISTRESS_SALT` not exported; answer falls through the switch).

- [ ] **Step 3: Implement.** In `src/engine/game.ts`:

Add `DISTRESS_FUEL, distressReward` to the preview import block (:37–:50).

Beside `BAIT_SALT` (:625):

```ts
/** Salts the grateful/echo draw apart from the same-day hazard and bait draws (E3-3). */
export const DISTRESS_SALT = 0xd157;
```

Extract the interest block. Above `jump` (:539), add:

```ts
/** Interest accrues on a fixed cadence — unless today's sky is a Syndicate rest (E3-1).
 *  One author for jump and the distress diversion (E3-3): an added day can neither
 *  dodge nor double the cadence. */
function accrueInterest(s: GameState): GameState {
  if (s.day % INTEREST_EVERY !== 0 || s.debt <= 0 || dailyModifier(s.seed).interestHoliday)
    return s;
  const interest = loanInterest(s.debt, s.day);
  return withLog({ ...s, debt: s.debt + interest }, interestLine(interest, s.day), "bad");
}
```

and replace the inlined block in `jump` (:556–:559) with:

```ts
s = accrueInterest(s);
```

Add the resolver beside `resolveDerelict` (:668):

```ts
function resolveDistress(s: GameState, choiceId: string): GameState {
  if (choiceId !== "answer" || s.fuel < DISTRESS_FUEL) return s;
  // The roll and the reward read day₀ — the day the stake line was priced on (E1-4);
  // the rescue mark lands on the advanced day — the day the diversion spent.
  const day0 = s.day;
  let next: GameState = { ...s, fuel: s.fuel - DISTRESS_FUEL, day: s.day + 1 };
  next = accrueInterest(next);
  next = markDay(next, "rescue");
  next = withLog(next, `Diverted to the beacon — ${DISTRESS_FUEL} fuel and a day.`, "bad");
  if (hashSeed(s.seed, day0, DISTRESS_SALT) % DISTRESS_GRATEFUL_DEN < DISTRESS_GRATEFUL_NUM) {
    const reward = distressReward(day0);
    return withLog(
      { ...next, credits: next.credits + reward },
      `A grateful trader transfers ${reward}cr. "Whatever you're hauling — thank you."`,
      "good",
      reward
    );
  }
  return withLog(next, `The beacon was a dead echo. Nobody there. Nothing left.`, "neutral");
}
```

(Add `DISTRESS_GRATEFUL_DEN, DISTRESS_GRATEFUL_NUM` to the preview import too.) The reward deliberately does **not** call `trackPayday`: event windfalls (derelict loot) never counted toward "best haul", and `resolveChoice`'s existing `trackPeak` wrapper already banks the peak — including a heat-threshold voice line if the reward crosses one.

Add the case to `resolveChoice`'s switch (:721):

```ts
    case "distress":
      s = resolveDistress(s, choiceId);
      break;
```

- [ ] **Step 4: Run** — `npx vitest run tests/engine/game.test.ts` — expect PASS. Then `npx tsc --noEmit` clean, `npm test` (sim gates still owned by Task 7 — note, don't tune).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(m5): answering a distress call costs 2 fuel and a real day (E3-3d)"
```

---

### Task 6: The event screen blocks what it cannot afford

**Files:**

- Modify: `src/ui/screens.ts` (`eventScreen` :746)
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `tests/ui/screens.test.ts`:

```ts
describe("distress call surfaces (E3-3)", () => {
  const ev: GameEvent = {
    kind: "distress",
    title: "Distress Call",
    description: "A thin voice on the open channel.",
    choices: [
      { id: "answer", label: "Answer the call (divert)" },
      { id: "ignore", label: "Hold your course" },
    ],
  };

  it("shows the stake and the odds on an affordable answer", () => {
    const html = eventScreen({ ...createGame(42), fuel: 10 }, ev);
    expect(html).toContain("−2⛽, −1 day");
    expect(html).toContain("60/40");
    expect(html).not.toContain("disabled");
  });

  it("disables the answer below the fuel cost, with the honest reason", () => {
    const html = eventScreen({ ...createGame(42), fuel: 1 }, ev);
    expect(html).toMatch(/data-id="answer"[^>]*disabled/);
    expect(html).toContain("Need 2⛽, have 1");
    expect(html).not.toMatch(/data-id="ignore"[^>]*disabled/);
  });
});
```

(Add `GameEvent` to the file's types import if absent.)

- [ ] **Step 2: Run** — `npx vitest run tests/ui/screens.test.ts -t "distress"` — expect FAIL (no disabled attribute or reason).

- [ ] **Step 3: Implement.** In `src/ui/screens.ts`, add `choiceBlockReason` to the preview import, then replace the choice mapper inside `eventScreen` (:749–:756):

```ts
const choices = e.choices
  .map((c) => {
    // E3-3: an unaffordable choice renders disabled with the engine's reason where
    // its stake would sit (P0-2's stranding-honesty pattern).
    const block = choiceBlockReason(s, e, c.id);
    const parts = block ? [block] : [stakes[c.id], odds[c.id]].filter(Boolean);
    return `<button class="st-btn" data-act="resolve" data-id="${c.id}"${block ? " disabled" : ""}>${c.label}${
      parts.length ? `<span class="choice-stake st-num">${parts.join(" · ")}</span>` : ""
    }</button>`;
  })
  .join("");
```

- [ ] **Step 4: Run** — `npx vitest run tests/ui/screens.test.ts` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(m5): event screen disables an unaffordable answer with the reason (E3-3e)"
```

---

### Task 7: Sim personas, distress gates, and the sweep re-record

**Files:**

- Modify: `src/sim/simulate.ts` (`SimResult` :37, `toResult` :85, `chooseEventOption` :182, both call sites :139/:162, `ArchetypeSummary` :216, `sweepSummary` :232)
- Test: `tests/sim/simulate.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `tests/sim/simulate.test.ts` (add imports: `hashSeed` from `../../src/engine/rng`, `DISTRESS_SALT` from `../../src/engine/game`, `DISTRESS_GRATEFUL_DEN, DISTRESS_GRATEFUL_NUM` from `../../src/engine/preview`):

```ts
describe("distress gates (E3-3 acceptance)", () => {
  it("the grateful split lands near 3-in-5 over a wide window", () => {
    let grateful = 0;
    for (let seed = 1; seed <= 400; seed++) {
      if (hashSeed(seed, 7, DISTRESS_SALT) % DISTRESS_GRATEFUL_DEN < DISTRESS_GRATEFUL_NUM)
        grateful++;
    }
    expect(grateful / 400).toBeGreaterThan(0.55); // ⚙
    expect(grateful / 400).toBeLessThan(0.65); // ⚙
  });

  it("the sweep actually meets and answers beacons — and the turtle never does", () => {
    const sum = Object.fromEntries(sweepSummary(SEEDS).map((s) => [s.kind, s]));
    expect(sum.balanced.rescuesSum + sum.greedy.rescuesSum).toBeGreaterThan(0);
    expect(sum.cautious.rescuesSum).toBe(0);
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/sim/simulate.test.ts -t "distress gates"` — expect FAIL (`rescuesSum` missing).

- [ ] **Step 3: Implement.** In `src/sim/simulate.ts`:

Add to the imports: `canEscape` from `../engine/economy`, `DISTRESS_FUEL` from `../engine/preview`.

Add to `SimResult` (after `tails` :48):

```ts
/** Days marked 🟩 — beacons this persona answered (E3-3 observability). */
rescues: number;
```

and to `toResult` (:85):

```ts
    rescues: Object.values(s.dayHighlights).filter((k) => k === "rescue").length,
```

Re-sign `chooseEventOption` with the live state and add the policy (persona split: the turtle never diverts; greedy always does — the engine's fuel guard makes it safe; balanced diverts only when the diversion keeps the run escapable):

```ts
function chooseEventOption(kind: Archetype, ids: string[], s: GameState): string {
  if (ids.includes("answer")) {
    if (kind === "cautious") return "ignore";
    if (kind === "greedy") return "answer";
    return canEscape({ ...s, fuel: s.fuel - DISTRESS_FUEL }) ? "answer" : "ignore";
  }
  if (ids.includes("pay") && kind === "cautious") return "pay";
  if (ids.includes("flee") && kind !== "cautious") return "flee";
  if (ids.includes("collect")) return kind === "greedy" ? "collect" : "ignore";
  if (ids.includes("board")) return kind === "greedy" ? "board" : "leave";
  if (ids.includes("comply")) return "comply";
  return ids[0];
}
```

Both call sites (:139 and :162) become:

```ts
const choice = chooseEventOption(
  kind,
  r.event.choices.map((c) => c.id),
  r.state
);
```

Add `rescuesSum: number;` to `ArchetypeSummary` (after `tailsSum` :224), initialize it to 0 in `sweepSummary`'s seed object, and accumulate `sum.rescuesSum += r.rescues;` beside `sum.tailsSum += r.tails;`.

- [ ] **Step 4: Run the whole sim suite** — `npx vitest run tests/sim/simulate.test.ts`. The distress gates pass. Now handle the re-record, gate by gate:

**Rules:** a failing gate is re-recorded ONLY with its measured post-change number, a comment naming this round, and its semantic threshold intact. Check the three predictions from the plan header first:

| gate                                        | expectation                                                                                                                                                                |
| :------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| every run ends ≤ 12 / daysSurvived ≤ 12     | must hold untouched (`endRun` caps day 13)                                                                                                                                 |
| cautious+balanced audited ≥ 95              | prediction 3 — if balanced dips below 95, tighten the balanced policy (answer only when `s.fuel - DISTRESS_FUEL >= cheapestJumpCost(s.seed, s.location) + 1`) before knobs |
| greedy deaths 10–40                         | prediction 2 — may drift down from 35; both bounds must hold                                                                                                               |
| greedy > cautious peak                      | must hold untouched                                                                                                                                                        |
| depth anchor `\|cautious − base\| < 10,000` | prediction 1 — cautious is distress-inert; movement beyond ~2,000 from +907 means STOP and investigate                                                                     |
| balanced < baseline · balanced ≥ 0.55×base  | may shift with re-dealt events; re-record rationale if the 0.55 floor trips                                                                                                |
| viable loops ≥ 2/day                        | untouched (prices unchanged)                                                                                                                                               |
| pressure-curve lift ≥ 0.02 / toll ≥ 0.08    | should hold; heat and tolls are untouched                                                                                                                                  |
| per-modifier fairness ≥ 90%                 | now includes distress days; knob order if it trips: `DISTRESS_BAND` down, then `DISTRESS_FUEL` to 1                                                                        |

If a knob moves, update its ⚙ value in source, re-run the sweep, and record the final values in this plan and the spec's Deviations section.

- [ ] **Step 5: Full suite** — `npm test` green end to end.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(m5): sim personas answer beacons by temperament; sweep re-recorded (E3-3f)"
```

---

### Task 8: `stripKinds` — one derivation, three renderers

**Files:**

- Modify: `src/ui/share.ts` (`STRIP_GLYPHS` :34, `runStrip` :44, `stripSummary` :72)
- Test: `tests/engine/share.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `tests/engine/share.test.ts`:

```ts
describe("stripKinds (E3-5) — the one cell derivation", () => {
  it("derives one kind per day, death stamping a lost final day", () => {
    expect(stripKinds({ 1: "pirates" }, 3, "lost")).toEqual(["pirates", "plain", "death"]);
    expect(stripKinds({ 2: "delivery" }, 2, "audited")).toEqual(["plain", "delivery"]);
    expect(stripKinds({ 2: "rescue" }, 2, "retired")).toEqual(["plain", "rescue"]);
  });

  it("death outranks whatever else the final day held", () => {
    expect(stripKinds({ 2: "bigTrade" }, 2, "lost")).toEqual(["plain", "death"]);
  });
});
```

- [ ] **Step 2: Run** — expect FAIL (`stripKinds` not exported).

- [ ] **Step 3: Implement.** In `src/ui/share.ts`, replace `STRIP_GLYPHS`, `runStrip`, and `stripSummary` (:34–:93) with:

```ts
/** One cell of the run-strip: a day's highlight, an uneventful day, or the death day. */
export type StripCellKind = DayHighlightKind | "plain" | "death";

/**
 * The structured strip — one kind per day survived (E1-2/E3-5). The ONLY derivation:
 * runStrip maps it to emoji, screens.ts's stripCells to spans, and card.ts's cardOps to
 * drawn cells, so the pasted text, the debrief HTML, and the PNG tell one story (B-1).
 */
export function stripKinds(
  highlights: Partial<Record<number, DayHighlightKind>>,
  daysSurvived: number,
  status: RunEndStatus
): StripCellKind[] {
  const out: StripCellKind[] = [];
  for (let day = 1; day <= daysSurvived; day++) {
    if (day === daysSurvived && status === "lost") {
      out.push("death");
      continue;
    }
    out.push(highlights[day] ?? "plain");
  }
  return out;
}

const STRIP_GLYPHS: Record<StripCellKind, string> = {
  pirates: "🟥",
  rescue: "🟩",
  bigTrade: "💰",
  delivery: "🟨",
  plain: "🟦",
  death: "💀",
};

/** One glyph per day survived — the spoiler-free story of the run (E1-2). */
export function runStrip(
  highlights: Partial<Record<number, DayHighlightKind>>,
  daysSurvived: number,
  status: RunEndStatus
): string {
  return stripKinds(highlights, daysSurvived, status)
    .map((k) => STRIP_GLYPHS[k])
    .join("");
}

const STRIP_NOUNS: Record<DayHighlightKind, [one: string, many: string]> = {
  pirates: ["pirate encounter", "pirate encounters"],
  rescue: ["distress call answered", "distress calls answered"],
  bigTrade: ["big trade", "big trades"],
  delivery: ["delivery", "deliveries"],
};

/**
 * The run-strip in words, for assistive tech — the glyphs themselves read as a useless
 * run of "blue square, blue square". Derived from the same stripKinds the glyphs are.
 */
export function stripSummary(
  highlights: Partial<Record<number, DayHighlightKind>>,
  daysSurvived: number,
  status: RunEndStatus
): string {
  const kinds = stripKinds(highlights, daysSurvived, status);
  const tally = new Map<DayHighlightKind, number>();
  for (const k of kinds) {
    if (k === "plain" || k === "death") continue;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  const parts = (Object.keys(STRIP_NOUNS) as DayHighlightKind[])
    .filter((k) => tally.has(k))
    .map((k) => {
      const n = tally.get(k)!;
      return `${n} ${STRIP_NOUNS[k][n === 1 ? 0 : 1]}`;
    });
  if (kinds[kinds.length - 1] === "death") parts.push("lost on the final day");
  const days = `${daysSurvived} day${daysSurvived === 1 ? "" : "s"}`;
  return parts.length ? `${days}: ${parts.join(", ")}.` : `${days}, all uneventful.`;
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/engine/share.test.ts tests/ui/screens.test.ts` — expect PASS with **zero changes to any existing expectation**: the refactor is behavior-preserving (that is the proof the three renderers agree). Then `npm test` green.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(m5): stripKinds is the one strip derivation (E3-5a)"
```

---

### Task 9: `card.ts` — the card is deterministic data

**Files:**

- Create: `src/ui/card.ts`
- Test: `tests/ui/card.test.ts` (create)

- [ ] **Step 1: Write the failing tests** — create `tests/ui/card.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CARD_H, CARD_PALETTE, CARD_W, CardData, DrawOp, cardOps } from "../../src/ui/card";

const DATA: CardData = {
  dateLabel: "Aug 18",
  score: 4210,
  daysSurvived: 12,
  runNumber: 49,
  label: "The Daily",
  strip: "🟦".repeat(12),
  endLabel: "Audited",
  modifier: "☀ Clear skies",
  kinds: [
    "plain",
    "pirates",
    "delivery",
    "plain",
    "bigTrade",
    "plain",
    "rescue",
    "plain",
    "plain",
    "delivery",
    "plain",
    "plain",
  ],
  peak: 6100,
};

const textsOf = (ops: DrawOp[]): string[] =>
  ops.filter((o): o is Extract<DrawOp, { op: "text" }> => o.op === "text").map((o) => o.text);

describe("cardOps (E3-5) — the card is deterministic data", () => {
  it("is deterministic: same data, deep-equal ops", () => {
    expect(cardOps(DATA)).toEqual(cardOps({ ...DATA }));
  });

  it("stays inside the canvas", () => {
    for (const o of cardOps(DATA)) {
      if (o.op === "rect" || o.op === "rrect") {
        expect(o.x).toBeGreaterThanOrEqual(0);
        expect(o.y).toBeGreaterThanOrEqual(0);
        expect(o.x + o.w).toBeLessThanOrEqual(CARD_W);
        expect(o.y + o.h).toBeLessThanOrEqual(CARD_H);
      }
      if (o.op === "circle") {
        expect(o.x - o.r).toBeGreaterThanOrEqual(0);
        expect(o.x + o.r).toBeLessThanOrEqual(CARD_W);
        expect(o.y + o.r).toBeLessThanOrEqual(CARD_H);
      }
      if (o.op === "text") {
        expect(o.y).toBeGreaterThan(0);
        expect(o.y).toBeLessThanOrEqual(CARD_H);
      }
    }
  });

  it("draws one cell per day", () => {
    const cells = cardOps(DATA).filter((o) => o.op === "rrect" && o.w === 64 && o.h === 64);
    expect(cells).toHaveLength(DATA.kinds.length);
  });

  it("says the things a share card must say", () => {
    const texts = textsOf(cardOps(DATA));
    expect(texts).toContain("Score 4,210");
    expect(texts.some((t) => t.includes("#49 · Aug 18 · The Daily · ☀ Clear skies"))).toBe(true);
    expect(texts.some((t) => t.includes("survived 12 days — Audited"))).toBe(true);
    expect(texts.some((t) => t.includes("Peak 6,100cr"))).toBe(true);
    expect(texts.some((t) => t.includes("Beat my run:"))).toBe(true);
  });

  it("adds the feat line only when a feat was earned", () => {
    const texts = textsOf(cardOps({ ...DATA, featNames: ["High Roller", "Debt Free"] }));
    expect(texts.some((t) => t.includes("★ High Roller +1 more"))).toBe(true);
    expect(textsOf(cardOps(DATA)).some((t) => t.startsWith("★"))).toBe(false);
  });

  it("uses only palette colors", () => {
    const allowed = new Set<string>(Object.values(CARD_PALETTE));
    for (const o of cardOps(DATA)) {
      if ("fill" in o && o.fill) expect(allowed.has(o.fill), String(o.fill)).toBe(true);
      if ("stroke" in o && o.stroke) expect(allowed.has(o.stroke), String(o.stroke)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run tests/ui/card.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Create `src/ui/card.ts`:**

```ts
// src/ui/card.ts
//
// The image share card (E3-5): a pure display-list layout and a thin canvas painter.
// cardOps is deterministic data — testable without a canvas (vitest has none) — and
// paintCard just replays ops, so the testable half carries every decision (the
// pulse.ts split applied to pixels).
import { ShareData, StripCellKind, GAME_URL } from "./share";

export const CARD_W = 1200;
export const CARD_H = 630; // the 1.91:1 social-card ratio every paste target previews well

/** Hex mirrors of the design tokens — a canvas cannot read CSS custom properties.
 *  Sources: src/ui/tokens.css / docs/design/tokens.json. */
export const CARD_PALETTE = {
  bg: "#0b1520", // --st-bg-nebula
  panel: "#1b3144", // --st-bg-header-hi — the "plain day" cell (🟦's muted blue)
  ink: "#eaf6fb", // --st-text-hi
  dim: "#7ebee4", // the muted blue --st-bg-row-alt tints from
  cyan: "#00d9ff", // --st-cyan
  gold: "#ffb84d", // --st-gold — 💰 and 🟨
  green: "#57e6a8", // --st-positive — 🟩 rescue
  red: "#ff6a55", // --st-negative — 🟥 pirates, and the death cell's X
} as const;

export type DrawOp =
  | { op: "rect"; x: number; y: number; w: number; h: number; fill: string }
  | {
      op: "rrect";
      x: number;
      y: number;
      w: number;
      h: number;
      r: number;
      fill?: string;
      stroke?: string;
      lineWidth?: number;
    }
  | {
      op: "circle";
      x: number;
      y: number;
      r: number;
      fill?: string;
      stroke?: string;
      lineWidth?: number;
    }
  | {
      op: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stroke: string;
      lineWidth: number;
    }
  | {
      op: "text";
      x: number;
      y: number;
      text: string;
      font: string;
      fill: string;
      align: "left" | "center" | "right";
    };

export interface CardData extends ShareData {
  /** Structured strip from stripKinds() — the card draws cells, not emoji. */
  kinds: StripCellKind[];
  /** Peak net worth — the one breakdown line the text card omits. */
  peak: number;
}

// System stack, deliberately: the card must lay out identically whether or not a web
// font finished loading, and nothing here measures text.
const FONT = "system-ui, sans-serif";

const CELL = 64;
const CELL_GAP = 12;
const CELLS_PER_ROW = 12; // a full run is exactly one row

/** Fill per cell kind — the same story the emoji strip tells (share.ts STRIP_GLYPHS). */
const CELL_FILL: Record<StripCellKind, string> = {
  plain: CARD_PALETTE.panel,
  pirates: CARD_PALETTE.red,
  bigTrade: CARD_PALETTE.gold,
  delivery: CARD_PALETTE.gold,
  rescue: CARD_PALETTE.green,
  death: CARD_PALETTE.bg,
};

/** The small vector glyph inside a cell, centered on (cx, cy). Kinds that share a fill
 *  (bigTrade/delivery) are told apart by glyph: coin vs crate. */
function cellGlyph(kind: StripCellKind, cx: number, cy: number): DrawOp[] {
  const ink = CARD_PALETTE.bg; // glyphs sit on bright fills
  switch (kind) {
    case "pirates": // crossed sabres → thin X
      return [
        {
          op: "line",
          x1: cx - 11,
          y1: cy - 11,
          x2: cx + 11,
          y2: cy + 11,
          stroke: ink,
          lineWidth: 4,
        },
        {
          op: "line",
          x1: cx - 11,
          y1: cy + 11,
          x2: cx + 11,
          y2: cy - 11,
          stroke: ink,
          lineWidth: 4,
        },
      ];
    case "bigTrade": // coin
      return [
        { op: "circle", x: cx, y: cy, r: 12, stroke: ink, lineWidth: 4 },
        { op: "circle", x: cx, y: cy, r: 3, fill: ink },
      ];
    case "delivery": // crate
      return [
        { op: "rrect", x: cx - 11, y: cy - 11, w: 22, h: 22, r: 3, stroke: ink, lineWidth: 4 },
      ];
    case "rescue": // beacon ring
      return [
        { op: "circle", x: cx, y: cy, r: 12, stroke: ink, lineWidth: 3 },
        { op: "circle", x: cx, y: cy, r: 4, fill: ink },
      ];
    case "death": // bold red X on the dark cell
      return [
        {
          op: "line",
          x1: cx - 12,
          y1: cy - 12,
          x2: cx + 12,
          y2: cy + 12,
          stroke: CARD_PALETTE.red,
          lineWidth: 6,
        },
        {
          op: "line",
          x1: cx - 12,
          y1: cy + 12,
          x2: cx + 12,
          y2: cy - 12,
          stroke: CARD_PALETTE.red,
          lineWidth: 6,
        },
      ];
    case "plain":
      return [];
  }
}

/** The whole card as data. Same input → deep-equal output; every op inside CARD_W×CARD_H. */
export function cardOps(d: CardData): DrawOp[] {
  const ops: DrawOp[] = [
    { op: "rect", x: 0, y: 0, w: CARD_W, h: CARD_H, fill: CARD_PALETTE.bg },
    {
      op: "rrect",
      x: 12,
      y: 12,
      w: CARD_W - 24,
      h: CARD_H - 24,
      r: 16,
      stroke: CARD_PALETTE.cyan,
      lineWidth: 2,
    },
    {
      op: "text",
      x: 60,
      y: 96,
      text: "STARLIGHT TRADERS",
      font: `bold 44px ${FONT}`,
      fill: CARD_PALETTE.cyan,
      align: "left",
    },
    {
      op: "text",
      x: 60,
      y: 148,
      text: `#${d.runNumber} · ${d.dateLabel} · ${d.label} · ${d.modifier}`,
      font: `28px ${FONT}`,
      fill: CARD_PALETTE.dim,
      align: "left",
    },
    {
      op: "text",
      x: 60,
      y: 250,
      text: `Score ${d.score.toLocaleString("en-US")}`,
      font: `bold 64px ${FONT}`,
      fill: CARD_PALETTE.gold,
      align: "left",
    },
    {
      op: "text",
      x: 60,
      y: 300,
      text: `survived ${d.daysSurvived} day${d.daysSurvived === 1 ? "" : "s"} — ${d.endLabel}`,
      font: `30px ${FONT}`,
      fill: CARD_PALETTE.ink,
      align: "left",
    },
    {
      op: "text",
      x: 60,
      y: 344,
      text: `Peak ${d.peak.toLocaleString("en-US")}cr`,
      font: `24px ${FONT}`,
      fill: CARD_PALETTE.dim,
      align: "left",
    },
  ];

  // The strip: one centered row of CELLS_PER_ROW slots; a full run fills it exactly.
  const rowW = CELLS_PER_ROW * CELL + (CELLS_PER_ROW - 1) * CELL_GAP;
  const x0 = (CARD_W - rowW) / 2;
  const y0 = 392;
  d.kinds.forEach((kind, i) => {
    const x = x0 + (i % CELLS_PER_ROW) * (CELL + CELL_GAP);
    const y = y0 + Math.floor(i / CELLS_PER_ROW) * (CELL + CELL_GAP);
    // Dark cells (plain/death) get the dim border so they read against the bg.
    ops.push(
      kind === "plain" || kind === "death"
        ? {
            op: "rrect",
            x,
            y,
            w: CELL,
            h: CELL,
            r: 12,
            fill: CELL_FILL[kind],
            stroke: CARD_PALETTE.dim,
            lineWidth: 2,
          }
        : { op: "rrect", x, y, w: CELL, h: CELL, r: 12, fill: CELL_FILL[kind] }
    );
    ops.push(...cellGlyph(kind, x + CELL / 2, y + CELL / 2));
  });

  if (d.featNames?.length) {
    const feat = `★ ${d.featNames[0]}${d.featNames.length > 1 ? ` +${d.featNames.length - 1} more` : ""}`;
    ops.push({
      op: "text",
      x: CARD_W / 2,
      y: 528,
      text: feat,
      font: `26px ${FONT}`,
      fill: CARD_PALETTE.gold,
      align: "center",
    });
  }

  ops.push({
    op: "text",
    x: CARD_W / 2,
    y: 588,
    text: `Beat my run: ${GAME_URL}`,
    font: `24px ${FONT}`,
    fill: CARD_PALETTE.dim,
    align: "center",
  });
  return ops;
}

/** Replay ops onto a canvas. Browser-only; verified manually (the toast rule). */
export function paintCard(canvas: HTMLCanvasElement, ops: DrawOp[]): void {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  for (const o of ops) {
    switch (o.op) {
      case "rect":
        ctx.fillStyle = o.fill;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        break;
      case "rrect":
        ctx.beginPath();
        ctx.roundRect(o.x, o.y, o.w, o.h, o.r);
        if (o.fill) {
          ctx.fillStyle = o.fill;
          ctx.fill();
        }
        if (o.stroke) {
          ctx.strokeStyle = o.stroke;
          ctx.lineWidth = o.lineWidth ?? 1;
          ctx.stroke();
        }
        break;
      case "circle":
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        if (o.fill) {
          ctx.fillStyle = o.fill;
          ctx.fill();
        }
        if (o.stroke) {
          ctx.strokeStyle = o.stroke;
          ctx.lineWidth = o.lineWidth ?? 1;
          ctx.stroke();
        }
        break;
      case "line":
        ctx.beginPath();
        ctx.moveTo(o.x1, o.y1);
        ctx.lineTo(o.x2, o.y2);
        ctx.strokeStyle = o.stroke;
        ctx.lineWidth = o.lineWidth;
        ctx.lineCap = "round";
        ctx.stroke();
        break;
      case "text":
        ctx.font = o.font;
        ctx.fillStyle = o.fill;
        ctx.textAlign = o.align;
        ctx.fillText(o.text, o.x, o.y);
        break;
    }
  }
}

/** Copy the painted card as a PNG; false means "fall back to the text card". Safari
 *  requires the ClipboardItem to be constructed synchronously in the user gesture with
 *  a Promise payload — do not await the blob first. */
export async function copyCardImage(canvas: HTMLCanvasElement): Promise<boolean> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
  try {
    const blob = new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
        "image/png"
      )
    );
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/ui/card.test.ts` — expect PASS. `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(m5): the share card as a pure display-list + thin canvas painter (E3-5b)"
```

---

### Task 10: Run-end surfaces — preview img, Save PNG, honest button labels

**Files:**

- Modify: `src/ui/screens.ts` (`ShareStatus` :55, `shareButtonLabel` :58, `runEndScreen` :823)
- Modify: `src/ui/styles.css` (beside the `.run-end__strip` rules — `grep -n "run-end__strip" src/ui/styles.css`)
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing tests** — in `tests/ui/screens.test.ts`, find the `share button feedback (P2-4)` suite and replace its label assertions, then add the card assertions (the `META` fixture and `endRun` pattern are already in the file):

```ts
describe("share button feedback (P2-4/E3-5)", () => {
  it("labels the button by what actually landed", () => {
    const ended = endRun({ ...createGame(42), day: 12 }, "audited", "Audited.");
    expect(runEndScreen(ended, ended.runEnd!, false, META)).toContain("Copy score card");
    expect(runEndScreen(ended, ended.runEnd!, false, META, "img")).toContain("Copied image ✓");
    expect(runEndScreen(ended, ended.runEnd!, false, META, "text")).toContain("Copied text ✓");
    expect(runEndScreen(ended, ended.runEnd!, false, META, "fail")).toContain("Copy failed");
  });
});

describe("card preview and Save PNG (E3-5)", () => {
  it("renders the hidden preview img with the strip-summary alt text", () => {
    const ended = endRun({ ...createGame(42), day: 12 }, "audited", "Audited.");
    const html = runEndScreen(ended, ended.runEnd!, false, META);
    expect(html).toMatch(/<img id="share-card"[^>]*hidden/);
    expect(html).toMatch(/alt="Starlight #\d+ score card — /);
  });

  it("renders the hidden Save PNG anchor with the run-numbered filename", () => {
    const ended = endRun({ ...createGame(42), day: 12 }, "audited", "Audited.");
    const html = runEndScreen(ended, ended.runEnd!, false, META);
    expect(html).toMatch(/<a id="share-save"[^>]*download="starlight-\d+\.png"[^>]*hidden/);
    expect(html).toContain("Save PNG");
  });
});
```

(Delete the old `"ok"` assertion — `"ok"` is no longer a `ShareStatus`.)

- [ ] **Step 2: Run** — `npx vitest run tests/ui/screens.test.ts -t "share"` — expect FAIL.

- [ ] **Step 3: Implement.** In `src/ui/screens.ts` (:55–:61):

```ts
/** Result of the last share attempt, shown on the button for ~2s (P2-4/E3-5):
 *  which artifact actually landed — the PNG, the text fallback, or neither. */
export type ShareStatus = "idle" | "img" | "text" | "fail";

function shareButtonLabel(shareStatus: ShareStatus): string {
  if (shareStatus === "img") return "Copied image ✓";
  if (shareStatus === "text") return "Copied text ✓";
  if (shareStatus === "fail") return "Copy failed";
  return "Copy score card";
}
```

In `runEndScreen` (:823), add above the `return` (after `restart`):

```ts
// E3-5: the drawn card. Hidden until main.ts has pixels for it — a failed draw
// degrades to the HTML strip and the text copy, never a broken-image icon.
const cardImg = meta
  ? `<img id="share-card" class="run-end__card" hidden alt="Starlight #${meta.runNumber} score card — ${stripSummary(s.dayHighlights, r.daysSurvived, r.status)}">`
  : "";
const saveLink = meta
  ? `<a id="share-save" class="st-btn" download="starlight-${meta.runNumber}.png" hidden>Save PNG</a>`
  : "";
```

then render `${cardImg}` immediately before the strip paragraph (`<p class="run-end__strip">`), and `${saveLink}` immediately after the share button.

In `src/ui/styles.css`, beside the `.run-end__strip` rules:

```css
/* E3-5: the drawn card preview. Hidden until main.ts has pixels for it. */
.run-end__card {
  display: block;
  width: min(100%, 480px);
  margin: 8px auto;
  border: 1px solid color-mix(in srgb, var(--st-cyan) 30%, transparent);
  border-radius: 8px;
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/ui/screens.test.ts` — expect PASS. `npx tsc --noEmit` — main.ts still compiles because it only ever assigned `"ok" | "fail" | "idle"` via the handler this task hasn't touched yet; if the compiler flags the `"ok"` literal in main.ts:375, change it to `"text"` now and note that Task 11 rewrites the handler entirely.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(m5): run-end card preview, Save PNG, and honest share labels (E3-5c)"
```

---

### Task 11: main.ts wiring — draw once, copy image first, fall back honestly

**Files:**

- Modify: `src/main.ts` (share block :362–:380, `paint` :218, module state :91)
- Test: manual browser verification (DOM wiring outside the tested render layer — the Task 8 toast precedent)

- [ ] **Step 1: Extract the share payload builder.** In `src/main.ts`, above the action handler, add (moving the object literal out of the `act === "share"` block; `dateLabelOf`, `runLabel`, `lastDebrief`, `featDef`, `endHeadline`, `runNumber`, `runStrip`, `dailyModifier` are all already in scope/imports):

```ts
/** The share payload for the ended run, or null while playing. One builder for the
 *  text card and the drawn card (E3-5) — two artifacts, one story. */
function buildShareData(): ShareData | null {
  if (!state.runEnd) return null;
  return {
    dateLabel: dateLabelOf(state),
    score: state.runEnd.score,
    daysSurvived: state.runEnd.daysSurvived,
    runNumber: runNumber(state.bootDate),
    label: runLabel,
    strip: runStrip(state.dayHighlights, state.runEnd.daysSurvived, state.runEnd.status),
    endLabel: endHeadline(state.runEnd),
    featNames: (lastDebrief?.newFeats ?? []).map((id) => featDef(id).name),
    modifier: `${dailyModifier(state.seed).glyph} ${dailyModifier(state.seed).name}`,
  };
}
```

(Import `ShareData` and `stripKinds` from `./ui/share`, `RunEnd` from `./engine/types`, and `cardOps`, `copyCardImage`, `paintCard` from `./ui/card`.)

- [ ] **Step 2: Add the per-run card memo**, beside the other module state (:91):

```ts
// E3-5: the drawn card, painted once per run end. Keyed on the RunEnd object identity
// so a restarted run can never show the previous run's card. View-only, never persisted.
let cardFor: RunEnd | null = null;
let cardCanvas: HTMLCanvasElement | null = null;
let cardUrl: string | null = null;

function ensureCard(): void {
  if (!state.runEnd) {
    cardFor = null;
    cardCanvas = null;
    cardUrl = null;
    return;
  }
  if (cardFor === state.runEnd) return;
  const d = buildShareData();
  if (!d) return;
  try {
    const canvas = document.createElement("canvas");
    paintCard(
      canvas,
      cardOps({
        ...d,
        kinds: stripKinds(state.dayHighlights, state.runEnd.daysSurvived, state.runEnd.status),
        peak: state.peakNetWorth,
      })
    );
    cardCanvas = canvas;
    cardUrl = canvas.toDataURL("image/png");
    cardFor = state.runEnd;
  } catch {
    // Decoration failed; the HTML strip and the text copy still work.
    cardFor = null;
    cardCanvas = null;
    cardUrl = null;
  }
}
```

- [ ] **Step 3: Hook the paint cycle.** In `paint()` (:218), after the `render(...)` call (beside the toast/`prevVitals` bookkeeping):

```ts
// E3-5: re-assign the card pixels after every innerHTML swap (the node is fresh).
ensureCard();
const cardImg = document.getElementById("share-card") as HTMLImageElement | null;
if (cardImg && cardUrl) {
  cardImg.src = cardUrl;
  cardImg.hidden = false;
}
const saveLink = document.getElementById("share-save") as HTMLAnchorElement | null;
if (saveLink && cardUrl) {
  saveLink.href = cardUrl;
  saveLink.hidden = false;
}
```

- [ ] **Step 4: Rewrite the share handler** (:362–:380) — image first, text as the honest fallback, and the label reports which:

```ts
  if (act === "share") {
    const d = buildShareData();
    if (d) {
      ensureCard();
      shareStatus =
        cardCanvas && (await copyCardImage(cardCanvas))
          ? "img"
          : (await copyShare(d))
            ? "text"
            : "fail";
      if (shareResetTimer !== null) window.clearTimeout(shareResetTimer);
      shareResetTimer = window.setTimeout(() => {
        shareStatus = "idle";
        shareResetTimer = null;
        safePaint();
      }, 2000);
    }
  } else {
```

- [ ] **Step 5: Compile and test** — `npx tsc --noEmit` clean, `npm test` green (main.ts is outside the tested render layer).

- [ ] **Step 6: Verify in the browser.** Start the dev server and play a run to its end (Retire twice — it arms then confirms):

```bash
npm run dev
```

Confirm, in order:

1. The run-end screen shows the drawn card preview (not a broken image), matching the HTML strip cell-for-cell.
2. "Copy score card" → button flips to `Copied image ✓` and a paste into an image-accepting target (e.g. a rich-text editor) lands the PNG. In a browser without `ClipboardItem` the same click lands `Copied text ✓` and pastes the text card.
3. "Save PNG" downloads `starlight-<N>.png` at 1200×630.
4. Restart into a new run: no stale card flashes; the console is clean (no `Cannot read properties of null`).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(m5): image-first share with honest text fallback and Save PNG (E3-5d)"
```

---

### Task 12: Close out the round

**Files:**

- Modify: `docs/ROADMAP.md`, `docs/ENGAGEMENT_BACKLOG.md`, `docs/BACKLOG.md`
- Modify: `docs/superpowers/specs/2026-08-18-m5-round1-the-word-gets-out-design.md` (append Deviations)

- [ ] **Step 1: Full verification** — all of:

```bash
npx tsc --noEmit && npm test && npm run lint
```

Expected: clean, green, clean. (CI additionally runs the Lighthouse gate on push; the round adds static markup and one data-URL image, nothing that should move it.)

- [ ] **Step 2: Update ROADMAP.md.** Add below the Milestone 4 section:

```markdown
## 🟢 Milestone 5 — Launch cut

**Round 1 closed <date> ("The Word Gets Out"): E3-5 + E3-3 + E2-2k shipped together** — the
run card drawn to a 1200×630 PNG from a pure display-list with an image-first copy path
(text card kept as the honest fallback, Save PNG everywhere), the seventh event: a
distress beacon answered for 2⛽ + one full day at seeded 60/40 odds shown per E1-4, and
partition-neutral liquidation tax closing the last ±1cr path across the escape line.
<Record: final knob values, re-recorded gate numbers, greedy death count.>

| Item      | What                                               | Notes                                     |
| :-------- | :------------------------------------------------- | :---------------------------------------- |
| **E3-5**  | Image share card (canvas → PNG, drawn strip cells) | ✅ **Shipped <date>.** <one-line summary> |
| **E3-3**  | Distress Call (7th event, values-driven choice)    | ✅ **Shipped <date>.** <one-line summary> |
| **E2-2k** | Liquidation-tax neutrality (±1cr escape-line fix)  | ✅ **Shipped <date>.** <one-line summary> |
```

Replace the `<date>`/`<...>` markers with the actual close date, measured numbers, and any knob changes from Task 7. Remove E3-3 and E3-5 from the "⚪ Backlog — revisit later" table (leaving it empty or removing it) and update the "Already shipped (context)" paragraph.

- [ ] **Step 3: Update ENGAGEMENT_BACKLOG.md** — E3-3 row (:144) and E3-5 row (:146) get `✅ **Shipped <date>.**` prefixes with one-line summaries mirroring the ROADMAP rows; the E2-2k row (:134) gets `✅ **Resolved <date>.** Liquidation tax charges on the cumulative per-commodity gross (saleTax), so any partition of a stack telescopes to the single rounded charge.`; the triage note (:13) drops "Left in backlog: E3-3".

- [ ] **Step 4: Append the spec's Deviations section** — record the four plan-time deviations from this plan's header, plus anything Task 7 re-recorded (gate numbers, knob changes, persona-policy tightening) and anything found during browser verification.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(m5): close round 1 — the word gets out (E3-5 + E3-3 + E2-2k)"
```

- [ ] **Step 6: Hand off** — use superpowers:finishing-a-development-branch to merge/PR `feat/m5-round1-the-word-gets-out` per the user's preference.
