import { describe, it, expect } from "vitest";
import {
  COMMODITIES,
  fuelCost,
  getPrice,
  baselinePrice,
  NODE_IDS,
  EDGE_DANGER,
  edgeKey,
  laneDanger,
  safestApproach,
  riskiestLane,
} from "../../src/engine/world";

describe("world data", () => {
  it("has exactly 5 nodes and 3 commodities", () => {
    expect(NODE_IDS).toHaveLength(5);
    expect(COMMODITIES).toHaveLength(3);
  });

  it("fuelCost is symmetric and positive between distinct nodes", () => {
    expect(fuelCost("terra", "kiruna")).toBe(fuelCost("kiruna", "terra"));
    expect(fuelCost("terra", "kiruna")).toBeGreaterThan(0);
  });

  it("fuelCost from a node to itself is 0", () => {
    expect(fuelCost("terra", "terra")).toBe(0);
  });
});

describe("getPrice", () => {
  it("is deterministic for the same seed/day/node/commodity", () => {
    const a = getPrice(123, 4, "terra", "water");
    const b = getPrice(123, 4, "terra", "water");
    expect(a).toBe(b);
  });

  it("changes across days", () => {
    const d1 = getPrice(123, 1, "terra", "luxury");
    const d2 = getPrice(123, 2, "terra", "luxury");
    expect(d1).not.toBe(d2);
  });

  it("is cheaper where produced than where demanded (on average)", () => {
    // Water is produced at kiruna, demanded at vulcan.
    let cheap = 0,
      dear = 0;
    for (let day = 1; day <= 50; day++) {
      cheap += getPrice(7, day, "kiruna", "water");
      dear += getPrice(7, day, "vulcan", "water");
    }
    expect(cheap).toBeLessThan(dear);
  });

  it("returns positive integers", () => {
    const p = getPrice(1, 1, "meridian", "luxury");
    expect(Number.isInteger(p)).toBe(true);
    expect(p).toBeGreaterThan(0);
  });
});

describe("baselinePrice (E2-2f)", () => {
  it("is basePrice under the station's produce/demand modifiers, no noise", () => {
    expect(baselinePrice("terra", "water")).toBe(20); // no speciality
    expect(baselinePrice("kiruna", "water")).toBe(14); // produces: ×0.7
    expect(baselinePrice("vulcan", "water")).toBe(28); // demands: ×1.4
    expect(baselinePrice("vulcan", "parts")).toBe(84); // produces: ×0.7
    expect(baselinePrice("meridian", "luxury")).toBe(672); // demands: ×1.4
  });
});

describe("EDGE_DANGER (E2-3a)", () => {
  it("has exactly one entry per unordered station pair (10 lanes for 5 nodes)", () => {
    const expected = new Set<string>();
    for (const a of NODE_IDS) {
      for (const b of NODE_IDS) {
        if (a < b) expected.add(edgeKey(a, b));
      }
    }
    expect(new Set(Object.keys(EDGE_DANGER))).toEqual(expected);
    expect(Object.keys(EDGE_DANGER)).toHaveLength(10);
  });

  it("every lane sits in the honesty band [0.05, 0.35] — no lane is ever 0%", () => {
    for (const [key, danger] of Object.entries(EDGE_DANGER)) {
      expect(danger, key).toBeGreaterThanOrEqual(0.05);
      expect(danger, key).toBeLessThanOrEqual(0.35);
    }
  });

  it("laneDanger is order-insensitive and throws on a self-lane (fuelCost's contract)", () => {
    expect(laneDanger("terra", "verge")).toBe(laneDanger("verge", "terra"));
    expect(laneDanger("terra", "verge")).toBeCloseTo(0.25);
    expect(() => laneDanger("terra", "terra")).toThrow();
  });

  it("safestApproach: only The Verge has no safe way in (≥ 0.1)", () => {
    expect(safestApproach("verge")).toBeGreaterThanOrEqual(0.1);
    for (const n of NODE_IDS.filter((n) => n !== "verge")) {
      expect(safestApproach(n), n).toBeLessThan(0.1);
    }
  });

  it("riskiestLane picks the max-danger pair deterministically (tie → key order)", () => {
    expect(riskiestLane()).toEqual(["kiruna", "verge"]);
  });
});
