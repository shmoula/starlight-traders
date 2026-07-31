import { describe, it, expect } from "vitest";
import { bulletin } from "../../src/engine/bulletin";
import { COMMODITIES, NODES, NODE_IDS, getPrice } from "../../src/engine/world";
import { CommodityId, NodeId } from "../../src/engine/types";

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

describe("bulletin (E1-1)", () => {
  it("is deterministic: same seed, same three lines", () => {
    expect(bulletin(1482862887)).toEqual(bulletin(1482862887));
    expect(bulletin(1482862887)).toHaveLength(3);
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
      expect(bulletin(seed)[0]).toContain(`${glut.price}cr`);
      expect(bulletin(seed)[0]).toContain(NODES[glut.node].name);
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
