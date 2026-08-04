# M3 Round 2 — "Voice & Signal" (E2-4 + P3-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the world a voice (station dossiers, a named daily pirate crew, event text variants, death epilogues — E2-4) and make the log those words land in readable (day-stamped, newest-first, collapsed repeats, day dividers — P3-1).

**Architecture:** All new prose lives in one module, `src/engine/fiction.ts`, consumed by events.ts / game.ts / bulletin.ts / screens.ts. The crew name and epilogue derive from salted hashes of the run seed (zero game-RNG impact); event description variants come from a _second_ draw on `rollEvent`'s local, otherwise-discarded rng, so event kinds stay byte-identical per seed. `LogEntry` gains an optional `day` (no snapshot version bump); collapsing and newest-first ordering happen at render time only, so the turn report, delta-conservation tests, and sim never see them.

**Tech Stack:** TypeScript + Vite, Vitest, no runtime deps. Tests: `npm test` (all) or `npx vitest run <path>` (one file).

**Spec:** [docs/superpowers/specs/2026-08-04-m3-round2-voice-and-signal-design.md](../specs/2026-08-04-m3-round2-voice-and-signal-design.md)

---

## File map

| File                            | Change                                                                            |
| :------------------------------ | :-------------------------------------------------------------------------------- |
| `src/engine/fiction.ts`         | **Create** — roster, `crewName`, `capFirst`, dossiers, event variants, `epilogue` |
| `src/engine/events.ts`          | Second local draw; factories take a description                                   |
| `src/engine/game.ts`            | Crew-voiced pirate lines; `withLog`/`createGame` stamp `day`                      |
| `src/engine/run-end.ts`         | `endRun`'s log push stamps `day`                                                  |
| `src/engine/bulletin.ts`        | Raider line names the crew                                                        |
| `src/engine/types.ts`           | `LogEntry.day?: number`                                                           |
| `src/ui/storage.ts`             | `isValidLogEntry` accepts/validates `day`                                         |
| `src/ui/screens.ts`             | `collapseLog` helper; `logPanel` rewrite; dossier line; epilogue                  |
| `src/ui/styles.css`             | `.log-day-divider`, `.log-line--past`, `.station-dossier`, `.run-end__epilogue`   |
| `tests/engine/fiction.test.ts`  | **Create**                                                                        |
| `tests/engine/events.test.ts`   | RNG-order pin + variant tests                                                     |
| `tests/engine/game.test.ts`     | Crew-line + day-stamp tests                                                       |
| `tests/engine/run-end.test.ts`  | Day-stamp test                                                                    |
| `tests/engine/bulletin.test.ts` | Update exact-string raider-line test                                              |
| `tests/ui/storage.test.ts`      | Day round-trip / legacy / corrupt tests                                           |
| `tests/ui/screens.test.ts`      | collapse/divider/dossier/epilogue tests; update P2-1 log test                     |

---

### Task 1: Fiction module — crew roster, `crewName`, `capFirst`, epilogues

**Files:**

- Create: `src/engine/fiction.ts`
- Test: `tests/engine/fiction.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `tests/engine/fiction.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CREW_ROSTER, crewName, capFirst, epilogue } from "../../src/engine/fiction";

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

describe("crewName (E2-4b)", () => {
  it("every roster name is non-empty and ≤ 16 chars (bulletin line budget)", () => {
    expect(CREW_ROSTER.length).toBeGreaterThanOrEqual(10);
    for (const name of CREW_ROSTER) {
      expect(name.length).toBeGreaterThan(0);
      expect(name.length, name).toBeLessThanOrEqual(16);
    }
  });

  it("is deterministic per seed and varies across seeds", () => {
    const names = new Set(SEEDS.map((s) => crewName(s)));
    expect(crewName(42)).toBe(crewName(42));
    expect(names.size).toBeGreaterThanOrEqual(2);
    for (const n of names) expect(CREW_ROSTER).toContain(n);
  });
});

describe("capFirst", () => {
  it("upper-cases only the first character", () => {
    expect(capFirst("the Red Kestrel")).toBe("The Red Kestrel");
    expect(capFirst("")).toBe("");
  });
});

describe("epilogue (E2-4d)", () => {
  it("is deterministic per (seed, cause), varies across seeds, and stays ≤ 160 chars", () => {
    for (const cause of ["hull", "fuel"] as const) {
      expect(epilogue(42, cause)).toBe(epilogue(42, cause));
      const texts = new Set(SEEDS.map((s) => epilogue(s, cause)));
      expect(texts.size).toBeGreaterThanOrEqual(2);
      for (const t of texts) {
        expect(t.length).toBeGreaterThan(0);
        expect(t.length, t).toBeLessThanOrEqual(160);
      }
    }
  });

  it("hull and fuel epilogues are distinct pools", () => {
    const hull = new Set(SEEDS.map((s) => epilogue(s, "hull")));
    const fuel = new Set(SEEDS.map((s) => epilogue(s, "fuel")));
    for (const t of hull) expect(fuel.has(t)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/fiction.test.ts`
Expected: FAIL — `Cannot find module '../../src/engine/fiction'`

- [ ] **Step 3: Create `src/engine/fiction.ts` (roster + epilogues only for now)**

```ts
// src/engine/fiction.ts
//
// The fiction pack (E2-4): every piece of world-voice prose in one module, so the
// Syndicate's dry menace (E0-4) stays one voice and tests can sweep one file.
// Nothing here touches game RNG — crew and epilogue picks come from salted hashes
// of the run seed, and event variants are selected by rollEvent's own local rng.
import { GameEventKind, LossCause, NodeId } from "./types";
import { hashSeed } from "./rng";

// Distinct salts so crew and epilogue picks are independent hashes of the same seed.
const CREW_SALT = 0xc4e7;
const EPILOGUE_SALT = 0xe916;

/** Today's villains. Every name ≤ 16 chars so the bulletin line keeps its 70-char budget. */
export const CREW_ROSTER: string[] = [
  "the Red Kestrel",
  "the Void Jackals",
  "the Pale Corsair",
  "the Ash Vultures",
  "the Grey Wake",
  "the Iron Shrike",
  "the Last Tide",
  "the Dust Barons",
  "the Hollow Crown",
  "the Silent Reef",
  "the Rust Queens",
  "the Comet's Due",
];

/** The pirate crew everyone flying today's seed will meet (E2-4b). */
export function crewName(seed: number): string {
  return CREW_ROSTER[hashSeed(seed, CREW_SALT) % CREW_ROSTER.length];
}

/** Sentence-start helper for crew names ("the Red Kestrel" → "The Red Kestrel"). */
export function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Three send-offs per way to die (E2-4d), picked per run seed — same-day players
// who die the same way read the same line. Each ≤ 160 chars.
const EPILOGUES: Record<LossCause, string[]> = {
  hull: [
    "The Syndicate notes the loss of its collateral with regret — the regret of an accountant, not a mourner.",
    "Wreckage on the lane, cargo scattered to the void. Some other trader will scoop up what's left of your run.",
    "The ship broke apart with the ledger still open. The Syndicate writes off the hull; the debt, it remembers.",
  ],
  fuel: [
    "The dock lights stay on all night. Nobody comes. The Syndicate's collections skiff is already en route.",
    "A trader without fuel is just a tenant with a view. The station bills by the hour; the Syndicate bills forever.",
    "You watch ships leave without you. The Syndicate's ledger closes on the sound of engines you can't afford.",
  ],
};

/** The cause-matched send-off for a lost run (E2-4d). Pure — derived at render. */
export function epilogue(seed: number, cause: LossCause): string {
  const pool = EPILOGUES[cause];
  return pool[hashSeed(seed, EPILOGUE_SALT) % pool.length];
}

// STATION_DOSSIERS and EVENT_VARIANTS are added in the next task.
export const STATION_DOSSIERS = {} as Record<NodeId, string>;
export const EVENT_VARIANTS = {} as Record<GameEventKind, ((crew: string) => string)[]>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine/fiction.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/fiction.ts tests/engine/fiction.test.ts
git commit -m "feat(fiction): crew roster, crewName, capFirst, and death epilogues (E2-4b/d)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Fiction module — station dossiers + event variants

**Files:**

- Modify: `src/engine/fiction.ts` (replace the two stub exports at the bottom)
- Test: `tests/engine/fiction.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `tests/engine/fiction.test.ts`)

```ts
import { STATION_DOSSIERS, EVENT_VARIANTS } from "../../src/engine/fiction";
import { NODE_IDS } from "../../src/engine/world";
import { GameEventKind } from "../../src/engine/types";

describe("STATION_DOSSIERS (E2-4a)", () => {
  it("every station has a non-empty dossier ≤ 110 chars", () => {
    for (const node of NODE_IDS) {
      const d = STATION_DOSSIERS[node];
      expect(d.length, node).toBeGreaterThan(0);
      expect(d.length, `${node}: "${d}"`).toBeLessThanOrEqual(110);
    }
  });

  it("each dossier teaches its station's mechanic (keyword presence — E2-4a)", () => {
    // The consequence each station's numbers imply, as a checkable keyword:
    // terra fee 1.6× → "fees"; kiruna fee 0.6× → "dock"; vulcan danger 0.15 →
    // "approach"; verge danger 0.5 / tax 0 → "raiders"; meridian tax 0.18 → "18%".
    const KEYWORD: Record<(typeof NODE_IDS)[number], string> = {
      terra: "fees",
      kiruna: "dock",
      vulcan: "approach",
      verge: "raiders",
      meridian: "18%",
    };
    for (const node of NODE_IDS) {
      expect(STATION_DOSSIERS[node].toLowerCase()).toContain(KEYWORD[node]);
    }
  });
});

describe("EVENT_VARIANTS (E2-4c)", () => {
  const KINDS: GameEventKind[] = ["quiet", "pirates", "salvage", "derelict", "customs", "engine"];

  it("every kind has ≥ 3 variants, each non-empty and ≤ 200 chars", () => {
    for (const kind of KINDS) {
      const variants = EVENT_VARIANTS[kind];
      expect(variants.length, kind).toBeGreaterThanOrEqual(3);
      for (const v of variants) {
        const text = v("the Red Kestrel");
        expect(text.length).toBeGreaterThan(0);
        expect(text.length, `${kind}: "${text}"`).toBeLessThanOrEqual(200);
      }
    }
  });

  it("every pirate variant names the crew", () => {
    for (const v of EVENT_VARIANTS.pirates) {
      expect(v("the Red Kestrel").toLowerCase()).toContain("the red kestrel");
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/fiction.test.ts`
Expected: FAIL — dossier/variant reads on the empty stub objects (`undefined.length`)

- [ ] **Step 3: Replace the two stub exports in `src/engine/fiction.ts`**

Delete the two stub lines at the bottom and add:

```ts
/**
 * One line per station, each teaching the mechanic its numbers already encode
 * (E2-4a). Rendered ahead of the mechanical intel line — voice first, numbers
 * verbatim after. Each ≤ 110 chars. Keep the taught keyword (see fiction.test.ts)
 * when editing: terra "fees", kiruna "dock", vulcan "approach", verge "raiders",
 * meridian "18%".
 */
export const STATION_DOSSIERS: Record<NodeId, string> = {
  terra:
    "The old capital's docks charge like it still matters — every trader passes through, and the fees know it.",
  kiruna:
    "Ice miners sell water for next to nothing and ask less to dock — the Belt runs on volume, not margin.",
  vulcan:
    "The yards forge machine parts cheap and pay well for water — keep an eye on the approach lanes.",
  verge:
    "No flag, no tax, no help when the raiders come — The Verge pays top rates to whoever survives the trip.",
  meridian:
    "The core world tithes 18% and inspects your hold for the privilege — luxury sells dear, if it clears customs.",
};

/**
 * Description variants per event kind (E2-4c), selected by rollEvent's second
 * local draw. All take the crew name so pirate lines can be templates; the other
 * kinds ignore the argument (one shape, no union churn at the call site).
 */
export const EVENT_VARIANTS: Record<GameEventKind, ((crew: string) => string)[]> = {
  quiet: [
    () => "The void is calm. You arrive without incident.",
    () => "Nothing but static and starlight the whole way in. The kettle even stayed hot.",
    () => "A quiet run. Out here, that counts as a small miracle.",
  ],
  pirates: [
    (crew) =>
      `Raiders flying ${crew}'s colors demand tribute. Pay them off, or run and risk hull damage.`,
    (crew) =>
      `${capFirst(crew)} drop out of the dark dead ahead. Their terms are simple: pay, or outrun the volley.`,
    (crew) =>
      `A toll bell rings over the comm — ${crew} collect on this lane. Pay up, or burn for the gap.`,
  ],
  salvage: [
    () =>
      "Debris drifts nearby — mostly cargo, but war-era wrecks sometimes hide live ordnance. Scoop it up?",
    () =>
      "A shattered freighter litters the lane with containers. Some seals look intact — and some look armed.",
    () =>
      "Wreckage pings on the scope: crates, plating, and the occasional thing that still blinks. Scoop it up?",
  ],
  derelict: [
    () => "An abandoned freighter floats silent. Board it? Could be treasure — or a trap.",
    () =>
      "A dead ship drifts across your path, running lights long cold. The airlock is unlocked. Luck, or bait.",
    () =>
      "A derelict hangs in the black, cargo bay sealed. Salvors' rule: first aboard keeps it — if it isn't rigged.",
  ],
  customs: [
    () => "Inspectors scan your hold. Undeclared luxury goods may be seized.",
    () =>
      "Meridian customs sweeps your manifest twice and your hold once. Luxury draws the long scan.",
    () =>
      "A customs cutter locks alignment. 'Routine inspection.' Nobody on this dock believes that word.",
  ],
  engine: [
    () => "A coolant leak burns extra fuel before you patch it.",
    () => "The starboard injector coughs, drinks deep, and settles — after it costs you.",
    () =>
      "Something rattles loose behind the reactor shroud. The fix holds; the fuel gauge remembers.",
  ],
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/engine/fiction.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/engine/fiction.ts tests/engine/fiction.test.ts
git commit -m "feat(fiction): station dossiers and event description variants (E2-4a/c)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: events.ts — RNG-order pin + variant/crew wiring

**Files:**

- Modify: `src/engine/events.ts`
- Test: `tests/engine/events.test.ts`

- [ ] **Step 1: Write the RNG-order pin test FIRST — it must pass BEFORE the change too**

This test mirrors the band arithmetic as an independent oracle: the kind must be
decided by the **first** draw of the route rng. It passes against today's code and
keeps passing only if the wiring change leaves the first draw's meaning untouched.
Append to `tests/engine/events.test.ts`:

```ts
import { mulberry32, hashSeed } from "../../src/engine/rng";
import { NODE_IDS } from "../../src/engine/world";
import { crewName } from "../../src/engine/fiction";
import { NodeId } from "../../src/engine/types";

describe("RNG order preservation (E2-4c)", () => {
  it("kind is decided by the first draw of the route rng alone", () => {
    const routes: [NodeId, NodeId][] = [
      ["terra", "verge"],
      ["terra", "kiruna"],
      ["vulcan", "meridian"],
      ["verge", "terra"],
    ];
    for (let seed = 1; seed <= 10; seed++) {
      for (let day = 1; day <= 12; day++) {
        for (const [from, to] of routes) {
          const rng = mulberry32(
            hashSeed(seed, day, NODE_IDS.indexOf(from), NODE_IDS.indexOf(to), 31)
          );
          const r = rng();
          const pPirates = pirateChance(to);
          const pSalvage = pPirates + 0.18;
          const pEngine = pSalvage + 0.1;
          const pDerelict = pEngine + 0.12;
          const pCustoms = to === "meridian" ? pDerelict + 0.15 : pDerelict;
          const expected =
            r < pPirates
              ? "pirates"
              : r < pSalvage
                ? "salvage"
                : r < pEngine
                  ? "engine"
                  : r < pDerelict
                    ? "derelict"
                    : r < pCustoms
                      ? "customs"
                      : "quiet";
          expect(rollEvent(seed, day, from, to).kind).toBe(expected);
        }
      }
    }
  });
});
```

Run: `npx vitest run tests/engine/events.test.ts`
Expected: PASS — this is a pin, not a fail-first test. It must be green before AND after the wiring change.

- [ ] **Step 2: Write the failing variant tests** (append to `tests/engine/events.test.ts`)

```ts
describe("event description variants (E2-4b/c)", () => {
  it("descriptions are deterministic per (seed, day, route)", () => {
    expect(rollEvent(3, 5, "terra", "verge").description).toBe(
      rollEvent(3, 5, "terra", "verge").description
    );
  });

  it("each kind shows ≥ 2 distinct descriptions across a sweep", () => {
    const byKind = new Map<string, Set<string>>();
    for (let seed = 1; seed <= 30; seed++) {
      for (let day = 1; day <= 12; day++) {
        for (const to of ["verge", "meridian"] as const) {
          const e = rollEvent(seed, day, "terra", to);
          if (!byKind.has(e.kind)) byKind.set(e.kind, new Set());
          byKind.get(e.kind)!.add(e.description);
        }
      }
    }
    for (const [kind, descs] of byKind) {
      expect(descs.size, kind).toBeGreaterThanOrEqual(2);
    }
  });

  it("pirate descriptions name today's crew", () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (let day = 1; day <= 12; day++) {
        const e = rollEvent(seed, day, "terra", "verge");
        if (e.kind === "pirates") {
          expect(e.description.toLowerCase()).toContain(crewName(seed).toLowerCase());
        }
      }
    }
  });
});
```

Run: `npx vitest run tests/engine/events.test.ts`
Expected: FAIL — "each kind shows ≥ 2 distinct descriptions" (today every kind has exactly one static description). The determinism test passes already; that's fine.

- [ ] **Step 3: Rewire `src/engine/events.ts`**

Replace the whole file body below `pirateChance` (keep the header comment, imports get one addition, and `pirateChance` stays as-is):

```ts
// src/engine/events.ts
import { GameEvent, GameEventKind, NodeId } from "./types";
import { NODES, NODE_IDS } from "./world";
import { mulberry32, hashSeed } from "./rng";
import { EVENT_VARIANTS, crewName } from "./fiction";

/**
 * True chance of a pirate ambush on arrival at `to` — the exact band rollEvent uses.
 * Exported so the UI shows the number the engine rolls with (E1-4): the flat 10%
 * floor means no route is ever "0%".
 */
export function pirateChance(to: NodeId): number {
  return 0.1 + NODES[to].danger * 0.45;
}

/**
 * Roll the in-transit event for a jump. Hostility scales with destination danger.
 * Customs only fires when arriving at meridian.
 */
export function rollEvent(seed: number, day: number, from: NodeId, to: NodeId): GameEvent {
  // Hash full station identity (their NODE_IDS indices), not first characters —
  // "vulcan"/"verge" both start with 'v' and used to share every event roll (B-2).
  const rng = mulberry32(hashSeed(seed, day, NODE_IDS.indexOf(from), NODE_IDS.indexOf(to), 31));
  const r = rng();
  // E2-4c: a SECOND draw on the same local rng picks the description variant. The
  // kind reads only `r`, and this rng is created fresh per call and discarded — so
  // event outcomes stay byte-identical for every seed; only the prose varies.
  const v = rng();
  const describe = (kind: GameEventKind): string => {
    const variants = EVENT_VARIANTS[kind];
    return variants[Math.floor(v * variants.length)](crewName(seed));
  };

  // Probability bands grow the hostile slice with danger.
  const pPirates = pirateChance(to);
  const pSalvage = pPirates + 0.18;
  const pEngine = pSalvage + 0.1;
  const pDerelict = pEngine + 0.12;
  const pCustoms = to === "meridian" ? pDerelict + 0.15 : pDerelict;

  if (r < pPirates) return pirates(describe("pirates"));
  if (r < pSalvage) return salvage(describe("salvage"));
  if (r < pEngine) return engine(describe("engine"));
  if (r < pDerelict) return derelict(describe("derelict"));
  if (r < pCustoms) return customs(describe("customs"));
  return quiet(describe("quiet"));
}

// Titles stay static (tests, a11y, and choice odds/stakes key on kind and title);
// the fiction rides in `description` (spec decision 8).
function pirates(description: string): GameEvent {
  return {
    kind: "pirates",
    title: "Pirate Ambush",
    description,
    choices: [
      { id: "pay", label: "Pay tribute (lose credits)" },
      { id: "flee", label: "Run for it (risk hull)" },
    ],
  };
}
function salvage(description: string): GameEvent {
  return {
    kind: "salvage",
    title: "Salvage Field",
    description,
    choices: [
      { id: "collect", label: "Scoop the debris (gamble)" },
      { id: "ignore", label: "Stay on course" },
    ],
  };
}
function engine(description: string): GameEvent {
  return {
    kind: "engine",
    title: "Engine Trouble",
    description,
    choices: [{ id: "ack", label: "Patch it up" }],
  };
}
function derelict(description: string): GameEvent {
  return {
    kind: "derelict",
    title: "Derelict Hulk",
    description,
    choices: [
      { id: "board", label: "Board it (gamble)" },
      { id: "leave", label: "Leave it be" },
    ],
  };
}
function customs(description: string): GameEvent {
  return {
    kind: "customs",
    title: "Meridian Customs",
    description,
    choices: [
      { id: "comply", label: "Submit to inspection" },
      { id: "bribe", label: "Bribe the inspector" },
    ],
  };
}
function quiet(description: string): GameEvent {
  return {
    kind: "quiet",
    title: "Quiet Jump",
    description,
    choices: [{ id: "ack", label: "Continue" }],
  };
}
```

- [ ] **Step 4: Run the events suite — pin AND variant tests must pass**

Run: `npx vitest run tests/engine/events.test.ts`
Expected: PASS (all, including the Step-1 pin)

- [ ] **Step 5: Run the full suite to catch downstream assumptions**

Run: `npm test`
Expected: PASS. If a test elsewhere asserted a specific event description string, update it to assert on `kind`/`title` instead (none is known to; the sweep in `tests/sim/simulate.test.ts` never reads descriptions).

- [ ] **Step 6: Commit**

```bash
git add src/engine/events.ts tests/engine/events.test.ts
git commit -m "feat(events): seeded description variants + named pirate crew, RNG order pinned (E2-4b/c)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: game.ts — crew-voiced pirate resolution lines

**Files:**

- Modify: `src/engine/game.ts:525-538` (`resolvePirates`)
- Test: `tests/engine/game.test.ts`

- [ ] **Step 1: Write the failing test** (append inside the existing `describe("resolveChoice", ...)` block in `tests/engine/game.test.ts`; add `import { crewName } from "../../src/engine/fiction";` at the top)

```ts
it("pirate resolution lines name the daily crew, tones and deltas unchanged (E2-4b)", () => {
  const s = createGame(42);
  const evt = {
    kind: "pirates" as const,
    title: "",
    description: "",
    choices: [
      { id: "pay", label: "" },
      { id: "flee", label: "" },
    ],
  };
  const crew = crewName(42);

  const paid = resolveChoice(s, evt, "pay");
  const payLine = paid.log[paid.log.length - 1];
  expect(payLine.msg).toContain(crew);
  expect(payLine.tone).toBe("bad");
  expect(payLine.delta).toBe(paid.credits - s.credits); // still the negative toll

  const fled = resolveChoice(s, evt, "flee");
  const fleeLine = fled.log[fled.log.length - 1];
  expect(fleeLine.msg).toContain(crew);
  expect(fleeLine.tone).toBe("bad");
  expect(fleeLine.delta).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/game.test.ts -t "pirate resolution lines"`
Expected: FAIL — msg is "Paid pirates 64cr." (no crew name)

- [ ] **Step 3: Update `resolvePirates` in `src/engine/game.ts`**

Add the import at the top of game.ts: `import { crewName } from "./fiction";`
Then replace the function:

```ts
function resolvePirates(s: GameState, choiceId: string): GameState {
  const marked = markDay(s, "pirates");
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
  return withLog(
    { ...marked, hull: marked.hull - dmg },
    `Outran ${crew} — took ${dmg} hull damage.`,
    "bad"
  );
}
```

- [ ] **Step 4: Check nothing keys on the old strings, then run the suites**

Run: `grep -rn "Paid pirates\|Fled — took" src tests`
Expected: no hits outside test files you just changed; if `tests/ui/screens.test.ts` uses "Fled — took 16 hull damage." as sample log _content_ (it does, in the P2-1 rendering tests), leave it — those are hand-built log entries, not assertions about resolvePirates output.

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/game.ts tests/engine/game.test.ts
git commit -m "feat(game): pirate pay/flee log lines name the daily crew (E2-4b)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: bulletin.ts — the raider line names the crew

**Files:**

- Modify: `src/engine/bulletin.ts:45`
- Test: `tests/engine/bulletin.test.ts:67-71`

- [ ] **Step 1: Update the exact-string test** (replace the `"the riskiest line reads correctly..."` test in `tests/engine/bulletin.test.ts`; add `import { crewName, capFirst } from "../../src/engine/fiction";` at the top)

```ts
it("the riskiest line names today's crew on the approach to the highest-raid node", () => {
  for (const seed of SEEDS) {
    expect(bulletin(seed)[2]).toBe(
      `${capFirst(crewName(seed))} chatter thick on the approach to The Verge`
    );
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/bulletin.test.ts`
Expected: FAIL — line still reads "Raider chatter thick…"

- [ ] **Step 3: Update `src/engine/bulletin.ts`**

Add the import: `import { crewName, capFirst } from "./fiction";`
Replace the third returned line (bulletin.ts:45):

```ts
    `${capFirst(crewName(seed))} chatter thick on the approach to ${NODES[riskiest].name}`,
```

- [ ] **Step 4: Run test to verify it passes — including the standing ≤ 70-char sweep**

Run: `npx vitest run tests/engine/bulletin.test.ts`
Expected: PASS (the existing "every line stays within 70 characters" test now also guards the crew-name budget: worst case 16 + 34 + 12 = 62)

- [ ] **Step 5: Commit**

```bash
git add src/engine/bulletin.ts tests/engine/bulletin.test.ts
git commit -m "feat(bulletin): raider line names today's pirate crew (E2-4b)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Day-stamped log entries

**Files:**

- Modify: `src/engine/types.ts:77-82` (`LogEntry`), `src/engine/game.ts:94-104` (`withLog`) and `:82-87` (createGame opening line), `src/engine/run-end.ts:52`
- Test: `tests/engine/game.test.ts`, `tests/engine/run-end.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine/game.test.ts` (top level; make sure `refuel` and `jump` are in the game import — `jump` already is):

```ts
describe("log day stamps (P3-1a)", () => {
  it("every log entry is stamped with the day it was written", () => {
    let s = createGame(42);
    expect(s.log[0].day).toBe(1);
    s = refuel(s, 2);
    expect(s.log[s.log.length - 1].day).toBe(1);
    const j = jump(s, "vulcan");
    // The docking-fee line is written after the day advances.
    expect(j.state.log[j.state.log.length - 1].day).toBe(2);
  });
});
```

Append to `tests/engine/run-end.test.ts` (imports for `createGame` and `endRun` already exist there; add any missing):

```ts
it("the end-of-run log line carries the final day (P3-1a)", () => {
  const s = { ...createGame(42), day: 7 };
  const ended = endRun(s, "retired", "done");
  const last = ended.log[ended.log.length - 1];
  expect(last.msg).toBe("done");
  expect(last.day).toBe(7);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/game.test.ts -t "day stamps" && npx vitest run tests/engine/run-end.test.ts`
Expected: FAIL — `day` is `undefined` on every entry

- [ ] **Step 3: Implement**

`src/engine/types.ts` — extend `LogEntry`:

```ts
/** A structured log line: the engine declares tone and (for money lines) the credit delta. */
export interface LogEntry {
  msg: string;
  tone: LogTone;
  /** Signed credit movement, present only when the line is about credits. */
  delta?: number;
  /** Game day the entry was written (P3-1a); absent on entries from pre-round snapshots. */
  day?: number;
}
```

`src/engine/game.ts` — `withLog` stamps the day:

```ts
function withLog(
  state: GameState,
  msg: string,
  tone: LogTone = "neutral",
  delta?: number
): GameState {
  return {
    ...state,
    log: [...state.log, { msg, tone, day: state.day, ...(delta === undefined ? {} : { delta }) }],
  };
}
```

`src/engine/game.ts` — the `createGame` opening entry gains `day: 1`:

```ts
    log: [
      {
        msg: `The Syndicate staked your ship — ${STARTING.debt.toLocaleString()}cr, compounding. Bank your fortune before the Day ${RUN_LENGTH} audit. Everyone flies today's sky.`,
        tone: "neutral" as const,
        day: 1,
      },
    ],
```

`src/engine/run-end.ts` — `endRun`'s direct push stamps the day (line 52):

```ts
    log: [...state.log, { msg: cause, tone: status === "lost" ? "bad" : "neutral", day: state.day }],
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — day is additive; no existing assertion reads it. If a `toEqual` on whole log arrays fails somewhere, extend its expected entries with the day the action ran on.

- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts src/engine/game.ts src/engine/run-end.ts tests/engine/game.test.ts tests/engine/run-end.test.ts
git commit -m "feat(engine): stamp log entries with the game day (P3-1a)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: storage.ts — validate the optional day

**Files:**

- Modify: `src/ui/storage.ts:259-266` (`isValidLogEntry`)
- Test: `tests/ui/storage.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `tests/ui/storage.test.ts`, inside or after the `parseSnapshot` describe — the `liveSnapshot`, `TODAY`, `BOOT` helpers at lines 162-175 are in scope)

```ts
describe("log day stamps in snapshots (P3-1a)", () => {
  it("round-trips day-stamped log entries", () => {
    const base = createGame(42, BOOT);
    const snap = liveSnapshot({
      state: { ...base, log: [...base.log, { msg: "x", tone: "neutral", day: 1 }] },
    });
    expect(parseSnapshot(JSON.stringify(snap), TODAY)).toEqual(snap);
  });

  it("accepts day-less legacy entries — a pre-round v3 snapshot resumes", () => {
    const base = createGame(42, BOOT);
    const legacy = { ...base, log: [{ msg: "old line", tone: "neutral" as const }] };
    expect(parseSnapshot(JSON.stringify(liveSnapshot({ state: legacy })), TODAY)).not.toBeNull();
  });

  it("rejects a corrupt day on a log entry", () => {
    const base = createGame(42, BOOT);
    for (const day of [-1, 0, "x"]) {
      const bad = {
        ...base,
        log: [{ msg: "old", tone: "neutral", day }],
      } as unknown as typeof base;
      expect(parseSnapshot(JSON.stringify(liveSnapshot({ state: bad })), TODAY)).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run tests to verify the corrupt-day one fails**

Run: `npx vitest run tests/ui/storage.test.ts -t "log day stamps"`
Expected: round-trip and legacy PASS already (extra fields survive JSON and validation ignores unknown keys); "rejects a corrupt day" FAILS — today's validator doesn't look at `day`.

- [ ] **Step 3: Extend `isValidLogEntry` in `src/ui/storage.ts`**

```ts
/**
 * A rehydrated log line must carry a string msg, a known tone, and — when present —
 * a finite numeric delta and a finite day ≥ 1 (P3-1a; absent on pre-round snapshots).
 */
function isValidLogEntry(l: unknown): boolean {
  if (typeof l !== "object" || l === null) return false;
  const entry = l as { msg?: unknown; tone?: unknown; delta?: unknown; day?: unknown };
  if (typeof entry.msg !== "string") return false;
  if (!LOG_TONES.has(entry.tone)) return false;
  if (entry.delta !== undefined && !Number.isFinite(entry.delta)) return false;
  return entry.day === undefined || (Number.isFinite(entry.day) && (entry.day as number) >= 1);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ui/storage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/storage.ts tests/ui/storage.test.ts
git commit -m "feat(storage): validate optional log-entry day; legacy v3 snapshots still resume (P3-1a)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: `collapseLog` helper

**Files:**

- Modify: `src/ui/screens.ts` (add near `logPanel`, screens.ts:205)
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `tests/ui/screens.test.ts`; add `collapseLog` to the screens import)

```ts
describe("collapseLog (P3-1b)", () => {
  const sold = {
    msg: "Sold 1 Water / Ice for 18cr (tax 0).",
    tone: "good" as const,
    delta: 18,
    day: 2,
  };

  it("folds consecutive identical lines and sums their deltas", () => {
    const out = collapseLog([sold, sold, sold, { msg: "Docked", tone: "neutral", day: 2 }, sold]);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ msg: sold.msg, count: 3, delta: 54 });
    expect(out[1]).toMatchObject({ msg: "Docked", count: 1 });
    expect(out[2]).toMatchObject({ count: 1, delta: 18 });
  });

  it("keeps delta undefined for non-money runs (no spurious +0)", () => {
    const a = { msg: "x", tone: "neutral" as const, day: 2 };
    const out = collapseLog([a, a]);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(2);
    expect(out[0].delta).toBeUndefined();
  });

  it("a day change breaks a run — collapsed lines never straddle a divider", () => {
    const a = { msg: "x", tone: "neutral" as const, day: 2 };
    const out = collapseLog([a, a, { ...a, day: 3 }]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ count: 2, day: 2 });
    expect(out[1]).toMatchObject({ count: 1, day: 3 });
  });

  it("a tone change breaks a run", () => {
    const a = { msg: "x", tone: "neutral" as const, day: 2 };
    expect(collapseLog([a, { ...a, tone: "bad" as const }])).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui/screens.test.ts -t "collapseLog"`
Expected: FAIL — `collapseLog` is not exported

- [ ] **Step 3: Implement in `src/ui/screens.ts`** (directly above `logPanel`)

```ts
/** One rendered log line: a run of consecutive identical (msg, tone, day) entries (P3-1b). */
export interface CollapsedLine {
  msg: string;
  tone: LogEntry["tone"];
  day?: number;
  count: number;
  delta?: number;
}

/**
 * Fold runs of consecutive identical entries. `day` joins the key so a collapsed
 * run can never straddle a day divider. Deltas sum; a run with no money lines
 * keeps `delta` undefined so the panel never renders a spurious "+0". Render-only:
 * the engine log stays append-only and uncollapsed (turn report, conservation
 * tests, and the sim all read the raw entries).
 */
export function collapseLog(log: LogEntry[]): CollapsedLine[] {
  const out: CollapsedLine[] = [];
  for (const l of log) {
    const last = out[out.length - 1];
    if (last && last.msg === l.msg && last.tone === l.tone && last.day === l.day) {
      last.count += 1;
      if (l.delta !== undefined) last.delta = (last.delta ?? 0) + l.delta;
    } else {
      out.push({
        msg: l.msg,
        tone: l.tone,
        day: l.day,
        count: 1,
        ...(l.delta === undefined ? {} : { delta: l.delta }),
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ui/screens.test.ts -t "collapseLog"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens.ts tests/ui/screens.test.ts
git commit -m "feat(ui): collapseLog folds consecutive identical log lines (P3-1b)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: logPanel rewrite — newest-first, dividers, dimmed past days

**Files:**

- Modify: `src/ui/screens.ts:205-215` (`logPanel`), `src/ui/styles.css` (after the `.log-delta` rule, ~line 317)
- Test: `tests/ui/screens.test.ts` (new tests + update the P2-1 tests at :406-431)

- [ ] **Step 1: Update the existing P2-1 log tests** — they hand-build **day-less** entries, which after this task render dimmed (`log-line tr-good log-line--past`) and would fail their exact-class assertions. Stamp them with the current day instead (createGame ⇒ `day: 1`). In `tests/ui/screens.test.ts:406-431` change the two hand-built logs:

```ts
      log: [
        { msg: "Sold 5 Water / Ice for 100cr (tax 5).", tone: "good" as const, delta: 95, day: 1 },
        { msg: "Docked at Meridian, fee 45cr.", tone: "neutral" as const, delta: -45, day: 1 },
        { msg: "Fled — took 16 hull damage.", tone: "bad" as const, day: 1 },
      ],
```

and

```ts
      log: [{ msg: "Fled — took 16 hull damage.", tone: "bad" as const, day: 1 }],
```

- [ ] **Step 2: Write the failing rendering tests** (append to `tests/ui/screens.test.ts`)

```ts
describe("logPanel rendering (P3-1)", () => {
  it("renders newest-first with a divider per day; day-less legacy lines get none", () => {
    const s = {
      ...createGame(42),
      day: 3,
      log: [
        { msg: "legacy line from before the update", tone: "neutral" as const },
        { msg: "second-day line", tone: "neutral" as const, day: 2 },
        { msg: "third-day line", tone: "neutral" as const, day: 3 },
      ],
    };
    const html = stationScreen(s);
    const d3 = html.indexOf('log-day-divider">Day 3<');
    const d2 = html.indexOf('log-day-divider">Day 2<');
    expect(d3).toBeGreaterThan(-1);
    expect(d2).toBeGreaterThan(d3); // newest day's divider comes first
    expect(html.indexOf("third-day line")).toBeLessThan(html.indexOf("second-day line"));
    expect(html.indexOf("second-day line")).toBeLessThan(html.indexOf("legacy line"));
    expect((html.match(/log-day-divider/g) ?? []).length).toBe(2); // none for the legacy line
  });

  it("dims past-day and legacy lines but not the current day's", () => {
    const s = {
      ...createGame(42),
      day: 3,
      log: [
        { msg: "legacy line", tone: "neutral" as const },
        { msg: "second-day line", tone: "neutral" as const, day: 2 },
        { msg: "third-day line", tone: "neutral" as const, day: 3 },
      ],
    };
    const html = stationScreen(s);
    expect(html).toContain('class="log-line tr-neutral log-line--past"><span>legacy line');
    expect(html).toContain('class="log-line tr-neutral log-line--past"><span>second-day line');
    expect(html).toContain('class="log-line tr-neutral"><span>third-day line');
  });

  it("renders a collapsed run as one line with ×N and the summed delta", () => {
    const refuelLine = {
      msg: "Refueled 2 for 24cr.",
      tone: "neutral" as const,
      delta: -24,
      day: 1,
    };
    const s = { ...createGame(42), log: [refuelLine, refuelLine, refuelLine] };
    const html = stationScreen(s);
    expect(html).toContain("Refueled 2 for 24cr. ×3");
    expect(html).toContain(">−72cr<");
    expect(html).not.toContain("×1");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/ui/screens.test.ts -t "logPanel rendering"`
Expected: FAIL — no dividers, oldest-first, no collapsing

- [ ] **Step 4: Rewrite `logPanel` in `src/ui/screens.ts`**

```ts
/** How many collapsed lines the panel shows; dividers render on top of these. */
const LOG_WINDOW = 10;

function logPanel(s: GameState): string {
  // Newest-first (P3-1c): collapse the raw log, window it, then reverse — today's
  // lines sit at the top under their divider, so no auto-scroll is needed.
  const lines = collapseLog(s.log).slice(-LOG_WINDOW).reverse();
  const parts: string[] = [];
  let dividerDay: number | undefined;
  for (const l of lines) {
    if (l.day !== undefined && l.day !== dividerDay) {
      parts.push(`<div class="log-day-divider">Day ${l.day}</div>`);
      dividerDay = l.day;
    }
    // Day-less lines predate this round's snapshots — render them dimmed, no divider.
    const past = l.day === undefined || l.day < s.day ? " log-line--past" : "";
    const times = l.count > 1 ? ` ×${l.count}` : "";
    parts.push(
      `<div class="log-line tr-${l.tone}${past}"><span>${l.msg}${times}</span>${deltaHtml(l)}</div>`
    );
  }
  return panel(
    "Ship's Log",
    `<div class="log-entries">${parts.join("")}</div>`,
    ` aria-label="Ship's log"`
  );
}
```

(`deltaHtml` already accepts any `{ delta?: number }`-shaped entry structurally; no change needed there.)

- [ ] **Step 5: Add the CSS** (in `src/ui/styles.css`, directly after the `.log-delta` rule ~line 317)

```css
.log-day-divider {
  margin-top: var(--st-space-2);
  padding-top: 3px;
  border-top: 1px solid var(--st-border);
  font-size: var(--st-text-2xs);
  font-weight: 600;
  letter-spacing: var(--st-track-label);
  text-transform: uppercase;
  color: var(--st-text-dim);
}
.log-entries .log-day-divider:first-child {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}
/* Dim previous days; 0.7 keeps body text comfortably above the AA contrast floor. */
.log-line--past {
  opacity: 0.7;
}
```

- [ ] **Step 6: Run the UI suite, then the full suite**

Run: `npx vitest run tests/ui/screens.test.ts && npm test`
Expected: PASS (including the updated P2-1 tests from Step 1)

- [ ] **Step 7: Commit**

```bash
git add src/ui/screens.ts src/ui/styles.css tests/ui/screens.test.ts
git commit -m "feat(ui): ship's log renders newest-first with day dividers and collapsed repeats (P3-1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Dossier + epilogue surfaces

**Files:**

- Modify: `src/ui/screens.ts:403-413` (station intel) and `:625-632` (`runEndScreen` cause block), `src/ui/styles.css`
- Test: `tests/ui/screens.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `tests/ui/screens.test.ts`; add imports `import { STATION_DOSSIERS, epilogue } from "../../src/engine/fiction";` and `NODE_IDS` from world)

```ts
describe("station dossier (E2-4a)", () => {
  it("every station shows its dossier ahead of the unchanged mechanical intel", () => {
    for (const node of NODE_IDS) {
      const s = { ...createGame(42), location: node };
      const html = stationScreen(s);
      expect(html).toContain(`<span class="station-dossier">${STATION_DOSSIERS[node]}</span>`);
      // The mechanical intel survives verbatim next to the voice line.
      const taxPct = Math.round(NODES[node].taxRate * 100);
      expect(html).toContain(taxPct > 0 ? `Sales taxed ${taxPct}%` : "Tax-free port");
    }
  });
});

describe("death epilogue (E2-4d)", () => {
  it("a lost run shows the cause-matched epilogue under the cause line", () => {
    const lostRun = endRun(
      { ...createGame(42), fuel: 0 },
      "lost",
      "Stranded at Terra Hub.",
      "fuel"
    );
    const html = runEndScreen(lostRun, lostRun.runEnd!);
    expect(html).toContain(`<p class="run-end__epilogue">${epilogue(42, "fuel")}</p>`);
    expect(html.indexOf("run-end__cause")).toBeLessThan(html.indexOf("run-end__epilogue"));
  });

  it("banked runs show no epilogue", () => {
    const banked = endRun(createGame(42), "retired", "Retired at Terra Hub.");
    expect(runEndScreen(banked, banked.runEnd!)).not.toContain("run-end__epilogue");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui/screens.test.ts -t "dossier" && npx vitest run tests/ui/screens.test.ts -t "epilogue"`
Expected: FAIL — neither surface exists

- [ ] **Step 3: Implement in `src/ui/screens.ts`**

Add to the imports from the engine: `import { STATION_DOSSIERS, epilogue } from "../engine/fiction";`

In `tradeHubPanel` (screens.ts:413), the intel line gains the dossier as its leading sentence — the mechanical parts stay verbatim (E1-4's honesty surfaces are not replaced by flavor):

```ts
const intel = `<p class="station-intel"><span class="station-dossier">${STATION_DOSSIERS[s.location]}</span> ${intelParts.join(" · ")}</p>`;
```

In `runEndScreen`, directly after the cause line (`<p class="run-end__cause">${r.cause}</p>`, screens.ts:632):

```ts
          ${r.status === "lost" ? `<p class="run-end__epilogue">${epilogue(s.seed, r.lossCause)}</p>` : ""}
```

- [ ] **Step 4: Add the CSS** (in `src/ui/styles.css`: `.station-dossier` next to the existing `.station-intel` rule; `.run-end__epilogue` next to the existing `.run-end__cause` rule — find both with `grep -n "station-intel\|run-end__cause" src/ui/styles.css`)

```css
.station-dossier {
  display: block;
  margin-bottom: 2px;
  color: var(--st-text);
  font-style: italic;
}
```

```css
.run-end__epilogue {
  margin: 2px auto 0;
  max-width: 46ch;
  color: var(--st-text-dim);
  font-style: italic;
}
```

- [ ] **Step 5: Run the UI suite, then the full suite**

Run: `npx vitest run tests/ui/screens.test.ts && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens.ts src/ui/styles.css tests/ui/screens.test.ts
git commit -m "feat(ui): station dossiers and death epilogues (E2-4a/d)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Close-out — full verification + docs tick

**Files:**

- Modify: `docs/ROADMAP.md`, `docs/BACKLOG.md`, `docs/ENGAGEMENT_BACKLOG.md`

- [ ] **Step 1: Full verification battery**

```bash
npm test
npm run lint
npm run format:check
npm run build
```

Expected: all green. The 100-seed sim sweep runs inside `npm test` (`tests/sim/simulate.test.ts`) — bands must be byte-identical since no strategy reads descriptions and kind order is pinned by Task 3's oracle test. Lighthouse runs in CI and must stay green — this round adds text and static CSS only, no motion.

- [ ] **Step 2: Eyeball the running game** (optional but recommended)

Run the dev server and check: dossier line at each station, a pirate event naming the crew, the bulletin's third line, the log's dividers/collapse/newest-first, and a stranding's epilogue.

- [ ] **Step 3: Tick the docs**

`docs/ROADMAP.md`:

- M3 intro note: change `**Round 1 closed 2026-08-02.** Next up: E2-4 (fiction pack).` to `**Round 1 closed 2026-08-02; round 2 (E2-4 + P3-1) closed <today's date>.** Next up: E2-3 (star map).`
- E2-4 row Notes: prepend `✅ **Shipped <today's date>.**`
- In the `⚪ Backlog — revisit later` table, remove the P3-1 row and note it in the "Already shipped (context)" section: `P3-1 (log collapse/newest-first/day dividers) shipped <today's date> with M3 round 2.`

`docs/BACKLOG.md`:

- Move P3-1 from "Left in backlog" to the ✅ Committed line in the header block, and prepend `✅ **Shipped <today's date>** (with E2-4, M3 round 2).` to its table row.

`docs/ENGAGEMENT_BACKLOG.md`:

- E2-4 row: prepend `✅ **Shipped <today's date>.**` to its Solution cell, and tick item 11 in the "Suggested iteration order" (`E2-4 Fiction pack ✅ shipped <today's date> → E2-3 Star map → E2-5 achievements`).

- [ ] **Step 4: Commit the docs**

```bash
git add docs/ROADMAP.md docs/BACKLOG.md docs/ENGAGEMENT_BACKLOG.md
git commit -m "docs(roadmap): tick E2-4 + P3-1 — M3 round 2 shipped

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Acceptance criteria (from the spec — verify before calling the round done)

E2-4:

- [ ] Every station's trade hub shows its dossier sentence ahead of the unchanged mechanical intel.
- [ ] The same daily seed names the same pirate crew everywhere it surfaces: event description, pay/flee log lines, bulletin raider line.
- [ ] Each event kind has ≥ 3 description variants, deterministic per seed/day/route; event kinds are pinned to the first draw by the oracle test (no RNG-order change).
- [ ] A lost run shows a cause-matched epilogue; same seed + cause always shows the same one; banked runs unchanged.

P3-1:

- [ ] Log renders newest-first with a "Day N" divider at each day boundary; previous days dimmed.
- [ ] Consecutive identical lines collapse to one line with ×N and a summed delta; turn report and conservation semantics untouched.
- [ ] A pre-round v3 snapshot resumes cleanly; legacy entries render dimmed without dividers.

Round:

- [ ] No mechanic changed: sim sweep bands identical; full suite, lint, and build green.
- [ ] ROADMAP/backlog rows ticked.
