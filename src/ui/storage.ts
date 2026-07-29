// src/ui/storage.ts
//
// Per-player persistence for Starlight Traders (E0-3). Lives at the UI boundary so the
// pure engine and the balance sim never touch localStorage. Pure logic is separated
// from the I/O wrapper: `recordRunEnd`/`labelForDay` are deterministic and unit-tested;
// `loadSave`/`persist` are the only browser-only functions and degrade silently.
import { RunEnd, RunEndStatus } from "../engine/types";

export interface DayRecord {
  attempts: number; // completed runs this UTC day
  bestScore: number;
  bestOutcome: RunEndStatus;
  firstTryScore: number; // "The Daily" result — first completed run, any outcome
  firstTryOutcome: RunEndStatus;
}

export interface StarlightSave {
  version: 1;
  days: Record<string, DayRecord>; // key = UTC "YYYY-MM-DD"
  allTimePB: number;
  daysFlownCount: number;
}

export function emptySave(): StarlightSave {
  return { version: 1, days: {}, allTimePB: 0, daysFlownCount: 0 };
}

/** The run about to start is The Daily until a run has *completed* today. */
export function labelForDay(save: StarlightSave, dateKey: string): "The Daily" | "Practice" {
  return (save.days[dateKey]?.attempts ?? 0) >= 1 ? "Practice" : "The Daily";
}

export interface RecordResult {
  save: StarlightSave;
  pbDelta: number;
  isNewPB: boolean;
  prevBest: number;
  isFirstEver: boolean;
}

/** Fold a finished run into the save; returns the next save + debrief facts. Pure. */
export function recordRunEnd(save: StarlightSave, dateKey: string, runEnd: RunEnd): RecordResult {
  const isFirstEver = Object.keys(save.days).length === 0;
  const prevBest = save.allTimePB;
  const pbDelta = runEnd.score - prevBest;
  const isNewPB = !isFirstEver && runEnd.score > prevBest;

  const days = { ...save.days };
  const existing = days[dateKey];
  let daysFlownCount = save.daysFlownCount;

  if (!existing) {
    days[dateKey] = {
      attempts: 1,
      bestScore: runEnd.score,
      bestOutcome: runEnd.status,
      firstTryScore: runEnd.score,
      firstTryOutcome: runEnd.status,
    };
    daysFlownCount += 1;
  } else {
    days[dateKey] = {
      ...existing,
      attempts: existing.attempts + 1,
      bestScore: Math.max(existing.bestScore, runEnd.score),
      bestOutcome: runEnd.score > existing.bestScore ? runEnd.status : existing.bestOutcome,
    };
  }

  return {
    save: {
      ...save,
      days,
      allTimePB: Math.max(save.allTimePB, runEnd.score),
      daysFlownCount,
    },
    pbDelta,
    isNewPB,
    prevBest,
    isFirstEver,
  };
}

const STORAGE_KEY = "starlight.save.v1";

/**
 * Read the save, or null on absence / parse error / unknown version / private-mode throw.
 * The shape is validated field by field, not just by version: a truncated write or a
 * hand-edited entry would otherwise reach `save.days[key]` at boot and blank the app.
 */
export function loadSave(): StarlightSave | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StarlightSave> | null;
    if (
      !parsed ||
      parsed.version !== 1 ||
      typeof parsed.days !== "object" ||
      parsed.days === null ||
      typeof parsed.allTimePB !== "number" ||
      typeof parsed.daysFlownCount !== "number"
    ) {
      return null;
    }
    return parsed as StarlightSave;
  } catch {
    return null;
  }
}

/** Write the save; a failure (private mode, quota) means the run simply isn't remembered. */
export function persist(save: StarlightSave): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    /* intentionally ignored — degrade to no-memory behaviour */
  }
}
