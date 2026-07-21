// src/engine/run-end.ts
//
// The single source of truth for how a run ends (E0-1/E0-2). Every end path — audit,
// retire, stranding, hull breach — goes through endRun(), so the end screen, share
// card, and later persistence/debrief read one banked RunEnd instead of re-deriving.
import { GameState, RunEnd, RunEndStatus } from "./types";
import { netWorth } from "./economy";

/** A daily run lasts at most this many in-game days; arrival on the last day is the audit. */
export const RUN_LENGTH = 12;

/** Score credited per day survived on a banked (audited/retired) run. Sweep-tuned knob. */
export const SURVIVAL_BONUS_PER_DAY = 50;

/**
 * End the run and attach the banked RunEnd. Death loses the cargo (it goes down with
 * the ship) and the survival bonus; audit/retire bank full net worth + the capped bonus.
 */
export function endRun(state: GameState, status: RunEndStatus, cause: string): GameState {
  if (state.status !== "playing") return state;
  const daysSurvived = Math.min(state.day, RUN_LENGTH);
  const netWorthAtEnd = status === "lost" ? state.credits - state.debt : netWorth(state);
  const survivalBonus = status === "lost" ? 0 : SURVIVAL_BONUS_PER_DAY * daysSurvived;
  const runEnd: RunEnd = {
    status,
    cause,
    daysSurvived,
    netWorthAtEnd,
    survivalBonus,
    score: Math.max(0, netWorthAtEnd) + survivalBonus,
  };
  return { ...state, status, runEnd, log: [...state.log, cause] };
}
