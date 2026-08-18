import { describe, it, expect } from "vitest";
import {
  rollEvent,
  pirateChance,
  effectiveDanger,
  SALVAGE_BAND,
  LONG_HAUL_SALVAGE_BAND,
  DISTRESS_BAND,
  JumpRisk,
  riskOf,
  DANGER_CAP,
} from "../../src/engine/events";
import { mulberry32, hashSeed } from "../../src/engine/rng";
import { NODE_IDS, isLongHaul } from "../../src/engine/world";
import { crewName } from "../../src/engine/fiction";
import { dailyModifier } from "../../src/engine/modifiers";
import { createGame } from "../../src/engine/game";
import { heatOf, HEAT_CAP } from "../../src/engine/economy";
import { GameEvent, GameState, NodeId } from "../../src/engine/types";

describe("rollEvent", () => {
  it("is deterministic for the same seed/day/route", () => {
    const a = rollEvent(3, 5, "terra", "verge", CALM);
    const b = rollEvent(3, 5, "terra", "verge", CALM);
    expect(a.kind).toBe(b.kind);
  });

  it("always returns a known event kind with at least one choice", () => {
    const known = ["quiet", "pirates", "salvage", "derelict", "distress", "customs", "engine"]; // E3-3 band re-deal
    for (let day = 1; day <= 60; day++) {
      const e = rollEvent(11, day, "terra", "verge", CALM);
      expect(known).toContain(e.kind);
      expect(e.choices.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("produces more pirate events on high-danger routes than safe ones", () => {
    let dangerous = 0,
      safe = 0;
    for (let day = 1; day <= 200; day++) {
      if (rollEvent(2, day, "terra", "verge", CALM).kind === "pirates") dangerous++;
      if (rollEvent(2, day, "terra", "kiruna", CALM).kind === "pirates") safe++;
    }
    expect(dangerous).toBeGreaterThan(safe);
  });

  it("only fires customs on routes into meridian", () => {
    let customsElsewhere = 0;
    for (let day = 1; day <= 200; day++) {
      if (rollEvent(4, day, "terra", "kiruna", CALM).kind === "customs") customsElsewhere++;
    }
    expect(customsElsewhere).toBe(0);
  });
});

/** A jump with no heat and no tail — the pre-round default for every band test. */
const CALM: JumpRisk = { tailed: false, heat: 0 };
/** Shorthand for the heated/tailed cases. */
const risk = (heat = 0, tailed = false): JumpRisk => ({ tailed, heat });

const at = (seed: number, location: NodeId, pirateTail = false, peakNetWorth = 0): GameState => ({
  ...createGame(seed),
  location,
  pirateTail,
  peakNetWorth,
});

describe("pirateChance (E1-4 honest danger — per-lane, modifier- and tail-aware)", () => {
  it("clear-skies chances are the authored lane table", () => {
    expect(pirateChance(at(42, "terra"), "kiruna")).toBeCloseTo(0.05);
    expect(pirateChance(at(42, "terra"), "verge")).toBeCloseTo(0.25);
    expect(pirateChance(at(42, "kiruna"), "verge")).toBeCloseTo(0.3);
  });

  it("corsair season adds CORSAIR_DANGER_DELTA to every lane", () => {
    expect(pirateChance(at(6, "terra"), "kiruna")).toBeCloseTo(0.11); // 0.05 + 0.06
    expect(pirateChance(at(6, "kiruna"), "verge")).toBeCloseTo(0.36);
  });

  it("amnesty zeroes every lane, tail or no tail", () => {
    expect(pirateChance(at(9, "terra"), "verge")).toBe(0);
    expect(pirateChance(at(9, "terra", true), "verge")).toBe(0);
  });

  it("a pirate tail adds TAIL_BONUS, capped at DANGER_CAP", () => {
    expect(pirateChance(at(42, "terra", true), "kiruna")).toBeCloseTo(0.4); // 0.05 + 0.35
    expect(effectiveDanger(42, "kiruna", "verge", risk(0, true))).toBeCloseTo(0.65); // 0.3 + 0.35
    expect(effectiveDanger(6, "kiruna", "verge", risk(0, true))).toBeCloseTo(0.71); // + corsairs
  });
});

describe("event hash aliasing (B-2)", () => {
  it("vulcan and verge no longer share event rolls (same destination, same days)", () => {
    // Pre-fix, from.charCodeAt(0) made these two origins identical: same rng, same
    // destination bands -> byte-identical event sequences. Post-fix they must diverge.
    const seq = (from: "vulcan" | "verge") =>
      Array.from({ length: 60 }, (_, i) => rollEvent(7, i + 1, from, "terra", CALM).kind).join(",");
    expect(seq("vulcan")).not.toEqual(seq("verge"));
  });
});

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
          const pPirates = effectiveDanger(seed, from, to, CALM);
          const amnesty = dailyModifier(seed).eventTweak === "amnesty";
          const salvageBand = amnesty
            ? 0
            : isLongHaul(from, to)
              ? LONG_HAUL_SALVAGE_BAND
              : SALVAGE_BAND;
          const pSalvage = pPirates + salvageBand;
          const pEngine = pSalvage + 0.1;
          const pDerelict = pEngine + 0.12;
          const pDistress = pDerelict + DISTRESS_BAND; // E3-3 band re-deal
          const pCustoms = to === "meridian" ? pDistress + 0.15 : pDistress;
          const expected =
            r < pPirates
              ? "pirates"
              : r < pSalvage
                ? "salvage"
                : r < pEngine
                  ? "engine"
                  : r < pDerelict
                    ? "derelict"
                    : r < pDistress
                      ? "distress"
                      : r < pCustoms
                        ? "customs"
                        : "quiet";
          expect(rollEvent(seed, day, from, to, CALM).kind).toBe(expected);
        }
      }
    }
  });

  it("amnesty seeds roll neither pirates nor salvage on any lane or day", () => {
    for (let day = 1; day <= 60; day++) {
      for (const to of ["kiruna", "verge", "meridian"] as const) {
        const kind = rollEvent(9, day, "terra", to, CALM).kind;
        expect(kind).not.toBe("pirates");
        expect(kind).not.toBe("salvage");
      }
    }
  });

  it("long-haul lanes double the salvage band; short lanes keep 0.18", () => {
    let long = 0;
    let short = 0;
    for (let day = 1; day <= 400; day++) {
      if (rollEvent(42, day, "kiruna", "verge", CALM).kind === "salvage") long++;
      if (rollEvent(42, day, "terra", "kiruna", CALM).kind === "salvage") short++;
    }
    expect(long).toBeGreaterThan(short);
  });
});

describe("event description variants (E2-4b/c)", () => {
  it("descriptions are deterministic per (seed, day, route)", () => {
    expect(rollEvent(3, 5, "terra", "verge", CALM).description).toBe(
      rollEvent(3, 5, "terra", "verge", CALM).description
    );
  });

  it("each kind shows ≥ 2 distinct descriptions across a sweep", () => {
    const byKind = new Map<string, Set<string>>();
    for (let seed = 1; seed <= 30; seed++) {
      for (let day = 1; day <= 12; day++) {
        for (const to of ["verge", "meridian"] as const) {
          const e = rollEvent(seed, day, "terra", to, CALM);
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
        const e = rollEvent(seed, day, "terra", "verge", CALM);
        if (e.kind === "pirates") {
          expect(e.description.toLowerCase()).toContain(crewName(seed).toLowerCase());
        }
      }
    }
  });
});

describe("heat in the danger stack (E1-5a)", () => {
  it("adds heat to every lane, on top of the lane table", () => {
    expect(effectiveDanger(42, "terra", "kiruna", risk(0.04))).toBeCloseTo(0.09); // 0.05 + 0.04
    expect(effectiveDanger(42, "kiruna", "verge", risk(0.04))).toBeCloseTo(0.34); // 0.30 + 0.04
  });

  it("stacks with corsairs and a tail — the worst shipped case sits just under the cap", () => {
    // The map's hottest lane is 0.30 (kiruna–verge / meridian–verge), so the worst
    // reachable stack is 0.30 + 0.06 corsairs + 0.15 heat + 0.35 tail = 0.86. With the
    // shipped knobs DANGER_CAP is HEADROOM, not a live constraint — this pins that fact,
    // so a future knob raise that starts clipping shows up as a failure here.
    expect(effectiveDanger(6, "kiruna", "verge", risk(HEAT_CAP, true))).toBeCloseTo(0.86);
    expect(effectiveDanger(6, "kiruna", "verge", risk(HEAT_CAP, true))).toBeLessThan(DANGER_CAP);
  });

  it("clamps whatever stacks, if the knobs ever grow past the cap", () => {
    // 0.30 + 0.06 + 0.50 + 0.35 = 1.21, clamped. Uses an out-of-range heat deliberately:
    // the clamp must be a property of the function, not of today's HEAT_CAP.
    expect(effectiveDanger(6, "kiruna", "verge", risk(0.5, true))).toBe(DANGER_CAP);
  });

  it("amnesty still wins every stacking question, however rich you are", () => {
    expect(effectiveDanger(9, "terra", "verge", risk(HEAT_CAP, true))).toBe(0);
    expect(pirateChance(at(9, "terra", true, 999_999), "verge")).toBe(0);
  });

  it("pirateChance reads heat straight off the state, so surfaces cannot understate it", () => {
    const rich = at(42, "terra", false, 6249); // heat 0.04
    expect(heatOf(rich)).toBe(0.04);
    expect(pirateChance(rich, "kiruna")).toBeCloseTo(0.09);
    expect(riskOf(rich)).toEqual({ tailed: false, heat: 0.04 });
  });

  it("the roll uses the same number the surface shows (E1-4 invariant, with heat)", () => {
    // A heated lane must roll pirates strictly more often than a cold one over the
    // same day range — the band widened by exactly the heat the UI displays.
    let cold = 0;
    let hot = 0;
    for (let day = 1; day <= 400; day++) {
      if (rollEvent(42, day, "terra", "kiruna", CALM).kind === "pirates") cold++;
      if (rollEvent(42, day, "terra", "kiruna", risk(HEAT_CAP)).kind === "pirates") hot++;
    }
    expect(hot).toBeGreaterThan(cold);
  });

  it("a zero-heat untailed roll is byte-identical to the pre-round world", () => {
    // Guards the fixtures every other suite depends on: heat must be purely additive.
    const kinds = Array.from(
      { length: 60 },
      (_, i) => rollEvent(7, i + 1, "terra", "kiruna", CALM).kind
    ).join(",");
    expect(kinds).toBe(
      Array.from(
        { length: 60 },
        (_, i) => rollEvent(7, i + 1, "terra", "kiruna", { tailed: false, heat: 0 }).kind
      ).join(",")
    );
  });
});

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
