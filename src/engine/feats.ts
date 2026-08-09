// src/engine/feats.ts
//
// E2-5 feat registry — named recognition, no rewards attached (the backlog's
// no-dark-patterns constraint). Ten run feats are pure predicates over the finished
// state; the two ledger feats (cross-run facts) carry no predicate here — storage's
// recordFeats is the only place they can be judged. Evaluated exactly once, at run end.
import { GameState, RunEnd } from "./types";
import { NODE_IDS } from "./world";
import { VERGE_LOW_HULL } from "./game";

export type FeatId =
  | "first-flight"
  | "audited"
  | "clean-sweep"
  | "debt-free-8"
  | "clean-books"
  | "verge-runner"
  | "untouched"
  | "full-house"
  | "grand-tour"
  | "gauntlet"
  | "high-roller"
  | "regular";

// ⚙ tuning knobs — thresholds live here, next to the copy that quotes them.
export const CLEAN_SWEEP_DELIVERIES = 3;
export const DEBT_FREE_DAY = 8;
export const GAUNTLET_AMBUSHES = 3;
export const REGULAR_DAYS_FLOWN = 7;
/** ⚙ set from the sweep's banked-score p90 in this round's tuning task. */
export const HIGH_ROLLER_SCORE = 6000;

export interface FeatDef {
  id: FeatId;
  /** ≤ 20 chars, test-enforced — the share card quotes it on one line. */
  name: string;
  /** Unearned-state copy: the invitation shown dimmed in the Logbook roster. */
  hint: string;
  /** Run feats only; absent on the two ledger feats. */
  earned?(s: GameState, r: RunEnd): boolean;
}

const banked = (r: RunEnd) => r.status !== "lost";

export const FEATS: readonly FeatDef[] = [
  { id: "first-flight", name: "First Flight", hint: "Complete your first run." },
  {
    id: "audited",
    name: "Face the Audit",
    hint: "Reach the day-12 audit alive.",
    earned: (_s, r) => r.status === "audited",
  },
  {
    id: "clean-sweep",
    name: "Clean Sweep",
    hint: `${CLEAN_SWEEP_DELIVERIES} deliveries in one run.`,
    earned: (s) => s.contracts.delivered >= CLEAN_SWEEP_DELIVERIES,
  },
  {
    id: "debt-free-8",
    name: "Out From Under",
    hint: `Clear the debt by day ${DEBT_FREE_DAY}.`,
    earned: (s) =>
      s.records.debtClearedDay !== undefined && s.records.debtClearedDay <= DEBT_FREE_DAY,
  },
  {
    id: "clean-books",
    name: "Clean Books",
    hint: "Bank a run owing nothing.",
    earned: (s, r) => banked(r) && s.debt === 0,
  },
  {
    id: "verge-runner",
    name: "Verge Runner",
    hint: `Dock at the Verge under ${VERGE_LOW_HULL} hull — and live.`,
    earned: (s, r) => banked(r) && s.records.vergeAtLowHull,
  },
  {
    id: "untouched",
    name: "Not a Scratch",
    hint: "Bank a run with zero hull damage.",
    earned: (s, r) => banked(r) && s.records.damageTaken === 0,
  },
  {
    id: "full-house",
    name: "Full House",
    hint: "Fill the hold to capacity.",
    earned: (s) => s.records.fullHold,
  },
  {
    id: "grand-tour",
    name: "Grand Tour",
    hint: "Dock at all five stations in one run.",
    earned: (s) => s.records.visited.length === NODE_IDS.length,
  },
  {
    id: "gauntlet",
    name: "Run the Gauntlet",
    hint: `Survive ${GAUNTLET_AMBUSHES} pirate ambushes in one run.`,
    earned: (s, r) => banked(r) && s.records.pirateAmbushes >= GAUNTLET_AMBUSHES,
  },
  {
    id: "high-roller",
    name: "High Roller",
    hint: `Bank a ${HIGH_ROLLER_SCORE.toLocaleString("en-US")}+ score.`,
    earned: (_s, r) => r.score >= HIGH_ROLLER_SCORE,
  },
  {
    id: "regular",
    name: "Starlight Regular",
    hint: `Fly ${REGULAR_DAYS_FLOWN} different days.`,
  },
];

/** The cross-run feats judged in storage — everything else is a run feat. */
export const LEDGER_FEAT_IDS: readonly FeatId[] = ["first-flight", "regular"];

const BY_ID = new Map(FEATS.map((f) => [f.id, f]));

/** Registry lookup; total by construction — FeatId is the registry's own id union. */
export function featDef(id: FeatId): FeatDef {
  return BY_ID.get(id)!;
}

/** Run feats earned by a finished run; [] while it is still playing (feats bank once). */
export function earnedFeats(s: GameState): FeatId[] {
  const r = s.runEnd;
  if (!r) return [];
  return FEATS.filter((f) => f.earned?.(s, r)).map((f) => f.id);
}
