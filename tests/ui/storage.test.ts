import { describe, it, expect, vi, afterEach } from "vitest";
import { emptySave, labelForDay, recordRunEnd, loadSave, persist } from "../../src/ui/storage";
import { RunEnd } from "../../src/engine/types";

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
