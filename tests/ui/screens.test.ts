import { describe, it, expect } from "vitest";
import { stationScreen, eventScreen, runEndScreen } from "../../src/ui/screens";
import { createGame, missionsHere } from "../../src/engine/game";
import { COMMODITIES, NODES, commodityName } from "../../src/engine/world";
import { GameEvent, Mission } from "../../src/engine/types";

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
    const html = stationScreen(createGame(42));
    for (const c of COMMODITIES) {
      expect(html).toContain(`aria-label="Buy 1 ${c.name}"`);
      expect(html).toContain(`aria-label="Sell 1 ${c.name}"`);
    }
  });

  it("gives each Accept button an accessible name describing the contract", () => {
    const s = createGame(42);
    const offered = missionsHere(s);
    expect(offered.length).toBeGreaterThan(0);
    const html = stationScreen(s);
    for (const m of offered) {
      expect(html).toContain(
        `aria-label="Accept contract: deliver ${m.qty} ${commodityName(m.commodity)} to ${NODES[m.destination].name}"`
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
    const html = stationScreen(createGame(42), ["Docked at verge, fee 18cr."]);
    expect(html).toContain('class="turn-report"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Docked at verge, fee 18cr.");
  });

  it("omits the banner when nothing happened this turn", () => {
    const html = stationScreen(createGame(42), []);
    expect(html).not.toContain("turn-report");
  });

  it("colors a harmful outcome as bad and a gain as good", () => {
    const html = stationScreen(createGame(42), [
      "Derelict was a trap: -20 hull.",
      "Delivery complete: +860cr.",
    ]);
    expect(html).toContain('class="tr-line tr-bad"');
    expect(html).toContain('class="tr-line tr-good"');
  });

  it("treats loan interest as a loss", () => {
    const html = stationScreen(createGame(42), ["Loan interest: debt grows 60cr."]);
    expect(html).toContain('class="tr-line tr-bad"');
  });
});

describe("stationScreen ship's log", () => {
  it("renders a titled, labelled log section", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain('aria-label="Ship\'s log"');
    expect(html).toContain("Ship's Log");
    expect(html).toContain("You launch from Terra Hub");
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
    // expands the fuel/danger figures for screen readers (kept a substring-suffix
    // so the visible text still matches the accessible name — WCAG 2.5.3).
    expect(html).toContain('<span class="st-orb__label">Kiruna Belt</span>');
    expect(html).toContain('<span class="st-sr-only"> — jump here, 4 fuel, danger 0%</span>');
    expect(html).toContain('<span class="st-sr-only"> — jump here, 6 fuel, danger 50%</span>');
    // No jump control targets the current station (mission ids may contain node
    // names, so scope the assertion to the jump prefix).
    expect(html).not.toContain('data-act="jump" data-id="terra"');
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

describe("event and run-end cards", () => {
  const event: GameEvent = {
    kind: "pirates",
    title: "Pirate ambush",
    description: "A cutter locks on.",
    choices: [{ id: "flee", label: "Flee" }],
  };

  it("wraps the event in a chamfered card and keeps resolve hooks", () => {
    const html = eventScreen(event);
    expect(html).toContain("st-panel--chamfer");
    expect(html).toContain('class="event-card"');
    expect(html).toContain('data-act="resolve" data-id="flee"');
  });

  it("wraps the run-end in a chamfered card and keeps restart/share hooks", () => {
    // Score 999 avoids locale-dependent thousands separators from toLocaleString.
    const html = runEndScreen(createGame(42), 999);
    expect(html).toContain("st-panel--chamfer");
    expect(html).toContain('class="run-end"');
    expect(html).toContain('data-act="share"');
    expect(html).toContain('data-act="restart"');
    expect(html).toContain("Score: 999");
  });
});
