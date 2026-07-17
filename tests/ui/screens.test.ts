import { describe, it, expect } from "vitest";
import { stationScreen } from "../../src/ui/screens";
import { createGame, missionsHere } from "../../src/engine/game";
import { COMMODITIES, NODES, commodityName } from "../../src/engine/world";

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

  it("treats loan interest as a loss despite the +cr sign", () => {
    const html = stationScreen(createGame(42), ["Loan interest: debt +60cr."]);
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
