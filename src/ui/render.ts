// src/ui/render.ts
import { GameEvent, GameState } from "../engine/types";
import { eventScreen, runEndScreen, stationScreen, RunMeta } from "./screens";

export interface ViewModel {
  state: GameState;
  pendingEvent: GameEvent | null;
  /** Log entries generated during the most recent jump, surfaced as a turn report. */
  turnReport: string[];
  /** UTC date label ("Jul 20") naming today's shared seed. */
  dateLabel: string;
  /** Two-click retire confirm armed (see main.ts). */
  retireArmed: boolean;
  /** Two-click restart confirm armed on the end screen (see main.ts). */
  restartArmed: boolean;
  /** Run identity + boot stats + debrief facts (see main.ts buildMeta). */
  meta: RunMeta;
}

export function render(root: HTMLElement, vm: ViewModel): void {
  if (vm.state.runEnd) {
    root.innerHTML = runEndScreen(vm.state, vm.state.runEnd, vm.restartArmed, vm.meta);
  } else if (vm.pendingEvent) {
    root.innerHTML = eventScreen(vm.state, vm.pendingEvent);
  } else {
    root.innerHTML = stationScreen(vm.state, vm.turnReport, vm.dateLabel, vm.retireArmed, vm.meta);
  }
}
