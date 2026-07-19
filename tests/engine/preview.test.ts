import { describe, it, expect } from "vitest";
import {
  DERELICT_TRAP_DAMAGE,
  bribeCost,
  choiceStakes,
  derelictReward,
  engineBurn,
  fleeDamage,
  pirateToll,
  salvageAmount,
} from "../../src/engine/preview";
import { createGame, resolveChoice } from "../../src/engine/game";
import { GameEvent } from "../../src/engine/types";

const ev = (kind: GameEvent["kind"], ids: string[]): GameEvent => ({
  kind,
  title: "",
  description: "",
  choices: ids.map((id) => ({ id, label: id })),
});

// Every stake string must describe exactly the delta resolveChoice applies —
// the preview and the resolver share formulas, so drift is a test failure.
describe("stake previews match resolveChoice outcomes", () => {
  it("pirates: pay deducts exactly the previewed toll", () => {
    const s = { ...createGame(42), day: 8 };
    const e = ev("pirates", ["pay", "flee"]);
    expect(choiceStakes(s, e).pay).toBe(`~${pirateToll(s)}cr`);
    const after = resolveChoice(s, e, "pay");
    expect(s.credits - after.credits).toBe(pirateToll(s));
  });

  it("pirates: flee costs exactly the previewed hull", () => {
    const s = { ...createGame(42), day: 8 };
    const e = ev("pirates", ["pay", "flee"]);
    expect(choiceStakes(s, e).flee).toBe(`risk ${fleeDamage(s.day)} hull`);
    const after = resolveChoice(s, e, "flee");
    expect(s.hull - after.hull).toBe(fleeDamage(s.day));
  });

  it("salvage: collect gains exactly the previewed parts", () => {
    const s = { ...createGame(42), day: 6 };
    const e = ev("salvage", ["collect", "ignore"]);
    expect(choiceStakes(s, e).collect).toBe(`+${salvageAmount(s)} Machine Parts`);
    const after = resolveChoice(s, e, "collect");
    expect(after.cargo.parts - s.cargo.parts).toBe(salvageAmount(s));
  });

  it("engine: burns exactly the previewed fuel", () => {
    const s = { ...createGame(42), fuel: 1 };
    const e = ev("engine", ["ack"]);
    expect(choiceStakes(s, e).ack).toBe("−1 fuel");
    const after = resolveChoice(s, e, "ack");
    expect(s.fuel - after.fuel).toBe(engineBurn(s));
  });

  it("derelict: previews both outcomes; a win day pays the previewed reward", () => {
    const s = { ...createGame(42), day: 2 }; // (2×7 + 42) % 2 === 0 → win
    const e = ev("derelict", ["board", "leave"]);
    expect(choiceStakes(s, e).board).toBe(
      `could hold ~${derelictReward(s.day)}cr, or a trap: −${DERELICT_TRAP_DAMAGE} hull`
    );
    const after = resolveChoice(s, e, "board");
    expect(after.credits - s.credits).toBe(derelictReward(s.day));
  });

  it("derelict: a trap day costs the previewed hull", () => {
    const s = { ...createGame(42), day: 3 }; // (3×7 + 42) % 2 === 1 → trap
    const after = resolveChoice(s, ev("derelict", ["board", "leave"]), "board");
    expect(s.hull - after.hull).toBe(DERELICT_TRAP_DAMAGE);
  });

  it("customs: bribe and comply match their previews", () => {
    const base = createGame(42);
    const s = { ...base, location: "meridian" as const, cargo: { ...base.cargo, luxury: 3 } };
    const e = ev("customs", ["comply", "bribe"]);
    const stakes = choiceStakes(s, e);
    expect(stakes.comply).toBe("lose 3 luxury");
    expect(stakes.bribe).toBe(`~${bribeCost(s)}cr`);
    const bribed = resolveChoice(s, e, "bribe");
    expect(s.credits - bribed.credits).toBe(bribeCost(s));
    const complied = resolveChoice(s, e, "comply");
    expect(complied.cargo.luxury).toBe(0);
  });

  it("customs comply with an empty hold previews the non-loss", () => {
    const s = { ...createGame(42), location: "meridian" as const };
    expect(choiceStakes(s, ev("customs", ["comply", "bribe"])).comply).toBe("nothing to seize");
  });

  it("quiet events preview nothing", () => {
    expect(choiceStakes(createGame(42), ev("quiet", ["ack"]))).toEqual({});
  });
});
