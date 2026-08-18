// src/ui/share.ts

import { DayHighlightKind, RunEndStatus } from "../engine/types";

/** Public home of the game — the share card's call to action. Swap once an itch.io page exists. */
export const GAME_URL = "https://github.com/shmoula/starlight-traders";

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** UTC month-day label ("Jul 20") — names the same calendar day dailySeed hashes. */
export function formatDateLabel(date: Date): string {
  return DATE_FMT.format(date);
}

/** Fixed epoch for the shared daily index — the game's first daily. */
const RUN_NUMBER_EPOCH_UTC = Date.UTC(2026, 6, 1); // 2026-07-01

/** UTC "YYYY-MM-DD" for an ISO instant — the human-facing key for a day's runs. */
export function utcDateKey(bootISO: string): string {
  return new Date(bootISO).toISOString().slice(0, 10);
}

/** Shared daily index: #1 on 2026-07-01, +1 per UTC day. Identical for all players on a date. */
export function runNumber(bootISO: string): number {
  const d = new Date(bootISO);
  const midnightUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((midnightUTC - RUN_NUMBER_EPOCH_UTC) / 86_400_000) + 1;
}

/** One cell of the run-strip: a day's highlight, an uneventful day, or the death day. */
export type StripCellKind = DayHighlightKind | "plain" | "death";

/**
 * The structured strip — one kind per day survived (E1-2/E3-5). The ONLY derivation:
 * runStrip maps it to emoji, screens.ts's stripCells to spans, and card.ts's cardOps to
 * drawn cells, so the pasted text, the debrief HTML, and the PNG tell one story (B-1).
 */
export function stripKinds(
  highlights: Partial<Record<number, DayHighlightKind>>,
  daysSurvived: number,
  status: RunEndStatus
): StripCellKind[] {
  const out: StripCellKind[] = [];
  for (let day = 1; day <= daysSurvived; day++) {
    if (day === daysSurvived && status === "lost") {
      out.push("death");
      continue;
    }
    out.push(highlights[day] ?? "plain");
  }
  return out;
}

const STRIP_GLYPHS: Record<StripCellKind, string> = {
  pirates: "🟥",
  rescue: "🟩",
  bigTrade: "💰",
  delivery: "🟨",
  plain: "🟦",
  death: "💀",
};

/** One glyph per day survived — the spoiler-free story of the run (E1-2). */
export function runStrip(
  highlights: Partial<Record<number, DayHighlightKind>>,
  daysSurvived: number,
  status: RunEndStatus
): string {
  return stripKinds(highlights, daysSurvived, status)
    .map((k) => STRIP_GLYPHS[k])
    .join("");
}

const STRIP_NOUNS: Record<DayHighlightKind, [one: string, many: string]> = {
  pirates: ["pirate encounter", "pirate encounters"],
  rescue: ["distress call answered", "distress calls answered"],
  bigTrade: ["big trade", "big trades"],
  delivery: ["delivery", "deliveries"],
};

/**
 * The run-strip in words, for assistive tech — the glyphs themselves read as a useless
 * run of "blue square, blue square". Derived from the same stripKinds the glyphs are.
 */
export function stripSummary(
  highlights: Partial<Record<number, DayHighlightKind>>,
  daysSurvived: number,
  status: RunEndStatus
): string {
  const kinds = stripKinds(highlights, daysSurvived, status);
  const tally = new Map<DayHighlightKind, number>();
  for (const k of kinds) {
    if (k === "plain" || k === "death") continue;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  const parts = (Object.keys(STRIP_NOUNS) as DayHighlightKind[])
    .filter((k) => tally.has(k))
    .map((k) => {
      const n = tally.get(k)!;
      return `${n} ${STRIP_NOUNS[k][n === 1 ? 0 : 1]}`;
    });
  if (kinds[kinds.length - 1] === "death") parts.push("lost on the final day");
  const days = `${daysSurvived} day${daysSurvived === 1 ? "" : "s"}`;
  return parts.length ? `${days}: ${parts.join(", ")}.` : `${days}, all uneventful.`;
}

export interface ShareData {
  dateLabel: string;
  score: number;
  daysSurvived: number;
  runNumber: number;
  label: "The Daily" | "Practice";
  /** Emoji run-strip from runStrip() — one glyph per day. */
  strip: string;
  /**
   * Short end headline from endHeadline() — "Audited" / "Retired" / "Ship Destroyed" /
   * "Stranded". Deliberately not RunEnd.cause, which is a full player-facing sentence.
   */
  endLabel: string;
  /** Names of feats first earned by this run (E2-5d); the card stays byte-identical without them. */
  featNames?: string[];
  /** "{glyph} {name}" of the day's modifier (E3-1b) — the card's built-in excuse/brag. */
  modifier: string;
}

export function shareText(d: ShareData): string {
  // The locale is pinned rather than the player's: the card is a cross-audience artifact,
  // so its thousands separator must not shift depending on who generated it.
  const feat = d.featNames?.length
    ? [`★ ${d.featNames[0]}${d.featNames.length > 1 ? ` +${d.featNames.length - 1} more` : ""}`]
    : [];
  return [
    `🚀 Starlight #${d.runNumber} · ${d.dateLabel} · ${d.label} · ${d.modifier}`,
    `Score ${d.score.toLocaleString("en-US")} · survived ${d.daysSurvived} days — ${d.endLabel}`,
    d.strip,
    ...feat,
    `Beat my run: ${GAME_URL}`,
  ].join("\n");
}

/** Copy share text to clipboard; returns true on success. Browser-only. */
export async function copyShare(d: ShareData): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(shareText(d));
    return true;
  } catch {
    return false;
  }
}
