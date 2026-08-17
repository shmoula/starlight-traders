// src/engine/events.ts
import { GameEvent, GameEventKind, GameState, NodeId } from "./types";
import { NODE_IDS, laneDanger, isLongHaul } from "./world";
import { mulberry32, hashSeed } from "./rng";
import { EVENT_VARIANTS, crewName } from "./fiction";
import { CORSAIR_DANGER_DELTA, dailyModifier } from "./modifiers";

/** Hard ceiling on lane danger — a pirate tail can't push a lane past this (E3-4). */
export const DANGER_CAP = 0.9;
/** A pirate tail (E3-4) heaps this onto every lane's danger until you shake it. */
export const TAIL_BONUS = 0.35;
/** Salvage-band width on ordinary short lanes (the slice just past pirates). */
export const SALVAGE_BAND = 0.18;
/** Long-haul lanes (isLongHaul) double the salvage band — bigger crossings, bigger fields. */
export const LONG_HAUL_SALVAGE_BAND = 0.36;

/**
 * The honest per-lane ambush chance rollEvent rolls with (E1-4/E3-1/E3-2/E3-4),
 * given the day's seed, the lane, and whether a pirate tail is riding along. Today's
 * modifier is derived from `seed`: amnesty empties every lane, corsair season adds
 * CORSAIR_DANGER_DELTA. A pirate tail then adds TAIL_BONUS, all clamped to DANGER_CAP.
 */
export function effectiveDanger(seed: number, from: NodeId, to: NodeId, tailed: boolean): number {
  const m = dailyModifier(seed);
  if (m.eventTweak === "amnesty") return 0;
  const corsair = m.eventTweak === "corsairs" ? CORSAIR_DANGER_DELTA : 0;
  return Math.min(DANGER_CAP, laneDanger(from, to) + corsair + (tailed ? TAIL_BONUS : 0));
}

/**
 * True chance of a pirate ambush on the s.location→to lane — the exact band rollEvent
 * uses. Exported so the UI shows the number the engine rolls with (E1-4). Reads the
 * day's modifier and any pirate tail straight off the state, so every surface is honest.
 */
export function pirateChance(s: GameState, to: NodeId): number {
  return effectiveDanger(s.seed, s.location, to, s.pirateTail);
}

/**
 * Roll the in-transit event for a jump. Hostility scales with the lane's danger (E2-3),
 * the day's modifier (amnesty/corsairs, E3-1/E3-2), and any pirate tail (E3-4).
 * Customs only fires when arriving at meridian.
 */
export function rollEvent(
  seed: number,
  day: number,
  from: NodeId,
  to: NodeId,
  tailed: boolean
): GameEvent {
  // Hash full station identity (their NODE_IDS indices), not first characters —
  // "vulcan"/"verge" both start with 'v' and used to share every event roll (B-2).
  const rng = mulberry32(hashSeed(seed, day, NODE_IDS.indexOf(from), NODE_IDS.indexOf(to), 31));
  const r = rng();
  // E2-4c: a SECOND draw on the same local rng picks the description variant. The
  // kind reads only `r`, and this rng is created fresh per call and discarded — so
  // event outcomes stay byte-identical for every seed; only the prose varies.
  const v = rng();
  const describe = (kind: GameEventKind): string => {
    const variants = EVENT_VARIANTS[kind];
    return variants[Math.floor(v * variants.length)](crewName(seed));
  };

  // Probability bands grow the hostile slice with danger. Amnesty (which also zeroes
  // pPirates) empties the salvage band too; long-haul lanes double it (E3-2).
  const amnesty = dailyModifier(seed).eventTweak === "amnesty";
  const pPirates = effectiveDanger(seed, from, to, tailed);
  const salvageBand = amnesty ? 0 : isLongHaul(from, to) ? LONG_HAUL_SALVAGE_BAND : SALVAGE_BAND;
  const pSalvage = pPirates + salvageBand;
  const pEngine = pSalvage + 0.1;
  const pDerelict = pEngine + 0.12;
  const pCustoms = to === "meridian" ? pDerelict + 0.15 : pDerelict;

  if (r < pPirates) return pirates(describe("pirates"));
  if (r < pSalvage) return salvage(describe("salvage"));
  if (r < pEngine) return engine(describe("engine"));
  if (r < pDerelict) return derelict(describe("derelict"));
  if (r < pCustoms) return customs(describe("customs"));
  return quiet(describe("quiet"));
}

// Titles stay static (tests, a11y, and choice odds/stakes key on kind and title);
// the fiction rides in `description` (spec decision 8).
function pirates(description: string): GameEvent {
  return {
    kind: "pirates",
    title: "Pirate Ambush",
    description,
    choices: [
      { id: "pay", label: "Pay tribute (lose credits)" },
      { id: "flee", label: "Run for it (risk hull)" },
    ],
  };
}
function salvage(description: string): GameEvent {
  return {
    kind: "salvage",
    title: "Salvage Field",
    description,
    choices: [
      { id: "collect", label: "Scoop the debris (gamble)" },
      { id: "ignore", label: "Stay on course" },
    ],
  };
}
function engine(description: string): GameEvent {
  return {
    kind: "engine",
    title: "Engine Trouble",
    description,
    choices: [{ id: "ack", label: "Patch it up" }],
  };
}
function derelict(description: string): GameEvent {
  return {
    kind: "derelict",
    title: "Derelict Hulk",
    description,
    choices: [
      { id: "board", label: "Board it (gamble)" },
      { id: "leave", label: "Leave it be" },
    ],
  };
}
function customs(description: string): GameEvent {
  return {
    kind: "customs",
    title: "Meridian Customs",
    description,
    choices: [
      { id: "comply", label: "Submit to inspection" },
      { id: "bribe", label: "Bribe the inspector" },
    ],
  };
}
function quiet(description: string): GameEvent {
  return {
    kind: "quiet",
    title: "Quiet Jump",
    description,
    choices: [{ id: "ack", label: "Continue" }],
  };
}
