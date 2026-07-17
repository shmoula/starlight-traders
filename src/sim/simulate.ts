// src/sim/simulate.ts
import { CommodityId, GameState, NodeId } from "../engine/types";
import { createGame, buy, sell, refuel, jump, resolveChoice, checkLoss } from "../engine/game";
import { NODE_IDS, fuelCost, getPrice } from "../engine/world";
import { score as scoreFn } from "../engine/economy";

export type Archetype = "cautious" | "balanced" | "greedy";

export interface SimResult {
  daysSurvived: number;
  peakNetWorth: number;
  score: number;
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

export function runArchetype(kind: Archetype, seed: number, maxDays: number): SimResult {
  let s = createGame(seed);
  const candidates: CommodityId[] =
    kind === "cautious"
      ? ["water"]
      : kind === "balanced"
        ? ["water", "parts"]
        : ["water", "parts", "luxury"];

  while (s.status === "playing" && s.day < maxDays) {
    // Top up fuel modestly each turn.
    s = refuel(s, 6);

    const pick = bestTrade(s, candidates);
    if (!pick) {
      s = checkLoss(s);
      if (s.status === "lost") break;
      // Cannot act — force a cheap jump to advance and accrue costs.
      const to = NODE_IDS.filter((n) => n !== s.location).sort(
        (a, b) => fuelCost(s.location, a) - fuelCost(s.location, b)
      )[0];
      const r = jump(s, to);
      if (r.event === null) break;
      s = resolveChoice(r.state, r.event, r.event.choices[0].id);
      continue;
    }

    // Buy as much of the chosen commodity as affordable/space allows.
    let qty = 0;
    while (true) {
      const next = buy(s, pick.id, 1);
      if (next === s) break;
      s = next;
      qty++;
      if (qty > s.cargoCapacity) break;
    }

    const r = jump(s, pick.to);
    if (r.event === null) {
      s = checkLoss(s);
      break;
    }
    // Cautious pays pirates; greedy flees to save credits. Take first salvage/derelict gamble for greedy.
    const choice = chooseEventOption(
      kind,
      r.event.choices.map((c) => c.id)
    );
    s = resolveChoice(r.state, r.event, choice);

    // Sell everything we can at the new location.
    (["water", "parts", "luxury"] as CommodityId[]).forEach((id) => {
      if (s.cargo[id] > 0) s = sell(s, id, s.cargo[id]);
    });
    s = checkLoss(s);
  }

  return {
    daysSurvived: s.day,
    peakNetWorth: s.peakNetWorth,
    score: scoreFn(s.peakNetWorth, s.day),
  };
}

function chooseEventOption(kind: Archetype, ids: string[]): string {
  if (ids.includes("pay") && kind === "cautious") return "pay";
  if (ids.includes("flee") && kind !== "cautious") return "flee";
  if (ids.includes("collect")) return "collect";
  if (ids.includes("board") && kind === "greedy") return "board";
  if (ids.includes("comply")) return "comply";
  return ids[0];
}
