import { describe, it, expect } from "vitest";
import {
  MODIFIER_POOL,
  dailyModifier,
  fuelDelta,
  priceMultiplier,
} from "../../src/engine/modifiers";

describe("daily modifiers (E3-1)", () => {
  it("is deterministic per seed and covers the whole pool across seeds", () => {
    expect(dailyModifier(42)).toBe(dailyModifier(42));
    const seen = new Set(Array.from({ length: 200 }, (_, i) => dailyModifier(i + 1).id));
    for (const m of MODIFIER_POOL) expect(seen.has(m.id), m.id).toBe(true);
  });

  it("maps the reference seeds the rest of this round's tests rely on", () => {
    expect(dailyModifier(42).id).toBe("clearSkies");
    expect(dailyModifier(1).id).toBe("ionStorms");
    expect(dailyModifier(10).id).toBe("luxuryBoom");
    expect(dailyModifier(4).id).toBe("partsGlut");
    expect(dailyModifier(9).id).toBe("amnesty");
    expect(dailyModifier(6).id).toBe("corsairSeason");
    expect(dailyModifier(3).id).toBe("syndicateRest");
  });

  it("bulletin lines are TODAY:-prefixed and ≤70 chars", () => {
    for (const m of MODIFIER_POOL) {
      expect(m.bulletinLine.startsWith("TODAY: "), m.id).toBe(true);
      expect(m.bulletinLine.length, m.id).toBeLessThanOrEqual(70);
    }
  });

  it("accessors expose exactly the authored effects", () => {
    expect(fuelDelta(1)).toBe(1); // ionStorms
    expect(fuelDelta(42)).toBe(0); // clearSkies
    expect(priceMultiplier(10, "meridian", "luxury")).toBe(1.25); // luxuryBoom
    expect(priceMultiplier(10, "meridian", "parts")).toBe(1);
    expect(priceMultiplier(10, "verge", "luxury")).toBe(1);
    expect(priceMultiplier(4, "vulcan", "parts")).toBe(0.8); // partsGlut
    expect(priceMultiplier(42, "vulcan", "parts")).toBe(1); // clearSkies
  });
});
