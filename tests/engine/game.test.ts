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
  retire,
  payDebt,
  interestForecast,
  STARTING,
} from "../../src/engine/game";
import { getPrice, commodityName } from "../../src/engine/world";
import { dockingFee } from "../../src/engine/economy";
import { GameEvent, Mission, NodeId } from "../../src/engine/types";
import { endRun } from "../../src/engine/run-end";
import { hashSeed } from "../../src/engine/rng";
import { SALVAGE_HAZARD_DIVISOR } from "../../src/engine/preview";

describe("createGame goal line", () => {
  it("opens the log by stating the stake, the deadline, and the shared sky", () => {
    expect(createGame(42).log[0].msg).toBe(
      "The Syndicate staked your ship — 1,500cr, compounding. Bank your fortune before the Day 12 audit. Everyone flies today's sky."
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
    deposit: 50,
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
      deposit: 60,
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
    expect(lost.log[lost.log.length - 1].msg).toBe(
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
    const dead = endRun({ ...createGame(42), fuel: 20 }, "lost", "gone", "hull");
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

describe("retire (E0-1)", () => {
  it("ends the run as retired and banks the score", () => {
    const s = { ...createGame(42), day: 5, credits: 2000, debt: 500 };
    const r = retire(s);
    expect(r.status).toBe("retired");
    expect(r.runEnd?.status).toBe("retired");
    expect(r.runEnd?.daysSurvived).toBe(5);
    expect(r.log[r.log.length - 1].msg).toBe(
      "Retired at Terra Hub — the Syndicate banks your score."
    );
  });

  it("is a no-op on an ended run", () => {
    const dead = endRun(createGame(42), "lost", "gone", "hull");
    expect(retire(dead)).toBe(dead);
  });
});

describe("the Daily Audit (E0-1)", () => {
  it("arrival on day 12 ends the run as audited", () => {
    const s = { ...createGame(42), day: 11, fuel: 20 };
    const j = jump(s, "kiruna"); // arrival day = 12
    const r = arrive(j.state);
    expect(r.state.status).toBe("audited");
    expect(r.state.runEnd?.daysSurvived).toBe(12);
    expect(r.state.log[r.state.log.length - 1].msg).toBe(
      "Day 12 — the Syndicate audits your books and banks your score."
    );
  });

  it("audit beats stranding: arriving broke on day 12 still banks the score", () => {
    // Fuel exactly covers terra→kiruna (4); nothing left to jump or refuel with after.
    const s = { ...createGame(42), day: 11, fuel: 4, credits: 30 };
    const j = jump(s, "kiruna"); // docking fee eats the last credits
    const r = arrive(j.state);
    expect(r.state.status).toBe("audited");
  });

  it("no audit before day 12", () => {
    const s = { ...createGame(42), day: 5, fuel: 20 };
    const r = arrive(jump(s, "kiruna").state);
    expect(r.state.status).toBe("playing");
  });

  it("deliveries settle before the audit banks, so the reward counts", () => {
    const contract: Mission = {
      id: "a1",
      commodity: "water",
      qty: 5,
      destination: "kiruna",
      reward: 500,
      deposit: 50,
      deadlineDay: 99,
    };
    let s = createGame(42);
    s = acceptMission(s, contract);
    s = { ...s, day: 11, fuel: 20, cargo: { ...s.cargo, water: 5 } };
    const r = arrive(jump(s, "kiruna").state);
    expect(r.delivered.map((m) => m.id)).toEqual(["a1"]);
    expect(r.state.status).toBe("audited");
    // Reward was paid into credits before endRun computed net worth.
    expect(r.state.runEnd!.netWorthAtEnd).toBe(r.state.credits + 0 - r.state.debt);
  });

  it("arrive early-returns on an ended run without settling deliveries", () => {
    const dead = endRun(createGame(42), "lost", "gone", "hull");
    const r = arrive(dead);
    expect(r.state).toBe(dead);
    expect(r.delivered).toEqual([]);
    expect(r.expired).toEqual([]);
  });
});

describe("hull death (B-6)", () => {
  const pirates: GameEvent = {
    kind: "pirates",
    title: "",
    description: "",
    choices: [{ id: "flee", label: "" }],
  };

  it("fleeing pirates at low hull destroys the ship", () => {
    // fleeDamage(day) = 15 + (day % 10) → 16 on day 1; hull 10 cannot survive it.
    const s = { ...createGame(42), hull: 10 };
    const dead = resolveChoice(s, pirates, "flee");
    expect(dead.status).toBe("lost");
    expect(dead.hull).toBe(0);
    expect(dead.runEnd?.cause).toBe("Hull breach — your ship broke apart.");
  });

  it("fleeing at healthy hull just takes the damage", () => {
    const s = { ...createGame(42), hull: 50 };
    const fled = resolveChoice(s, pirates, "flee");
    expect(fled.status).toBe("playing");
    expect(fled.hull).toBe(50 - 16);
  });

  it("a salvage trap can kill", () => {
    // Find a trap day for this seed: resolveSalvage traps when hashSeed(seed, day) % 3 === 0.
    const trapDay = Array.from({ length: 30 }, (_, i) => i + 1).find(
      (d) => hashSeed(42, d) % 3 === 0
    )!;
    const salvage: GameEvent = {
      kind: "salvage",
      title: "",
      description: "",
      choices: [{ id: "collect", label: "" }],
    };
    const s = { ...createGame(42), day: trapDay, hull: 10 }; // SALVAGE_TRAP_DAMAGE = 10
    const dead = resolveChoice(s, salvage, "collect");
    expect(dead.status).toBe("lost");
    expect(dead.hull).toBe(0);
  });

  it("a derelict trap can kill", () => {
    // resolveDerelict traps when hashSeed(seed, day) % 2 !== 0.
    const trapDay = Array.from({ length: 30 }, (_, i) => i + 1).find(
      (d) => hashSeed(42, d) % 2 !== 0
    )!;
    const derelict: GameEvent = {
      kind: "derelict",
      title: "",
      description: "",
      choices: [{ id: "board", label: "" }],
    };
    const s = { ...createGame(42), day: trapDay, hull: 20 }; // DERELICT_TRAP_DAMAGE = 20
    const dead = resolveChoice(s, derelict, "board");
    expect(dead.status).toBe("lost");
  });

  it("engine strain on an empty tank can kill", () => {
    const engine: GameEvent = {
      kind: "engine",
      title: "",
      description: "",
      choices: [{ id: "ack", label: "" }],
    };
    // fuel 0 → strain = ENGINE_LEAK(2) × 5 = 10 hull.
    const s = { ...createGame(42), fuel: 0, hull: 10 };
    const dead = resolveChoice(s, engine, "ack");
    expect(dead.status).toBe("lost");
    expect(dead.hull).toBe(0);
  });

  it("a ship destroyed in transit does not settle its deliveries", () => {
    const contract: Mission = {
      id: "h1",
      commodity: "water",
      qty: 5,
      destination: "kiruna",
      reward: 500,
      deposit: 50,
      deadlineDay: 99,
    };
    let s = createGame(42);
    s = acceptMission(s, contract);
    s = { ...s, fuel: 20, hull: 10, cargo: { ...s.cargo, water: 5 } };
    const j = jump(s, "kiruna");
    const dead = resolveChoice(j.state, pirates, "flee"); // 15+(2%10)=17 ≥ 10 → destroyed
    expect(dead.status).toBe("lost");
    const r = arrive(dead);
    expect(r.delivered).toEqual([]); // cargo went down with the ship
    expect(r.state.runEnd?.survivalBonus).toBe(0);
  });
});

describe("biggestPayday (E1-3 best haul)", () => {
  it("records a sale's net proceeds as the biggest payday", () => {
    let s = createGame(42);
    s = { ...s, cargo: { ...s.cargo, water: 10 }, location: "vulcan" }; // Vulcan demands water
    s = sell(s, "water", 10);
    expect(s.biggestPayday).toBeDefined();
    expect(s.biggestPayday!.amount).toBeGreaterThan(0);
    expect(s.biggestPayday!.label).toContain("Water / Ice");
  });

  it("keeps the larger of two paydays", () => {
    let s = createGame(42);
    s = { ...s, cargo: { ...s.cargo, water: 20 }, location: "vulcan" };
    const first = sell(s, "water", 1);
    const small = first.biggestPayday!.amount;
    const big = sell(first, "water", 19);
    expect(big.biggestPayday!.amount).toBeGreaterThan(small);
  });

  it("leaves biggestPayday undefined when nothing was earned", () => {
    expect(createGame(42).biggestPayday).toBeUndefined();
  });
});

describe("loan escalation voice (E0-4)", () => {
  const interestLineAfterJump = (day: number): string => {
    const s = { ...createGame(42), day: day - 1, fuel: 20 };
    const j = jump(s, "kiruna");
    return j.state.log.find((l) => l.msg.includes("Syndicate compounds"))?.msg ?? "";
  };

  it("day 3 accrues at 4% with the base line", () => {
    expect(interestLineAfterJump(3)).toBe("The Syndicate compounds: +60cr.");
  });

  it("day 6 accrues at 6% and grows impatient", () => {
    expect(interestLineAfterJump(6)).toBe("The Syndicate compounds: +90cr. It grows impatient.");
  });

  it("day 9 accrues at 8% and loses patience", () => {
    expect(interestLineAfterJump(9)).toBe(
      "The Syndicate compounds: +120cr. It is losing patience with you."
    );
  });
});

describe("dayHighlights", () => {
  it("starts empty in createGame", () => {
    expect(createGame(42).dayHighlights).toEqual({});
  });

  const piratesEvt: GameEvent = {
    kind: "pirates",
    title: "",
    description: "",
    choices: [
      { id: "pay", label: "" },
      { id: "flee", label: "" },
    ],
  };

  it("marks a pirate day whether paying or fleeing", () => {
    let s = createGame(42);
    s = { ...s, fuel: 20, credits: 5000 };
    s = jump(s, "kiruna").state; // day 2
    expect(resolveChoice(s, piratesEvt, "pay").dayHighlights[2]).toBe("pirates");
    expect(resolveChoice(s, piratesEvt, "flee").dayHighlights[2]).toBe("pirates");
  });

  it("marks a big sale as bigTrade", () => {
    let s = createGame(42);
    s = { ...s, cargo: { ...s.cargo, luxury: 5 } };
    // Nets 1,373cr on this seed. Luxury at Terra floors at 192cr/unit, so 5 units net
    // ≥912cr on *any* seed — the ceiling BIG_TRADE_CR must stay under to keep this sound.
    s = sell(s, "luxury", 5);
    expect(s.dayHighlights[1]).toBe("bigTrade");
  });

  it("does not mark a small sale", () => {
    let s = createGame(42);
    s = { ...s, cargo: { ...s.cargo, water: 1 } };
    s = sell(s, "water", 1); // nets 16cr; water tops out at 22cr/unit — never a big trade
    expect(s.dayHighlights[1]).toBeUndefined();
  });

  it("marks a modest delivery as delivery", () => {
    let s = createGame(42);
    s = acceptMission(s, {
      id: "d1",
      commodity: "water",
      qty: 2,
      destination: "terra",
      reward: 100,
      deposit: 10,
      deadlineDay: 99,
    });
    s = { ...s, cargo: { ...s.cargo, water: 2 } };
    s = deliver(s);
    expect(s.dayHighlights[1]).toBe("delivery");
  });

  it("upgrades a whale delivery to bigTrade", () => {
    let s = createGame(42);
    s = acceptMission(s, {
      id: "w1",
      commodity: "water",
      qty: 2,
      destination: "terra",
      reward: 5000,
      deposit: 500,
      deadlineDay: 99,
    });
    s = { ...s, cargo: { ...s.cargo, water: 2 } };
    s = deliver(s);
    expect(s.dayHighlights[1]).toBe("bigTrade");
  });

  it("leaves the highlight alone when the same rank is marked twice", () => {
    let s = createGame(42);
    s = { ...s, cargo: { ...s.cargo, luxury: 10 } };
    s = sell(s, "luxury", 5);
    s = sell(s, "luxury", 5); // second big sale, same day — no-op, not a re-mark
    expect(s.dayHighlights[1]).toBe("bigTrade");
  });

  it("never downgrades a day's highlight", () => {
    let s = createGame(42);
    s = { ...s, fuel: 20, credits: 5000, cargo: { ...s.cargo, luxury: 5 } };
    s = jump(s, "kiruna").state; // day 2
    s = resolveChoice(s, piratesEvt, "pay"); // pirates on day 2
    s = sell(s, "luxury", 5); // big sale, same day
    expect(s.dayHighlights[2]).toBe("pirates"); // pirates outranks bigTrade
  });
});

describe("structured log entries (P2-1)", () => {
  const last = (s: ReturnType<typeof createGame>) => s.log[s.log.length - 1];

  it("buy logs a neutral entry with a negative credit delta", () => {
    const s = createGame(42);
    const price = getPrice(s.seed, s.day, s.location, "water");
    const after = buy(s, "water", 2);
    expect(last(after)).toEqual({
      msg: `Bought 2 ${commodityName("water")} for ${price * 2}cr.`,
      tone: "neutral",
      delta: -(price * 2),
    });
  });

  it("sell logs a good entry whose delta is the net (post-tax) proceeds", () => {
    let s = createGame(42);
    s = { ...s, cargo: { ...s.cargo, water: 3 } };
    const after = sell(s, "water", 3);
    const entry = last(after);
    expect(entry.tone).toBe("good");
    expect(entry.delta).toBe(after.credits - s.credits);
  });

  it("interest is a bad entry with no credit delta (it moves debt, not credits)", () => {
    // Day 2 -> jump lands on day 3, an interest tick.
    const s = { ...createGame(42), day: 2, fuel: 20 };
    const r = jump(s, "vulcan");
    const entry = r.state.log.find((l) => l.msg.includes("Syndicate compounds"))!;
    expect(entry.tone).toBe("bad");
    expect(entry.delta).toBeUndefined();
  });

  it("the docking fee entry carries a negative delta", () => {
    const s = { ...createGame(42), fuel: 20 };
    const r = jump(s, "vulcan");
    const entry = r.state.log.find((l) => l.msg.startsWith("Docked at"))!;
    expect(entry).toMatchObject({ tone: "neutral", delta: -dockingFee("vulcan") });
  });

  it("paying debt logs a good entry with the negative credit delta", () => {
    const after = payDebt(createGame(42), 200);
    expect(last(after)).toEqual({ msg: "Paid down 200cr of debt.", tone: "good", delta: -200 });
  });
});

describe("interestForecast (P1-2)", () => {
  it("prices the next tick with the escalated rate for that day", () => {
    // Day 4, debt 1,140: next tick day 6, rate 6% (day >= LOAN_STEP_IMPATIENT) -> ceil(68.4).
    const s = { ...createGame(42), day: 4, debt: 1140 };
    expect(interestForecast(s)).toEqual({ inDays: 2, amount: 69 });
  });

  it("a tick day forecasts the following tick, not itself", () => {
    const s = { ...createGame(42), day: 6, debt: 1000 };
    expect(interestForecast(s)).toEqual({ inDays: 3, amount: Math.ceil(1000 * 0.08) });
  });

  it("is null with no debt or a finished run", () => {
    expect(interestForecast({ ...createGame(42), debt: 0 })).toBeNull();
    expect(interestForecast({ ...createGame(42), status: "retired" as const })).toBeNull();
  });

  // Coupling guard: the forecast matches jump()'s accrual only because both reimplement
  // the same cadence/phase. Pin them together through the REAL engine — capture the
  // forecast, then advance the run with real jumps and watch the debt. Events never touch
  // debt (they hit credits/hull/fuel/cargo), so the debt delta isolates the interest tick:
  // it must stay flat on every intermediate day and jump by exactly fc.amount on the tick
  // day, fc.inDays hops out. This fails loudly if jump's cadence drifts from interestForecast.
  it("realizes exactly the forecast on the tick day and nothing before it (no-drift)", () => {
    const startDebt = 1140;
    const start = { ...createGame(42), day: 4, debt: startDebt, fuel: 20 };
    const fc = interestForecast(start)!;
    // Two reachable stations to bounce between; refuel to the cap each hop so every jump lands.
    const bounce: NodeId[] = ["vulcan", "verge"];
    let cur = start;
    for (let step = 1; step <= fc.inDays; step++) {
      const to = bounce.find((d) => d !== cur.location)!;
      cur = jump({ ...cur, fuel: 20 }, to).state;
      if (step < fc.inDays) {
        expect(cur.debt).toBe(startDebt); // no accrual on an intermediate, non-tick day
      }
    }
    expect(cur.day).toBe(start.day + fc.inDays); // the run actually reached the forecast day
    expect(cur.debt - startDebt).toBe(fc.amount); // and accrued exactly what the chip promised
  });
});

describe("dockside provenance (E2-2d state)", () => {
  it("starts with zeroed provenance and contract counters", () => {
    const s = createGame(42);
    expect(s.boughtHere).toEqual({ water: 0, parts: 0, luxury: 0 });
    expect(s.contracts).toEqual({ delivered: 0, expired: 0, forfeitedCr: 0 });
  });

  it("buy marks units as bought at this dock", () => {
    const s = buy(createGame(42), "water", 5);
    expect(s.boughtHere.water).toBe(5);
  });

  it("a whole-dockside sale leaves the hauled units hauled", () => {
    let s = createGame(42);
    s = { ...s, cargo: { ...s.cargo, water: 5 } }; // 5 hauled
    s = buy(s, "water", 5); // +5 dockside
    s = sell(s, "water", 5);
    expect(s.boughtHere.water).toBe(0); // the dockside units went first
    expect(s.cargo.water).toBe(5); // the hauled 5 remain hauled
  });

  it("dockside units accumulate and are consumed one-for-one, not wiped", () => {
    // The whole-sale case above passes even if sell() clears boughtHere[id] outright, and
    // the single-buy case above passes even if buy() assigns qty instead of adding it.
    // Both mutants hand Task 5 a premium on units bought at the destination, so pin the
    // partial sale and the second buy.
    let s = createGame(42);
    s = { ...s, credits: 10_000, cargo: { ...s.cargo, water: 5 } }; // 5 hauled; buy() no-ops if broke
    s = buy(s, "water", 3); // dockside 3
    s = buy(s, "water", 2); // dockside 5 — a second buy accumulates
    expect(s.boughtHere.water).toBe(5);
    s = buy(s, "parts", 4);
    s = sell(s, "water", 2); // consumes 2 dockside, leaves 3
    expect(s.boughtHere.water).toBe(3);
    expect(s.boughtHere.parts).toBe(4); // an untouched commodity stays untouched
    expect(s.cargo.water).toBe(8);
  });

  it("selling hauled cargo floors boughtHere at zero instead of going negative", () => {
    // Task 5 derives the hauled pool as cargo - boughtHere, so a negative count would
    // inflate it and pay the contract premium on dockside units — the exploit reopening.
    let s = createGame(42);
    s = { ...s, cargo: { ...s.cargo, water: 5 } }; // all hauled, nothing bought here
    s = sell(s, "water", 5);
    expect(s.boughtHere.water).toBe(0);
  });

  it("a customs seizure takes the seized units' provenance with them", () => {
    // Confiscation empties cargo.luxury. If boughtHere.luxury survived it, the count would
    // outlive the units it describes: rebuying 5 dockside would leave boughtHere 15 against
    // cargo 5, and settlement would price a luxury contract off a hauled pool of -10.
    const customs: GameEvent = {
      kind: "customs",
      title: "",
      description: "",
      choices: [{ id: "comply", label: "" }],
    };
    let s = buy({ ...createGame(42), credits: 10_000 }, "luxury", 4); // luxury outprices the purse
    expect(s.boughtHere.luxury).toBe(4);
    s = resolveChoice(s, customs, "comply");
    expect(s.cargo.luxury).toBe(0);
    expect(s.boughtHere.luxury).toBe(0);
  });

  it("boughtHere resets on jump — cargo that traveled is hauled", () => {
    let s = buy(createGame(42), "water", 5);
    s = { ...s, fuel: 20 };
    s = jump(s, "kiruna").state;
    expect(s.boughtHere).toEqual({ water: 0, parts: 0, luxury: 0 });
  });

  it("event loot never counts as dockside", () => {
    // Find a clean (non-trap) salvage day for seed 42 — same divisor resolveSalvage uses.
    const cleanDay = Array.from({ length: 30 }, (_, i) => i + 1).find(
      (d) => hashSeed(42, d) % SALVAGE_HAZARD_DIVISOR !== 0
    )!;
    const salvage: GameEvent = {
      kind: "salvage",
      title: "",
      description: "",
      choices: [{ id: "collect", label: "" }],
    };
    const s = resolveChoice({ ...createGame(42), day: cleanDay }, salvage, "collect");
    expect(s.cargo.parts).toBeGreaterThan(0);
    expect(s.boughtHere.parts).toBe(0);
  });
});

describe("contract deposit escrow (E2-2a)", () => {
  const bonded: Mission = {
    id: "b1",
    commodity: "water",
    qty: 5,
    destination: "kiruna",
    reward: 500,
    deposit: 50,
    deadlineDay: 99,
  };

  it("accept debits the deposit and logs the escrow", () => {
    const s = createGame(42);
    const after = acceptMission(s, bonded);
    expect(after.credits).toBe(s.credits - 50);
    expect(after.log[after.log.length - 1]).toEqual({
      msg: "Accepted delivery to Kiruna Belt — 50cr deposit held.",
      tone: "neutral",
      delta: -50,
    });
  });

  it("accept is a silent no-op when credits cannot cover the deposit", () => {
    const s = { ...createGame(42), credits: 49 };
    expect(acceptMission(s, bonded)).toBe(s);
  });

  it("double-accept still no-ops (no double escrow)", () => {
    const once = acceptMission(createGame(42), bonded);
    expect(acceptMission(once, bonded)).toBe(once);
  });

  it("accept succeeds when credits exactly cover the deposit", () => {
    // 49 < 50 and 49 <= 50 are both true, so the no-op test above can't tell the guard's
    // operator apart. Only the boundary can — and a `<=` slip would block the player at
    // the exact moment the bond is affordable.
    const s = { ...createGame(42), credits: 50 };
    expect(s.credits).toBe(bonded.deposit); // assert the setup is actually the boundary
    const after = acceptMission(s, bonded);
    expect(after.credits).toBe(0);
    expect(after.activeMissions.map((m) => m.id)).toEqual(["b1"]);
  });
});

describe("proportional settlement (E2-2d)", () => {
  const mission = (over: Partial<Mission> = {}): Mission => ({
    id: "pv1",
    commodity: "water",
    qty: 10,
    destination: "kiruna",
    reward: 500,
    deposit: 50,
    deadlineDay: 99,
    ...over,
  });

  it("a fully hauled delivery pays reward + deposit and counts as delivered", () => {
    let s = acceptMission(createGame(42), mission());
    s = { ...s, fuel: 20, cargo: { ...s.cargo, water: 10 } }; // hauled (never bought here)
    const before = arrive(jump(s, "kiruna").state);
    expect(before.delivered.map((m) => m.id)).toEqual(["pv1"]);
    const entry = before.state.log[before.state.log.length - 1];
    expect(entry).toEqual({
      msg: "Delivery complete: +550cr (deposit returned).",
      tone: "good",
      delta: 550,
    });
    expect(before.state.contracts.delivered).toBe(1);
  });

  it("an all-dockside delivery pays spot only — the instant settle is a wash", () => {
    let s = acceptMission(createGame(42), mission());
    s = { ...s, fuel: 20 };
    s = arrive(jump(s, "kiruna").state).state; // arrive empty-handed, day 2
    const spot = getPrice(s.seed, s.day, "kiruna", "water");
    const before = s.credits;
    s = buy(s, "water", 10); // dockside
    s = deliver(s);
    expect(s.credits - before).toBe(50); // -10×spot buy, +10×spot payout, +50cr deposit back
    const entry = s.log[s.log.length - 1];
    expect(entry.msg).toBe(
      `Delivery complete: +${spot * 10 + 50}cr — 10 bought dockside paid spot (deposit returned).`
    );
    expect(entry.delta).toBe(spot * 10 + 50);
  });

  it("a topped-up delivery pays the premium only on hauled units", () => {
    let s = acceptMission(createGame(42), mission());
    s = { ...s, fuel: 20, cargo: { ...s.cargo, water: 8 } }; // hauled 8, short 2
    s = arrive(jump(s, "kiruna").state).state; // mission stays active
    expect(s.activeMissions.map((m) => m.id)).toEqual(["pv1"]);
    const spot = getPrice(s.seed, s.day, "kiruna", "water");
    s = buy(s, "water", 2);
    const before = s.credits;
    s = deliver(s);
    // 8/10 of the reward + 2 units at spot + the deposit back
    expect(s.credits - before).toBe(Math.round((500 * 8) / 10) + spot * 2 + 50);
  });

  it("two missions on one commodity drain the hauled pool in list order", () => {
    let s = acceptMission(createGame(42), mission({ id: "pv2", qty: 5, reward: 300, deposit: 30 }));
    s = acceptMission(s, mission({ id: "pv3", qty: 5, reward: 300, deposit: 30 }));
    s = { ...s, fuel: 20, cargo: { ...s.cargo, water: 5 } }; // hauled covers only the first
    s = arrive(jump(s, "kiruna").state).state; // settles pv2 fully hauled; pv3 stays (short)
    const spot = getPrice(s.seed, s.day, "kiruna", "water");
    s = buy(s, "water", 5); // dockside top-up for pv3
    const before = s.credits;
    s = deliver(s);
    expect(s.credits - before).toBe(spot * 5 + 30); // pv3: all five dockside → spot + deposit
    expect(s.contracts.delivered).toBe(2);
  });

  it("the delivery payday records the actual inflow, not the face reward", () => {
    let s = acceptMission(createGame(42), mission());
    s = { ...s, fuel: 20, cargo: { ...s.cargo, water: 10 } };
    s = arrive(jump(s, "kiruna").state).state;
    expect(s.biggestPayday!.amount).toBe(550); // reward 500 + deposit 50
  });

  it("two missions settling in ONE call share the hauled pool", () => {
    // The list-order test above settles its two missions in *separate* settleMissions
    // calls (one in arrive, one in deliver), so it never exercises the shared pool the
    // loop actually maintains. Settle both in one call: without the boughtHere decrement
    // after the first mission, the second would recompute its hauled pool from a stale
    // count and collect the premium on dockside units.
    // The first mission must draw *partially* on the dockside pool for this to bite: if it
    // consumes zero dockside units the decrement is a no-op and the case proves nothing.
    // Rewards must DIFFER, or the sum is order-invariant and a reversed loop passes: with
    // both at 300 the total depends only on how many hauled units were used in aggregate,
    // not on which contract got them.
    let s = acceptMission(createGame(42), mission({ id: "a", qty: 5, reward: 300, deposit: 30 }));
    s = acceptMission(s, mission({ id: "b", qty: 5, reward: 900, deposit: 90 }));
    s = { ...s, fuel: 20, cargo: { ...s.cargo, water: 2 } }; // 2 hauled
    s = jump(s, "kiruna").state; // boughtHere cleared; do NOT arrive — that would settle `a` early
    const spot = getPrice(s.seed, s.day, "kiruna", "water");
    s = buy(s, "water", 8); // cargo 10 = 2 hauled + 8 dockside
    const before = s.credits;
    s = deliver(s); // both settle in one loop against the shared pool
    // a is first, so it takes the hauled pair: round(300×2/5)=120 + spot×3, +30 deposit
    // b finds the pool spent, so all 5 dockside -> spot×5, +90 deposit
    expect(s.credits - before).toBe(120 + spot * 3 + 30 + spot * 5 + 90);
    expect(s.contracts.delivered).toBe(2);
    expect(s.boughtHere.water).toBe(0); // the dockside pool was drawn down, not left stale
  });

  it("a whale reward settled entirely dockside is not a bigTrade day", () => {
    // markDay must rank the day on the actual inflow, not the face reward — otherwise the
    // share strip brags about a 5,000cr contract that paid spot.
    let s = acceptMission(createGame(42), mission({ reward: 5000, deposit: 500 }));
    s = { ...s, fuel: 20 };
    s = arrive(jump(s, "kiruna").state).state; // arrive empty-handed
    s = buy(s, "water", 10);
    s = deliver(s);
    const spot = getPrice(s.seed, s.day, "kiruna", "water");
    expect(spot * 10 + 500).toBeLessThan(900); // modest inflow despite the whale reward
    expect(s.dayHighlights[s.day]).toBe("delivery");
  });

  it("rounds the premium on a split that does not divide evenly", () => {
    // The even 8/10 split above hides the rounding entirely. Math.round is half-up, so a
    // split can land ≤1cr either side of the exact share — here 166.67 pays 167.
    let s = acceptMission(createGame(42), mission({ qty: 3, reward: 500, deposit: 50 }));
    s = { ...s, fuel: 20, cargo: { ...s.cargo, water: 1 } }; // hauled 1 of 3
    s = arrive(jump(s, "kiruna").state).state;
    const spot = getPrice(s.seed, s.day, "kiruna", "water");
    s = buy(s, "water", 2);
    const before = s.credits;
    s = deliver(s);
    expect(s.credits - before).toBe(167 + spot * 2 + 50);
  });
});
