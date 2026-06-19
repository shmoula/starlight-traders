import { describe, it, expect } from "vitest";
import { rollEvent } from "../../src/engine/events";

describe("rollEvent", () => {
  it("is deterministic for the same seed/day/route", () => {
    const a = rollEvent(3, 5, "terra", "verge");
    const b = rollEvent(3, 5, "terra", "verge");
    expect(a.kind).toBe(b.kind);
  });

  it("always returns a known event kind with at least one choice", () => {
    const known = ["quiet", "pirates", "salvage", "derelict", "customs", "engine"];
    for (let day = 1; day <= 60; day++) {
      const e = rollEvent(11, day, "terra", "verge");
      expect(known).toContain(e.kind);
      expect(e.choices.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("produces more pirate events on high-danger routes than safe ones", () => {
    let dangerous = 0, safe = 0;
    for (let day = 1; day <= 200; day++) {
      if (rollEvent(2, day, "terra", "verge").kind === "pirates") dangerous++;
      if (rollEvent(2, day, "terra", "kiruna").kind === "pirates") safe++;
    }
    expect(dangerous).toBeGreaterThan(safe);
  });

  it("only fires customs on routes into meridian", () => {
    let customsElsewhere = 0;
    for (let day = 1; day <= 200; day++) {
      if (rollEvent(4, day, "terra", "kiruna").kind === "customs") customsElsewhere++;
    }
    expect(customsElsewhere).toBe(0);
  });
});
