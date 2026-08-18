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

**Round 1 closed 2026-08-02; round 2 closed 2026-08-04; round 3 (E2-3 star map) closed 2026-08-07; round 4 (E2-5 + E2-2g + E2-2j) closed 2026-08-10; round 5 (E2-1 market depth + E2-2f reward re-anchor + P2-2 cost-basis) closed 2026-08-11.** Milestone 3 closed 2026-08-11.

| Item     | What                                                                            | Notes                                                                                                                                                                                                                            |
| :------- | :------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E2-2** | Contract integrity (deposit, expiry penalty, reward floor, instant-settle nerf) | ✅ **Shipped 2026-08-02.** Riskless-option exploit closed: 0 of 2,406 generated offers profit from accept→jump→buy-dockside→deliver.                                                                                             |
| **P2-3** | Contract feasibility card (cost/fuel/profit/days-left)                          | ✅ **Shipped 2026-08-02** (bundled with E2-2).                                                                                                                                                                                   |
| **E2-4** | Fiction pack (station dossiers, named crew, death epilogues)                    | ✅ **Shipped 2026-08-04.** Template strings; reuses E0-4's Syndicate voice.                                                                                                                                                      |
| **E2-3** | Star map + per-edge danger                                                      | ✅ **Shipped 2026-08-07.** Danger moved to a 10-entry per-lane table; clickable SVG star map in the Navigator; orb metas and bulletin read per-lane.                                                                             |
| **E2-5** | Achievements-lite + calendar                                                    | ✅ **Shipped 2026-08-10.** 12 local feats + 4-week Logbook calendar on day 1; feats earn on any run; save doc v2.                                                                                                                |
| **E2-1** | Market depth (per-day trade volume, price degrades on repeat)                   | ✅ **Shipped 2026-08-11.** Sell-side market depth — price degrades per unit sold same-day, recovers next day. Final knobs: MARKET_DEPTH=20, DEPTH_SLOPE=0.08, DEPTH_FLOOR=0.6.                                                   |
| **P2-2** | Market intel + cost basis (▲/▼ vs base, station intel, P&L)                     | ✅ **Cost-basis half shipped 2026-08-11:** avg-paid cost basis (total-paid with proportional relief) + unrealized P&L chip per held commodity. Intel half (▲▼ vs base + station intel) shipped 2026-07-31 with the M2 close-out. |

## 🟢 Milestone 4 — Texture & polish

**Round 1 closed 2026-08-13 ("No Two Days Alike"): E3-1 + E3-2 + E3-4 shipped together** — one seeded daily modifier per date, salvage-rich long-haul lanes plus seeded ice-run contracts, and salvage bait that latches a one-jump pirate tail, all honest on every surface and held by the 100-seed sim sweep (new per-modifier fairness gate, all 7 groups ≥90%). **Round 2 closed 2026-08-17 ("The Last Three Days"): E1-5 + P3-2 + P2-4 shipped together, closing Milestone 4** — a wealth-scaled pirate danger floor and toll make the last three days the hardest ones, narrated by a Syndicate voice line on each threshold crossing; delta-keyed stat pulses, a floating credit toast, and shared green→amber→red danger pips finish the juice pass; the statbar's peak chip and `Copied ✓`/`Copy failed` share confirm finish P2-4. The E1-5 gate was ruled **met** on a survival+heat-conditioned danger lift (runs with day ≥9 and peak ≥ `HEAT_PER_CR`) — balanced +0.027, greedy +0.031, against a 0.02 floor; greedy deaths landed at 35/100 (10–40 band); the cautious anchor stayed unmoved at −189,973. **Milestone 4 closed 2026-08-17.**

| Item     | What                                                    | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| :------- | :------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E3-1** | Daily modifiers (one seeded modifier/day)               | ✅ **Shipped 2026-08-13.** One seeded modifier per daily seed, constant all run, from a 7-entry pool (clear skies, ion storms, luxury boom, parts glut, pirate amnesty, corsair season, syndicate rest); effects channel through fuelCost/getPrice/event bands/interest and surface on the bulletin lead, screen-head chip, and share card. Ion storms softened to long-haul-only (+1⛽ on base ≥7⛽ lanes) to clear the ≥90% per-modifier fairness gate.                                |
| **E3-2** | Long-haul incentive (richer tables on dead 7–8⛽ edges) | ✅ **Shipped 2026-08-13.** The two 7–8⛽ lanes (kiruna–verge, kiruna–meridian) double their salvage band and read "salvage-rich"; seeded ❄ ice-run contracts (water → Verge) append to Kiruna's board on a ~1-in-3 cadence with a day-1 bulletin notice.                                                                                                                                                                                                                                 |
| **E3-4** | Salvage bait (sometimes attracts a pirate tail)         | ✅ **Shipped 2026-08-13.** A clean salvage scoop is seeded 1-in-4 to be bait, latching a one-jump pirate tail (+0.35 ambush odds) shown on the collect button and announced immediately, cleared on the next jump; persisted via snapshot v6.                                                                                                                                                                                                                                            |
| **E1-5** | Heat (pirate floor scales with net worth)               | ✅ **Shipped 2026-08-17.** Gate ruled **met**: pirate danger floor and toll both scale off `peakNetWorth`/net worth, evidenced by a survival+heat-conditioned danger lift (runs with day ≥9 and peak ≥ `HEAT_PER_CR`) — balanced +0.0272, greedy +0.0305, against a 0.02 floor. Greedy deaths 35/100 (10–40 band); cautious net worth unmoved at −189,973. Final knobs at plan defaults: `HEAT_PER_CR`=1500, `TOLL_RATE`=0.1, `HEAT_STEP`=0.01, `HEAT_CAP`=0.15, `HEAT_VOICE_STEP`=0.05. |
| **P3-2** | Juice (pulse stats, floating toast, danger pips)        | ✅ **Shipped 2026-08-17.** Delta-keyed stat pulse classes (`vitalPulses`), a floating `+860cr` credit toast outside the swapped `#app` root, and green→amber→red danger pips (`laneTone`) shared by jump orbs and star-map lanes; all motion respects `prefers-reduced-motion`.                                                                                                                                                                                                          |
| **P2-4** | Live score-chase in statbar + share confirm             | ✅ **Shipped 2026-08-17.** Statbar carries a `🏆 {peak}` chip; the share button flips to `Copied ✓` / `Copy failed` for 2s instead of discarding `copyShare`'s result.                                                                                                                                                                                                                                                                                                                   |

## 🟢 Milestone 5 — Launch cut

**Round 1 closed 2026-08-18 ("The Word Gets Out"): E3-5 + E3-3 + E2-2k shipped together** — the
run card drawn to a 1200×630 PNG from a pure display-list with an image-first copy path
(text card kept as the honest fallback, Save PNG everywhere), the seventh event: a
distress beacon answered for 2⛽ + one full day at seeded 60/40 odds shown per E1-4, and
partition-neutral liquidation tax closing the last ±1cr path across the escape line.
Sweep re-recorded with NO knob changes: cautious distress-inert (+907 drift, audited 97),
balanced 100% audited (73 rescues), greedy deaths drifted down 35→21 (86 rescues).

| Item      | What                                               | Notes                                                                                                                                                                          |
| :-------- | :------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E3-5**  | Image share card (canvas → PNG, drawn strip cells) | ✅ **Shipped 2026-08-18.** Pure `cardOps` display-list painted by a dumb canvas replayer; image-first clipboard with text fallback + Save PNG.                                 |
| **E3-3**  | Distress Call (7th event, values-driven choice)    | ✅ **Shipped 2026-08-18.** Answer costs 2⛽ + a real day for a seeded 60/40 reward priced on the beacon's day; band inserted after derelict so risk bands stay byte-identical. |
| **E2-2k** | Liquidation-tax neutrality (±1cr escape-line fix)  | ✅ **Shipped 2026-08-18.** `saleTax` charges on cumulative per-commodity gross so any partition of a stack telescopes to the single rounded charge.                            |

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
its intel half (▲▼ vs base + station intel) ship 2026-07-31 with the M2 close-out. P3-1
(log collapse/newest-first/day dividers) shipped 2026-08-04 with M3 round 2. E2-3 (star
map + per-edge danger) shipped 2026-08-07 with M3 round 3. E2-5 (12 local feats +
4-week Logbook calendar, save doc v2), plus E2-2g (settlement-order badges on contested
contracts) and E2-2j (best-haul/💰 highlight exclude the returned deposit), shipped
2026-08-10 with M3 round 4. **Milestone 3 closed 2026-08-11 with round 5:** E2-1
(sell-side market depth, final knobs MARKET_DEPTH=20/DEPTH_SLOPE=0.08/DEPTH_FLOOR=0.6),
E2-2f (contract rewards re-anchored to the day-independent baselinePrice, curbing the
bounce line), and P2-2's cost-basis/P&L half (avg-paid cost basis + unrealized P&L chip
per held commodity) all shipped. **Milestone 4 opened 2026-08-13 with round 1
("No Two Days Alike"):** E3-1 (daily modifiers — 7-entry seeded pool through
fuelCost/getPrice/event-bands/interest, surfaced on bulletin/screen-head/share
card; ion storms shipped long-haul-only after the fairness gate), E3-2
(salvage-rich long-haul lanes + seeded ❄ ice-run contracts at Kiruna), and E3-4
(salvage bait → one-jump pirate tail, snapshot v6) all shipped; final knobs at
plan defaults (SALVAGE_BAIT_DIVISOR=4, TAIL_BONUS=0.35, CORSAIR_DANGER_DELTA=0.06,
LONG_HAUL_SALVAGE_BAND=0.36, ICE_RUN_CADENCE=3, MODIFIER_SALT=0x7007). **Milestone
4 closed 2026-08-17 with round 2 ("The Last Three Days"):** E1-5 (heat — pirate
danger floor and toll both scale off `peakNetWorth`/net worth via `heatOf` and
`JumpRisk`, threaded through `effectiveDanger`/`rollEvent`; a Syndicate voice
line narrates each threshold crossing), P3-2 (delta-keyed stat pulses, a
floating credit toast outside the swapped DOM root, and green→amber→red danger
pips shared by jump orbs and the star map), and P2-4 (statbar `🏆 {peak}` chip
and `Copied ✓`/`Copy failed` share confirm) all shipped. The E1-5 gate was
ruled **met** on a survival+heat-conditioned danger lift (runs with day ≥9 and
peak ≥ `HEAT_PER_CR`) — balanced +0.0272, greedy +0.0305, against a 0.02 floor;
greedy deaths landed at 35/100 (10–40 band); the cautious anchor stayed
unmoved at −189,973 (no heat, no scaled toll). Final knobs at plan defaults
(HEAT_PER_CR=1500, TOLL_RATE=0.1, HEAT_STEP=0.01, HEAT_CAP=0.15,
HEAT_VOICE_STEP=0.05) — no tuning was needed. **Milestone 5 (Launch cut)
opened and closed 2026-08-18 with round 1 ("The Word Gets Out"):** E3-5 (image
share card — the run card drawn to a 1200×630 PNG from a pure `cardOps`
display-list, image-first clipboard with the text card as the honest fallback
and Save PNG everywhere), E3-3 (Distress Call — the seventh event, answered for
2⛽ + one full day at a seeded 60/40 split priced on the beacon's day, banded
after derelict so every risk-outcome roll stays byte-identical), and E2-2k
(partition-neutral liquidation tax via `saleTax` on the cumulative
per-commodity gross, closing the last ±1cr path across the escape line) all
shipped. The sweep was re-recorded with **no knob changes** and **no gate
thresholds re-recorded** — the persona fix alone re-held every gate at its
existing baseline: cautious stayed distress-inert (netWorthSum −189,973,
+907 drift vs the pre-depth baseline, audited 97/100, 0 rescues), balanced held
100% audited (netWorthSum ratio 0.721 to baseline, 73 rescues), and greedy
deaths drifted down 35→21 (10–40 band, 86 rescues); the grateful split lands in
(0.55, 0.65) over a 400-seed window. Knobs at plan defaults (DISTRESS_BAND=0.08,
DISTRESS_FUEL=2, DISTRESS_REWARD_BASE=250, DISTRESS_REWARD_PER_DAY=15, grateful
3/5). See the two backlog files for details.
