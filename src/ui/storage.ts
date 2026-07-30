// src/ui/storage.ts
//
// Per-player persistence for Starlight Traders (E0-3). Lives at the UI boundary so the
// pure engine and the balance sim never touch localStorage. Pure logic is separated
// from the I/O wrapper: `recordRunEnd`/`labelForDay` are deterministic and unit-tested;
// `loadSave`/`persist` are the only browser-only functions and degrade silently.
import { GameEvent, GameState, NodeId, RunEnd, RunEndStatus } from "../engine/types";
import { NODE_IDS } from "../engine/world";

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

// --- E0-5: live-run snapshot (same-day resume) -------------------------------------
//
// Its own document under its own key, fully separate from the results ledger above.
// The snapshot is written post-decision (after an action settles, in main.ts) and
// captures a pending in-transit event, so a refresh resumes — never re-rolls, never
// un-sees. Same pure-logic/thin-I/O split as the save: parseSnapshot is deterministic
// and unit-tested; the wrappers degrade silently.

export interface RunSnapshot {
  version: 1;
  dateKey: string; // UTC "YYYY-MM-DD" of the run (from state.bootDate)
  label: "The Daily" | "Practice";
  state: GameState;
  pendingEvent: GameEvent | null; // non-null ⇒ resume INTO the event screen
  logMarkBeforeJump: number; // so a post-resume resolve still yields a turn report
}

const SNAPSHOT_KEY = "starlight.run.v1";

function isValidEvent(e: unknown): e is GameEvent | null {
  if (e === null) return true;
  if (typeof e !== "object" || e === undefined) return false;
  const ev = e as Partial<GameEvent>;
  return (
    typeof ev.kind === "string" &&
    Array.isArray(ev.choices) &&
    ev.choices.length > 0 &&
    ev.choices.every((c) => typeof (c as { id?: unknown } | null)?.id === "string")
  );
}

/** Load-bearing shape check on the embedded state: live, and on a real node. */
function isValidSnapshotState(s: unknown): s is GameState {
  if (typeof s !== "object" || s === null) return false;
  const st = s as Partial<GameState>;
  return (
    st.status === "playing" &&
    typeof st.day === "number" &&
    typeof st.seed === "number" &&
    NODE_IDS.includes(st.location as NodeId)
  );
}

/**
 * Validate a raw snapshot string against today's UTC key. Field-by-field on the
 * envelope plus the load-bearing state fields; deeper state corruption is caught by
 * the try/catch around the rehydrating first paint in main.ts.
 */
export function parseSnapshot(raw: string | null, todayKey: string): RunSnapshot | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<RunSnapshot> | null;
    if (
      !p ||
      p.version !== 1 ||
      p.dateKey !== todayKey ||
      (p.label !== "The Daily" && p.label !== "Practice") ||
      typeof p.logMarkBeforeJump !== "number" ||
      !isValidSnapshotState(p.state) ||
      !("pendingEvent" in p) ||
      !isValidEvent(p.pendingEvent)
    ) {
      return null;
    }
    return p as RunSnapshot;
  } catch {
    return null;
  }
}

/** Read today's live-run snapshot, or null on absence / staleness / corruption / throw. */
export function loadSnapshot(todayKey: string): RunSnapshot | null {
  try {
    return parseSnapshot(localStorage.getItem(SNAPSHOT_KEY), todayKey);
  } catch {
    return null;
  }
}

/** Write the live-run snapshot; a failure means a refresh simply won't resume. */
export function persistSnapshot(snap: RunSnapshot): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
  } catch {
    /* intentionally ignored — degrade to no-resume behaviour */
  }
}

/** Drop the live-run snapshot (run ended, or it failed validation at boot). */
export function clearSnapshot(): void {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    /* intentionally ignored */
  }
}
