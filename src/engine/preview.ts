// src/engine/preview.ts
//
// Pure previews of event-choice outcomes. resolveChoice (game.ts) applies these
// same formulas, so a stake label shown on a choice button can never drift from
// what the choice actually does. E1-4 (honest events pass) extends this module.
import { GameEvent, GameState } from "./types";
import { cargoUsed } from "./economy";
import { commodityName, getPrice } from "./world";

/** Appended to a stake whose worst-case hull roll would destroy the ship (B-6 honesty). */
export const LETHAL_MARK = " — ⚠ could destroy you";

/** The marker when `worstCaseDamage` would reduce this ship's hull to 0 or below. */
function lethalIf(s: GameState, worstCaseDamage: number): string {
  return worstCaseDamage >= s.hull ? LETHAL_MARK : "";
}

/** Pirate toll demanded today, clamped to what the player holds. */
export function pirateToll(s: GameState): number {
  return Math.max(0, Math.min(s.credits, 150 + s.day * 10));
}

/** Hull damage taken when fleeing pirates. */
export function fleeDamage(day: number): number {
  return 15 + (day % 10);
}

/** Salvage units collected on a clean scoop, clamped to cargo room. */
export function salvageAmount(s: GameState): number {
  const room = s.cargoCapacity - cargoUsed(s.cargo);
  return Math.min(room, 2 + (s.day % 4));
}

/** Hull damage when the salvage field hides a hazard. */
export const SALVAGE_TRAP_DAMAGE = 10;
/** Collecting salvage hides a hazard on 1-in-N days (game.ts resolveSalvage's `% N`). */
export const SALVAGE_HAZARD_DIVISOR = 3;
/** A clean scoop draws a pirate tail on 1-in-N days (game.ts resolveSalvage's `% N`). */
export const SALVAGE_BAIT_DIVISOR = 4; // ⚙ E3-4

/** A coolant leak always vents this many units of trouble. */
export const ENGINE_LEAK = 2;
/** Hull cooked per unit of leak the tank is too empty to vent as fuel. */
export const ENGINE_STRAIN_PER_FUEL = 5;

/** Fuel burned by engine trouble — as much of the leak as the tank can cover. */
export function engineBurn(s: GameState): number {
  return Math.min(s.fuel, ENGINE_LEAK);
}

/** Hull damage when the tank is too empty to vent the whole leak as fuel. */
export function engineHullStrain(s: GameState): number {
  return (ENGINE_LEAK - engineBurn(s)) * ENGINE_STRAIN_PER_FUEL;
}

/** Credits found aboard a derelict on a lucky day. */
export function derelictReward(day: number): number {
  return 200 + day * 8;
}

/** Hull damage when the derelict is a trap. */
export const DERELICT_TRAP_DAMAGE = 20;
/** Boarding a derelict pays off on 1-in-N days (game.ts resolveDerelict's `% N`). */
export const DERELICT_REWARD_DIVISOR = 2;

/** Customs bribe: the going rate for luxury here, clamped to held credits. */
export function bribeCost(s: GameState): number {
  return Math.max(0, Math.min(s.credits, getPrice(s.seed, s.day, s.location, "luxury")));
}

/**
 * Human-readable stake per choice id of a pending event. Empty string / missing
 * key means "no stake worth stating" (e.g. staying on course).
 */
export function choiceStakes(s: GameState, e: GameEvent): Record<string, string> {
  switch (e.kind) {
    case "pirates":
      return {
        pay: `~${pirateToll(s)}cr`,
        flee: `risk ${fleeDamage(s.day)} hull${lethalIf(s, fleeDamage(s.day))}`,
      };
    case "salvage": {
      const got = salvageAmount(s);
      const gain = got > 0 ? `+${got} ${commodityName("parts")}` : `hold full, nothing to gain`;
      return {
        collect: `${gain}, or a hazard: −${SALVAGE_TRAP_DAMAGE} hull${lethalIf(s, SALVAGE_TRAP_DAMAGE)}`,
      };
    }
    case "engine": {
      const burn = engineBurn(s);
      const strain = engineHullStrain(s);
      const parts: string[] = [];
      if (burn > 0) parts.push(`−${burn} fuel`);
      if (strain > 0) parts.push(`−${strain} hull${lethalIf(s, strain)}`);
      return { ack: parts.join(", ") };
    }
    case "derelict":
      return {
        board: `could hold ~${derelictReward(s.day)}cr, or a trap: −${DERELICT_TRAP_DAMAGE} hull${lethalIf(s, DERELICT_TRAP_DAMAGE)}`,
      };
    case "customs":
      return {
        comply: s.cargo.luxury > 0 ? `lose ${s.cargo.luxury} luxury` : "nothing to seize",
        bribe: `~${bribeCost(s)}cr`,
      };
    default:
      return {};
  }
}

/**
 * Odds label per choice id, for gambles whose outcome is a seeded roll (E1-4).
 * Deterministic choices get no entry — a stake without odds is a price, not a bet.
 * The fractions derive from the same divisors resolveSalvage/resolveDerelict roll
 * against (game.ts), so retuning a divisor can't leave these labels stale.
 */
export function choiceOdds(e: GameEvent): Record<string, string> {
  switch (e.kind) {
    case "salvage":
      return {
        collect: `1-in-${SALVAGE_HAZARD_DIVISOR} hides a hazard · clean scoop: 1-in-${SALVAGE_BAIT_DIVISOR} is bait`,
      };
    case "derelict": {
      const rewardPct = Math.round(100 / DERELICT_REWARD_DIVISOR);
      return { board: `${rewardPct}/${100 - rewardPct}` };
    }
    default:
      return {};
  }
}
