import { describe, it, expect } from "vitest";
import { Archetype, runArchetype } from "../../src/sim/simulate";

const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);
const ALL: Archetype[] = ["cautious", "balanced", "greedy"];

describe("bounded-run balance sweep (E0-1 acceptance)", () => {
  it("every run ends by day 12 — no archetype outlives the audit", () => {
    for (const kind of ALL) {
      for (const seed of SEEDS) {
        const r = runArchetype(kind, seed);
        expect(r.status, `${kind} seed ${seed}`).not.toBe("playing");
        expect(r.daysSurvived, `${kind} seed ${seed}`).toBeLessThanOrEqual(12);
      }
    }
  });

  it("at least 95% of cautious and balanced runs reach the audit alive", () => {
    for (const kind of ["cautious", "balanced"] as Archetype[]) {
      const audited = SEEDS.filter((s) => runArchetype(kind, s).status === "audited").length;
      expect(audited, kind).toBeGreaterThanOrEqual(95);
    }
  });

  it("greedy death rate before day 12 lands between 10% and 40%", () => {
    const dead = SEEDS.filter((s) => runArchetype("greedy", s).status === "lost").length;
    expect(dead).toBeGreaterThanOrEqual(10);
    expect(dead).toBeLessThanOrEqual(40);
  });

  it("greedy outearns cautious across the sweep (spread is not inverted)", () => {
    let greedy = 0;
    let cautious = 0;
    for (const seed of SEEDS) {
      greedy += runArchetype("greedy", seed).peakNetWorth;
      cautious += runArchetype("cautious", seed).peakNetWorth;
    }
    expect(greedy).toBeGreaterThan(cautious);
  });
});
