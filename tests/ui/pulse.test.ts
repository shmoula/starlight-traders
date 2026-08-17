import { describe, it, expect } from "vitest";
import { vitalsOf, vitalPulses } from "../../src/ui/pulse";
import { createGame } from "../../src/engine/game";

describe("vitalPulses (P3-2)", () => {
  const base = vitalsOf(createGame(42));

  it("pulses nothing on the first paint, when there is no previous state", () => {
    expect(vitalPulses(null, base)).toEqual({});
  });

  it("pulses nothing when nothing moved", () => {
    expect(vitalPulses(base, { ...base })).toEqual({});
  });

  it("keys each changed vital by the sign of its delta", () => {
    expect(vitalPulses(base, { ...base, credits: base.credits + 860 })).toEqual({ credits: "up" });
    expect(vitalPulses(base, { ...base, credits: base.credits - 23 })).toEqual({ credits: "down" });
    expect(vitalPulses(base, { ...base, hull: base.hull - 20 })).toEqual({ hull: "down" });
  });

  it("reports every vital that moved in one turn", () => {
    expect(
      vitalPulses(base, { credits: base.credits - 40, fuel: base.fuel - 5, hull: base.hull })
    ).toEqual({ credits: "down", fuel: "down" });
  });
});
