import { describe, it, expect } from "vitest";
import { generateMissions } from "../../src/engine/missions";
import { COMMODITIES, NODE_IDS, getPrice } from "../../src/engine/world";
import { mulberry32, hashSeed } from "../../src/engine/rng";
import { NodeId } from "../../src/engine/types";

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
  it("floors every reward at 1.2× the cargo's cost at the offering station", () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (let day = 1; day <= 12; day++) {
        for (const node of NODE_IDS) {
          for (const m of generateMissions(seed, day, node)) {
            const originCost = m.qty * getPrice(seed, day, node, m.commodity);
            expect(m.reward).toBeGreaterThanOrEqual(Math.round(1.2 * originCost));
          }
        }
      }
    }
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
