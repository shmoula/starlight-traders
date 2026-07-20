// src/engine/events.ts
import { GameEvent, NodeId } from "./types";
import { NODES } from "./world";
import { mulberry32, hashSeed } from "./rng";

/**
 * Roll the in-transit event for a jump. Hostility scales with destination danger.
 * Customs only fires when arriving at meridian.
 */
export function rollEvent(seed: number, day: number, from: NodeId, to: NodeId): GameEvent {
  const rng = mulberry32(hashSeed(seed, day, from.charCodeAt(0), to.charCodeAt(0), 31));
  const danger = NODES[to].danger;
  const r = rng();

  // Probability bands grow the hostile slice with danger.
  const pPirates = 0.1 + danger * 0.45;
  const pSalvage = pPirates + 0.18;
  const pEngine = pSalvage + 0.1;
  const pDerelict = pEngine + 0.12;
  const pCustoms = to === "meridian" ? pDerelict + 0.15 : pDerelict;

  if (r < pPirates) return pirates();
  if (r < pSalvage) return salvage();
  if (r < pEngine) return engine();
  if (r < pDerelict) return derelict();
  if (r < pCustoms) return customs();
  return quiet();
}

function pirates(): GameEvent {
  return {
    kind: "pirates",
    title: "Pirate Ambush",
    description: "Raiders demand tribute. Pay them off, or run and risk hull damage.",
    choices: [
      { id: "pay", label: "Pay tribute (lose credits)" },
      { id: "flee", label: "Run for it (risk hull)" },
    ],
  };
}
function salvage(): GameEvent {
  return {
    kind: "salvage",
    title: "Salvage Field",
    description:
      "Debris drifts nearby — mostly cargo, but war-era wrecks sometimes hide live ordnance. Scoop it up?",
    choices: [
      { id: "collect", label: "Scoop the debris (gamble)" },
      { id: "ignore", label: "Stay on course" },
    ],
  };
}
function engine(): GameEvent {
  return {
    kind: "engine",
    title: "Engine Trouble",
    description: "A coolant leak burns extra fuel before you patch it.",
    choices: [{ id: "ack", label: "Patch it up" }],
  };
}
function derelict(): GameEvent {
  return {
    kind: "derelict",
    title: "Derelict Hulk",
    description: "An abandoned freighter floats silent. Board it? Could be treasure — or a trap.",
    choices: [
      { id: "board", label: "Board it (gamble)" },
      { id: "leave", label: "Leave it be" },
    ],
  };
}
function customs(): GameEvent {
  return {
    kind: "customs",
    title: "Meridian Customs",
    description: "Inspectors scan your hold. Undeclared luxury goods may be seized.",
    choices: [
      { id: "comply", label: "Submit to inspection" },
      { id: "bribe", label: "Bribe the inspector" },
    ],
  };
}
function quiet(): GameEvent {
  return {
    kind: "quiet",
    title: "Quiet Jump",
    description: "The void is calm. You arrive without incident.",
    choices: [{ id: "ack", label: "Continue" }],
  };
}
