// src/ui/screens.ts
import { GameEvent, GameState } from "../engine/types";
import { COMMODITIES, NODES, NODE_IDS, fuelCost, getPrice } from "../engine/world";
import { dockingFee, netWorth } from "../engine/economy";
import { missionsHere } from "../engine/game";

export type Action =
  | { type: "buy"; id: string; qty: number }
  | { type: "sell"; id: string; qty: number }
  | { type: "refuel"; units: number }
  | { type: "repair"; points: number }
  | { type: "payDebt"; amount: number }
  | { type: "acceptMission"; missionId: string }
  | { type: "jump"; to: string }
  | { type: "resolve"; choiceId: string }
  | { type: "restart" };

const cr = (n: number) => `${n.toLocaleString()}cr`;

export function stationScreen(s: GameState): string {
  const node = NODES[s.location];
  const market = COMMODITIES.map((c) => {
    const price = getPrice(s.seed, s.day, s.location, c.id);
    return `<tr>
      <td>${c.name}</td><td>${cr(price)}</td><td>${s.cargo[c.id]}</td>
      <td>
        <button data-act="buy" data-id="${c.id}">Buy 1</button>
        <button data-act="sell" data-id="${c.id}">Sell 1</button>
      </td></tr>`;
  }).join("");

  const missions = missionsHere(s).map((m) =>
    `<li>Deliver ${m.qty} ${m.commodity} → ${NODES[m.destination].name} by day ${m.deadlineDay} · reward ${cr(m.reward)}
      <button data-act="accept" data-id="${m.id}">Accept</button></li>`,
  ).join("");

  const routes = NODE_IDS.filter((n) => n !== s.location).map((n) =>
    `<button data-act="jump" data-id="${n}" ${s.fuel < fuelCost(s.location, n) ? "disabled" : ""}>
      Jump to ${NODES[n].name} (${fuelCost(s.location, n)}⛽, danger ${Math.round(NODES[n].danger * 100)}%)
    </button>`,
  ).join("");

  return `
    <header>
      <h1>${node.name} · Day ${s.day}</h1>
      <div class="stats">
        <span>💰 ${cr(s.credits)}</span>
        <span>🏦 debt ${cr(s.debt)}</span>
        <span>⛽ ${s.fuel}/${s.fuelCapacity}</span>
        <span>🛡️ ${s.hull}/${s.hullMax}</span>
        <span>📦 ${s.cargo.water + s.cargo.parts + s.cargo.luxury}/${s.cargoCapacity}</span>
        <span>📈 net ${cr(netWorth(s))}</span>
      </div>
    </header>
    <section><h2>Market</h2><table>${market}</table></section>
    <section><h2>Contracts</h2><ul>${missions || "<li>None today.</li>"}</ul></section>
    <section class="services">
      <button data-act="refuel">Refuel +5 (${cr(40)})</button>
      <button data-act="repair">Repair +20 (${cr(120)})</button>
      <button data-act="payDebt">Pay 200 debt</button>
      <span class="fee">Docking fee here: ${cr(dockingFee(s.location))}</span>
    </section>
    <section><h2>Navigate</h2><div class="routes">${routes}</div></section>
    <aside class="log">${s.log.slice(-6).map((l) => `<div>${l}</div>`).join("")}</aside>
  `;
}

export function eventScreen(e: GameEvent): string {
  const choices = e.choices.map((c) =>
    `<button data-act="resolve" data-id="${c.id}">${c.label}</button>`,
  ).join("");
  return `<div class="event-card">
    <h2>${e.title}</h2><p>${e.description}</p><div class="choices">${choices}</div>
  </div>`;
}

export function runEndScreen(s: GameState, score: number): string {
  return `<div class="run-end">
    <h1>Run Over</h1>
    <p>You survived ${s.day} days.</p>
    <p class="score">Score: ${score.toLocaleString()}</p>
    <p>Seed #${s.seed}</p>
    <button data-act="share">Copy score card</button>
    <button data-act="restart">New run</button>
  </div>`;
}
