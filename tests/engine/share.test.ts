import { describe, it, expect } from "vitest";
import { shareText } from "../../src/ui/share";

describe("shareText", () => {
  it("includes the score, day count, and seed for comparability", () => {
    const txt = shareText({ seed: 20260618, score: 84210, daysSurvived: 12 });
    expect(txt).toContain("84210");
    expect(txt).toContain("12");
    expect(txt).toContain("20260618");
  });

  it("is a single shareable blurb with the game name", () => {
    const txt = shareText({ seed: 1, score: 100, daysSurvived: 1 });
    expect(txt.toLowerCase()).toContain("starlight traders");
  });
});
