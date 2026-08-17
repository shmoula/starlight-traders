import { describe, it, expect } from "vitest";
import {
  dockingFee,
  taxOnSale,
  loanInterest,
  cargoUsed,
  netWorth,
  saleProceeds,
  netSaleProceeds,
  escapeCost,
  canEscape,
  MARKET_DEPTH,
  DEPTH_SLOPE,
  DEPTH_FLOOR,
  HEAT_CAP,
  HEAT_PER_CR,
  HEAT_STEP,
  heatOf,
} from "../../src/engine/economy";
import { getPrice } from "../../src/engine/world";
import { GameState, emptyRecords } from "../../src/engine/types";
import { createGame } from "../../src/engine/game";

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
    boughtHere: { water: 0, parts: 0, luxury: 0 },
    soldHere: { water: 0, parts: 0, luxury: 0 },
    costBasis: { water: 0, parts: 0, luxury: 0 },
    pirateTail: false,
    contracts: { delivered: 0, expired: 0, forfeitedCr: 0 },
    peakNetWorth: 0,
    dayHighlights: {},
    records: { ...emptyRecords(), visited: ["terra"] },
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

describe("market depth curve (E2-1)", () => {
  const at = (soldHere: number, cargo = 60) =>
    baseState({
      location: "kiruna",
      cargo: { water: cargo, parts: 0, luxury: 0 },
      soldHere: { water: soldHere, parts: 0, luxury: 0 },
    });
  const b = baseState();
  const list = () => getPrice(b.seed, b.day, "kiruna", "water"); // baseState's own seed/day

  it("the first MARKET_DEPTH units all sell at list", () => {
    const r = saleProceeds(at(0), "water", MARKET_DEPTH);
    expect(r.gross).toBe(MARKET_DEPTH * list());
    expect(r.atList).toBe(MARKET_DEPTH);
    expect(r.degradedUnits).toBe(0);
  });

  it("units past depth degrade by DEPTH_SLOPE per unit", () => {
    const r = saleProceeds(at(MARKET_DEPTH), "water", 2);
    const l = list();
    expect(r.gross).toBe(
      Math.max(1, Math.round(l * (1 - DEPTH_SLOPE))) +
        Math.max(1, Math.round(l * (1 - 2 * DEPTH_SLOPE)))
    );
    expect(r.atList).toBe(0);
    expect(r.degradedUnits).toBe(2);
  });

  it("degradation floors at DEPTH_FLOOR × list", () => {
    const r = saleProceeds(at(MARKET_DEPTH + 1000), "water", 1);
    expect(r.gross).toBe(Math.max(1, Math.round(list() * DEPTH_FLOOR)));
  });

  it("every unit is worth at least 1cr however deep the market", () => {
    const r = saleProceeds(at(10_000), "water", 30);
    expect(r.gross).toBeGreaterThanOrEqual(30);
  });

  it("a split sale grosses the same as one big sale (positional curve)", () => {
    const whole = saleProceeds(at(0), "water", 30).gross;
    const first = saleProceeds(at(0), "water", 15).gross;
    const second = saleProceeds(at(15), "water", 15).gross;
    expect(first + second).toBe(whole);
  });

  it("the atList/degraded split is positional, not price-based", () => {
    const r = saleProceeds(at(MARKET_DEPTH - 3), "water", 10);
    expect(r.atList).toBe(3);
    expect(r.degradedUnits).toBe(7);
  });
});

describe("escape math prices the hold through depth (E2-1/E2-2h)", () => {
  it("a saturated market can strand a ship that spot pricing would call safe", () => {
    const fresh = (qty: number) =>
      baseState({
        location: "meridian",
        fuel: 0,
        credits: 0,
        cargo: { water: qty, parts: 0, luxury: 0 },
      });
    let qty = 1;
    while (netSaleProceeds(fresh(qty), "water", qty) < escapeCost(fresh(qty))) qty++;
    expect(canEscape(fresh(qty))).toBe(true);
    const saturated = {
      ...fresh(qty),
      soldHere: { water: MARKET_DEPTH + 1000, parts: 0, luxury: 0 },
    };
    expect(netSaleProceeds(saturated, "water", qty)).toBeLessThan(escapeCost(saturated));
    expect(canEscape(saturated)).toBe(false);
  });
});

describe("heat (E1-5) — danger scaled by peak fortune", () => {
  const withPeak = (peakNetWorth: number) => ({ ...createGame(42), peakNetWorth });

  it("is zero for a fresh run and for any non-positive peak", () => {
    expect(heatOf(createGame(42))).toBe(0);
    expect(heatOf(withPeak(0))).toBe(0);
    expect(heatOf(withPeak(-5000))).toBe(0);
  });

  it("steps once per HEAT_PER_CR of peak, not continuously", () => {
    expect(heatOf(withPeak(HEAT_PER_CR - 1))).toBe(0);
    expect(heatOf(withPeak(HEAT_PER_CR))).toBe(HEAT_STEP);
    expect(heatOf(withPeak(HEAT_PER_CR * 2 - 1))).toBe(HEAT_STEP);
    expect(heatOf(withPeak(6249))).toBe(0.04); // the measured day-11 median
  });

  it("caps, so no fortune can push a lane past HEAT_CAP", () => {
    expect(heatOf(withPeak((HEAT_CAP / HEAT_STEP) * HEAT_PER_CR))).toBe(HEAT_CAP);
    expect(heatOf(withPeak(10_000_000))).toBe(HEAT_CAP);
  });

  it("returns exact 2-decimal values, so displayed % and thresholds never drift", () => {
    expect(heatOf(withPeak(HEAT_PER_CR * 3))).toBe(0.03); // not 0.030000000000000002
    expect(Math.round(heatOf(withPeak(HEAT_PER_CR * 7)) * 100)).toBe(7);
  });
});
