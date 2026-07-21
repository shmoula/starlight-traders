// src/engine/game.ts
import { CommodityId, GameEvent, GameState, Mission, NodeId } from "./types";
import { NODES, NODE_IDS, commodityName, fuelCost, getPrice } from "./world";
import {
  REFUEL_PRICE,
  REPAIR_PRICE,
  dockingFee,
  taxOnSale,
  loanInterest,
  LOAN_STEP_IMPATIENT,
  LOAN_STEP_DESPERATE,
  cargoUsed,
  netWorth,
} from "./economy";
import { generateMissions } from "./missions";
import { rollEvent } from "./events";
import { hashSeed } from "./rng";
import {
  DERELICT_TRAP_DAMAGE,
  bribeCost,
  derelictReward,
  engineBurn,
  engineHullStrain,
  fleeDamage,
  pirateToll,
  SALVAGE_TRAP_DAMAGE,
  salvageAmount,
} from "./preview";
import { RUN_LENGTH, endRun } from "./run-end";

export const STARTING = {
  credits: 800,
  debt: 1500,
  fuel: 16,
  fuelCapacity: 20,
  hull: 100,
  cargoCapacity: 30,
};

const INTEREST_EVERY = 3; // days between interest accruals

/**
 * Create a fresh run for `seed`. `bootDate` (an ISO instant) stamps the run with the
 * UTC day the seed was derived from, so the header/share date travels with the seed in
 * state rather than in a hand-synced shadow variable. Seed-only callers (the balance
 * sim) omit it and it stays "".
 */
export function createGame(seed: number, bootDate = ""): GameState {
  return {
    seed,
    bootDate,
    day: 1,
    credits: STARTING.credits,
    debt: STARTING.debt,
    location: "terra",
    fuel: STARTING.fuel,
    fuelCapacity: STARTING.fuelCapacity,
    hull: STARTING.hull,
    hullMax: STARTING.hull,
    cargo: { water: 0, parts: 0, luxury: 0 },
    cargoCapacity: STARTING.cargoCapacity,
    activeMissions: [],
    peakNetWorth: 0,
    status: "playing",
    log: [
      `The Syndicate staked your ship — ${STARTING.debt.toLocaleString()}cr, compounding. Score = your peak fortune. Everyone flies today's sky.`,
    ],
  };
}

// Keep the full run history; the UI decides how many entries to surface. A run is
// bounded (you eventually lose), so this stays small, and retaining every entry lets
// the UI capture "what happened this turn" by a stable index rather than a fragile diff.
function withLog(state: GameState, msg: string): GameState {
  return { ...state, log: [...state.log, msg] };
}

/** The lender's voice escalates with its rate tier (E0-4). */
function interestLine(interest: number, day: number): string {
  const base = `The Syndicate compounds: +${interest}cr.`;
  if (day >= LOAN_STEP_DESPERATE) return `${base} It is losing patience with you.`;
  if (day >= LOAN_STEP_IMPATIENT) return `${base} It grows impatient.`;
  return base;
}

function trackPeak(state: GameState): GameState {
  const nw = netWorth(state);
  return nw > state.peakNetWorth ? { ...state, peakNetWorth: nw } : state;
}

/**
 * Hull 0 destroys the ship (B-6): the run ends as a loss and cargo goes down with it.
 * The four damage sites (resolvePirates/resolveSalvage/resolveEngine/resolveDerelict)
 * intentionally subtract hull unclamped — always floor here, regardless of run status,
 * so a negative hull never leaks past this point; only end the run from a live state.
 */
function checkHullDeath(s: GameState): GameState {
  if (s.hull > 0) return s;
  const floored = { ...s, hull: 0 };
  return s.status === "playing"
    ? endRun(floored, "lost", "Hull breach — your ship broke apart.")
    : floored;
}

export function missionsHere(state: GameState): Mission[] {
  return generateMissions(state.seed, state.day, state.location);
}

export function buy(state: GameState, id: CommodityId, qty: number): GameState {
  if (qty <= 0) return state;
  const price = getPrice(state.seed, state.day, state.location, id);
  const cost = price * qty;
  if (cost > state.credits) return state;
  if (cargoUsed(state.cargo) + qty > state.cargoCapacity) return state;
  const next = {
    ...state,
    credits: state.credits - cost,
    cargo: { ...state.cargo, [id]: state.cargo[id] + qty },
  };
  return trackPeak(withLog(next, `Bought ${qty} ${commodityName(id)} for ${cost}cr.`));
}

export function sell(state: GameState, id: CommodityId, qty: number): GameState {
  if (qty <= 0 || state.cargo[id] < qty) return state;
  const price = getPrice(state.seed, state.day, state.location, id);
  const proceeds = price * qty;
  const tax = taxOnSale(state.location, proceeds);
  const next = {
    ...state,
    credits: state.credits + proceeds - tax,
    cargo: { ...state.cargo, [id]: state.cargo[id] - qty },
  };
  return trackPeak(
    withLog(next, `Sold ${qty} ${commodityName(id)} for ${proceeds}cr (tax ${tax}).`)
  );
}

// Shared trade math so the UI never re-derives buy()/sell()'s guards by hand. A button
// that computes its clamped quantity or net proceeds from these helpers stays honest
// about what a click delivers even if buy()/sell() later grows a fee or rounding rule (B-1).

/** Largest quantity of `id` buyable here, clamped by both credits and hold room. */
export function maxBuyable(state: GameState, id: CommodityId): number {
  const price = getPrice(state.seed, state.day, state.location, id);
  const room = state.cargoCapacity - cargoUsed(state.cargo);
  return Math.max(0, Math.min(Math.floor(state.credits / price), room));
}

/** Net credits from selling `qty` of `id` here, after sale tax — what sell() actually pays. */
export function netProceeds(state: GameState, id: CommodityId, qty: number): number {
  const price = getPrice(state.seed, state.day, state.location, id);
  const gross = price * qty;
  return gross - taxOnSale(state.location, gross);
}

/** Why buying `qty` of `id` here is blocked — "" when it would succeed. Mirrors buy()'s guard order. */
export type BuyBlock = "" | "credits" | "room";
export function buyBlockReason(state: GameState, id: CommodityId, qty: number): BuyBlock {
  if (qty <= 0) return "";
  const price = getPrice(state.seed, state.day, state.location, id);
  if (price * qty > state.credits) return "credits";
  if (cargoUsed(state.cargo) + qty > state.cargoCapacity) return "room";
  return "";
}

export function refuel(state: GameState, units: number): GameState {
  const room = state.fuelCapacity - state.fuel;
  const affordable = Math.floor(state.credits / REFUEL_PRICE);
  const buyUnits = Math.min(units, room, affordable);
  if (buyUnits <= 0) return state;
  const cost = buyUnits * REFUEL_PRICE;
  return withLog(
    { ...state, fuel: state.fuel + buyUnits, credits: state.credits - cost },
    `Refueled ${buyUnits} for ${cost}cr.`
  );
}

export function repair(state: GameState, points: number): GameState {
  const room = state.hullMax - state.hull;
  const fix = Math.min(points, room);
  if (fix <= 0) return state;
  const cost = fix * REPAIR_PRICE;
  if (cost > state.credits) return state;
  return withLog(
    { ...state, hull: state.hull + fix, credits: state.credits - cost },
    `Repaired ${fix} hull for ${cost}cr.`
  );
}

export function payDebt(state: GameState, amount: number): GameState {
  const pay = Math.min(amount, state.debt, state.credits);
  if (pay <= 0) return state;
  return trackPeak(
    withLog(
      { ...state, debt: state.debt - pay, credits: state.credits - pay },
      `Paid down ${pay}cr of debt.`
    )
  );
}

/** Voluntarily end the run at dock, banking the score (E0-1). No-op once the run is over. */
export function retire(state: GameState): GameState {
  return endRun(
    state,
    "retired",
    `Retired at ${NODES[state.location].name} — the Syndicate banks your score.`
  );
}

export function acceptMission(state: GameState, mission: Mission): GameState {
  if (state.activeMissions.some((m) => m.id === mission.id)) return state;
  return withLog(
    { ...state, activeMissions: [...state.activeMissions, mission] },
    `Accepted delivery to ${NODES[mission.destination].name}.`
  );
}

/**
 * Settle deliveries against the current location without jumping. Needed when a
 * mission's destination is already the current station (e.g. cargo bought after
 * arriving empty-handed) — `jump` no-ops when `to === state.location`, so `arrive`
 * never runs for that case.
 */
export function deliver(state: GameState): GameState {
  return settleMissions(state).state;
}

/** Complete any active missions satisfied by current location + cargo, paying rewards. */
function settleMissions(state: GameState): {
  state: GameState;
  delivered: Mission[];
  expired: Mission[];
} {
  let s = state;
  const remaining: Mission[] = [];
  const delivered: Mission[] = [];
  const expired: Mission[] = [];
  for (const m of s.activeMissions) {
    if (m.destination === s.location && s.cargo[m.commodity] >= m.qty && s.day <= m.deadlineDay) {
      s = {
        ...s,
        cargo: { ...s.cargo, [m.commodity]: s.cargo[m.commodity] - m.qty },
        credits: s.credits + m.reward,
      };
      s = withLog(s, `Delivery complete: +${m.reward}cr.`);
      delivered.push(m);
    } else if (s.day > m.deadlineDay) {
      s = withLog(s, `Delivery to ${NODES[m.destination].name} expired.`);
      expired.push(m);
    } else {
      remaining.push(m);
    }
  }
  return { state: { ...s, activeMissions: remaining }, delivered, expired };
}

export function checkLoss(state: GameState): GameState {
  if (state.status !== "playing") return state;
  const cheapest = Math.min(
    ...NODE_IDS.filter((n) => n !== state.location).map((n) => fuelCost(state.location, n))
  );
  const canJumpNow = state.fuel >= cheapest;
  const fuelShort = Math.max(0, cheapest - state.fuel);
  const canBuyFuel = state.credits >= fuelShort * REFUEL_PRICE;
  if (!canJumpNow && !canBuyFuel) {
    return endRun(
      state,
      "lost",
      `Stranded at ${NODES[state.location].name} — not enough fuel to jump, and refueling costs more than you have.`
    );
  }
  return state;
}

/**
 * Jump to a destination: spend fuel, advance the day, accrue interest, pay docking,
 * then return the pending in-transit event for the UI to resolve. Deliveries are NOT
 * settled here — they settle in `arrive`, after the in-transit event resolves, so that
 * cargo gained in transit (salvage, derelict loot) counts toward a delivery.
 */
export function jump(state: GameState, to: NodeId): { state: GameState; event: GameEvent | null } {
  if (state.status !== "playing") return { state, event: null };
  if (to === state.location) return { state, event: null };
  const cost = fuelCost(state.location, to);
  if (state.fuel < cost) return { state, event: null };

  let s: GameState = { ...state, fuel: state.fuel - cost, location: to, day: state.day + 1 };

  // Interest accrues on a fixed cadence.
  if (s.day % INTEREST_EVERY === 0 && s.debt > 0) {
    const interest = loanInterest(s.debt, s.day);
    s = withLog({ ...s, debt: s.debt + interest }, interestLine(interest, s.day));
  }

  // Docking fee on arrival.
  const fee = dockingFee(to);
  s = withLog({ ...s, credits: s.credits - fee }, `Docked at ${NODES[to].name}, fee ${fee}cr.`);

  const event = rollEvent(s.seed, s.day, state.location, to);
  return { state: s, event };
}

/**
 * Finalize arrival once the in-transit event is resolved: settle deliveries against the
 * cargo actually in the hold, track peak net worth, then close the day — the Day-12
 * audit banks the run (it outranks stranding: you made it), otherwise the loss check
 * runs (so a delivery reward can rescue a player who would otherwise be stranded).
 */
export function arrive(state: GameState): {
  state: GameState;
  delivered: Mission[];
  expired: Mission[];
} {
  if (state.status !== "playing") return { state, delivered: [], expired: [] };
  const settled = settleMissions(state);
  let s = trackPeak(settled.state);
  s =
    s.day >= RUN_LENGTH
      ? endRun(
          s,
          "audited",
          `Day ${RUN_LENGTH} — the Syndicate audits your books and banks your score.`
        )
      : checkLoss(s);
  return { state: s, delivered: settled.delivered, expired: settled.expired };
}

function resolvePirates(s: GameState, choiceId: string): GameState {
  if (choiceId === "pay") {
    const toll = pirateToll(s);
    return withLog({ ...s, credits: s.credits - toll }, `Paid pirates ${toll}cr.`);
  }
  const dmg = fleeDamage(s.day);
  return withLog({ ...s, hull: s.hull - dmg }, `Fled — took ${dmg} hull damage.`);
}

function resolveSalvage(s: GameState, choiceId: string): GameState {
  if (choiceId !== "collect") return s;
  // Deterministic per seed/day via the shared hash — mulberry32's hashSeed avoids the
  // strict every-3rd-day periodicity a raw `(day*7+seed) % 3` produces (B-2 class).
  if (hashSeed(s.seed, s.day) % 3 === 0) {
    return withLog(
      { ...s, hull: s.hull - SALVAGE_TRAP_DAMAGE },
      `Salvage hid a live warhead: -${SALVAGE_TRAP_DAMAGE} hull.`
    );
  }
  const got = salvageAmount(s);
  return withLog(
    got > 0 ? { ...s, cargo: { ...s.cargo, parts: s.cargo.parts + got } } : s,
    got > 0
      ? `Salvaged ${got} ${commodityName("parts")}.`
      : `Hold full — left the salvage drifting.`
  );
}

function resolveEngine(s: GameState): GameState {
  const burn = engineBurn(s);
  const strain = engineHullStrain(s);
  const clauses: string[] = [];
  if (burn > 0) clauses.push(`burned ${burn} fuel`);
  if (strain > 0) clauses.push(`overheated the hull for ${strain}`);
  const msg = `Engine trouble ${clauses.join(" and ")}.`;
  return withLog({ ...s, fuel: s.fuel - burn, hull: s.hull - strain }, msg);
}

function resolveDerelict(s: GameState, choiceId: string): GameState {
  if (choiceId !== "board") return s;
  // Shared hash, same as resolveSalvage — avoids the every-other-day periodicity a raw
  // `(day*7+seed) % 2` produces (B-2 class). E1-4 still owns making these odds visible.
  if (hashSeed(s.seed, s.day) % 2 === 0) {
    const reward = derelictReward(s.day);
    return withLog({ ...s, credits: s.credits + reward }, `Derelict held ${reward}cr!`);
  }
  return withLog(
    { ...s, hull: s.hull - DERELICT_TRAP_DAMAGE },
    `Derelict was a trap: -${DERELICT_TRAP_DAMAGE} hull.`
  );
}

function resolveCustoms(s: GameState, choiceId: string): GameState {
  if (choiceId === "comply" && s.cargo.luxury > 0) {
    const seized = s.cargo.luxury;
    return withLog(
      { ...s, cargo: { ...s.cargo, luxury: 0 } },
      `Customs seized ${seized} luxury goods.`
    );
  }
  if (choiceId === "bribe") {
    const bribe = bribeCost(s);
    return withLog({ ...s, credits: s.credits - bribe }, `Bribed customs ${bribe}cr.`);
  }
  return s;
}

/** Apply the consequences of an event choice. Deterministic per seed/day. */
export function resolveChoice(state: GameState, event: GameEvent, choiceId: string): GameState {
  let s = state;
  switch (event.kind) {
    case "pirates":
      s = resolvePirates(s, choiceId);
      break;
    case "salvage":
      s = resolveSalvage(s, choiceId);
      break;
    case "engine":
      s = resolveEngine(s);
      break;
    case "derelict":
      s = resolveDerelict(s, choiceId);
      break;
    case "customs":
      s = resolveCustoms(s, choiceId);
      break;
    case "quiet":
    default:
      break;
  }
  // Loss/peak from deliveries are evaluated in `arrive`; hull death is checked here
  // because a destroyed ship must not reach arrival settlement (cargo is lost).
  return checkHullDeath(trackPeak(s));
}
