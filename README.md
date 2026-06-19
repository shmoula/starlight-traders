# Starlight Traders

A daily roguelike trade-run. Buy low, sell high, survive a faucet/sink economy
that constantly drains your wallet. New seed every day — same map for everyone.

## Develop
- `npm install`
- `npm run dev` — local dev server
- `npm test` — run the engine + balance test suite
- `npm run build` — produce static `dist/` for deploy

## Deploy (itch.io)
1. `npm run build`
2. Zip the contents of `dist/` (not the folder itself).
3. On itch.io: new project → Kind "HTML" → upload zip → check "This file will be played in the browser".
4. Set viewport to ~800×640, enable fullscreen button.

## Design
See `docs/superpowers/specs/2026-06-18-starlight-traders-design.md`.
