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
import { NODE_IDS, fuelCost, getPrice } from "../engine/world";

export type Archetype = "cautious" | "balanced" | "greedy";

export interface SimResult {
  daysSurvived: number;
  peakNetWorth: number;
  score: number;
  status: GameState["status"];
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

/** One full bounded run; the engine ends it by audit, stranding, or hull breach. */
export function runArchetype(kind: Archetype, seed: number): SimResult {
  let s = createGame(seed);
  const candidates: CommodityId[] =
    kind === "cautious"
      ? ["water"]
      : kind === "balanced"
        ? ["water", "parts"]
        : ["water", "parts", "luxury"];

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
      s = resolveChoice(r.state, r.event, r.event.choices[0].id);
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

  return {
    daysSurvived: s.runEnd?.daysSurvived ?? Math.min(s.day, 12),
    peakNetWorth: s.peakNetWorth,
    score: s.runEnd?.score ?? 0,
    status: s.status,
  };
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
