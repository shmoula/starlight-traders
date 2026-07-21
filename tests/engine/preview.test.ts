import { describe, it, expect } from "vitest";
import {
  DERELICT_TRAP_DAMAGE,
  bribeCost,
  choiceStakes,
  derelictReward,
  engineBurn,
  engineHullStrain,
  fleeDamage,
  pirateToll,
  SALVAGE_TRAP_DAMAGE,
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

  it("salvage: previews both outcomes; a clean day gains exactly the previewed parts", () => {
    const s = { ...createGame(42), day: 5 }; // hashSeed(42, 5) % 3 === 1 → clean
    const e = ev("salvage", ["collect", "ignore"]);
    expect(choiceStakes(s, e).collect).toBe(
      `+${salvageAmount(s)} Machine Parts, or a hazard: −${SALVAGE_TRAP_DAMAGE} hull`
    );
    const after = resolveChoice(s, e, "collect");
    expect(after.cargo.parts - s.cargo.parts).toBe(salvageAmount(s));
    expect(after.hull).toBe(s.hull);
  });

  it("salvage: a hazard day costs the previewed hull and no cargo", () => {
    const s = { ...createGame(42), day: 4 }; // hashSeed(42, 4) % 3 === 0 → hazard
    const e = ev("salvage", ["collect", "ignore"]);
    const after = resolveChoice(s, e, "collect");
    expect(s.hull - after.hull).toBe(SALVAGE_TRAP_DAMAGE);
    expect(after.cargo.parts).toBe(s.cargo.parts);
  });

  it("salvage: a full hold on a clean day scoops nothing and never logs 'Salvaged 0'", () => {
    const s = { ...createGame(42), day: 5, cargo: { water: 30, parts: 0, luxury: 0 } }; // hold full
    const after = resolveChoice(s, ev("salvage", ["collect", "ignore"]), "collect");
    expect(after.cargo.parts).toBe(0);
    expect(after.log[after.log.length - 1]).toBe("Hold full — left the salvage drifting.");
  });

  it("salvage: staying on course is a safe no-op", () => {
    const s = { ...createGame(42), day: 6 };
    const after = resolveChoice(s, ev("salvage", ["collect", "ignore"]), "ignore");
    expect(after.hull).toBe(s.hull);
    expect(after.cargo.parts).toBe(s.cargo.parts);
  });

  it("engine: a healthy tank burns exactly the previewed fuel and no hull", () => {
    const s = { ...createGame(42), fuel: 5 };
    const e = ev("engine", ["ack"]);
    expect(choiceStakes(s, e).ack).toBe(`−${engineBurn(s)} fuel`);
    const after = resolveChoice(s, e, "ack");
    expect(s.fuel - after.fuel).toBe(engineBurn(s));
    expect(after.hull).toBe(s.hull);
  });

  it("engine: a near-empty tank vents the rest of the leak into the hull", () => {
    const s = { ...createGame(42), fuel: 1 };
    const e = ev("engine", ["ack"]);
    expect(choiceStakes(s, e).ack).toBe(`−1 fuel, −${engineHullStrain(s)} hull`);
    const after = resolveChoice(s, e, "ack");
    expect(s.fuel - after.fuel).toBe(1);
    expect(s.hull - after.hull).toBe(engineHullStrain(s));
  });

  it("engine: a dry tank still costs something — never a free −0 fuel", () => {
    const s = { ...createGame(42), fuel: 0 };
    const e = ev("engine", ["ack"]);
    expect(engineBurn(s)).toBe(0);
    expect(engineHullStrain(s)).toBeGreaterThan(0);
    expect(choiceStakes(s, e).ack).toBe(`−${engineHullStrain(s)} hull`);
    const after = resolveChoice(s, e, "ack");
    expect(s.hull - after.hull).toBe(engineHullStrain(s));
  });

  it("derelict: previews both outcomes; a win day pays the previewed reward", () => {
    const s = { ...createGame(42), day: 3 }; // hashSeed(42, 3) % 2 === 0 → win
    const e = ev("derelict", ["board", "leave"]);
    expect(choiceStakes(s, e).board).toBe(
      `could hold ~${derelictReward(s.day)}cr, or a trap: −${DERELICT_TRAP_DAMAGE} hull`
    );
    const after = resolveChoice(s, e, "board");
    expect(after.credits - s.credits).toBe(derelictReward(s.day));
  });

  it("derelict: a trap day costs the previewed hull", () => {
    const s = { ...createGame(42), day: 2 }; // hashSeed(42, 2) % 2 === 1 → trap
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
