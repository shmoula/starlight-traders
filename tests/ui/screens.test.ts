import { describe, it, expect } from "vitest";
import { stationScreen } from "../../src/ui/screens";
import { createGame, missionsHere } from "../../src/engine/game";
import { COMMODITIES, NODES } from "../../src/engine/world";

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
        `aria-label="Accept contract: deliver ${m.qty} ${m.commodity} to ${NODES[m.destination].name}"`
      );
    }
  });
});
