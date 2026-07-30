import { describe, it, expect } from "vitest";
import {
  GAME_URL,
  formatDateLabel,
  shareText,
  utcDateKey,
  runNumber,
  runStrip,
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
    });
    const lines = txt.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("🚀 Starlight #29 · Jul 29 · The Daily");
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
    });
    const lines = txt.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe("Score 0 · survived 4 days — Ship Destroyed");
    expect(lines[2]).toBe("🟦💰🟥💀"); // one glyph per day, death stamped on the last
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

  it("stamps 💀 on the final day of a lost run only", () => {
    expect(runStrip({ 3: "pirates" }, 3, "lost")).toBe("🟦🟦💀"); // 💀 outranks the day's own mark
    expect(runStrip({}, 1, "lost")).toBe("💀"); // day-1 death is a single skull
    expect(runStrip({}, 3, "audited")).toBe("🟦🟦🟦"); // banked runs never show 💀
  });
});
