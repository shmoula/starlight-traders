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

const STRIP_GLYPHS: Record<DayHighlightKind, string> = {
  pirates: "🟥",
  bigTrade: "💰",
  delivery: "🟨",
};

/**
 * One glyph per day survived — the spoiler-free story of the run (E1-2). 💀 stamps the
 * final day of a lost run (derived from RunEnd, not recorded); unmarked days are 🟦.
 */
export function runStrip(
  highlights: Partial<Record<number, DayHighlightKind>>,
  daysSurvived: number,
  status: RunEndStatus
): string {
  let out = "";
  for (let day = 1; day <= daysSurvived; day++) {
    if (day === daysSurvived && status === "lost") {
      out += "💀";
      continue;
    }
    const kind = highlights[day];
    out += kind ? STRIP_GLYPHS[kind] : "🟦";
  }
  return out;
}

const STRIP_NOUNS: Record<DayHighlightKind, [one: string, many: string]> = {
  pirates: ["pirate encounter", "pirate encounters"],
  bigTrade: ["big trade", "big trades"],
  delivery: ["delivery", "deliveries"],
};

/**
 * The run-strip in words, for assistive tech — the glyphs themselves read as a useless
 * run of "blue square, blue square". Counts only days inside the strip, and treats a lost
 * run's final day as the death rather than whatever else it held, exactly as runStrip does.
 */
export function stripSummary(
  highlights: Partial<Record<number, DayHighlightKind>>,
  daysSurvived: number,
  status: RunEndStatus
): string {
  const lost = status === "lost";
  const tally = new Map<DayHighlightKind, number>();
  for (let day = 1; day <= daysSurvived; day++) {
    if (day === daysSurvived && lost) continue;
    const kind = highlights[day];
    if (kind) tally.set(kind, (tally.get(kind) ?? 0) + 1);
  }
  const parts = (Object.keys(STRIP_NOUNS) as DayHighlightKind[])
    .filter((k) => tally.has(k))
    .map((k) => {
      const n = tally.get(k)!;
      return `${n} ${STRIP_NOUNS[k][n === 1 ? 0 : 1]}`;
    });
  if (lost) parts.push("lost on the final day");
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
}

export function shareText(d: ShareData): string {
  // The locale is pinned rather than the player's: the card is a cross-audience artifact,
  // so its thousands separator must not shift depending on who generated it.
  const feat = d.featNames?.length
    ? [`★ ${d.featNames[0]}${d.featNames.length > 1 ? ` +${d.featNames.length - 1} more` : ""}`]
    : [];
  return [
    `🚀 Starlight #${d.runNumber} · ${d.dateLabel} · ${d.label}`,
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
