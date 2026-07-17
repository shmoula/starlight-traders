# Starlight Traders — Design Spec

**Date:** 2026-06-18
**Status:** Approved design, pending implementation plan
**Type:** Marketable MVP — playable browser game + marketing/community plan

---

## 1. Concept

**Starlight Traders** is a tense, replayable **roguelike trade-run** browser game. You
pilot a small cargo ship through a network of space stations, buying low and selling
high while a relentless economy drains your wallet. Every jump costs fuel; every dock
costs fees; pirates, taxes, and a ticking loan eat your margins. Run ends when you go
broke or get stranded. Score = peak net worth × days survived.

It is a faucet/sink economy made _fun_: the sinks aren't chores, they're threats.

- **Platform:** Single-page browser game (HTML/JS). Instantly shareable via link.
- **Business model:** Premium, one-time purchase. No pay-to-win — the economy is tuned honestly.
- **Audience:** Incremental / management-game players (r/incremental_games, indie/gamedev communities).
- **Session length:** ~10 minutes per run. One turn (jump) ≈ 20–40 seconds.

---

## 2. Core Loop & Economy

### The turn

One **turn = one jump**. At a station you:

1. **Sell** cargo at local prices.
2. **Buy** cargo and/or accept a delivery contract.
3. Optionally **repair** hull and **refuel**.
4. Pick a destination and **jump** (costs fuel scaled by distance).
5. In transit, a random **event** may fire.
6. Arrive, repeat.

### Faucets (income) — three distinct risk profiles

| Faucet                | Risk                    | Role                                                              |
| --------------------- | ----------------------- | ----------------------------------------------------------------- |
| **Delivery missions** | Safe, guaranteed payout | Locks cargo space + deadline                                      |
| **Market arbitrage**  | Skill-based             | Read price spreads, route accordingly — the core skill expression |
| **Salvage finds**     | High-variance gamble    | Great when desperate, a trap when greedy                          |

### Sinks (drains) — escalating pressure, not nagging

| Sink              | Behavior                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Fuel**          | Scales with jump distance — constant background drain, makes routing a cost/benefit call                                   |
| **Docking fees**  | Flat per station visit — punishes aimless churn                                                                            |
| **Planet taxes**  | Progressive % on high-value cargo/sales — drains the wealthy (skill's progressive-sink lever)                              |
| **Repairs**       | Event-driven (pirate damage, engine trouble) — turns a sink into a threat                                                  |
| **Loan interest** | Starting debt that **ticks up every few jumps** — a doomsday clock forcing forward momentum, preventing safe-loop turtling |

### Tuning principle

Net flow is **slightly negative by default**: a passive player slowly bleeds out, so
profit must be _actively_ earned. Validate with a per-run simulation across three
archetypes (cautious / balanced / greedy) before locking numbers — the game-balancing
skill's archetype table, applied per-run instead of per-hour.

### Loss & score

- **Loss:** Can't afford minimum fuel to move _and_ can't sell your way out → stranded → run over.
- **Score:** Peak net worth (credits + cargo value − debt) × days survived.

---

## 3. MVP Feature Scope

### The 5 nodes (network — routes emerge from connections)

| Node                  | Character                     | Cheap here    | Pays well for    | Danger              |
| --------------------- | ----------------------------- | ------------- | ---------------- | ------------------- |
| **Terra Hub** (start) | Safe, central, expensive fees | —             | —                | None                |
| **Kiruna Belt**       | Remote ice mines              | Water/Ice     | —                | None                |
| **Vulcan Yards**      | Industrial foundry            | Machine Parts | Water/Ice        | Low                 |
| **The Verge**         | Lawless free port             | —             | Luxury (high)    | High (pirates)      |
| **Meridian**          | Wealthy core world            | —             | Luxury (highest) | Customs + heavy tax |

Seeds obvious early arbitrage loops (Kiruna→Vulcan water, Vulcan→Verge parts) plus a
high-risk luxury run for veterans. Varying distances make fuel a routing puzzle.

### The 3 commodities (mapped to the three risk tiers)

| Commodity         | Value | Volatility | Notes                                        |
| ----------------- | ----- | ---------- | -------------------------------------------- |
| **Water/Ice**     | Low   | Stable     | Thin margin — the safety net                 |
| **Machine Parts** | Mid   | Mid        | Bread-and-butter trade                       |
| **Luxury Goods**  | High  | High       | Attracts pirates _and_ customs — risk/reward |

Prices = base × seeded daily noise, so each day's map plays differently.

### In-transit event table (weighted by route danger)

Pirates (pay / fight / flee → repair risk) · Salvage (free haul) · Derelict (gamble) ·
Customs check (lose luxury or fine — Meridian routes) · Engine trouble (fuel/repair
hit) · Quiet jump (nothing). Six events is enough texture for MVP.

### Screens

- **Station** — market, missions, repair/refuel, jump button
- **Star Map** — nodes, distances, fuel cost, danger rating
- **Event card** — modal choice
- **Run-End / Score** — score breakdown, daily seed, one-click share

### Ship

Hull HP + fuel capacity only. **No upgrade tree in MVP** (strong post-launch candidate).

### The shareability engine

A **daily seed** (deterministic RNG from the date) means everyone plays the _same_
map/prices/events that day → comparable scores → leaderboard → "I hit 84k on today's
seed, beat that" is the organic share hook.

### Explicitly OUT (YAGNI)

Multiplayer · ship-upgrade trees · crew/officers · story campaign · server accounts ·
audio beyond minimal SFX · more than 5 nodes.

---

## 4. Marketing & Community Plan

### Positioning (Geoffrey Moore template)

> For **incremental/management-game players** who **love the tense "one more turn" pull
> of risk-vs-reward economies**, **Starlight Traders** is a **daily roguelike
> trade-runner** that **turns a brutal faucet/sink economy into a 10-minute high-score
> chase**. Unlike **sprawling space sims (Elite, X4) or idle clickers**, it's
> **instant-play in the browser, fully fair (no pay-to-win), and a new shared puzzle
> every single day.**

### Growth loop (product-inherent virality)

The **daily seed** makes runs _comparable_, unlocking STEPPS share triggers naturally:
**Social Currency** ("top 3% today"), **Triggers** (daily ritual, like Wordle),
**Public** (auto-generated end-screen score card + one-click copy with the seed). Loop:

> play today's seed → get score card → post to brag/compare → others click the link →
> play the same seed → post theirs.

No referral bribes (those attract churners). The share _is_ the bragging right.

### Cold-start strategy

Saturate **one dense subnetwork first** — r/incremental_games + a small Discord —
before widening. These players evangelize economy games and give real balance feedback.

### Two-track timeline

**Build-in-public track (weeks 1–4, during development):** short devlogs on the
faucet/sink design problems ("how do you stop players turtling on safe trades?") to
r/gamedev, r/incremental_games, and an X/Bluesky thread. Builds an audience _before_
launch and recruits playtesters.

**Launch track:**

- **T-2 wk:** Playable beta to Discord + r/incremental_games "Feedback Friday." Collect balance data (doubles as playtest data-gathering).
- **T-0:** Launch on **itch.io** + "Show: I made a daily roguelike trade game" to r/incremental_games and r/WebGames + devlog finale thread. (itch.io over Product Hunt — that's where this audience is.)
- **T+1 wk:** "Balance patch from your feedback" post — turns players into co-authors, deepening community.

### Success metrics (defined up front; leading → lagging)

| Metric                               | Target            | Type                                            |
| ------------------------------------ | ----------------- | ----------------------------------------------- |
| Day-1 plays                          | (set at beta)     | Leading                                         |
| D1 retention                         | ≥ 35%             | Leading (the daily-seed habit is the whole bet) |
| % of runs shared                     | track from launch | Leading                                         |
| Return-next-day rate                 | track             | Leading                                         |
| Wishlist / email signups for premium | track             | Lagging                                         |

---

## 5. Skills Applied

- **game-balancing** — faucet/sink economy, archetype simulation, progressive sinks, "balance for the median, gate for the tail."
- **game-design-core** — 30-second-fun core loop, "interesting decisions," respecting player time.
- **product-launch (GTM)** — positioning statement, channel strategy, defined success metrics.
- **viral-marketing** — STEPPS shareable-content model, product-inherent virality, cold-start subnetwork strategy, avoiding bribe-based referral anti-patterns.

---

## 6. Next Step

Implementation plan (via writing-plans skill): build the browser game vertical slice —
economy model first (validated by per-run archetype simulation), then the four screens,
then the daily-seed + share card. Marketing runs as a parallel track using the real
artifact as its fuel.
