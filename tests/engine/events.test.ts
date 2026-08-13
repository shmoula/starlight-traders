import { describe, it, expect } from "vitest";
import {
  rollEvent,
  pirateChance,
  effectiveDanger,
  SALVAGE_BAND,
  LONG_HAUL_SALVAGE_BAND,
} from "../../src/engine/events";
import { mulberry32, hashSeed } from "../../src/engine/rng";
import { NODE_IDS, isLongHaul } from "../../src/engine/world";
import { crewName } from "../../src/engine/fiction";
import { dailyModifier } from "../../src/engine/modifiers";
import { createGame } from "../../src/engine/game";
import { GameState, NodeId } from "../../src/engine/types";

describe("rollEvent", () => {
  it("is deterministic for the same seed/day/route", () => {
    const a = rollEvent(3, 5, "terra", "verge", false);
    const b = rollEvent(3, 5, "terra", "verge", false);
    expect(a.kind).toBe(b.kind);
  });

  it("always returns a known event kind with at least one choice", () => {
    const known = ["quiet", "pirates", "salvage", "derelict", "customs", "engine"];
    for (let day = 1; day <= 60; day++) {
      const e = rollEvent(11, day, "terra", "verge", false);
      expect(known).toContain(e.kind);
      expect(e.choices.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("produces more pirate events on high-danger routes than safe ones", () => {
    let dangerous = 0,
      safe = 0;
    for (let day = 1; day <= 200; day++) {
      if (rollEvent(2, day, "terra", "verge", false).kind === "pirates") dangerous++;
      if (rollEvent(2, day, "terra", "kiruna", false).kind === "pirates") safe++;
    }
    expect(dangerous).toBeGreaterThan(safe);
  });

  it("only fires customs on routes into meridian", () => {
    let customsElsewhere = 0;
    for (let day = 1; day <= 200; day++) {
      if (rollEvent(4, day, "terra", "kiruna", false).kind === "customs") customsElsewhere++;
    }
    expect(customsElsewhere).toBe(0);
  });
});

const at = (seed: number, location: NodeId, pirateTail = false): GameState => ({
  ...createGame(seed),
  location,
  pirateTail,
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
    expect(effectiveDanger(42, "kiruna", "verge", true)).toBeCloseTo(0.65); // 0.3 + 0.35
    expect(effectiveDanger(6, "kiruna", "verge", true)).toBeCloseTo(0.71); // + corsairs
  });
});

describe("event hash aliasing (B-2)", () => {
  it("vulcan and verge no longer share event rolls (same destination, same days)", () => {
    // Pre-fix, from.charCodeAt(0) made these two origins identical: same rng, same
    // destination bands -> byte-identical event sequences. Post-fix they must diverge.
    const seq = (from: "vulcan" | "verge") =>
      Array.from({ length: 60 }, (_, i) => rollEvent(7, i + 1, from, "terra", false).kind).join(
        ","
      );
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
          const pPirates = effectiveDanger(seed, from, to, false);
          const amnesty = dailyModifier(seed).eventTweak === "amnesty";
          const salvageBand = amnesty
            ? 0
            : isLongHaul(from, to)
              ? LONG_HAUL_SALVAGE_BAND
              : SALVAGE_BAND;
          const pSalvage = pPirates + salvageBand;
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
          expect(rollEvent(seed, day, from, to, false).kind).toBe(expected);
        }
      }
    }
  });

  it("amnesty seeds roll neither pirates nor salvage on any lane or day", () => {
    for (let day = 1; day <= 60; day++) {
      for (const to of ["kiruna", "verge", "meridian"] as const) {
        const kind = rollEvent(9, day, "terra", to, false).kind;
        expect(kind).not.toBe("pirates");
        expect(kind).not.toBe("salvage");
      }
    }
  });

  it("long-haul lanes double the salvage band; short lanes keep 0.18", () => {
    let long = 0;
    let short = 0;
    for (let day = 1; day <= 400; day++) {
      if (rollEvent(42, day, "kiruna", "verge", false).kind === "salvage") long++;
      if (rollEvent(42, day, "terra", "kiruna", false).kind === "salvage") short++;
    }
    expect(long).toBeGreaterThan(short);
  });
});

describe("event description variants (E2-4b/c)", () => {
  it("descriptions are deterministic per (seed, day, route)", () => {
    expect(rollEvent(3, 5, "terra", "verge", false).description).toBe(
      rollEvent(3, 5, "terra", "verge", false).description
    );
  });

  it("each kind shows ≥ 2 distinct descriptions across a sweep", () => {
    const byKind = new Map<string, Set<string>>();
    for (let seed = 1; seed <= 30; seed++) {
      for (let day = 1; day <= 12; day++) {
        for (const to of ["verge", "meridian"] as const) {
          const e = rollEvent(seed, day, "terra", to, false);
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
        const e = rollEvent(seed, day, "terra", "verge", false);
        if (e.kind === "pirates") {
          expect(e.description.toLowerCase()).toContain(crewName(seed).toLowerCase());
        }
      }
    }
  });
});
