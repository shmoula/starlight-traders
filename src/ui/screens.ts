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

export function stationScreen(s: GameState, flash: string[] = []): string {
  const node = NODES[s.location];
  const flashBanner = flash.length
    ? `<div class="flash">${flash.map((f) => `<div>${f}</div>`).join("")}</div>`
    : "";
  const market = COMMODITIES.map((c) => {
    const price = getPrice(s.seed, s.day, s.location, c.id);
    return `<tr>
      <th scope="row">${c.name}</th><td>${cr(price)}</td><td>${s.cargo[c.id]}</td>
      <td>
        <button data-act="buy" data-id="${c.id}">Buy 1</button>
        <button data-act="sell" data-id="${c.id}">Sell 1</button>
      </td></tr>`;
  }).join("");

  const acceptedIds = new Set(s.activeMissions.map((m) => m.id));
  const missions = missionsHere(s)
    .map((m) => {
      const action = acceptedIds.has(m.id)
        ? `<span class="accepted">✓ Accepted</span>`
        : `<button data-act="accept" data-id="${m.id}">Accept</button>`;
      return `<li>Deliver ${m.qty} ${m.commodity} → ${NODES[m.destination].name} by day ${m.deadlineDay} · reward ${cr(m.reward)}
      ${action}</li>`;
    })
    .join("");

  const active = s.activeMissions
    .map((m) => {
      const have = s.cargo[m.commodity];
      const ready = have >= m.qty;
      const expired = s.day > m.deadlineDay;
      const hint = expired
        ? `<span class="bad">✗ deadline passed</span>`
        : ready
          ? `<span class="good">✓ carrying ${have}/${m.qty} — ready, jump to ${NODES[m.destination].name}</span>`
          : `<span class="bad">✗ carrying ${have}/${m.qty} — buy ${m.qty - have} more ${m.commodity}</span>`;
      return `<li>${m.qty} ${m.commodity} → ${NODES[m.destination].name} by day ${m.deadlineDay} · reward ${cr(m.reward)}<br>${hint}</li>`;
    })
    .join("");

  const routes = NODE_IDS.filter((n) => n !== s.location)
    .map(
      (n) =>
        `<button data-act="jump" data-id="${n}" ${s.fuel < fuelCost(s.location, n) ? "disabled" : ""}>
      Jump to ${NODES[n].name} (${fuelCost(s.location, n)}⛽, danger ${Math.round(NODES[n].danger * 100)}%)
    </button>`
    )
    .join("");

  return `
    ${flashBanner}
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
    <section><h2>Market</h2><table>
      <thead>
        <tr>
          <th scope="col">Commodity</th>
          <th scope="col">Price</th>
          <th scope="col">Held</th>
          <th scope="col">Trade</th>
        </tr>
      </thead>
      <tbody>${market}</tbody>
    </table></section>
    <section><h2>Contracts</h2><ul>${missions || "<li>None today.</li>"}</ul></section>
    <section><h2>Active Contracts</h2>
      <p class="hint">Deliveries auto-complete when you arrive carrying the goods.</p>
      <ul>${active || "<li>None accepted. Accept a contract, buy its cargo, then jump to the destination.</li>"}</ul>
    </section>
    <section class="services">
      <button data-act="refuel">Refuel +5 (${cr(40)})</button>
      <button data-act="repair">Repair +20 (${cr(120)})</button>
      <button data-act="payDebt">Pay 200 debt</button>
      <span class="fee">Docking fee here: ${cr(dockingFee(s.location))}</span>
    </section>
    <section><h2>Navigate</h2><div class="routes">${routes}</div></section>
    <aside class="log">${s.log
      .slice(-6)
      .map((l) => `<div>${l}</div>`)
      .join("")}</aside>
  `;
}

export function eventScreen(e: GameEvent): string {
  const choices = e.choices
    .map((c) => `<button data-act="resolve" data-id="${c.id}">${c.label}</button>`)
    .join("");
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
