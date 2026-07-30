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
  retire,
} from "./engine/game";
import { CommodityId, GameEvent, GameState, NodeId } from "./engine/types";
import { render } from "./ui/render";
import { copyShare, formatDateLabel, utcDateKey, runNumber, runStrip } from "./ui/share";
import {
  loadSave,
  persist,
  recordRunEnd,
  labelForDay,
  emptySave,
  loadSnapshot,
  persistSnapshot,
  clearSnapshot,
} from "./ui/storage";
import { NODES } from "./engine/world";
import { RUN_LENGTH } from "./engine/run-end";
import { endHeadline, type RunMeta } from "./ui/screens";
import { BACKDROP_SVG } from "./ui/art";

const app = document.querySelector<HTMLDivElement>("#app")!;
// Static decoration, injected once — deliberately outside the paint() cycle.
document.querySelector<HTMLDivElement>("#backdrop")!.innerHTML = BACKDROP_SVG;

// One place ties the seed and the display date to a single instant, so they cannot
// desync: the run stamps its own UTC day into GameState (see createGame), and the
// header/share date derive from that stamp rather than a hand-synced shadow variable.
function bootDailyGame(): GameState {
  const boot = new Date();
  return createGame(dailySeed(boot), boot.toISOString());
}

/** Display date for a run, from the UTC day stamped into its state ("" for seed-only runs). */
function dateLabelOf(s: GameState): string {
  return s.bootDate ? formatDateLabel(new Date(s.bootDate)) : "";
}

let save = loadSave() ?? emptySave();
let recorded = false;
let lastDebrief: RunMeta["debrief"];
let runLabel: "The Daily" | "Practice" = "The Daily";

let state: GameState = bootDailyGame();
let pendingEvent: GameEvent | null = null;
// Log length captured just before a jump, so the station screen can surface every
// entry the jump produced (fee, interest, event outcome, deliveries) as a turn report.
let turnReport: string[] = [];
let logMarkBeforeJump = 0;
// Two-click retire confirm (see applyAction/click handler).
let retireArmed = false;
// Two-click restart confirm on the end screen.
let restartArmed = false;
// Last action dispatched, used to restore focus after the innerHTML re-render.
let lastAct: { act?: string; id?: string } = {};

function startNewRun() {
  state = bootDailyGame();
  pendingEvent = null;
  // Inert today (a jump always overwrites it before the only reader runs), but a stale
  // mark would otherwise be persisted into the new run's snapshot and mislead debugging.
  logMarkBeforeJump = 0;
  recorded = false;
  lastDebrief = undefined;
  runLabel = labelForDay(save, utcDateKey(state.bootDate));
}

/**
 * E0-5: rehydrate a same-day live run from the snapshot. Boot-only — a hit restores
 * the exact post-decision state (including a pending in-transit event), a miss/stale/
 * corrupt snapshot falls through to a fresh daily. Never called on "New run".
 */
function tryResume(): boolean {
  const snap = loadSnapshot(utcDateKey(new Date().toISOString()));
  if (!snap) return false;
  state = snap.state;
  pendingEvent = snap.pendingEvent;
  logMarkBeforeJump = snap.logMarkBeforeJump;
  runLabel = snap.label;
  recorded = false;
  lastDebrief = undefined;
  return true;
}

/**
 * E0-5: mirror the live run to storage after every settled action — always
 * post-decision by construction. An ended run clears the snapshot in the same tick
 * recordIfEnded banks it, so no finished run can ever rehydrate.
 */
function syncSnapshot(): void {
  if (state.status === "playing") {
    persistSnapshot({
      version: 1,
      dateKey: utcDateKey(state.bootDate),
      label: runLabel,
      state,
      pendingEvent,
      logMarkBeforeJump,
    });
  } else {
    clearSnapshot();
  }
}

if (!tryResume()) startNewRun();

function recordIfEnded() {
  if (!state.runEnd || recorded) return;
  const res = recordRunEnd(save, utcDateKey(state.bootDate), state.runEnd);
  save = res.save;
  persist(save);
  lastDebrief = {
    pbDelta: res.pbDelta,
    isNewPB: res.isNewPB,
    prevBest: res.prevBest,
    isFirstEver: res.isFirstEver,
  };
  recorded = true;
}

function buildMeta(): RunMeta {
  const today = save.days[utcDateKey(state.bootDate)];
  return {
    runNumber: runNumber(state.bootDate),
    runLabel,
    dateLabel: dateLabelOf(state),
    bootStats: {
      attemptsToday: today?.attempts ?? 0,
      bestToday: today?.bestScore ?? null,
      allTimePB: save.allTimePB,
    },
    debrief: state.runEnd ? lastDebrief : undefined,
  };
}

function titleFor(s: GameState): string {
  if (s.runEnd) return `${endHeadline(s.runEnd)} · Score ${s.runEnd.score} — Starlight Traders`;
  return `Day ${s.day}/${RUN_LENGTH} · ${NODES[s.location].name} — Starlight Traders`;
}

function restoreFocus() {
  const { act, id } = lastAct;
  if (!act) return;
  const sel = id ? `[data-act="${act}"][data-id="${id}"]` : `[data-act="${act}"]`;
  const el = app.querySelector<HTMLElement>(sel);
  const usable =
    el && el.getAttribute("aria-disabled") !== "true" && !(el as HTMLButtonElement).disabled;
  if (usable) el!.focus();
  else app.querySelector<HTMLElement>("h1")?.focus();
}

function paint() {
  render(app, {
    state,
    pendingEvent,
    turnReport,
    dateLabel: dateLabelOf(state),
    retireArmed,
    restartArmed,
    meta: buildMeta(),
  });
  document.title = titleFor(state);
  restoreFocus();
}

const RUN_LIFECYCLE_ACTIONS = new Set(["retire", "retireConfirm", "restart", "restartConfirm"]);

// "retireCancel"/"restartCancel" (the ✕) need no case here: the click handler
// disarms retireArmed/restartArmed for every other action, which re-renders unarmed.
function applyRunLifecycleAction(act: string): void {
  switch (act) {
    case "retire":
      retireArmed = true;
      break;
    case "retireConfirm":
      state = retire(state);
      break;
    case "restart":
      restartArmed = true;
      break;
    case "restartConfirm":
      startNewRun();
      break;
  }
}

function applyAction(act: string | undefined, id: string | undefined, qty: number) {
  if (act && RUN_LIFECYCLE_ACTIONS.has(act)) {
    applyRunLifecycleAction(act);
    return;
  }
  switch (act) {
    case "buy":
      state = buy(state, id as CommodityId, qty);
      break;
    case "sell":
      state = sell(state, id as CommodityId, qty);
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
  }
}

app.addEventListener("click", async (e) => {
  const btn = (e.target as HTMLElement).closest("button");
  if (!btn) return;
  if (btn.getAttribute("aria-disabled") === "true") return;
  const act = btn.dataset.act;
  const id = btn.dataset.id;
  // data-qty carries the exact clamped quantity computed by the renderer;
  // absent/garbage values fall back to 1 (Number("") → 0, Number("x") → NaN).
  const qty = Math.max(1, Math.floor(Number(btn.dataset.qty ?? "1")) || 1);

  // The turn report clears on any new action; it is re-populated when a jump settles.
  turnReport = [];
  if (act !== "retire") retireArmed = false;
  if (act !== "restart") restartArmed = false;
  lastAct = { act, id };

  if (act === "share") {
    if (state.runEnd) {
      await copyShare({
        dateLabel: dateLabelOf(state),
        score: state.runEnd.score,
        daysSurvived: state.runEnd.daysSurvived,
        runNumber: runNumber(state.bootDate),
        label: runLabel,
        strip: runStrip(state.dayHighlights, state.runEnd.daysSurvived, state.runEnd.status),
        endLabel: endHeadline(state.runEnd),
      });
    }
  } else {
    applyAction(act, id, qty);
    recordIfEnded();
    syncSnapshot();
  }
  paint();
});

try {
  paint();
} catch (err) {
  // The only place a structurally-valid but internally-corrupt snapshot's fallout can
  // land — discard it and reboot today's fresh daily instead of a blank screen. Logged
  // because, unlike the storage layer's expected quota/private-mode failures, reaching
  // here means something got past parseSnapshot: a real corruption or a render bug.
  console.warn("Discarded an unusable run snapshot; starting a fresh daily.", err);
  clearSnapshot();
  startNewRun();
  paint();
}
