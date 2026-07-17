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
- Five stations, each with its own docking fees, tax rate, danger rating, and price profile.
- Three commodities spanning distinct risk tiers: Water/Ice (stable, thin margins), Machine Parts (mid), and Luxury Goods (volatile, and it attracts both pirates and customs).
- Six in-transit events — pirate ambush, salvage field, derelict hulk, customs inspection, engine trouble, and quiet jump — most offering a real choice.
- Three income sources with different risk profiles: delivery contracts, market arbitrage, and salvage.
- Escalating sinks: distance-scaled fuel, per-dock fees, progressive sale taxes, event-driven repairs, and compounding loan interest.
- One-click score card sharing with the daily seed.

## Tech Stack

- TypeScript 5 (no UI framework — direct DOM rendering)
- Vite 5
- Vitest 1

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

## How to Play

- You start with 800 credits, 1,500 in debt, 16/20 fuel, full hull, and 30 units of cargo space, docked at Terra Hub.
- Buy where a commodity is produced and sell where it's demanded — Kiruna Belt produces Water/Ice, Vulcan Yards produces Machine Parts and demands Water/Ice, The Verge and Meridian both pay a premium for Luxury Goods.
- Watch the tax rate before you sell. Meridian pays the most for luxury but taxes sales at 18%, and its routes draw customs inspections.
- Keep enough fuel in reserve to reach a station where you can sell. Running out of fuel with nothing worth selling ends the run.
- Your score is peak net worth (credits + cargo value − debt), boosted 10% for each day you survive.

## The Daily Seed

The seed comes from the calendar date, so prices, events, and contracts are identical for every player on a given day. There is no save state — the game holds no `localStorage`, and reloading starts a fresh run on the same day's seed.

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
