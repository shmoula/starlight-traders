// src/engine/world.ts
import { Commodity, CommodityId, NodeId, StationNode } from "./types";
import { mulberry32, hashSeed } from "./rng";

export const COMMODITIES: Commodity[] = [
  { id: "water", name: "Water / Ice", basePrice: 20, volatility: 0.15 },
  { id: "parts", name: "Machine Parts", basePrice: 120, volatility: 0.35 },
  { id: "luxury", name: "Luxury Goods", basePrice: 480, volatility: 0.6 },
];

export const NODES: Record<NodeId, StationNode> = {
  terra: {
    id: "terra",
    name: "Terra Hub",
    feeMultiplier: 1.6,
    taxRate: 0.05,
    produces: [],
    demands: [],
  },
  kiruna: {
    id: "kiruna",
    name: "Kiruna Belt",
    feeMultiplier: 0.6,
    taxRate: 0.02,
    produces: ["water"],
    demands: [],
  },
  vulcan: {
    id: "vulcan",
    name: "Vulcan Yards",
    feeMultiplier: 0.9,
    taxRate: 0.04,
    produces: ["parts"],
    demands: ["water"],
  },
  verge: {
    id: "verge",
    name: "The Verge",
    feeMultiplier: 0.7,
    taxRate: 0,
    produces: [],
    demands: ["luxury", "parts"],
  },
  meridian: {
    id: "meridian",
    name: "Meridian",
    feeMultiplier: 1.8,
    taxRate: 0.18,
    produces: [],
    demands: ["luxury"],
  },
};

export const NODE_IDS = Object.keys(NODES) as NodeId[];

// Price modifiers applied by getPrice for a station's local specialities. Exported so
// UI intel labels (e.g. "−30%"/"+40%") derive from the same numbers and can't drift.
export const PRODUCE_PRICE_MULTIPLIER = 0.7; // a station discounts what it produces
export const DEMAND_PRICE_MULTIPLIER = 1.4; // and pays a premium for what it demands

// Fuel distance matrix (symmetric). Units = fuel consumed to make the jump.
const DISTANCE: Record<NodeId, Partial<Record<NodeId, number>>> = {
  terra: { kiruna: 4, vulcan: 3, verge: 6, meridian: 5 },
  kiruna: { terra: 4, vulcan: 3, verge: 7, meridian: 8 },
  vulcan: { terra: 3, kiruna: 3, verge: 4, meridian: 6 },
  verge: { terra: 6, kiruna: 7, vulcan: 4, meridian: 5 },
  meridian: { terra: 5, kiruna: 8, vulcan: 6, verge: 5 },
};

export function fuelCost(from: NodeId, to: NodeId): number {
  if (from === to) return 0;
  const d = DISTANCE[from][to];
  if (d === undefined) throw new Error(`No route ${from}->${to}`);
  return d;
}

/**
 * Fuel burned by the cheapest jump out of `from` — the minimum price of leaving at all.
 * The loss check, the dock-side escape guard (E2-2h) and the UI's fuel warning all key
 * off this one number, so "can I still get out of here?" means the same thing everywhere.
 */
export function cheapestJumpCost(from: NodeId): number {
  return Math.min(...NODE_IDS.filter((n) => n !== from).map((n) => fuelCost(from, n)));
}

/**
 * Per-lane ambush odds (E2-3a). Keyed by edgeKey(a, b) — the sorted pair — so an
 * asymmetric lane is unrepresentable. Values ARE the final probability rollEvent
 * uses and the UI shows (E1-4 honesty): no floor-plus-slope formula anywhere.
 *
 * Authored story (spec decision 3): the Terra core triangle and the
 * Terra–Meridian corridor are patrolled space (5–8%); direct approaches to
 * Meridian are raided (20–22%); no approach to The Verge is safe (25–30%).
 * Tests pin every lane to [0.05, 0.35] — no lane is ever "0%".
 */
export type EdgeKey = `${NodeId}-${NodeId}`;

/** Canonical lookup key for an unordered station pair. */
export function edgeKey(a: NodeId, b: NodeId): EdgeKey {
  return (a < b ? `${a}-${b}` : `${b}-${a}`) as EdgeKey;
}

export const EDGE_DANGER: Partial<Record<EdgeKey, number>> = {
  "kiruna-terra": 0.05,
  "meridian-terra": 0.06,
  "terra-vulcan": 0.07,
  "kiruna-vulcan": 0.08,
  "meridian-vulcan": 0.2,
  "kiruna-meridian": 0.22,
  "terra-verge": 0.25,
  "verge-vulcan": 0.28,
  "kiruna-verge": 0.3,
  "meridian-verge": 0.3,
};

/** Ambush odds on the lane between two stations — throws like fuelCost on a missing pair. */
export function laneDanger(a: NodeId, b: NodeId): number {
  const d = EDGE_DANGER[edgeKey(a, b)];
  if (d === undefined) throw new Error(`No lane ${a}<->${b}`);
  return d;
}

/** The safest way into a station — the dossier presence rule keys on this (E2-3, spec decision 5). */
export function safestApproach(id: NodeId): number {
  return Math.min(...NODE_IDS.filter((n) => n !== id).map((n) => laneDanger(id, n)));
}

/** The single most dangerous lane (max EDGE_DANGER; ties broken by sorted key order). */
export function riskiestLane(): [NodeId, NodeId] {
  const keys = (Object.keys(EDGE_DANGER) as EdgeKey[]).sort();
  const top = keys.reduce((a, b) => (EDGE_DANGER[b]! > EDGE_DANGER[a]! ? b : a));
  return top.split("-") as [NodeId, NodeId];
}

const COMMODITY_BY_ID: Record<CommodityId, Commodity> = Object.fromEntries(
  COMMODITIES.map((c) => [c.id, c])
) as Record<CommodityId, Commodity>;

export function commodityName(id: CommodityId): string {
  return COMMODITY_BY_ID[id].name;
}

/**
 * Deterministic local price for a commodity at a node on a given day.
 * Produced -> discounted; demanded -> premium; plus seeded daily noise.
 */
export function getPrice(seed: number, day: number, node: NodeId, commodity: CommodityId): number {
  const c = COMMODITY_BY_ID[commodity];
  const station = NODES[node];
  const rng = mulberry32(
    hashSeed(seed, day, node.length, commodity.length, node.charCodeAt(0), commodity.charCodeAt(0))
  );
  const noise = (rng() * 2 - 1) * c.volatility; // -vol..+vol
  let modifier = 1 + noise;
  if (station.produces.includes(commodity)) modifier *= PRODUCE_PRICE_MULTIPLIER;
  if (station.demands.includes(commodity)) modifier *= DEMAND_PRICE_MULTIPLIER;
  const price = Math.round(c.basePrice * modifier);
  return Math.max(1, price);
}

/**
 * The day-independent price of `commodity` at `node`: basePrice under the station's
 * produce/demand modifiers with the noise term removed (E2-2f). Mission rewards anchor
 * here, so a volatile offer-day spot can never lock a stale premium into a contract.
 * This is exactly `getPrice` with noise = 0 (modifier starts at 1, same modifiers,
 * same rounding/floor), so it is the noise-free twin of the price function.
 */
export function baselinePrice(node: NodeId, commodity: CommodityId): number {
  const c = COMMODITY_BY_ID[commodity];
  const station = NODES[node];
  let modifier = 1;
  if (station.produces.includes(commodity)) modifier *= PRODUCE_PRICE_MULTIPLIER;
  if (station.demands.includes(commodity)) modifier *= DEMAND_PRICE_MULTIPLIER;
  return Math.max(1, Math.round(c.basePrice * modifier));
}
