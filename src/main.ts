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
  deliver,
  resolveChoice,
  missionsHere,
} from "./engine/game";
import { score as scoreFn } from "./engine/economy";
import { CommodityId, GameEvent, GameState, NodeId } from "./engine/types";
import { render } from "./ui/render";
import { copyShare } from "./ui/share";
import { BACKDROP_SVG } from "./ui/art";

const app = document.querySelector<HTMLDivElement>("#app")!;
// Static decoration, injected once — deliberately outside the paint() cycle.
document.querySelector<HTMLDivElement>("#backdrop")!.innerHTML = BACKDROP_SVG;

let state: GameState = createGame(dailySeed(new Date()));
let pendingEvent: GameEvent | null = null;
// Log length captured just before a jump, so the station screen can surface every
// entry the jump produced (fee, interest, event outcome, deliveries) as a turn report.
let turnReport: string[] = [];
let logMarkBeforeJump = 0;

function paint() {
  render(app, { state, pendingEvent, turnReport });
}

function applyAction(act: string | undefined, id: string | undefined) {
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
      // Mark the log so the eventual turn report captures everything from here on.
      logMarkBeforeJump = state.log.length;
      const r = jump(state, id as NodeId);
      state = r.state;
      pendingEvent = r.event;
      // Deliveries settle in `arrive`, after the in-transit event is resolved.
      break;
    }
    case "deliver":
      state = deliver(state);
      break;
    case "resolve": {
      if (pendingEvent) state = resolveChoice(state, pendingEvent, id!);
      pendingEvent = null;
      const a = arrive(state); // settle deliveries against post-event cargo
      state = a.state;
      // Surface the whole jump: fee, interest, event outcome, and any deliveries.
      turnReport = state.log.slice(logMarkBeforeJump);
      break;
    }
    case "restart": {
      state = createGame(dailySeed(new Date()));
      pendingEvent = null;
      break;
    }
  }
}

app.addEventListener("click", async (e) => {
  const btn = (e.target as HTMLElement).closest("button");
  if (!btn) return;
  if (btn.getAttribute("aria-disabled") === "true") return;
  const act = btn.dataset.act;
  const id = btn.dataset.id;

  // The turn report clears on any new action; it is re-populated when a jump settles.
  turnReport = [];

  if (act === "share") {
    await copyShare({
      seed: state.seed,
      score: scoreFn(state.peakNetWorth, state.day),
      daysSurvived: state.day,
    });
  } else {
    applyAction(act, id);
  }
  paint();
});

paint();
