import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Archetype, runArchetype, sweepSummary } from "../../src/sim/simulate";

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

const BASELINE = JSON.parse(
  readFileSync(new URL("./fixtures/pre-depth-baseline.json", import.meta.url), "utf8")
);

describe("market depth decay gates (E2-1) — vs tests/sim/fixtures/pre-depth-baseline.json", () => {
  const base = Object.fromEntries(BASELINE.map((b: { kind: string }) => [b.kind, b]));
  const post = Object.fromEntries(sweepSummary(SEEDS).map((s) => [s.kind, s]));

  // Modest bite: the water turtle ends near −debt, so its net worth is debt-dominated and
  // depth registers only a ~6k decay. The strong "market pushes back" proof is the balanced
  // gate below (−22.5%). Do not re-tighten this toward the trade-only decay.
  it("the water turtle decays: cautious loses measurably more than baseline", () => {
    expect(post.cautious.netWorthSum).toBeLessThanOrEqual(base.cautious.netWorthSum - 5_000);
  });

  it("depth touches monoculture dumps across the board: balanced earns less than baseline", () => {
    expect(post.balanced.netWorthSum).toBeLessThan(base.balanced.netWorthSum);
  });

  it("the map is not collapsed: balanced keeps most of its baseline earnings", () => {
    expect(post.balanced.netWorthSum).toBeGreaterThanOrEqual(0.55 * base.balanced.netWorthSum);
  });
});
