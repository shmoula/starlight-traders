// src/sim/simulate.ts
import { CommodityId, GameState, NodeId } from "../engine/types";
import {
  arrive,
  buy,
  checkLoss,
  createGame,
  jump,
  refuel,
  repair,
  resolveChoice,
  sell,
} from "../engine/game";
import { COMMODITIES, NODE_IDS, fuelCost, getPrice } from "../engine/world";
import { MARKET_DEPTH, REFUEL_PRICE, dockingFee } from "../engine/economy";

export type Archetype = "cautious" | "balanced" | "greedy";

export interface SimResult {
  daysSurvived: number;
  peakNetWorth: number;
  score: number;
  /** runEnd.netWorthAtEnd (0 if somehow absent) — the decay gates' metric: cautious's
   *  score is pure survival bonus and its peak sits at 0, so only this shows trading. */
  netWorthAtEnd: number;
  status: GameState["status"];
  /** Days whose highlight is 💰 — observability for E1-2's BIG_TRADE_CR tuning. */
  bigTradeDays: number;
}

/** Pick the destination + commodity that maximizes naive expected margin this turn. */
function bestTrade(
  s: GameState,
  candidates: CommodityId[]
): { to: NodeId; id: CommodityId } | null {
  let best: { to: NodeId; id: CommodityId; margin: number } | null = null;
  for (const to of NODE_IDS.filter((n) => n !== s.location)) {
    const f = fuelCost(s.location, to);
    if (s.fuel < f) continue;
    for (const id of candidates) {
      const buyP = getPrice(s.seed, s.day, s.location, id);
      const sellP = getPrice(s.seed, s.day + 1, to, id);
      const margin = sellP - buyP;
      if (best === null || margin > best.margin) best = { to, id, margin };
    }
  }
  return best ? { to: best.to, id: best.id } : null;
}

/** Persona → the commodities this archetype is willing to trade. */
function candidatesFor(kind: Archetype): CommodityId[] {
  if (kind === "cautious") return ["water"];
  if (kind === "balanced") return ["water", "parts"];
  return ["water", "parts", "luxury"];
}

/** Read the banked run summary into a sim result, falling back if the run
 *  somehow ended without one. */
function toResult(s: GameState): SimResult {
  return {
    daysSurvived: s.runEnd?.daysSurvived ?? Math.min(s.day, 12),
    peakNetWorth: s.peakNetWorth,
    score: s.runEnd?.score ?? 0,
    netWorthAtEnd: s.runEnd?.netWorthAtEnd ?? 0,
    status: s.status,
    bigTradeDays: Object.values(s.dayHighlights).filter((k) => k === "bigTrade").length,
  };
}

/** One full bounded run; the engine ends it by audit, stranding, or hull breach. */
export function runArchetype(kind: Archetype, seed: number): SimResult {
  let s = createGame(seed);
  const candidates = candidatesFor(kind);

  while (s.status === "playing") {
    // Top up fuel modestly each turn; careful personas also maintain the hull now
    // that hull 0 destroys the ship (B-6). Greedy gambles it, in persona.
    s = refuel(s, 6);
    if (kind !== "greedy" && s.hull < 50) s = repair(s, 30);

    const pick = bestTrade(s, candidates);
    if (!pick) {
      s = checkLoss(s);
      if (s.status !== "playing") break;
      // Cannot trade — checkLoss says a jump is still affordable, so top up to the
      // cheapest hop and take it to advance the day and accrue costs.
      const to = NODE_IDS.filter((n) => n !== s.location).sort(
        (a, b) => fuelCost(s.location, a) - fuelCost(s.location, b)
      )[0];
      s = refuel(s, Math.max(0, fuelCost(s.location, to) - s.fuel));
      const r = jump(s, to);
      if (r.event === null) break;
      const choice = chooseEventOption(
        kind,
        r.event.choices.map((c) => c.id)
      );
      s = resolveChoice(r.state, r.event, choice);
      s = arrive(s).state;
      continue;
    }

    // Buy as much of the chosen commodity as affordable/space allows.
    while (true) {
      const next = buy(s, pick.id, 1);
      if (next === s) break;
      s = next;
    }

    const r = jump(s, pick.to);
    if (r.event === null) {
      s = checkLoss(s);
      break;
    }
    const choice = chooseEventOption(
      kind,
      r.event.choices.map((c) => c.id)
    );
    s = resolveChoice(r.state, r.event, choice);
    // arrive() settles deliveries, banks the Day-12 audit, and runs the loss check.
    s = arrive(s).state;
    if (s.status !== "playing") break;

    // Sell everything we can at the new location.
    (["water", "parts", "luxury"] as CommodityId[]).forEach((id) => {
      if (s.cargo[id] > 0) s = sell(s, id, s.cargo[id]);
    });
    s = checkLoss(s);
  }

  return toResult(s);
}

function chooseEventOption(kind: Archetype, ids: string[]): string {
  if (ids.includes("pay") && kind === "cautious") return "pay";
  if (ids.includes("flee") && kind !== "cautious") return "flee";
  // Salvage and derelict both stake hull on a gamble; only the greedy archetype takes
  // it. Cautious/balanced pick the safe option so the sim measures a real persona split
  // rather than every archetype quietly gambling hull via the fall-through.
  if (ids.includes("collect")) return kind === "greedy" ? "collect" : "ignore";
  if (ids.includes("board")) return kind === "greedy" ? "board" : "leave";
  if (ids.includes("comply")) return "comply";
  return ids[0];
}

/**
 * Distinct single-jump loops on `day` where a first-hold load (≤ MARKET_DEPTH units, so
 * every unit sells at list) turns a profit net of fuel and the destination dock fee.
 * The E2-1 gate: depth must decay monoculture without collapsing the map into one lane.
 */
export function viableLoops(seed: number, day: number): number {
  let count = 0;
  for (const a of NODE_IDS) {
    for (const b of NODE_IDS) {
      if (a === b) continue;
      const profitable = COMMODITIES.some((c) => {
        const margin = getPrice(seed, day + 1, b, c.id) - getPrice(seed, day, a, c.id);
        return MARKET_DEPTH * margin - fuelCost(a, b) * REFUEL_PRICE - dockingFee(b) > 0;
      });
      if (profitable) count++;
    }
  }
  return count;
}

export interface ArchetypeSummary {
  kind: Archetype;
  audited: number;
  lost: number;
  retired: number;
  peakSum: number;
  scoreSum: number;
  netWorthSum: number;
}

/** Aggregate sweep outcomes per archetype — the balance gates' one shared shape. */
export function sweepSummary(seeds: readonly number[]): ArchetypeSummary[] {
  return (["cautious", "balanced", "greedy"] as Archetype[]).map((kind) => {
    const sum: ArchetypeSummary = {
      kind,
      audited: 0,
      lost: 0,
      retired: 0,
      peakSum: 0,
      scoreSum: 0,
      netWorthSum: 0,
    };
    for (const seed of seeds) {
      const r = runArchetype(kind, seed);
      sum.peakSum += r.peakNetWorth;
      sum.scoreSum += r.score;
      sum.netWorthSum += r.netWorthAtEnd;
      if (r.status === "audited") sum.audited++;
      else if (r.status === "lost") sum.lost++;
      else sum.retired++;
    }
    return sum;
  });
}
