// src/ui/screens.ts
import { GameEvent, GameState } from "../engine/types";
import { COMMODITIES, NODES, NODE_IDS, commodityName, fuelCost, getPrice } from "../engine/world";
import { REFUEL_PRICE, REPAIR_PRICE, cargoUsed, dockingFee, netWorth } from "../engine/economy";
import { missionsHere } from "../engine/game";
import { choiceStakes } from "../engine/preview";
import { COMMODITY_ACCENT, ORB_ART, fuelIcon, hullIcon, iconBox } from "./art";

const cr = (n: number) => `${n.toLocaleString()}cr`;

/** Renders ` disabled title="…"` for a control, or nothing when it is enabled. */
const disabledAttr = (disabled: boolean, title: string): string =>
  disabled ? ` disabled title="${title}"` : "";

/** Fuel cost of the cheapest jump away from the current location. */
function cheapestJumpCost(s: GameState): number {
  return Math.min(...NODE_IDS.filter((n) => n !== s.location).map((n) => fuelCost(s.location, n)));
}

/** Statbar/bar warning class shared by the station and event screens. */
function fuelWarnClass(s: GameState): string {
  const cheapest = cheapestJumpCost(s);
  return s.fuel < cheapest ? "stat-critical" : s.fuel < cheapest * 2 ? "stat-warn" : "";
}

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

function screenHead(s: GameState, dateLabel = ""): string {
  return `<header class="screen-head">
    <h1 class="st-screen-title">Starlight Traders</h1>
    <p class="screen-head__sub">${NODES[s.location].name} · Day ${s.day}${dateLabel ? ` · ${dateLabel}` : ""}</p>
  </header>`;
}

/**
 * At-a-glance vitals strip. On the station screen it duplicates panel data, so it
 * ships presentation-only (aria-hidden). On the event screen it is the ONLY vitals
 * surface, so callers there keep it exposed and always visible.
 */
function statbar(
  s: GameState,
  fuelClass: string,
  opts: { presentation?: boolean; extra?: string } = {}
): string {
  const { presentation = true, extra = "" } = opts;
  const creditsClass = s.credits < 0 ? " credits-negative" : "";
  return `<div class="st-statbar${extra ? ` ${extra}` : ""}"${presentation ? ' aria-hidden="true"' : ""}>
    <span class="st-statbar__chip st-statbar__chip--gold st-num${creditsClass}">${cr(s.credits)}</span>
    <span class="st-statbar__chip st-num${fuelClass ? ` ${fuelClass}` : ""}">${fuelIcon()}Fuel ${s.fuel}/${s.fuelCapacity}</span>
    <span class="st-statbar__chip st-num">${hullIcon()}Hull ${s.hull}/${s.hullMax}</span>
    <span class="st-statbar__chip st-num">Hold ${cargoUsed(s.cargo)}/${s.cargoCapacity}</span>
  </div>`;
}

/** Standard HUD module: header strip + padded body. `attrs` lands on the <section>. */
function panel(title: string, body: string, attrs = ""): string {
  return `<section class="st-panel"${attrs}>
    <header class="st-panel__header"><h2 class="st-panel__title">${title}</h2></header>
    <div class="st-panel__body">${body}</div>
  </section>`;
}

function logisticsPanel(s: GameState, fuelClass: string): string {
  const fuelPct = Math.round((s.fuel / s.fuelCapacity) * 100);
  const hullPct = Math.round((s.hull / s.hullMax) * 100);
  const barMod = fuelClass === "stat-critical" ? "st-bar--critical" : "st-bar--gold";
  // Mirror engine refuel(): it buys min(units, tankRoom, affordable) — the label
  // must promise exactly what the click delivers (B-1).
  const tankRoom = s.fuelCapacity - s.fuel;
  const affordable = Math.floor(s.credits / REFUEL_PRICE);
  const refuelUnits = Math.min(5, tankRoom, affordable);
  const refuelDisabled = refuelUnits <= 0;
  const refuelTitle = tankRoom <= 0 ? "Fuel tank full" : "Not enough credits";
  const shownUnits = refuelDisabled ? 5 : refuelUnits;
  const clampedByCredits = !refuelDisabled && affordable < Math.min(5, tankRoom);
  const refuelLabel = `Refuel +${shownUnits} (${cr(shownUnits * REFUEL_PRICE)})${clampedByCredits ? " — all you can afford" : ""}`;
  const hullFull = s.hull >= s.hullMax;
  const repairDisabled = hullFull || s.credits < REPAIR_PRICE;
  const repairTitle = hullFull ? "Hull fully repaired" : "Not enough credits";
  const noDebt = s.debt <= 0;
  const payDisabled = noDebt || s.credits <= 0;
  const payTitle = noDebt ? "No debt to pay" : "No credits to pay with";
  const kv = (label: string, value: string, gold = false, extra = "") =>
    `<div class="st-kv"><span class="st-kv__label">${label}</span><span class="st-kv__value${gold ? " st-kv__value--gold" : ""}${extra ? ` ${extra}` : ""} st-num">${value}</span></div>`;
  return panel(
    "Ship Logistics",
    `${kv("Credits", cr(s.credits), true, s.credits < 0 ? "credits-negative" : "")}
    ${kv("Debt", cr(s.debt), true)}
    ${kv("Net worth", cr(netWorth(s)), true)}
    ${kv("Day", String(s.day))}
    <div class="st-gauge">
      <div class="st-bar-label"><span class="st-bar-label__name">${fuelIcon()}Fuel</span><span class="st-bar-label__value${fuelClass ? ` ${fuelClass}` : ""}">${s.fuel}/${s.fuelCapacity}</span></div>
      <div class="st-bar st-bar--segmented ${barMod}" role="meter" aria-label="Fuel" aria-valuenow="${s.fuel}" aria-valuemin="0" aria-valuemax="${s.fuelCapacity}" style="--st-value: ${fuelPct}%; --st-segments: ${s.fuelCapacity}"><div class="st-bar__fill"></div></div>
    </div>
    <div class="st-gauge">
      <div class="st-bar-label"><span class="st-bar-label__name">${hullIcon()}Hull</span><span class="st-bar-label__value">${s.hull}/${s.hullMax}</span></div>
      <div class="st-bar" role="meter" aria-label="Hull" aria-valuenow="${s.hull}" aria-valuemin="0" aria-valuemax="${s.hullMax}" style="--st-value: ${hullPct}%"><div class="st-bar__fill"></div></div>
    </div>
    <hr class="st-divider" />
    <div class="st-kv__label">Services</div>
    <div class="svc-row">
      <button class="st-btn st-btn--ghost" data-act="refuel"${disabledAttr(refuelDisabled, refuelTitle)}>${fuelIcon()}${refuelLabel}</button>
      <button class="st-btn st-btn--ghost" data-act="repair"${disabledAttr(repairDisabled, repairTitle)}>${hullIcon()}Repair +20 (${cr(20 * REPAIR_PRICE)})</button>
      <button class="st-btn st-btn--ghost" data-act="payDebt"${disabledAttr(payDisabled, payTitle)}>Pay 200 debt</button>
    </div>
    <div class="st-kv"><span class="st-kv__label">Docking fee here</span><span class="fee st-kv__value st-kv__value--gold st-num">${cr(dockingFee(s.location))}</span></div>`
  );
}

function logPanel(s: GameState): string {
  const logEntries = s.log
    .slice(-8)
    .map((l) => `<div class="log-line tr-${toneOf(l)}">${l}</div>`)
    .join("");
  return panel(
    "Ship's Log",
    `<div class="log-entries">${logEntries}</div>`,
    ` aria-label="Ship's log"`
  );
}

function navigatorPanel(s: GameState): string {
  const banner =
    s.fuel < cheapestJumpCost(s)
      ? `<div class="st-badge st-badge--alert nav-warning" role="status">⚠ Not enough fuel to jump anywhere — refuel below (${REFUEL_PRICE}cr/unit)</div>`
      : "";
  const orbs = NODE_IDS.filter((n) => n !== s.location)
    .map((n) => {
      const cost = fuelCost(s.location, n);
      const danger = Math.round(NODES[n].danger * 100);
      const disabled = s.fuel < cost;
      const reason = disabled ? ` — need ${cost}, have ${s.fuel}` : "";
      return `<button class="st-orb" data-act="jump" data-id="${n}"${disabledAttr(disabled, `Need ${cost}⛽, have ${s.fuel}`)}>
        <span class="st-orb__sphere" style="--orb-art: ${ORB_ART[n]}" aria-hidden="true"></span>
        <span class="st-orb__label">${NODES[n].name}</span>
        <span class="st-orb__meta st-num">${cost}${fuelIcon()} · ${danger}%</span>
        <span class="st-orb__tip st-num" role="tooltip" aria-hidden="true">${cost} fuel · ${danger}% danger${reason}</span>
        <span class="st-sr-only"> — jump here, ${cost} fuel, danger ${danger}%${reason}</span>
      </button>`;
    })
    .join("");
  return panel("Navigator", `${banner}<div class="st-orb-group">${orbs}</div>`);
}

function cargoPanel(s: GameState): string {
  const tiles = COMMODITIES.map((c) => {
    const qty = s.cargo[c.id];
    const acc = COMMODITY_ACCENT[c.id];
    return `<div class="st-tile${acc ? ` st-tile--${acc}` : ""}${qty === 0 ? " cargo-empty" : ""}">
      ${iconBox(c.id)}
      <span><span class="st-tile__name">${c.name}</span><span class="st-tile__meta st-num">${qty} units</span></span>
    </div>`;
  }).join("");
  return panel(
    "Cargo",
    `<div class="st-kv"><span class="st-kv__label">Hold</span><span class="st-kv__value st-num">${cargoUsed(s.cargo)}/${s.cargoCapacity}</span></div>
    <div class="cargo-tiles">${tiles}</div>`
  );
}

function tradeHubPanel(s: GameState): string {
  const marketRows = COMMODITIES.map((c) => {
    const price = getPrice(s.seed, s.day, s.location, c.id);
    const cantAfford = price > s.credits;
    const holdFull = cargoUsed(s.cargo) + 1 > s.cargoCapacity;
    const buyDisabled = cantAfford || holdFull;
    const buyTitle = cantAfford ? "Not enough credits" : "Cargo hold full";
    const sellDisabled = s.cargo[c.id] < 1;
    return `<div class="st-market__row" role="group" aria-label="${c.name}">
      ${iconBox(c.id)}
      <span class="st-market__name">${c.name}</span>
      <span class="st-market__prices st-num" aria-label="Market price ${price} credits"><span class="st-market__buy-price">${cr(price)}</span></span>
      <span class="st-market__held st-num" aria-label="${s.cargo[c.id]} units held">×${s.cargo[c.id]}</span>
      <span class="st-market__actions">
        <button class="st-btn st-btn--sm" data-act="buy" data-id="${c.id}" aria-label="Buy 1 ${c.name}"${disabledAttr(buyDisabled, buyTitle)}>Buy 1</button>
        <button class="st-btn st-btn--sell st-btn--sm" data-act="sell" data-id="${c.id}" aria-label="Sell 1 ${c.name}"${disabledAttr(sellDisabled, "None in hold")}>Sell 1</button>
      </span>
    </div>`;
  }).join("");

  const acceptedIds = new Set(s.activeMissions.map((m) => m.id));
  const missions = missionsHere(s)
    .map((m) => {
      const action = acceptedIds.has(m.id)
        ? `<span class="accepted">✓ Accepted</span>`
        : `<button class="st-btn st-btn--ghost st-btn--sm" data-act="accept" data-id="${m.id}" aria-label="Accept contract: deliver ${m.qty} ${commodityName(m.commodity)} to ${NODES[m.destination].name}">Accept</button>`;
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

  return `<section class="st-panel st-panel--tab">
    <header class="st-panel__header"><h2 class="st-panel__title">Trade Hub — ${NODES[s.location].name}</h2></header>
    <div class="st-panel__frame">
      <div class="st-panel__body st-panel__body--flush">
        <div class="st-market st-market--held">
          <div class="st-market__head">Market Commodities</div>
          ${marketRows}
        </div>
        <div class="st-panel__subhead">Contracts</div>
        <ul class="contract-list">${missions || "<li>None today.</li>"}</ul>
        <div class="st-panel__subhead">Active Contracts</div>
        <p class="hint trade-hint">Deliveries auto-complete when you arrive carrying the goods.</p>
        <ul class="contract-list">${active || "<li>None accepted. Accept a contract, buy its cargo, then jump to the destination.</li>"}</ul>
      </div>
    </div>
  </section>`;
}

export function stationScreen(s: GameState, turnReport: string[] = [], dateLabel = ""): string {
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
  const fuelClass = fuelWarnClass(s);

  return `
    ${screenHead(s, dateLabel)}
    ${statbar(s, fuelClass)}
    <div class="st-shell station-shell">
      <!-- DOM order leads with the stage so single-column mobile reads
           trade hub → navigator/cargo → logistics/log and keyboard focus
           follows the visual order. Wider layouts reorder via CSS. -->
      <div class="st-shell__stage">
        ${report}
        ${tradeHubPanel(s)}
      </div>
      <div class="st-shell__rail rail-left">
        ${navigatorPanel(s)}
        ${cargoPanel(s)}
      </div>
      <div class="st-shell__rail st-shell__rail--right rail-right">
        ${logisticsPanel(s, fuelClass)}
        ${logPanel(s)}
      </div>
    </div>
  `;
}

export function eventScreen(s: GameState, e: GameEvent): string {
  const stakes = choiceStakes(s, e);
  const choices = e.choices
    .map((c) => {
      const stake = stakes[c.id];
      return `<button class="st-btn" data-act="resolve" data-id="${c.id}">${c.label}${
        stake ? `<span class="choice-stake st-num">${stake}</span>` : ""
      }</button>`;
    })
    .join("");
  return `<div class="overlay-stage">
    <div class="st-glow-wrap">
      <div class="st-panel st-panel--chamfer"><div class="st-panel__inner">
        <div class="event-card">
          ${statbar(s, fuelWarnClass(s), { presentation: false, extra: "st-statbar--event" })}
          <h1>${e.title}</h1><p>${e.description}</p><div class="choices">${choices}</div>
        </div>
      </div></div>
    </div>
  </div>`;
}

export function runEndScreen(s: GameState, score: number): string {
  // checkLoss is the only site that sets status "lost", and it appends the cause
  // message in the same call — so on a lost run the newest log entry names what
  // ended it. Guarded by status so future non-lost end states never mislabel.
  const cause = s.status === "lost" ? (s.log[s.log.length - 1] ?? "") : "";
  return `<div class="overlay-stage">
    <div class="st-glow-wrap">
      <div class="st-panel st-panel--chamfer"><div class="st-panel__inner">
        <div class="run-end">
          <h1>Run Over</h1>
          <p>You survived ${s.day} days.</p>
          ${cause ? `<p class="run-end__cause">${cause}</p>` : ""}
          <p class="score st-num">Score: ${score.toLocaleString()}</p>
          <p class="hint">Seed #${s.seed}</p>
          <button class="st-btn" data-act="share">Copy score card</button>
          <button class="st-btn st-btn--ghost" data-act="restart">New run</button>
        </div>
      </div></div>
    </div>
  </div>`;
}
