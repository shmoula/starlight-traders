// src/engine/modifiers.ts
//
// Daily modifiers (E3-1): one seeded modifier per daily seed — constant for the whole
// run — gives every date a nameable personality ("ion storms today"). Effects channel
// exclusively through the existing single-source functions (fuelCost, getPrice, the
// rollEvent bands), so every surface inherits them honestly (E1-4/B-1). No GameState
// field: the modifier is derivable from `seed` anywhere, including the sim and a
// rehydrated snapshot (spec decision 1).
import { CommodityId, NodeId } from "./types";
import { hashSeed } from "./rng";

export type ModifierId =
  | "clearSkies"
  | "ionStorms"
  | "luxuryBoom"
  | "partsGlut"
  | "amnesty"
  | "corsairSeason"
  | "syndicateRest";

export interface DailyModifier {
  id: ModifierId;
  name: string; // "Ion storms"
  glyph: string; // "⚡"
  /** ≤70 chars, "TODAY: "-prefixed — the bulletin's lead line (spec decision 12). */
  bulletinLine: string;
  /** Extra fuel burned by long-haul jumps (ionStorms) — see fuelCost/isLongHaul. */
  fuelDelta?: number;
  /** Price multiplier for one (node, commodity) pair, applied inside getPrice. */
  priceMult?: { node: NodeId; commodity: CommodityId; mult: number };
  /** Event-band tweak: amnesty empties both hostile bands; corsairs raise every lane. */
  eventTweak?: "amnesty" | "corsairs";
  /** syndicateRest: jump() skips the interest accrual all run. */
  interestHoliday?: boolean;
}

/** Chosen for even coverage of sweep seeds 1–100: every pool slot gets ≥13 seeds. */
const MODIFIER_SALT = 0x7007;

/** ⚙ corsairSeason: added to every lane's danger (effectiveDanger, events.ts). */
export const CORSAIR_DANGER_DELTA = 0.06;

// Pool order is load-bearing for the seed → modifier map recorded in the round plan;
// append new entries rather than reordering.
export const MODIFIER_POOL: readonly DailyModifier[] = [
  {
    id: "clearSkies",
    name: "Clear skies",
    glyph: "✨",
    bulletinLine: "TODAY: Clear skies — no modifier, pure trading",
  },
  {
    id: "ionStorms",
    name: "Ion storms",
    glyph: "⚡",
    fuelDelta: 1, // ⚙
    bulletinLine: "TODAY: Ion storms — long crossings burn +1⛽",
  },
  {
    id: "luxuryBoom",
    name: "Luxury boom",
    glyph: "💎",
    priceMult: { node: "meridian", commodity: "luxury", mult: 1.25 }, // ⚙
    bulletinLine: "TODAY: Luxury boom — Meridian pays +25% for luxury",
  },
  {
    id: "partsGlut",
    name: "Parts glut",
    glyph: "⚙",
    priceMult: { node: "vulcan", commodity: "parts", mult: 0.8 }, // ⚙
    bulletinLine: "TODAY: Parts glut — Vulcan sells Machine Parts 20% off",
  },
  {
    id: "amnesty",
    name: "Pirate amnesty",
    glyph: "🕊",
    eventTweak: "amnesty",
    bulletinLine: "TODAY: Pirate amnesty — no ambushes, no salvage fields",
  },
  {
    id: "corsairSeason",
    name: "Corsair season",
    glyph: "☠",
    eventTweak: "corsairs",
    bulletinLine: "TODAY: Corsair season — every lane +6% raid risk",
  },
  {
    id: "syndicateRest",
    name: "Syndicate rest",
    glyph: "🏦",
    interestHoliday: true,
    bulletinLine: "TODAY: The Syndicate rests — no interest compounds",
  },
];

/** Today's sky — everyone flying `seed` shares it for all 12 days (spec decision 1). */
export function dailyModifier(seed: number): DailyModifier {
  return MODIFIER_POOL[hashSeed(seed, MODIFIER_SALT) % MODIFIER_POOL.length];
}

/** Extra fuel under `seed`'s modifier — 0 on ordinary days. fuelCost applies this only
 *  to long-haul lanes (isLongHaul), so short survival hops stay cheap (E3-1). */
export function fuelDelta(seed: number): number {
  return dailyModifier(seed).fuelDelta ?? 0;
}

/** getPrice's modifier hook: the multiplier for (node, commodity) under `seed`, else 1. */
export function priceMultiplier(seed: number, node: NodeId, commodity: CommodityId): number {
  const m = dailyModifier(seed).priceMult;
  return m && m.node === node && m.commodity === commodity ? m.mult : 1;
}
