// tests/engine/feats.test.ts
import { describe, it, expect } from "vitest";
import {
  FEATS,
  LEDGER_FEAT_IDS,
  earnedFeats,
  featDef,
  CLEAN_SWEEP_DELIVERIES,
  GAUNTLET_AMBUSHES,
  HIGH_ROLLER_SCORE,
} from "../../src/engine/feats";
import { createGame, VERGE_LOW_HULL } from "../../src/engine/game";
import { endRun } from "../../src/engine/run-end";
import { GameState } from "../../src/engine/types";

/** A finished (banked) state with record/field overrides applied before the audit. */
function ended(
  overrides: Partial<GameState> = {},
  status: "audited" | "retired" | "lost" = "audited"
): GameState {
  const s = { ...createGame(42), day: 12, ...overrides };
  return status === "lost" ? endRun(s, "lost", "x", "hull") : endRun(s, status, "x");
}
const rec = (patch: Partial<GameState["records"]>): Partial<GameState> => ({
  records: { ...createGame(42).records, ...patch },
});

describe("registry shape", () => {
  it("holds exactly 12 feats with unique ids", () => {
    expect(FEATS).toHaveLength(12);
    expect(new Set(FEATS.map((f) => f.id)).size).toBe(12);
  });
  it("every name fits the 20-char share budget", () => {
    for (const f of FEATS) expect(f.name.length).toBeLessThanOrEqual(20);
  });
  it("exactly the two ledger feats carry no predicate", () => {
    const noPredicate = FEATS.filter((f) => f.earned === undefined).map((f) => f.id);
    expect(noPredicate.sort()).toEqual([...LEDGER_FEAT_IDS].sort());
  });
  it("featDef resolves every id", () => {
    for (const f of FEATS) expect(featDef(f.id)).toBe(f);
  });
});

describe("earnedFeats", () => {
  it("is empty while the run is playing", () => {
    expect(earnedFeats(createGame(42))).toEqual([]);
  });
  it("audited: earned by an audit, not by a retire", () => {
    expect(earnedFeats(ended())).toContain("audited");
    expect(earnedFeats(ended({}, "retired"))).not.toContain("audited");
  });
  it("clean-sweep: needs the delivery count", () => {
    const c = { delivered: CLEAN_SWEEP_DELIVERIES, expired: 0, forfeitedCr: 0 };
    expect(earnedFeats(ended({ contracts: c }))).toContain("clean-sweep");
    expect(
      earnedFeats(ended({ contracts: { ...c, delivered: CLEAN_SWEEP_DELIVERIES - 1 } }))
    ).not.toContain("clean-sweep");
  });
  it("debt-free-8: cleared day 8 counts, day 9 doesn't, never doesn't", () => {
    expect(earnedFeats(ended(rec({ debtClearedDay: 8 })))).toContain("debt-free-8");
    expect(earnedFeats(ended(rec({ debtClearedDay: 9 })))).not.toContain("debt-free-8");
    expect(earnedFeats(ended())).not.toContain("debt-free-8");
  });
  it("clean-books: banked with zero debt; a debt-free death doesn't count", () => {
    expect(earnedFeats(ended({ debt: 0 }))).toContain("clean-books");
    expect(earnedFeats(ended({ debt: 1 }))).not.toContain("clean-books");
    expect(earnedFeats(ended({ debt: 0 }, "lost"))).not.toContain("clean-books");
  });
  it("verge-runner: the low-hull docking must be survived", () => {
    expect(earnedFeats(ended(rec({ vergeAtLowHull: true })))).toContain("verge-runner");
    expect(earnedFeats(ended(rec({ vergeAtLowHull: true }), "lost"))).not.toContain("verge-runner");
    expect(earnedFeats(ended())).not.toContain("verge-runner");
  });
  it("untouched: zero damage banked; any damage or a loss disqualifies", () => {
    expect(earnedFeats(ended())).toContain("untouched");
    expect(earnedFeats(ended(rec({ damageTaken: 1 })))).not.toContain("untouched");
    expect(earnedFeats(ended({}, "lost"))).not.toContain("untouched");
  });
  it("full-house and grand-tour read their records", () => {
    expect(earnedFeats(ended(rec({ fullHold: true })))).toContain("full-house");
    expect(earnedFeats(ended())).not.toContain("full-house");
    const allFive = ["terra", "kiruna", "vulcan", "verge", "meridian"] as const;
    expect(earnedFeats(ended(rec({ visited: [...allFive] })))).toContain("grand-tour");
    expect(earnedFeats(ended())).not.toContain("grand-tour");
  });
  it("gauntlet: the ambush count must be survived", () => {
    expect(earnedFeats(ended(rec({ pirateAmbushes: GAUNTLET_AMBUSHES })))).toContain("gauntlet");
    expect(earnedFeats(ended(rec({ pirateAmbushes: GAUNTLET_AMBUSHES - 1 })))).not.toContain(
      "gauntlet"
    );
    expect(earnedFeats(ended(rec({ pirateAmbushes: GAUNTLET_AMBUSHES }), "lost"))).not.toContain(
      "gauntlet"
    );
  });
  it("high-roller keys on the banked score", () => {
    expect(earnedFeats(ended({ credits: HIGH_ROLLER_SCORE + 5000 }))).toContain("high-roller");
    expect(earnedFeats(ended({ credits: 0 }))).not.toContain("high-roller");
  });
  it("hints reference the live thresholds", () => {
    expect(featDef("verge-runner").hint).toContain(String(VERGE_LOW_HULL));
  });
});
