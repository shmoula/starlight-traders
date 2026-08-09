# Starlight Traders

Starlight Traders is a browser-based, turn-based roguelike trade-run. You pilot a small cargo ship between five space stations, buying low and selling high while a relentless faucet/sink economy drains your wallet. Every jump burns fuel, every dock charges a fee, and a starting loan accrues interest in the background. A run lasts about ten minutes and ends when you go broke or get stranded.

Every day has a new seed, and the seed is derived from the date — so everyone plays the same map, the same prices, and the same events on the same day, which makes scores directly comparable.

## Gameplay Overview

- Dock at a station, sell what you're carrying, and buy cargo at local prices.
- Accept delivery contracts for a guaranteed payout, at the cost of cargo space and a deadline.
- Refuel and repair your hull before setting out.
- Pick a destination and jump — fuel burned scales with distance.
- A random event may fire in transit, weighted by how dangerous the route is.
- Arrive and repeat, until you can't afford to move.

## Key Features

- Turn-based jump loop with a deterministic daily seed, so runs are shareable and comparable.
- Five stations, each with its own docking fees, tax rate, and price profile, linked by lanes that each carry their own ambush risk.
- Three commodities spanning distinct risk tiers: Water/Ice (stable, thin margins), Machine Parts (mid), and Luxury Goods (volatile, high-value — the biggest paydays and the biggest swings).
- Six in-transit events — pirate ambush, salvage field, derelict hulk, customs inspection, engine trouble, and quiet jump — most offering a real choice.
- Three income sources with different risk profiles: delivery contracts, market arbitrage, and salvage.
- Escalating sinks: distance-scaled fuel, per-dock fees, progressive sale taxes, event-driven repairs, and compounding loan interest.
- One-click score card sharing that names the day and links the game.

## Tech Stack

- TypeScript 5 (no UI framework — direct DOM rendering)
- Vite 5
- Vitest 1
- ESLint + Prettier

## Getting Started

```bash
npm install
npm run dev
```

Open the local dev URL printed by Vite (typically `http://localhost:5173`).

## Common Scripts

- `npm run dev` — start the dev server
- `npm run build` — type-check and build for production
- `npm run preview` — preview the production build locally
- `npm test` — run the engine and balance test suite once
- `npm run test:watch` — run tests in watch mode
- `npm run test:coverage` — run tests with coverage
- `npm run lint` — run ESLint
- `npm run format` — format with Prettier
- `npm run format:check` — check formatting without writing

## How to Play

- You start with 800 credits, 1,500 in debt, 16/20 fuel, full hull, and 30 units of cargo space, docked at Terra Hub.
- Buy where a commodity is produced and sell where it's demanded — Kiruna Belt produces Water/Ice, Vulcan Yards produces Machine Parts and demands Water/Ice, The Verge and Meridian both pay a premium for Luxury Goods.
- Watch the tax rate before you sell. Meridian pays the most for luxury but taxes sales at 18%, and its routes draw customs inspections.
- Keep enough fuel in reserve to reach a station where you can sell. Running out of fuel with nothing worth selling ends the run.
- Your score is your net worth when the run ends. Bank the run by audit or retirement and you also earn a survival bonus per day survived, capped at day 12; a run that ends in death scores its net worth alone, with no survival bonus. Peak net worth is tracked as a stat, but it is not the score.

## The Daily Seed

The seed comes from the calendar date, so prices, events, and contracts are identical for every player on a given day. Your progress persists locally: a refresh on the same UTC day resumes your in-progress run exactly where it was, your personal best and attempt history live in `localStorage`, and once the UTC day rolls over a fresh daily begins. The first completed run of a day is "The Daily"; later runs are labeled "Practice".

## Project Structure

- `src/engine` — game rules, economy, world, events, missions, and seeded RNG
- `src/ui` — rendering, screens, and score-card sharing
- `src/sim` — balance simulation harness
- `tests` — engine and simulation test suites
- `docs` — design spec, implementation plan, and marketing notes

## Deploy (itch.io)

1. `npm run build`
2. Zip the contents of `dist/` (not the folder itself).
3. On itch.io: new project → Kind "HTML" → upload zip → check "This file will be played in the browser".
4. Set viewport to ~800×640 and enable the fullscreen button.

## Design

See [the design spec](docs/superpowers/specs/2026-06-18-starlight-traders-design.md) for the full concept, economy tuning principles, and marketing plan.

## License

PolyForm Noncommercial 1.0.0. Free to use, modify, and share for any noncommercial purpose; commercial use is not permitted. See [LICENSE](LICENSE).
