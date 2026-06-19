// src/ui/share.ts

export interface ShareData {
  seed: number;
  score: number;
  daysSurvived: number;
}

export function shareText(d: ShareData): string {
  return [
    `🚀 Starlight Traders — Daily Run`,
    `Score ${d.score} · survived ${d.daysSurvived} days`,
    `Seed #${d.seed} — beat my run!`,
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
