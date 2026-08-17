import { describe, it, expect } from "vitest";
import {
  DERELICT_TRAP_DAMAGE,
  bribeCost,
  choiceOdds,
  choiceStakes,
  derelictReward,
  engineBurn,
  engineHullStrain,
  fleeDamage,
  LETHAL_MARK,
  pirateToll,
  SALVAGE_TRAP_DAMAGE,
  salvageAmount,
} from "../../src/engine/preview";
import { createGame, resolveChoice } from "../../src/engine/game";
import { GameEvent } from "../../src/engine/types";
import { TOLL_RATE, netWorth } from "../../src/engine/economy";

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
    expect(after.log[after.log.length - 1].msg).toBe("Hold full — left the salvage drifting.");
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

describe("choiceOdds (E1-4)", () => {
  it("salvage odds name both the hazard and the bait draw (E3-4)", () => {
    const e = { kind: "salvage", title: "", description: "", choices: [] } as GameEvent;
    expect(choiceOdds(e).collect).toBe("1-in-3 hides a hazard · clean scoop: 1-in-4 is bait");
  });
  it("prices the derelict gamble as 50/50", () => {
    const e = { kind: "derelict", title: "", description: "", choices: [] } as GameEvent;
    expect(choiceOdds(e)).toEqual({ board: "50/50" });
  });
  it("offers no odds for deterministic events", () => {
    const e = { kind: "pirates", title: "", description: "", choices: [] } as GameEvent;
    expect(choiceOdds(e)).toEqual({});
  });
});

describe("lethal-stake marker (B-6)", () => {
  it("marks a pirate flee that could destroy the ship", () => {
    const s = { ...createGame(42), hull: 10 }; // fleeDamage day 1 = 16 ≥ 10
    const stakes = choiceStakes(s, {
      kind: "pirates",
      title: "",
      description: "",
      choices: [],
    });
    expect(stakes.flee).toContain(LETHAL_MARK);
    expect(stakes.pay).not.toContain(LETHAL_MARK);
  });

  it("does not mark a survivable flee", () => {
    const s = { ...createGame(42), hull: 50 };
    const stakes = choiceStakes(s, { kind: "pirates", title: "", description: "", choices: [] });
    expect(stakes.flee).not.toContain(LETHAL_MARK);
  });

  it("marks salvage and derelict gambles at killable hull", () => {
    const s = { ...createGame(42), hull: 10 }; // salvage trap 10 ≥ 10; derelict trap 20 ≥ 10
    expect(
      choiceStakes(s, { kind: "salvage", title: "", description: "", choices: [] }).collect
    ).toContain(LETHAL_MARK);
    expect(
      choiceStakes(s, { kind: "derelict", title: "", description: "", choices: [] }).board
    ).toContain(LETHAL_MARK);
  });

  it("marks engine strain only when it could kill", () => {
    const dying = { ...createGame(42), fuel: 0, hull: 10 }; // strain 10 ≥ 10
    const fine = { ...createGame(42), fuel: 0, hull: 50 };
    expect(
      choiceStakes(dying, { kind: "engine", title: "", description: "", choices: [] }).ack
    ).toContain(LETHAL_MARK);
    expect(
      choiceStakes(fine, { kind: "engine", title: "", description: "", choices: [] }).ack
    ).not.toContain(LETHAL_MARK);
  });
});

describe("pirateToll (E1-5b) — stakes that keep up with the fortune", () => {
  const rich = (credits: number, day = 11) => ({ ...createGame(42), credits, day });

  it("keeps the flat formula below the crossover — the early run is unchanged", () => {
    // Day 1, credits 800, debt 1500 → net worth −700: the rate term is negative.
    expect(pirateToll(createGame(42))).toBe(160); // 150 + 1 × 10, exactly as before
    // Day 11 with a small purse: flat 260 still wins under (150 + 110)/0.1 = 2,600cr.
    const s = rich(2000);
    expect(netWorth(s)).toBeLessThan(2600);
    expect(pirateToll(s)).toBe(260);
  });

  it("charges TOLL_RATE of net worth once that exceeds the flat floor", () => {
    const s = rich(11_500); // net worth 11,500 − 1,500 debt = 10,000
    expect(netWorth(s)).toBe(10_000);
    expect(pirateToll(s)).toBe(Math.round(TOLL_RATE * 10_000)); // 1,000 at the default
  });

  it("never asks for more than the player holds", () => {
    // Wealth locked in cargo, purse nearly empty: the clamp binds.
    const s = {
      ...createGame(42),
      day: 11,
      credits: 50,
      cargo: { water: 30, parts: 0, luxury: 0 },
    };
    expect(pirateToll(s)).toBe(50);
  });

  it("never goes negative on a broke, indebted ship", () => {
    expect(pirateToll({ ...createGame(42), credits: 0, day: 12 })).toBe(0);
  });

  it("the displayed stake is the charged toll (E1-4)", () => {
    const s = rich(11_500);
    const e = { kind: "pirates", title: "", description: "", choices: [] } as GameEvent;
    expect(choiceStakes(s, e).pay).toBe(`~${pirateToll(s)}cr`);
  });
});
