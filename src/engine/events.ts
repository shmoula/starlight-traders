// src/engine/events.ts
import { GameEvent, GameEventKind, NodeId } from "./types";
import { NODES, NODE_IDS } from "./world";
import { mulberry32, hashSeed } from "./rng";
import { EVENT_VARIANTS, crewName } from "./fiction";

/**
 * True chance of a pirate ambush on arrival at `to` — the exact band rollEvent uses.
 * Exported so the UI shows the number the engine rolls with (E1-4): the flat 10%
 * floor means no route is ever "0%".
 */
export function pirateChance(to: NodeId): number {
  return 0.1 + NODES[to].danger * 0.45;
}

/**
 * Roll the in-transit event for a jump. Hostility scales with destination danger.
 * Customs only fires when arriving at meridian.
 */
export function rollEvent(seed: number, day: number, from: NodeId, to: NodeId): GameEvent {
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

  // Probability bands grow the hostile slice with danger.
  const pPirates = pirateChance(to);
  const pSalvage = pPirates + 0.18;
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
