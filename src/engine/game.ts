// src/engine/game.ts
import { CommodityId, GameEvent, GameState, Mission, NodeId } from "./types";
import { NODE_IDS, fuelCost, getPrice } from "./world";
import {
  REFUEL_PRICE, REPAIR_PRICE, dockingFee, taxOnSale, loanInterest, cargoUsed, netWorth,
} from "./economy";
import { generateMissions } from "./missions";
import { rollEvent } from "./events";

export const STARTING = {
  credits: 800,
  debt: 1500,
  fuel: 16,
  fuelCapacity: 20,
  hull: 100,
  cargoCapacity: 30,
};

const INTEREST_EVERY = 3; // days between interest accruals

export function createGame(seed: number): GameState {
  return {
    seed,
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
    log: ["You launch from Terra Hub, 1500 credits in debt. Make it count."],
  };
}

function withLog(state: GameState, msg: string): GameState {
  return { ...state, log: [...state.log, msg].slice(-12) };
}

function trackPeak(state: GameState): GameState {
  const nw = netWorth(state);
  return nw > state.peakNetWorth ? { ...state, peakNetWorth: nw } : state;
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
  return trackPeak(withLog(next, `Bought ${qty} ${id} for ${cost}cr.`));
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
  return trackPeak(withLog(next, `Sold ${qty} ${id} for ${proceeds}cr (tax ${tax}).`));
}

export function refuel(state: GameState, units: number): GameState {
  const room = state.fuelCapacity - state.fuel;
  const buyUnits = Math.min(units, room);
  if (buyUnits <= 0) return state;
  const cost = buyUnits * REFUEL_PRICE;
  if (cost > state.credits) return state;
  return withLog(
    { ...state, fuel: state.fuel + buyUnits, credits: state.credits - cost },
    `Refueled ${buyUnits} for ${cost}cr.`,
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
    `Repaired ${fix} hull for ${cost}cr.`,
  );
}

export function payDebt(state: GameState, amount: number): GameState {
  const pay = Math.min(amount, state.debt, state.credits);
  if (pay <= 0) return state;
  return trackPeak(withLog(
    { ...state, debt: state.debt - pay, credits: state.credits - pay },
    `Paid down ${pay}cr of debt.`,
  ));
}

export function acceptMission(state: GameState, mission: Mission): GameState {
  if (state.activeMissions.some((m) => m.id === mission.id)) return state;
  return withLog(
    { ...state, activeMissions: [...state.activeMissions, mission] },
    `Accepted delivery to ${mission.destination}.`,
  );
}

/** Complete any active missions satisfied by current location + cargo, paying rewards. */
function settleMissions(state: GameState): GameState {
  let s = state;
  const remaining: Mission[] = [];
  for (const m of s.activeMissions) {
    if (m.destination === s.location && s.cargo[m.commodity] >= m.qty && s.day <= m.deadlineDay) {
      s = {
        ...s,
        cargo: { ...s.cargo, [m.commodity]: s.cargo[m.commodity] - m.qty },
        credits: s.credits + m.reward,
      };
      s = withLog(s, `Delivery complete: +${m.reward}cr.`);
    } else if (s.day > m.deadlineDay) {
      s = withLog(s, `Delivery to ${m.destination} expired.`);
    } else {
      remaining.push(m);
    }
  }
  return { ...s, activeMissions: remaining };
}

export function checkLoss(state: GameState): GameState {
  if (state.status === "lost") return state;
  const cheapest = Math.min(
    ...NODE_IDS.filter((n) => n !== state.location).map((n) => fuelCost(state.location, n)),
  );
  const canJumpNow = state.fuel >= cheapest;
  const fuelShort = Math.max(0, cheapest - state.fuel);
  const canBuyFuel = state.credits >= fuelShort * REFUEL_PRICE;
  if (!canJumpNow && !canBuyFuel) {
    return withLog({ ...state, status: "lost" }, "Stranded and broke. The run ends here.");
  }
  return state;
}

/**
 * Jump to a destination: spend fuel, advance the day, accrue interest, pay docking,
 * settle deliveries, then return the pending in-transit event for the UI to resolve.
 */
export function jump(state: GameState, to: NodeId): { state: GameState; event: GameEvent | null } {
  if (to === state.location) return { state, event: null };
  const cost = fuelCost(state.location, to);
  if (state.fuel < cost) return { state, event: null };

  let s: GameState = { ...state, fuel: state.fuel - cost, location: to, day: state.day + 1 };

  // Interest accrues on a fixed cadence.
  if (s.day % INTEREST_EVERY === 0 && s.debt > 0) {
    const interest = loanInterest(s.debt);
    s = withLog({ ...s, debt: s.debt + interest }, `Loan interest +${interest}cr.`);
  }

  // Docking fee on arrival.
  const fee = dockingFee(to);
  s = withLog({ ...s, credits: s.credits - fee }, `Docked at ${to}, fee ${fee}cr.`);

  s = settleMissions(s);
  s = trackPeak(s);

  const event = rollEvent(s.seed, s.day, state.location, to);
  return { state: s, event };
}

/** Apply the consequences of an event choice. Deterministic per seed/day. */
export function resolveChoice(state: GameState, event: GameEvent, choiceId: string): GameState {
  let s = state;
  const luxValue = () => getPrice(s.seed, s.day, s.location, "luxury");
  switch (event.kind) {
    case "pirates": {
      if (choiceId === "pay") {
        const toll = Math.min(s.credits, 150 + s.day * 10);
        s = withLog({ ...s, credits: s.credits - toll }, `Paid pirates ${toll}cr.`);
      } else {
        const dmg = 15 + (s.day % 10);
        s = withLog({ ...s, hull: Math.max(0, s.hull - dmg) }, `Fled — took ${dmg} hull damage.`);
      }
      break;
    }
    case "salvage": {
      if (choiceId === "collect") {
        const room = s.cargoCapacity - cargoUsed(s.cargo);
        const got = Math.min(room, 2 + (s.day % 4));
        s = withLog({ ...s, cargo: { ...s.cargo, parts: s.cargo.parts + got } }, `Salvaged ${got} parts.`);
      }
      break;
    }
    case "engine": {
      const burn = Math.min(s.fuel, 2);
      s = withLog({ ...s, fuel: s.fuel - burn }, `Engine trouble burned ${burn} fuel.`);
      break;
    }
    case "derelict": {
      if (choiceId === "board") {
        if ((s.day * 7 + s.seed) % 2 === 0) {
          const reward = 200 + s.day * 8;
          s = withLog({ ...s, credits: s.credits + reward }, `Derelict held ${reward}cr!`);
        } else {
          const dmg = 20;
          s = withLog({ ...s, hull: Math.max(0, s.hull - dmg) }, `Derelict was a trap: -${dmg} hull.`);
        }
      }
      break;
    }
    case "customs": {
      if (choiceId === "comply" && s.cargo.luxury > 0) {
        const seized = s.cargo.luxury;
        s = withLog({ ...s, cargo: { ...s.cargo, luxury: 0 } }, `Customs seized ${seized} luxury goods.`);
      } else if (choiceId === "bribe") {
        const bribe = Math.min(s.credits, luxValue());
        s = withLog({ ...s, credits: s.credits - bribe }, `Bribed customs ${bribe}cr.`);
      }
      break;
    }
    case "quiet":
    default:
      break;
  }
  return checkLoss(trackPeak(s));
}
