import { describe, it, expect } from "vitest";
import { bulletin } from "../../src/engine/bulletin";
import { COMMODITIES, NODES, NODE_IDS, getPrice } from "../../src/engine/world";
import { CommodityId, NodeId } from "../../src/engine/types";
import { crewName, capFirst, CREW_ROSTER } from "../../src/engine/fiction";
import { dailyModifier } from "../../src/engine/modifiers";
import { iceRunDay } from "../../src/engine/missions";

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

/** All (node, commodity) pairs the station produces, with day-1 price and ratio vs base. */
function producePairs(seed: number) {
  const out: { node: NodeId; commodity: CommodityId; price: number; ratio: number }[] = [];
  for (const n of NODE_IDS) {
    for (const c of NODES[n].produces) {
      const price = getPrice(seed, 1, n, c);
      const base = COMMODITIES.find((x) => x.id === c)!.basePrice;
      out.push({ node: n, commodity: c, price, ratio: price / base });
    }
  }
  return out;
}

/** All (node, commodity) pairs the station demands, with day-1 price and ratio vs base. */
function demandPairs(seed: number) {
  const out: { node: NodeId; commodity: CommodityId; price: number; ratio: number }[] = [];
  for (const n of NODE_IDS) {
    for (const c of NODES[n].demands) {
      const price = getPrice(seed, 1, n, c);
      const base = COMMODITIES.find((x) => x.id === c)!.basePrice;
      out.push({ node: n, commodity: c, price, ratio: price / base });
    }
  }
  return out;
}

describe("bulletin (E1-1)", () => {
  it("is deterministic: same seed, same lines", () => {
    expect(bulletin(1482862887)).toEqual(bulletin(1482862887));
    // seed 1482862887 posts a day-1 ice run → the full 5-line bulletin.
    expect(bulletin(1482862887)).toHaveLength(5);
  });

  it("leads with the modifier's TODAY line (E3-1)", () => {
    expect(bulletin(42)[0]).toBe(dailyModifier(42).bulletinLine);
    expect(bulletin(9)[0]).toContain("Pirate amnesty");
  });

  it("appends the ice-run notice exactly when day 1 posts one (E3-2b)", () => {
    expect(iceRunDay(5, 1)).toBe(true); // fixture guard
    expect(iceRunDay(42, 1)).toBe(false);
    const withIce = bulletin(5);
    expect(withIce).toHaveLength(5);
    expect(withIce[4]).toBe("❄ Ice run posted at Kiruna Belt — the Verge pays for water");
    expect(bulletin(42)).toHaveLength(4);
  });

  it("every line keeps the ≤70-char ticker budget", () => {
    for (const seed of [1, 3, 4, 5, 6, 9, 10, 42]) {
      for (const line of bulletin(seed)) expect(line.length, line).toBeLessThanOrEqual(70);
    }
  });

  it("every line stays within 70 characters across 50 seeds", () => {
    for (const seed of SEEDS) {
      for (const line of bulletin(seed)) {
        expect(line.length, `seed ${seed}: "${line}"`).toBeLessThanOrEqual(70);
      }
    }
  });

  it("the glut line names the deepest-discount day-1 produce price, verbatim", () => {
    for (const seed of SEEDS) {
      const glut = producePairs(seed).reduce((a, b) => (b.ratio < a.ratio ? b : a));
      expect(bulletin(seed)[1]).toContain(`${glut.price}cr`);
      expect(bulletin(seed)[1]).toContain(NODES[glut.node].name);
    }
  });

  it("the premium line names the highest-premium day-1 demand pair, verbatim", () => {
    for (const seed of SEEDS) {
      const premium = demandPairs(seed).reduce((a, b) => (b.ratio > a.ratio ? b : a));
      expect(bulletin(seed)[2]).toContain(`${premium.price}cr`);
      expect(bulletin(seed)[2]).toContain(
        COMMODITIES.find((c) => c.id === premium.commodity)!.name
      );
      expect(bulletin(seed)[2]).toContain(NODES[premium.node].name);
    }
  });

  it("the riskiest line names today's crew on the most dangerous lane (E2-3d)", () => {
    // Max EDGE_DANGER is the kiruna–verge / meridian–verge tie at 30%;
    // riskiestLane breaks ties by sorted key order → kiruna–verge.
    for (const seed of SEEDS) {
      expect(bulletin(seed)[3]).toBe(
        `${capFirst(crewName(seed))} chatter thick on the Kiruna Belt–The Verge lane`
      );
    }
  });

  it("the lane line stays within the 70-char budget for every pair and crew", () => {
    const longestCrew = CREW_ROSTER.reduce((a, b) => (b.length > a.length ? b : a));
    for (const a of NODE_IDS) {
      for (const b of NODE_IDS) {
        if (a >= b) continue;
        const line = `${capFirst(longestCrew)} chatter thick on the ${NODES[a].name}–${NODES[b].name} lane`;
        expect(line.length, line).toBeLessThanOrEqual(70);
      }
    }
  });

  it("the glut lead is actually profitable on day 1 (some station nets more after tax)", () => {
    for (const seed of SEEDS) {
      const glut = producePairs(seed).reduce((a, b) => (b.ratio < a.ratio ? b : a));
      const bestNet = Math.max(
        ...NODE_IDS.filter((n) => n !== glut.node).map((n) => {
          const gross = getPrice(seed, 1, n, glut.commodity);
          return gross - Math.round(gross * NODES[n].taxRate);
        })
      );
      expect(bestNet, `seed ${seed}`).toBeGreaterThan(glut.price);
    }
  });
});
