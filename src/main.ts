// src/main.ts
import { dailySeed } from "./engine/rng";
import {
  createGame,
  buy,
  sell,
  refuel,
  repair,
  payDebt,
  acceptMission,
  jump,
  arrive,
  resolveChoice,
  missionsHere,
} from "./engine/game";
import { score as scoreFn } from "./engine/economy";
import { NODES } from "./engine/world";
import { CommodityId, GameEvent, GameState, Mission, NodeId } from "./engine/types";
import { render } from "./ui/render";
import { copyShare } from "./ui/share";

const app = document.querySelector<HTMLDivElement>("#app")!;

let state: GameState = createGame(dailySeed(new Date()));
let pendingEvent: GameEvent | null = null;
let flash: string[] = [];

function paint() {
  render(app, { state, pendingEvent, flash });
}

function arrivalFlash(delivered: Mission[], expired: Mission[]): string[] {
  return [
    ...delivered.map(
      (m) =>
        `✓ Contract fulfilled: ${m.qty} ${m.commodity} → ${NODES[m.destination].name} · +${m.reward.toLocaleString()}cr`
    ),
    ...expired.map(
      (m) => `✗ Contract expired: ${m.qty} ${m.commodity} → ${NODES[m.destination].name}`
    ),
  ];
}

app.addEventListener("click", async (e) => {
  const btn = (e.target as HTMLElement).closest("button");
  if (!btn) return;
  const act = btn.dataset.act;
  const id = btn.dataset.id;

  // Flash clears on any new action; it is re-populated when an arrival settles.
  flash = [];

  switch (act) {
    case "buy":
      state = buy(state, id as CommodityId, 1);
      break;
    case "sell":
      state = sell(state, id as CommodityId, 1);
      break;
    case "refuel":
      state = refuel(state, 5);
      break;
    case "repair":
      state = repair(state, 20);
      break;
    case "payDebt":
      state = payDebt(state, 200);
      break;
    case "accept": {
      const m = missionsHere(state).find((x) => x.id === id);
      if (m) state = acceptMission(state, m);
      break;
    }
    case "jump": {
      const r = jump(state, id as NodeId);
      state = r.state;
      pendingEvent = r.event;
      // Deliveries settle in `arrive`, after the in-transit event is resolved.
      break;
    }
    case "resolve": {
      if (pendingEvent) state = resolveChoice(state, pendingEvent, id!);
      pendingEvent = null;
      const a = arrive(state); // settle deliveries against post-event cargo
      state = a.state;
      flash = arrivalFlash(a.delivered, a.expired);
      break;
    }
    case "share": {
      await copyShare({
        seed: state.seed,
        score: scoreFn(state.peakNetWorth, state.day),
        daysSurvived: state.day,
      });
      break;
    }
    case "restart": {
      state = createGame(dailySeed(new Date()));
      pendingEvent = null;
      break;
    }
  }
  paint();
});

paint();
