# Starlight Traders — Roadmap

Dependency-ordered plan from the backlog triage on **2026-07-21**. Consolidates
[BACKLOG.md](BACKLOG.md) (UI/UX friction) and [ENGAGEMENT_BACKLOG.md](ENGAGEMENT_BACKLOG.md)
(game design & retention) into four sequenced milestones plus a deferred/backlog tail.

**Strategic anchor:** commit to the **bounded daily run** pivot (E0). The core finding is
_runs don't end → nothing else matters_ (no score banking, no "one more run", no comparable
daily). E0-1 is the keystone; persistence, share card, debrief, and final scoring all hang
off a run that actually ends.

Legend: ✅ committed · 🟡 deferred (tuning) · ⚪ backlog (revisit) · 🔀 absorbed into another item.

---

## 🟢 Milestone 1 — E0 "Bounded Daily Run" (keystone)

The pivot everything downstream builds on.

| Item     | What                                                                   | Notes                                                                                                                                |
| :------- | :--------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| **E0-1** | Daily Audit: run lasts ≤12 days + Retire button                        | ✅ **Shipped 2026-07-21.** The keystone. Spec in ENGAGEMENT §4.1.                                                                    |
| **E0-2** | Rework score = net worth + capped survival bonus                       | ✅ **Shipped 2026-07-21.** Bundled with E0-1 — score semantics changed exactly once.                                                 |
| **E0-3** | localStorage persistence (PB, attempts, Daily/Practice)                | ✅ **Shipped 2026-07-29.** After E0-1's end states exist. Spec in ENGAGEMENT §4.2.                                                   |
| **E0-4** | Loan escalation (4→6→8%) + named lender ("The Syndicate")              | ✅ **Shipped 2026-07-21.** In-milestone: cheapest late-run tension; lands the voice E2-4 reuses.                                     |
| **B-6**  | Give hull 0 a real consequence                                         | ✅ **Shipped 2026-07-21.** Advertised "−N hull" stakes are now real — hull 0 destroys the ship.                                      |
| **P3-3** | A11y/polish (focus restore, `document.title`, `<h1>`, restart confirm) | ✅ **Shipped.** Focus restore, document.title, one-`<h1>`-per-screen, and restart confirm all verified in code (main.ts/screens.ts). |
| 🔀 P2-4  | Live score-chase in statbar                                            | Folded into E0-2; copy-confirm superseded by E1-2.                                                                                   |

## 🟢 Milestone 2 — E1 "Hooks" (run again / return tomorrow)

Cashes in the E0 pivot: the ending becomes retention.

| Item     | What                                                                                             | Notes                                                                                                                                                                                                                                                                                                        |
| :------- | :----------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E1-1** | Today's Trade Bulletin                                                                           | ✅ **Shipped 2026-07-31.** Independent; can parallelize. Spec in ENGAGEMENT §4.3.                                                                                                                                                                                                                            |
| **P1-2** | Forecast sinks (costs on jump buttons, interest chip, tax display)                               | ✅ **Shipped 2026-07-31.** Same forecast-forward surfaces as E1-1 — built together.                                                                                                                                                                                                                          |
| **E1-2** | Share card v2 (date-branded, emoji run-strip, cause line, URL)                                   | ✅ **Shipped 2026-07-30.** The viral artifact. Needs E0-1 + E0-3.                                                                                                                                                                                                                                            |
| **E1-3** | Run debrief screen (cause, breakdown, PB delta, "left on the table")                             | ✅ **Shipped 2026-07-29.** Next-run decision surface. Needs E0-3.                                                                                                                                                                                                                                            |
| **E0-5** | Resume an in-progress run on a **same-day** refresh (fresh run only once the UTC day rolls over) | ✅ **Shipped 2026-07-30.** Robustness follow-up to E0-3. Snapshot live `GameState` keyed by UTC day; rehydrate at boot if same-day, else start fresh. Snapshot **post-decision** state only, so a refresh resumes rather than re-rolls (upholds E0-3's anti-scum rule). Needs E0-3. Spec in ENGAGEMENT §4.4. |
| **E1-4** | Honest events pass (show odds/stakes, fix degenerate math)                                       | ✅ **Shipped 2026-07-31.** Honesty + balance-bug detector. Pairs with UIUX P0-1 surfaces.                                                                                                                                                                                                                    |
| **B-2**  | Fix event-hash aliasing (`vulcan`/`verge` → 'v')                                                 | ✅ **Shipped 2026-07-31.** Same code as E1-4 — done together.                                                                                                                                                                                                                                                |
| **P2-1** | Structured log entries `{msg, tone, delta}`                                                      | ✅ **Shipped 2026-07-31.** Foundational — feeds debrief + event tone/delta.                                                                                                                                                                                                                                  |
| **B-5**  | Fix README luxury-modifier claim                                                                 | ✅ **Shipped 2026-07-29** (README claim rewritten). Cheap; anytime. Delete the false claim (implement-path is deferred E1-5).                                                                                                                                                                                |

## 🟢 Milestone 3 — E2 "Systems depth" (kill degenerate strategies)

Sequence decided 2026-08-01: **round 1 = E2-2 + P2-3**, then texture (E2-4 → E2-3 →
E2-5), then **E2-1 dead last** — the star map changes route viability, so E2-1's
sim gate only measures the real game after E2-3 lands.

**Round 1 closed 2026-08-02.** Next up: E2-4 (fiction pack).

| Item     | What                                                                            | Notes                                                                                                                                                                    |
| :------- | :------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E2-2** | Contract integrity (deposit, expiry penalty, reward floor, instant-settle nerf) | ✅ **Shipped 2026-08-02.** Riskless-option exploit closed: 0 of 2,406 generated offers profit from accept→jump→buy-dockside→deliver.                                     |
| **P2-3** | Contract feasibility card (cost/fuel/profit/days-left)                          | ✅ **Shipped 2026-08-02** (bundled with E2-2).                                                                                                                           |
| **E2-4** | Fiction pack (station dossiers, named crew, death epilogues)                    | Template strings; reuses E0-4's Syndicate voice.                                                                                                                         |
| **E2-3** | Star map + per-edge danger                                                      | Biggest single feature (L); restores path-planning.                                                                                                                      |
| **E2-5** | Achievements-lite + calendar                                                    | Needs E0-3.                                                                                                                                                              |
| **E2-1** | Market depth (per-day trade volume, price degrades on repeat)                   | **LAST + sim-gated** — heaviest balance change; re-run the 100-seed sweep and tighten tests.                                                                             |
| **P2-2** | Market intel + cost basis (▲/▼ vs base, station intel, P&L)                     | Intel half (▲▼ vs base + station intel) shipped 2026-07-31 with the M2 close-out; cost-basis/P&L half remains. Coordinate with E1-1 + E2-1 to avoid duplicate surfacing. |

## 🟢 Milestone 4 — Texture & polish

| Item     | What                                                    | Notes                                                   |
| :------- | :------------------------------------------------------ | :------------------------------------------------------ |
| **E3-1** | Daily modifiers (one seeded modifier/day)               | Best chatter-per-effort; pairs with E1-1 bulletin.      |
| **E3-2** | Long-haul incentive (richer tables on dead 7–8⛽ edges) | Reclaims wasted map edges.                              |
| **E3-4** | Salvage bait (sometimes attracts a pirate tail)         | Prices the free-money salvage; risk scales with wealth. |
| **P3-2** | Juice (pulse stats, floating toast, danger pips)        | Needs P2-1. Partially shipped already.                  |

---

## 🟡 Deferred — tuning pass (gated on playtest)

| Item     | What                                      | Gate                                                                                                                          |
| :------- | :---------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| **E1-5** | Heat (pirate floor scales with net worth) | Add only if the endgame is still flat after E0-1 (bounded) + E0-4 (loan escalation). Don't pre-build a third pressure system. |

## ⚪ Backlog — revisit later

| Item     | What                                                         | Why not now                                                                                                                                                           |
| :------- | :----------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E3-3** | Distress Call (7th event)                                    | Additive content, not corrective.                                                                                                                                     |
| **P3-1** | Log spam/ordering (collapse repeats, newest-first, dividers) | Polish; depends on P2-1.                                                                                                                                              |
| **E3-5** | Image share card (canvas → PNG, real icons instead of emoji) | Craft on the acquisition surface only pays once the loop it advertises is worth joining. E1-2's text card ships now and stays the fallback. Spec in ENGAGEMENT §3 P3. |

---

## Already shipped (context)

UIUX P0-1, P0-2, P1-1 (trade buttons); bugs B-1, B-3, B-4; Engagement quick wins 1–4.
**Milestone 1 is fully shipped:** E0-1 (bounded run + Retire, 2026-07-21), E0-2
(net-worth + capped survival-bonus score, 2026-07-21), E0-3 (persistence pack,
2026-07-29), E0-4 (loan escalation + the Syndicate, 2026-07-21), B-6 (hull 0 destroys
the ship, 2026-07-21), P3-3 (a11y/polish). **Milestone 2 is fully shipped:** E1-3 (run
debrief, 2026-07-29), E0-5 (same-day resume, 2026-07-30), E1-2 (share card v2,
2026-07-30), B-5 (README fix, 2026-07-29), E1-1 (Trade Bulletin, 2026-07-31), P1-2
(forecast sinks, 2026-07-31), E1-4 (honest events, 2026-07-31), B-2 (event-hash fix,
2026-07-31), and P2-1 (structured log entries, 2026-07-31). The M3 item P2-2 also had
its intel half (▲▼ vs base + station intel) ship 2026-07-31 with the M2 close-out; its
cost-basis/P&L half remains. See the two backlog files for details.
