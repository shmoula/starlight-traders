// src/engine/economy.ts
import { CommodityId, GameState, NodeId } from "./types";
import { NODES, getPrice } from "./world";

export const BASE_DOCKING_FEE = 25;
export const REFUEL_PRICE = 8; // credits per fuel unit
export const REPAIR_PRICE = 6; // credits per hull point
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
