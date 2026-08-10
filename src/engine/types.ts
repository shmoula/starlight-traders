// src/engine/types.ts

export type CommodityId = "water" | "parts" | "luxury";
export type NodeId = "terra" | "kiruna" | "vulcan" | "verge" | "meridian";

export interface Commodity {
  id: CommodityId;
  name: string;
  basePrice: number; // median credits per unit
  volatility: number; // 0..1 fractional daily swing
}

export interface StationNode {
  id: NodeId;
  name: string;
  feeMultiplier: number; // multiplies base docking fee
  taxRate: number; // fraction taxed on sale proceeds
  produces: CommodityId[]; // commodities cheap here
  demands: CommodityId[]; // commodities that sell high here
}

export interface Mission {
  id: string;
  commodity: CommodityId;
  qty: number;
  destination: NodeId;
  reward: number;
  /**
   * Credits escrowed on accept, returned on delivery, forfeited on expiry (E2-2). Set at
   * generation to `MISSION_DEPOSIT_RATE` of reward, rounded; pre-v3 missions carry 0 —
   * always read this field, never re-derive it from `reward`.
   */
  deposit: number;
  deadlineDay: number; // absolute game day by which cargo must arrive
}

export type RunEndStatus = "lost" | "audited" | "retired";

/** What killed a lost run — typed so surfaces branch on this, not the prose in `cause`. */
export type LossCause = "hull" | "fuel";

/** Fields shared by every finished run, whether banked or lost. */
interface RunEndBase {
  cause: string; // player-facing line naming what ended the run
  daysSurvived: number; // capped at RUN_LENGTH
  netWorthAtEnd: number; // banked runs: full net worth; death: credits − debt (cargo is lost)
  survivalBonus: number; // 0 on death
  score: number; // max(0, netWorthAtEnd) + survivalBonus
}

/** A run that ended in death — always carries the typed loss cause. */
export interface LostRunEnd extends RunEndBase {
  status: "lost";
  lossCause: LossCause; // discriminates the loss headline (hull breach vs. stranding)
}

/** A run banked by the Day-12 audit or a voluntary retire — never a loss cause. */
export interface BankedRunEnd extends RunEndBase {
  status: "audited" | "retired";
  lossCause?: never;
}

/**
 * Banked summary of a finished run — the single source of truth for end-of-run surfaces.
 * Discriminated on `status`: only a lost run carries (and must carry) a `lossCause`.
 */
export type RunEnd = LostRunEnd | BankedRunEnd;

/** The notable thing that happened on a game day — feeds the share card's run-strip (E1-2). */
export type DayHighlightKind = "pirates" | "bigTrade" | "delivery";

/** Outcome coloring for a log line — replaces the UI's regex tone-guessing (P2-1). */
export type LogTone = "good" | "bad" | "neutral";

/** A structured log line: the engine declares tone and (for money lines) the credit delta. */
export interface LogEntry {
  msg: string;
  tone: LogTone;
  /** Signed credit movement, present only when the line is about credits. */
  delta?: number;
  /** Game day the entry was written (P3-1a); absent on entries from pre-round snapshots. */
  day?: number;
}

/**
 * Moment facts the finished state can't reconstruct — feeds the E2-5 feat predicates
 * and nothing else (no game rule ever reads records). Append-only during a run;
 * persisted in the run snapshot (v4), so moment feats survive a same-day refresh.
 */
export interface RunRecords {
  /** Game day debt first reached 0, if it ever did. */
  debtClearedDay?: number;
  /** Docked at the Verge with hull below VERGE_LOW_HULL. */
  vergeAtLowHull: boolean;
  /** Stations docked at this run, in first-visit order; starts with the boot station. */
  visited: NodeId[];
  /** Total hull points lost this run (repairs don't subtract). */
  damageTaken: number;
  /** The hold reached capacity at least once. */
  fullHold: boolean;
  /** Pirate ambushes resolved this run — paid or fled. */
  pirateAmbushes: number;
}

/** Blank records — createGame seeds `visited` with the boot station on top of this. */
export function emptyRecords(): RunRecords {
  return { vergeAtLowHull: false, visited: [], damageTaken: 0, fullHold: false, pirateAmbushes: 0 };
}

export interface GameState {
  seed: number;
  day: number;
  credits: number;
  debt: number;
  location: NodeId;
  fuel: number;
  fuelCapacity: number;
  hull: number;
  hullMax: number;
  cargo: Record<CommodityId, number>;
  cargoCapacity: number;
  activeMissions: Mission[];
  /** Units of each commodity bought at the current dock since arrival — reset on jump.
   *  Delivery pays the contract premium only on units that are NOT in here (E2-2d). */
  boughtHere: Record<CommodityId, number>;
  /** Run-long contract ledger for the debrief (E2-2b). */
  contracts: {
    delivered: number;
    expired: number;
    forfeitedCr: number;
  };
  peakNetWorth: number;
  /** Largest single credit inflow of the run (sale net proceeds or delivery reward) — the debrief's "best haul". */
  biggestPayday?: { amount: number; label: string };
  /** Per-day notable moment for the share strip (E1-2); key = game day. Upgrade-only via markDay. */
  dayHighlights: Partial<Record<number, DayHighlightKind>>;
  /** Feat-relevant moment facts (E2-5); append-only, never read by game rules. */
  records: RunRecords;
  status: "playing" | RunEndStatus;
  runEnd?: RunEnd; // present exactly when status !== "playing"
  log: LogEntry[]; // recent player-facing messages, newest last
  bootDate: string; // ISO instant the run was created — names the UTC day `seed` hashes; "" for seed-only sim runs
}

export type GameEventKind = "quiet" | "pirates" | "salvage" | "derelict" | "customs" | "engine";

export interface GameEvent {
  kind: GameEventKind;
  title: string;
  description: string;
  /** Choices the player can pick; resolved by game.resolveChoice. */
  choices: EventChoice[];
}

export interface EventChoice {
  id: string;
  label: string;
}
