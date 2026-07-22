// src/ui/render.ts
import { GameEvent, GameState } from "../engine/types";
import { eventScreen, runEndScreen, stationScreen } from "./screens";

export interface ViewModel {
  state: GameState;
  pendingEvent: GameEvent | null;
  /** Log entries generated during the most recent jump, surfaced as a turn report. */
  turnReport: string[];
  /** UTC date label ("Jul 20") naming today's shared seed. */
  dateLabel: string;
  /** Two-click retire confirm armed (see main.ts). */
  retireArmed: boolean;
}

export function render(root: HTMLElement, vm: ViewModel): void {
  if (vm.state.runEnd) {
    root.innerHTML = runEndScreen(vm.state, vm.state.runEnd);
  } else if (vm.pendingEvent) {
    root.innerHTML = eventScreen(vm.state, vm.pendingEvent);
  } else {
    root.innerHTML = stationScreen(vm.state, vm.turnReport, vm.dateLabel, vm.retireArmed);
  }
}
