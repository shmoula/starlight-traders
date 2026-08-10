import { describe, it, expect } from "vitest";
import { generateMissions } from "../../src/engine/missions";
import { COMMODITIES, NODE_IDS, getPrice, fuelCost } from "../../src/engine/world";
import { REFUEL_PRICE, dockingFee } from "../../src/engine/economy";

/** Best single-jump arbitrage profit on `day` with capital K and a 30-unit hold. */
function bestArb(seed: number, day: number, K: number): number {
  let best = 0;
  for (const a of NODE_IDS) {
    for (const b of NODE_IDS) {
      if (a === b) continue;
      for (const c of COMMODITIES) {
        const buyP = getPrice(seed, day, a, c.id);
        const units = Math.min(30, Math.floor(K / buyP));
        const p =
          units * (getPrice(seed, day + 1, b, c.id) - buyP) -
          fuelCost(a, b) * REFUEL_PRICE -
          dockingFee(b);
        if (p > best) best = p;
      }
    }
  }
  return best;
}

describe("contract bounce line (E2-2f)", () => {
  // The day-independent anchor (baselinePrice) holds the bounce line at 2 of ~6k
  // contracts (was 4 under the offer-day spot anchor); ≤3 fails if the exploit creeps
  // back. Numbers are deterministic — generateMissions/getPrice are pure and seeded.
  it("buy-at-destination + B→C→B re-qualification beats honest play in ≤3 of ~6k contracts", () => {
    let beats = 0;
    for (let seed = 1; seed <= 100; seed++) {
      for (let day = 1; day <= 6; day++) {
        for (const origin of NODE_IDS) {
          for (const m of generateMissions(seed, day, origin)) {
            if (m.destination === origin || day + 3 > m.deadlineDay) continue;
            const B = m.destination;
            const C = NODE_IDS.filter((n) => n !== B && n !== origin).sort(
              (a, b) => fuelCost(B, a) - fuelCost(B, b)
            )[0];
            const K =
              m.qty * getPrice(seed, day + 1, B, m.commodity) +
              (fuelCost(origin, B) + fuelCost(B, C) + fuelCost(C, B)) * REFUEL_PRICE +
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
