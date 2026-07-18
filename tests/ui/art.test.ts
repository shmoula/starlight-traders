import { describe, it, expect } from "vitest";
import { BACKDROP_SVG, COMMODITY_ACCENT, ORB_ART, iconBox } from "../../src/ui/art";
import { COMMODITIES, NODE_IDS } from "../../src/engine/world";

describe("backdrop art", () => {
  it("is a single self-contained svg sized for slicing", () => {
    expect(BACKDROP_SVG.startsWith("<svg")).toBe(true);
    expect(BACKDROP_SVG).toContain('viewBox="0 0 1440 810"');
    expect(BACKDROP_SVG).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(BACKDROP_SVG.trimEnd().endsWith("</svg>")).toBe(true);
  });
});

describe("commodity art", () => {
  it("has an icon and an accent entry for every commodity", () => {
    for (const c of COMMODITIES) {
      const box = iconBox(c.id);
      expect(box).toContain('class="st-icon-box');
      expect(box).toContain('aria-hidden="true"');
      expect(box).toContain("<svg");
      expect(COMMODITY_ACCENT[c.id]).toBeDefined();
    }
  });

  it("gives luxury goods the gold accent and the rest the cyan default", () => {
    expect(iconBox("luxury")).toContain("st-icon-box--gold");
    expect(iconBox("water")).not.toContain("st-icon-box--");
    expect(iconBox("parts")).not.toContain("st-icon-box--");
  });
});

describe("orb art", () => {
  it("defines a radial-gradient for every station", () => {
    for (const n of NODE_IDS) {
      expect(ORB_ART[n]).toContain("radial-gradient");
    }
  });
});
