# M1 Round 2 — "Memory & the Ending" (E0-3 + E1-3 + P3-3 + B-5)

**Date:** 2026-07-23 · **Status:** approved for planning
**Source:** [ROADMAP.md](../../ROADMAP.md) Milestone 1 tail + Milestone 2 head;
specs in [ENGAGEMENT_BACKLOG.md](../../ENGAGEMENT_BACKLOG.md) §4.2 (E0-3), item rows
E1-3 and B-5, and [BACKLOG.md](../../BACKLOG.md) row P3-3.

## Scope

One round that **closes Milestone 1** and delivers the **first M2 retention hook**.
E0-3 is the gate — the two M2 hooks (E1-2, E1-3) both depend on it — so it leads, and
the debrief (E1-3) is the item that most directly cashes the persistence in.

- **E0-3** localStorage persistence pack — per-day best, all-time PB, attempts, honest
  Daily/Practice labelling, run number, days-flown counter.
- **E1-3** Run debrief — enhance the existing end screen with the run identity line,
  PB delta, and a best-haul highlight.
- **P3-3** a11y/polish — focus restore, `document.title`, one-`<h1>`-per-screen,
  restart confirm.
- **B-5** Delete the false README luxury-modifier claim.

**Explicitly out of scope (deferred):** E1-2 full share card v2 (emoji run-strip,
cause line) — this round only adds the Daily/Practice label + run # to the *existing*
card, which E0-3's AC requires. E1-3's "left on the table" tease. Cost-basis / P&L
(P2-2). The full DOM-patching re-render (P1-1 stretch) — focus restore is the cheap
fix, not a render rework. No economy tuning → **no 100-seed sweep re-run** this round.

## Decisions made during brainstorming

1. **Round scope:** close M1 (E0-3 + P3-3) + the first hook (E1-3), plus the free B-5
   cleanup — vs. the full end-of-run trilogy (adding E1-2) or a forecast-first round.
   Rationale: E0-3 is the hard dependency for every M2 hook; shipping it with the
   debrief proves the persistence layer against the simplest consumer before the
   heavier share-card v2 (which needs new per-day event-summary state).
2. **"The Daily" = the first *completed* run of a UTC day, any outcome** (audit, retire,
   **or death**) — vs. death-is-forgiving or lock-at-boot. Reload-safe (a mid-run reload
   consumes nothing), and no scum vector (you can't abandon-by-death and re-roll your
   official result). Attempts/scores are recorded at run end, never at boot.
3. **Best-trade only** on the debrief; **"left on the table" deferred.** The latter is
   fiddlier tracking (watch every board reroll + a declined-set) and leans into the
   guilt/FOMO framing the brief rejects.
4. **"Best trade" = biggest single *payday* (gross), not profit-margin.** Margin needs
   cost-basis tracking, which is a separate M3 item (P2-2). One running max field keeps
   E1-3 cheap.
5. **PB delta is computed vs the all-time PB** (the number that matters), not a split
   Daily-vs-Practice scope. The run's own Daily/Practice label already states the mode.
6. **Run number #N = whole UTC days since epoch 2026-07-01 (= #1).** Shared across all
   players on a date — the daily-sync social hook.
7. **Restart confirm reuses the shipped two-click Retire pattern** ("Start a Practice
   run?" / ✕) — vs. a modal dialog. Consistent with existing UI; guards the debrief and
   score card from an accidental wipe.

## 1. E0-3 — Persistence pack (`src/ui/storage.ts`, new)

Persistence lives at the **UI boundary, never in the engine** — the engine stays pure
so `src/sim/simulate.ts` never touches `localStorage`. `main.ts` calls it on boot and
on the play→ended transition.

### Storage document (versioned)

```ts
interface DayRecord {
  attempts: number;            // completed runs this UTC day
  bestScore: number;           // best score across attempts this day
  bestOutcome: RunEndStatus;   // outcome of that best run
  firstTryScore: number;       // "The Daily" result — first completed run, any outcome
  firstTryOutcome: RunEndStatus;
}
interface StarlightSave {
  version: 1;
  days: Record<string, DayRecord>; // key = UTC "YYYY-MM-DD" derived from bootDate
  allTimePB: number;
  daysFlownCount: number;          // distinct UTC days with ≥1 completed run
}
```

Key is the **UTC date string**, not the raw seed — it is the human-facing day identity.
`localStorage` key: `"starlight.save.v1"`.

### Pure helpers (unit-tested; no DOM)

- `emptySave(): StarlightSave`
- `utcDateKey(bootISO: string): string` → `"2026-07-23"`.
- `runNumber(bootISO: string): number` → whole UTC days since `2026-07-01` + 1.
- `labelForDay(save, dateKey): "The Daily" | "Practice"` →
  `(save.days[dateKey]?.attempts ?? 0) >= 1 ? "Practice" : "The Daily"`.
- `recordRunEnd(save, dateKey, runEnd): { save: StarlightSave; pbDelta: number; isNewPB: boolean; prevBest: number; isFirstEver: boolean }`
  — **pure**; returns the next save plus the debrief facts:
  - `isFirstEver = Object.keys(save.days).length === 0` (no prior completed run).
  - `prevBest = save.allTimePB`; `pbDelta = runEnd.score − prevBest`;
    `isNewPB = !isFirstEver && runEnd.score > prevBest`.
  - If no record for `dateKey`: create it (`attempts: 1`, `firstTry* = this run`,
    `bestScore/bestOutcome = this run`), `daysFlownCount++`. (This run was The Daily.)
  - Else: `attempts++`, raise `bestScore`/`bestOutcome` if higher. (This run was
    Practice.)
  - `allTimePB = max(allTimePB, runEnd.score)`.

### Thin I/O wrapper (try/catch, silent degrade)

- `loadSave(): StarlightSave | null` — `JSON.parse` of the key; returns `null` on
  absence, parse error, or a `version` mismatch (forward-compat: unknown version →
  treated as absent, not migrated this round).
- `persist(save): void` — `JSON.stringify` + `setItem`, wrapped so private-mode /
  quota throws are swallowed. A failed write means the run simply isn't remembered;
  gameplay is unaffected.

### `main.ts` wiring

- **Module state:** `let save = loadSave() ?? emptySave();` and
  `let runLabel: "The Daily" | "Practice";` and `let recorded = false;`.
- **On boot and on restart:** recompute `runLabel = labelForDay(save, utcDateKey(bootDate))`
  from the *current* save and set `recorded = false`. (Finishing your Daily then hitting
  "New run" correctly yields "Practice".)
- **Detect the play→ended transition:** after `applyAction(...)`, if
  `state.runEnd && !recorded`: call `recordRunEnd`, assign the returned save, `persist`,
  stash `{ pbDelta, isNewPB, prevBest }` for the debrief, and set `recorded = true`.
  Recording happens **exactly once per run**, regardless of subsequent re-paints.

## 2. E1-3 — Run debrief (enhance `runEndScreen`)

### Engine: best-haul tracking

Add to `GameState`: `biggestPayday?: { amount: number; label: string }`. Initialised
`undefined` in `createGame`. Updated where credits are *earned*:

- `sell(state, id, qty)`: candidate `amount` = the sale's **net proceeds** (after tax);
  `label` = `` `${commodityName} at ${stationName}` ``.
- `deliver(state)`: for **each** settled mission, candidate `amount` = its `reward`;
  `label` = `` `${commodityName} contract → ${destName}` ``.

Keep the max by `amount`. Buys and refuels are costs, never paydays. It survives across
jumps (it is on `GameState`) and rides into `runEnd` via the live state passed to the
screen.

### Screen

`runEndScreen` gains, above the existing breakdown:

- **Identity line:** `` `🚀 Starlight #${runNumber} · ${dateLabel} · ${runLabel}` ``.
- **PB delta row:** `isFirstEver` → "Your first banked run — {score} to beat.";
  else `isNewPB` → "🏆 New personal best!  ▲ +{pbDelta}"; else →
  "▲/▼ {±pbDelta} vs your best ({prevBest})".
- **Best haul row** (when `biggestPayday` set): "Best haul: +{amount}cr · {label}".

Existing headline / cause / net-worth / survival-bonus / peak / score rows stay. The
"left on the table" row is **not** built.

### Render plumbing (`render.ts` `ViewModel`)

Add: `runNumber: number`, `runLabel: "The Daily" | "Practice"`, and
`debrief?: { pbDelta: number; isNewPB: boolean; prevBest: number; isFirstEver: boolean }`
(present once a run has ended and been recorded). `stationScreen` also receives `runNumber`/`runLabel` for
the header and a `bootStats` line (below).

## 3. E0-3 surfaces on the cockpit and share card

- **Header:** the shipped "Starlight · Jul 20" becomes
  **"Starlight #{N} · {date} · {The Daily|Practice}"**.
- **Boot / intro stats line:** on the day-1 station screen, show today's attempts +
  best-so-far and all-time PB (e.g. "Today: 2 flown · best 2,140 · all-time PB 3,010"),
  sourced from `save`. No negative/guilt copy anywhere; a missed day is never mentioned.
- **Share card (`share.ts`):** `shareText` line 1 becomes
  **"🚀 Starlight #{N} — {date} · {The Daily|Practice}"**. Score/days lines unchanged.
  `ShareData` gains `runNumber` and `label`. The full v2 card (emoji strip, cause line)
  stays E1-2.

## 4. P3-3 — a11y / polish

1. **Focus restore.** The click handler already knows the acted `data-act`/`data-id`.
   After `paint()`, requery `app.querySelector('[data-act="…"][data-id="…"]')` (id part
   optional) and `.focus()` it. Fallback when the control is gone or now
   `aria-disabled` (e.g. a button that sold out): focus the screen's `<h1>` (given
   `tabindex="-1"`) so keyboard context lands somewhere sensible, not `<body>`.
2. **`document.title`,** set in `paint()`:
   - playing → `` `Day ${day}/12 · ${stationName} — Starlight Traders` ``;
   - ended → `` `${headline} · Score ${score} — Starlight Traders` ``.
3. **Headings.** `render()` swaps one full screen at a time, so the fix is: each of
   `stationScreen`, `eventScreen`, `runEndScreen` renders **exactly one `<h1>`** with no
   skipped levels below it. Audit the three and correct any that emit two `<h1>`s or
   start at `<h2>`. Give each screen's `<h1>` `tabindex="-1"` for the focus fallback.
4. **Restart confirm.** "New run" ([screens.ts:390](../../../src/ui/screens.ts)) becomes
   a two-click inline confirm mirroring the Retire control (`restartArmed` flag in
   `main.ts`, armed by "restart", consumed by "restartConfirm", cancelled by the ✕ and
   by any other action). Copy: "Start a Practice run?" with a ✕ to cancel.

## 5. B-5 — README fix

Remove the "and it attracts both pirates and customs" luxury-modifier claim from
[README.md](../../../README.md) — the engine's `rollEvent` reads only destination
danger, no cargo modifier exists. Two spots (Key Features list + the Luxury line under
How to Play). Reword to the true behaviour: luxury is the volatile, high-value tier;
danger is per-destination.

## Error handling

- All `localStorage` access is try/catch-wrapped; any failure (private mode, quota,
  corrupt/unknown-version JSON) degrades silently to the current no-memory behaviour.
- `recordRunEnd` fires **once per run** (the `recorded` guard); re-paints of an ended
  run never double-count attempts or re-bump PB.
- `biggestPayday` absent (a run with no sale/delivery) → the best-haul row is omitted,
  not rendered as `0`.
- Focus-restore never throws when the acted control vanished — it falls back to the
  `<h1>`.

## Acceptance criteria (round-level)

- [ ] Reloading mid-run starts a fresh run (unchanged), and the boot screen shows
      today's attempts + best-so-far and all-time PB.
- [ ] The first *completed* run of a UTC day (audit, retire, or death) is labelled
      **The Daily** in header, debrief, and share card; every later run that day is
      **Practice** in all three.
- [ ] Attempts and PB are recorded exactly once per run, at run end; a mid-run reload
      records nothing and does not consume the Daily.
- [ ] Debrief shows the identity line, the PB delta (or "New personal best!"), and the
      best-haul highlight when a payday occurred.
- [ ] `daysFlownCount` increments at most once per UTC day; no negative/guilt copy
      appears anywhere.
- [ ] Storage failures degrade silently to current behaviour (verified with a throwing
      `localStorage` mock).
- [ ] Run number is `days since 2026-07-01 + 1`, identical for all players on a date.
- [ ] After every action, keyboard focus lands on the acted control (or the screen
      `<h1>`), never `<body>`; `document.title` reflects Day/location (playing) or
      outcome/score (ended); each screen renders exactly one `<h1>`.
- [ ] "New run" is confirm-gated (two-click, cancellable) and starts a Practice run on
      today's sky.
- [ ] README no longer claims a luxury pirate/customs modifier.
- [ ] New unit tests green (persistence transitions, `runNumber`/`labelForDay`,
      silent-fail wrapper, `biggestPayday`); full existing suite (~78 tests) stays green.
