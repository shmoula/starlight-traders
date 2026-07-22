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
  danger: number; // 0..1, scales hostile event chance
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
  deadlineDay: number; // absolute game day by which cargo must arrive
}

export type RunEndStatus = "lost" | "audited" | "retired";

/** What killed a lost run — typed so surfaces branch on this, not the prose in `cause`. */
export type LossCause = "hull" | "fuel";

/** Banked summary of a finished run — the single source of truth for end-of-run surfaces. */
export interface RunEnd {
  status: RunEndStatus;
  cause: string; // player-facing line naming what ended the run
  lossCause?: LossCause; // present exactly when status === "lost"; discriminates the loss headline
  daysSurvived: number; // capped at RUN_LENGTH
  netWorthAtEnd: number; // banked runs: full net worth; death: credits − debt (cargo is lost)
  survivalBonus: number; // 0 on death
  score: number; // max(0, netWorthAtEnd) + survivalBonus
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
  peakNetWorth: number;
  status: "playing" | RunEndStatus;
  runEnd?: RunEnd; // present exactly when status !== "playing"
  log: string[]; // recent player-facing messages, newest last
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
