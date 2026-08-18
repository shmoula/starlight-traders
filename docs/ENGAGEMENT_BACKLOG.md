# Starlight Traders — Engagement Backlog

Findings from the game-design & retention playtest (2026-07-19), ordered by priority.
This complements [BACKLOG.md](BACKLOG.md) (UI/UX friction) — items here are about _game
design, retention, and meaning_; where they touch UI/UX items they cross-reference them
(e.g. "extends UIUX P0-1"). Effort: **S** ≈ ≤2h, **M** ≈ half-day, **L** ≈ ~1 day+.

> **Triage 2026-07-21** — see [ROADMAP.md](ROADMAP.md) for the sequenced plan.
> Committed to the **bounded daily run (E0)** pivot.
>
> - ✅ **Committed:** E0-1, E0-2, E0-3, E0-4 (M1) · E1-1, E1-2, E1-3, E1-4 (M2) ·
>   E2-1, E2-2, E2-3, E2-4, E2-5 (M3) · E3-1, E3-2, E3-4, E1-5 (M4) · E3-3, E3-5,
>   E2-2k (M5) · B-2, B-5, B-6.
> - ⚪ **Left in backlog:** nothing — E3-3 shipped 2026-08-18 with M5 round 1.
> - Sequencing notes: E0-2 bundled with E0-1; B-6 rides with M1; B-2 with E1-4;
>   E2-1 goes **last** and is sim-gated (re-run the 100-seed sweep).

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

| #    | Insight & evidence                                                                                                                                                                                                                                                 | Proposed feature                                                                                                                                                                                                                                                                                                                                                                                                                                          | Why it works                                                                                                                                                                                                                                                                                                                                                                                                  | Effort |
| :--- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----: |
| E1-1 | **Shipped 2026-07-31 as the exchange ticker.** You jump blind: destination prices invisible, so routing is memory + dice (gambler bought lux @792, sold into 373; contract-runner's parts spread collapsed 55→87 unseen). Anticipation needs a hypothesis to test. | **Today's Trade Bulletin**: 2–3 seeded rumor lines on launch and at dock ("Luxury glut at The Verge · Ice convoy delayed — Vulcan pays for water"), derived from today's actual price extremes. Everyone sees the same bulletin. Spec in §4.3.                                                                                                                                                                                                            | game-design-core: turns jumps into hypothesis tests (anticipation→reveal); narrative-design: flavor + information design + daily personality in one feature.                                                                                                                                                                                                                                                  |   M    |
| E1-2 | Share loop is broken: must die to share; raw seed int; no URL; unbounded score unrankable; retries unlabeled. The share _is_ the entire viral plan (design spec §4).                                                                                               | **Share card v2**: "🚀 Starlight #N · Jul 19 · Daily: 2,140 ⬩ survived 12 days" + **emoji run-strip** (one glyph/day: 🟦 haul 🟨 contract 🟥 pirates 💰 big trade 💀) + cause line + game URL. Available from retire _and_ death. Drop the raw seed integer.                                                                                                                                                                                              | growth-loops: the strip is the spoiler-free story artifact (the grid IS the ad); date-branding syncs the audience on today's puzzle.                                                                                                                                                                                                                                                                          |   M    |
| E1-3 | Death/end screen is a dead end: no cause, no breakdown, no comparison, no next step ("RUN OVER. You survived 13 days. Score: 524").                                                                                                                                | **Run debrief screen**: cause of death (or "Retired"/"Audited"), score breakdown (net worth + survival bonus), PB delta ("▲ +300 vs your best"), best trade of the run, and one "left on the table" tease (the richest contract you never took, from today's boards).                                                                                                                                                                                     | game-ui-design: the end screen is the next-run decision surface; gamification: PB-relative feedback is the ethical ladder.                                                                                                                                                                                                                                                                                    |   M    |
| E1-4 | **Shipped 2026-07-31.** Event choices carry no stakes/odds and hide degenerate math: pay-vs-flee is solved (flee wins), derelict is deterministic parity (game.ts:263), "0%" routes hide a 10% pirate floor (events.ts:16). Extends **UIUX P0-1**.                 | **Honest events pass**: show stakes and odds on choice buttons ("Pay ~260cr" / "Flee: 15–24 hull"); replace derelict parity with seeded 50/50 shown as such; make pay-vs-flee a real trade (pay = cheap % of credits, protects cargo; flee risks hull _and_ a cargo spill); display true event % per route.                                                                                                                                               | game-design-core: incomplete information beats hidden formulas — gambles must be priceable to be decisions; transparency doubles as a balance-bug detector.                                                                                                                                                                                                                                                   |   M    |
| E1-5 | After the loan is beaten there is no escalating threat; late run is flat (run 1, days 6–17: six quiet jumps, zero risk). The spec promised "escalating pressure".                                                                                                  | ✅ **Shipped 2026-08-17** (M4 round 2). **Heat**: pirate danger floor and toll both scale off `peakNetWorth`/net worth (`heatOf`, `JumpRisk` threaded through `effectiveDanger`/`rollEvent`), capped at +15%, with a Syndicate voice line narrating each threshold crossing; heat + scaled toll make the last three days the hardest. Final knobs at plan defaults: HEAT_PER_CR=1500, HEAT_STEP=0.01, HEAT_CAP=0.15, TOLL_RATE=0.1, HEAT_VOICE_STEP=0.05. | game-balancing: the progressive sink the spec wanted; level-design: readable escalation = the run's intensity curve. **Verified:** gate ruled met on a survival+heat-conditioned danger lift (runs with day ≥9 and peak ≥ HEAT_PER_CR) — balanced +0.0272, greedy +0.0305, against a 0.02 floor. Greedy deaths 35/100 (10–40 band); the cautious anchor stayed unmoved at −189,973 (no heat, no scaled toll). |   M    |

### P2 — Systems depth: kill the degenerate strategies, deepen the map

| #    | Insight & evidence                                                                                                                                                                                                                  | Proposed feature                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Why it works                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Effort |
| :--- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----: |
| E2-1 | The water corridor is profitable _by construction_ (produce ×0.7 vs demand ×1.4 swamps ±15% noise, world.ts:97) → infinite turtle. Any nerf to the spread would hurt onboarding.                                                    | ✅ **Shipped 2026-08-11.** **Market depth**: each station trades a limited volume per commodity per day at the listed price; further sales degrade the price that day, resetting the next. Final knobs: MARKET_DEPTH=20, DEPTH_SLOPE=0.08, DEPTH_FLOOR=0.6 (the draft's 15/0.03/0.4 broke the ≥95% cautious-survival gate).                                                                                                                                                                                               | gameplay-mechanics: adds the missing market-impact loop. **Verified:** sweep vs the committed pre-depth baseline shows decayed monoculture — balanced net worth −22.5%, greedy −17.7%. Cautious net worth decays only ~6k (−196,934 vs baseline −190,880) since that turtle ends near −debt (net worth is debt-dominated; stranding confounds it), so its gate was set to −5,000 by human design decision, not −15,000. viable-loops gate (≥2 profitable first-hold loops/day) holds for all 100 seeds × days 1–11, minimum observed 9 — the map held. |  M–L   |
| E2-2 | Contracts are free options with a riskless exploit: no deposit, no expiry penalty, and buy-at-destination instant settlement pays 1.3–1.7× spot (missions.ts:17, game.ts:141). Junk 123cr offers share boards with 11,289cr whales. | ✅ **Shipped 2026-08-02** (with UIUX P2-3). 10% deposit escrowed on accept, returned with the reward on delivery, forfeited into the debrief's contracts row on expiry; reward floor at 1.2× the offering station's own cargo cost; settlement is proportional — only hauled units earn the premium, units bought at the destination pay local spot, so the instant settle is a wash. Snapshot bumped to v3 with a v2 migration.                                                                                          | gameplay-mechanics: closes all three contract degeneracies while keeping contracts the "safe faucet"; deadline pressure becomes real. **Verified:** 0 of 2,406 generated offers profit from the instant-settle line; the 300-run sim sweep is byte-identical, so balance is untouched.                                                                                                                                                                                                                                                                 |   M    |
| E2-3 | Danger is destination-only (events.ts:12), so routing around danger is impossible by construction — no path decisions exist; the Navigator is a menu, not a map. The spec's Star Map never shipped.                                 | ✅ **Shipped 2026-08-07.** **Star map + per-edge danger**: spatial layout with edge lines labeled fuel/danger from a 10-entry edge table ("Meridian direct 20% vs via Terra +6⛽ at 5%"); Meridian rendered as the glittering weenie; heat (E1-5) reddens the map over days.                                                                                                                                                                                                                                              | level-design: restores path-planning as a decision class; makes the safe-west/rich-east geometry readable at a glance.                                                                                                                                                                                                                                                                                                                                                                                                                                 |   L    |
| E2-4 | The fiction is one sentence; stations are stat blocks, events are labeled dice rolls, death is a shrug. The mechanics already imply a world (0% tax lawless port; 18% + customs core world) that nothing voices.                    | ✅ **Shipped 2026-08-04.** **Fiction pack** (template strings only): 5 one-line station dossiers that each teach a mechanic; named lender; 3–4 seeded text variants per event with a named daily pirate crew (everyone meets "the Red Kestrel" today); 6 cause-of-death epilogues.                                                                                                                                                                                                                                        | narrative-design: ludonarrative harmony is sitting un-cashed; shared daily villains weaponize determinism for social chatter.                                                                                                                                                                                                                                                                                                                                                                                                                          |   M    |
| E2-5 | Nothing accrues across days even after E0-3: no reason to open the game on a bad day, nothing to collect.                                                                                                                           | ✅ **Shipped 2026-08-10.** **Achievements-lite + calendar**: 12 local feats (10 pure run-end predicates + 2 cross-run ledger feats), earnable on any run, with a HIGH_ROLLER threshold set from the sweep's banked-score p90; a 4-week days-flown Logbook calendar on the day-1 station screen; unlock lines on the run-end screen and one line on the share card. No rewards, just named recognition. Save doc bumped to v2; run snapshot to v4 so moment feats survive a same-day resume. 300-run sweep byte-identical. | gamification-loops: identity accrual ("I'm a Starlight regular") without dark patterns; serves Achievers/Explorers cheaply.                                                                                                                                                                                                                                                                                                                                                                                                                            |   M    |

#### Follow-ups raised by the E2-2 round (2026-08-02)

Filed from that round's review rather than left in its plan, since the plan gets archived.

| #     | Insight & evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Proposed feature                                                                                                                                                                                                                                                               | Effort |
| :---- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----- |
| E2-2f | **Contract rewards are anchored to a stale price.** `reward` uses `getPrice(seed, **offer day**, destination, commodity)`, but the player buys at the destination a day or more later. High-volatility luxury lets that anchor go stale by hundreds of cr/unit. This is what keeps the 2-jump re-qualification line alive after E2-2d: buy at destination B, bounce B→C→B so `boughtHere` resets, deliver as hauled. Measured over 11,944 contracts it beats the best honest route outright in 16.1% (median +127cr, top +4,297cr), 2.7% per day, and 0.9% even against contract-free arbitrage with the same capital. Dominated on the mean (−4.5% of reward) and capital-hungry, so not urgent — but the mean was what made it look closed.                                                                                                                                                                                                                                                                                                                            | ✅ **Resolved 2026-08-11.** Rewards re-anchored from the offer-day spot price to the day-independent `baselinePrice`. Under the arbitrage comparator, bounce-vs-honest-arbitrage wins fell from **4 → 2** of ~6k contracts (gate ≤3).                                          | S      |
| E2-2g | **Hauled units go to the earliest-accepted contract, with no UI cue.** Settlement drains the shared hauled pool in `activeMissions` order, so accepting a whale before a minnow is strictly better when both want the same commodity — a real decision the player cannot see. Not a bug; an invisible rule.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | ✅ **Resolved 2026-08-10 (M3 round 4).** Settlement order surfaced with ①②③ badges on the active-contract cards, shown only when two or more active contracts contest the same commodity; the first reads "① settles first". Render-only — the accept-order rule is unchanged. | S      |
| E2-2h | **Fixed —** A dock-side action could strand you with no loss detected. `checkLoss` had one caller, inside `arrive`, and `jump` returns unchanged when fuel is short — so spending down at a station (a bond escrow, a repair) left every jump unaffordable with `status` still `playing`. The only exit was Retire, which pays a survival bonus, so stranding yourself that way scored _better_ than being stranded. Pre-existing class; E2-2a added an entry point that is irreversible by design. Fixed by prevention (2026-08-02): `canEscape` in economy.ts is the one definition of "can this run still leave", counting the hold as escape money as well as the purse, and `keepEscapable` refuses any spend that would break it — `buy`, `repair`, `acceptMission`, with `payDebt` clamping to `spendableCredits` instead. Stranding stays reachable involuntarily (dock fees, tolls, engine burn), which `arrive` → `checkLoss` still catches. Residue: a partial stack sale can shift liquidity ±1cr through `taxOnSale`'s rounding — see the ≤1cr quirk below. | Done. `sell` is deliberately unguarded: refusing a partial sale could itself lock a hold the player needs to liquidate.                                                                                                                                                        | S      |
| E2-2k | **A partial sale can shift the escape margin by 1cr.** `taxOnSale` rounds per sale, so selling `q` of `n` units and then the rest can net ±1cr against selling all `n` at once — the one path that can still cross E2-2h's escape line without a guard. Reachable only from a state sitting exactly on the fare, and self-heals on the next spend (`keepEscapable` ends a run that was already past the line on the way in). Same rounding class as M3 round 1's accepted ≤1cr split-settlement shift.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | ✅ **Resolved 2026-08-18.** Liquidation tax charges on the cumulative per-commodity gross (saleTax), so any partition of a stack telescopes to the single rounded charge.                                                                                                      | XS     |
| E2-2i | **Fixed —** `deliver()` did not update `peakNetWorth`. `arrive()` wraps settlement in `trackPeak`; `deliver()` did not, so a dockside delivery raised net worth without moving the run's high-water mark and the debrief under-reported it. Fixed 2026-08-03 by wrapping `deliver`'s return in `trackPeak`. No double-count: `arrive` calls `settleMissions` directly rather than routing through `deliver`, and the mark is upgrade-only (`nw > peakNetWorth`) regardless.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Done. Regression test in `tests/engine/game.test.ts` asserts the mark rises after a dockside delivery.                                                                                                                                                                         | XS     |
| E2-2j | **`biggestPayday` and the `bigTrade` day-highlight now include the player's own returned bond.** "Best haul" on a 5,000cr contract reads 5,500cr, and an 850cr contract can cross `BIG_TRADE_CR` on the refund alone. Spec-sanctioned (decision 1 uses the actual inflow) and arguably right, since the stat then matches the log line — but it inflates the share strip.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | ✅ **Resolved 2026-08-10 (M3 round 4).** `biggestPayday` and the bigTrade/💰 day-highlight now read the earned payout only (returned bond excluded); the credited amount and the log line keep the gross inflow ("deposit returned"). Stat and share strip no longer inflate.  | XS     |

### P3 — Content variety & texture

| #    | Insight & evidence                                                                                                                                                                                                                                                                                            | Proposed feature                                                                                                                                                                                                                                                                                                                                                                    | Why it works                                                                                                                                                    | Effort |
| :--- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----: |
| E3-1 | Every day plays the same _kind_ of day; nothing gives a day a nameable personality beyond price noise.                                                                                                                                                                                                        | ✅ **Shipped 2026-08-13.** **Daily modifiers**: one seeded modifier per daily seed (constant all run) from a 7-entry pool, channeled through fuelCost/getPrice/event-bands/interest and surfaced on the bulletin lead, screen-head chip, and share card. Ion storms shipped long-haul-only (+1⛽ on base ≥7⛽ lanes), not every jump, to clear the ≥90% per-modifier fairness gate. | growth-loops/gamification: gives players something to _talk about_ per day (Wordle's "hard one today"); trivial to seed.                                        |   M    |
| E3-2 | Kiruna↔Verge (7⛽) and Kiruna↔Meridian (8⛽) are dead edges — never economically flown in 4 runs. 2 of 10 edges are wasted content.                                                                                                                                                                           | ✅ **Shipped 2026-08-13.** **Long-haul incentive**: the two 7–8⛽ lanes (kiruna–verge, kiruna–meridian) double their salvage band and read "salvage-rich" in the Navigator; seeded ❄ ice-run contracts (water → Verge) append to Kiruna's board on a ~1-in-3 cadence from their own RNG stream, with a day-1 bulletin notice.                                                       | level-design: no dead space; every edge earns its place.                                                                                                        |  S–M   |
| E3-3 | Six events, five of which offer no real decision once the math is known; engine trouble is a single-button toll. Event variety is also silently reduced by a hash bug (see Bugs below).                                                                                                                       | ✅ **Shipped 2026-08-18.** **Seventh event: Distress Call** — answer costs 2⛽ + a real day for a seeded 60/40 reward priced on the beacon's day; band inserted after derelict so risk bands stay byte-identical. Odds shown per E1-4; grateful trader pays credits (never cargo).                                                                                                  | game-design-core: one genuinely values-driven choice (greed vs time vs decency) does more than three more coin flips.                                           |   M    |
| E3-4 | Salvage is strictly free money on an empty hold (run 1 D8, run 2 D6); the "trap when greedy" the design doc promised doesn't exist.                                                                                                                                                                           | ✅ **Shipped 2026-08-13.** A clean scoop is seeded 1-in-4 to be bait, latching a one-jump pirate tail (+0.35 ambush odds shown on the collect button, E1-4 rule) and announced immediately; the tail raises every displayed and rolled raid % by the same bonus and clears on the next jump. Persisted via snapshot v6.                                                             | game-balancing: risk scaling with wealth; keeps the desperation faucet, prices the greed.                                                                       |   S    |
| E3-5 | E1-2's run-strip is constrained by the clipboard: a shared card is plain text, so the glyphs must be emoji, and emoji are not uniform in width (💰/💀 are narrower than 🟦/🟥/🟨) or in style. Cell-boxing fixed the on-screen grid, but the pasted card stays ragged, and the palette can't be art-directed. | ✅ **Shipped 2026-08-18.** **Image share card**: the run card drawn to a 1200×630 PNG from a pure `cardOps` display-list painted by a dumb canvas replayer; image-first clipboard with the text card as the honest fallback + Save PNG everywhere.                                                                                                                                  | game-monetization/growth-loops: the shared artifact is the acquisition surface, so its craft compounds — but only once the loop it advertises is worth joining. |   L    |

### Bugs & honesty fixes (small, separate from the design items)

| #   | Issue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Fix                                                                                                                                                                                                                                                           | Effort |
| :-- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----: |
| B-1 | **Fixed —** Refuel button lies when clamped: label "+5 (40cr)" but buys `min(units, room, affordable)` — observed "Refueled 4 for 32cr" at 37cr. The hidden partial refuel is a stranding lifeline nobody is told about (game.ts:92). Extends **UIUX P0-2**. Label now computes the clamped amount, so the button reads "Refuel +4 (32cr) — all you can afford" before the click.                                                                                                                                                                                                                                                                                                                                                                                       | Label shows what will actually happen ("Refuel +4 (32cr) — all you can afford").                                                                                                                                                                              |   S    |
| B-2 | **Fixed 2026-07-31 —** Event hash uses `charCodeAt(0)` of station ids — `vulcan`/`verge` alias to 'v', collapsing event variety between them (events.ts:11).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Hash full ids (e.g. `hashSeed(seed, day, ...from].charCodeAt(1)…` or a station index).                                                                                                                                                                        |   S    |
| B-3 | **Fixed —** Credits go negative via docking fees with no comment (−10cr, −33cr observed; game.ts:209). Negative credits are now styled as a warning state; not clamped — the value renders in the warning color in both the statbar chip and the logistics Credits row instead of being clamped to 0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Either clamp at 0 with a "waived, the Syndicate notes it" log line, or style negative credits as an explicit warning state.                                                                                                                                   |   S    |
| B-4 | Rapid buy/sell clicks are swallowed by the full-DOM re-render — 28 of 30 clicks lost in testing. Root cause documented as **UIUX P1-1** (qty buttons + DOM patching); recorded here as evidence of severity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | **Resolved behaviorally (2026-07-20)** by UIUX P1-1's Buy 1/×5 + Sell 1/×5 + shortfall buttons — rapid clicking is no longer required. Root cause (full-DOM re-render) stays open as the P1-1 stretch.                                                        |   —    |
| B-5 | README claims "Luxury attracts both pirates and customs" — no such cargo modifier exists in the engine (rollEvent reads only per-lane danger).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Either implement it (fits E1-5 heat) or fix the README.                                                                                                                                                                                                       |   S    |
| B-6 | **Fixed —** Hull is consequence-free: `checkLoss` tests only fuel/credits (game.ts), `netWorth` has no hull term (economy.ts), and every damage site clamps at `Math.max(0, …)`. The Friction & Framing PR advertises "−N hull" as the stake on salvage/engine/derelict/flee choices, so a player who learns hull is cosmetic stops paying the 6cr/pt repair and every advertised hull gamble becomes free — inverting the risk/reward framing those stakes promise. Inertness is pre-existing; the honest stakes are what turn it into a visible economy hole. The clamps are gone and hull 0 now destroys the ship (`checkHullDeath` → `endRun`, cargo lost with it), sequenced with E0-1/E0-2 (2026-07-21); previews mark worst-case-lethal stakes with a ⚠ warning. | Give hull 0 a real consequence and sequence it alongside **E0-1/E0-2** so a bounded run has an end to attach a hull-death (or a repair-gated penalty) to. Keep it a clean loss/penalty, not the rejected "hull reduces cargo capacity" pile-on (§ non-goals). |   M    |

## 4. Top-3 detailed specs

### 4.1 E0-1 — The Daily Audit (bounded runs + retire)

> **Shipped 2026-07-21 — E0-1, E0-2, E0-4.** Bounded 12-day run with audit/retire/loss
> end states through `endRun()`, net-worth + capped survival-bonus scoring, and loan
> escalation with the Syndicate's voice all landed together. The 100-seed sweep asserts
> the death-rate bands below. E0-3 (persistence) shipped 2026-07-29 — see §4.2.

**Problem.** Runs are unbounded; the run→score→restart loop never fires for competent
players (sim: 100% of balanced runs alive at day 60).

**Design.** The daily run lasts at most **12 in-game days**. On arrival that lands on
day 12, the run ends in a new `status: "audited"` state: the Syndicate audit banks
`score` and shows the debrief. At any dock, a **Retire** button ends the run
voluntarily with the same scoring path. Death (stranded) is unchanged. The day counter
becomes "Day 4 / 12" everywhere it appears.

**Acceptance criteria**

- [x] `GameState.status` gains `"audited" | "retired"`; `arrive()` triggers audit when `day >= 12`; a `retire(state)` engine function exists and is covered by tests.
- [x] Score for audited/retired/lost runs uses the E0-2 formula; `peakNetWorth` still tracked and displayed as a stat.
- [x] Station screen shows a Retire button (confirm dialog; disabled during pending event); day counter reads "Day N/12".
- [x] Sim harness respects the bound (no `maxDays` cap above 12 needed); updated balance tests assert: median sim run ends by day 12, ≥95% of cautious/balanced runs reach the audit alive, and greedy death rate before day 12 is between 10–40%.
- [x] Share/debrief reachable from all three end states; no path exists where a run continues past day 12.

### 4.2 E0-3 — Persistence pack (localStorage)

> **Shipped 2026-07-29 — E0-3, E1-3.** The versioned save ledger (PB, attempts,
> Daily/Practice labeling) landed via the storage module's field-validated parse with
> silent degradation on read failure, and the run debrief screen (E1-3) shipped
> alongside it, consuming the ledger for PB-delta and "New personal best!" copy.

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

- [x] Reloading mid-run started a fresh run, and the boot screen shows today's attempts + best so far and all-time PB. **Superseded by E0-5 (§4.4):** a same-day reload now resumes the run instead — see the follow-up note below.
- [x] First run of a UTC day is labeled "The Daily" in header, debrief, and share card; practice runs labeled "Practice" in all three.
- [x] Debrief shows PB delta ("▲ +300 vs your best") for the relevant scope (daily vs practice).
- [x] Storage failures (private mode) degrade silently to current behavior.
- [x] A "days flown" counter increments at most once per UTC day; no negative/guilt copy anywhere when a day is missed (copy review is part of the AC).

> **Follow-up (E0-5, §4.4):** the "fresh run on mid-run reload" behavior above is
> deliberate save-scum safety, but an _accidental_ same-day refresh also loses
> in-progress progress. E0-5 resumes the in-progress run when its snapshot's UTC day
> matches today, and only starts fresh once the day has rolled over — snapshotting
> post-decision state so a refresh resumes rather than re-rolls.

### 4.3 E1-1 — Today's Trade Bulletin

> **Shipped 2026-07-31 — E1-1.** Delivered as the exchange ticker: static EXCH quotes
> plus a scrolling DOCK TALK bulletin surface seeded daily-price intel on the launch and
> dock surfaces, giving every player the same priceable read on today's market.

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

### 4.4 E0-5 — Resume an in-progress run on same-day refresh

> **Shipped 2026-07-30 — E0-5, E1-2.** The live-run snapshot lands under its own key
> (`starlight.run.v1`, separate from the E0-3 results ledger), written post-decision
> after every settled action so a refresh resumes into a pending in-transit event
> rather than re-rolling it, and is rejected at boot when its UTC day isn't today's or
> cleared outright once a run ends. Share card v2 (E1-2) ships alongside it: a
> four-line card — identity, score + end-cause, an emoji run-strip (one glyph per day
> survived, with 💀 derived from the run's end status to mark the final day of a lost
> run), and the URL. The 💰 big-trade threshold (`BIG_TRADE_CR`) was tuned to 900cr
> against a 100-seed sweep; the `balanced` archetype still lands a median of 4
> 💰-days against a 1–3 target, a gap that can't close further without exceeding the
> 912cr guaranteed floor of a 5-luxury-unit sale (past which an engine test becomes
> seed-dependent) — noted here rather than overstated as fully tuned.

**Problem.** E0-3 deliberately starts a fresh run on any mid-run reload (save-scum
safety). But an _accidental_ tab-close or refresh mid-run silently discards the
in-progress run — for a ~12-"day" session that's a real frustration and a retention
leak, and it's indistinguishable to the player from the deliberate wipe.

**Design.** Snapshot the live `GameState` to localStorage (its own key, separate from
the E0-3 results ledger), stamped with the run's UTC day. On boot: if a snapshot exists
and its UTC day equals today's, **rehydrate it** (resume the exact run); otherwise
discard it and start a fresh daily run. Clear the snapshot on run end (it's already
folded into the results ledger) and when starting a Practice run. Reuse E0-3's
silent-fail I/O wrapper and versioning; `GameState` is plain serializable data.

The one hard constraint: the snapshot must capture **post-decision** state (written
after an in-transit event is resolved, never before), so a refresh resumes where the
player was and can never re-roll a bad event outcome. This keeps E0-3 decision #2
(no save-scum vector) intact — resume ≠ retry.

**Acceptance criteria**

- [x] A refresh within the same UTC day resumes the in-progress run (day, location, credits, cargo, missions, log) rather than starting over.
- [x] A refresh after the UTC day has rolled over starts a fresh daily run and discards the stale snapshot.
- [x] Resuming cannot re-roll a resolved event (snapshot is post-decision); the E0-3 anti-scum guarantee holds.
- [x] The snapshot is cleared on run end and on starting a Practice run; a completed run still records exactly once (unchanged from E0-3).
- [x] Storage failures (private mode) degrade silently to today's fresh-run behavior.

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
9. **E1-5 Heat** — ✅ shipped 2026-08-17 with M4 round 2, after E1-4 so displayed
   odds include it honestly.
10. **E2-2 Contract integrity** — ✅ shipped 2026-08-02 with UIUX P2-3 (M3 round 1).
11. **E2-4 Fiction pack ✅ shipped 2026-08-04 → E2-3 Star map → E2-5 achievements** — texture next, and
    the map must land before E2-1 so market-depth sim gating measures real routes.
12. **E2-1 Market depth** — biggest balance change dead last in M3 (decided
    2026-08-01, matching ROADMAP.md): the star map changes route viability, so the
    100-seed sweep and "≥2 viable loops/day" gate only mean something after E2-3.
    Re-run the sweep and tighten balance tests (current suite would pass a
    29/30-turtle world). Bundle P2-2's remaining cost-basis/P&L half here.

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
