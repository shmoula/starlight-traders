import { describe, it, expect } from "vitest";
import { rollEvent, pirateChance } from "../../src/engine/events";
import { mulberry32, hashSeed } from "../../src/engine/rng";
import { NODE_IDS } from "../../src/engine/world";
import { crewName } from "../../src/engine/fiction";
import { NodeId } from "../../src/engine/types";

describe("rollEvent", () => {
  it("is deterministic for the same seed/day/route", () => {
    const a = rollEvent(3, 5, "terra", "verge");
    const b = rollEvent(3, 5, "terra", "verge");
    expect(a.kind).toBe(b.kind);
  });

  it("always returns a known event kind with at least one choice", () => {
    const known = ["quiet", "pirates", "salvage", "derelict", "customs", "engine"];
    for (let day = 1; day <= 60; day++) {
      const e = rollEvent(11, day, "terra", "verge");
      expect(known).toContain(e.kind);
      expect(e.choices.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("produces more pirate events on high-danger routes than safe ones", () => {
    let dangerous = 0,
      safe = 0;
    for (let day = 1; day <= 200; day++) {
      if (rollEvent(2, day, "terra", "verge").kind === "pirates") dangerous++;
      if (rollEvent(2, day, "terra", "kiruna").kind === "pirates") safe++;
    }
    expect(dangerous).toBeGreaterThan(safe);
  });

  it("only fires customs on routes into meridian", () => {
    let customsElsewhere = 0;
    for (let day = 1; day <= 200; day++) {
      if (rollEvent(4, day, "terra", "kiruna").kind === "customs") customsElsewhere++;
    }
    expect(customsElsewhere).toBe(0);
  });
});

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
