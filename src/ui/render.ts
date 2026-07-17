// src/ui/render.ts
import { GameEvent, GameState } from "../engine/types";
import { score as scoreFn } from "../engine/economy";
import { eventScreen, runEndScreen, stationScreen } from "./screens";

export interface ViewModel {
  state: GameState;
  pendingEvent: GameEvent | null;
  /** Log entries generated during the most recent jump, surfaced as a turn report. */
  turnReport: string[];
}

export function render(root: HTMLElement, vm: ViewModel): void {
  if (vm.state.status === "lost") {
    root.innerHTML = runEndScreen(vm.state, scoreFn(vm.state.peakNetWorth, vm.state.day));
  } else if (vm.pendingEvent) {
    root.innerHTML = eventScreen(vm.pendingEvent);
  } else {
    root.innerHTML = stationScreen(vm.state, vm.turnReport);
  }
}
