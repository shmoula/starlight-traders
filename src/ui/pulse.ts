// src/ui/pulse.ts
//
// Juice bookkeeping (P3-2): which vitals moved since the last paint, and which way.
// Diffing state rather than pattern-matching log strings is the P2-1 lesson applied —
// a pulse cannot miss a change just because no keyword matched it. Pure and tiny, so
// the render layer stays a template and main.ts stays wiring.
import { GameState } from "../engine/types";

export type PulseDir = "up" | "down";

export interface Vitals {
  credits: number;
  fuel: number;
  hull: number;
}

export type Pulses = Partial<Record<keyof Vitals, PulseDir>>;

/** The three numbers the statbar animates. */
export function vitalsOf(s: GameState): Vitals {
  return { credits: s.credits, fuel: s.fuel, hull: s.hull };
}

/** Direction of change per vital since the previous paint; empty on the first one. */
export function vitalPulses(prev: Vitals | null, next: Vitals): Pulses {
  if (!prev) return {};
  const out: Pulses = {};
  (Object.keys(next) as (keyof Vitals)[]).forEach((k) => {
    if (next[k] > prev[k]) out[k] = "up";
    else if (next[k] < prev[k]) out[k] = "down";
  });
  return out;
}
