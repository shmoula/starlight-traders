// src/main.ts
import { dailySeed } from "./engine/rng";
import {
  createGame, buy, sell, refuel, repair, payDebt, acceptMission, jump, resolveChoice, missionsHere,
} from "./engine/game";
import { score as scoreFn } from "./engine/economy";
import { CommodityId, GameEvent, GameState, NodeId } from "./engine/types";
import { render } from "./ui/render";
import { copyShare } from "./ui/share";

const app = document.querySelector<HTMLDivElement>("#app")!;

let state: GameState = createGame(dailySeed(new Date()));
let pendingEvent: GameEvent | null = null;

function paint() {
  render(app, { state, pendingEvent });
}

app.addEventListener("click", async (e) => {
  const btn = (e.target as HTMLElement).closest("button");
  if (!btn) return;
  const act = btn.dataset.act;
  const id = btn.dataset.id;

  switch (act) {
    case "buy": state = buy(state, id as CommodityId, 1); break;
    case "sell": state = sell(state, id as CommodityId, 1); break;
    case "refuel": state = refuel(state, 5); break;
    case "repair": state = repair(state, 20); break;
    case "payDebt": state = payDebt(state, 200); break;
    case "accept": {
      const m = missionsHere(state).find((x) => x.id === id);
      if (m) state = acceptMission(state, m);
      break;
    }
    case "jump": {
      const r = jump(state, id as NodeId);
      state = r.state;
      pendingEvent = r.event;
      break;
    }
    case "resolve": {
      if (pendingEvent) state = resolveChoice(state, pendingEvent, id!);
      pendingEvent = null;
      break;
    }
    case "share": {
      await copyShare({ seed: state.seed, score: scoreFn(state.peakNetWorth, state.day), daysSurvived: state.day });
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
