import { describe, it, expect } from "vitest";
import { COMMODITIES, fuelCost, getPrice, NODE_IDS } from "../../src/engine/world";

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
