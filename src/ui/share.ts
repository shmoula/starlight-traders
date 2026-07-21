// src/ui/share.ts

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

export interface ShareData {
  dateLabel: string;
  score: number;
  daysSurvived: number;
}

export function shareText(d: ShareData): string {
  return [
    `🚀 Starlight Traders — ${d.dateLabel}`,
    `Score ${d.score} · survived ${d.daysSurvived} days`,
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
