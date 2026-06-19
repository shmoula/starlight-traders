import { describe, it, expect } from "vitest";
import { mulberry32, dailySeed, hashSeed } from "../../src/engine/rng";

describe("mulberry32", () => {
  it("is deterministic for the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });

  it("returns floats in [0,1)", () => {
    const r = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("produces different streams for different seeds", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe("hashSeed", () => {
  it("combines numbers into a stable 32-bit seed", () => {
    expect(hashSeed(1, 2, 3)).toBe(hashSeed(1, 2, 3));
    expect(hashSeed(1, 2, 3)).not.toBe(hashSeed(3, 2, 1));
  });
});

describe("dailySeed", () => {
  it("is stable within a calendar day and changes across days (UTC)", () => {
    const d1 = dailySeed(new Date("2026-06-18T09:00:00Z"));
    const d2 = dailySeed(new Date("2026-06-18T23:00:00Z"));
    const d3 = dailySeed(new Date("2026-06-19T00:00:00Z"));
    expect(d1).toBe(d2);
    expect(d1).not.toBe(d3);
  });
});
