# M3 Round 2 — "Voice & Signal" (E2-4 + P3-1)

**Date:** 2026-08-04 · **Status:** draft — awaiting review
**Source:** [ROADMAP.md](../../ROADMAP.md) Milestone 3 (sequence decided 2026-08-01:
E2-4 next after round 1); specs in [ENGAGEMENT_BACKLOG.md](../../ENGAGEMENT_BACKLOG.md)
row E2-4 and [BACKLOG.md](../../BACKLOG.md) row P3-1.

## Scope

One round that gives the world a voice and makes the surface where that voice lands
readable. Theme: **the mechanics already imply a world — say it out loud, legibly.**
The fiction pack (E2-4) roughly triples the log's prose volume, so the log
readability fixes (P3-1) ship in the same round rather than after it.

The fiction today is one sentence per surface (E2-4):

1. **Stations are stat blocks** — the trade-hub intel line
   (screens.ts:403) recites multipliers; nothing voices why The Verge is tax-free
   and dangerous or why Meridian tithes 18% and runs customs.
2. **Events are labeled dice rolls** — each event kind has exactly one static
   description (events.ts:40–100); by run three the player reads bands, not fiction.
3. **Pirates are anonymous** — "Raiders demand tribute" every day, though the
   daily seed means everyone alive today could be meeting the _same_ crew; the
   determinism that powers the bulletin's social chatter is sitting un-cashed.
4. **Death is a shrug** — `RunEnd.cause` is one mechanical line
   ("Hull breach — your ship broke apart."); no epilogue, no send-off.

And the log the new prose lands in is hard to read (P3-1): consecutive identical
lines ("Sold 1 water…" ×5) render uncollapsed, the panel is oldest-first with the
newest line at the bottom of a `slice(-8)` window (screens.ts:205), and nothing
marks where one day ends and the next begins.

**In scope:**

- **E2-4a Station dossiers** — 5 one-line dossiers (one per station), each teaching
  the mechanic its numbers already encode; rendered as the first sentence of the
  existing station-intel block.
- **E2-4b Named daily pirate crew** — `crewName(seed)` picks today's crew from a
  ~12-name roster; the pirate event description, the pay/flee resolution log lines,
  and the bulletin's raider line all name it.
- **E2-4c Event text variants** — 3–4 seeded description variants per event kind
  (6 kinds), so encounters stop reading as labeled dice rolls; deterministic per
  seed/day/route.
- **E2-4d Death epilogues** — 6 epilogue lines (3 seeded variants × 2 loss causes),
  rendered under the cause line on the run-end screen for lost runs.
- **P3-1a Day-stamped log** — `LogEntry` gains optional `day`; every new entry is
  stamped at log time.
- **P3-1b Collapse repeats** — consecutive log lines with identical `msg` + `tone`
  render once with `×N` and the summed delta.
- **P3-1c Newest-first + day dividers** — the log panel renders newest-first with
  a "Day N" divider at each day boundary; previous days render dimmed.

**Explicitly out of scope (deferred):** the star map (E2-3 — next round),
achievements/calendar (E2-5), any mechanic, probability, price, or payout change —
this round is strictly text and presentation; the share card's cause line and
emoji strip (E1-2 surface — unchanged); image share card (E3-5); log auto-scroll
(moot once newest-first puts the newest line at the top); named crew affecting
pirate odds or toll (E1-5 Heat territory).

## Decisions

1. **One fiction module** — all new strings live in `src/engine/fiction.ts`:
   dossiers, crew roster, event variants, epilogues. Engine surfaces (events.ts,
   game.ts, bulletin.ts) and UI surfaces (screens.ts) import from it, tone tests
   sweep one file, and the Syndicate's established voice (E0-4, game.ts:107) has
   one place to stay consistent with.
2. **Crew name comes from a salted hash, not game RNG** —
   `crewName(seed) = CREW_ROSTER[hashSeed(seed, CREW_SALT) % CREW_ROSTER.length]`.
   No `rng()` calls, no draw-order risk, and the same daily seed names the same
   crew for every player — the determinism is the feature ("everyone meets the
   Red Kestrel today"). Roster names stay short (≤ 16 chars) so the bulletin line
   holds its ≤ 70-char budget.
3. **Variant selection is a second draw on rollEvent's local rng** — the
   `mulberry32` instance in `rollEvent` (events.ts:22) is created fresh per call
   and discarded after the single existing draw; nothing else reads it. Kind
   selection consumes only the first draw, so event _kinds_ stay byte-identical
   for every seed — only prose varies. A second draw gives per-seed/day/route
   deterministic variants for free (same jump replayed after a refresh shows the
   same text — refresh-safe, same property E0-5 relies on). Chosen over a separate
   hash to keep `rollEvent` self-contained, and over threading variant indices
   through `GameEvent` factories from outside.
4. **Epilogues derive at render, keyed by loss cause** —
   `epilogue(seed, lossCause)` picks one of 3 variants per cause via
   `hashSeed(seed, EPILOGUE_SALT)`. `RunEnd` gains no field and the snapshot is
   untouched: seed and `lossCause` are both already present wherever the run-end
   screen renders, and a pure function of them is exactly as stable as a stored
   string. Same-day players who die the same way read the same epilogue — chatter,
   again. Audited/retired runs keep their current copy: they are not deaths and
   the Syndicate's audit line already carries the voice.
5. **`LogEntry.day` is optional — no snapshot version bump** — new entries are
   stamped, `isValidLogEntry` (storage.ts:260) additionally accepts an absent or
   finite-≥1 `day`, and a pre-round v3 snapshot resumes mid-run with day-less
   entries that simply render above the first divider, dimmed, without one of
   their own. Optionality is what makes v3 forward-compatible; bumping to v4 for
   a display-only field would force a migration that adds no information.
6. **Collapse and ordering are render-only** — the engine log stays append-only
   and uncollapsed. The turn report (screens.ts:488) reads the raw log by index
   (`logMarkBeforeJump`), the conservation test sums raw deltas, and the sim never
   renders — collapsing in `logPanel` alone means none of them can be disturbed.
   The collapse key is `msg` + `tone`; the rendered line shows `×N` and the summed
   delta (money lines embed their amounts in `msg`, so identical `msg` implies
   identical per-line delta — the sum stays honest).
7. **Pirate resolution lines name the crew from state** — `resolvePirates`
   (game.ts:525) already holds `s.seed`; it calls `crewName(s.seed)` directly.
   No signature changes anywhere.
8. **Event titles stay stable; descriptions carry the fiction** — `eventScreen`,
   `choiceStakes`/`choiceOdds`, and tests anchor on `kind` and title; the crew
   name and variants live in `description`, so no downstream selector churn.

## Build order

1. **fiction.ts** — roster, dossiers, variants, epilogues, `crewName`, `epilogue`;
   pure-function unit tests. Nothing imports it yet; lands green on its own.
2. **E2-4b/c engine wiring** — events.ts variant draw + crew in pirate copy;
   game.ts resolvePirates crew lines; bulletin.ts raider line.
3. **P3-1a day stamps** — types.ts `LogEntry.day`, `withLog` + `endRun` stamping,
   storage.ts validation. Engine-complete before any UI reads `day`.
4. **UI pass** — screens.ts dossier line, run-end epilogue, `logPanel` rewrite
   (collapse, newest-first, dividers) + styles.css divider/dim classes.

## 1. Fiction module (`src/engine/fiction.ts`)

```ts
export const CREW_ROSTER: string[]; // ~12 names, each ≤ 16 chars, e.g. "the Red Kestrel"
export function crewName(seed: number): string; // decision 2

export const STATION_DOSSIERS: Record<NodeId, string>; // one line each, ≤ 110 chars

// 3–4 variants per event kind; index selected by rollEvent's second draw
// Variants take the crew name so pirate lines can be templates; non-pirate
// kinds ignore the argument. One shape, no union churn at the call site.
export const EVENT_VARIANTS: Record<GameEventKind, ((crew: string) => string)[]>;

export function epilogue(seed: number, cause: LossCause): string; // decision 4
```

Dossier content rule: each line must teach a real mechanic, not just decorate —
The Verge's line voices 0% tax ↔ 0.5 danger ("no flag, no tax, no help when the
raiders come"); Meridian's voices the 18% tithe + customs; Kiruna's the cheap
water and low fees; Vulcan's the parts yards; Terra's the expensive crossroads.
A test asserts every station with nonzero tax or danger has that number's
consequence mentioned — content review is manual, presence is mechanical.

Epilogue content rule: 3 per cause, written to the cause — hull epilogues are
about the ship breaking apart, fuel epilogues about drifting at dock. Each ≤ 160
chars, tone matching the Syndicate's dry menace.

## 2. E2-4b/c — Engine wiring (`events.ts`, `game.ts`, `bulletin.ts`)

### events.ts

- `rollEvent` draws `const v = rng()` **after** the existing `r = rng()`; kind
  thresholds read `r` only (decision 3).
- Factories take `(variant: number, crew?: string)`:
  `description = EVENT_VARIANTS[kind][variant % EVENT_VARIANTS[kind].length](crewName(seed))`
  — only pirate variants read the argument. Titles unchanged (decision 8).

### game.ts

- `resolvePirates` copy becomes crew-voiced:
  `Paid ${crew} ${toll}cr to pass.` / `Outran ${crew} — took ${dmg} hull damage.`
  Tones and deltas unchanged.

### bulletin.ts

- Line 3 becomes `${crewName(seed)} chatter thick on the approach to ${name}` —
  capitalized at render, still ≤ 70 chars (roster cap makes the worst case fit).

## 3. P3-1a — Day-stamped log (`types.ts`, `game.ts`, `run-end.ts`, `storage.ts`)

```ts
export interface LogEntry {
  msg: string;
  tone: LogTone;
  delta?: number;
  /** Game day the entry was written; absent on entries from pre-round snapshots. */
  day?: number;
}
```

- `withLog` stamps `day: state.day`; the `createGame` opening line stamps `day: 1`;
  `endRun`'s direct log push stamps `state.day`.
- `isValidLogEntry`: `day` must be absent or a finite number ≥ 1; anything else
  rejects the snapshot to a fresh run (standing silent-degrade contract).
- The results ledger (`starlight.save.v1`) stores no log — untouched.

## 4. UI pass (`screens.ts`, `styles.css`)

### Station dossier (trade hub, screens.ts:403)

- The dossier renders as its own sentence before the mechanical intel:
  `<p class="station-intel"><span class="station-dossier">${DOSSIER}</span> ${intelParts.join(" · ")}</p>`.
  The intel parts stay verbatim — the dossier is voice, the parts remain the
  numbers (E1-4's honesty surfaces don't get replaced by flavor).

### Run-end epilogue (screens.ts:591)

- Lost runs render `<p class="run-end__epilogue">${epilogue(s.seed, r.lossCause)}</p>`
  directly under `.run-end__cause`. Banked runs render nothing new.

### Log panel (screens.ts:205)

Rendering pipeline, replacing the current `slice(-8).map(...)`:

1. **Collapse** the full log: fold runs of consecutive entries with identical
   `msg` + `tone` into `{ entry, count, deltaSum }`.
2. **Window**: keep the newest 10 collapsed lines.
3. **Order**: render newest-first.
4. **Dividers**: insert `<div class="log-day-divider">Day N</div>` wherever `day`
   changes between adjacent rendered lines; lines from days before the current
   `s.day` (and day-less legacy lines) get a `log-line--past` dim class. No
   divider is emitted for day-less entries (decision 5).
5. A collapsed line renders `${msg} ×${count}` with the delta cell showing
   `deltaSum` (signed, same tr-good/tr-bad classes).

CSS: `.log-day-divider` (muted, bordered, small-caps — matches `.st-panel__subhead`
weight), `.log-line--past { opacity: … }` respecting the existing contrast floor
(WCAG AA on the panel background — same constraint the tone colors already meet).

## Testing

Vitest, same pure-logic/thin-I/O split:

- **fiction:** every dossier/variant/epilogue non-empty and within its length cap;
  roster names ≤ 16 chars; every station with `taxRate > 0` or `danger > 0` has
  the number's consequence in its dossier (string containment on the % or a
  keyword — presence check, not prose review); `crewName`/`epilogue` are
  deterministic per seed and vary across seeds.
- **events:** across a seed × day × route sweep, `rollEvent(...).kind` is
  byte-identical to pre-change fixtures (kind reads the first draw only);
  descriptions are deterministic per (seed, day, from, to) and take ≥ 2 distinct
  values per kind across the sweep; pirate descriptions contain today's crew name.
- **game:** pay/flee log lines name the crew; tones/deltas unchanged;
  the conservation test (log deltas sum to credit movement) still passes
  untouched — day stamps and fiction add no deltas.
- **log stamping:** every entry written by a scripted run carries the day it was
  written; `endRun`'s line carries the final day.
- **collapse (pure helper):** `[A,A,A,B,A]` folds to `A×3, B, A`; deltas sum;
  tone mismatch breaks a run; singletons render without `×1`.
- **storage:** a v3 snapshot with day-less log entries resumes and renders; a
  snapshot with `day: -1` or `day: "x"` on an entry rejects to fresh; round-trip
  of a new snapshot preserves `day`.
- **screens:** dossier sentence present per station; epilogue present on lost
  runs, absent on banked; log renders newest-first; divider appears exactly at
  day boundaries; past-day and legacy lines carry the dim class; collapsed line
  shows count and summed delta.
- **sim:** one 100-seed sweep re-run as sanity — bands expected byte-identical
  (no strategy reads descriptions; kind order preserved; decision 3).
- **Lighthouse CI stays green** — text and static CSS only, no motion added.

## Error handling

- `crewName`/`epilogue`/variant indexing all reduce modulo their array length —
  no out-of-range access is constructible; empty variant arrays are prevented by
  the fiction presence tests, not runtime guards.
- Day-less log entries are first-class, not an error: they render dimmed and
  dividerless (decision 5). Corrupt `day` values reject at parse, never at render.
- The collapse helper treats `delta: undefined` as 0 for summing but renders no
  delta cell when every entry in the run lacked one — a collapsed run of
  non-money lines doesn't grow a spurious "+0".
- Bulletin overflow: a fiction test caps roster + station-name worst case at
  ≤ 70 chars, so the render path needs no truncation branch.

## Acceptance criteria (round-level)

E2-4:

- [ ] Every station's trade hub shows its dossier sentence ahead of the
      mechanical intel, which is unchanged.
- [ ] The same daily seed names the same pirate crew everywhere it surfaces:
      event description, pay/flee log lines, bulletin raider line.
- [ ] Each event kind has ≥ 3 description variants, deterministic per
      seed/day/route; event kinds are byte-identical to pre-change fixtures for
      every seed (no RNG-order change).
- [ ] A lost run shows a cause-matched epilogue on the run-end screen; the same
      seed + cause always shows the same one; banked runs are unchanged.

P3-1:

- [ ] The log renders newest-first with a "Day N" divider at each day boundary;
      previous days are visually dimmed.
- [ ] Consecutive identical lines collapse to one line with ×N and a summed
      delta; the turn report and conservation semantics are untouched.
- [ ] A pre-round v3 snapshot resumes cleanly; its legacy entries render dimmed
      without dividers.

Round:

- [ ] No mechanic changed: 100-seed sweep bands byte-identical; full suite green;
      Lighthouse CI green.
- [ ] ROADMAP/backlog rows ticked on land (E2-4, P3-1).
