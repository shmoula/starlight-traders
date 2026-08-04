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

/**
 * One line per station, each teaching the mechanic its numbers already encode
 * (E2-4a). Rendered ahead of the mechanical intel line — voice first, numbers
 * verbatim after. Each ≤ 110 chars. Keep the taught keyword (see fiction.test.ts)
 * when editing: terra "fees", kiruna "dock", vulcan "approach", verge "raiders",
 * meridian "18%".
 */
export const STATION_DOSSIERS: Record<NodeId, string> = {
  terra:
    "The old capital's docks charge like it still matters — every trader passes through, and the fees know it.",
  kiruna:
    "Ice miners sell water for next to nothing and ask less to dock — the Belt runs on volume, not margin.",
  vulcan:
    "The yards forge machine parts cheap and pay well for water — keep an eye on the approach lanes.",
  verge:
    "No flag, no tax, no help when the raiders come — The Verge pays top rates to whoever survives the trip.",
  meridian:
    "The core world tithes 18% and inspects your hold for the privilege — luxury sells dear, if it clears customs.",
};

/**
 * Description variants per event kind (E2-4c), selected by rollEvent's second
 * local draw. All take the crew name so pirate lines can be templates; the other
 * kinds ignore the argument (one shape, no union churn at the call site).
 */
export const EVENT_VARIANTS: Record<GameEventKind, ((crew: string) => string)[]> = {
  quiet: [
    () => "The void is calm. You arrive without incident.",
    () => "Nothing but static and starlight the whole way in. The kettle even stayed hot.",
    () => "A quiet run. Out here, that counts as a small miracle.",
  ],
  pirates: [
    (crew) =>
      `Raiders flying ${crew}'s colors demand tribute. Pay them off, or run and risk hull damage.`,
    (crew) =>
      `${capFirst(crew)} drop out of the dark dead ahead. Their terms are simple: pay, or outrun the volley.`,
    (crew) =>
      `A toll bell rings over the comm — ${crew} collect on this lane. Pay up, or burn for the gap.`,
  ],
  salvage: [
    () =>
      "Debris drifts nearby — mostly cargo, but war-era wrecks sometimes hide live ordnance. Scoop it up?",
    () =>
      "A shattered freighter litters the lane with containers. Some seals look intact — and some look armed.",
    () =>
      "Wreckage pings on the scope: crates, plating, and the occasional thing that still blinks. Scoop it up?",
  ],
  derelict: [
    () => "An abandoned freighter floats silent. Board it? Could be treasure — or a trap.",
    () =>
      "A dead ship drifts across your path, running lights long cold. The airlock is unlocked. Luck, or bait.",
    () =>
      "A derelict hangs in the black, cargo bay sealed. Salvors' rule: first aboard keeps it — if it isn't rigged.",
  ],
  customs: [
    () => "Inspectors scan your hold. Undeclared luxury goods may be seized.",
    () =>
      "Meridian customs sweeps your manifest twice and your hold once. Luxury draws the long scan.",
    () =>
      "A customs cutter locks alignment. 'Routine inspection.' Nobody on this dock believes that word.",
  ],
  engine: [
    () => "A coolant leak burns extra fuel before you patch it.",
    () => "The starboard injector coughs, drinks deep, and settles — after it costs you.",
    () =>
      "Something rattles loose behind the reactor shroud. The fix holds; the fuel gauge remembers.",
  ],
};
