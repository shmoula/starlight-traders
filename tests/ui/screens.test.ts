import { describe, it, expect } from "vitest";
import {
  stationScreen,
  eventScreen,
  runEndScreen,
  RunMeta,
  collapseLog,
} from "../../src/ui/screens";
import {
  createGame,
  missionsHere,
  refuel,
  repair,
  checkLoss,
  retire,
  netProceeds,
} from "../../src/engine/game";
import { missionFeasibility } from "../../src/engine/missions";
import { COMMODITIES, NODES, NODE_IDS, commodityName, getPrice } from "../../src/engine/world";
import { dockingFee, HEAT_PER_CR, MARKET_DEPTH, saleProceeds } from "../../src/engine/economy";
import { GameEvent, Mission, RunEnd } from "../../src/engine/types";
import { endRun } from "../../src/engine/run-end";
import { STATION_DOSSIERS, epilogue } from "../../src/engine/fiction";
import { FEATS, FeatId } from "../../src/engine/feats";
import { calendarCells, emptySave, recordRunEnd } from "../../src/ui/storage";

const cr2 = (n: number) => `${n.toLocaleString()}cr`;

function withMission(mission: Mission, overrides: Partial<ReturnType<typeof createGame>> = {}) {
  const s = createGame(42);
  return {
    ...s,
    activeMissions: [mission],
    cargo: { ...s.cargo, [mission.commodity]: mission.qty },
    ...overrides,
  };
}

describe("stationScreen accessibility", () => {
  it("gives each buy/sell button an accessible name that includes the commodity", () => {
    const s = createGame(42);
    const html = stationScreen(s);
    for (const c of COMMODITIES) {
      expect(html).toContain(`aria-label="Buy 1 ${c.name}"`);
      expect(html).toContain(
        `aria-label="Sell 1 (${cr2(netProceeds(s, c.id, 1))}) net for ${c.name}"`
      );
    }
  });

  it("gives each Accept button an accessible name describing the contract and its deposit", () => {
    const s = createGame(42);
    const offered = missionsHere(s);
    expect(offered.length).toBeGreaterThan(0);
    const html = stationScreen(s);
    for (const m of offered) {
      expect(html).toContain(
        `aria-label="Accept contract: deliver ${m.qty} ${commodityName(m.commodity)} to ${NODES[m.destination].name} for a ${cr2(m.deposit)} deposit"`
      );
    }
  });
});

describe("stationScreen ready contract jump control", () => {
  const destination = "verge";
  const mission: Mission = {
    id: "m1",
    commodity: "water",
    qty: 5,
    destination,
    reward: 500,
    deposit: 50,
    deadlineDay: 30,
  };

  it("renders a jump control to the destination when ready and reachable", () => {
    const s = withMission(mission, { fuel: 20 });
    const html = stationScreen(s);
    expect(html).toContain(`data-act="jump" data-id="${destination}"`);
    expect(html).toContain(`aria-label="Jump to ${NODES[destination].name} to deliver"`);
    expect(html).not.toContain(`aria-disabled="true" aria-describedby="jump-hint-${mission.id}"`);
  });

  it("disables the jump control via aria-disabled when fuel is insufficient", () => {
    const s = withMission(mission, { fuel: 0 });
    const html = stationScreen(s);
    expect(html).toContain(
      `data-act="jump" data-id="${destination}" aria-label="Jump to ${NODES[destination].name} to deliver" aria-disabled="true"`
    );
    expect(html).toContain("(not enough fuel to jump)");
  });

  it("swaps the control for a deliver action once already at the destination", () => {
    const s = withMission(mission, { location: destination, fuel: 0 });
    const html = stationScreen(s);
    expect(html).toContain(`data-act="deliver" aria-label="Deliver to ${NODES[destination].name}"`);
    expect(html).not.toContain(`data-act="jump" data-id="${destination}"`);
  });
});

describe("stationScreen turn report", () => {
  it("surfaces the turn report as a live-region banner", () => {
    const html = stationScreen(createGame(42), [
      { msg: "Docked at verge, fee 18cr.", tone: "neutral" },
    ]);
    expect(html).toContain('class="turn-report"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Docked at verge, fee 18cr.");
  });

  it("omits the banner when nothing happened this turn", () => {
    const html = stationScreen(createGame(42), []);
    expect(html).not.toContain("turn-report");
  });

  it("colors lines by the entry's declared tone", () => {
    const html = stationScreen(createGame(42), [
      { msg: "Derelict was a trap: -20 hull.", tone: "bad" },
      { msg: "Delivery complete: +860cr.", tone: "good", delta: 860 },
    ]);
    expect(html).toContain('class="tr-line tr-bad"');
    expect(html).toContain('class="tr-line tr-good"');
  });
});

describe("stationScreen day identity", () => {
  it("shows the bounded day counter beside the date", () => {
    const html = stationScreen(createGame(42), [], "Jul 20");
    expect(html).toContain("Terra Hub · Day 1/12 · Jul 20");
  });

  it("omits the date segment when no label is given", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain("Terra Hub · Day 1/12 · ✨ Clear skies</p>");
  });
});

describe("M4 round 1 station surfaces", () => {
  it("the screen head names the day's modifier (E3-1b)", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain("✨ Clear skies");
    expect(stationScreen(createGame(1))).toContain("⚡ Ion storms");
  });

  it("a live tail shows the Navigator banner; untailed shows none (E3-4)", () => {
    const tailed = { ...createGame(42), pirateTail: true };
    expect(stationScreen(tailed)).toContain("Pirate tail");
    expect(stationScreen(createGame(42))).not.toContain("Pirate tail");
  });

  it("long-haul orbs are named salvage-rich from Kiruna (E3-2a)", () => {
    const atKiruna = { ...createGame(42), location: "kiruna" as const };
    const html = stationScreen(atKiruna);
    expect(html).toContain("salvage-rich lane");
    expect(html.match(/salvage-rich lane/g)!.length).toBe(4); // 2 orbs × (tip + sr-only)
  });

  it("ice-run offers carry the ❄ prefix (E3-2b)", () => {
    const atKirunaIceDay = { ...createGame(42), location: "kiruna" as const, day: 9 };
    expect(stationScreen(atKirunaIceDay)).toContain("❄ ICE RUN — Deliver");
  });
});

describe("stationScreen header identity (E0-3)", () => {
  it("shows run number and Daily/Practice label when meta is present", () => {
    const html = stationScreen(createGame(42), [], "Jul 22", false, META);
    expect(html).toContain("#22");
    expect(html).toContain("The Daily");
  });

  it("shows today's attempts / best / PB on day 1", () => {
    const meta: RunMeta = {
      ...META,
      bootStats: { attemptsToday: 2, bestToday: 2140, allTimePB: 3010 },
    };
    const html = stationScreen(createGame(42), [], "Jul 22", false, meta);
    expect(html).toContain("3,010"); // all-time PB
    expect(html).toContain("2,140"); // today's best
  });

  it("hides boot stats after day 1", () => {
    const meta: RunMeta = {
      ...META,
      bootStats: { attemptsToday: 2, bestToday: 2140, allTimePB: 3010 },
    };
    const html = stationScreen({ ...createGame(42), day: 5 }, [], "Jul 22", false, meta);
    expect(html).not.toContain("all-time PB");
  });

  it("renders an em dash for today's best when there is no completed run yet", () => {
    const meta: RunMeta = {
      ...META,
      bootStats: { attemptsToday: 0, bestToday: null, allTimePB: 3010 },
    };
    const html = stationScreen(createGame(42), [], "Jul 22", false, meta);
    expect(html).toContain("best —"); // em dash, not a number, when bestToday is null
  });
});

describe("stationScreen ship's log", () => {
  it("renders a titled, labelled log section", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain('aria-label="Ship\'s log"');
    expect(html).toContain("Ship's Log");
    expect(html).toContain("The Syndicate staked your ship");
  });
});

describe("stationScreen cockpit shell", () => {
  it("renders the statbar chips for credits, fuel, hull, and hold", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain('class="st-statbar"');
    expect(html).toContain("Fuel 16/20");
    expect(html).toContain("Hull 100/100");
    expect(html).toContain("Hold 0/30");
  });

  it("marks the statbar as presentation-only duplicate of panel data", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain('<div class="st-statbar" aria-hidden="true">');
  });

  it("lays the screen out as a three-zone shell", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain("st-shell station-shell");
    expect(html).toContain("st-shell__stage");
    expect(html).toContain("st-shell__rail--right");
  });
});

describe("stationScreen ship logistics", () => {
  it("renders the fuel bar segmented per fuel unit with the current value", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain('aria-label="Fuel" aria-valuenow="16"');
    expect(html).toContain("--st-segments: 20");
    expect(html).toContain("--st-value: 80%");
  });

  it("marks the fuel bar critical when below the cheapest jump", () => {
    const html = stationScreen({ ...createGame(42), fuel: 2 }); // cheapest from terra = 3 (vulcan)
    expect(html).toContain("st-bar--critical");
    expect(html).toContain("stat-critical");
  });

  it("warns when fuel covers fewer than two cheapest jumps", () => {
    const html = stationScreen({ ...createGame(42), fuel: 5 });
    expect(html).toContain("stat-warn");
    expect(html).not.toContain("st-bar--critical");
  });

  it("keeps the services disabled hints", () => {
    const html = stationScreen({ ...createGame(42), credits: 0 });
    expect(html).toContain('data-act="refuel" disabled title="Not enough credits"');
    expect(html).toContain('data-act="payDebt" disabled title="No credits to pay with"');
  });

  it("renders a continuous hull meter", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain('aria-label="Hull" aria-valuenow="100"');
  });
});

describe("stationScreen navigator and cargo", () => {
  it("renders one jump orb per non-current station with fuel and danger info", () => {
    const html = stationScreen(createGame(42)); // starts at terra
    for (const id of ["kiruna", "vulcan", "verge", "meridian"]) {
      expect(html).toContain(`data-act="jump" data-id="${id}"`);
    }
    // The visible label + meta form the accessible name; an sr-only clarifier
    // expands the fuel/fee/raid figures for screen readers (kept a substring-suffix
    // so the visible text still matches the accessible name — WCAG 2.5.3).
    expect(html).toContain('<span class="st-orb__label">Kiruna Belt</span>');
    expect(html).toContain(
      '<span class="st-sr-only"> — jump here, 4 fuel · dock 15cr · 5% raid risk · sells taxed 2%</span>'
    );
    expect(html).toContain(
      '<span class="st-sr-only"> — jump here, 6 fuel · dock 18cr · 25% raid risk · sells taxed 0%</span>'
    );
    // No jump control targets the current station (mission ids may contain node
    // names, so scope the assertion to the jump prefix).
    expect(html).not.toContain('data-act="jump" data-id="terra"');
  });

  it("raid % is per-lane: Meridian reads 6% from Terra but 20% from Vulcan (E2-3d)", () => {
    const fromTerra = stationScreen(createGame(42)); // starts at terra
    expect(fromTerra).toContain("5 fuel · dock 45cr · 6% raid risk");
    const fromVulcan = stationScreen({ ...createGame(42), location: "vulcan" });
    expect(fromVulcan).toContain("6 fuel · dock 45cr · 20% raid risk");
  });

  it("disables orbs the fuel cannot reach", () => {
    const html = stationScreen({ ...createGame(42), fuel: 0 });
    expect(html).toContain('data-act="jump" data-id="kiruna" disabled');
  });

  it("shows the hold capacity and a tile per commodity", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain(">Hold<");
    expect(html).toContain(">0/30<");
    for (const c of COMMODITIES) {
      expect(html).toContain(c.name);
    }
    // all cargo starts empty → every tile is dimmed
    expect(html.match(/cargo-empty/g)?.length).toBe(3);
  });

  it("renders the star map above the jump orbs (E2-3c)", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain('<div class="star-map" aria-hidden="true">');
    expect(html.indexOf("star-map")).toBeLessThan(html.indexOf("st-orb-group"));
  });
});

describe("stationScreen trade hub", () => {
  it("titles the window after the current station", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain("Trade Hub — Terra Hub");
    expect(html).toContain("st-panel--tab");
    expect(html).toContain("Market Commodities");
  });

  it("shows the held count per market row", () => {
    const html = stationScreen(createGame(42));
    expect(html.match(/st-market__held/g)?.length).toBe(3);
    expect(html).toContain("×0");
  });

  it("groups each market row and labels its price and held cells for assistive tech", () => {
    const html = stationScreen(createGame(42));
    // one screen-reader group per commodity, named after the commodity
    expect(html.match(/class="st-market__row" role="group"/g)?.length).toBe(COMMODITIES.length);
    for (const c of COMMODITIES) {
      expect(html).toContain(`role="group" aria-label="${c.name}"`);
    }
    // the bare ×0 / 12cr glyphs get explicit labels so they are not read as noise
    expect(html).toContain('aria-label="Market price');
    expect(html).toContain('units held"');
  });
});

describe("navigator stranding signals (P0-2)", () => {
  it("explains each unreachable route on its disabled orb", () => {
    // From terra: vulcan costs 3 (reachable), kiruna costs 4 (not reachable).
    const html = stationScreen({ ...createGame(42), fuel: 3 });
    expect(html).toContain('data-act="jump" data-id="kiruna" disabled title="Need 4⛽, have 3"');
    expect(html).toContain("— need 4, have 3");
    expect(html).not.toContain('data-act="jump" data-id="vulcan" disabled');
  });

  it("shows a stranding banner when no jump is reachable", () => {
    const html = stationScreen({ ...createGame(42), fuel: 2 }); // cheapest from terra costs 3
    expect(html).toContain("Not enough fuel to jump anywhere — refuel below (8cr/unit)");
  });

  it("omits the banner while any jump is reachable", () => {
    const html = stationScreen({ ...createGame(42), fuel: 3 });
    expect(html).not.toContain("Not enough fuel to jump anywhere");
  });
});

describe("refuel honesty (B-1)", () => {
  it("shows the credit-clamped amount and flags it", () => {
    // room 10, affordable floor(37/8) = 4 → buys 4 for 32cr
    const html = stationScreen({ ...createGame(42), credits: 37, fuel: 10 });
    expect(html).toContain("Refuel +4 (32cr) — all you can afford");
  });

  it("shows the room-clamped amount without the affordability flag", () => {
    const html = stationScreen({ ...createGame(42), fuel: 18 }); // room 2, credits 800
    expect(html).toContain("Refuel +2 (16cr)");
    expect(html).not.toContain("all you can afford");
  });

  it("keeps the nominal label and disabled reason when nothing can be bought", () => {
    const html = stationScreen({ ...createGame(42), credits: 0 });
    expect(html).toContain('data-act="refuel" disabled title="Not enough credits"');
    expect(html).toContain("Refuel +5 (40cr)");
  });

  it("matches what the engine actually buys", () => {
    const s = { ...createGame(42), credits: 37, fuel: 10 };
    const after = refuel(s, 5);
    expect(after.fuel - s.fuel).toBe(4);
    expect(s.credits - after.credits).toBe(32);
  });
});

describe("event and run-end cards", () => {
  const event: GameEvent = {
    kind: "pirates",
    title: "Pirate ambush",
    description: "A cutter locks on.",
    choices: [{ id: "flee", label: "Flee" }],
  };

  it("wraps the event in a chamfered card and keeps resolve hooks", () => {
    const html = eventScreen(createGame(42), event);
    expect(html).toContain("st-panel--chamfer");
    expect(html).toContain('class="event-card"');
    expect(html).toContain('data-act="resolve" data-id="flee"');
  });
});

describe("runEndScreen (E0-1/E0-2)", () => {
  it("renders a retired run with breakdown, share, and restart hooks", () => {
    // credits 2000, debt 1500, day 1 → net worth 500, bonus 50, score 550 (no locale separators).
    const s = retire({ ...createGame(42), credits: 2000 });
    const html = runEndScreen(s, s.runEnd!);
    expect(html).toContain("st-panel--chamfer");
    expect(html).toContain('<h1 tabindex="-1">Retired</h1>');
    expect(html).toContain("Retired at Terra Hub — the Syndicate banks your score.");
    expect(html).toContain("Survival bonus");
    expect(html).toContain("Score: 550");
    expect(html).toContain('data-act="share"');
    expect(html).toContain('data-act="restart"');
    expect(html).not.toContain("Seed #");
  });

  it("headlines an audited run", () => {
    const s = endRun({ ...createGame(42), day: 12 }, "audited", "Day 12 — audited.");
    expect(runEndScreen(s, s.runEnd!)).toContain('<h1 tabindex="-1">Audited</h1>');
  });

  it("headlines a hull breach as Ship Destroyed and forfeits the bonus", () => {
    const s = endRun(
      { ...createGame(42), hull: 0 },
      "lost",
      "Hull breach — your ship broke apart.",
      "hull"
    );
    const html = runEndScreen(s, s.runEnd!);
    expect(html).toContain('<h1 tabindex="-1">Ship Destroyed</h1>');
    expect(html).toContain("forfeited");
    expect(html).toContain("Hull breach — your ship broke apart.");
  });

  it("headlines by the typed lossCause, not the cause prose", () => {
    // A reworded hull-loss line must still headline as a destruction, not a stranding.
    const s = endRun(
      { ...createGame(42), hull: 0 },
      "lost",
      "Your hull gave out in the dark.",
      "hull"
    );
    expect(runEndScreen(s, s.runEnd!)).toContain('<h1 tabindex="-1">Ship Destroyed</h1>');
  });

  it("headlines a stranding as Stranded", () => {
    const s = checkLoss({ ...createGame(42), location: "vulcan" as const, fuel: 0, credits: 0 });
    expect(runEndScreen(s, s.runEnd!)).toContain('<h1 tabindex="-1">Stranded</h1>');
  });
});

describe("structured log rendering (P2-1)", () => {
  it("renders the entry's declared tone and a signed delta", () => {
    const s = {
      ...createGame(42),
      log: [
        { msg: "Sold 5 Water / Ice for 100cr (tax 5).", tone: "good" as const, delta: 95, day: 1 },
        { msg: "Docked at Meridian, fee 45cr.", tone: "neutral" as const, delta: -45, day: 1 },
        { msg: "Fled — took 16 hull damage.", tone: "bad" as const, day: 1 },
      ],
    };
    const html = stationScreen(s);
    expect(html).toContain(`class="log-line tr-good"`);
    expect(html).toContain(`class="log-line tr-bad"`);
    expect(html).toContain(">+95cr<");
    expect(html).toContain(">−45cr<");
  });

  it("renders no delta span for entries without a delta", () => {
    const s = {
      ...createGame(42),
      log: [{ msg: "Fled — took 16 hull damage.", tone: "bad" as const, day: 1 }],
    };
    const html = stationScreen(s);
    expect(html).not.toContain("log-delta");
  });

  it("the turn report colors lines by entry tone", () => {
    const s = createGame(42);
    const report = [{ msg: "Delivery complete: +500cr.", tone: "good" as const, delta: 500 }];
    const html = stationScreen(s, report);
    expect(html).toContain("tr-good");
    expect(html).toContain(">+500cr<");
  });
});

const META: RunMeta = {
  runNumber: 22,
  runLabel: "The Daily",
  dateLabel: "Jul 22",
  debrief: { pbDelta: 300, isNewPB: true, prevBest: 2440, isFirstEver: false },
};

describe("runEndScreen debrief (E1-3)", () => {
  it("shows the run identity line", () => {
    const s = { ...createGame(42), day: 12 };
    const ended = endRun(s, "audited", "Audited.");
    const html = runEndScreen(ended, ended.runEnd!, false, META);
    expect(html).toContain("Starlight #22");
    expect(html).toContain("Jul 22");
    expect(html).toContain("The Daily");
  });

  // E1-2: the debrief previews the strip that "Copy score card" puts on the clipboard,
  // so a player can see their run's story without pasting it somewhere first.
  it("previews the emoji run-strip, with a spoken summary for assistive tech", () => {
    const s = { ...createGame(42), day: 4, dayHighlights: { 2: "pirates" as const } };
    const ended = endRun(s, "audited", "Audited.");
    const html = runEndScreen(ended, ended.runEnd!, false, META);
    expect(html).toContain('class="run-end__strip"');
    expect(html).toContain("4 days: 1 pirate encounter.");
    expect(html).toContain('aria-hidden="true"'); // the glyphs themselves are not read out
    // One fixed-width cell per day, so the uneven glyph widths still line up as a grid.
    expect(html).toContain(
      '<span class="run-end__day">🟦</span><span class="run-end__day">🟥</span>' +
        '<span class="run-end__day">🟦</span><span class="run-end__day">🟦</span>'
    );
    expect(html.match(/class="run-end__day"/g)).toHaveLength(4);
  });

  // The 💀 is derived from the end status, so the screen has to pass it through to both
  // halves of the strip — a lost run whose final cell is 🟦 means that wiring came undone.
  it("stamps a lost run's final day with 💀, in the glyphs and in the spoken summary", () => {
    const s = { ...createGame(42), day: 3, hull: 0, dayHighlights: { 2: "pirates" as const } };
    const lost = endRun(s, "lost", "Hull breach — your ship broke apart.", "hull");
    const html = runEndScreen(lost, lost.runEnd!, false, META);
    expect(html).toContain("3 days: 1 pirate encounter, lost on the final day.");
    expect(html).toContain(
      '<span class="run-end__day">🟦</span><span class="run-end__day">🟥</span>' +
        '<span class="run-end__day">💀</span>'
    );
    expect(html.match(/class="run-end__day"/g)).toHaveLength(3);
  });

  it("shows a new-personal-best line when isNewPB", () => {
    const s = { ...createGame(42), day: 12 };
    const ended = endRun(s, "audited", "Audited.");
    const html = runEndScreen(ended, ended.runEnd!, false, META);
    expect(html).toContain("New personal best");
  });

  it("shows the first-banked-run line when isFirstEver", () => {
    const s = { ...createGame(42), day: 12 };
    const ended = endRun(s, "audited", "Audited.");
    const meta: RunMeta = {
      ...META,
      debrief: { pbDelta: 0, isNewPB: false, prevBest: 0, isFirstEver: true },
    };
    const html = runEndScreen(ended, ended.runEnd!, false, meta);
    expect(html).toContain("first banked run");
  });

  it("does not claim a banked first run when the first-ever run was a loss", () => {
    const lost = endRun(
      { ...createGame(42), day: 6, hull: 0 },
      "lost",
      "Hull breach — your ship broke apart.",
      "hull"
    );
    const meta: RunMeta = {
      ...META,
      debrief: { pbDelta: 0, isNewPB: false, prevBest: 0, isFirstEver: true },
    };
    const html = runEndScreen(lost, lost.runEnd!, false, meta);
    expect(html).not.toContain("first banked run");
    expect(html).toContain("first run on the board");
  });

  it("shows the best haul when the run had a payday", () => {
    const base = {
      ...createGame(42),
      day: 12,
      biggestPayday: { amount: 2140, label: "Luxury Goods at Meridian" },
    };
    const ended = endRun(base, "audited", "Audited.");
    const html = runEndScreen(ended, ended.runEnd!, false, META);
    expect(html).toContain("2,140cr");
    expect(html).toContain("Luxury Goods at Meridian");
  });

  it("shows an up-delta vs best on an ordinary improving run", () => {
    const s = { ...createGame(42), day: 12 };
    const ended = endRun(s, "audited", "Audited.");
    const meta: RunMeta = {
      ...META,
      debrief: { pbDelta: 150, isNewPB: false, prevBest: 2440, isFirstEver: false },
    };
    const html = runEndScreen(ended, ended.runEnd!, false, meta);
    expect(html).toContain("▲ +150");
    expect(html).toContain("2,440"); // prevBest shown
    expect(html).not.toContain("New personal best");
  });

  it("shows a down-delta vs best when the run fell short", () => {
    const s = { ...createGame(42), day: 12 };
    const ended = endRun(s, "audited", "Audited.");
    const meta: RunMeta = {
      ...META,
      debrief: { pbDelta: -300, isNewPB: false, prevBest: 2440, isFirstEver: false },
    };
    const html = runEndScreen(ended, ended.runEnd!, false, meta);
    expect(html).toContain("▼ 300"); // absolute value, no minus sign
    expect(html).not.toContain("New personal best");
  });
});

describe("share button feedback (P2-4/E3-5)", () => {
  it("labels the button by what actually landed", () => {
    const ended = endRun({ ...createGame(42), day: 12 }, "audited", "Audited.");
    expect(runEndScreen(ended, ended.runEnd!, false, META)).toContain("Copy score card");
    expect(runEndScreen(ended, ended.runEnd!, false, META, "img")).toContain("Copied image ✓");
    expect(runEndScreen(ended, ended.runEnd!, false, META, "text")).toContain("Copied text ✓");
    expect(runEndScreen(ended, ended.runEnd!, false, META, "fail")).toContain("Copy failed");
  });
});

describe("card preview and Save PNG (E3-5)", () => {
  it("renders the hidden preview img with the strip-summary alt text", () => {
    const ended = endRun({ ...createGame(42), day: 12 }, "audited", "Audited.");
    const html = runEndScreen(ended, ended.runEnd!, false, META);
    expect(html).toMatch(/<img id="share-card"[^>]*hidden/);
    expect(html).toMatch(/alt="Starlight #\d+ score card — /);
  });

  it("renders the hidden Save PNG anchor with the run-numbered filename", () => {
    const ended = endRun({ ...createGame(42), day: 12 }, "audited", "Audited.");
    const html = runEndScreen(ended, ended.runEnd!, false, META);
    expect(html).toMatch(/<a id="share-save"[^>]*download="starlight-\d+\.png"[^>]*hidden/);
    expect(html).toContain("Save PNG");
  });
});

describe("runEndScreen restart confirm (P3-3)", () => {
  it("offers a plain New run button when disarmed", () => {
    const ended = endRun({ ...createGame(42), day: 12 }, "audited", "Audited.");
    const html = runEndScreen(ended, ended.runEnd!, false, META);
    expect(html).toContain('data-act="restart"');
    expect(html).not.toContain('data-act="restartConfirm"');
  });

  it("asks for confirmation when armed", () => {
    const ended = endRun({ ...createGame(42), day: 12 }, "audited", "Audited.");
    const html = runEndScreen(ended, ended.runEnd!, true, META);
    expect(html).toContain('data-act="restartConfirm"');
    expect(html).toContain('data-act="restartCancel"');
    expect(html).toContain("Start a Practice run?");
  });
});

describe("retire button (E0-1)", () => {
  it("offers Retire at dock", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain('data-act="retire"');
    expect(html).not.toContain('data-act="retireConfirm"');
  });

  it("shows the confirm step when armed", () => {
    const html = stationScreen(createGame(42), [], "", true);
    expect(html).toContain('data-act="retireConfirm"');
  });
});

describe("eventScreen vitals and stakes (P0-1)", () => {
  const pirates: GameEvent = {
    kind: "pirates",
    title: "Pirate Ambush",
    description: "Raiders demand tribute.",
    choices: [
      { id: "pay", label: "Pay tribute" },
      { id: "flee", label: "Run for it" },
    ],
  };

  it("shows the vitals statbar, not hidden from assistive tech", () => {
    const html = eventScreen(createGame(42), pirates);
    expect(html).toContain('<div class="st-statbar st-statbar--event">');
    expect(html).toContain("Fuel 16/20");
    expect(html).toContain("Hull 100/100");
    expect(html).toContain("800cr");
  });

  it("labels each choice with its stake", () => {
    const s = { ...createGame(42), day: 4 };
    const html = eventScreen(s, pirates);
    expect(html).toContain('<span class="choice-stake st-num">~190cr</span>'); // 150 + 4×10
    expect(html).toContain('<span class="choice-stake st-num">risk 19 hull</span>'); // 15 + 4
  });

  it("omits the stake span for choices without one", () => {
    const quiet: GameEvent = {
      kind: "quiet",
      title: "Quiet Jump",
      description: "The void is calm.",
      choices: [{ id: "ack", label: "Continue" }],
    };
    const html = eventScreen(createGame(42), quiet);
    expect(html).not.toContain("choice-stake");
  });

  it("uses a top-level heading for the event title", () => {
    const html = eventScreen(createGame(42), pirates);
    expect(html).toContain('<h1 tabindex="-1">Pirate Ambush</h1>');
  });

  it("shows odds beside stakes on seeded gambles (E1-4)", () => {
    const s = createGame(42);
    const derelict: GameEvent = {
      kind: "derelict",
      title: "Derelict Hulk",
      description: "d",
      choices: [
        { id: "board", label: "Board it (gamble)" },
        { id: "leave", label: "Leave it be" },
      ],
    };
    expect(eventScreen(s, derelict)).toContain("50/50");
    const salvage: GameEvent = {
      kind: "salvage",
      title: "Salvage Field",
      description: "d",
      choices: [
        { id: "collect", label: "Scoop the debris (gamble)" },
        { id: "ignore", label: "Stay on course" },
      ],
    };
    expect(eventScreen(s, salvage)).toContain("1-in-3 hides a hazard");
  });
});

describe("market quantity buttons (P1-1)", () => {
  it("renders Buy 1 and ×5 buy buttons", () => {
    const s = createGame(42);
    const html = stationScreen(s);
    expect(html).toContain(`data-act="buy" data-id="water" data-qty="1"`);
    expect(html).toContain(`data-act="buy" data-id="water" data-qty="5"`);
  });

  it("no longer renders the buy-max or sell-all buttons", () => {
    const s = { ...createGame(42), cargo: { water: 7, parts: 0, luxury: 0 } };
    const html = stationScreen(s);
    expect(html).not.toContain("Max ×");
    expect(html).not.toContain("All ×");
  });

  it("disables ×5 buy when fewer than 5 are affordable", () => {
    const s = createGame(42);
    const price = getPrice(s.seed, s.day, s.location, "water");
    const html = stationScreen({ ...s, credits: price * 3 });
    expect(html).toContain(
      `data-act="buy" data-id="water" data-qty="5" aria-label="Buy ×5 Water / Ice for ${(5 * price).toLocaleString()}cr" disabled title="Only enough for 3"`
    );
  });

  it("attributes a hold-limited ×5 buy to hold space, not credits", () => {
    // Credits are ample; only 3 slots of hold remain, so the limit is space, not money.
    const s = { ...createGame(42), credits: 100000, cargo: { water: 27, parts: 0, luxury: 0 } };
    const html = stationScreen(s);
    expect(html).toContain(`data-id="water" data-qty="5"`);
    expect(html).toContain(`disabled title="Hold space for only 3"`);
  });

  it("renders Sell 1 and ×5 sell buttons", () => {
    const s = { ...createGame(42), cargo: { water: 7, parts: 0, luxury: 0 } };
    const html = stationScreen(s);
    expect(html).toContain(`data-act="sell" data-id="water" data-qty="1"`);
    expect(html).toContain(`data-act="sell" data-id="water" data-qty="5"`);
  });

  it("disables ×5 sell when fewer than 5 are held", () => {
    const s = { ...createGame(42), cargo: { water: 3, parts: 0, luxury: 0 } };
    const html = stationScreen(s);
    expect(html).toContain(`disabled title="Only 3 in hold"`);
  });

  it("disables buy with the standard reason at zero purchasing power", () => {
    const html = stationScreen({ ...createGame(42), credits: 0 });
    expect(html).toContain(`disabled title="Not enough credits"`);
  });
});

describe("active contract shortfall shortcut (P1-1)", () => {
  const mission: Mission = {
    id: "m2",
    commodity: "water",
    qty: 10,
    destination: "verge",
    reward: 500,
    deposit: 50,
    deadlineDay: 30,
  };

  it("offers a one-click buy of the missing units at the local price", () => {
    const s = withMission(mission, { cargo: { water: 3, parts: 0, luxury: 0 } });
    const price = getPrice(s.seed, s.day, s.location, "water");
    const html = stationScreen(s);
    expect(html).toContain(
      `data-act="buy" data-id="water" data-qty="7" aria-label="Buy 7 Water / Ice for ${(7 * price).toLocaleString()}cr"`
    );
    expect(html).toContain(`buy 7 for ${(7 * price).toLocaleString()}cr`);
  });

  it("disables the shortcut with a reason when unaffordable", () => {
    const s = withMission(mission, { cargo: { water: 3, parts: 0, luxury: 0 }, credits: 0 });
    const html = stationScreen(s);
    expect(html).toContain(`aria-disabled="true" aria-describedby="buy-hint-${mission.id}"`);
    expect(html).toContain("(not enough credits)");
  });

  it("shows no shortcut once the cargo is ready", () => {
    const s = withMission(mission); // helper fills cargo to the full qty
    const html = stationScreen(s);
    expect(html).not.toContain("buy-hint-");
    expect(html).toContain("✓ carrying 10/10");
  });
});

describe("exchange ticker (E1-1 + P2-2a)", () => {
  it("EXCH lane quotes every commodity at the docked station's live price", () => {
    const s = createGame(42);
    const html = stationScreen(s);
    for (const c of COMMODITIES) {
      const price = getPrice(s.seed, s.day, s.location, c.id);
      expect(html).toContain(`${price}`);
    }
    expect(html).toContain("ticker__lane--exch");
  });

  it("day 1 renders the full bulletin statically (the launch surface)", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain("ticker__lane--static");
    expect(html).not.toContain("ticker__marquee");
  });

  it("day 2+ renders the scrolling lane with an accessible pause toggle", () => {
    const s = { ...createGame(42), day: 3 };
    const html = stationScreen(s);
    expect(html).toContain("ticker__marquee");
    expect(html).toContain(`data-act="tickerPause"`);
    expect(html).toContain(`aria-pressed="false"`);
    const paused = stationScreen(s, [], "", false, undefined, true);
    expect(paused).toContain(`aria-pressed="true"`);
    expect(paused).toContain("ticker--paused");
  });

  it("the Trade Hub names the station's produce/demand modifiers and tax (P2-2a)", () => {
    const s = { ...createGame(42), location: "vulcan" as const };
    const html = stationScreen(s);
    expect(html).toContain("Produces Machine Parts (−30%)");
    expect(html).toContain("Buys Water / Ice (+40%)");
    expect(html).toContain("Sales taxed 4%");
  });
});

describe("forecast sinks (P1-2)", () => {
  it("jump orbs carry fuel, destination dock fee, and the true raid chance", () => {
    const html = stationScreen(createGame(42)); // docked at terra
    expect(html).toContain(`${cr2(dockingFee("verge"))} · 25%`);
    expect(html).toContain("5%"); // kiruna's floor from terra, never "0%"
    // Raw danger×100 for verge is gone. Scoped to the orb-meta "· N%" format so a
    // legitimate "▲ 50%" in the EXCH lane can't false-positive this assertion.
    expect(html).not.toContain("· 50%");
  });

  it("meridian's tooltip mentions the sales tax and customs", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain("sells taxed 18%");
    expect(html).toContain("customs patrol this approach");
  });

  it("the debt row shows the interest countdown chip", () => {
    const s = { ...createGame(42), day: 4, debt: 1140 };
    expect(stationScreen(s)).toContain("+69cr in 2d");
  });

  it("no chip at zero debt", () => {
    const s = { ...createGame(42), debt: 0 };
    expect(stationScreen(s)).not.toContain("debt-forecast");
  });

  it("sell buttons state net (post-tax) proceeds", () => {
    const s = { ...createGame(42), cargo: { water: 5, parts: 0, luxury: 0 } };
    const net1 = netProceeds(s, "water", 1);
    expect(stationScreen(s)).toContain(`Sell 1 (${net1.toLocaleString()}cr)`);
  });
});

describe("negative credits warning (B-3)", () => {
  it("marks negative credits in both the statbar and logistics", () => {
    const html = stationScreen({ ...createGame(42), credits: -33 });
    expect(html.match(/credits-negative/g)?.length).toBe(2);
    expect(html).toContain("-33cr");
  });

  it("adds no warning at zero or above", () => {
    const html = stationScreen({ ...createGame(42), credits: 0 });
    expect(html).not.toContain("credits-negative");
  });
});

describe("contract feasibility card (P2-3)", () => {
  it("prints cost, fuel, est. profit, deposit, and days left from missionFeasibility", () => {
    const s = createGame(42);
    const html = stationScreen(s);
    for (const m of missionsHere(s)) {
      const f = missionFeasibility(s, m);
      const est =
        f.estProfit >= 0 ? `est. +${cr2(f.estProfit)}` : `est. −${cr2(Math.abs(f.estProfit))}`;
      expect(html).toContain(
        `cost ~${cr2(f.cargoCost)} · ${f.fuel}⛽ · ${est} · deposit ${cr2(m.deposit)}`
      );
      expect(html).toContain(`${f.daysLeft} days left`);
    }
  });

  it("disables Accept with a reason when credits cannot cover the deposit", () => {
    const s = { ...createGame(42), credits: 0 };
    const html = stationScreen(s);
    const m = missionsHere(s)[0];
    expect(html).toContain(`aria-disabled="true" aria-describedby="accept-hint-${m.id}"`);
    expect(html).toContain(`(need ${cr2(m.deposit)} deposit)`);
  });

  it("keeps Accept enabled when credits exactly cover the deposit", () => {
    // The engine's guard is `credits < deposit`, so a UI-side `>` would disable an accept
    // the engine would honour. Both other tests sit far from the boundary (800 vs 17/91,
    // and 0), so nothing else pins that the two agree at the edge.
    const m = missionsHere(createGame(42))[0];
    const html = stationScreen({ ...createGame(42), credits: m.deposit });
    expect(html).not.toContain(`aria-describedby="accept-hint-${m.id}"`);
    expect(html).not.toContain(`(need ${cr2(m.deposit)} deposit)`);
  });

  it("replaces the Accept button with a confirmation once a contract is taken", () => {
    // The accepted branch now guards the whole feasibility/affordability else-arm, so an
    // inverted check would silently suppress all of it.
    const s = createGame(42);
    const m = missionsHere(s)[0];
    const html = stationScreen({ ...s, activeMissions: [m] });
    expect(html).toContain("✓ Accepted");
    expect(html).not.toContain(`data-act="accept" data-id="${m.id}"`);
  });
});

describe("active contract countdown + provenance (E2-2d/P2-3)", () => {
  const mission: Mission = {
    id: "m3",
    commodity: "water",
    qty: 10,
    destination: "verge",
    reward: 500,
    deposit: 50,
    deadlineDay: 5,
  };

  it("shows days left on the active card, amber at ≤ 2 days", () => {
    const far = withMission(mission); // day 1 → 4 days left
    expect(stationScreen(far)).toContain("4 days left");
    expect(stationScreen(far)).not.toContain("contract-days--amber");
    const near = { ...withMission(mission), day: 3 }; // 2 days left
    expect(stationScreen(near)).toContain(
      `<span class="contract-days contract-days--amber">2 days left</span>`
    );
  });

  it("names dockside units on a ready card before the deliver click", () => {
    const s = {
      ...withMission({ ...mission, destination: "terra" }), // ready at the current dock
      boughtHere: { water: 4, parts: 0, luxury: 0 },
    };
    expect(stationScreen(s)).toContain("✓ carrying 10/10 — 4 bought here pay spot");
  });

  it("keeps the plain ready line when everything was hauled", () => {
    const s = withMission({ ...mission, destination: "terra" });
    expect(stationScreen(s)).toContain("✓ carrying 10/10 — ready,");
  });

  it("renders 3 days left without amber — the threshold is 2, not 3", () => {
    const s = { ...withMission(mission), day: 2 };
    expect(stationScreen(s)).toContain(`<span class="contract-days">3 days left</span>`);
  });

  it("says '1 day left' in the singular", () => {
    const s = { ...withMission(mission), day: 4 };
    expect(stationScreen(s)).toContain(
      `<span class="contract-days contract-days--amber">1 day left</span>`
    );
  });

  it("shows no countdown once the deadline has passed", () => {
    // A bare not.toContain("days left") would fail against correct code — offer cards
    // always carry a chip. Assert only that no negative countdown is rendered.
    const s = { ...withMission(mission), day: 7 }; // deadline 5
    const html = stationScreen(s);
    expect(html).toContain("✗ deadline passed");
    expect(html).not.toMatch(/-\d+ days? left/);
  });

  it("counts only the units settlement would actually pay spot on", () => {
    // Hauling 10 and topping up 4 leaves 14 in the hold: settlement takes the 10 hauled
    // units, so nothing pays spot. Using boughtHere directly would wrongly claim 4.
    const s = {
      ...withMission({ ...mission, destination: "terra" }),
      cargo: { water: 14, parts: 0, luxury: 0 },
      boughtHere: { water: 4, parts: 0, luxury: 0 },
    };
    expect(stationScreen(s)).toContain("✓ carrying 14/10 — ready,");
    expect(stationScreen(s)).not.toContain("bought here pay spot");

    // Haul 8, top up 4 -> 12 in hold, 10 required: 2 of the dockside units get used.
    const partial = { ...s, cargo: { water: 12, parts: 0, luxury: 0 } };
    expect(stationScreen(partial)).toContain("✓ carrying 12/10 — 2 bought here pay spot");
  });

  it("clamps the dockside count to the hold, as settlement does", () => {
    const s = {
      ...withMission({ ...mission, destination: "terra" }),
      boughtHere: { water: 14, parts: 0, luxury: 0 }, // more than the 10 carried
    };
    expect(stationScreen(s)).toContain("✓ carrying 10/10 — 10 bought here pay spot");
  });

  it("does not claim dockside units away from the destination", () => {
    // jump() zeroes boughtHere, so these 4 will be hauled by the time they settle.
    const s = {
      ...withMission(mission), // destination verge, standing at terra
      boughtHere: { water: 4, parts: 0, luxury: 0 },
    };
    expect(stationScreen(s)).not.toContain("bought here pay spot");
  });
});

describe("run-end contracts row (E2-2b)", () => {
  const ended = (contracts: { delivered: number; expired: number; forfeitedCr: number }) => {
    const s = { ...retire({ ...createGame(42), fuel: 20 }), contracts };
    return runEndScreen(s, s.runEnd!);
  };

  it("shows delivered and expired counts with the forfeited total", () => {
    const html = ended({ delivered: 2, expired: 1, forfeitedCr: 25 });
    expect(html).toContain("2 delivered · 1 expired (−25cr deposit)");
  });

  it("omits the forfeit note when nothing was forfeited", () => {
    const html = ended({ delivered: 3, expired: 0, forfeitedCr: 0 });
    expect(html).toContain("3 delivered · 0 expired");
    expect(html).not.toContain("deposit)");
  });

  it("shows the row for an expiry-only run", () => {
    // The E2-2b case: nothing delivered, a bond forfeited. A `delivered > 0` visibility
    // check would hide exactly the run this row exists to explain.
    expect(ended({ delivered: 0, expired: 1, forfeitedCr: 50 })).toContain(
      "0 delivered · 1 expired (−50cr deposit)"
    );
  });

  it("names bonds still open at run end as sunk", () => {
    // Decision 2: there is no refund path outside delivery, so retiring on an open contract
    // is priced. Gating the row on delivered+expired alone hid that money entirely.
    const open: Mission = {
      id: "o1",
      commodity: "water",
      qty: 5,
      destination: "kiruna",
      reward: 500,
      deposit: 50,
      deadlineDay: 99,
    };
    const s = {
      ...retire({ ...createGame(42), fuel: 20 }),
      contracts: { delivered: 0, expired: 0, forfeitedCr: 0 },
      activeMissions: [open, { ...open, id: "o2", deposit: 30 }],
    };
    expect(runEndScreen(s, s.runEnd!)).toContain(
      "0 delivered · 0 expired · 80cr sunk in 2 unfinished"
    );
  });

  it("omits the row entirely when no contract was ever taken", () => {
    expect(ended({ delivered: 0, expired: 0, forfeitedCr: 0 })).not.toContain("Contracts");
  });
});

describe("escape-fare affordances (E2-2h)", () => {
  // Terra's cheapest hop is 3 fuel, so a dry tank holds 24cr back for the fare.
  const dry = (over: Record<string, unknown> = {}) => ({ ...createGame(42), fuel: 0, ...over });

  it("names the held-back fare on the stranding banner", () => {
    const html = stationScreen(dry({ credits: 130 }));
    expect(html).toContain(
      "Not enough fuel to jump anywhere — refuel below (8cr/unit). 24cr of your credits is held back for it."
    );
  });

  it("disables a repair the engine would refuse for eating the fare", () => {
    // 130cr covers the 120cr repair but not the 24cr fare on top, so the engine says no
    // — the button has to say the same thing, and say why (B-1).
    const s = dry({ credits: 130, hull: 80 });
    expect(repair(s, 20)).toBe(s);
    expect(stationScreen(s)).toContain(
      'data-act="repair" disabled title="Credits held back for fuel — 24cr to fly again"'
    );
  });

  it("keeps the plain affordability reason when the purse is simply too small", () => {
    expect(stationScreen(dry({ credits: 10, hull: 80 }))).toContain(
      'data-act="repair" disabled title="Not enough credits"'
    );
  });

  it("disables Pay debt once every credit is spoken for by the fare", () => {
    expect(stationScreen(dry({ credits: 20 }))).toContain(
      'data-act="payDebt" disabled title="Credits held back for fuel — 24cr to fly again"'
    );
  });

  it("keeps Pay debt live for the credits above the fare", () => {
    expect(stationScreen(dry({ credits: 200 }))).not.toContain('data-act="payDebt" disabled');
  });

  it("blocks Accept with the fare reason, not a missing-deposit reason", () => {
    // Seed 42's Terra board offers deposits of 16cr and 77cr (rewards anchor to the
    // day-independent base, E2-2f). At 100cr the purse covers the 77cr bond outright,
    // so only the 24cr fare stands in the way — and the cheap bond beside it stays live,
    // which is what tells the two reasons apart.
    const s = dry({ credits: 100 });
    const [cheap, dear] = missionsHere(s);
    expect([cheap.deposit, dear.deposit]).toEqual([16, 77]);
    const html = stationScreen(s);
    expect(html).toContain(`aria-disabled="true" aria-describedby="accept-hint-${dear.id}"`);
    expect(html).toContain("(deposit would strand you — 24cr is held back for fuel)");
    expect(html).not.toContain(`aria-describedby="accept-hint-${cheap.id}"`);
  });

  it("labels a buy blocked by the fare as held-back credits", () => {
    // Meridian taxes sales 18%, so cargo does not sell back for what it cost: with only
    // the 40cr fare in the purse, even one unit of water strands the run.
    const s = dry({ location: "meridian" as const, credits: 40 });
    expect(getPrice(s.seed, s.day, "meridian", "water")).toBeLessThan(40); // affordable…
    expect(stationScreen(s)).toContain(
      'data-act="buy" data-id="water" data-qty="1" aria-label="Buy 1 Water / Ice" disabled title="Credits held back for fuel"'
    );
  });
});

describe("collapseLog (P3-1b)", () => {
  const sold = {
    msg: "Sold 1 Water / Ice for 18cr (tax 0).",
    tone: "good" as const,
    delta: 18,
    day: 2,
  };

  it("folds consecutive identical lines and sums their deltas", () => {
    const out = collapseLog([sold, sold, sold, { msg: "Docked", tone: "neutral", day: 2 }, sold]);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ msg: sold.msg, count: 3, delta: 54 });
    expect(out[1]).toMatchObject({ msg: "Docked", count: 1 });
    expect(out[2]).toMatchObject({ count: 1, delta: 18 });
  });

  it("keeps delta undefined for non-money runs (no spurious +0)", () => {
    const a = { msg: "x", tone: "neutral" as const, day: 2 };
    const out = collapseLog([a, a]);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(2);
    expect(out[0].delta).toBeUndefined();
  });

  it("a day change breaks a run — collapsed lines never straddle a divider", () => {
    const a = { msg: "x", tone: "neutral" as const, day: 2 };
    const out = collapseLog([a, a, { ...a, day: 3 }]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ count: 2, day: 2 });
    expect(out[1]).toMatchObject({ count: 1, day: 3 });
  });

  it("a tone change breaks a run", () => {
    const a = { msg: "x", tone: "neutral" as const, day: 2 };
    expect(collapseLog([a, { ...a, tone: "bad" as const }])).toHaveLength(2);
  });
});

describe("logPanel rendering (P3-1)", () => {
  it("renders newest-first with a divider per day; day-less legacy lines get none", () => {
    const s = {
      ...createGame(42),
      day: 3,
      log: [
        { msg: "legacy line from before the update", tone: "neutral" as const },
        { msg: "second-day line", tone: "neutral" as const, day: 2 },
        { msg: "third-day line", tone: "neutral" as const, day: 3 },
      ],
    };
    const html = stationScreen(s);
    const d3 = html.indexOf('log-day-divider">Day 3<');
    const d2 = html.indexOf('log-day-divider">Day 2<');
    expect(d3).toBeGreaterThan(-1);
    expect(d2).toBeGreaterThan(d3); // newest day's divider comes first
    expect(html.indexOf("third-day line")).toBeLessThan(html.indexOf("second-day line"));
    expect(html.indexOf("second-day line")).toBeLessThan(html.indexOf("legacy line"));
    expect((html.match(/log-day-divider/g) ?? []).length).toBe(2); // none for the legacy line
  });

  it("dims past-day and legacy lines but not the current day's", () => {
    const s = {
      ...createGame(42),
      day: 3,
      log: [
        { msg: "legacy line", tone: "neutral" as const },
        { msg: "second-day line", tone: "neutral" as const, day: 2 },
        { msg: "third-day line", tone: "neutral" as const, day: 3 },
      ],
    };
    const html = stationScreen(s);
    expect(html).toContain('class="log-line tr-neutral log-line--past"><span>legacy line');
    expect(html).toContain('class="log-line tr-neutral log-line--past"><span>second-day line');
    expect(html).toContain('class="log-line tr-neutral"><span>third-day line');
  });

  it("renders a collapsed run as one line with ×N and the summed delta", () => {
    const refuelLine = {
      msg: "Refueled 2 for 24cr.",
      tone: "neutral" as const,
      delta: -24,
      day: 1,
    };
    const s = { ...createGame(42), log: [refuelLine, refuelLine, refuelLine] };
    const html = stationScreen(s);
    expect(html).toContain("Refueled 2 for 24cr. ×3");
    expect(html).toContain(">−72cr<");
    expect(html).not.toContain("×1");
  });
});

describe("station dossier (E2-4a)", () => {
  it("every station shows its dossier ahead of the unchanged mechanical intel", () => {
    for (const node of NODE_IDS) {
      const s = { ...createGame(42), location: node };
      const html = stationScreen(s);
      expect(html).toContain(`<span class="station-dossier">${STATION_DOSSIERS[node]}</span>`);
      // The mechanical intel survives verbatim next to the voice line.
      const taxPct = Math.round(NODES[node].taxRate * 100);
      expect(html).toContain(taxPct > 0 ? `Sales taxed ${taxPct}%` : "Tax-free port");
    }
  });
});

describe("death epilogue (E2-4d)", () => {
  it("a lost run shows the cause-matched epilogue under the cause line", () => {
    const lostRun = endRun(
      { ...createGame(42), fuel: 0 },
      "lost",
      "Stranded at Terra Hub.",
      "fuel"
    );
    const html = runEndScreen(lostRun, lostRun.runEnd!);
    expect(html).toContain(`<p class="run-end__epilogue">${epilogue(42, "fuel")}</p>`);
    expect(html.indexOf("run-end__cause")).toBeLessThan(html.indexOf("run-end__epilogue"));
  });

  it("banked runs show no epilogue", () => {
    const banked = endRun(createGame(42), "retired", "Retired at Terra Hub.");
    expect(runEndScreen(banked, banked.runEnd!)).not.toContain("run-end__epilogue");
  });
});

describe("active-contract settlement order (E2-2g)", () => {
  const m = (id: string, commodity: "water" | "parts", reward = 400): Mission => ({
    id,
    commodity,
    qty: 2,
    destination: "kiruna",
    reward,
    deposit: 40,
    deadlineDay: 10,
  });

  it("badges appear in accept order when two contracts want the same commodity", () => {
    const s = { ...createGame(42), activeMissions: [m("a", "water"), m("b", "water")] };
    const html = stationScreen(s);
    expect(html).toContain("① settles first");
    expect(html).toContain("②");
    expect(html.indexOf("①")).toBeLessThan(html.indexOf("②"));
  });

  it("no badge renders when active contracts want different commodities", () => {
    const s = { ...createGame(42), activeMissions: [m("a", "water"), m("b", "parts")] };
    const html = stationScreen(s);
    expect(html).not.toContain("settles first");
    expect(html).not.toContain("contract-prio");
  });

  it("no badge renders for a single active contract", () => {
    const s = { ...createGame(42), activeMissions: [m("a", "water")] };
    expect(stationScreen(s)).not.toContain("contract-prio");
  });
});

const banked = (score: number): RunEnd => ({
  status: "audited",
  cause: "Audited.",
  daysSurvived: 12,
  netWorthAtEnd: score,
  survivalBonus: 0,
  score,
});

function logbookMeta(save = emptySave()): RunMeta {
  return {
    runNumber: 40,
    runLabel: "The Daily",
    dateLabel: "Aug 9",
    logbook: {
      cells: calendarCells(save, "2026-08-09"),
      feats: FEATS.map((def) => ({ def, earned: save.feats[def.id] !== undefined })),
    },
  };
}

describe("Logbook panel (E2-5c)", () => {
  it("renders on day 1 with 28 aria-hidden cells and an sr-only summary", () => {
    const html = stationScreen(createGame(42), [], "", false, logbookMeta());
    expect(html).toContain("Logbook");
    expect((html.match(/class="cal-cell/g) ?? []).length).toBe(28);
    expect(html).toContain('<div class="logbook-cal" aria-hidden="true">');
    expect(html).toContain("today's board is open");
  });

  it("does not render after day 1", () => {
    const s = { ...createGame(42), day: 2 };
    expect(stationScreen(s, [], "", false, logbookMeta())).not.toContain("Logbook");
  });

  it("marks a flown day's cell with its outcome tone and titles it with the score", () => {
    const meta = logbookMeta(recordRunEnd(emptySave(), "2026-08-03", banked(2140)).save);
    const html = stationScreen(createGame(42), [], "", false, meta);
    expect(html).toContain("cal-cell--banked");
    expect(html).toContain('title="Aug 3 — best 2,140 · 1 attempt"');
  });

  it("lists every feat — earned lit, unearned dimmed with its hint", () => {
    const html = stationScreen(createGame(42), [], "", false, logbookMeta());
    expect((html.match(/class="feat-chip/g) ?? []).length).toBe(FEATS.length);
    expect(html).toContain("Fill the hold to capacity.");
    expect(html).toContain(`>0/${FEATS.length}<`);
  });
});

describe("run-end feat unlocks (E2-5d)", () => {
  const debrief = { pbDelta: 0, isNewPB: false, prevBest: 0, isFirstEver: true };
  const meta = (newFeats: FeatId[]): RunMeta => ({
    runNumber: 40,
    runLabel: "The Daily",
    dateLabel: "Aug 9",
    debrief: { ...debrief, newFeats },
  });
  const endedState = retire(createGame(42));

  it("lists up to three new feats by name", () => {
    const html = runEndScreen(
      endedState,
      endedState.runEnd!,
      false,
      meta(["audited", "clean-books"])
    );
    expect(html).toContain("★ Feat unlocked: Face the Audit");
    expect(html).toContain("★ Feat unlocked: Clean Books");
    expect(html).not.toContain("+1 more");
  });

  it("caps at three lines with a +N more overflow", () => {
    const html = runEndScreen(
      endedState,
      endedState.runEnd!,
      false,
      meta(["audited", "clean-books", "full-house", "grand-tour", "untouched"])
    );
    expect((html.match(/★ Feat unlocked:/g) ?? []).length).toBe(3);
    expect(html).toContain("+2 more");
  });

  it("renders nothing when no feat is new", () => {
    const html = runEndScreen(endedState, endedState.runEnd!, false, meta([]));
    expect(html).not.toContain("Feat unlocked");
  });
});

describe("market depth + P&L surfaces (E2-1c/P2-2b)", () => {
  it("an untouched market names its full depth at list", () => {
    const s = createGame(42);
    const html = stationScreen(s);
    const price = getPrice(s.seed, s.day, s.location, "water");
    expect(html).toContain(`buys ${MARKET_DEPTH} at ${price.toLocaleString()}cr`);
  });

  it("a part-consumed market counts down and warns of the fall", () => {
    const s = { ...createGame(42), soldHere: { water: 6, parts: 0, luxury: 0 } };
    const html = stationScreen(s);
    const price = getPrice(s.seed, s.day, s.location, "water");
    expect(html).toContain(`${MARKET_DEPTH - 6} more at ${price.toLocaleString()}cr, then falling`);
  });

  it("a saturated market shows the exact next-unit price", () => {
    const s = { ...createGame(42), soldHere: { water: MARKET_DEPTH + 4, parts: 0, luxury: 0 } };
    const html = stationScreen(s);
    const next = saleProceeds(s, "water", 1).gross;
    expect(html).toContain(`next unit ${next.toLocaleString()}cr ▼`);
  });

  it("held cargo shows avg paid and a depth-and-tax-honest P&L chip", () => {
    const base = createGame(42);
    const s = {
      ...base,
      cargo: { ...base.cargo, water: 10 },
      costBasis: { water: 100, parts: 0, luxury: 0 },
    };
    const html = stationScreen(s);
    const pnl = netProceeds(s, "water", 10) - 100;
    expect(html).toContain("paid ~10cr/u");
    expect(html).toContain(`${pnl >= 0 ? "▲ +" : "▼ −"}${Math.abs(pnl).toLocaleString()}cr`);
  });

  it("empty rows carry neither basis nor P&L", () => {
    const html = stationScreen(createGame(42));
    expect(html).not.toContain("paid ~");
  });
});

describe("statbar heat + peak chips (E1-5 / P2-4)", () => {
  const rich = { ...createGame(42), peakNetWorth: 6249 };

  it("always shows peak net worth, so the number driving danger is visible", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain("🏆");
    expect(html).toContain("0cr"); // a fresh run's peak
    expect(stationScreen(rich)).toContain("6,249cr");
  });

  it("shows the heat chip only once heat exists, with the % the lanes actually carry", () => {
    expect(stationScreen(createGame(42))).not.toContain("heat +");
    const html = stationScreen(rich);
    expect(html).toContain("heat +4%");
  });

  it("announces heat to screen readers, since the statbar is aria-hidden here", () => {
    const html = stationScreen(rich);
    expect(html).toMatch(/st-sr-only[^>]*>[^<]*heat/i);
  });

  it("steps the chip with the peak", () => {
    const s = { ...createGame(42), peakNetWorth: HEAT_PER_CR * 9 };
    expect(stationScreen(s)).toContain("heat +9%");
  });
});

describe("danger pips (P3-2)", () => {
  it("gives every jump orb a pip group in the lane's tier", () => {
    const html = stationScreen(createGame(42));
    // terra→kiruna is 0.05 (safe); terra→verge is 0.25 (hot)
    expect(html).toContain('class="st-orb__pips st-orb__pips--safe"');
    expect(html).toContain('class="st-orb__pips st-orb__pips--hot"');
  });

  it("reddens the pips as heat climbs, with no change to the announced text", () => {
    const rich = { ...createGame(42), peakNetWorth: 6249 }; // heat 0.04 → 0.05 + 0.04 = 0.09
    const html = stationScreen(rich);
    expect(html).toContain('class="st-orb__pips st-orb__pips--safe"'); // 0.09 still < 0.10
    const hotter = { ...createGame(42), peakNetWorth: 22_500 }; // heat 0.15 → 0.20
    expect(stationScreen(hotter)).toContain('class="st-orb__pips st-orb__pips--warn"');
  });

  it("keeps pips out of the accessibility tree — the raid % already says it", () => {
    const html = stationScreen(createGame(42));
    expect(html).toMatch(/<span class="st-orb__pips[^"]*" aria-hidden="true">/);
  });
});

describe("statbar vital pulses (P3-2)", () => {
  it("marks the moved stat for a one-shot pulse (P3-2)", () => {
    const html = stationScreen(createGame(42), [], "", false, undefined, false, { credits: "up" });
    expect(html).toContain("st-statbar__chip--pulse-up");
    expect(stationScreen(createGame(42))).not.toContain("st-statbar__chip--pulse");
  });
});

describe("distress call surfaces (E3-3)", () => {
  const ev: GameEvent = {
    kind: "distress",
    title: "Distress Call",
    description: "A thin voice on the open channel.",
    choices: [
      { id: "answer", label: "Answer the call (divert)" },
      { id: "ignore", label: "Hold your course" },
    ],
  };

  it("shows the stake and the odds on an affordable answer", () => {
    const html = eventScreen({ ...createGame(42), fuel: 10 }, ev);
    expect(html).toContain("−2⛽, −1 day");
    expect(html).toContain("60/40");
    expect(html).not.toContain("disabled");
  });

  it("disables the answer below the fuel cost, with the honest reason", () => {
    const html = eventScreen({ ...createGame(42), fuel: 1 }, ev);
    // aria-disabled (not plain `disabled`) keeps it focusable so a screen reader
    // announces the reason via aria-describedby — the P0-2 shortfall-buy pattern.
    expect(html).toMatch(/data-id="answer"[^>]*aria-disabled="true"/);
    expect(html).toMatch(/data-id="answer"[^>]*aria-describedby="choice-hint-answer"/);
    expect(html).toContain('id="choice-hint-answer"');
    expect(html).toContain("Need 2⛽, have 1");
    expect(html).not.toMatch(/data-id="ignore"[^>]*aria-disabled/);
  });
});
