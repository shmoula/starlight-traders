import { describe, it, expect } from "vitest";
import { generateMissions, missionFeasibility } from "../../src/engine/missions";
import { createGame } from "../../src/engine/game";
import { COMMODITIES, NODE_IDS, getPrice, baselinePrice, fuelCost } from "../../src/engine/world";
import { mulberry32, hashSeed } from "../../src/engine/rng";
import { MISSION_REWARD_FLOOR_MULT, REFUEL_PRICE, dockingFee } from "../../src/engine/economy";
import { Mission, NodeId } from "../../src/engine/types";

describe("generateMissions", () => {
  it("is deterministic for the same seed/day/node", () => {
    const a = generateMissions(5, 3, "terra");
    const b = generateMissions(5, 3, "terra");
    expect(a).toEqual(b);
  });

  it("returns 1-3 missions whose destination is never the origin", () => {
    for (let day = 1; day <= 20; day++) {
      const ms = generateMissions(9, day, "terra");
      expect(ms.length).toBeGreaterThanOrEqual(1);
      expect(ms.length).toBeLessThanOrEqual(3);
      ms.forEach((m) => expect(m.destination).not.toBe("terra"));
    }
  });

  it("gives positive reward, qty, and a future deadline", () => {
    const ms = generateMissions(1, 2, "vulcan");
    ms.forEach((m) => {
      expect(m.reward).toBeGreaterThan(0);
      expect(m.qty).toBeGreaterThan(0);
      expect(m.deadlineDay).toBeGreaterThan(2);
    });
  });
});

describe("reward floor + deposit (E2-2)", () => {
  it("floors every reward at 1.2× the origin cost, capped by the destination premium", () => {
    let aboveFloor = 0;
    let total = 0;
    for (let seed = 1; seed <= 30; seed++) {
      for (let day = 1; day <= 12; day++) {
        for (const node of NODE_IDS) {
          for (const m of generateMissions(seed, day, node)) {
            const originCost = m.qty * getPrice(seed, day, node, m.commodity);
            // E2-2f: the premium anchors to the destination's day-independent base, not
            // the offer-day spot — so the cap is measured against baselinePrice.
            const destBase = m.qty * baselinePrice(m.destination, m.commodity);
            const floor = Math.round(1.2 * originCost);
            expect(m.reward).toBeGreaterThanOrEqual(floor);
            expect(m.reward).toBeLessThanOrEqual(Math.max(Math.round(1.7 * destBase), floor));
            total++;
            if (m.reward > floor) aboveFloor++;
          }
        }
      }
    }
    // The cap alone can't tell a real premium roll apart from an implementation that always
    // pays exactly the floor (the floor is one arm of the cap's own max) — a mutant that drops
    // the premium roll entirely would still satisfy both bounds above on every mission. Assert
    // the premium roll, not the floor, is what actually sets most rewards.
    expect(aboveFloor).toBeGreaterThan(total / 2);
  });

  it("carries a deposit of 10% of the reward, rounded", () => {
    for (const node of NODE_IDS) {
      for (const m of generateMissions(7, 3, node)) {
        expect(m.deposit).toBe(Math.round(0.1 * m.reward));
      }
    }
  });

  it("keeps mission identity unchanged by the floor (RNG draw order preserved)", () => {
    // Reference implementation of the pre-floor generator: identical draws, no floor.
    // The floor may only raise rewards — id/commodity/qty/destination/deadline must not shift.
    const reference = (seed: number, day: number, node: NodeId) => {
      const rng = mulberry32(hashSeed(seed, day, node.charCodeAt(0), 777));
      const count = 1 + Math.floor(rng() * 3);
      const others = NODE_IDS.filter((n) => n !== node);
      const out = [];
      for (let i = 0; i < count; i++) {
        const commodity = COMMODITIES[Math.floor(rng() * COMMODITIES.length)].id;
        const destination = others[Math.floor(rng() * others.length)];
        const qty = 3 + Math.floor(rng() * 8);
        rng(); // the reward draw — value unused for identity
        const deadlineDay = day + 4 + Math.floor(rng() * 5);
        out.push({ id: `${node}-${day}-${i}`, commodity, destination, qty, deadlineDay });
      }
      return out;
    };
    for (let seed = 1; seed <= 10; seed++) {
      for (const node of NODE_IDS) {
        const actual = generateMissions(seed, 3, node).map(
          ({ id, commodity, destination, qty, deadlineDay }) => ({
            id,
            commodity,
            destination,
            qty,
            deadlineDay,
          })
        );
        expect(actual).toEqual(reference(seed, 3, node));
      }
    }
  });
});

describe("reward anchoring (E2-2f)", () => {
  it("rewards never exceed the premium band over the day-independent base", () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (let day = 1; day <= 8; day++) {
        for (const origin of NODE_IDS) {
          for (const m of generateMissions(seed, day, origin)) {
            const base = baselinePrice(m.destination, m.commodity);
            const floor = Math.round(
              MISSION_REWARD_FLOOR_MULT * m.qty * getPrice(seed, day, origin, m.commodity)
            );
            expect(m.reward).toBeLessThanOrEqual(Math.max(Math.round(1.7 * base * m.qty), floor));
            expect(m.reward).toBeGreaterThanOrEqual(
              Math.min(Math.floor(1.3 * base * m.qty), floor)
            );
          }
        }
      }
    }
  });
});

describe("missionFeasibility (P2-3)", () => {
  const m: Mission = {
    id: "f1",
    commodity: "water",
    qty: 10,
    destination: "kiruna",
    reward: 500,
    deposit: 50,
    deadlineDay: 9,
  };

  it("composes cost, fuel, est. profit, and days left from the live engine numbers", () => {
    const s = createGame(42); // terra, day 1
    const f = missionFeasibility(s, m);
    const cargoCost = 10 * getPrice(42, 1, "terra", "water");
    const fuel = fuelCost(42, "terra", "kiruna"); // 4
    expect(f).toEqual({
      cargoCost,
      fuel,
      estProfit: 500 - cargoCost - fuel * REFUEL_PRICE - dockingFee("kiruna"),
      daysLeft: 8,
    });
  });

  it("skips fuel and dock fee when already at the destination (no jump, no fee)", () => {
    const s = { ...createGame(42), location: "kiruna" as const, day: 4 };
    const f = missionFeasibility(s, m);
    expect(f.fuel).toBe(0);
    expect(f.estProfit).toBe(500 - 10 * getPrice(42, 4, "kiruna", "water"));
    expect(f.daysLeft).toBe(5);
  });

  it("passes a negative estProfit through unrounded and unclamped", () => {
    const underwater: Mission = { ...m, reward: 10 };
    const s = createGame(42); // terra, day 1
    const f = missionFeasibility(s, underwater);
    const cargoCost = 10 * getPrice(42, 1, "terra", "water");
    const fuel = fuelCost(42, "terra", "kiruna"); // 4
    expect(f.estProfit).toBe(10 - cargoCost - fuel * REFUEL_PRICE - dockingFee("kiruna"));
    expect(f.estProfit).toBeLessThan(0);
  });
});
