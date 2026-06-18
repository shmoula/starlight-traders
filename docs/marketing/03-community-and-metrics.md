# Starlight Traders — Community Setup & Metrics

---

## Discord server (the cold-start home base)

Keep it tiny and active, not big and dead. Minimal channel set:

| Channel | Purpose |
|---|---|
| `#welcome` | One message: what the game is + link + the daily-seed ritual explained |
| `#daily-seed` | The heartbeat. Pin "Today's seed — post your score card." You post first every day. |
| `#leaderboard` | Top scores (manual at first; a bot later). Social Currency engine. |
| `#feedback` | Balance complaints, bug reports. This is your playtest data pipeline. |
| `#devlog` | Cross-post your build-in-public updates here so members feel like insiders |
| `#strategy` | Players sharing route/arbitrage tactics — deepens engagement, creates "experts" |

**Founding-member move:** the first ~50 members are your evangelists. Give them a role
("Founding Trader"), credit them by name in patch notes, and actually implement their
balance feedback. Co-authorship = retention.

**Anti-patterns to avoid (from viral-marketing skill):**
- No bribe-based referral spam. The share *is* the daily score — don't bolt on "invite 3 friends for gems."
- Don't measure vanity reach. Track the full funnel below.

---

## Metrics — define before launch, review weekly

| Metric | Target | Why it matters | Source |
|---|---|---|---|
| Day-1 plays | set at beta baseline | Top-of-funnel reach | itch.io analytics / simple event ping |
| **D1 retention** | **≥ 35%** | The daily-seed habit is the entire bet — if they don't come back tomorrow, nothing else matters | returning-visitor / local-storage flag |
| % of runs shared | track from launch | Measures whether the loop self-propagates | "Copy score card" click event |
| Return-next-day rate | track, grow weekly | Confirms the ritual is forming | repeat plays on consecutive seeds |
| Wishlist / email signups | track | Lagging — demand for the premium version | landing form |
| Discord DAU / score-posts per day | grow weekly | Health of the dense subnetwork | Discord |

**Full funnel (don't track shares in isolation):**
`shares → link clicks → plays → returned next day → joined Discord`
A share that doesn't convert to a *returning* player is wasted distribution.

**Decision rules:**
- D1 retention < 25% → the core loop or first-run experience is the problem; fix before scaling any channel.
- Lots of plays, few shares → the end-of-run share moment isn't compelling enough; make the score card prettier / add "top X% today."
- Shares but no return → the daily-seed value isn't landing; lean harder on "the seed changes tomorrow" messaging.

---

## Lightweight instrumentation (non-dev-friendly)

You don't need a heavy analytics stack for MVP. Minimum viable:
1. itch.io's built-in views/plays.
2. A single anonymous event ping (e.g., a privacy-friendly tool like Plausible/Umami, or a
   counter endpoint) for: `run_started`, `run_ended`, `share_clicked`, plus a daily-unique flag.
3. A Google Sheet you fill weekly from those three numbers → that's your metrics review.

Keep it honest and simple; the goal is to know whether the daily habit is forming, not to
build a data warehouse.

---

## Skills behind this plan

- **product-launch (GTM)** — positioning statement, channel ranking, success metrics defined up front.
- **viral-marketing** — STEPPS shareable-content model, product-inherent virality (the daily seed), cold-start subnetwork strategy, avoiding bribe/spam referral anti-patterns, full-funnel measurement.
- **game-balancing** — the `#feedback` → archetype-sim → patch loop doubles as live balance validation.
