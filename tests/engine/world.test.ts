import { describe, it, expect } from "vitest";
import {
  COMMODITIES,
  fuelCost,
  cheapestJumpCost,
  isLongHaul,
  getPrice,
  baselinePrice,
  NODE_IDS,
  EDGE_DANGER,
  edgeKey,
  laneDanger,
  safestApproach,
  riskiestLane,
  DEMAND_PRICE_MULTIPLIER,
  PRODUCE_PRICE_MULTIPLIER,
} from "../../src/engine/world";
import { mulberry32, hashSeed } from "../../src/engine/rng";

describe("world data", () => {
  it("has exactly 5 nodes and 3 commodities", () => {
    expect(NODE_IDS).toHaveLength(5);
    expect(COMMODITIES).toHaveLength(3);
  });

  it("fuelCost is symmetric and positive between distinct nodes (clear-skies seed)", () => {
    expect(fuelCost(42, "terra", "kiruna")).toBe(fuelCost(42, "kiruna", "terra"));
    expect(fuelCost(42, "terra", "kiruna")).toBe(4); // the raw DISTANCE table
  });

  it("fuelCost from a node to itself is 0, even under ion storms", () => {
    expect(fuelCost(42, "terra", "terra")).toBe(0);
    expect(fuelCost(1, "terra", "terra")).toBe(0); // seed 1 = ionStorms
  });

  it("ion storms add fuelDelta only to long-haul lanes; short hops stay cheap (E3-1)", () => {
    expect(fuelCost(1, "kiruna", "verge")).toBe(8); // 7⛽ long-haul + 1
    expect(fuelCost(1, "kiruna", "meridian")).toBe(9); // 8⛽ long-haul + 1
    expect(fuelCost(1, "terra", "kiruna")).toBe(4); // 4⛽ short lane — untaxed
    expect(fuelCost(1, "terra", "verge")).toBe(6); // 6⛽ — below the long-haul cutoff
    expect(cheapestJumpCost(1, "terra")).toBe(3); // cheapest hop (terra–vulcan 3) untaxed
    expect(cheapestJumpCost(42, "terra")).toBe(3); // clear skies unchanged
  });

  it("isLongHaul marks exactly the two 7–8⛽ lanes, by the base table (E3-2)", () => {
    expect(isLongHaul("kiruna", "verge")).toBe(true); // 7⛽
    expect(isLongHaul("kiruna", "meridian")).toBe(true); // 8⛽
    expect(isLongHaul("meridian", "kiruna")).toBe(true); // symmetric
    expect(isLongHaul("terra", "verge")).toBe(false); // 6⛽ — storms don't promote it
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

describe("getPrice daily-modifier hook (E3-1)", () => {
  /** Mirror of getPrice's noise draw — exact, not approximate. */
  const noiseFor = (seed: number, day: number, node: string, commodity: string, vol: number) => {
    const rng = mulberry32(
      hashSeed(
        seed,
        day,
        node.length,
        commodity.length,
        node.charCodeAt(0),
        commodity.charCodeAt(0)
      )
    );
    return (rng() * 2 - 1) * vol;
  };

  it("luxury boom multiplies Meridian luxury by exactly 1.25 before rounding", () => {
    for (let day = 1; day <= 12; day++) {
      const noise = noiseFor(10, day, "meridian", "luxury", 0.6);
      const expected = Math.max(1, Math.round(480 * (1 + noise) * DEMAND_PRICE_MULTIPLIER * 1.25));
      expect(getPrice(10, day, "meridian", "luxury"), `day ${day}`).toBe(expected);
    }
  });

  it("parts glut multiplies Vulcan parts by exactly 0.8; other pairs untouched", () => {
    const noise = noiseFor(4, 3, "vulcan", "parts", 0.35);
    const expected = Math.max(1, Math.round(120 * (1 + noise) * PRODUCE_PRICE_MULTIPLIER * 0.8));
    expect(getPrice(4, 3, "vulcan", "parts")).toBe(expected);
    // Same seed, non-matching pair: plain formula.
    const waterNoise = noiseFor(4, 3, "vulcan", "water", 0.15);
    expect(getPrice(4, 3, "vulcan", "water")).toBe(
      Math.max(1, Math.round(20 * (1 + waterNoise) * DEMAND_PRICE_MULTIPLIER))
    );
  });

  it("clear-skies prices and baselinePrice are modifier-free", () => {
    const noise = noiseFor(42, 5, "meridian", "luxury", 0.6);
    expect(getPrice(42, 5, "meridian", "luxury")).toBe(
      Math.max(1, Math.round(480 * (1 + noise) * DEMAND_PRICE_MULTIPLIER))
    );
    expect(baselinePrice("meridian", "luxury")).toBe(672); // 480 × 1.4 — never modified
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
