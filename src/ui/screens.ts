// src/ui/screens.ts
import { GameEvent, GameState } from "../engine/types";
import { COMMODITIES, NODES, NODE_IDS, commodityName, fuelCost, getPrice } from "../engine/world";
import { REFUEL_PRICE, REPAIR_PRICE, cargoUsed, dockingFee, netWorth } from "../engine/economy";
import { missionsHere } from "../engine/game";

export type Action =
  | { type: "buy"; id: string; qty: number }
  | { type: "sell"; id: string; qty: number }
  | { type: "refuel"; units: number }
  | { type: "repair"; points: number }
  | { type: "payDebt"; amount: number }
  | { type: "acceptMission"; missionId: string }
  | { type: "jump"; to: string }
  | { type: "deliver" }
  | { type: "resolve"; choiceId: string }
  | { type: "restart" };

const cr = (n: number) => `${n.toLocaleString()}cr`;

type Tone = "good" | "bad" | "neutral";

/**
 * Classify a log line so the UI can color it by outcome. Signals are drawn from the
 * fixed set of messages the engine emits (see game.ts); anything unrecognized stays
 * neutral, so a new message never renders as a false win or loss.
 */
function toneOf(msg: string): Tone {
  if (/trap|damage|seized|expired|burned|Bribed|Paid pirates|Loan interest|Stranded/i.test(msg)) {
    return "bad";
  }
  if (/held \d|Salvaged|Delivery complete|Paid down/i.test(msg)) {
    return "good";
  }
  return "neutral";
}

const TONE_ICON: Record<Tone, string> = { good: "✓", bad: "✗", neutral: "›" };

export function stationScreen(s: GameState, turnReport: string[] = []): string {
  const node = NODES[s.location];
  const report = turnReport.length
    ? `<div class="turn-report" role="status" aria-live="polite">
      <h2 class="turn-report__title">Since your last jump</h2>
      ${turnReport
        .map((l) => {
          const t = toneOf(l);
          return `<div class="tr-line tr-${t}"><span class="tr-icon" aria-hidden="true">${TONE_ICON[t]}</span><span>${l}</span></div>`;
        })
        .join("")}
    </div>`
    : "";
  const market = COMMODITIES.map((c) => {
    const price = getPrice(s.seed, s.day, s.location, c.id);
    const cantAfford = price > s.credits;
    const holdFull = cargoUsed(s.cargo) + 1 > s.cargoCapacity;
    const buyDisabled = cantAfford || holdFull;
    const buyTitle = cantAfford ? "Not enough credits" : "Cargo hold full";
    const sellDisabled = s.cargo[c.id] < 1;
    return `<tr>
      <th scope="row">${c.name}</th><td>${cr(price)}</td><td>${s.cargo[c.id]}</td>
      <td>
        <button data-act="buy" data-id="${c.id}" aria-label="Buy 1 ${c.name}"${buyDisabled ? ` disabled title="${buyTitle}"` : ""}>Buy 1</button>
        <button data-act="sell" data-id="${c.id}" aria-label="Sell 1 ${c.name}"${sellDisabled ? ` disabled title="None in hold"` : ""}>Sell 1</button>
      </td></tr>`;
  }).join("");

  const cheapestJump = Math.min(
    ...NODE_IDS.filter((n) => n !== s.location).map((n) => fuelCost(s.location, n))
  );
  const fuelClass =
    s.fuel < cheapestJump ? "stat-critical" : s.fuel < cheapestJump * 2 ? "stat-warn" : "";

  const acceptedIds = new Set(s.activeMissions.map((m) => m.id));
  const missions = missionsHere(s)
    .map((m) => {
      const action = acceptedIds.has(m.id)
        ? `<span class="accepted">✓ Accepted</span>`
        : `<button data-act="accept" data-id="${m.id}" aria-label="Accept contract: deliver ${m.qty} ${commodityName(m.commodity)} to ${NODES[m.destination].name}">Accept</button>`;
      return `<li>Deliver ${m.qty} ${commodityName(m.commodity)} → ${NODES[m.destination].name} by day ${m.deadlineDay} · reward ${cr(m.reward)}
      ${action}</li>`;
    })
    .join("");

  const active = s.activeMissions
    .map((m) => {
      const have = s.cargo[m.commodity];
      const ready = have >= m.qty;
      const expired = s.day > m.deadlineDay;
      const atDestination = s.location === m.destination;
      const canReach = atDestination || s.fuel >= fuelCost(s.location, m.destination);
      const jumpHintId = `jump-hint-${m.id}`;
      const jumpBtn = canReach
        ? `<button class="jump-link" data-act="jump" data-id="${m.destination}" aria-label="Jump to ${NODES[m.destination].name} to deliver">jump to ${NODES[m.destination].name}</button>`
        : `<button class="jump-link" data-act="jump" data-id="${m.destination}" aria-label="Jump to ${NODES[m.destination].name} to deliver" aria-disabled="true" aria-describedby="${jumpHintId}">jump to ${NODES[m.destination].name}</button> <span id="${jumpHintId}" class="bad">(not enough fuel to jump)</span>`;
      const readyBtn = atDestination
        ? `<button class="jump-link" data-act="deliver" aria-label="Deliver to ${NODES[m.destination].name}">deliver</button>`
        : jumpBtn;
      const hint = expired
        ? `<span class="bad">✗ deadline passed</span>`
        : ready
          ? `<span class="good">✓ carrying ${have}/${m.qty} — ready, ${readyBtn}</span>`
          : `<span class="bad">✗ carrying ${have}/${m.qty} — buy ${m.qty - have} more ${commodityName(m.commodity)}</span>`;
      return `<li>${m.qty} ${commodityName(m.commodity)} → ${NODES[m.destination].name} by day ${m.deadlineDay} · reward ${cr(m.reward)}<br>${hint}</li>`;
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

  const logEntries = s.log
    .slice(-8)
    .map((l) => `<div class="log-line tr-${toneOf(l)}">${l}</div>`)
    .join("");

  return `
    <header>
      <h1>${node.name} · Day ${s.day}</h1>
      <div class="stats">
        <span>💰 ${cr(s.credits)}</span>
        <span>🏦 debt ${cr(s.debt)}</span>
        <span${fuelClass ? ` class="${fuelClass}"` : ""}>⛽ ${s.fuel}/${s.fuelCapacity}</span>
        <span>🛡️ ${s.hull}/${s.hullMax}</span>
        <span>📦 ${s.cargo.water + s.cargo.parts + s.cargo.luxury}/${s.cargoCapacity}</span>
        <span>📈 net ${cr(netWorth(s))}</span>
      </div>
    </header>
    ${report}
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
      <button data-act="refuel"${
        s.fuel >= s.fuelCapacity
          ? ` disabled title="Fuel tank full"`
          : s.credits < REFUEL_PRICE
            ? ` disabled title="Not enough credits"`
            : ""
      }>Refuel +5 (${cr(40)})</button>
      <button data-act="repair"${
        s.hull >= s.hullMax
          ? ` disabled title="Hull fully repaired"`
          : s.credits < REPAIR_PRICE
            ? ` disabled title="Not enough credits"`
            : ""
      }>Repair +20 (${cr(120)})</button>
      <button data-act="payDebt"${
        s.debt <= 0
          ? ` disabled title="No debt to pay"`
          : s.credits <= 0
            ? ` disabled title="No credits to pay with"`
            : ""
      }>Pay 200 debt</button>
      <span class="fee">Docking fee here: ${cr(dockingFee(s.location))}</span>
    </section>
    <section><h2>Navigate</h2><div class="routes">${routes}</div></section>
    <section class="log" aria-label="Ship's log">
      <h2>Ship's Log</h2>
      <div class="log-entries">${logEntries}</div>
    </section>
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
