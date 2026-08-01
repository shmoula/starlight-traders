import { describe, it, expect, vi, afterEach } from "vitest";
import {
  emptySave,
  labelForDay,
  recordRunEnd,
  loadSave,
  persist,
  parseSnapshot,
  loadSnapshot,
  persistSnapshot,
  clearSnapshot,
  RunSnapshot,
} from "../../src/ui/storage";
import { RunEnd, GameEvent } from "../../src/engine/types";
import { createGame } from "../../src/engine/game";
import { utcDateKey, runStrip } from "../../src/ui/share";

const KEY = "2026-07-22";

function banked(score: number, status: "audited" | "retired" = "audited"): RunEnd {
  return { status, cause: "x", daysSurvived: 12, netWorthAtEnd: score, survivalBonus: 0, score };
}
function lost(score: number): RunEnd {
  return {
    status: "lost",
    cause: "x",
    daysSurvived: 3,
    netWorthAtEnd: score,
    survivalBonus: 0,
    score,
    lossCause: "fuel",
  };
}

describe("labelForDay", () => {
  it("is The Daily before any completed run today", () => {
    expect(labelForDay(emptySave(), KEY)).toBe("The Daily");
  });
  it("is Practice once a run today has completed", () => {
    const { save } = recordRunEnd(emptySave(), KEY, banked(100));
    expect(labelForDay(save, KEY)).toBe("Practice");
  });
});

describe("recordRunEnd", () => {
  it("the first completed run of a day is The Daily — even a death", () => {
    const r = recordRunEnd(emptySave(), KEY, lost(0));
    expect(r.save.days[KEY].attempts).toBe(1);
    expect(r.save.days[KEY].firstTryOutcome).toBe("lost");
    expect(r.save.daysFlownCount).toBe(1);
    expect(r.isFirstEver).toBe(true);
    expect(r.isNewPB).toBe(false);
  });

  it("later runs that day increment attempts and lift the day best", () => {
    const first = recordRunEnd(emptySave(), KEY, banked(100));
    const second = recordRunEnd(first.save, KEY, banked(300));
    expect(second.save.days[KEY].attempts).toBe(2);
    expect(second.save.days[KEY].bestScore).toBe(300);
    expect(second.save.days[KEY].firstTryScore).toBe(100); // The Daily result is frozen
    expect(second.isNewPB).toBe(true);
    expect(second.pbDelta).toBe(200);
    expect(second.prevBest).toBe(100);
  });

  it("increments daysFlown at most once per day", () => {
    const a = recordRunEnd(emptySave(), KEY, banked(100));
    const b = recordRunEnd(a.save, KEY, banked(50));
    expect(b.save.daysFlownCount).toBe(1);
  });

  it("counts a new day separately", () => {
    const a = recordRunEnd(emptySave(), "2026-07-22", banked(100));
    const b = recordRunEnd(a.save, "2026-07-23", banked(50));
    expect(b.save.daysFlownCount).toBe(2);
    expect(labelForDay(b.save, "2026-07-23")).toBe("Practice");
  });

  it("tracks all-time PB across days", () => {
    const a = recordRunEnd(emptySave(), "2026-07-22", banked(100));
    const b = recordRunEnd(a.save, "2026-07-23", banked(400));
    expect(b.save.allTimePB).toBe(400);
  });

  it("keeps the earlier bestOutcome when a later run ties the day best", () => {
    const first = recordRunEnd(emptySave(), KEY, banked(100, "audited"));
    const second = recordRunEnd(first.save, KEY, lost(100)); // same score, different outcome
    expect(second.save.days[KEY].bestScore).toBe(100);
    expect(second.save.days[KEY].bestOutcome).toBe("audited"); // strict-> guard: tie does not overwrite
  });

  it("suppresses isNewPB on a first-ever run even with a positive score", () => {
    const r = recordRunEnd(emptySave(), KEY, banked(500));
    expect(r.isFirstEver).toBe(true);
    expect(r.isNewPB).toBe(false); // no "New PB!" celebration on the very first banked run
    expect(r.save.allTimePB).toBe(500);
  });
});

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("loadSave / persist", () => {
  it("round-trips a save", () => {
    vi.stubGlobal("localStorage", memStore());
    const s = recordRunEnd(emptySave(), KEY, banked(250)).save;
    persist(s);
    expect(loadSave()).toEqual(s);
  });

  it("returns null when nothing is stored", () => {
    vi.stubGlobal("localStorage", memStore());
    expect(loadSave()).toBeNull();
  });

  it("returns null on a version mismatch", () => {
    const store = memStore();
    store.setItem(
      "starlight.save.v1",
      JSON.stringify({ version: 2, days: {}, allTimePB: 0, daysFlownCount: 0 })
    );
    vi.stubGlobal("localStorage", store);
    expect(loadSave()).toBeNull();
  });

  it.each([
    ["a missing days map", { version: 1, allTimePB: 0, daysFlownCount: 0 }],
    ["a null days map", { version: 1, days: null, allTimePB: 0, daysFlownCount: 0 }],
    ["a non-numeric allTimePB", { version: 1, days: {}, allTimePB: "0", daysFlownCount: 0 }],
    ["a missing daysFlownCount", { version: 1, days: {}, allTimePB: 0 }],
    ["a bare JSON literal", 1],
  ])("returns null on %s", (_why, stored) => {
    const store = memStore();
    store.setItem("starlight.save.v1", JSON.stringify(stored));
    vi.stubGlobal("localStorage", store);
    expect(loadSave()).toBeNull();
  });

  it("degrades silently when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("private mode");
      },
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(loadSave()).toBeNull();
    expect(() => persist(emptySave())).not.toThrow();
  });
});

const BOOT = new Date(Date.UTC(2026, 6, 29, 10, 0)).toISOString();
const TODAY = utcDateKey(BOOT); // "2026-07-29"

function liveSnapshot(overrides: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    version: 2,
    dateKey: TODAY,
    label: "The Daily",
    state: createGame(42, BOOT),
    pendingEvent: null,
    logMarkBeforeJump: 0,
    ...overrides,
  };
}

describe("parseSnapshot", () => {
  it("round-trips a live snapshot", () => {
    const snap = liveSnapshot();
    expect(parseSnapshot(JSON.stringify(snap), TODAY)).toEqual(snap);
  });

  it("round-trips a pending in-transit event (resume INTO the event screen)", () => {
    const evt: GameEvent = {
      kind: "pirates",
      title: "Pirate Ambush",
      description: "d",
      choices: [
        { id: "pay", label: "Pay" },
        { id: "flee", label: "Flee" },
      ],
    };
    const snap = liveSnapshot({ pendingEvent: evt, logMarkBeforeJump: 3 });
    expect(parseSnapshot(JSON.stringify(snap), TODAY)).toEqual(snap);
  });

  // The E0-5/E1-2 seam: dayHighlights is keyed by number but JSON stringifies keys as
  // strings, so a resumed run must still render its run-strip (E1-2) correctly.
  it("round-trips dayHighlights so a resumed run keeps its run-strip", () => {
    const base = createGame(42, BOOT);
    const snap = liveSnapshot({
      state: { ...base, day: 3, dayHighlights: { 2: "pirates", 3: "bigTrade" } },
    });
    const parsed = parseSnapshot(JSON.stringify(snap), TODAY);
    expect(parsed).toEqual(snap);
    expect(parsed!.state.dayHighlights[2]).toBe("pirates");
    expect(runStrip(parsed!.state.dayHighlights, 3, "audited")).toBe("🟦🟥💰");
  });

  it("round-trips a Practice-labelled snapshot", () => {
    const snap = liveSnapshot({ label: "Practice" });
    expect(parseSnapshot(JSON.stringify(snap), TODAY)).toEqual(snap);
  });

  it("rejects a snapshot from another UTC day (stale — day rolled over)", () => {
    const snap = liveSnapshot({ dateKey: "2026-07-28" });
    expect(parseSnapshot(JSON.stringify(snap), TODAY)).toBeNull();
  });

  it("rejects an ended run — only live runs resume", () => {
    const snap = liveSnapshot();
    const ended = { ...snap, state: { ...snap.state, status: "audited" } };
    expect(parseSnapshot(JSON.stringify(ended), TODAY)).toBeNull();
  });

  it.each([
    ["a wrong version", { version: 3 }],
    ["a bad label", { label: "Casual" }],
    ["a non-numeric logMarkBeforeJump", { logMarkBeforeJump: "3" }],
    ["a null state", { state: null }],
    ["an unknown location", { state: { ...createGame(42, BOOT), location: "atlantis" } }],
    [
      "an event with no choices",
      { pendingEvent: { kind: "pirates", title: "", description: "", choices: [] } },
    ],
    [
      "an event with malformed choices",
      {
        pendingEvent: {
          kind: "pirates",
          title: "",
          description: "",
          choices: [{ label: "no id" }],
        },
      },
    ],
    ["a missing pendingEvent field", { pendingEvent: undefined }],
    // markDay indexes dayHighlights inside the engine, and syncSnapshot feeds bootDate to
    // utcDateKey — both in the action handler, where a throw stalls the run outright.
    ["missing dayHighlights", { state: { ...createGame(42, BOOT), dayHighlights: undefined } }],
    ["a null dayHighlights", { state: { ...createGame(42, BOOT), dayHighlights: null } }],
    [
      "an unknown dayHighlights kind",
      { state: { ...createGame(42, BOOT), dayHighlights: { 2: "supernova" } } },
    ],
    ["an empty bootDate", { state: { ...createGame(42, BOOT), bootDate: "" } }],
    ["an unparsable bootDate", { state: { ...createGame(42, BOOT), bootDate: "not-a-date" } }],
    [
      "a bootDate from another UTC day than the envelope",
      { state: createGame(42, new Date(Date.UTC(2026, 6, 28, 10, 0)).toISOString()) },
    ],
  ] as [string, Record<string, unknown>][])("rejects %s", (_why, override) => {
    const snap = { ...liveSnapshot(), ...override };
    expect(parseSnapshot(JSON.stringify(snap), TODAY)).toBeNull();
  });

  it("rejects garbage and absence", () => {
    expect(parseSnapshot("{not json", TODAY)).toBeNull();
    expect(parseSnapshot(null, TODAY)).toBeNull();
  });
});

describe("snapshot v1 → v2 log migration (P2-1)", () => {
  it("accepts a v1 snapshot, wrapping string log lines as neutral entries", () => {
    const base = liveSnapshot({});
    const v1 = {
      ...base,
      version: 1,
      state: {
        ...base.state,
        log: ["Docked at Terra Hub, fee 40cr.", "Bought 2 Water / Ice for 30cr."],
      },
    };
    const parsed = parseSnapshot(JSON.stringify(v1), v1.dateKey);
    expect(parsed).not.toBeNull();
    expect(parsed!.version).toBe(2);
    expect(parsed!.state.log).toEqual([
      { msg: "Docked at Terra Hub, fee 40cr.", tone: "neutral" },
      { msg: "Bought 2 Water / Ice for 30cr.", tone: "neutral" },
    ]);
  });

  it("accepts a well-formed v2 snapshot", () => {
    const snap = liveSnapshot({});
    expect(parseSnapshot(JSON.stringify(snap), snap.dateKey)).not.toBeNull();
  });

  it("rejects a snapshot whose log is not an array of entries", () => {
    const base = liveSnapshot({});
    const bad = { ...base, state: { ...base.state, log: [42, { tone: "good" }] } };
    expect(parseSnapshot(JSON.stringify(bad), base.dateKey)).toBeNull();
  });

  it.each([
    ["a log entry missing tone", { msg: "hi" }],
    ["a log entry with an unknown tone", { msg: "hi", tone: "great" }],
    ["a log entry with a non-string tone", { msg: "hi", tone: 1 }],
    ["a log entry with a non-numeric delta", { msg: "hi", tone: "good", delta: "10" }],
    ["a log entry with a non-finite delta", { msg: "hi", tone: "good", delta: null }],
  ] as [string, unknown][])("rejects %s", (_why, entry) => {
    const base = liveSnapshot({});
    const bad = { ...base, state: { ...base.state, log: [entry] } };
    expect(parseSnapshot(JSON.stringify(bad), base.dateKey)).toBeNull();
  });

  it("accepts a log entry carrying a valid tone and finite delta", () => {
    const base = liveSnapshot({});
    const log = [{ msg: "Sold 3 Water / Ice for 90cr.", tone: "good", delta: 90 }];
    const snap = { ...base, state: { ...base.state, log } };
    expect(parseSnapshot(JSON.stringify(snap), base.dateKey)).toEqual(snap);
  });
});

describe("loadSnapshot / persistSnapshot / clearSnapshot", () => {
  it("round-trips through storage", () => {
    vi.stubGlobal("localStorage", memStore());
    const snap = liveSnapshot();
    persistSnapshot(snap);
    expect(loadSnapshot(TODAY)).toEqual(snap);
  });

  it("clearSnapshot removes it", () => {
    vi.stubGlobal("localStorage", memStore());
    persistSnapshot(liveSnapshot());
    clearSnapshot();
    expect(loadSnapshot(TODAY)).toBeNull();
  });

  it("is stored under its own key, separate from the results ledger", () => {
    const store = memStore();
    vi.stubGlobal("localStorage", store);
    persistSnapshot(liveSnapshot());
    expect(store.getItem("starlight.run.v1")).not.toBeNull();
    expect(store.getItem("starlight.save.v1")).toBeNull();
  });

  it("degrades silently when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("private mode");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("private mode");
      },
    });
    expect(loadSnapshot(TODAY)).toBeNull();
    expect(() => persistSnapshot(liveSnapshot())).not.toThrow();
    expect(() => clearSnapshot()).not.toThrow();
  });
});
