import { describe, it, expect } from "vitest";
import {
  GAME_URL,
  formatDateLabel,
  shareText,
  utcDateKey,
  runNumber,
  runStrip,
  stripSummary,
  stripKinds,
} from "../../src/ui/share";

describe("shareText", () => {
  it("includes the score, day count, date, run number, label, and game URL", () => {
    const txt = shareText({
      dateLabel: "Jul 20",
      score: 84210,
      daysSurvived: 12,
      runNumber: 20,
      label: "The Daily",
      strip: "🟦",
      endLabel: "Audited",
      modifier: "⚡ Ion storms",
    });
    expect(txt).toContain("84,210");
    expect(txt).toContain("12");
    expect(txt).toContain("Jul 20");
    expect(txt).toContain("#20");
    expect(txt).toContain("The Daily");
    expect(txt).toContain(GAME_URL);
  });

  it("no longer exposes a raw seed integer", () => {
    const txt = shareText({
      dateLabel: "Jul 20",
      score: 100,
      daysSurvived: 1,
      runNumber: 20,
      label: "Practice",
      strip: "🟦",
      endLabel: "Audited",
      modifier: "⚡ Ion storms",
    });
    expect(txt).not.toContain("Seed #");
    expect(txt).toContain("Practice");
  });

  it("is a single shareable blurb with the game name", () => {
    const txt = shareText({
      dateLabel: "Jul 20",
      score: 100,
      daysSurvived: 1,
      runNumber: 20,
      label: "Practice",
      strip: "🟦",
      endLabel: "Audited",
      modifier: "⚡ Ion storms",
    });
    expect(txt.toLowerCase()).toContain("starlight");
  });

  it("is the four-line v2 card: identity, score+cause, strip, URL", () => {
    const txt = shareText({
      dateLabel: "Jul 29",
      score: 2140,
      daysSurvived: 12,
      runNumber: 29,
      label: "The Daily",
      strip: "🟦🟦🟥💰🟦🟨🟦🟦💰🟦🟦🟦",
      endLabel: "Audited",
      modifier: "⚡ Ion storms",
    });
    const lines = txt.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("🚀 Starlight #29 · Jul 29 · The Daily · ⚡ Ion storms");
    expect(lines[1]).toBe("Score 2,140 · survived 12 days — Audited");
    expect(lines[2]).toBe("🟦🟦🟥💰🟦🟨🟦🟦💰🟦🟦🟦");
    expect(lines[3]).toBe(`Beat my run: ${GAME_URL}`);
  });

  it("reads correctly for a lost run — 💀-tipped strip and the death headline", () => {
    const txt = shareText({
      dateLabel: "Jul 29",
      score: 0,
      daysSurvived: 4,
      runNumber: 29,
      label: "Practice",
      strip: runStrip({ 2: "bigTrade", 3: "pirates" }, 4, "lost"),
      endLabel: "Ship Destroyed",
      modifier: "⚡ Ion storms",
    });
    const lines = txt.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe("Score 0 · survived 4 days — Ship Destroyed");
    expect(lines[2]).toBe("🟦💰🟥💀"); // one glyph per day, death stamped on the last
  });
});

describe("share feat line (E2-5d)", () => {
  const BASE = {
    dateLabel: "Jul 20",
    score: 84210,
    daysSurvived: 12,
    runNumber: 20,
    label: "The Daily" as const,
    strip: "🟦",
    endLabel: "Audited",
    modifier: "⚡ Ion storms",
  };

  it("line 1 carries the day's modifier tag (E3-1b)", () => {
    const text = shareText({ ...BASE, modifier: "⚡ Ion storms" });
    expect(text.split("\n")[0]).toContain("· ⚡ Ion storms");
  });

  it("appends one line naming the first new feat", () => {
    const text = shareText({ ...BASE, featNames: ["Clean Sweep"] });
    expect(text).toContain("\n★ Clean Sweep\n");
  });
  it("counts the rest instead of listing them", () => {
    const text = shareText({ ...BASE, featNames: ["Clean Sweep", "Full House", "Audited"] });
    expect(text).toContain("★ Clean Sweep +2 more");
  });
  it("a card without new feats is byte-identical to before", () => {
    expect(shareText(BASE)).toBe(shareText({ ...BASE, featNames: [] }));
    expect(shareText(BASE)).not.toContain("★");
  });
});

describe("formatDateLabel", () => {
  it("names the UTC calendar day — the same day dailySeed hashes", () => {
    // 23:30 UTC is still Jul 20 in UTC even when local time has rolled over.
    expect(formatDateLabel(new Date(Date.UTC(2026, 6, 20, 23, 30)))).toBe("Jul 20");
    expect(formatDateLabel(new Date(Date.UTC(2026, 0, 1)))).toBe("Jan 1");
  });
});

describe("utcDateKey", () => {
  it("returns the UTC calendar day as YYYY-MM-DD", () => {
    expect(utcDateKey(new Date(Date.UTC(2026, 6, 20, 23, 30)).toISOString())).toBe("2026-07-20");
    expect(utcDateKey(new Date(Date.UTC(2026, 0, 1, 0, 0)).toISOString())).toBe("2026-01-01");
  });
});

describe("runNumber", () => {
  it("is #1 on the epoch day and +1 per UTC day", () => {
    expect(runNumber(new Date(Date.UTC(2026, 6, 1)).toISOString())).toBe(1);
    expect(runNumber(new Date(Date.UTC(2026, 6, 22, 18, 0)).toISOString())).toBe(22);
  });
  it("is stable across the whole UTC day", () => {
    expect(runNumber(new Date(Date.UTC(2026, 6, 22, 0, 0)).toISOString())).toBe(
      runNumber(new Date(Date.UTC(2026, 6, 22, 23, 59)).toISOString())
    );
  });
});

describe("runStrip", () => {
  it("renders one default glyph per day survived", () => {
    expect(runStrip({}, 12, "audited")).toBe("🟦".repeat(12));
  });

  it("maps highlights to their glyphs", () => {
    expect(runStrip({ 2: "pirates", 3: "bigTrade", 4: "delivery" }, 5, "retired")).toBe(
      "🟦🟥💰🟨🟦"
    );
  });

  it("summarises the strip in words for assistive tech", () => {
    expect(stripSummary({}, 12, "audited")).toBe("12 days, all uneventful.");
    expect(stripSummary({}, 1, "retired")).toBe("1 day, all uneventful.");
    expect(stripSummary({ 2: "pirates", 3: "pirates", 5: "bigTrade" }, 6, "audited")).toBe(
      "6 days: 2 pirate encounters, 1 big trade."
    );
    // The final day of a lost run counts as the death, not as its own highlight.
    expect(stripSummary({ 3: "pirates" }, 3, "lost")).toBe("3 days: lost on the final day.");
    expect(stripSummary({ 2: "delivery" }, 3, "lost")).toBe(
      "3 days: 1 delivery, lost on the final day."
    );
  });

  it("maps a rescue day to 🟩 and counts it in the summary (E3-3)", () => {
    expect(runStrip({ 2: "rescue" }, 3, "audited")).toBe("🟦🟩🟦");
    expect(stripSummary({ 2: "rescue" }, 3, "audited")).toContain("1 distress call answered");
  });

  it("stamps 💀 on the final day of a lost run only", () => {
    expect(runStrip({ 3: "pirates" }, 3, "lost")).toBe("🟦🟦💀"); // 💀 outranks the day's own mark
    expect(runStrip({}, 1, "lost")).toBe("💀"); // day-1 death is a single skull
    expect(runStrip({}, 3, "audited")).toBe("🟦🟦🟦"); // banked runs never show 💀
  });
});

describe("stripKinds (E3-5) — the one cell derivation", () => {
  it("derives one kind per day, death stamping a lost final day", () => {
    expect(stripKinds({ 1: "pirates" }, 3, "lost")).toEqual(["pirates", "plain", "death"]);
    expect(stripKinds({ 2: "delivery" }, 2, "audited")).toEqual(["plain", "delivery"]);
    expect(stripKinds({ 2: "rescue" }, 2, "retired")).toEqual(["plain", "rescue"]);
  });

  it("death outranks whatever else the final day held", () => {
    expect(stripKinds({ 2: "bigTrade" }, 2, "lost")).toEqual(["plain", "death"]);
  });
});
