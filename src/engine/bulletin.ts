// src/engine/bulletin.ts
//
// Today's Trade Bulletin (E1-1): three rumor lines derived deterministically from the
// day-1 price grid via the existing getPrice — no new RNG streams, so every player
// sees the same lines on a date. Prices drift after day 1: these are leads, not oracles.
import { CommodityId, NodeId } from "./types";
import { COMMODITIES, NODES, NODE_IDS, commodityName, getPrice, riskiestLane } from "./world";
import { crewName, capFirst } from "./fiction";

interface PricePoint {
  node: NodeId;
  commodity: CommodityId;
  price: number;
  /** Price vs base — the "how unusual is this" measure the lines rank by. */
  ratio: number;
}

function pricePoints(seed: number, kind: "produces" | "demands"): PricePoint[] {
  const out: PricePoint[] = [];
  for (const node of NODE_IDS) {
    for (const commodity of NODES[node][kind]) {
      const price = getPrice(seed, 1, node, commodity);
      const base = COMMODITIES.find((c) => c.id === commodity)!.basePrice;
      out.push({ node, commodity, price, ratio: price / base });
    }
  }
  return out;
}

/** The three "word on the docks" lines for a daily seed. Each ≤70 chars. */
export function bulletin(seed: number): string[] {
  const producePts = pricePoints(seed, "produces");
  const demandPts = pricePoints(seed, "demands");
  if (producePts.length === 0 || demandPts.length === 0) {
    throw new Error("bulletin requires at least one producing and one demanding station");
  }
  const glut = producePts.reduce((a, b) => (b.ratio < a.ratio ? b : a));
  const premium = demandPts.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  const [riskA, riskB] = riskiestLane();
  const taxPct = Math.round(NODES[premium.node].taxRate * 100);
  const taxNote = taxPct > 0 ? `taxed ${taxPct}%` : "tax-free";
  return [
    `${commodityName(glut.commodity)} glut at ${NODES[glut.node].name} — buying at ${glut.price}cr`,
    `${NODES[premium.node].name} pays ${premium.price}cr for ${commodityName(premium.commodity)} — ${taxNote}`,
    `${capFirst(crewName(seed))} chatter thick on the ${NODES[riskA].name}–${NODES[riskB].name} lane`,
  ];
}
