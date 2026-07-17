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
    danger: 0,
    feeMultiplier: 1.6,
    taxRate: 0.05,
    produces: [],
    demands: [],
  },
  kiruna: {
    id: "kiruna",
    name: "Kiruna Belt",
    danger: 0,
    feeMultiplier: 0.6,
    taxRate: 0.02,
    produces: ["water"],
    demands: [],
  },
  vulcan: {
    id: "vulcan",
    name: "Vulcan Yards",
    danger: 0.15,
    feeMultiplier: 0.9,
    taxRate: 0.04,
    produces: ["parts"],
    demands: ["water"],
  },
  verge: {
    id: "verge",
    name: "The Verge",
    danger: 0.5,
    feeMultiplier: 0.7,
    taxRate: 0,
    produces: [],
    demands: ["luxury", "parts"],
  },
  meridian: {
    id: "meridian",
    name: "Meridian",
    danger: 0.2,
    feeMultiplier: 1.8,
    taxRate: 0.18,
    produces: [],
    demands: ["luxury"],
  },
};

export const NODE_IDS = Object.keys(NODES) as NodeId[];

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

const COMMODITY_BY_ID: Record<CommodityId, Commodity> = Object.fromEntries(
  COMMODITIES.map((c) => [c.id, c])
) as Record<CommodityId, Commodity>;

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
  if (station.produces.includes(commodity)) modifier *= 0.7;
  if (station.demands.includes(commodity)) modifier *= 1.4;
  const price = Math.round(c.basePrice * modifier);
  return Math.max(1, price);
}
