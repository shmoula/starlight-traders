// src/engine/preview.ts
//
// Pure previews of event-choice outcomes. resolveChoice (game.ts) applies these
// same formulas, so a stake label shown on a choice button can never drift from
// what the choice actually does. E1-4 (honest events pass) extends this module.
import { GameEvent, GameState } from "./types";
import { cargoUsed } from "./economy";
import { commodityName, getPrice } from "./world";

/** Pirate toll demanded today, clamped to what the player holds. */
export function pirateToll(s: GameState): number {
  return Math.max(0, Math.min(s.credits, 150 + s.day * 10));
}

/** Hull damage taken when fleeing pirates. */
export function fleeDamage(day: number): number {
  return 15 + (day % 10);
}

/** Salvage units collected, clamped to cargo room. */
export function salvageAmount(s: GameState): number {
  const room = s.cargoCapacity - cargoUsed(s.cargo);
  return Math.min(room, 2 + (s.day % 4));
}

/** Fuel burned by engine trouble. */
export function engineBurn(s: GameState): number {
  return Math.min(s.fuel, 2);
}

/** Credits found aboard a derelict on a lucky day. */
export function derelictReward(day: number): number {
  return 200 + day * 8;
}

/** Hull damage when the derelict is a trap. */
export const DERELICT_TRAP_DAMAGE = 20;

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
      return { pay: `~${pirateToll(s)}cr`, flee: `risk ${fleeDamage(s.day)} hull` };
    case "salvage": {
      const got = salvageAmount(s);
      return { collect: got > 0 ? `+${got} ${commodityName("parts")}` : "hold is full" };
    }
    case "engine":
      return { ack: `−${engineBurn(s)} fuel` };
    case "derelict":
      return {
        board: `could hold ~${derelictReward(s.day)}cr, or a trap: −${DERELICT_TRAP_DAMAGE} hull`,
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
