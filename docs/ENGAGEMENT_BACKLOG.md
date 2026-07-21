# Starlight Traders — Engagement Backlog

Findings from the game-design & retention playtest (2026-07-19), ordered by priority.
This complements [BACKLOG.md](BACKLOG.md) (UI/UX friction) — items here are about _game
design, retention, and meaning_; where they touch UI/UX items they cross-reference them
(e.g. "extends UIUX P0-1"). Effort: **S** ≈ ≤2h, **M** ≈ half-day, **L** ≈ ~1 day+.

## 1. Method

- **4 browser runs on the 2026-07-19 seed (#1482862887)**, same world each time:
  - _Cautious hauler_ (Kiruna⇄Vulcan water only): day 17, hull never touched, debt paid
    to 0 by day 14 — ended by tester boredom; the game cannot end this run.
  - _Contract runner_ (chained deliveries + arbitrage): day 11, net worth **+5,597**
    (≈7× cautious at the same day) — ended by tester; no way to bank the score.
  - _Greedy gambler_ (luxury, dangerous routes, every gamble): 10 days of maximal
    aggression → net worth **−1,227** (worse than the −700 start), then died day 13
    when deliberately stranded. Score 524.
  - _Sabotage_ (die ASAP from a fresh start): dead on day 5, ~90 seconds of real time,
    score 0. Death detection fires **on arrival only**; docked "stranded-looking"
    states are actually recoverable via undocumented partial refuel.
- **Balance sweep**: temporary vitest spec ran `runArchetype` across **100 seeds × 3
  archetypes × day-caps 30/60** (all 78 existing tests pass). Headline numbers below.
- **Skills applied** via the Skill tool: game-design-core, gameplay-mechanics,
  game-balancing, gamification-loops, game-ui-design, narrative-design, level-design,
  growth-loops. Each item's "Why it works" column cites its lens.

## 2. Playtest findings

### What already works — protect it

- **The cockpit reads beautifully.** Sticky vitals, turn report ("Since your last
  jump"), disabled no-op buttons — the shipped UIUX quick wins land.
- **The engine is honest and deterministic.** Same seed → same prices, contracts and
  event rolls; replaying a wiped run reproduced it exactly. Zero console errors in 4
  runs. The comparability asset is real.
- **The safe-valley → danger-east geography** (Terra/Kiruna/Vulcan triangle vs
  Verge/Meridian) is genuinely good level design — an on-ramp loop and a rich risky
  endgame region.
- **Contract chains at capital are the game at its best.** Days 8–11 of the contract
  run (hull dropping, board rerolls, a 4,738cr luxury delivery through pirate lanes)
  were the emotional high of the whole playtest.
- **Price drift creates real drama** (Verge luxury 417→470→612→792→326 across 8 days)
  — the raw material for anticipation exists.
- **The Verge's 0% tax** and Meridian's 18% + customs are excellent implicit
  world-building — currently invisible until experienced.

### What doesn't work

- **First 90 seconds verdict: goal vacuum.** Nothing on screen states the objective,
  the score, the daily seed, or why you're in debt. The first "decision" (which
  contract, which route) is a blind guess — prices have no reference point and the
  868cr parts contract is unaffordable dead weight on day 1.
- **Runs don't end.** Sweep: _balanced_ archetype reaches the day-30 cap in **100/100
  seeds** and is still 100% alive at day 60; greedy 89%/88%; early deaths (<day 10)
  happen in 4% of greedy runs only. Two of my three strategy runs could only end by my
  quitting. The roguelike's run→score→restart loop never fires.
- **Score measures time-in-seat, not skill.** `score = peakNW × (1 + 0.1×days)`
  (economy.ts:41) is unbounded: sim-balanced scores 138,956 median at day 30 and
  512,218 at day 60. A patient turtle beats any brilliant 10-minute run.
- **The safe strategy is score-dead**: cautious median score across 100 seeds is
  **0** (max 940). The archetype spread is inverted at both ends — safe play can't
  score, active play can't lose.
- **Decisions are information-starved.** Prices are visible only where you're docked;
  event odds are hidden and the displayed "danger 0%" conceals a flat 10% pirate floor
  (events.ts:16). My gambler bought luxury at 792 and sailed into a 373 market —
  not a gamble he could have priced.
- **Event choices are secretly degenerate.** Fleeing pirates strictly beats paying
  (toll 150+10×day vs 15–24 hull ≈ 90–144cr of repairs) until hull-critical; derelict
  boarding is deterministic day-parity, `(day×7+seed)%2` (game.ts:263) — on a given
  daily seed, odd or even days _always_ win; salvage has no downside. The six events
  are five coin-flips and a toll booth wearing decision costumes.
- **Contracts are free options with exploits.** No accept limit, no expiry penalty
  (an 11,289cr contract expired as one grey log line), and `deliver()` +
  reward = 1.3–1.7 × destination spot price (missions.ts:17) means accept-at-A,
  fly-empty, buy-at-B, settle-instantly is riskless premium.
- **Why would I come back tomorrow? Nothing.** Zero persistence: no personal best, no
  history, no streak, no run number. The share card ("Score 524 · Seed #1482862887")
  requires _dying_ to obtain, shows a raw integer instead of a date, has no URL, and
  its unbounded score is unrankable by a reader. The design spec's own bet — "D1
  retention ≥35%, the daily-seed habit is the whole bet" — has no mechanical support.
- **The fiction is absent, not bad.** One sentence of narrative exists. Stations are
  stat blocks; raiders and inspectors are nameless; death has no cause line
  ("RUN OVER. You survived 13 days.").

## 3. Backlog

### P0 — Existential: give the daily run an ending, a fair score, and a memory

| #    | Insight & evidence                                                                                                                                                                | Proposed feature                                                                                                                                                                                                                                 | Why it works (skill/principle)                                                                                                                                          | Effort |
| :--- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----: |
| E0-1 | Competent runs never end (sim: balanced 100/100 alive at day 60; playtest runs 1–2 ended only by quitting). No ending → no score banking, no "one more run", no comparable daily. | **The Daily Audit**: the daily run is exactly **12 days** — on day 12 the Syndicate audits you and your score banks automatically. Add a **"Retire & bank score"** button (always available at dock) for ending early. Spec in §4.1.             | game-design-core: the meso loop (run→score→restart) must exist; growth-loops: bounded outcome = rankable result (Wordle's 6 guesses).                                   |   L    |
| E0-2 | `score = peakNW × (1+0.1×days)` grows super-linearly with session length (139k@d30 → 512k@d60 median). Leaderboard rewards patience, not skill.                                   | Rework score for the bounded run: score = **net worth at audit/retire/death** + survival bonus capped at day 12; keep `peakNW` as a stat, not the score. One function change (economy.ts:41) + test updates.                                     | game-balancing: balance for the median 10-min session; kill the time-in-seat exploit before any leaderboard culture forms.                                              |   S    |
| E0-3 | Zero persistence: no PB, no history, no attempt labeling. Reload = silent wipe (twice during testing) _and_ unlimited covert retries — shared scores aren't credible.             | **localStorage persistence pack**: per-day best + all-time PB; attempts counter; label attempt 1 **"The Daily"**, later runs **"Practice"**; soft "days flown" counter (no loss penalty, no guilt copy). Spec in §4.2.                           | gamification-loops: investment phase loads tomorrow's trigger; PB-centric beats demotivating global ladders; honest retry labeling is the ethical fix for scum-sharing. |   M    |
| E0-4 | The loan is a doomsday clock with an off switch: 4%/3d is out-earned by day 3 and payable to 0 by ~day 14 (run 1). After that, literally nothing threatens a competent player.    | **Loan escalation**: interest rate steps up over the 12-day run (e.g. 4% → 6% → 8% at days 5/9), lender gets a name and voice ("The Syndicate compounds: +63cr… it grows impatient"). Debt payoff before day 12 becomes a real strategic choice. | game-balancing: cheapest tension restoration (one constant → schedule); narrative-design: fiction and difficulty curve become one feature.                              |   S    |

### P1 — The hooks: reasons to jump again, run again, return tomorrow

| #    | Insight & evidence                                                                                                                                                                                                         | Proposed feature                                                                                                                                                                                                                                                                                            | Why it works                                                                                                                                                 | Effort |
| :--- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- | :----: |
| E1-1 | You jump blind: destination prices invisible, so routing is memory + dice (gambler bought lux @792, sold into 373; contract-runner's parts spread collapsed 55→87 unseen). Anticipation needs a hypothesis to test.        | **Today's Trade Bulletin**: 2–3 seeded rumor lines on launch and at dock ("Luxury glut at The Verge · Ice convoy delayed — Vulcan pays for water"), derived from today's actual price extremes. Everyone sees the same bulletin. Spec in §4.3.                                                              | game-design-core: turns jumps into hypothesis tests (anticipation→reveal); narrative-design: flavor + information design + daily personality in one feature. |   M    |
| E1-2 | Share loop is broken: must die to share; raw seed int; no URL; unbounded score unrankable; retries unlabeled. The share _is_ the entire viral plan (design spec §4).                                                       | **Share card v2**: "🚀 Starlight #N · Jul 19 · Daily: 2,140 ⬩ survived 12 days" + **emoji run-strip** (one glyph/day: 🟦 haul 🟨 contract 🟥 pirates 💰 big trade 💀) + cause line + game URL. Available from retire _and_ death. Drop the raw seed integer.                                                | growth-loops: the strip is the spoiler-free story artifact (the grid IS the ad); date-branding syncs the audience on today's puzzle.                         |   M    |
| E1-3 | Death/end screen is a dead end: no cause, no breakdown, no comparison, no next step ("RUN OVER. You survived 13 days. Score: 524").                                                                                        | **Run debrief screen**: cause of death (or "Retired"/"Audited"), score breakdown (net worth + survival bonus), PB delta ("▲ +300 vs your best"), best trade of the run, and one "left on the table" tease (the richest contract you never took, from today's boards).                                       | game-ui-design: the end screen is the next-run decision surface; gamification: PB-relative feedback is the ethical ladder.                                   |   M    |
| E1-4 | Event choices carry no stakes/odds and hide degenerate math: pay-vs-flee is solved (flee wins), derelict is deterministic parity (game.ts:263), "0%" routes hide a 10% pirate floor (events.ts:16). Extends **UIUX P0-1**. | **Honest events pass**: show stakes and odds on choice buttons ("Pay ~260cr" / "Flee: 15–24 hull"); replace derelict parity with seeded 50/50 shown as such; make pay-vs-flee a real trade (pay = cheap % of credits, protects cargo; flee risks hull _and_ a cargo spill); display true event % per route. | game-design-core: incomplete information beats hidden formulas — gambles must be priceable to be decisions; transparency doubles as a balance-bug detector.  |   M    |
| E1-5 | After the loan is beaten there is no escalating threat; late run is flat (run 1, days 6–17: six quiet jumps, zero risk). The spec promised "escalating pressure".                                                          | **Heat**: pirate probability floor rises with peak net worth (e.g. +1% per 1,500cr, capped +15%) and shows on the map as rising danger %. Rich ships get hunted; days 10–12 become a push-your-luck finale.                                                                                                 | game-balancing: the progressive sink the spec wanted; level-design: readable escalation = the run's intensity curve.                                         |   M    |

### P2 — Systems depth: kill the degenerate strategies, deepen the map

| #    | Insight & evidence                                                                                                                                                                                                                  | Proposed feature                                                                                                                                                                                                                                                                           | Why it works                                                                                                                                                 | Effort |
| :--- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- | :----: |
| E2-1 | The water corridor is profitable _by construction_ (produce ×0.7 vs demand ×1.4 swamps ±15% noise, world.ts:97) → infinite turtle. Any nerf to the spread would hurt onboarding.                                                    | **Market depth**: each station trades only ~15–20 units per commodity per day at the listed price; further sales degrade the price that day. Repeating one route exhausts it; the spread itself stays untouched for the first hold-load.                                                   | gameplay-mechanics: adds the missing market-impact loop; keeps the tutorial valley intact while making monoculture decay. Verify ≥2 viable loops/day in sim. |  M–L   |
| E2-2 | Contracts are free options with a riskless exploit: no deposit, no expiry penalty, and buy-at-destination instant settlement pays 1.3–1.7× spot (missions.ts:17, game.ts:141). Junk 123cr offers share boards with 11,289cr whales. | **Contract integrity pass**: 10% deposit on accept (refunded + reward on delivery, lost on expiry); expiry noted on the debrief; reward floor so no offer pays under ~1.2× its cargo cost; same-station instant settles pay spot-margin only. Extends **UIUX P2-3** (feasibility display). | gameplay-mechanics: closes all three contract degeneracies while keeping contracts the "safe faucet"; deadline pressure becomes real.                        |   M    |
| E2-3 | Danger is destination-only (events.ts:12), so routing around danger is impossible by construction — no path decisions exist; the Navigator is a menu, not a map. The spec's Star Map never shipped.                                 | **Star map + per-edge danger**: spatial layout with edge lines labeled fuel/danger from a 10-entry edge table ("Meridian direct 20% vs via Terra +6⛽ at 5%"); Meridian rendered as the glittering weenie; heat (E1-5) reddens the map over days.                                          | level-design: restores path-planning as a decision class; makes the safe-west/rich-east geometry readable at a glance.                                       |   L    |
| E2-4 | The fiction is one sentence; stations are stat blocks, events are labeled dice rolls, death is a shrug. The mechanics already imply a world (0% tax lawless port; 18% + customs core world) that nothing voices.                    | **Fiction pack** (template strings only): 5 one-line station dossiers that each teach a mechanic; named lender; 3–4 seeded text variants per event with a named daily pirate crew (everyone meets "the Red Kestrel" today); 6 cause-of-death epilogues.                                    | narrative-design: ludonarrative harmony is sitting un-cashed; shared daily villains weaponize determinism for social chatter.                                |   M    |
| E2-5 | Nothing accrues across days even after E0-3: no reason to open the game on a bad day, nothing to collect.                                                                                                                           | **Achievements-lite + calendar**: ~12 local feats ("Three deliveries in one run", "Debt-free by day 8", "Survived the Verge at hull <20"), a days-flown calendar with per-day scores. No rewards, just named recognition + share lines.                                                    | gamification-loops: identity accrual ("I'm a Starlight regular") without dark patterns; serves Achievers/Explorers cheaply.                                  |   M    |

### P3 — Content variety & texture

| #    | Insight & evidence                                                                                                                                                                      | Proposed feature                                                                                                                                                                              | Why it works                                                                                                             | Effort |
| :--- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------- | :----: |
| E3-1 | Every day plays the same _kind_ of day; nothing gives a day a nameable personality beyond price noise.                                                                                  | **Daily modifiers**: one seeded modifier per day, named in the bulletin ("Ion storms — all jumps +1⛽", "Luxury boom at Meridian", "Pirate amnesty — no ambushes, no salvage").               | growth-loops/gamification: gives players something to _talk about_ per day (Wordle's "hard one today"); trivial to seed. |   M    |
| E3-2 | Kiruna↔Verge (7⛽) and Kiruna↔Meridian (8⛽) are dead edges — never economically flown in 4 runs. 2 of 10 edges are wasted content.                                                     | **Long-haul incentive**: 7–8⛽ legs get richer event tables (double salvage odds) and occasional seeded "ice run" contracts (Verge water demand spike).                                       | level-design: no dead space; every edge earns its place.                                                                 |  S–M   |
| E3-3 | Six events, five of which offer no real decision once the math is known; engine trouble is a single-button toll. Event variety is also silently reduced by a hash bug (see Bugs below). | **Seventh event: Distress Call** — spend 2 fuel + a day of deadline pressure to answer; seeded 60/40 between a grateful trader (reward/cargo) and nothing. Odds shown, per E1-4 honesty rule. | game-design-core: one genuinely values-driven choice (greed vs time vs decency) does more than three more coin flips.    |   M    |
| E3-4 | Salvage is strictly free money on an empty hold (run 1 D8, run 2 D6); the "trap when greedy" the design doc promised doesn't exist.                                                     | Salvage sometimes (seeded, shown ~25%) attracts a pirate tail next jump ("that debris was bait") — collect becomes a real gamble when rich, stays free-ish when broke.                        | game-balancing: risk scaling with wealth; keeps the desperation faucet, prices the greed.                                |   S    |

### Bugs & honesty fixes (small, separate from the design items)

| #   | Issue                                                                                                                                                                                                                                                                                                                                                                             | Fix                                                                                                                                                                                                    | Effort |
| :-- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----: |
| B-1 | **Fixed —** Refuel button lies when clamped: label "+5 (40cr)" but buys `min(units, room, affordable)` — observed "Refueled 4 for 32cr" at 37cr. The hidden partial refuel is a stranding lifeline nobody is told about (game.ts:92). Extends **UIUX P0-2**. Label now computes the clamped amount, so the button reads "Refuel +4 (32cr) — all you can afford" before the click. | Label shows what will actually happen ("Refuel +4 (32cr) — all you can afford").                                                                                                                       |   S    |
| B-2 | Event hash uses `charCodeAt(0)` of station ids — `vulcan`/`verge` alias to 'v', collapsing event variety between them (events.ts:11).                                                                                                                                                                                                                                             | Hash full ids (e.g. `hashSeed(seed, day, ...from].charCodeAt(1)…` or a station index).                                                                                                                 |   S    |
| B-3 | **Fixed —** Credits go negative via docking fees with no comment (−10cr, −33cr observed; game.ts:209). Negative credits are now styled as a warning state; not clamped — the value renders in the warning color in both the statbar chip and the logistics Credits row instead of being clamped to 0.                                                                             | Either clamp at 0 with a "waived, the Syndicate notes it" log line, or style negative credits as an explicit warning state.                                                                            |   S    |
| B-4 | Rapid buy/sell clicks are swallowed by the full-DOM re-render — 28 of 30 clicks lost in testing. Root cause documented as **UIUX P1-1** (qty buttons + DOM patching); recorded here as evidence of severity.                                                                                                                                                                      | **Resolved behaviorally (2026-07-20)** by UIUX P1-1's Buy 1/×5 + Sell 1/×5 + shortfall buttons — rapid clicking is no longer required. Root cause (full-DOM re-render) stays open as the P1-1 stretch. |   —    |
| B-5 | README claims "Luxury attracts both pirates and customs" — no such cargo modifier exists in the engine (rollEvent reads only destination danger).                                                                                                                                                                                                                                 | Either implement it (fits E1-5 heat) or fix the README.                                                                                                                                                |   S    |
| B-6 | Hull is consequence-free: `checkLoss` tests only fuel/credits (game.ts), `netWorth` has no hull term (economy.ts), and every damage site clamps at `Math.max(0, …)`. The Friction & Framing PR advertises "−N hull" as the stake on salvage/engine/derelict/flee choices, so a player who learns hull is cosmetic stops paying the 6cr/pt repair and every advertised hull gamble becomes free — inverting the risk/reward framing those stakes promise. Inertness is pre-existing; the honest stakes are what turn it into a visible economy hole. | Give hull 0 a real consequence and sequence it alongside **E0-1/E0-2** so a bounded run has an end to attach a hull-death (or a repair-gated penalty) to. Keep it a clean loss/penalty, not the rejected "hull reduces cargo capacity" pile-on (§ non-goals). |   M    |

## 4. Top-3 detailed specs

### 4.1 E0-1 — The Daily Audit (bounded runs + retire)

**Problem.** Runs are unbounded; the run→score→restart loop never fires for competent
players (sim: 100% of balanced runs alive at day 60).

**Design.** The daily run lasts at most **12 in-game days**. On arrival that lands on
day 12, the run ends in a new `status: "audited"` state: the Syndicate audit banks
`score` and shows the debrief. At any dock, a **Retire** button ends the run
voluntarily with the same scoring path. Death (stranded) is unchanged. The day counter
becomes "Day 4 / 12" everywhere it appears.

**Acceptance criteria**

- [ ] `GameState.status` gains `"audited" | "retired"`; `arrive()` triggers audit when `day >= 12`; a `retire(state)` engine function exists and is covered by tests.
- [ ] Score for audited/retired/lost runs uses the E0-2 formula; `peakNetWorth` still tracked and displayed as a stat.
- [ ] Station screen shows a Retire button (confirm dialog; disabled during pending event); day counter reads "Day N/12".
- [ ] Sim harness respects the bound (no `maxDays` cap above 12 needed); updated balance tests assert: median sim run ends by day 12, ≥95% of cautious/balanced runs reach the audit alive, and greedy death rate before day 12 is between 10–40%.
- [ ] Share/debrief reachable from all three end states; no path exists where a run continues past day 12.

### 4.2 E0-3 — Persistence pack (localStorage)

**Problem.** Nothing survives a reload or a day change: no PB, no attempt labeling, no
identity. The daily-habit thesis has no mechanism, and covert retries make shared
scores incomparable.

**Design.** A single versioned localStorage document, written on run end (audit,
retire, death) and read at boot:
`{ version, days: { "2026-07-19": { attempts, bestScore, bestOutcome, firstTryScore } }, allTimePB, daysFlownCount, feats?: [] }`.
Attempt 1 of a calendar day is labeled **The Daily**; subsequent runs **Practice**.
The header shows "Starlight #N — Jul 19 · Daily" (run number = days since epoch date of
launch). No accounts, no server, no telemetry.

**Acceptance criteria**

- [ ] Reloading mid-run still starts a fresh run (unchanged), but the boot screen shows today's attempts + best so far and all-time PB.
- [ ] First run of a UTC day is labeled "The Daily" in header, debrief, and share card; practice runs labeled "Practice" in all three.
- [ ] Debrief shows PB delta ("▲ +300 vs your best") for the relevant scope (daily vs practice).
- [ ] Storage failures (private mode) degrade silently to current behavior.
- [ ] A "days flown" counter increments at most once per UTC day; no negative/guilt copy anywhere when a day is missed (copy review is part of the AC).

### 4.3 E1-1 — Today's Trade Bulletin

**Problem.** All prices are invisible except at the current dock, so routing decisions
are unpriceable (evidence: 792→373 luxury ambush; 55→87 parts collapse). The game also
has no daily personality and no fictional voice.

**Design.** A deterministic function derives 2–3 rumor lines from today's actual
day-1 price grid: the single cheapest produce-discount ("Ice glut — Kiruna water
14cr"), the single richest demand premium ("Meridian pays 861 for luxury"), and one
warning derived from the day's modifier or highest-danger route. Shown on the intro
panel and collapsible at every dock; identical for all players; phrased as rumors
("word on the docks…") — prices beyond day 1 still drift, so the bulletin is a lead,
not an oracle.

**Acceptance criteria**

- [ ] Bulletin lines derive only from `(seed)` via existing `getPrice` — no new RNG streams; same lines for everyone on a given date; unit test asserts determinism and that named prices match day-1 `getPrice` values.
- [ ] Rendered on the launch/intro surface and at dock (collapsed by default after day 1); no layout shift in the cockpit (respects UIUX P0-1 space).
- [ ] At least one line always references a tradable opportunity that is actually profitable on day 1 (test-asserted), so the first-90-seconds player has a stated first move.
- [ ] Copy is fiction-flavored ("word on the docks") and ≤70 chars/line.

## 5. Quick wins (≤2h each)

1. **Folded into E0-1/E0-2 — E0-2 score cap** (if shipped before E0-1): clamp the day
   bonus at day 12 — one line in economy.ts:42 + test updates. Stops the
   grind-leaderboard before it exists. Deliberately not shipped as a stopgap so score
   semantics change once, not twice (2026-07-20 prioritization).
2. **Shipped (2026-07-20) — Goal line + day identity**: intro log line becomes "The
   Syndicate staked your ship — 1,500cr, compounding. Score = your peak fortune.
   Everyone flies today's sky."; header gains "Starlight · <current UTC date>"
   (e.g. "Jul 20"), formatted dynamically in share.ts. Extends UIUX P2-4's
   visible-score idea.
3. **Shipped (2026-07-20) — Cause-of-death line** on the end screen from the existing
   loss log ("Stranded at Vulcan Yards — out of fuel, out of credits."). Foundation
   for E1-3.
4. **Shipped (2026-07-20) — Share card date + URL**: replace "Seed #1482862887" with
   "Starlight · <current UTC date>" (e.g. "Jul 20") and append the game URL.
   (Full v2 card is E1-2.)

## 6. Suggested iteration order

1. **Quick wins 1–4** — one afternoon, no dependencies.
2. **E0-1 Daily Audit** (+ E0-2 final scoring) — the identity fix everything else
   builds on.
3. **E0-3 Persistence pack** — needs E0-1's end states to know what to record.
4. **E0-4 Loan escalation** — independent; lands the named lender used by E2-4.
5. **E1-2 Share card v2** — needs E0-1 (bounded score) + E0-3 (Daily/Practice label);
   emoji strip needs per-day event summaries added to state.
6. **E1-3 Run debrief** — builds on E0-3 (PB delta) and quick-win 4.
7. **E1-1 Trade Bulletin** — independent; unlocks informed routing before deeper
   balance changes.
8. **E1-4 Honest events pass** — with UIUX P0-1 (same surfaces).
9. **E1-5 Heat** — after E1-4 so displayed odds include it honestly.
10. **E2-2 Contract integrity** — with UIUX P2-3.
11. **E2-1 Market depth** — biggest balance change last among systems; re-run the
    sweep and tighten balance tests (current suite would pass a 29/30-turtle world).
12. **E2-4 Fiction pack → E2-3 Star map → E2-5 achievements → P3 items** — texture
    after structure.

## 7. Rejected ideas

- **Server leaderboards / accounts** — violates the no-server simplicity and isn't
  needed: PB + honest share cards deliver comparison serverless. Revisit only if the
  community outgrows group-chat comparison.
- **Any monetization mechanic** — PolyForm Noncommercial; also out of brief scope.
- **Ship upgrades / second ship / fleet** — spec's own YAGNI list; would dilute the
  10-minute identity before the core loop is fixed.
- **Insurance contracts** (premium vs pirate losses) — good sink, but overlaps E1-4's
  pay-tribute rework; two prices for the same risk is redundant complexity.
- **Hull damage reducing cargo capacity** — punishes the already-losing player
  (negative feedback on the victim); tension should come from heat, not pile-ons.
- **Per-station fuel prices** — more spreadsheet, no new decision class; fuel is
  deliberately a background cost.
- **Hard streaks with loss penalties / FOMO copy ("you missed yesterday!")** —
  explicitly unethical per the gamification lens and the brief.
- **Combat "fight" option for pirates** — the design doc mentions it, but a combat
  subsystem is a new game; the pay/flee rework (E1-4) delivers the decision without it.
- **Weekly meta-goals / battle-pass-like tracks** — obligation mechanics; the daily
  seed is the cadence, adding a second cadence dilutes it.
- **Player-named ship** — charming but adds no decision or return trigger; fiction
  pack (E2-4) delivers identity cheaper.
- **Ghost-ship rare community event** — great chatter potential, needs content
  pipeline; fold the idea into E3-1 daily modifiers instead.
