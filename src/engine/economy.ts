// src/engine/economy.ts
import { CommodityId, GameState, NodeId } from "./types";
import { COMMODITIES, NODES, cheapestJumpCost, getPrice } from "./world";

export const BASE_DOCKING_FEE = 25;
export const REFUEL_PRICE = 8; // credits per fuel unit
export const REPAIR_PRICE = 6; // credits per hull point
/**
 * A mission's reward must clear this multiple of what its cargo costs at the offering
 * station today — otherwise the board could dangle a delivery that pays less than the
 * cargo it asks you to buy, plus a 20% margin. Kills junk offers without touching the
 * premium roll that makes most missions worth more (E2-2c).
 */
export const MISSION_REWARD_FLOOR_MULT = 1.2;
/**
 * Fraction of a mission's reward escrowed on accept, refunded on delivery, forfeited on
 * expiry — the stake that makes signing a contract mean something (E2-2a).
 */
export const MISSION_DEPOSIT_RATE = 0.1;
/**
 * A single credit inflow at or above this marks the day 💰 on the share strip (E1-2).
 * Keep it at or below 912 — that is the guaranteed floor of the 5-luxury-unit fixture in
 * tests/engine/game.test.ts ("marks a big sale as bigTrade"), so a higher value would make
 * that test seed-dependent while still passing on seed 42. Tuned against the sim's 100-seed
 * 💰-day band (see SimResult.bigTradeDays).
 */
export const BIG_TRADE_CR = 900;
/** Days on which the Syndicate's patience steps down a tier (E0-4 tuning knob). */
export const LOAN_STEP_IMPATIENT = 5; // rate → 6%
export const LOAN_STEP_DESPERATE = 9; // rate → 8%

/** The Syndicate's loan rate by day — its patience runs out in steps (E0-4). */
export function loanRate(day: number): number {
  return day >= LOAN_STEP_DESPERATE ? 0.08 : day >= LOAN_STEP_IMPATIENT ? 0.06 : 0.04;
}

export function dockingFee(node: NodeId): number {
  return Math.round(BASE_DOCKING_FEE * NODES[node].feeMultiplier);
}

export function taxOnSale(node: NodeId, proceeds: number): number {
  if (proceeds <= 0) return 0;
  return Math.round(proceeds * NODES[node].taxRate);
}

// --- Market depth (E2-1) -------------------------------------------------------------
// A station absorbs only MARKET_DEPTH units per commodity per day at the listed price;
// each further unit sells at a linearly degraded price with a floor. Deterministic — the
// degraded price is exactly displayable (E1-4 honesty). The spread itself is untouched:
// depth constrains today's flow, not the price function.

export const MARKET_DEPTH = 20; // ⚙ units/commodity/day at list price
export const DEPTH_SLOPE = 0.08; // ⚙ price impact per unit past depth
export const DEPTH_FLOOR = 0.6; // ⚙ degraded price never falls below this × list

/** Sale price of one unit given `t` units already sold here today. */
function depthUnitPrice(list: number, t: number): number {
  const past = Math.max(0, t - MARKET_DEPTH + 1);
  return Math.max(1, Math.round(list * Math.max(DEPTH_FLOOR, 1 - DEPTH_SLOPE * past)));
}

export interface SaleProceeds {
  gross: number;
  /** Units (of this sale) that sold at the listed price — positional, not price-equality. */
  atList: number;
  degradedUnits: number;
}

/**
 * What selling `qty` of `id` here right now grosses, unit by unit down the depth curve —
 * the ONLY copy of the curve. sell(), the UI's netProceeds labels, and the escape math
 * (via netSaleProceeds → liquidationValue → canEscape) all price through this, so no
 * surface can promise proceeds the market won't pay (B-1).
 */
export function saleProceeds(s: GameState, id: CommodityId, qty: number): SaleProceeds {
  const list = getPrice(s.seed, s.day, s.location, id);
  const sold = s.soldHere[id];
  let gross = 0;
  for (let i = 0; i < qty; i++) gross += depthUnitPrice(list, sold + i);
  const atList = Math.min(qty, Math.max(0, MARKET_DEPTH - sold));
  return { gross, atList, degradedUnits: qty - atList };
}

export function loanInterest(debt: number, day: number): number {
  if (debt <= 0) return 0;
  return Math.ceil(debt * loanRate(day));
}

export function cargoUsed(cargo: Record<CommodityId, number>): number {
  return cargo.water + cargo.parts + cargo.luxury;
}

/** Value of held cargo at current location's prices. */
export function cargoValue(state: GameState): number {
  let total = 0;
  (Object.keys(state.cargo) as CommodityId[]).forEach((id) => {
    total += state.cargo[id] * getPrice(state.seed, state.day, state.location, id);
  });
  return total;
}

export function netWorth(state: GameState): number {
  return state.credits + cargoValue(state) - state.debt;
}

// --- Escape math (E2-2h) -----------------------------------------------------------
// One shared answer to "can this run still leave the station?", used by the loss check,
// by the dock-side guard that keeps a spend from stranding the player, and by the UI
// affordances that disable those spends. Three surfaces, one definition — the B-1 rule.

/** Net credits a sale of `qty` `id` yields at the current dock — down the depth curve
 *  (E2-1), after the local tax. */
export function netSaleProceeds(state: GameState, id: CommodityId, qty: number): number {
  const { gross } = saleProceeds(state, id, qty);
  return gross - taxOnSale(state.location, gross);
}

/**
 * What the whole hold would fetch here today if sold outright, after tax. This is the
 * part of `cargoValue` the player can actually spend, which is why the escape check uses
 * it instead: a ship with a full hold and an empty purse is not stranded, it is unsold.
 */
export function liquidationValue(state: GameState): number {
  return COMMODITIES.reduce((sum, c) => sum + netSaleProceeds(state, c.id, state.cargo[c.id]), 0);
}

/** Credits needed to top the tank up to the cheapest jump out — 0 once it is flyable. */
export function escapeCost(state: GameState): number {
  const shortfall = Math.max(0, cheapestJumpCost(state.seed, state.location) - state.fuel);
  return shortfall * REFUEL_PRICE;
}

/**
 * Can this run still leave the station — flying now, or after selling up and refueling?
 * The fuel test comes first and is unconditional: docking fees are charged without a
 * floor, so a ship with a full tank can be carrying a negative purse and is still free
 * to go. Only a tank too short for the cheapest hop has to be bought out of trouble.
 */
export function canEscape(state: GameState): boolean {
  if (state.fuel >= cheapestJumpCost(state.seed, state.location)) return true;
  return state.credits + liquidationValue(state) >= escapeCost(state);
}

/**
 * The most credits a dock-side spend may consume and still leave the run able to leave.
 * Exact for spends that hand back nothing sellable (repair, debt, a contract bond); a
 * purchase turns credits into cargo worth nearly as much, so `buyBlockReason` prices
 * that one against the resulting state instead.
 */
export function spendableCredits(state: GameState): number {
  return Math.max(
    0,
    Math.min(state.credits, state.credits + liquidationValue(state) - escapeCost(state))
  );
}
