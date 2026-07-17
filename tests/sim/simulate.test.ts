import { describe, it, expect } from "vitest";
import { runArchetype } from "../../src/sim/simulate";

describe("balance simulation", () => {
  it("cautious players (water-only safe loop) trend toward losing", () => {
    // Average peak net worth across seeds should be modest / often negative-trending.
    let survivedLong = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const r = runArchetype("cautious", seed, 30);
      if (r.daysSurvived >= 25) survivedLong++;
    }
    // The safety loop should NOT trivially survive every run to day 25.
    expect(survivedLong).toBeLessThan(30);
  });

  it("greedy arbitrage players reach higher peak net worth than cautious on average", () => {
    let greedy = 0,
      cautious = 0;
    for (let seed = 1; seed <= 30; seed++) {
      greedy += runArchetype("greedy", seed, 30).peakNetWorth;
      cautious += runArchetype("cautious", seed, 30).peakNetWorth;
    }
    expect(greedy).toBeGreaterThan(cautious);
  });

  it("every run terminates (no infinite loop) and reports a score", () => {
    const r = runArchetype("balanced", 5, 30);
    expect(r.daysSurvived).toBeGreaterThan(0);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
