// src/engine/missions.ts
import { CommodityId, Mission, NodeId } from "./types";
import { COMMODITIES, NODE_IDS, getPrice } from "./world";
import { mulberry32, hashSeed } from "./rng";

/** Deterministic set of delivery missions offered at a node on a given day. */
export function generateMissions(seed: number, day: number, node: NodeId): Mission[] {
  const rng = mulberry32(hashSeed(seed, day, node.charCodeAt(0), 777));
  const count = 1 + Math.floor(rng() * 3); // 1..3
  const others = NODE_IDS.filter((n) => n !== node);
  const missions: Mission[] = [];
  for (let i = 0; i < count; i++) {
    const commodity = COMMODITIES[Math.floor(rng() * COMMODITIES.length)].id as CommodityId;
    const destination = others[Math.floor(rng() * others.length)];
    const qty = 3 + Math.floor(rng() * 8); // 3..10
    const unit = getPrice(seed, day, destination, commodity);
    const premium = Math.round(unit * qty * (1.3 + rng() * 0.4)); // premium over destination spot
    // E2-2c: never pay under 1.2× what the cargo costs at this board's own dock today.
    const reward = Math.max(premium, Math.round(1.2 * qty * getPrice(seed, day, node, commodity)));
    const deadlineDay = day + 4 + Math.floor(rng() * 5); // +4..+8 days
    missions.push({
      id: `${node}-${day}-${i}`,
      commodity,
      qty,
      destination,
      reward,
      deposit: Math.round(0.1 * reward),
      deadlineDay,
    });
  }
  return missions;
}
