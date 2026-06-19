import { describe, it, expect } from "vitest";
import { generateMissions } from "../../src/engine/missions";

describe("generateMissions", () => {
  it("is deterministic for the same seed/day/node", () => {
    const a = generateMissions(5, 3, "terra");
    const b = generateMissions(5, 3, "terra");
    expect(a).toEqual(b);
  });

  it("returns 1-3 missions whose destination is never the origin", () => {
    for (let day = 1; day <= 20; day++) {
      const ms = generateMissions(9, day, "terra");
      expect(ms.length).toBeGreaterThanOrEqual(1);
      expect(ms.length).toBeLessThanOrEqual(3);
      ms.forEach((m) => expect(m.destination).not.toBe("terra"));
    }
  });

  it("gives positive reward, qty, and a future deadline", () => {
    const ms = generateMissions(1, 2, "vulcan");
    ms.forEach((m) => {
      expect(m.reward).toBeGreaterThan(0);
      expect(m.qty).toBeGreaterThan(0);
      expect(m.deadlineDay).toBeGreaterThan(2);
    });
  });
});
