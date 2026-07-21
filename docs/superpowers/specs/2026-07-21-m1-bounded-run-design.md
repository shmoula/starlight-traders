# M1 Round 1 — "The Run Ends" (E0-1 + E0-2 + B-6 + E0-4)

**Date:** 2026-07-21 · **Status:** approved for planning
**Source:** [ROADMAP.md](../../ROADMAP.md) Milestone 1, specs in
[ENGAGEMENT_BACKLOG.md](../../ENGAGEMENT_BACKLOG.md) §4.1 and item rows E0-2, E0-4, B-6.

## Scope

One implementation round bundling every **balance-affecting** Milestone 1 item, so the
100-seed sweep is tuned exactly once with all pressure sources in place:

- **E0-1** Daily Audit — run lasts ≤12 days + Retire button
- **E0-2** Score rework — net worth at end + capped survival bonus
- **B-6** Hull 0 destroys the ship (run lost)
- **E0-4** Loan escalation (4→6→8%) + Syndicate voice

**Deferred to round 2 (not in this spec):** E0-3 localStorage persistence, P3-3
a11y/polish. **Explicitly out of scope:** E1-2 share card v2, E1-3 debrief screen,
E1-4 event-odds display.

## Decisions made during brainstorming

1. **Round scope:** all four balance-affecting items together (vs. keystone-only or
   whole milestone). Rationale: E0-1's acceptance criteria pin sweep death-rates that
   B-6 and E0-4 both move; bundle so the balance target is hit once.
2. **Hull 0 = ship destroyed, run lost** (vs. crippled-until-repaired or forced audit).
   Cleanest rule; makes every advertised "−N hull" stake literally risk the run.
3. **Death loses cargo + survival bonus** (vs. one formula for all end states, or an
   audit-completion bonus). Dying rich is a real loss; retiring is how you *bank* a
   fortune — the push-your-luck tension E0 wants.
4. **Structured `RunEnd` object** (vs. status union + pure score function). One source
   of truth for end-of-run data; E0-3 persistence and E1-3 debrief consume it later.

## 1. End-state model (engine core)

`GameState.status` becomes `"playing" | "lost" | "audited" | "retired"`.

When a run ends by any path, the engine attaches one structured object to state:

```ts
interface RunEnd {
  status: "lost" | "audited" | "retired";
  cause: string;            // "Hull breach — your ship broke apart off Vulcan Yards."
  daysSurvived: number;     // state.day, capped at RUN_LENGTH
  netWorthAtEnd: number;    // credits + cargo − debt; death: credits − debt (cargo lost)
  survivalBonus: number;    // 0 for death
  score: number;            // max(0, netWorthAtEnd) + survivalBonus
}
```

A new module `src/engine/run-end.ts` owns `endRun(state, status, cause): GameState`
(computes `RunEnd`, sets status, appends the cause log line). All end paths — audit,
retire, stranding, hull breach — go through it.

- `peakNetWorth` stays tracked and displayed as a stat; it is no longer the score.
- The `screens.ts:356` pattern that scrapes the cause of death from the last log line
  is deleted; `runEnd.cause` replaces it.
- `economy.score(peakNetWorth, days)` is deleted; scoring lives in `run-end.ts`.

## 2. E0-1 — Audit and Retire

- `RUN_LENGTH = 12` (engine constant).
- **Audit:** in `arrive()`, after deliveries settle and peak is tracked: if status is
  still `"playing"` and `day >= RUN_LENGTH`, end as `"audited"` with cause "The
  Syndicate audits your books and banks your score."
- **Audit wins over stranding.** On a day-12 arrival the fuel/credits loss check is
  skipped — you made it. (Hull breach *in transit* still wins over the audit because it
  resolves before arrival; see §3.)
- **Retire:** new engine function `retire(state)`. Valid only while
  `status === "playing"`; otherwise a no-op. Ends as `"retired"` with cause
  "Retired at <station name>." The UI only offers it at dock with no pending event.
- **Guard rail:** `jump()` (and `retire()`) no-op unless status is `"playing"` — no
  path continues past an ended run.
- `day` only advances on jump, so a run is at most 11 jumps. The day counter renders
  as **"Day N/12"** everywhere it appears.

## 3. B-6 — Hull death

- Hull ≤ 0 destroys the ship: `endRun(s, "lost", "Hull breach — your ship broke
  apart.")` (cause may name the route/station for flavor).
- The check runs inside `resolveChoice()` after applying the event's effect, covering
  all four damage sites: pirate flee (15–24), salvage trap (10), derelict trap (20),
  engine strain. The `Math.max(0, hull − dmg)` clamps are removed in favor of the
  death check (displayed hull floors at 0).
- If the ship is destroyed in transit, `arrive()` early-returns: **deliveries do not
  settle on a destroyed ship**, and no audit fires.
- Death scoring: cargo goes down with the ship — `netWorthAtEnd = credits − debt`,
  `survivalBonus = 0`.
- `preview.ts` choice previews gain a "⚠ could destroy you" marker when the
  worst-case roll of that choice would reduce hull to 0 or below.
- Repair (6cr/pt, hull 100 max) is unchanged — it becomes survival insurance.

## 4. E0-2 — Scoring

| End state | Formula |
| :-- | :-- |
| Audited / Retired | `max(0, netWorth) + SURVIVAL_BONUS_PER_DAY × min(day, 12)` |
| Lost (stranded or hull breach) | `max(0, credits − debt)` — no bonus, cargo lost |

- Proposed `SURVIVAL_BONUS_PER_DAY = 50` (max 600): meaningful next to a cautious
  run's net worth, small next to a strong contract run (~5,600 observed). The final
  constant is a **sweep-tuned knob**, not a contract of this spec.

## 5. E0-4 — Loan escalation

- `loanInterest(debt, day)` replaces the flat `LOAN_RATE`: **4% (days 1–4) → 6%
  (days 5–8) → 8% (days 9–12)**.
- Accrual cadence is unchanged (every 3 days, in `jump()`): day 3 @4%, day 6 @6%,
  day 9 @8%, day 12 @8% — one last bite before the audit.
- Log lines carry the Syndicate's voice, escalating with the rate tier:
  - 4%: "The Syndicate compounds: +Ncr."
  - 6%: "The Syndicate compounds: +Ncr. It grows impatient."
  - 8%: "The Syndicate compounds: +Ncr. It is losing patience with you."

## 6. UI changes (`screens.ts`, `main.ts`, `share.ts`)

- **Retire & bank score** button on the station screen: two-click inline confirm
  (first click arms it — "Retire — sure?"), disabled while an event is pending.
- **End screen** renders per status: headline AUDITED / RETIRED / SHIP DESTROYED /
  STRANDED, the `runEnd.cause` line, and a score breakdown
  (net worth + survival bonus = score), plus a peak-net-worth stat line.
- **Statbar** day chip reads "Day N/12".
- **Share card** keeps its current format (date + URL, shipped as quick-win 4) but
  pulls score and days from `runEnd`. Full v2 card remains E1-2.

## 7. Sim & tests

- `sim/simulate.ts`: archetypes need no external day cap — the engine bounds them.
  They play until audit or death (archetypes never retire).
- **Balance assertions** (from E0-1 acceptance criteria), run across the 100-seed
  sweep:
  - every sim run ends by day 12 (no state with `status: "playing"` after day 12);
  - ≥95% of cautious/balanced runs reach the audit alive;
  - greedy death rate before day 12 lands in **10–40%**.
  - Tuning knobs if outside the band: survival bonus, loan step rates/days, trap
    damage values.
- **Engine unit tests:** audit trigger (incl. audit-beats-stranding on a day-12
  arrival), `retire()` validity and no-op cases, hull death from each damage site,
  in-transit death skips delivery settlement and audit, interest rate per day tier,
  score math per end state, `jump()` no-op after run end.
- Existing suite (78 tests) updated wherever score/status semantics changed.

## Error handling

- `retire()` and `jump()` are no-ops on ended runs (idempotent; no throws).
- Retire button disabled during pending events and after run end (UI), backed by the
  engine guard.
- Hull display floors at 0 even though the death check sees the raw value.

## Acceptance criteria (round-level)

- [ ] No path exists where a run continues past day 12; day counter reads "Day N/12".
- [ ] Retire is available at every dock, confirm-gated, and banks the E0-2 score.
- [ ] All three end states produce a populated `runEnd` and reach the end screen +
      share card.
- [ ] Hull 0 ends the run as a loss from every damage site; worst-case-lethal choices
      are marked in previews.
- [ ] Interest steps 4/6/8% with escalating Syndicate log lines.
- [ ] Sweep assertions above pass; full test suite green.
