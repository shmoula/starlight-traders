// src/ui/render.ts
import { GameEvent, GameState, LogEntry } from "../engine/types";
import { eventScreen, runEndScreen, stationScreen, RunMeta, ShareStatus } from "./screens";
import { Pulses } from "./pulse";

export interface ViewModel {
  state: GameState;
  pendingEvent: GameEvent | null;
  /** Log entries generated during the most recent jump, surfaced as a turn report. */
  turnReport: LogEntry[];
  /** UTC date label ("Jul 20") naming today's shared seed. */
  dateLabel: string;
  /** Two-click retire confirm armed (see main.ts). */
  retireArmed: boolean;
  /** Two-click restart confirm armed on the end screen (see main.ts). */
  restartArmed: boolean;
  /** Run identity + boot stats + debrief facts (see main.ts buildMeta). */
  meta: RunMeta;
  /** Dock-talk marquee paused via the ticker toggle (pure view state, see main.ts). */
  tickerPaused: boolean;
  /** Which vitals moved since the last paint, and which way (P3-2). */
  pulses: Pulses;
  /** Result of the last clipboard attempt, shown on the share button for ~2s (P2-4). */
  shareStatus: ShareStatus;
}

export function render(root: HTMLElement, vm: ViewModel): void {
  if (vm.state.runEnd) {
    root.innerHTML = runEndScreen(
      vm.state,
      vm.state.runEnd,
      vm.restartArmed,
      vm.meta,
      vm.shareStatus
    );
  } else if (vm.pendingEvent) {
    root.innerHTML = eventScreen(vm.state, vm.pendingEvent, vm.pulses);
  } else {
    root.innerHTML = stationScreen(
      vm.state,
      vm.turnReport,
      vm.dateLabel,
      vm.retireArmed,
      vm.meta,
      vm.tickerPaused,
      vm.pulses
    );
  }
}
