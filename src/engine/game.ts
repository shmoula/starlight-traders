// src/engine/game.ts
import {
  CommodityId,
  DayHighlightKind,
  GameEvent,
  GameState,
  LogTone,
  Mission,
  NodeId,
  RunRecords,
  emptyRecords,
} from "./types";
import { NODES, commodityName, fuelCost, getPrice } from "./world";
import {
  BIG_TRADE_CR,
  MARKET_DEPTH,
  REFUEL_PRICE,
  REPAIR_PRICE,
  canEscape,
  dockingFee,
  netSaleProceeds,
  saleProceeds,
  taxOnSale,
  loanInterest,
  LOAN_STEP_IMPATIENT,
  LOAN_STEP_DESPERATE,
  cargoUsed,
  netWorth,
  spendableCredits,
} from "./economy";
import { docksideUnitsUsed, generateMissions } from "./missions";
import { rollEvent } from "./events";
import { crewName } from "./fiction";
import { hashSeed } from "./rng";
import {
  DERELICT_REWARD_DIVISOR,
  DERELICT_TRAP_DAMAGE,
  bribeCost,
  derelictReward,
  engineBurn,
  engineHullStrain,
  fleeDamage,
  pirateToll,
  SALVAGE_BAIT_DIVISOR,
  SALVAGE_HAZARD_DIVISOR,
  SALVAGE_TRAP_DAMAGE,
  salvageAmount,
} from "./preview";
import { RUN_LENGTH, endRun } from "./run-end";
import { dailyModifier } from "./modifiers";

export const STARTING = {
  credits: 800,
  debt: 1500,
  fuel: 16,
  fuelCapacity: 20,
  hull: 100,
  cargoCapacity: 30,
};

const INTEREST_EVERY = 3; // days between interest accruals

/** Hull threshold for the Verge Runner feat (E2-5) — a docking below this is "limping in". */
export const VERGE_LOW_HULL = 20;

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
    boughtHere: { water: 0, parts: 0, luxury: 0 },
    soldHere: { water: 0, parts: 0, luxury: 0 },
    costBasis: { water: 0, parts: 0, luxury: 0 },
    pirateTail: false,
    contracts: { delivered: 0, expired: 0, forfeitedCr: 0 },
    peakNetWorth: 0,
    dayHighlights: {},
    records: { ...emptyRecords(), visited: ["terra"] },
    status: "playing",
    log: [
      {
        msg: `The Syndicate staked your ship — ${STARTING.debt.toLocaleString()}cr, compounding. Bank your fortune before the Day ${RUN_LENGTH} audit. Everyone flies today's sky.`,
        tone: "neutral" as const,
        day: 1,
      },
    ],
  };
}

// Keep the full run history; the UI decides how many entries to surface. A run is
// bounded (you eventually lose), so this stays small, and retaining every entry lets
// the UI capture "what happened this turn" by a stable index rather than a fragile diff.
function withLog(
  state: GameState,
  msg: string,
  tone: LogTone = "neutral",
  delta?: number
): GameState {
  return {
    ...state,
    log: [...state.log, { msg, tone, day: state.day, ...(delta === undefined ? {} : { delta }) }],
  };
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

/** Keep the single largest credit inflow of the run (E1-3 "best haul"). */
function trackPayday(state: GameState, amount: number, label: string): GameState {
  if (amount <= 0) return state;
  if (state.biggestPayday && state.biggestPayday.amount >= amount) return state;
  return { ...state, biggestPayday: { amount, label } };
}

/** When a day earns several highlights, the highest rank is the one the strip shows. */
const HIGHLIGHT_RANK: Record<DayHighlightKind, number> = { pirates: 3, bigTrade: 2, delivery: 1 };

/** Record the current day's notable moment for the share strip (E1-2). Upgrade-only. */
function markDay(s: GameState, kind: DayHighlightKind): GameState {
  const cur = s.dayHighlights[s.day];
  if (cur && HIGHLIGHT_RANK[cur] >= HIGHLIGHT_RANK[kind]) return s;
  return { ...s, dayHighlights: { ...s.dayHighlights, [s.day]: kind } };
}

/** Merge feat-relevant moment facts (E2-5). Append-only; game rules never read these. */
function withRecords(s: GameState, patch: Partial<RunRecords>): GameState {
  return { ...s, records: { ...s.records, ...patch } };
}

/** Subtract hull and tally the loss — every damage site routes here so "Not a Scratch"
 *  can trust damageTaken. Deliberately unclamped, matching the sites it replaces:
 *  checkHullDeath floors and ends the run. */
function withHullDamage(s: GameState, dmg: number): GameState {
  return withRecords({ ...s, hull: s.hull - dmg }, { damageTaken: s.records.damageTaken + dmg });
}

/** Proportional cost-basis relief for removing `qty` of `id` from the hold (P2-2):
 *  compute BEFORE the cargo decrement; clamped so basis can never go negative. */
function relieveBasis(s: GameState, id: CommodityId, qty: number): Record<CommodityId, number> {
  const held = s.cargo[id];
  const relieved =
    held > 0
      ? Math.min(s.costBasis[id], Math.round((s.costBasis[id] * qty) / held))
      : s.costBasis[id];
  return { ...s.costBasis, [id]: s.costBasis[id] - relieved };
}

/** Flag a hold that just reached capacity (E2-5 Full House). Upgrade-only. */
function trackFullHold(s: GameState): GameState {
  if (s.records.fullHold || cargoUsed(s.cargo) < s.cargoCapacity) return s;
  return withRecords(s, { fullHold: true });
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
    ? endRun(floored, "lost", "Hull breach — your ship broke apart.", "hull")
    : floored;
}

export function missionsHere(state: GameState): Mission[] {
  return generateMissions(state.seed, state.day, state.location);
}

/**
 * E2-2h: a dock-side spend may not leave the run unable to leave the station. `jump`
 * refuses silently when fuel is short, so nothing downstream would ever notice —
 * `checkLoss` has one caller, inside `arrive`, and a run stranded at its own dock never
 * gets there. It would sit in `status: "playing"` with Retire (which pays a survival
 * bonus) as its only move, scoring *better* than being stranded honestly.
 *
 * So the spend is refused instead, in the same silent style as the affordability guards
 * it sits beside: the credits are still the player's, and refusing hands them back the
 * choice. `refuel` needs no guard — a unit of fuel costs exactly what it removes from
 * the fare — and `sell`/`deliver` only ever raise the escape money.
 *
 * The one exception is a run that was *already* past the fare on the way in, which a
 * snapshot written before this guard could still rehydrate: freezing its dock would trap
 * it forever, so the loss check that never ran runs now.
 */
function keepEscapable(before: GameState, after: GameState): GameState {
  if (canEscape(after)) return after;
  return canEscape(before) ? before : checkLoss(before);
}

export function buy(state: GameState, id: CommodityId, qty: number): GameState {
  if (qty <= 0) return state;
  // buyBlockReason owns the guard values so the UI and buy can never disagree. The hard
  // affordability refusals return early; the "reserve" (escape-fare) verdict is left to
  // keepEscapable below, which refuses an escapable run's purchase but still runs the loss
  // check on a run that arrived already stranded (E2-2h) — a bare return would freeze it.
  const block = buyBlockReason(state, id, qty);
  if (block === "credits" || block === "room") return state;
  const price = getPrice(state.seed, state.day, state.location, id);
  const cost = price * qty;
  const next = {
    ...state,
    credits: state.credits - cost,
    cargo: { ...state.cargo, [id]: state.cargo[id] + qty },
    boughtHere: { ...state.boughtHere, [id]: state.boughtHere[id] + qty },
    costBasis: { ...state.costBasis, [id]: state.costBasis[id] + cost },
  };
  return keepEscapable(
    state,
    trackPeak(
      withLog(
        trackFullHold(next),
        `Bought ${qty} ${commodityName(id)} for ${cost}cr.`,
        "neutral",
        -cost
      )
    )
  );
}

export function sell(state: GameState, id: CommodityId, qty: number): GameState {
  if (qty <= 0 || state.cargo[id] < qty) return state;
  // E2-1: gross walks the depth curve; the log names the saturation when it bites.
  const { gross, degradedUnits } = saleProceeds(state, id, qty);
  const tax = taxOnSale(state.location, gross);
  let next: GameState = {
    ...state,
    credits: state.credits + gross - tax,
    cargo: { ...state.cargo, [id]: state.cargo[id] - qty },
    boughtHere: { ...state.boughtHere, [id]: Math.max(0, state.boughtHere[id] - qty) },
    soldHere: { ...state.soldHere, [id]: state.soldHere[id] + qty },
    costBasis: relieveBasis(state, id, qty),
  };
  next = trackPayday(next, gross - tax, `${commodityName(id)} at ${NODES[state.location].name}`);
  if (gross - tax >= BIG_TRADE_CR) next = markDay(next, "bigTrade");
  const saturationNote = degradedUnits > 0 ? ` — market saturated after ${MARKET_DEPTH} units` : "";
  return trackPeak(
    withLog(
      next,
      `Sold ${qty} ${commodityName(id)} for ${gross}cr (tax ${tax})${saturationNote}.`,
      "good",
      gross - tax
    )
  );
}

// Shared trade math so the UI never re-derives buy()/sell()'s guards by hand. A button
// that computes its clamped quantity or net proceeds from these helpers stays honest
// about what a click delivers even if buy()/sell() later grows a fee or rounding rule (B-1).

/**
 * Largest quantity of `id` buyable here, clamped by credits, hold room, and the E2-2h
 * escape fare. The fare clamp walks down rather than solving for a quantity: each unit
 * costs only the sale tax on it, and `taxOnSale` rounds per sale, so the exact cap is the
 * one `buyBlockReason` — the same guard `buy` runs — actually agrees with.
 */
export function maxBuyable(state: GameState, id: CommodityId): number {
  const price = getPrice(state.seed, state.day, state.location, id);
  const room = state.cargoCapacity - cargoUsed(state.cargo);
  let qty = Math.max(0, Math.min(Math.floor(state.credits / price), room));
  while (qty > 0 && buyBlockReason(state, id, qty) !== "") qty--;
  return qty;
}

/** Net credits from selling `qty` of `id` here, after sale tax — what sell() actually pays. */
export function netProceeds(state: GameState, id: CommodityId, qty: number): number {
  return netSaleProceeds(state, id, qty);
}

/**
 * The Syndicate's next interest tick (P1-2 forecast): how many days away, and how much
 * at THAT day's escalated rate — the same INTEREST_EVERY cadence and loanInterest math
 * jump() applies, so the chip can never disagree with the accrual.
 */
export function interestForecast(s: GameState): { inDays: number; amount: number } | null {
  if (s.debt <= 0 || s.status !== "playing" || dailyModifier(s.seed).interestHoliday) return null;
  const inDays = INTEREST_EVERY - (s.day % INTEREST_EVERY);
  return { inDays, amount: loanInterest(s.debt, s.day + inDays) };
}

/** Why buying `qty` of `id` here is blocked — "" when it would succeed. Mirrors buy()'s guard order. */
export type BuyBlock = "" | "credits" | "room" | "reserve";
export function buyBlockReason(state: GameState, id: CommodityId, qty: number): BuyBlock {
  if (qty <= 0) return "";
  const price = getPrice(state.seed, state.day, state.location, id);
  if (price * qty > state.credits) return "credits";
  if (cargoUsed(state.cargo) + qty > state.cargoCapacity) return "room";
  // A purchase is nearly escape-money-neutral — the hold sells back — so it can only
  // strand the run by the sale tax on it. That is enough at Meridian's 18% (E2-2h).
  const after = {
    ...state,
    credits: state.credits - price * qty,
    cargo: { ...state.cargo, [id]: state.cargo[id] + qty },
  };
  if (!canEscape(after)) return "reserve";
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
    `Refueled ${buyUnits} for ${cost}cr.`,
    "neutral",
    -cost
  );
}

export function repair(state: GameState, points: number): GameState {
  const room = state.hullMax - state.hull;
  const fix = Math.min(points, room);
  if (fix <= 0) return state;
  const cost = fix * REPAIR_PRICE;
  if (cost > state.credits) return state;
  return keepEscapable(
    state,
    withLog(
      { ...state, hull: state.hull + fix, credits: state.credits - cost },
      `Repaired ${fix} hull for ${cost}cr.`,
      "neutral",
      -cost
    )
  );
}

export function payDebt(state: GameState, amount: number): GameState {
  // Clamped, not refused: paying down debt already pays less than asked when the purse
  // is short, so E2-2h's escape fare is just one more ceiling on the same clamp. A
  // player who asks to pay 200 on a dry tank pays what is left over the fare instead of
  // being told no. `keepEscapable` below stays as the backstop for an inbound strand.
  const pay = Math.min(amount, state.debt, spendableCredits(state));
  if (pay <= 0) return state;
  let next = withLog(
    { ...state, debt: state.debt - pay, credits: state.credits - pay },
    `Paid down ${pay}cr of debt.`,
    "good",
    -pay
  );
  // E2-5: the day the books first hit zero is a feat fact — recorded once, then frozen.
  if (next.debt === 0 && next.records.debtClearedDay === undefined) {
    next = withRecords(next, { debtClearedDay: next.day });
  }
  return keepEscapable(state, trackPeak(next));
}

/** Voluntarily end the run at dock, banking the score (E0-1). No-op once the run is over. */
export function retire(state: GameState): GameState {
  return endRun(
    state,
    "retired",
    `Retired at ${NODES[state.location].name} — the Syndicate banks your score.`
  );
}

/**
 * Post the bond and take the contract (E2-2a). The `-deposit` delta is load-bearing beyond
 * this function: the escrow is accounted once per direction, so delivery returns
 * `payout + deposit` as a single credited delta and expiry logs none at all (the money
 * already moved here). Summed log deltas must equal net credit movement. Delivery is the
 * only path that gives the bond back — bonds open at audit, retire, or death are sunk.
 */
export function acceptMission(state: GameState, mission: Mission): GameState {
  if (state.activeMissions.some((m) => m.id === mission.id)) return state;
  if (state.credits < mission.deposit) return state; // E2-2a: can't post the bond
  return keepEscapable(
    state,
    withLog(
      {
        ...state,
        credits: state.credits - mission.deposit,
        activeMissions: [...state.activeMissions, mission],
      },
      `Accepted delivery to ${NODES[mission.destination].name} — ${mission.deposit}cr deposit held.`,
      "neutral",
      -mission.deposit
    )
  );
}

/**
 * Settle deliveries against the current location without jumping. Needed when a
 * mission's destination is already the current station (e.g. cargo bought after
 * arriving empty-handed) — `jump` no-ops when `to === state.location`, so `arrive`
 * never runs for that case.
 *
 * The `trackPeak` mirrors `arrive`: this is the other path where a payout raises net
 * worth, and the debrief's high-water mark has to see it. Safe to apply here even though
 * `arrive` settles too — it calls `settleMissions` directly rather than routing through
 * this function, and the mark is upgrade-only regardless.
 */
export function deliver(state: GameState): GameState {
  return trackPeak(settleMissions(state).state);
}

/**
 * Complete any active missions satisfied by current location + cargo. Hauled units earn the
 * contract premium; units bought at this dock since arrival pay local spot (E2-2d). Each
 * settlement returns the bond and bumps the delivered counter; expiry is handled below.
 */
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
      // E2-2d: only hauled units earn the contract premium; units bought at this dock
      // since arrival settle at today's local spot — the instant-settle wash. The split
      // comes from docksideUnitsUsed so the active card shows this same number.
      const boughtUsed = docksideUnitsUsed(s, m);
      const hauledUsed = m.qty - boughtUsed;
      const spot = getPrice(s.seed, s.day, m.destination, m.commodity);
      const payout = Math.round((m.reward * hauledUsed) / m.qty) + spot * boughtUsed;
      // Full credit movement = earned payout + the returned bond. Stats/highlights use
      // `payout` (E2-2j); only credits and the log line use `inflow`.
      const inflow = payout + m.deposit;
      s = {
        ...s,
        cargo: { ...s.cargo, [m.commodity]: s.cargo[m.commodity] - m.qty },
        boughtHere: {
          ...s.boughtHere,
          [m.commodity]: Math.max(0, s.boughtHere[m.commodity] - boughtUsed),
        },
        costBasis: relieveBasis(s, m.commodity, m.qty),
        credits: s.credits + inflow,
        contracts: { ...s.contracts, delivered: s.contracts.delivered + 1 },
      };
      s = trackPayday(
        s,
        payout, // E2-2j: your own bond coming back is not a payday — track what you earned
        `${commodityName(m.commodity)} contract → ${NODES[m.destination].name}`
      );
      const dockside = boughtUsed > 0 ? ` — ${boughtUsed} bought dockside paid spot` : "";
      s = withLog(
        s,
        `Delivery complete: +${inflow}cr${dockside} (deposit returned).`,
        "good",
        inflow
      );
      s = markDay(s, payout >= BIG_TRADE_CR ? "bigTrade" : "delivery"); // E2-2j: rank the day on what you earned, not the returned bond
      delivered.push(m);
    } else if (s.day > m.deadlineDay) {
      // E2-2b: the bond is the penalty — the credits moved at accept, so no delta here.
      s = withLog(
        {
          ...s,
          contracts: {
            ...s.contracts,
            expired: s.contracts.expired + 1,
            forfeitedCr: s.contracts.forfeitedCr + m.deposit,
          },
        },
        `Delivery to ${NODES[m.destination].name} expired — ${m.deposit}cr deposit forfeit.`,
        "bad"
      );
      expired.push(m);
    } else {
      remaining.push(m);
    }
  }
  return { state: { ...s, activeMissions: remaining }, delivered, expired };
}

/**
 * End the run when the station has become a dead end. "Escape" counts the hold as well
 * as the purse (see `canEscape`): a ship that can sell its cargo here and refuel on the
 * proceeds is not stranded, it is merely illiquid — and treating it as stranded is what
 * would make E2-2h's dock-side guard kill players for buying cargo.
 */
export function checkLoss(state: GameState): GameState {
  if (state.status !== "playing") return state;
  if (!canEscape(state)) {
    return endRun(
      state,
      "lost",
      `Stranded at ${NODES[state.location].name} — not enough fuel to jump, and refueling costs more than you have.`,
      "fuel"
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
  const cost = fuelCost(state.seed, state.location, to);
  if (state.fuel < cost) return { state, event: null };

  let s: GameState = {
    ...state,
    fuel: state.fuel - cost,
    location: to,
    day: state.day + 1,
    boughtHere: { water: 0, parts: 0, luxury: 0 },
    soldHere: { water: 0, parts: 0, luxury: 0 },
    pirateTail: false, // E3-4: the tail lasts exactly one jump, fired or not
  };

  // Interest accrues on a fixed cadence — unless today's sky is a Syndicate rest (E3-1).
  if (s.day % INTEREST_EVERY === 0 && s.debt > 0 && !dailyModifier(s.seed).interestHoliday) {
    const interest = loanInterest(s.debt, s.day);
    s = withLog({ ...s, debt: s.debt + interest }, interestLine(interest, s.day), "bad");
  }

  // Docking fee on arrival.
  const fee = dockingFee(to);
  s = withLog(
    { ...s, credits: s.credits - fee },
    `Docked at ${NODES[to].name}, fee ${fee}cr.`,
    "neutral",
    -fee
  );

  const event = rollEvent(s.seed, s.day, state.location, to, state.pirateTail);
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
  // E2-5 moment facts: this arrival is a real docking, whatever the day check decides next.
  if (!s.records.visited.includes(s.location)) {
    s = withRecords(s, { visited: [...s.records.visited, s.location] });
  }
  if (s.location === "verge" && s.hull < VERGE_LOW_HULL && !s.records.vergeAtLowHull) {
    s = withRecords(s, { vergeAtLowHull: true });
  }
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
  const marked = withRecords(markDay(s, "pirates"), {
    pirateAmbushes: s.records.pirateAmbushes + 1,
  });
  const crew = crewName(marked.seed);
  if (choiceId === "pay") {
    const toll = pirateToll(marked);
    return withLog(
      { ...marked, credits: marked.credits - toll },
      `Paid ${crew} ${toll}cr to pass.`,
      "bad",
      -toll
    );
  }
  const dmg = fleeDamage(marked.day);
  return withLog(withHullDamage(marked, dmg), `Outran ${crew} — took ${dmg} hull damage.`, "bad");
}

/** Salts the bait draw so it is independent of the same-day hazard draw (E3-4). */
const BAIT_SALT = 0xba17;

function resolveSalvage(s: GameState, choiceId: string): GameState {
  if (choiceId !== "collect") return s;
  // Deterministic per seed/day via the shared hash — mulberry32's hashSeed avoids the
  // strict every-3rd-day periodicity a raw `(day*7+seed) % 3` produces (B-2 class).
  if (hashSeed(s.seed, s.day) % SALVAGE_HAZARD_DIVISOR === 0) {
    return withLog(
      withHullDamage(s, SALVAGE_TRAP_DAMAGE),
      `Salvage hid a live warhead: -${SALVAGE_TRAP_DAMAGE} hull.`,
      "bad"
    );
  }
  const got = salvageAmount(s);
  if (got <= 0) return withLog(s, `Hold full — left the salvage drifting.`, "neutral");
  let next = withLog(
    trackFullHold({ ...s, cargo: { ...s.cargo, parts: s.cargo.parts + got } }),
    `Salvaged ${got} ${commodityName("parts")}.`,
    "good"
  );
  // E3-4: a clean scoop is seeded 1-in-SALVAGE_BAIT_DIVISOR to be bait — announced
  // immediately, so the tail is a navigation decision, not a gotcha. Salted apart from
  // the hazard draw, and unreachable from the warhead/full-hold paths above.
  if (hashSeed(s.seed, s.day, BAIT_SALT) % SALVAGE_BAIT_DIVISOR === 0) {
    next = withLog(
      { ...next, pirateTail: true },
      `That debris was bait — a pirate tail swings in behind you.`,
      "bad"
    );
  }
  return next;
}

function resolveEngine(s: GameState): GameState {
  const burn = engineBurn(s);
  const strain = engineHullStrain(s);
  const clauses: string[] = [];
  if (burn > 0) clauses.push(`burned ${burn} fuel`);
  if (strain > 0) clauses.push(`overheated the hull for ${strain}`);
  const msg = `Engine trouble ${clauses.join(" and ")}.`;
  return withLog(withHullDamage({ ...s, fuel: s.fuel - burn }, strain), msg, "bad");
}

function resolveDerelict(s: GameState, choiceId: string): GameState {
  if (choiceId !== "board") return s;
  // Shared hash, same as resolveSalvage — avoids the every-other-day periodicity a raw
  // `(day*7+seed) % 2` produces (B-2 class). E1-4 still owns making these odds visible.
  if (hashSeed(s.seed, s.day) % DERELICT_REWARD_DIVISOR === 0) {
    const reward = derelictReward(s.day);
    return withLog(
      { ...s, credits: s.credits + reward },
      `Derelict held ${reward}cr!`,
      "good",
      reward
    );
  }
  return withLog(
    withHullDamage(s, DERELICT_TRAP_DAMAGE),
    `Derelict was a trap: -${DERELICT_TRAP_DAMAGE} hull.`,
    "bad"
  );
}

function resolveCustoms(s: GameState, choiceId: string): GameState {
  if (choiceId === "comply" && s.cargo.luxury > 0) {
    const seized = s.cargo.luxury;
    return withLog(
      // Seized units leave the hold, so their provenance goes with them. Belt-and-braces
      // today: resolveChoice only runs after jump, which already zeroed boughtHere, so
      // there is nothing to clear. Kept so the invariant boughtHere[c] <= cargo[c] holds
      // locally rather than depending on that call order staying true.
      {
        ...s,
        cargo: { ...s.cargo, luxury: 0 },
        boughtHere: { ...s.boughtHere, luxury: 0 },
        costBasis: { ...s.costBasis, luxury: 0 },
      },
      `Customs seized ${seized} luxury goods.`,
      "bad"
    );
  }
  if (choiceId === "bribe") {
    const bribe = bribeCost(s);
    return withLog(
      { ...s, credits: s.credits - bribe },
      `Bribed customs ${bribe}cr.`,
      "bad",
      -bribe
    );
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
