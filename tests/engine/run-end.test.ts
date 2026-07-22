import { describe, it, expect } from "vitest";
import { createGame } from "../../src/engine/game";
import { RUN_LENGTH, SURVIVAL_BONUS_PER_DAY, endRun } from "../../src/engine/run-end";
import { netWorth } from "../../src/engine/economy";

describe("endRun", () => {
  it("banks net worth + survival bonus on an audited run", () => {
    const s = { ...createGame(42), day: 12, credits: 2000, debt: 0 };
    const ended = endRun(s, "audited", "Audited.");
    expect(ended.status).toBe("audited");
    expect(ended.runEnd?.netWorthAtEnd).toBe(netWorth(s));
    expect(ended.runEnd?.survivalBonus).toBe(SURVIVAL_BONUS_PER_DAY * 12);
    expect(ended.runEnd?.score).toBe(netWorth(s) + SURVIVAL_BONUS_PER_DAY * 12);
  });

  it("banks the same way on a retired run", () => {
    const s = { ...createGame(42), day: 4, credits: 3000, debt: 500 };
    const ended = endRun(s, "retired", "Retired.");
    expect(ended.status).toBe("retired");
    expect(ended.runEnd?.survivalBonus).toBe(SURVIVAL_BONUS_PER_DAY * 4);
    expect(ended.runEnd?.score).toBe(netWorth(s) + SURVIVAL_BONUS_PER_DAY * 4);
  });

  it("death loses the cargo and the survival bonus", () => {
    const s = {
      ...createGame(42),
      day: 6,
      credits: 900,
      debt: 100,
      cargo: { water: 10, parts: 0, luxury: 0 },
    };
    const ended = endRun(s, "lost", "Hull breach — your ship broke apart.", "hull");
    expect(ended.runEnd?.netWorthAtEnd).toBe(800); // credits − debt; cargo excluded
    expect(ended.runEnd?.survivalBonus).toBe(0);
    expect(ended.runEnd?.score).toBe(800);
  });

  it("floors the net-worth part at 0 but still pays the bonus", () => {
    const s = { ...createGame(42), day: 3, credits: 100, debt: 2000 };
    const ended = endRun(s, "retired", "Retired.");
    expect(ended.runEnd?.score).toBe(SURVIVAL_BONUS_PER_DAY * 3);
  });

  it("floors a death score at 0", () => {
    const s = { ...createGame(42), day: 3, credits: 100, debt: 2000 };
    const ended = endRun(s, "lost", "Stranded.", "fuel");
    expect(ended.runEnd?.score).toBe(0);
  });

  it("caps daysSurvived at RUN_LENGTH", () => {
    const s = { ...createGame(42), day: 99 };
    expect(endRun(s, "audited", "Audited.").runEnd?.daysSurvived).toBe(RUN_LENGTH);
  });

  it("tags the loss cause so surfaces need not parse the prose", () => {
    const hull = endRun(createGame(42), "lost", "Hull breach — your ship broke apart.", "hull");
    expect(hull.runEnd?.lossCause).toBe("hull");
    const fuel = endRun(createGame(42), "lost", "Stranded.", "fuel");
    expect(fuel.runEnd?.lossCause).toBe("fuel");
  });

  it("leaves lossCause undefined on a banked run", () => {
    expect(endRun(createGame(42), "retired", "Retired.").runEnd?.lossCause).toBeUndefined();
  });

  it("appends the cause to the log", () => {
    const ended = endRun(createGame(42), "retired", "Retired at Terra Hub.");
    expect(ended.log[ended.log.length - 1]).toBe("Retired at Terra Hub.");
  });

  it("is a no-op on an already-ended run", () => {
    const dead = endRun(createGame(42), "lost", "gone", "hull");
    expect(endRun(dead, "retired", "again")).toBe(dead);
  });
});
