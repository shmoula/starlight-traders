// src/engine/missions.ts
import { GameState, Mission, NodeId } from "./types";
import { COMMODITIES, NODE_IDS, baselinePrice, fuelCost, getPrice } from "./world";
import { mulberry32, hashSeed } from "./rng";
import {
  MISSION_REWARD_FLOOR_MULT,
  MISSION_DEPOSIT_RATE,
  REFUEL_PRICE,
  dockingFee,
} from "./economy";

/** Deterministic set of delivery missions offered at a node on a given day. */
export function generateMissions(seed: number, day: number, node: NodeId): Mission[] {
  const rng = mulberry32(hashSeed(seed, day, node.charCodeAt(0), 777));
  const count = 1 + Math.floor(rng() * 3); // 1..3
  const others = NODE_IDS.filter((n) => n !== node);
  const missions: Mission[] = [];
  for (let i = 0; i < count; i++) {
    const commodity = COMMODITIES[Math.floor(rng() * COMMODITIES.length)].id;
    const destination = others[Math.floor(rng() * others.length)];
    const qty = 3 + Math.floor(rng() * 8); // 3..10
    // E2-2f: the premium anchors to the destination's day-independent base, not the
    // offer-day spot — a volatility spike can no longer lock in a stale reward the
    // player later buys under at the destination. RNG draw order is unchanged.
    const destUnit = baselinePrice(destination, commodity);
    const premium = Math.round(destUnit * qty * (1.3 + rng() * 0.4)); // premium over destination base
    // E2-2c: never pay under MISSION_REWARD_FLOOR_MULT× what the cargo costs at this board's own dock today.
    const originUnit = getPrice(seed, day, node, commodity);
    const reward = Math.max(premium, Math.round(MISSION_REWARD_FLOOR_MULT * qty * originUnit));
    const deadlineDay = day + 4 + Math.floor(rng() * 5); // +4..+8 days
    missions.push({
      id: `${node}-${day}-${i}`,
      commodity,
      qty,
      destination,
      reward,
      deposit: Math.round(MISSION_DEPOSIT_RATE * reward),
      deadlineDay,
    });
  }
  return missions;
}

/**
 * What serving `m` costs from where the player stands (P2-3). Pure display math: buy the
 * full qty here today, burn the direct jump's fuel at replacement price, pay the
 * destination dock fee (skipped when already there — no jump, no fee). The deposit is
 * excluded — it returns on delivery — so the card shows it as its own chip instead.
 */
export function missionFeasibility(
  s: GameState,
  m: Mission
): { cargoCost: number; fuel: number; estProfit: number; daysLeft: number } {
  const cargoCost = m.qty * getPrice(s.seed, s.day, s.location, m.commodity);
  const fuel = fuelCost(s.location, m.destination);
  const dock = fuel > 0 ? dockingFee(m.destination) : 0;
  return {
    cargoCost,
    fuel,
    estProfit: m.reward - cargoCost - fuel * REFUEL_PRICE - dock,
    daysLeft: m.deadlineDay - s.day,
  };
}

/**
 * How many of `m`'s units would settle at local spot instead of earning the contract
 * premium (E2-2d): everything the hauled pool can't cover. Lives here, not in the
 * template, so the card's "N bought here pay spot" and settlement's payout split are the
 * same number by construction — the B-1 precedent. Callers gate on being at the
 * destination; away from it `jump` will have cleared `boughtHere` before settlement.
 */
export function docksideUnitsUsed(s: GameState, m: Mission): number {
  const hauledAvailable = Math.max(0, s.cargo[m.commodity] - s.boughtHere[m.commodity]);
  return m.qty - Math.min(m.qty, hauledAvailable);
}
