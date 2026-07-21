import { describe, it, expect } from "vitest";
import { GAME_URL, formatDateLabel, shareText } from "../../src/ui/share";

describe("shareText", () => {
  it("includes the score, day count, date, and game URL", () => {
    const txt = shareText({ dateLabel: "Jul 20", score: 84210, daysSurvived: 12 });
    expect(txt).toContain("84210");
    expect(txt).toContain("12");
    expect(txt).toContain("Jul 20");
    expect(txt).toContain(GAME_URL);
  });

  it("no longer exposes a raw seed integer", () => {
    const txt = shareText({ dateLabel: "Jul 20", score: 100, daysSurvived: 1 });
    expect(txt).not.toContain("Seed #");
  });

  it("is a single shareable blurb with the game name", () => {
    const txt = shareText({ dateLabel: "Jul 20", score: 100, daysSurvived: 1 });
    expect(txt.toLowerCase()).toContain("starlight traders");
  });
});

describe("formatDateLabel", () => {
  it("names the UTC calendar day — the same day dailySeed hashes", () => {
    // 23:30 UTC is still Jul 20 in UTC even when local time has rolled over.
    expect(formatDateLabel(new Date(Date.UTC(2026, 6, 20, 23, 30)))).toBe("Jul 20");
    expect(formatDateLabel(new Date(Date.UTC(2026, 0, 1)))).toBe("Jan 1");
  });
});
