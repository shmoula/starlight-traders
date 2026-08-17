import { describe, it, expect } from "vitest";
import { generateMissions } from "../../src/engine/missions";
import { COMMODITIES, NODE_IDS, getPrice, fuelCost } from "../../src/engine/world";
import { REFUEL_PRICE, dockingFee, saleProceeds, taxOnSale } from "../../src/engine/economy";
import { GameState, NodeId, emptyRecords } from "../../src/engine/types";

/** Minimal state to price a sale at `node` on `day` into an unsold (soldHere = 0) market. */
function sellState(seed: number, day: number, node: NodeId): GameState {
  return {
    seed,
    day,
    credits: 0,
    debt: 0,
    location: node,
    fuel: 0,
    fuelCapacity: 20,
    hull: 100,
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
    records: emptyRecords(),
    status: "playing",
    log: [],
    bootDate: "",
  };
}

/** Best single-jump arbitrage profit on `day` with capital K and a 30-unit hold. */
function bestArb(seed: number, day: number, K: number): number {
  let best = 0;
  for (const a of NODE_IDS) {
    for (const b of NODE_IDS) {
      if (a === b) continue;
      for (const c of COMMODITIES) {
        const buyP = getPrice(seed, day, a, c.id);
        const units = Math.min(30, Math.floor(K / buyP));
        // Price the sell through the production depth curve into a fresh market,
        // net of sale tax — the same settlement an honest trader actually faces.
        const { gross } = saleProceeds(sellState(seed, day + 1, b), c.id, units);
        const p =
          gross -
          taxOnSale(b, gross) -
          units * buyP -
          fuelCost(seed, a, b) * REFUEL_PRICE -
          dockingFee(b);
        if (p > best) best = p;
      }
    }
  }
  return best;
}

describe("contract bounce line (E2-2f)", () => {
  // The day-independent anchor (baselinePrice) holds the bounce line at 3 of ~6k
  // contracts when honest arbitrage is priced faithfully — down the production depth
  // curve and net of sale tax, the settlement an honest trader actually faces; ≤3 fails
  // if the exploit creeps back. Numbers are deterministic — generateMissions/getPrice/
  // saleProceeds are pure and seeded.
  it("buy-at-destination + B→C→B re-qualification beats honest play in ≤3 of ~6k contracts", () => {
    let beats = 0;
    for (let seed = 1; seed <= 100; seed++) {
      for (let day = 1; day <= 6; day++) {
        for (const origin of NODE_IDS) {
          for (const m of generateMissions(seed, day, origin)) {
            if (m.destination === origin || day + 3 > m.deadlineDay) continue;
            const B = m.destination;
            const C = NODE_IDS.filter((n) => n !== B && n !== origin).sort(
              (a, b) => fuelCost(seed, B, a) - fuelCost(seed, B, b)
            )[0];
            const K =
              m.qty * getPrice(seed, day + 1, B, m.commodity) +
              (fuelCost(seed, origin, B) + fuelCost(seed, B, C) + fuelCost(seed, C, B)) *
                REFUEL_PRICE +
              2 * dockingFee(B) +
              dockingFee(C);
            const bounceProfit = m.reward - K;
            const honest3 =
              bestArb(seed, day, K) + bestArb(seed, day + 1, K) + bestArb(seed, day + 2, K);
            if (bounceProfit > 0 && bounceProfit > honest3) beats++;
          }
        }
      }
    }
    expect(beats).toBeLessThanOrEqual(3);
  });
});
