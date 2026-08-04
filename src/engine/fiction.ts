// src/engine/fiction.ts
//
// The fiction pack (E2-4): every piece of world-voice prose in one module, so the
// Syndicate's dry menace (E0-4) stays one voice and tests can sweep one file.
// Nothing here touches game RNG — crew and epilogue picks come from salted hashes
// of the run seed, and event variants are selected by rollEvent's own local rng.
import { GameEventKind, LossCause, NodeId } from "./types";
import { hashSeed } from "./rng";

// Distinct salts so crew and epilogue picks are independent hashes of the same seed.
const CREW_SALT = 0xc4e7;
const EPILOGUE_SALT = 0xe916;

/** Today's villains. Every name ≤ 16 chars so the bulletin line keeps its 70-char budget. */
export const CREW_ROSTER: string[] = [
  "the Red Kestrel",
  "the Void Jackals",
  "the Pale Corsair",
  "the Ash Vultures",
  "the Grey Wake",
  "the Iron Shrike",
  "the Last Tide",
  "the Dust Barons",
  "the Hollow Crown",
  "the Silent Reef",
  "the Rust Queens",
  "the Comet's Due",
];

/** The pirate crew everyone flying today's seed will meet (E2-4b). */
export function crewName(seed: number): string {
  return CREW_ROSTER[hashSeed(seed, CREW_SALT) % CREW_ROSTER.length];
}

/** Sentence-start helper for crew names ("the Red Kestrel" → "The Red Kestrel"). */
export function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Three send-offs per way to die (E2-4d), picked per run seed — same-day players
// who die the same way read the same line. Each ≤ 160 chars.
const EPILOGUES: Record<LossCause, string[]> = {
  hull: [
    "The Syndicate notes the loss of its collateral with regret — the regret of an accountant, not a mourner.",
    "Wreckage on the lane, cargo scattered to the void. Some other trader will scoop up what's left of your run.",
    "The ship broke apart with the ledger still open. The Syndicate writes off the hull; the debt, it remembers.",
  ],
  fuel: [
    "The dock lights stay on all night. Nobody comes. The Syndicate's collections skiff is already en route.",
    "A trader without fuel is just a tenant with a view. The station bills by the hour; the Syndicate bills forever.",
    "You watch ships leave without you. The Syndicate's ledger closes on the sound of engines you can't afford.",
  ],
};

/** The cause-matched send-off for a lost run (E2-4d). Pure — derived at render. */
export function epilogue(seed: number, cause: LossCause): string {
  const pool = EPILOGUES[cause];
  return pool[hashSeed(seed, EPILOGUE_SALT) % pool.length];
}

// STATION_DOSSIERS and EVENT_VARIANTS are added in the next task.
export const STATION_DOSSIERS = {} as Record<NodeId, string>;
export const EVENT_VARIANTS = {} as Record<GameEventKind, ((crew: string) => string)[]>;
