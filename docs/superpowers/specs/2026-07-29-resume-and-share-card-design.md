# M2 Round 2 — "Close the Loop" (E0-5 + E1-2)

**Date:** 2026-07-29 · **Status:** approved for planning
**Source:** [ROADMAP.md](../../ROADMAP.md) Milestone 2; specs in
[ENGAGEMENT_BACKLOG.md](../../ENGAGEMENT_BACKLOG.md) §4.4 (E0-5) and item row E1-2.

## Scope

One round that **cashes in E0-3's persistence layer**: same-day resume plugs the
refresh retention leak, and the share card v2 ships the viral artifact whose
dependencies (E0-1, E0-3) are now both live.

- **E0-5** Same-day resume — snapshot the live run to localStorage; a refresh within
  the same UTC day resumes exactly where the player was (including mid-event); a new
  UTC day starts fresh.
- **E1-2** Share card v2 — the remaining half: **emoji run-strip** (one glyph per day)
  and **cause line**. Date-branding, run number, Daily/Practice label, URL, and
  availability from every end state shipped with E0-3/E1-3.
- **Docs housekeeping** — mark E0-3, E1-3, P3-3, and B-5 as shipped in
  [ROADMAP.md](../../ROADMAP.md) / backlog rows (all four verified shipped in code but
  still listed open); mark E0-5 + E1-2 when this round lands.

**Explicitly out of scope (deferred):** P2-1 structured log entries (stays paired with
E1-4's tone/delta work — the run-strip uses a dedicated per-day tracker instead);
E1-1 bulletin + P1-2 forecast sinks (next round candidate); any economy tuning —
**no balance-gate sweep** (the only sim use this round is the one-off 💰-band check
below, which tunes a display threshold, not the economy); DOM-patching re-render. P3-3 and B-5 were found already
shipped during brainstorming — they contribute only doc updates here.

## Decisions made during brainstorming

1. **Round scope: "close the loop"** (E0-5 + E1-2) — vs. forecast-forward
   (E1-1 + P1-2) or honesty & logs (P2-1 + E1-4 + B-2). Rationale: both items cash in
   last round's persistence immediately, and the storage-layer context is fresh.
2. **Run-strip data source: per-day tracker on `GameState`** — vs. pulling P2-1
   structured logs forward. Minimal blast radius; plain serializable data rides the
   E0-5 snapshot for free; P2-1 stays where it pairs with E1-4.
3. **Resume protects any live run** (Daily _or_ Practice), storing the label in the
   snapshot — vs. the spec-literal Daily-only reading. "A refresh never loses your run
   today" is the simpler contract; no anti-scum impact since the label derives from
   _completed_ runs.
4. **The snapshot serializes `pendingEvent`** — a refresh mid-event resumes _into the
   event screen_. Stronger than §4.4's settled-points wording: the revealed event is
   captured, so there is no dodge-by-reroute vector. (Event rolls and choice outcomes
   are already deterministic per `(seed, day, route)` — nothing can re-roll either way.)
5. **Per-day record is a semantic highlight, upgraded in priority order at record
   time** (`pirates > bigTrade > delivery`; death derived from `RunEnd`, quiet by
   absence) — vs. raw per-day facts with glyph policy in the UI. One consumer-ready
   kind per day; emoji mapping stays in `share.ts`.
6. **`BIG_TRADE_CR = 500` (named engine constant, sim-tuned)** — an absolute threshold
   so 💰 means the same thing in every share; tuned during implementation so a median
   run shows ~1–3 💰 days.
7. **Cause line reuses `endHeadline(runEnd)`** ("Audited" / "Retired" /
   "Ship Destroyed" / "Stranded") — the existing single source of truth for end-state
   phrasing — passed into `share.ts` as a string so share stays independent of the
   screens module.

## 1. E0-5 — Same-day resume (`src/ui/storage.ts` + `main.ts`)

Same placement rule as E0-3: persistence lives at the **UI boundary, never in the
engine**. The snapshot gets its own key, `"starlight.run.v1"`, fully separate from the
results ledger (`"starlight.save.v1"`).

### Snapshot document (versioned)

```ts
interface RunSnapshot {
  version: 1;
  dateKey: string; // UTC "YYYY-MM-DD" of the run (from state.bootDate)
  label: "The Daily" | "Practice"; // decision 3: either resumes
  state: GameState; // plain data, already serializable
  pendingEvent: GameEvent | null; // decision 4: resume INTO the event screen
  logMarkBeforeJump: number; // so a post-resume resolve still yields a turn report
}
```

### Pure helpers (unit-tested; no DOM)

- `parseSnapshot(raw: string | null, todayKey: string): RunSnapshot | null` — the
  validator, field-by-field like `loadSave`:
  - `null` on: absence, JSON parse error, `version !== 1`, `dateKey !== todayKey`
    (UTC day rolled over → stale), `label` not one of the two literals,
    `state.status !== "playing"` (only live runs resume), non-numeric
    `state.day`/`state.seed`, `state.location` not a known `NodeId`,
    `pendingEvent` neither `null` nor an object with a `kind` and a non-empty
    `choices` array, non-numeric `logMarkBeforeJump`.
  - Deeper corruption inside `state` is not exhaustively validated; the rehydrate
    call site is try/catch-guarded and falls back to a fresh run.

### Thin I/O wrappers (try/catch, silent degrade)

- `loadSnapshot(todayKey): RunSnapshot | null` — `getItem` + `parseSnapshot`;
  any throw → `null`.
- `persistSnapshot(snap): void` and `clearSnapshot(): void` — wrapped `setItem` /
  `removeItem`; failures swallowed (private mode ⇒ no resume, gameplay unaffected).

### `main.ts` wiring

- **Boot (once, at startup only):** try `loadSnapshot(utcDateKey(now))`. Hit →
  rehydrate `state`, `pendingEvent`, `logMarkBeforeJump`, `runLabel` from the
  snapshot; `recorded = false`; `lastDebrief = undefined`. Miss/stale/corrupt →
  `clearSnapshot()` + today's fresh daily run (current behavior).
- **`startNewRun()` is untouched and never resumes** — "New run" (restartConfirm)
  always starts fresh; the snapshot sync below immediately overwrites the old
  snapshot with the new live run, which subsumes §4.4's "clear when starting a
  Practice run".
- **Snapshot sync — one call site:** at the end of the click handler (after
  `applyAction` + `recordIfEnded`, before `paint()`):
  `state.status === "playing"` → `persistSnapshot({...})`, else → `clearSnapshot()`.
  Because it runs after the action fully settles, every write is **post-decision**
  by construction (§4.4's hard constraint), and run end clears in the same tick the
  results ledger records.
- A refresh before the first action simply re-boots the same deterministic daily —
  no snapshot needed for that window.

## 2. E1-2 — Share card v2 (`src/engine/game.ts` + `src/ui/share.ts`)

### Engine: per-day highlights

- `types.ts`: `type DayHighlightKind = "pirates" | "bigTrade" | "delivery";`
  `GameState.dayHighlights: Partial<Record<number, DayHighlightKind>>` (key = game
  day), initialized `{}` in `createGame`.
- `game.ts`: helper `markDay(s, kind)` — writes `dayHighlights[s.day]`, **upgrade
  only** per priority `pirates > bigTrade > delivery`. Record sites:
  - `sell()` — net proceeds (after tax) `>= BIG_TRADE_CR` → `bigTrade`.
  - `settleMissions()` — each settled mission → `delivery`; its `reward >=
BIG_TRADE_CR` also candidates `bigTrade` (priority resolves the overlap).
  - `resolvePirates()` — → `pirates`, on both `pay` and `flee`.
- Death is **not** recorded in `dayHighlights` — `RunEnd.status === "lost"` already
  carries it; the strip renderer stamps 💀.
- `BIG_TRADE_CR = 500` exported from `economy.ts` (home of the other economic
  constants) — validated against a sim sweep (see Testing).
- The sim needs no changes; `dayHighlights` is inert extra state there.

### Share: strip + card

- `runStrip(highlights, daysSurvived, status): string` — pure; one glyph per day
  `1..daysSurvived`: final day of a lost run → 💀, else `pirates` → 🟥,
  `bigTrade` → 💰, `delivery` → 🟨, no entry → 🟦.
- `ShareData` gains `strip: string` and `cause: string`; `shareText` becomes:

  ```
  🚀 Starlight #29 · Jul 29 · The Daily
  Score 2,140 · survived 12 days — Audited
  🟦🟦🟥💰🟦🟨🟦🟦💰🟦🟦🟦
  Beat my run: <GAME_URL>
  ```

  (line 1 separator changes from `—` to `·` per the E1-2 spec text; score gains
  `toLocaleString`.)

- `main.ts` share handler passes `runStrip(state.dayHighlights,
runEnd.daysSurvived, runEnd.status)` and `endHeadline(state.runEnd)` (already
  imported there — share.ts stays free of screen imports).
- The card is already reachable from every end state (debrief screen's "Copy score
  card"); no screen changes beyond the pass-through.
- **Snapshot interplay:** `dayHighlights` lives inside `GameState`, so E0-5 carries
  it automatically — a resumed run shares an accurate strip.

## 3. Docs housekeeping

- [ROADMAP.md](../../ROADMAP.md): mark **E0-3**, **E1-3** ✅ shipped 2026-07-29 (they
  landed in `280c7a7` but their rows and the "Already shipped" note still read open);
  mark **P3-3** ✅ (focus restore `main.ts:112`, `document.title` `main.ts:126`,
  one-`<h1>`-per-screen, restart confirm all verified in code) and **B-5** ✅ (README
  claim rewritten in `280c7a7`). Mark **E0-5**, **E1-2** ✅ when this round lands.
- [BACKLOG.md](../../BACKLOG.md) / [ENGAGEMENT_BACKLOG.md](../../ENGAGEMENT_BACKLOG.md):
  tick the matching rows.

## Testing

Vitest, following the existing pure-logic/thin-I/O split:

- **`tests/ui/storage.test.ts`** — `parseSnapshot` against: valid round-trip
  (including a non-null `pendingEvent`), stale `dateKey`, corrupt JSON, wrong
  version, `state.status !== "playing"`, bad `label`, malformed `pendingEvent`.
  The `persistSnapshot`/`clearSnapshot` wrappers stay thin and untested, like
  `persist`.
- **`tests/engine/game.test.ts`** — `dayHighlights`: pirates day marked on `pay`
  _and_ `flee`; big sale marks `bigTrade`; delivery marks `delivery`; a whale
  delivery upgrades to `bigTrade`; a lower-priority mark never overwrites a
  higher one; `createGame` starts empty.
- **`tests/engine/share.test.ts`** — `runStrip`: length equals `daysSurvived`,
  💀 replaces the final glyph only on lost runs, unmarked days render 🟦; a
  full-card assertion for the four-line layout.
- **Sim sanity (one-off, not committed):** ~100 seeded runs to check the 💰
  count per run lands in a sane band (median ~1–3) and tune `BIG_TRADE_CR`.

## Error handling

- All snapshot I/O is try/catch-wrapped; **every** failure path — private mode,
  quota, corrupt JSON, wrong version, stale `dateKey` — degrades to today's fresh
  daily run, indistinguishable from current behavior.
- The rehydrate call site is additionally try/catch-guarded against corruption inside
  `state` that field validation doesn't catch.
- A completed run records exactly once (unchanged `recorded` guard); the snapshot is
  cleared in the same handler tick, so no ended run can ever rehydrate.
- `runStrip` of a day-1 death yields a single 💀; `dayHighlights` days beyond
  `daysSurvived` (impossible today, cheap to clamp) are ignored by construction of
  the `1..daysSurvived` loop.

## Acceptance criteria (round-level)

E0-5 (§4.4's five, plus the strengthening decisions):

- [ ] A refresh within the same UTC day resumes the in-progress run — day, location,
      credits, cargo, missions, log, label, **and a pending in-transit event screen**.
- [ ] A refresh after the UTC day rolls over starts a fresh daily run and discards the
      stale snapshot.
- [ ] Resuming cannot re-roll or dodge a revealed event (snapshot captures
      `pendingEvent`; outcomes are seed-deterministic).
- [ ] The snapshot clears on run end; "New run" overwrites it with the fresh run; a
      completed run still records exactly once.
- [ ] Practice runs resume the same as the Daily, keeping their label.
- [ ] Storage failures (private mode, quota, corrupt JSON) degrade silently to
      fresh-run behavior (verified with a throwing/garbage `localStorage` mock).

E1-2:

- [ ] The share card is four lines: identity, score/days/cause headline, run-strip,
      URL — with the strip exactly `daysSurvived` glyphs long.
- [ ] 💀 appears as the final glyph on lost runs only; otherwise a day renders its
      highest-priority mark — 🟥 pirates, then 💰 single inflow ≥ `BIG_TRADE_CR`,
      then 🟨 delivery, then 🟦 — so a whale delivery renders 💰, not 🟨, and a
      pirate day renders 🟥 even if a big trade also landed that day.
- [ ] `dayHighlights` never downgrades a day's entry and starts empty in `createGame`.
- [ ] A ~100-seed sim sweep shows a sane 💰 band (median run ~1–3) — threshold tuned
      if not, as a constant change only.

Round:

- [ ] ROADMAP/backlog rows for E0-3, E1-3, P3-3, B-5 marked shipped; E0-5/E1-2 marked
      on land.
- [ ] New unit tests green (snapshot validator paths, `dayHighlights` recording and
      priority, `runStrip`, new `shareText` format); full existing suite stays green.
