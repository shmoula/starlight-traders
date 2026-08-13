import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Archetype, runArchetype, sweepSummary, viableLoops } from "../../src/sim/simulate";
import { dailyModifier } from "../../src/engine/modifiers";

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

  // Modest bite: the water turtle ends near −debt, so its net worth is debt-dominated and the
  // daily modifiers now offset depth's bite (see the anchor gate below). The strong "market
  // pushes back" proof is the balanced gate (−18%). Do not re-tighten toward a trade-only decay.
  // Re-anchored for M4 r1. The daily modifiers legitimately lift the debt-dominated water
  // turtle: amnesty spares its pirate tolls and syndicateRest spares its interest on ~32 of
  // 100 seeds, offsetting market depth's ~6k bite — so the pre-round "cautious sinks 5k below
  // pre-depth" gate no longer holds. Measured post-M4r1: cautious netWorthSum = -189973 vs
  // pre-depth -190880 (+907). The load-bearing "market pushes back" proof is the balanced gate
  // below (-18%). Here we only guard that the turtle stays ANCHORED to its debt-dominated floor
  // — neither the depth bite nor the modifier weather lets it run away rich or collapse. Band is
  // ~10x the observed +907 drift.
  it("the water turtle stays anchored to its pre-depth debt floor (modifiers offset depth)", () => {
    expect(Math.abs(post.cautious.netWorthSum - base.cautious.netWorthSum)).toBeLessThan(10_000);
  });

  it("depth touches monoculture dumps across the board: balanced earns less than baseline", () => {
    expect(post.balanced.netWorthSum).toBeLessThan(base.balanced.netWorthSum);
  });

  it("the map is not collapsed: balanced keeps most of its baseline earnings", () => {
    expect(post.balanced.netWorthSum).toBeGreaterThanOrEqual(0.55 * base.balanced.netWorthSum);
  });
});

describe("route viability (E2-1 acceptance)", () => {
  it("every day offers at least 2 profitable first-hold loops at list price", () => {
    for (const seed of SEEDS) {
      for (let day = 1; day <= 11; day++) {
        expect(viableLoops(seed, day), `seed ${seed} day ${day}`).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe("per-modifier fairness (E3-1 acceptance)", () => {
  it("no modifier day-type drops cautious+balanced audit rate below 90%", () => {
    const bySlot = new Map<string, number[]>();
    for (const seed of SEEDS) {
      const id = dailyModifier(seed).id;
      if (!bySlot.has(id)) bySlot.set(id, []);
      bySlot.get(id)!.push(seed);
    }
    expect(bySlot.size).toBe(7); // salt 0x7007 covers the pool over seeds 1–100
    for (const [id, seeds] of bySlot) {
      let audited = 0;
      let total = 0;
      for (const kind of ["cautious", "balanced"] as Archetype[]) {
        for (const seed of seeds) {
          total++;
          if (runArchetype(kind, seed).status === "audited") audited++;
        }
      }
      expect(audited / total, id).toBeGreaterThanOrEqual(0.9); // ⚙
    }
  });
});
