// src/ui/screens.ts
import { CommodityId, GameEvent, GameState, LogEntry, Mission, RunEnd } from "../engine/types";
import {
  COMMODITIES,
  DEMAND_PRICE_MULTIPLIER,
  NODES,
  NODE_IDS,
  PRODUCE_PRICE_MULTIPLIER,
  cheapestJumpCost,
  commodityName,
  fuelCost,
  getPrice,
} from "../engine/world";
import {
  REFUEL_PRICE,
  REPAIR_PRICE,
  cargoUsed,
  dockingFee,
  escapeCost,
  netWorth,
  spendableCredits,
} from "../engine/economy";
import {
  BuyBlock,
  buyBlockReason,
  interestForecast,
  maxBuyable,
  missionsHere,
  netProceeds,
} from "../engine/game";
import { docksideUnitsUsed, missionFeasibility } from "../engine/missions";
import { pirateChance } from "../engine/events";
import { RUN_LENGTH } from "../engine/run-end";
import { STATION_DOSSIERS, epilogue } from "../engine/fiction";
import { choiceOdds, choiceStakes } from "../engine/preview";
import { bulletin } from "../engine/bulletin";
import { COMMODITY_ACCENT, ORB_ART, fuelIcon, hullIcon, iconBox } from "./art";
import { starMap } from "./map";
import { runStrip, stripSummary } from "./share";

const cr = (n: number) => `${n.toLocaleString()}cr`;

/** Compact exchange-board symbol per commodity for the EXCH ticker lane. */
const COMMODITY_SYM: Record<CommodityId, string> = { water: "WTR", parts: "PRT", luxury: "LUX" };

export interface RunMeta {
  runNumber: number;
  runLabel: "The Daily" | "Practice";
  dateLabel: string;
  bootStats?: { attemptsToday: number; bestToday: number | null; allTimePB: number };
  debrief?: { pbDelta: number; isNewPB: boolean; prevBest: number; isFirstEver: boolean };
}

/**
 * Disabled-button copy per `buyBlockReason`, so the market buttons name the same three
 * ceilings buy() enforces — including E2-2h's escape fare (B-1).
 */
const BUY_BLOCK_TITLE: Record<BuyBlock, string> = {
  "": "",
  credits: "Not enough credits",
  room: "Cargo hold full",
  reserve: "Credits held back for fuel",
};

/** Renders ` disabled title="…"` for a control, or nothing when it is enabled. */
const disabledAttr = (disabled: boolean, title: string): string =>
  disabled ? ` disabled title="${title}"` : "";

/** Statbar/bar warning class shared by the station and event screens. */
function fuelWarnClass(s: GameState): string {
  const cheapest = cheapestJumpCost(s.location);
  return s.fuel < cheapest ? "stat-critical" : s.fuel < cheapest * 2 ? "stat-warn" : "";
}

const TONE_ICON: Record<LogEntry["tone"], string> = { good: "✓", bad: "✗", neutral: "›" };

/** Right-aligned signed credit delta for a money log line; nothing when absent. */
const deltaHtml = (l: LogEntry): string =>
  l.delta === undefined
    ? ""
    : `<span class="log-delta st-num ${l.delta >= 0 ? "tr-good" : "tr-bad"}">${
        l.delta >= 0 ? "+" : "−"
      }${Math.abs(l.delta).toLocaleString()}cr</span>`;

function screenHead(s: GameState, dateLabel = "", meta?: RunMeta): string {
  const sub = meta
    ? `${NODES[s.location].name} · Day ${s.day}/${RUN_LENGTH} · Starlight #${meta.runNumber} · ${meta.dateLabel} · ${meta.runLabel}`
    : `${NODES[s.location].name} · Day ${s.day}/${RUN_LENGTH}${dateLabel ? ` · ${dateLabel}` : ""}`;
  const stats =
    meta?.bootStats && s.day === 1
      ? `<p class="screen-head__stats">Today: ${meta.bootStats.attemptsToday} flown · best ${
          meta.bootStats.bestToday === null ? "—" : meta.bootStats.bestToday.toLocaleString()
        } · all-time PB ${meta.bootStats.allTimePB.toLocaleString()}</p>`
      : "";
  return `<header class="screen-head">
    <h1 class="st-screen-title" tabindex="-1">Starlight Traders</h1>
    <p class="screen-head__sub">${sub}</p>
    ${stats}
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

/**
 * The three dock services, each labelled with exactly what its click delivers (B-1).
 * Refuel mirrors refuel()'s min(units, tankRoom, affordable) clamp; repair and Pay debt
 * spend credits and hand back nothing sellable, so they answer to E2-2h's escape fare —
 * `spendableCredits`, the same ceiling the engine enforces, not the raw purse.
 */
function servicesRow(s: GameState): string {
  const tankRoom = s.fuelCapacity - s.fuel;
  const affordable = Math.floor(s.credits / REFUEL_PRICE);
  const refuelUnits = Math.min(5, tankRoom, affordable);
  const refuelDisabled = refuelUnits <= 0;
  const refuelTitle = tankRoom <= 0 ? "Fuel tank full" : "Not enough credits";
  const shownUnits = refuelDisabled ? 5 : refuelUnits;
  const clampedByCredits = !refuelDisabled && affordable < Math.min(5, tankRoom);
  const refuelLabel = `Refuel +${shownUnits} (${cr(shownUnits * REFUEL_PRICE)})${clampedByCredits ? " — all you can afford" : ""}`;
  const spendable = spendableCredits(s);
  const heldForFuel = `Credits held back for fuel — ${cr(escapeCost(s))} to fly again`;
  const hullFull = s.hull >= s.hullMax;
  // repair() is all-or-nothing on the points it can fit, so price that exact bundle
  // rather than a single hull point.
  const repairCost = Math.min(20, s.hullMax - s.hull) * REPAIR_PRICE;
  const repairTitle = hullFull
    ? "Hull fully repaired"
    : repairCost > s.credits
      ? "Not enough credits"
      : heldForFuel;
  const noDebt = s.debt <= 0;
  const payTitle = noDebt
    ? "No debt to pay"
    : s.credits <= 0
      ? "No credits to pay with"
      : heldForFuel;
  return `<div class="svc-row">
      <button class="st-btn st-btn--ghost" data-act="refuel"${disabledAttr(refuelDisabled, refuelTitle)}>${fuelIcon()}${refuelLabel}</button>
      <button class="st-btn st-btn--ghost" data-act="repair"${disabledAttr(hullFull || repairCost > spendable, repairTitle)}>${hullIcon()}Repair +20 (${cr(20 * REPAIR_PRICE)})</button>
      <button class="st-btn st-btn--ghost" data-act="payDebt"${disabledAttr(noDebt || spendable <= 0, payTitle)}>Pay 200 debt</button>
    </div>`;
}

function logisticsPanel(s: GameState, fuelClass: string, retireArmed: boolean): string {
  const fuelPct = Math.round((s.fuel / s.fuelCapacity) * 100);
  const hullPct = Math.round((s.hull / s.hullMax) * 100);
  const barMod = fuelClass === "stat-critical" ? "st-bar--critical" : "st-bar--gold";
  const kv = (label: string, value: string, gold = false, extra = "") =>
    `<div class="st-kv"><span class="st-kv__label">${label}</span><span class="st-kv__value${gold ? " st-kv__value--gold" : ""}${extra ? ` ${extra}` : ""} st-num">${value}</span></div>`;
  const fc = interestForecast(s);
  const debtValue = `${cr(s.debt)}${fc ? ` <span class="debt-forecast">+${cr(fc.amount)} in ${fc.inDays}d</span>` : ""}`;
  return panel(
    "Ship Logistics",
    `${kv("Credits", cr(s.credits), true, s.credits < 0 ? "credits-negative" : "")}
    ${kv("Debt", debtValue, true)}
    ${kv("Net worth", cr(netWorth(s)), true)}
    ${kv("Day", `${s.day}/${RUN_LENGTH}`)}
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
    ${servicesRow(s)}
    <div class="st-kv"><span class="st-kv__label">Docking fee here</span><span class="fee st-kv__value st-kv__value--gold st-num">${cr(dockingFee(s.location))}</span></div>
    <hr class="st-divider" />
    ${
      retireArmed
        ? `<div class="retire-confirm">
            <button class="st-btn st-btn--sell retire-confirm__go" data-act="retireConfirm">Confirm retire?</button>
            <button class="st-btn st-btn--ghost retire-confirm__cancel" data-act="retireCancel" aria-label="Cancel retire" title="Cancel">✕</button>
          </div>`
        : `<button class="st-btn st-btn--ghost st-btn--block" data-act="retire">Retire &amp; bank score</button>`
    }`
  );
}

/** One rendered log line: a run of consecutive identical (msg, tone, day) entries (P3-1b). */
export interface CollapsedLine {
  msg: string;
  tone: LogEntry["tone"];
  day?: number;
  count: number;
  delta?: number;
}

/**
 * Fold runs of consecutive identical entries. `day` joins the key so a collapsed
 * run can never straddle a day divider. Deltas sum; a run with no money lines
 * keeps `delta` undefined so the panel never renders a spurious "+0". Render-only:
 * the engine log stays append-only and uncollapsed (turn report, conservation
 * tests, and the sim all read the raw entries).
 */
export function collapseLog(log: LogEntry[]): CollapsedLine[] {
  const out: CollapsedLine[] = [];
  for (const l of log) {
    const last = out[out.length - 1];
    if (last && last.msg === l.msg && last.tone === l.tone && last.day === l.day) {
      last.count += 1;
      if (l.delta !== undefined) last.delta = (last.delta ?? 0) + l.delta;
    } else {
      out.push({
        msg: l.msg,
        tone: l.tone,
        day: l.day,
        count: 1,
        ...(l.delta === undefined ? {} : { delta: l.delta }),
      });
    }
  }
  return out;
}

/** How many collapsed lines the panel shows; dividers render on top of these. */
const LOG_WINDOW = 10;

function logPanel(s: GameState): string {
  // Newest-first (P3-1c): collapse the raw log, window it, then reverse — today's
  // lines sit at the top under their divider, so no auto-scroll is needed.
  const lines = collapseLog(s.log).slice(-LOG_WINDOW).reverse();
  const parts: string[] = [];
  let dividerDay: number | undefined;
  for (const l of lines) {
    if (l.day !== undefined && l.day !== dividerDay) {
      parts.push(`<div class="log-day-divider">Day ${l.day}</div>`);
      dividerDay = l.day;
    }
    // Day-less lines predate this round's snapshots — render them dimmed, no divider.
    const past = l.day === undefined || l.day < s.day ? " log-line--past" : "";
    const times = l.count > 1 ? ` ×${l.count}` : "";
    parts.push(
      `<div class="log-line tr-${l.tone}${past}"><span>${l.msg}${times}</span>${deltaHtml(l)}</div>`
    );
  }
  return panel(
    "Ship's Log",
    `<div class="log-entries">${parts.join("")}</div>`,
    ` aria-label="Ship's log"`
  );
}

function navigatorPanel(s: GameState): string {
  const banner =
    s.fuel < cheapestJumpCost(s.location)
      ? `<div class="st-badge st-badge--alert nav-warning" role="status">⚠ Not enough fuel to jump anywhere — refuel below (${REFUEL_PRICE}cr/unit). ${cr(escapeCost(s))} of your credits is held back for it.</div>`
      : "";
  const orbs = NODE_IDS.filter((n) => n !== s.location)
    .map((n) => {
      const cost = fuelCost(s.location, n);
      const fee = dockingFee(n);
      const raid = Math.round(pirateChance(s.location, n) * 100);
      const taxPct = Math.round(NODES[n].taxRate * 100);
      const customsNote = n === "meridian" ? " · customs patrol this approach" : "";
      const disabled = s.fuel < cost;
      const reason = disabled ? ` — need ${cost}, have ${s.fuel}` : "";
      const detail = `${cost} fuel · dock ${cr(fee)} · ${raid}% raid risk · sells taxed ${taxPct}%${customsNote}`;
      return `<button class="st-orb" data-act="jump" data-id="${n}"${disabledAttr(disabled, `Need ${cost}⛽, have ${s.fuel}`)}>
        <span class="st-orb__sphere" style="--orb-art: ${ORB_ART[n]}" aria-hidden="true"></span>
        <span class="st-orb__label">${NODES[n].name}</span>
        <span class="st-orb__meta st-num">${cost}${fuelIcon()} · ${cr(fee)} · ${raid}%</span>
        <span class="st-orb__tip st-num" role="tooltip" aria-hidden="true">${detail}${reason}</span>
        <span class="st-sr-only"> — jump here, ${detail}${reason}</span>
      </button>`;
    })
    .join("");
  return panel("Navigator", `${banner}${starMap(s)}<div class="st-orb-group">${orbs}</div>`);
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

/**
 * The shared contract countdown chip (P2-3). One definition for offer and active cards, so
 * the amber threshold and the singular can't drift between them. Renders nothing once the
 * deadline has passed — the active card shows "deadline passed" instead of a negative count.
 */
function daysLeftChip(daysLeft: number): string {
  if (daysLeft < 0) return "";
  const amber = daysLeft <= 2 ? " contract-days--amber" : "";
  return `<span class="contract-days${amber}">${daysLeft} day${daysLeft === 1 ? "" : "s"} left</span>`;
}

/**
 * Units the card should warn will pay spot. Defers to the engine's own split so the hint
 * can't promise a payout settlement won't honour, and reports none away from the
 * destination — jump() clears boughtHere, so those units will be hauled by then.
 */
function docksideUnitsShown(s: GameState, m: Mission): number {
  return s.location === m.destination ? docksideUnitsUsed(s, m) : 0;
}

function tradeHubPanel(s: GameState): string {
  const marketRows = COMMODITIES.map((c) => {
    const price = getPrice(s.seed, s.day, s.location, c.id);
    const held = s.cargo[c.id];
    // Clamped quantities and block reasons come from the engine helpers, so an enabled
    // button always delivers exactly its label and can't drift from buy()/sell() (B-1).
    const maxBuy = maxBuyable(s, c.id);
    const buy1Reason = buyBlockReason(s, c.id, 1);
    const buyDisabled = buy1Reason !== "";
    const buyTitle = BUY_BLOCK_TITLE[buy1Reason];
    const buy5Disabled = maxBuy < 5;
    // Attribute the ×5 limit to whichever constraint binds one unit past the max, so a
    // hold-limited player isn't sent looking for credits they already have.
    const buy5Title = buyDisabled
      ? buyTitle
      : buyBlockReason(s, c.id, maxBuy + 1) === "room"
        ? `Hold space for only ${maxBuy}`
        : `Only enough for ${maxBuy}`;
    const sellDisabled = held < 1;
    const sell5Disabled = held < 5;
    const sell5Title = sellDisabled ? "None in hold" : `Only ${held} in hold`;
    return `<div class="st-market__row" role="group" aria-label="${c.name}">
      ${iconBox(c.id)}
      <span class="st-market__name">${c.name}</span>
      <span class="st-market__prices st-num" aria-label="Market price ${price} credits"><span class="st-market__buy-price">${cr(price)}</span></span>
      <span class="st-market__held st-num" aria-label="${held} units held">×${held}</span>
      <span class="st-market__actions">
        <button class="st-btn st-btn--sm" data-act="buy" data-id="${c.id}" data-qty="1" aria-label="Buy 1 ${c.name}"${disabledAttr(buyDisabled, buyTitle)}>Buy 1</button>
        <button class="st-btn st-btn--sm" data-act="buy" data-id="${c.id}" data-qty="5" aria-label="Buy ×5 ${c.name} for ${cr(5 * price)}"${disabledAttr(buy5Disabled, buy5Title)}>×5</button>
        <button class="st-btn st-btn--sell st-btn--sm" data-act="sell" data-id="${c.id}" data-qty="1" aria-label="Sell 1 (${cr(netProceeds(s, c.id, 1))}) net for ${c.name}"${disabledAttr(sellDisabled, "None in hold")}>Sell 1 (${cr(netProceeds(s, c.id, 1))})</button>
        <button class="st-btn st-btn--sell st-btn--sm" data-act="sell" data-id="${c.id}" data-qty="5" aria-label="Sell ×5 (${cr(netProceeds(s, c.id, 5))}) net for ${c.name}"${disabledAttr(sell5Disabled, sell5Title)}>×5 (${cr(netProceeds(s, c.id, 5))})</button>
      </span>
    </div>`;
  }).join("");

  const acceptedIds = new Set(s.activeMissions.map((m) => m.id));
  const missions = missionsHere(s)
    .map((m) => {
      const f = missionFeasibility(s, m);
      const est =
        f.estProfit >= 0 ? `est. +${cr(f.estProfit)}` : `est. −${cr(Math.abs(f.estProfit))}`;
      const days = daysLeftChip(f.daysLeft);
      const feasibility = `<span class="contract-feas st-num">cost ~${cr(f.cargoCost)} · ${f.fuel}⛽ · ${est} · deposit ${cr(m.deposit)} · ${days}</span>`;
      const acceptHintId = `accept-hint-${m.id}`;
      // The bond is an outright sink until delivery, so it answers to the escape fare
      // too — same ceiling acceptMission() enforces (E2-2h).
      const canAfford = m.deposit <= spendableCredits(s);
      const acceptHint =
        s.credits < m.deposit
          ? `(need ${cr(m.deposit)} deposit)`
          : `(deposit would strand you — ${cr(escapeCost(s))} is held back for fuel)`;
      // Composed button + hint, aria-disabled to stay focusable — the shortfall-buy pattern.
      const action = acceptedIds.has(m.id)
        ? `<span class="accepted">✓ Accepted</span>`
        : `<button class="st-btn st-btn--ghost st-btn--sm" data-act="accept" data-id="${m.id}" aria-label="Accept contract: deliver ${m.qty} ${commodityName(m.commodity)} to ${NODES[m.destination].name} for a ${cr(m.deposit)} deposit"${
            canAfford ? "" : ` aria-disabled="true" aria-describedby="${acceptHintId}"`
          }>Accept</button>` +
          (canAfford ? "" : ` <span id="${acceptHintId}" class="bad">${acceptHint}</span>`);
      return `<li>Deliver ${m.qty} ${commodityName(m.commodity)} → ${NODES[m.destination].name} by day ${m.deadlineDay} · reward ${cr(m.reward)}<br>${feasibility}
      ${action}</li>`;
    })
    .join("");

  // E2-2g: hauled units settle into contracts in accept order (settleMissions iterates
  // activeMissions). That order only matters when two active contracts want the same
  // commodity — badge exactly that case, so the invisible rule reads as the decision
  // it already is: accept the whale first.
  const wanters = new Map<CommodityId, number>();
  for (const m of s.activeMissions) wanters.set(m.commodity, (wanters.get(m.commodity) ?? 0) + 1);
  const prioSeen = new Map<CommodityId, number>();
  const PRIO_GLYPHS = ["①", "②", "③", "④", "⑤"];
  // Called once per mission in render order (= accept order), so nth counts up correctly.
  const settlementBadge = (m: Mission): string => {
    if ((wanters.get(m.commodity) ?? 0) < 2) return "";
    const nth = (prioSeen.get(m.commodity) ?? 0) + 1;
    prioSeen.set(m.commodity, nth);
    const glyph = PRIO_GLYPHS[nth - 1] ?? `#${nth}`;
    return ` <span class="contract-prio st-num" title="Hauled ${commodityName(m.commodity)} settles into contracts in the order they were accepted">${glyph}${nth === 1 ? " settles first" : ""}</span>`;
  };

  const active = s.activeMissions
    .map((m) => {
      const have = s.cargo[m.commodity];
      const ready = have >= m.qty;
      const expired = s.day > m.deadlineDay;
      const atDestination = s.location === m.destination;
      const chip = daysLeftChip(m.deadlineDay - s.day);
      const daysChip = chip && ` · ${chip}`;
      const boughtUsed = docksideUnitsShown(s, m);
      const provenance = ready && boughtUsed > 0 ? ` — ${boughtUsed} bought here pay spot` : "";
      const canReach = atDestination || s.fuel >= fuelCost(s.location, m.destination);
      const jumpHintId = `jump-hint-${m.id}`;
      // Shortfall shortcut: buys the full missing amount at the local price, or
      // is disabled with a reason — never a silent partial (B-1 precedent).
      const shortfall = m.qty - have;
      const shortfallCost = shortfall * getPrice(s.seed, s.day, s.location, m.commodity);
      // Same engine guard as the market Buy buttons, so the block reason can't drift from buy().
      const shortfallReason = buyBlockReason(s, m.commodity, shortfall);
      const shortfallBlocked =
        shortfallReason === "credits"
          ? "not enough credits"
          : shortfallReason === "room"
            ? "not enough hold space"
            : shortfallReason === "reserve"
              ? "credits held back for fuel"
              : "";
      const buyHintId = `buy-hint-${m.id}`;
      // Compose the button once and splice on the disabled fragment, so the two states
      // can't diverge. aria-disabled (not `disabled`) keeps it focusable to announce the
      // reason, which is why disabledAttr's plain `disabled` attribute doesn't fit here.
      const shortfallLabel = `Buy ${shortfall} ${commodityName(m.commodity)} for ${cr(shortfallCost)}`;
      const shortfallBtn =
        `<button class="jump-link" data-act="buy" data-id="${m.commodity}" data-qty="${shortfall}" aria-label="${shortfallLabel}"${
          shortfallBlocked ? ` aria-disabled="true" aria-describedby="${buyHintId}"` : ""
        }>buy ${shortfall} for ${cr(shortfallCost)}</button>` +
        (shortfallBlocked
          ? ` <span id="${buyHintId}" class="bad">(${shortfallBlocked})</span>`
          : "");
      const jumpBtn = canReach
        ? `<button class="jump-link" data-act="jump" data-id="${m.destination}" aria-label="Jump to ${NODES[m.destination].name} to deliver">jump to ${NODES[m.destination].name}</button>`
        : `<button class="jump-link" data-act="jump" data-id="${m.destination}" aria-label="Jump to ${NODES[m.destination].name} to deliver" aria-disabled="true" aria-describedby="${jumpHintId}">jump to ${NODES[m.destination].name}</button> <span id="${jumpHintId}" class="bad">(not enough fuel to jump)</span>`;
      const readyBtn = atDestination
        ? `<button class="jump-link" data-act="deliver" aria-label="Deliver to ${NODES[m.destination].name}">deliver</button>`
        : jumpBtn;
      const hint = expired
        ? `<span class="bad">✗ deadline passed</span>`
        : ready
          ? `<span class="good">✓ carrying ${have}/${m.qty}${provenance} — ready, ${readyBtn}</span>`
          : `<span class="bad">✗ carrying ${have}/${m.qty} — ${shortfallBtn}</span>`;
      const prio = settlementBadge(m);
      return `<li>${m.qty} ${commodityName(m.commodity)} → ${NODES[m.destination].name} by day ${m.deadlineDay} · reward ${cr(m.reward)}${daysChip}${prio}<br>${hint}</li>`;
    })
    .join("");

  const st = NODES[s.location];
  const taxPct = Math.round(st.taxRate * 100);
  // Derive the ± labels from the same multipliers getPrice uses, so they can't drift.
  const pricePct = (mult: number) => {
    const pct = Math.round((mult - 1) * 100);
    return pct < 0 ? `−${Math.abs(pct)}%` : `+${pct}%`;
  };
  const intelParts = [
    ...st.produces.map(
      (c) => `Produces ${commodityName(c)} (${pricePct(PRODUCE_PRICE_MULTIPLIER)})`
    ),
    ...st.demands.map((c) => `Buys ${commodityName(c)} (${pricePct(DEMAND_PRICE_MULTIPLIER)})`),
    taxPct > 0 ? `Sales taxed ${taxPct}%` : "Tax-free port",
  ];
  if (st.produces.length === 0 && st.demands.length === 0) {
    intelParts.unshift("A trade crossroads — no local specialities");
  }
  const intel = `<p class="station-intel"><span class="station-dossier">${STATION_DOSSIERS[s.location]}</span> ${intelParts.join(" · ")}</p>`;

  return `<section class="st-panel st-panel--tab">
    <header class="st-panel__header"><h2 class="st-panel__title">Trade Hub — ${NODES[s.location].name}</h2></header>
    <div class="st-panel__frame">
      <div class="st-panel__body st-panel__body--flush">
        ${intel}
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

/** Static exchange quote board for the docked station (P2-2a): price + ▲▼ vs base + tax/fee. */
function exchLane(s: GameState): string {
  const quotes = COMMODITIES.map((c) => {
    const price = getPrice(s.seed, s.day, s.location, c.id);
    const pct = Math.round(((price - c.basePrice) / c.basePrice) * 100);
    const move =
      pct > 0
        ? `<span class="tick-up">▲ ${pct}%</span>`
        : pct < 0
          ? `<span class="tick-dn">▼ ${Math.abs(pct)}%</span>`
          : `<span class="tick-flat">▬ base</span>`;
    return `<span class="tick-q st-num"><span class="tick-sym">${COMMODITY_SYM[c.id]}</span> ${price} ${move}</span>`;
  }).join(`<span class="tick-sep" aria-hidden="true">│</span>`);
  const taxPct = Math.round(NODES[s.location].taxRate * 100);
  return `<div class="ticker__lane ticker__lane--exch">
    <span class="ticker__tag">EXCH</span>
    <span class="ticker__body" tabindex="0">${quotes}<span class="tick-sep" aria-hidden="true">│</span><span class="tick-flat st-num">tax ${taxPct}% · dock ${cr(dockingFee(s.location))}</span></span>
  </div>`;
}

/**
 * The scrolling rumor lane (E1-1). Day 1 is the launch surface: the full bulletin
 * renders as a static list so the first-90-seconds player has a stated first move.
 * From day 2 it scrolls — pausable, paused on hover/focus, and static again under
 * prefers-reduced-motion (see styles.css).
 */
function dockTalkLane(s: GameState, paused: boolean): string {
  const lines = bulletin(s.seed);
  if (s.day === 1) {
    return `<div class="ticker__lane ticker__lane--talk ticker__lane--static">
      <span class="ticker__tag">DOCK TALK</span>
      <ul class="ticker__list">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>
    </div>`;
  }
  const strip =
    lines
      .map((l) => `<span class="talk-line">${l}</span>`)
      .join(`<span class="tick-sep" aria-hidden="true">◆</span>`) +
    `<span class="tick-sep" aria-hidden="true">◆</span>`;
  return `<div class="ticker__lane ticker__lane--talk${paused ? " ticker--paused" : ""}">
    <span class="ticker__tag">DOCK TALK</span>
    <button class="ticker__pause" data-act="tickerPause" aria-pressed="${paused}" aria-label="${paused ? "Resume" : "Pause"} the dock talk ticker">${paused ? "▶" : "❙❙"}</button>
    <span class="ticker__body ticker__body--scroll"><span class="ticker__marquee">${strip}</span><span class="ticker__marquee" aria-hidden="true">${strip}</span></span>
  </div>`;
}

export function stationScreen(
  s: GameState,
  turnReport: LogEntry[] = [],
  dateLabel = "",
  retireArmed = false,
  meta?: RunMeta,
  tickerPaused = false
): string {
  const report = turnReport.length
    ? `<div class="turn-report" role="status" aria-live="polite">
      <h2 class="turn-report__title">Since your last jump</h2>
      ${turnReport
        .map(
          (l) =>
            `<div class="tr-line tr-${l.tone}"><span class="tr-icon" aria-hidden="true">${TONE_ICON[l.tone]}</span><span>${l.msg}</span>${deltaHtml(l)}</div>`
        )
        .join("")}
    </div>`
    : "";
  const fuelClass = fuelWarnClass(s);

  return `
    ${screenHead(s, dateLabel, meta)}
    ${statbar(s, fuelClass)}
    <div class="ticker" aria-label="Station exchange and dock talk">
      ${exchLane(s)}
      ${dockTalkLane(s, tickerPaused)}
    </div>
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
        ${logisticsPanel(s, fuelClass, retireArmed)}
        ${logPanel(s)}
      </div>
    </div>
  `;
}

export function eventScreen(s: GameState, e: GameEvent): string {
  const stakes = choiceStakes(s, e);
  const odds = choiceOdds(e);
  const choices = e.choices
    .map((c) => {
      const parts = [stakes[c.id], odds[c.id]].filter(Boolean);
      return `<button class="st-btn" data-act="resolve" data-id="${c.id}">${c.label}${
        parts.length ? `<span class="choice-stake st-num">${parts.join(" · ")}</span>` : ""
      }</button>`;
    })
    .join("");
  return `<div class="overlay-stage">
    <div class="st-glow-wrap">
      <div class="st-panel st-panel--chamfer"><div class="st-panel__inner">
        <div class="event-card">
          ${statbar(s, fuelWarnClass(s), { presentation: false, extra: "st-statbar--event" })}
          <h1 tabindex="-1">${e.title}</h1><p>${e.description}</p><div class="choices">${choices}</div>
        </div>
      </div></div>
    </div>
  </div>`;
}

/** Headline per end status; the two loss causes get their own names. */
export function endHeadline(r: RunEnd): string {
  if (r.status === "audited") return "Audited";
  if (r.status === "retired") return "Retired";
  return r.lossCause === "hull" ? "Ship Destroyed" : "Stranded";
}

/**
 * The run-strip as fixed-width cells. The glyphs have different intrinsic widths — 💰 and
 * 💀 are narrower than the solid squares — so a bare string renders as a ragged row. One
 * box per day restores the grid without flattening the glyphs into meaningless colours.
 * Splitting with the spread operator is safe: every strip glyph is a single code point.
 */
function stripCells(
  highlights: GameState["dayHighlights"],
  daysSurvived: number,
  status: RunEnd["status"]
): string {
  return [...runStrip(highlights, daysSurvived, status)]
    .map((glyph) => `<span class="run-end__day">${glyph}</span>`)
    .join("");
}

function pbDeltaLine(d: NonNullable<RunMeta["debrief"]>, score: number, banked: boolean): string {
  if (d.isFirstEver) {
    // A first-ever loss still sets the PB, but nothing was banked — don't say it was.
    return banked
      ? `<p class="run-end__pb">Your first banked run — ${score.toLocaleString()} to beat.</p>`
      : `<p class="run-end__pb">Your first run on the board — ${score.toLocaleString()} to beat.</p>`;
  }
  if (d.isNewPB) {
    return `<p class="run-end__pb run-end__pb--best">🏆 New personal best! ▲ +${d.pbDelta.toLocaleString()}</p>`;
  }
  const sign =
    d.pbDelta >= 0
      ? `▲ +${d.pbDelta.toLocaleString()}`
      : `▼ ${Math.abs(d.pbDelta).toLocaleString()}`;
  return `<p class="run-end__pb">${sign} vs your best (${d.prevBest.toLocaleString()})</p>`;
}

export function runEndScreen(
  s: GameState,
  r: RunEnd,
  restartArmed = false,
  meta?: RunMeta
): string {
  const banked = r.status !== "lost";
  const identity = meta
    ? `<p class="run-end__id">🚀 Starlight #${meta.runNumber} · ${meta.dateLabel} · ${meta.runLabel}</p>`
    : "";
  const pb = meta?.debrief ? pbDeltaLine(meta.debrief, r.score, banked) : "";
  const haul = s.biggestPayday
    ? `<div class="st-kv"><span class="st-kv__label">Best haul</span><span class="st-kv__value st-num">+${cr(s.biggestPayday.amount)} · ${s.biggestPayday.label}</span></div>`
    : "";
  // A bond still open at run end is sunk, not forfeited — no refund path exists outside
  // delivery (E2-2 decision 2) — so the row must appear for it too, or the debrief goes
  // silent about money the player actually spent. That is the whole point of a bond.
  const openBondCr = s.activeMissions.reduce((t, m) => t + m.deposit, 0);
  const forfeitNote =
    s.contracts.forfeitedCr > 0 ? ` (−${cr(s.contracts.forfeitedCr)} deposit)` : "";
  const sunkNote =
    s.activeMissions.length > 0
      ? ` · ${cr(openBondCr)} sunk in ${s.activeMissions.length} unfinished`
      : "";
  const contractsRow =
    s.contracts.delivered + s.contracts.expired + s.activeMissions.length > 0
      ? `<div class="st-kv"><span class="st-kv__label">Contracts</span><span class="st-kv__value st-num">${s.contracts.delivered} delivered · ${s.contracts.expired} expired${forfeitNote}${sunkNote}</span></div>`
      : "";
  const restart = restartArmed
    ? `<div class="retire-confirm">
            <button class="st-btn st-btn--ghost retire-confirm__go" data-act="restartConfirm">Start a Practice run?</button>
            <button class="st-btn st-btn--ghost retire-confirm__cancel" data-act="restartCancel" aria-label="Cancel new run" title="Cancel">✕</button>
          </div>`
    : `<button class="st-btn st-btn--ghost" data-act="restart">New run</button>`;
  return `<div class="overlay-stage">
    <div class="st-glow-wrap">
      <div class="st-panel st-panel--chamfer"><div class="st-panel__inner">
        <div class="run-end">
          <h1 tabindex="-1">${endHeadline(r)}</h1>
          ${identity}
          <p>You survived ${r.daysSurvived} day${r.daysSurvived === 1 ? "" : "s"}.</p>
          <p class="run-end__cause">${r.cause}</p>
          ${r.status === "lost" && r.lossCause ? `<p class="run-end__epilogue">${epilogue(s.seed, r.lossCause)}</p>` : ""}
          <div class="run-end__breakdown">
            <div class="st-kv"><span class="st-kv__label">Net worth${banked ? "" : " (cargo lost with the ship)"}</span><span class="st-kv__value st-num">${cr(r.netWorthAtEnd)}</span></div>
            <div class="st-kv"><span class="st-kv__label">Survival bonus</span><span class="st-kv__value st-num">${banked ? `+${r.survivalBonus}` : "forfeited"}</span></div>
            <div class="st-kv"><span class="st-kv__label">Peak net worth</span><span class="st-kv__value st-num">${cr(s.peakNetWorth)}</span></div>
            ${haul}
            ${contractsRow}
          </div>
          ${pb}
          <p class="score st-num">Score: ${r.score.toLocaleString()}</p>
          <p class="run-end__strip">
            <span class="st-sr-only"
              >Your run, one glyph per day — ${stripSummary(s.dayHighlights, r.daysSurvived, r.status)}</span
            ><span aria-hidden="true">${stripCells(s.dayHighlights, r.daysSurvived, r.status)}</span>
          </p>
          <button class="st-btn" data-act="share">Copy score card</button>
          ${restart}
        </div>
      </div></div>
    </div>
  </div>`;
}
