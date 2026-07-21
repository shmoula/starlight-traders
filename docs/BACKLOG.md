# Starlight Traders — UI/UX Backlog

Findings from the UI/UX & game-feel audit (2026-07-17), ordered by priority.
Effort is a rough dev-time guesstimate for this small vanilla-TS/Vite codebase:
**S** ≈ ≤2h, **M** ≈ half-day, **L** ≈ ~1 day+.

File references were re-verified on 2026-07-19 against the current Astro-Neon cockpit
UI (commit `2258631`, which rebuilt the render layer _after_ this audit was first
written). Every item below is still open; a few are now **partially addressed** and
flagged inline. For game-design and retention work (as opposed to this UI/UX friction
audit), see [ENGAGEMENT_BACKLOG.md](ENGAGEMENT_BACKLOG.md).

> **Triage 2026-07-21** — see [ROADMAP.md](ROADMAP.md) for the sequenced plan.
>
> - ✅ **Committed:** P1-2 (with E1-1) · P2-1 · P2-3 (with E2-2) · P2-2 · P3-2 · P3-3.
> - 🔀 **Absorbed:** P2-4 — score semantics move to E0-2; copy-confirm superseded by
>   E1-2 share card v2. The live score-chase display folds into E0-2.
> - ⚪ **Left in backlog:** P3-1 log spam/ordering (depends on P2-1).

## Already shipped (commit `e090e3d`)

These three "quick wins" from the audit are done and are **not** listed below:

- Sticky stats bar so vitals stay pinned while scrolling, plus amber/red fuel color-coding.
- Human-readable display names instead of raw ids in logs and contracts.
- Disabling no-op action buttons (Buy/Sell/Refuel/Repair/Pay-debt) with explanatory tooltips.
- Event screens keep the vitals statbar visible and label every choice with its
  stake (P0-1); stake strings are derived from the same engine formulas as
  `resolveChoice` via `src/engine/preview.ts`.
- Stranding is fully signalled (P0-2): disabled jump orbs carry "Need X⛽, have Y"
  reasons and a warning banner appears when no jump is reachable.
- Buy 1/×5 and Sell 1/×5 quantity buttons and the active-contract shortfall
  shortcut (P1-1) shipped 2026-07-20; the stretch (patch changed DOM nodes
  instead of full `innerHTML` swaps) remains open and is tracked as the B-4
  root cause.

---

## P1 — High

| #    | Friction point                                                                                                                                                                                                                                                                               | Proposed improvement                                                                                                                                                                                                                 | Effort |
| :--- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----: |
| P1-2 | **Sinks are stealth deductions.** Docking fee is only shown for the _current_ station (`screens.ts:94`), never the destination you're about to jump to; loan interest (+4% every 3 days, `game.ts:202`) arrives unannounced; sales tax (18% at Meridian!) only appears in the post-sale log. | Put costs on the jump buttons ("Jump to Meridian — 5⛽ · dock 45cr · 20%☠"); add an interest countdown chip on the debt stat ("+63cr in 2 days"); show "Sales tax here: X%" beside the docking fee and net proceeds on Sell buttons. |   M    |

## P2 — Medium

| #    | Friction point                                                                                                                                                                                                                                                                                                                                                                                                       | Proposed improvement                                                                                                                                                                                                                                                                                                        | Effort |
| :--- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----: |
| P2-1 | **Log tone is guessed by regex and misses money lines.** `toneOf` (`screens.ts:21`) still pattern-matches message strings. Its keyword set has grown since this audit (it now catches deliveries, salvage, interest, bribes), but the money lines "Docked… fee", "Bought…", "Sold…", "Refueled…" still render neutral, so cash in/out isn't consistently colored, and any new engine message silently falls through. | Have the engine emit structured entries `{ msg, tone, delta }` instead of bare strings (`types.ts:47` `log: string[]`), then render green `+860cr` / red `−23cr` right-aligned. Touches every `withLog` call site plus the renderer and tests.                                                                              |   M    |
| P2-2 | **No market intel or cost basis.** Prices carry no context — no signal that Vulcan _produces_ parts (30% off) or Meridian _demands_ luxury (+40%), data that exists in `world.ts:11` but is never surfaced. Players also can't recall what they paid for held cargo.                                                                                                                                                 | Add ▲/▼ glyphs vs `basePrice` with a muted "base 120cr" reference and a station-intel line ("Produces: Machine Parts · Buys: Water"). Cost-basis / unrealized P&L needs a new per-commodity avg-paid field in `GameState`.                                                                                                  |  M–L   |
| P2-3 | **Contract cards omit feasibility.** "Deliver 10 water → Kiruna Belt by day 12 · reward 252cr" doesn't show cargo cost, fuel to get there, estimated profit, or "days left" (deadlines are absolute). Expired contracts just vanish with a log line.                                                                                                                                                                 | **Partially done:** expired contracts now show "✗ deadline passed" inline (`screens.ts:190`) instead of vanishing, and active contracts gained one-click jump/deliver buttons (`screens.ts:187`). **Still open:** enrich the card with "cost ~180cr · 7⛽ · est. profit +65cr · 8 days left", amber when deadline ≤ 2 days. |   M    |
| P2-4 | **Score is invisible until death.** Score = peak net worth × days (`economy.ts:41`), but `peakNetWorth` is never rendered during play (live _net worth_ now is, but not the peak/score chase), and the run-end "Copy score card" ignores `copyShare`'s result (`main.ts:100`), giving no confirmation.                                                                                                               | Add "🏆 peak 1,240cr" to the stats bar so the daily chase is live; flip the share button to "Copied ✓" for 2s on success / "Copy failed" on failure.                                                                                                                                                                        |   S    |

## P3 — Low

| #    | Friction point                                                                                                                                                                                                                                                                                                                                                    | Proposed improvement                                                                                                                                                                                    | Effort |
| :--- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----: |
| P3-1 | **Log spam and ordering.** Consecutive identical lines ("Sold 1 water…" ×5) aren't collapsed; the `.log-entries` box (`styles.css:235`) renders oldest-first and doesn't auto-scroll to the newest entry.                                                                                                                                                         | Collapse consecutive repeats into "…×5", order newest-first, and dim previous days with a "Day N" divider.                                                                                              |   M    |
| P3-2 | **No "juice" on state changes.** HUD numbers never react — hull 100→80 or +860cr just changes text. **Partially addressed:** the turn report's `flash-in`, segmented fuel/hull meter bars (`screens.ts:81`), and a critical-fuel pulse now exist (`design-system.css:803`).                                                                                       | CSS-only wins **still open:** pulse the affected stat keyed off delta sign, a floating "+860cr" toast, and green→amber→red danger pips on route buttons. (Thin meter bars under ⛽/🛡️ already shipped.) |   M    |
| P3-3 | **A11y / polish leftovers.** Full-DOM re-render drops keyboard focus to `<body>` every action (no focus-restore code in `main.ts`); `document.title` never reflects Day/location (never set anywhere); event screens use `<h2>`, not `<h1>` (`screens.ts:264`); "Restart" (`screens.ts:282`) wipes a run with no confirm and silently reuses the same daily seed. | After render, restore focus to the acted-on control (match by `data-act`/`data-id`); set `document.title = "Day 4 · The Verge — Starlight Traders"`; confirm restart.                                   |   M    |

---

## Suggested sequencing

1. **P1-2** (forecast sinks) and **P2-3** (contract feasibility) both extend the
   existing turn-report idea from _reporting_ costs backward to _forecasting_ them
   forward — the core of the faucet/sink fantasy.
2. **P2-1** (structured log entries) is a useful foundation for P3-1 and P3-2 and
   is worth doing before piling more onto the string-matching `toneOf` heuristic.
