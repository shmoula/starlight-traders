import { describe, it, expect } from "vitest";
import {
  createGame,
  buy,
  sell,
  refuel,
  repair,
  jump,
  arrive,
  resolveChoice,
  acceptMission,
  checkLoss,
  deliver,
  STARTING,
} from "../../src/engine/game";
import { getPrice } from "../../src/engine/world";
import { GameEvent, Mission } from "../../src/engine/types";
import { endRun } from "../../src/engine/run-end";

describe("createGame goal line", () => {
  it("opens the log by stating the stake, the objective, and the shared sky", () => {
    expect(createGame(42).log[0]).toBe(
      "The Syndicate staked your ship — 1,500cr, compounding. Score = your peak fortune. Everyone flies today's sky."
    );
  });
});

describe("arrival settlement reporting", () => {
  const contract: Mission = {
    id: "c1",
    commodity: "water",
    qty: 5,
    destination: "kiruna",
    reward: 500,
    deadlineDay: 99,
  };

  it("reports delivered contracts and subtracts their cargo", () => {
    let s = createGame(42);
    s = acceptMission(s, contract);
    s = { ...s, cargo: { ...s.cargo, water: 8 }, fuel: 20 };
    const r = arrive(jump(s, "kiruna").state);
    expect(r.delivered.map((m) => m.id)).toEqual(["c1"]);
    expect(r.expired).toEqual([]);
    expect(r.state.cargo.water).toBe(3);
    expect(r.state.activeMissions).toEqual([]);
  });

  it("reports expired contracts past their deadline", () => {
    let s = createGame(42);
    s = acceptMission(s, { ...contract, deadlineDay: 1 });
    s = { ...s, cargo: { ...s.cargo, water: 8 }, fuel: 20 };
    const r = arrive(jump(s, "kiruna").state);
    expect(r.delivered).toEqual([]);
    expect(r.expired.map((m) => m.id)).toEqual(["c1"]);
  });

  it("does not report a contract still in progress", () => {
    let s = createGame(42);
    s = acceptMission(s, contract);
    s = { ...s, fuel: 20 }; // no cargo carried
    const r = arrive(jump(s, "kiruna").state);
    expect(r.delivered).toEqual([]);
    expect(r.expired).toEqual([]);
    expect(r.state.activeMissions.map((m) => m.id)).toEqual(["c1"]);
  });

  it("counts in-transit salvage toward a delivery (settles after the event)", () => {
    const partsContract: Mission = {
      id: "p1",
      commodity: "parts",
      qty: 10,
      destination: "kiruna",
      reward: 600,
      deadlineDay: 99,
    };
    let s = createGame(42);
    s = acceptMission(s, partsContract);
    // day 4 so the post-jump day (5) is a clean salvage day: hashSeed(42, 5) % 3 === 1.
    s = { ...s, cargo: { ...s.cargo, parts: 8 }, fuel: 20, day: 4 }; // short by 2

    const j = jump(s, "kiruna"); // arrives at kiruna carrying 8 parts
    const salvage: GameEvent = {
      kind: "salvage",
      title: "",
      description: "",
      choices: [{ id: "collect", label: "" }],
    };
    const afterEvent = resolveChoice(j.state, salvage, "collect"); // scoops up parts
    expect(afterEvent.cargo.parts).toBeGreaterThanOrEqual(10);

    const r = arrive(afterEvent);
    expect(r.delivered.map((m) => m.id)).toEqual(["p1"]); // now it completes
  });

  it("settles a delivery via `deliver` when cargo is bought after arriving empty-handed", () => {
    let s = createGame(42);
    s = acceptMission(s, contract);
    s = { ...s, fuel: 20 }; // no cargo carried
    s = arrive(jump(s, "kiruna").state).state; // arrives short; mission stays active
    expect(s.activeMissions.map((m) => m.id)).toEqual(["c1"]);

    s = { ...s, cargo: { ...s.cargo, water: 5 } }; // buy the goods while already docked
    const s2 = deliver(s);
    expect(s2.activeMissions).toEqual([]);
    expect(s2.cargo.water).toBe(0);
  });
});

describe("createGame", () => {
  it("starts at terra with starting credits, debt, fuel, and full hull", () => {
    const s = createGame(42);
    expect(s.location).toBe("terra");
    expect(s.credits).toBe(STARTING.credits);
    expect(s.debt).toBe(STARTING.debt);
    expect(s.fuel).toBe(STARTING.fuel);
    expect(s.hull).toBe(s.hullMax);
    expect(s.status).toBe("playing");
    expect(s.day).toBe(1);
  });
});

describe("buy/sell", () => {
  it("buying decreases credits and increases cargo", () => {
    const s = createGame(42);
    const price = getPrice(s.seed, s.day, s.location, "water");
    const s2 = buy(s, "water", 3);
    expect(s2.cargo.water).toBe(3);
    expect(s2.credits).toBe(s.credits - price * 3);
  });

  it("cannot buy beyond cargo capacity or affordability", () => {
    const s = createGame(42);
    const huge = buy(s, "luxury", 9999);
    expect(huge).toBe(s); // rejected, unchanged
  });

  it("selling increases credits (minus tax) and decreases cargo", () => {
    const s = buy(createGame(42), "water", 5);
    const before = s.credits;
    const s2 = sell(s, "water", 5);
    expect(s2.cargo.water).toBe(0);
    expect(s2.credits).toBeGreaterThan(before);
  });
});

describe("refuel/repair", () => {
  it("refuel adds fuel up to capacity and charges credits", () => {
    const s = createGame(42);
    const s2 = refuel(s, 5);
    expect(s2.fuel).toBe(Math.min(s.fuelCapacity, s.fuel + 5));
    expect(s2.credits).toBeLessThan(s.credits);
  });

  it("repair restores hull up to max and charges credits", () => {
    const s = { ...createGame(42), hull: 50 };
    const s2 = repair(s, 30);
    expect(s2.hull).toBe(80);
    expect(s2.credits).toBeLessThan(s.credits);
  });
});

describe("jump", () => {
  it("consumes fuel, advances the day, accrues interest and docking fee, and returns a pending event", () => {
    const s = createGame(42);
    const { state, event } = jump(s, "kiruna");
    expect(state.location).toBe("kiruna");
    expect(state.day).toBe(2);
    expect(state.fuel).toBeLessThan(s.fuel);
    expect(event).toBeTruthy();
  });

  it("refuses to jump without enough fuel", () => {
    const s = { ...createGame(42), fuel: 0 };
    const result = jump(s, "kiruna");
    expect(result.state).toBe(s);
    expect(result.event).toBeNull();
  });
});

describe("checkLoss", () => {
  it("marks lost when stranded: no fuel and cannot afford the cheapest jump", () => {
    const s = { ...createGame(42), fuel: 0, credits: 0, cargo: { water: 0, parts: 0, luxury: 0 } };
    expect(checkLoss(s).status).toBe("lost");
  });

  it("stays playing when a jump is still affordable", () => {
    const s = createGame(42);
    expect(checkLoss(s).status).toBe("playing");
  });

  it("names the station and cause in the stranding log line", () => {
    const s = {
      ...createGame(42),
      location: "vulcan" as const,
      fuel: 0,
      credits: 0,
      cargo: { water: 0, parts: 0, luxury: 0 },
    };
    const lost = checkLoss(s);
    expect(lost.status).toBe("lost");
    expect(lost.log[lost.log.length - 1]).toBe(
      "Stranded at Vulcan Yards — not enough fuel to jump, and refueling costs more than you have."
    );
  });
});

describe("refuel partial fill (soft-lock fix)", () => {
  it("buys as many fuel units as the player can afford instead of rejecting the whole bundle", () => {
    const s = { ...createGame(42), fuel: 0, credits: 24 }; // can afford 3 units @8 = 24
    const s2 = refuel(s, 5);
    expect(s2.fuel).toBe(3); // partial fill, not 0
    expect(s2.credits).toBe(0);
  });

  it("still returns the same state when the player cannot afford even one unit", () => {
    const s = { ...createGame(42), fuel: 0, credits: 5 }; // < REFUEL_PRICE (8)
    expect(refuel(s, 5)).toBe(s);
  });
});

describe("resolveChoice", () => {
  it("resolving a pirate 'pay' choice reduces credits", () => {
    const s = createGame(42);
    const evt = {
      kind: "pirates" as const,
      title: "",
      description: "",
      choices: [{ id: "pay", label: "" }],
    };
    const s2 = resolveChoice(s, evt, "pay");
    expect(s2.credits).toBeLessThanOrEqual(s.credits);
  });
});

describe("ended-run guards", () => {
  it("jump is a no-op on an ended run", () => {
    const dead = endRun({ ...createGame(42), fuel: 20 }, "lost", "gone");
    const r = jump(dead, "kiruna");
    expect(r.state).toBe(dead);
    expect(r.event).toBeNull();
  });

  it("checkLoss banks a RunEnd with no survival bonus on stranding", () => {
    const s = { ...createGame(42), fuel: 0, credits: 0, cargo: { water: 0, parts: 0, luxury: 0 } };
    const lost = checkLoss(s);
    expect(lost.status).toBe("lost");
    expect(lost.runEnd?.status).toBe("lost");
    expect(lost.runEnd?.survivalBonus).toBe(0);
    expect(lost.runEnd?.score).toBe(0); // credits 0 − debt 1500 floors at 0
  });
});
