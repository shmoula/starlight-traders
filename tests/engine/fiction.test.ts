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

import { STATION_DOSSIERS, EVENT_VARIANTS } from "../../src/engine/fiction";
import { NODE_IDS, safestApproach } from "../../src/engine/world";
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
    // terra fee 1.6× → "fees"; kiruna fee 0.6× → "dock"; vulcan's Verge lane
    // runs 28% → "approach"; verge has no safe approach → "raiders";
    // meridian tax 0.18 → "18%".
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

  it("a station with no safe approach voices the danger (E2-3 presence rule)", () => {
    for (const node of NODE_IDS) {
      if (safestApproach(node) >= 0.1) {
        expect(STATION_DOSSIERS[node].toLowerCase()).toMatch(/raider|pirat|danger/);
      }
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
