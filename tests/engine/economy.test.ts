import { describe, it, expect } from "vitest";
import { dockingFee, taxOnSale, loanInterest, cargoUsed, netWorth } from "../../src/engine/economy";
import { GameState } from "../../src/engine/types";

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    seed: 1,
    day: 1,
    credits: 1000,
    debt: 500,
    location: "terra",
    fuel: 10,
    fuelCapacity: 20,
    hull: 80,
    hullMax: 100,
    cargo: { water: 0, parts: 0, luxury: 0 },
    cargoCapacity: 30,
    activeMissions: [],
    peakNetWorth: 0,
    status: "playing",
    log: [],
    bootDate: "",
    ...overrides,
  };
}

describe("economy", () => {
  it("docking fee scales with node fee multiplier", () => {
    expect(dockingFee("meridian")).toBeGreaterThan(dockingFee("kiruna"));
  });

  it("tax is a fraction of positive sale proceeds and zero at tax-free nodes", () => {
    expect(taxOnSale("verge", 1000)).toBe(0);
    expect(taxOnSale("meridian", 1000)).toBe(180);
  });

  it("loan interest escalates 4% → 6% → 8% at days 5 and 9 (E0-4)", () => {
    expect(loanInterest(1000, 1)).toBe(40);
    expect(loanInterest(1000, 4)).toBe(40);
    expect(loanInterest(1000, 5)).toBe(60);
    expect(loanInterest(1000, 8)).toBe(60);
    expect(loanInterest(1000, 9)).toBe(80);
    expect(loanInterest(1000, 12)).toBe(80);
    expect(loanInterest(0, 9)).toBe(0);
  });

  it("cargoUsed sums all commodity stacks", () => {
    expect(cargoUsed({ water: 5, parts: 2, luxury: 1 })).toBe(8);
  });

  it("netWorth = credits + cargo value - debt", () => {
    const s = baseState({ credits: 1000, debt: 500, cargo: { water: 10, parts: 0, luxury: 0 } });
    const nw = netWorth(s);
    expect(nw).toBeGreaterThan(500); // 1000 - 500 + value of 10 water
  });
});
