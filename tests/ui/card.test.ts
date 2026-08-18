import { describe, it, expect } from "vitest";
import { CARD_H, CARD_PALETTE, CARD_W, CardData, DrawOp, cardOps } from "../../src/ui/card";

const DATA: CardData = {
  dateLabel: "Aug 18",
  score: 4210,
  daysSurvived: 12,
  runNumber: 49,
  label: "The Daily",
  strip: "🟦".repeat(12),
  endLabel: "Audited",
  modifier: "☀ Clear skies",
  kinds: [
    "plain",
    "pirates",
    "delivery",
    "plain",
    "bigTrade",
    "plain",
    "rescue",
    "plain",
    "plain",
    "delivery",
    "plain",
    "plain",
  ],
  peak: 6100,
};

const textsOf = (ops: DrawOp[]): string[] =>
  ops.filter((o): o is Extract<DrawOp, { op: "text" }> => o.op === "text").map((o) => o.text);

describe("cardOps (E3-5) — the card is deterministic data", () => {
  it("is deterministic: same data, deep-equal ops", () => {
    expect(cardOps(DATA)).toEqual(cardOps({ ...DATA }));
  });

  it("stays inside the canvas", () => {
    for (const o of cardOps(DATA)) {
      if (o.op === "rect" || o.op === "rrect") {
        expect(o.x).toBeGreaterThanOrEqual(0);
        expect(o.y).toBeGreaterThanOrEqual(0);
        expect(o.x + o.w).toBeLessThanOrEqual(CARD_W);
        expect(o.y + o.h).toBeLessThanOrEqual(CARD_H);
      }
      if (o.op === "circle") {
        expect(o.x - o.r).toBeGreaterThanOrEqual(0);
        expect(o.x + o.r).toBeLessThanOrEqual(CARD_W);
        expect(o.y + o.r).toBeLessThanOrEqual(CARD_H);
      }
      if (o.op === "text") {
        expect(o.y).toBeGreaterThan(0);
        expect(o.y).toBeLessThanOrEqual(CARD_H);
      }
    }
  });

  it("draws one cell per day", () => {
    const cells = cardOps(DATA).filter((o) => o.op === "rrect" && o.w === 64 && o.h === 64);
    expect(cells).toHaveLength(DATA.kinds.length);
  });

  it("says the things a share card must say", () => {
    const texts = textsOf(cardOps(DATA));
    expect(texts).toContain("Score 4,210");
    expect(texts.some((t) => t.includes("#49 · Aug 18 · The Daily · ☀ Clear skies"))).toBe(true);
    expect(texts.some((t) => t.includes("survived 12 days — Audited"))).toBe(true);
    expect(texts.some((t) => t.includes("Peak 6,100cr"))).toBe(true);
    expect(texts.some((t) => t.includes("Beat my run:"))).toBe(true);
  });

  it("adds the feat line only when a feat was earned", () => {
    const texts = textsOf(cardOps({ ...DATA, featNames: ["High Roller", "Debt Free"] }));
    expect(texts.some((t) => t.includes("★ High Roller +1 more"))).toBe(true);
    expect(textsOf(cardOps(DATA)).some((t) => t.startsWith("★"))).toBe(false);
  });

  it("uses only palette colors", () => {
    const allowed = new Set<string>(Object.values(CARD_PALETTE));
    for (const o of cardOps(DATA)) {
      if ("fill" in o && o.fill) expect(allowed.has(o.fill), String(o.fill)).toBe(true);
      if ("stroke" in o && o.stroke) expect(allowed.has(o.stroke), String(o.stroke)).toBe(true);
    }
  });
});
