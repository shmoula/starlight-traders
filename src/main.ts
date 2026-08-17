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
import { CommodityId, GameEvent, GameState, LogEntry, NodeId } from "./engine/types";
import { render } from "./ui/render";
import { copyShare, formatDateLabel, utcDateKey, runNumber, runStrip } from "./ui/share";
import {
  loadSave,
  persist,
  recordRunEnd,
  recordFeats,
  labelForDay,
  emptySave,
  loadSnapshot,
  persistSnapshot,
  clearSnapshot,
  calendarCells,
} from "./ui/storage";
import { FEATS, earnedFeats, featDef } from "./engine/feats";
import { dailyModifier } from "./engine/modifiers";
import { NODES } from "./engine/world";
import { RUN_LENGTH } from "./engine/run-end";
import { endHeadline, type RunMeta, type ShareStatus } from "./ui/screens";
import { BACKDROP_SVG } from "./ui/art";
import { Pulses, Vitals, vitalPulses, vitalsOf } from "./ui/pulse";

const app = document.querySelector<HTMLDivElement>("#app")!;
// Static decoration, injected once — deliberately outside the paint() cycle.
document.querySelector<HTMLDivElement>("#backdrop")!.innerHTML = BACKDROP_SVG;
const toastLayer = document.getElementById("toasts");

/** P3-2: float the credit delta that just landed. A missing layer degrades to no
 *  toast — never a throw, since this is decoration on top of a rendered truth. */
function showCreditToast(prev: Vitals | null, next: Vitals): void {
  if (!toastLayer || !prev) return;
  const delta = next.credits - prev.credits;
  if (delta === 0) return;
  const el = document.createElement("div");
  el.className = `st-toast st-toast--${delta > 0 ? "up" : "down"} st-num`;
  el.textContent = `${delta > 0 ? "+" : "−"}${Math.abs(delta).toLocaleString()}cr`;
  el.addEventListener("animationend", () => el.remove());
  window.setTimeout(() => el.remove(), 2000);
  toastLayer.appendChild(el);
}

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
let turnReport: LogEntry[] = [];
let logMarkBeforeJump = 0;
// Two-click retire confirm (see applyAction/click handler).
let retireArmed = false;
// Two-click restart confirm on the end screen.
let restartArmed = false;
// Dock-talk marquee pause — pure view state, never snapshotted.
let tickerPaused = false;
// Result of the last clipboard attempt, shown on the share button for ~2s (P2-4).
let shareStatus: ShareStatus = "idle";
let shareResetTimer: number | null = null;
// Last action dispatched, used to restore focus after the innerHTML re-render.
let lastAct: { act?: string; id?: string } = {};
// Whether the live run came out of storage rather than being created here. Gates
// safePaint's recovery: only a restored run has a snapshot worth blaming.
let resumedFromSnapshot = false;
// Vitals as of the last paint, so paint() can diff this turn's movement into a
// one-shot pulse (P3-2). null before the first paint — nothing has moved yet.
// Also reset to null by startNewRun(), since an in-page restart reuses this module
// scope rather than getting a fresh one.
let prevVitals: Vitals | null = null;

function startNewRun() {
  state = bootDailyGame();
  pendingEvent = null;
  // Inert today (a jump always overwrites it before the only reader runs), but a stale
  // mark would otherwise be persisted into the new run's snapshot and mislead debugging.
  logMarkBeforeJump = 0;
  recorded = false;
  lastDebrief = undefined;
  resumedFromSnapshot = false;
  // This is an in-page restart, not a reload — module scope survives it, so prevVitals
  // still holds the previous run's last-painted vitals. Without clearing it, the new
  // run's fixed starting numbers would diff against the old run's end-state and fire
  // spurious pulses on the very first paint (P3-2).
  prevVitals = null;
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
  resumedFromSnapshot = true;
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
      version: 6,
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
  const dateKey = utcDateKey(state.bootDate);
  const res = recordRunEnd(save, dateKey, state.runEnd);
  // recordFeats judges the ledger feats (first-flight/regular) against the save that
  // already includes THIS run, so it must run on res.save, not the pre-run save.
  const feats = recordFeats(res.save, dateKey, earnedFeats(state));
  save = feats.save;
  persist(save);
  lastDebrief = {
    pbDelta: res.pbDelta,
    isNewPB: res.isNewPB,
    prevBest: res.prevBest,
    isFirstEver: res.isFirstEver,
    newFeats: feats.newFeats,
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
    logbook:
      state.day === 1
        ? {
            cells: calendarCells(save, utcDateKey(state.bootDate)),
            feats: FEATS.map((def) => ({ def, earned: save.feats[def.id] !== undefined })),
          }
        : undefined,
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
  const nextVitals = vitalsOf(state);
  const pulses: Pulses = vitalPulses(prevVitals, nextVitals);
  render(app, {
    state,
    pendingEvent,
    turnReport,
    dateLabel: dateLabelOf(state),
    retireArmed,
    restartArmed,
    meta: buildMeta(),
    tickerPaused,
    pulses,
    shareStatus,
  });
  document.title = titleFor(state);
  restoreFocus();
  showCreditToast(prevVitals, nextVitals);
  prevVitals = nextVitals;
}

/**
 * Render, treating a throw as "this run is unrenderable": discard its snapshot, reboot
 * today's fresh daily, and paint that rather than leave a dead screen. Wraps *every*
 * paint, not just the first — parseSnapshot's shape check is deliberately shallow, so a
 * snapshot missing a field that only some later screen reads would otherwise sail
 * through boot and throw mid-run, with no reload ever recovering it. Logged because,
 * unlike storage's expected quota/private-mode failures, reaching here means real
 * corruption. A throw from the recovery paint propagates — by then there is nothing
 * left to fall back to.
 *
 * A run this process created is correct by construction, so a throw painting it is a
 * render bug: rethrow it rather than launder it into a snapshot warning and a pointless
 * reset.
 */
function safePaint(): void {
  try {
    paint();
  } catch (err) {
    if (!resumedFromSnapshot) throw err;
    console.warn("Discarded an unusable run snapshot; starting a fresh daily.", err);
    clearSnapshot();
    startNewRun();
    paint();
  }
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
  // Buttons, plus any element carrying data-act — the star map's SVG nodes (E2-3c).
  const btn = (e.target as Element).closest<HTMLElement | SVGElement>("button, [data-act]");
  if (!btn) return;
  if (btn.getAttribute("aria-disabled") === "true") return;
  const act = btn.dataset.act;
  const id = btn.dataset.id;
  // data-qty carries the exact clamped quantity computed by the renderer;
  // absent/garbage values fall back to 1 (Number("") → 0, Number("x") → NaN).
  const qty = Math.max(1, Math.floor(Number(btn.dataset.qty ?? "1")) || 1);

  // Ticker pause is pure view state: no engine action, no snapshot, keep the turn report.
  // lastAct points at the pause button so focus restores to it after the re-render.
  if (act === "tickerPause") {
    lastAct = { act };
    tickerPaused = !tickerPaused;
    safePaint();
    return;
  }

  // The turn report clears on any new action; it is re-populated when a jump settles.
  turnReport = [];
  if (act !== "retire") retireArmed = false;
  if (act !== "restart") restartArmed = false;
  lastAct = { act, id };

  if (act === "share") {
    if (state.runEnd) {
      const ok = await copyShare({
        dateLabel: dateLabelOf(state),
        score: state.runEnd.score,
        daysSurvived: state.runEnd.daysSurvived,
        runNumber: runNumber(state.bootDate),
        label: runLabel,
        strip: runStrip(state.dayHighlights, state.runEnd.daysSurvived, state.runEnd.status),
        endLabel: endHeadline(state.runEnd),
        featNames: (lastDebrief?.newFeats ?? []).map((id) => featDef(id).name),
        modifier: `${dailyModifier(state.seed).glyph} ${dailyModifier(state.seed).name}`,
      });
      shareStatus = ok ? "ok" : "fail";
      if (shareResetTimer !== null) window.clearTimeout(shareResetTimer);
      shareResetTimer = window.setTimeout(() => {
        shareStatus = "idle";
        shareResetTimer = null;
        safePaint();
      }, 2000);
    }
  } else {
    applyAction(act, id, qty);
    recordIfEnded();
    syncSnapshot();
  }
  safePaint();
});

safePaint();
