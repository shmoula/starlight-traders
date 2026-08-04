import { describe, it, expect } from "vitest";
import { CREW_ROSTER, crewName, capFirst, epilogue } from "../../src/engine/fiction";

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);

describe("crewName (E2-4b)", () => {
  it("every roster name is non-empty and ≤ 16 chars (bulletin line budget)", () => {
    expect(CREW_ROSTER.length).toBeGreaterThanOrEqual(10);
    for (const name of CREW_ROSTER) {
      expect(name.length).toBeGreaterThan(0);
      expect(name.length, name).toBeLessThanOrEqual(16);
    }
  });

  it("is deterministic per seed and varies across seeds", () => {
    const names = new Set(SEEDS.map((s) => crewName(s)));
    expect(crewName(42)).toBe(crewName(42));
    expect(names.size).toBeGreaterThanOrEqual(2);
    for (const n of names) expect(CREW_ROSTER).toContain(n);
  });
});

describe("capFirst", () => {
  it("upper-cases only the first character", () => {
    expect(capFirst("the Red Kestrel")).toBe("The Red Kestrel");
    expect(capFirst("")).toBe("");
  });
});

describe("epilogue (E2-4d)", () => {
  it("is deterministic per (seed, cause), varies across seeds, and stays ≤ 160 chars", () => {
    for (const cause of ["hull", "fuel"] as const) {
      expect(epilogue(42, cause)).toBe(epilogue(42, cause));
      const texts = new Set(SEEDS.map((s) => epilogue(s, cause)));
      expect(texts.size).toBeGreaterThanOrEqual(2);
      for (const t of texts) {
        expect(t.length).toBeGreaterThan(0);
        expect(t.length, t).toBeLessThanOrEqual(160);
      }
    }
  });

  it("hull and fuel epilogues are distinct pools", () => {
    const hull = new Set(SEEDS.map((s) => epilogue(s, "hull")));
    const fuel = new Set(SEEDS.map((s) => epilogue(s, "fuel")));
    for (const t of hull) expect(fuel.has(t)).toBe(false);
  });
});
