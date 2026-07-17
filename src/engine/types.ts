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
  status: "playing" | "lost";
  log: string[]; // recent player-facing messages, newest last
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
