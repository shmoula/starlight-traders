// src/ui/storage.ts
//
// Per-player persistence for Starlight Traders (E0-3). Lives at the UI boundary so the
// pure engine and the balance sim never touch localStorage. Pure logic is separated
// from the I/O wrapper: `recordRunEnd`/`labelForDay` are deterministic and unit-tested;
// `loadSave`/`persist` are the only browser-only functions and degrade silently.
import {
  DayHighlightKind,
  GameEvent,
  GameState,
  NodeId,
  RunEnd,
  RunEndStatus,
} from "../engine/types";
import { NODE_IDS } from "../engine/world";
import { utcDateKey } from "./share";

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
  version: 2;
  dateKey: string; // UTC "YYYY-MM-DD" of the run (from state.bootDate)
  label: "The Daily" | "Practice";
  state: GameState;
  pendingEvent: GameEvent | null; // non-null ⇒ resume INTO the event screen
  logMarkBeforeJump: number; // so a post-resume resolve still yields a turn report
}

const SNAPSHOT_KEY = "starlight.run.v1";

/**
 * Shallow by design: only `choices[].id` is load-bearing (resolveChoice keys off it).
 * `kind`/`title`/`description` are cosmetic, so a malformed one is left to the try/catch
 * around the rehydrating first paint rather than costing a resume here.
 */
function isValidEvent(e: unknown): e is GameEvent | null {
  if (e === null) return true;
  if (typeof e !== "object") return false;
  const ev = e as Partial<GameEvent>;
  return (
    typeof ev.kind === "string" &&
    Array.isArray(ev.choices) &&
    ev.choices.length > 0 &&
    ev.choices.every((c) => typeof (c as { id?: unknown } | null)?.id === "string")
  );
}

/**
 * Exhaustive by construction — adding a kind to `DayHighlightKind` without listing it
 * here is a compile error, not a silently-rejected snapshot.
 */
const HIGHLIGHT_KIND_TABLE: Record<DayHighlightKind, true> = {
  pirates: true,
  bigTrade: true,
  delivery: true,
};
const HIGHLIGHT_KINDS = new Set<unknown>(Object.keys(HIGHLIGHT_KIND_TABLE));

/** True when `bootISO` parses *and* names `dateKey`'s UTC day — utcDateKey throws otherwise. */
function stampsDay(bootISO: string, dateKey: string): boolean {
  return !Number.isNaN(new Date(bootISO).getTime()) && utcDateKey(bootISO) === dateKey;
}

/**
 * Load-bearing shape check on the embedded state: live, on a real node, stamped with the
 * envelope's UTC day, and carrying a usable highlights map.
 *
 * `bootDate` and `dayHighlights` earn their place here because both are read *outside*
 * the reach of main.ts's safePaint: `utcDateKey(state.bootDate)` runs in the action
 * handler, where an Invalid Date throws a RangeError and stalls the run, and `markDay`
 * indexes `dayHighlights` inside the engine on any sale, delivery, or pirate encounter.
 * `dateKey` is derived from `bootDate` when the snapshot is written, so assert that
 * invariant when it is read — a mismatch would bank the result under another day's key.
 */
function isValidSnapshotState(s: unknown, dateKey: string): s is GameState {
  if (typeof s !== "object" || s === null) return false;
  const st = s as Partial<GameState>;
  if (typeof st.bootDate !== "string" || !stampsDay(st.bootDate, dateKey)) return false;
  if (typeof st.dayHighlights !== "object" || st.dayHighlights === null) return false;
  if (!Object.values(st.dayHighlights).every((k) => HIGHLIGHT_KINDS.has(k))) return false;
  if (!isValidLog(st.log)) return false;
  return (
    st.status === "playing" &&
    typeof st.day === "number" &&
    typeof st.seed === "number" &&
    NODE_IDS.includes(st.location as NodeId)
  );
}

/** A v1 log line is a bare string; wrap it as a neutral entry so an in-progress run survives the upgrade. */
function migrateV1Log(state: unknown): void {
  const st = state as { log?: unknown[] };
  if (Array.isArray(st?.log)) {
    st.log = st.log.map((m) => (typeof m === "string" ? { msg: m, tone: "neutral" } : m));
  }
}

function isValidLog(log: unknown): boolean {
  return (
    Array.isArray(log) &&
    log.every(
      (l) => typeof l === "object" && l !== null && typeof (l as { msg?: unknown }).msg === "string"
    )
  );
}

type ParsedSnapshot = (Partial<Omit<RunSnapshot, "version">> & { version?: number }) | null;

/**
 * Normalise an older snapshot envelope to the current version in place: a v1 doc with a
 * usable state has its bare-string log wrapped (migrateV1Log) and is stamped version 2.
 * Anything else is left untouched for the field-by-field validation in parseSnapshot to judge.
 */
function migrateSnapshotToCurrentVersion(p: ParsedSnapshot): void {
  if (p && p.version === 1 && typeof p.state === "object" && p.state !== null) {
    migrateV1Log(p.state);
    p.version = 2;
  }
}

/**
 * Validate a raw snapshot string against today's UTC key. Field-by-field on the
 * envelope plus the load-bearing state fields; deeper state corruption is caught by
 * the try/catch around the rehydrating first paint in main.ts.
 */
export function parseSnapshot(raw: string | null, todayKey: string): RunSnapshot | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as ParsedSnapshot;
    migrateSnapshotToCurrentVersion(p);
    if (
      !p ||
      p.version !== 2 ||
      p.dateKey !== todayKey ||
      (p.label !== "The Daily" && p.label !== "Practice") ||
      typeof p.logMarkBeforeJump !== "number" ||
      !isValidSnapshotState(p.state, todayKey) ||
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
