# Starlight Traders — UI/UX Backlog

Findings from the UI/UX & game-feel audit (2026-07-17), ordered by priority.
Effort is a rough dev-time guesstimate for this small vanilla-TS/Vite codebase:
**S** ≈ ≤2h, **M** ≈ half-day, **L** ≈ ~1 day+. File references point at the
current implementation.

## Already shipped (commit `e090e3d`)

These three "quick wins" from the audit are done and are **not** listed below:

- Sticky stats bar so vitals stay pinned while scrolling, plus amber/red fuel color-coding.
- Human-readable display names instead of raw ids in logs and contracts.
- Disabling no-op action buttons (Buy/Sell/Refuel/Repair/Pay-debt) with explanatory tooltips.

---

## P0 — Critical

| #    | Friction point                                                                                                                                                                                                                                              | Proposed improvement                                                                                                                                                                                                                                                                                                         | Effort |
| :--- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----: |
| P0-1 | **Event screens hide the entire HUD.** `render.ts:16` swaps the whole DOM for `eventScreen`, so "Pay pirates or flee?" / "Board it (gamble)" are decided blind — no credits, hull, or cargo visible.                                                        | Render events as a modal overlay on top of a dimmed station screen (or repeat the `.stats` bar inside `eventScreen`). Add stakes to the choice labels, e.g. "Pay tribute (~190cr of your 878cr)", "Run (risk ~16 hull, you have 80/100)". Requires per-event-kind cost preview logic mirroring `resolveChoice` in `game.ts`. |   M    |
| P0-2 | **The stranding cliff is only half-signalled.** Fuel color-coding shipped, but there's still no explanation _why_ jumps are disabled and no pre-emptive prompt. All jump buttons silently grey out; the loss only speaks after you're dead (`game.ts:170`). | Add a warning banner above the Navigate section when no jump is affordable ("⚠ Not enough fuel to jump anywhere — refuel at 8cr/unit"), and a per-route reason on each disabled jump button (`title="Need 4⛽, have 3"`).                                                                                                    |   S    |

## P1 — High

| #    | Friction point                                                                                                                                                                                                                                                                                | Proposed improvement                                                                                                                                                                                                                 | Effort |
| :--- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----: |
| P1-1 | **Trading is 1 unit per click.** Buttons hardcode qty 1 (`main.ts:45`); fulfilling a 7- or 10-unit contract means 7–10 clicks, and each click rebuilds the whole DOM via `innerHTML` (`render.ts:19`), resetting focus/scroll and occasionally swallowing rapid clicks.                       | Add "×5" and "Max" buttons (`data-qty`; the engine already accepts `qty`) and a one-click "Buy N for Xcr" shortcut on each active-contract card. **Stretch (L):** patch only changed DOM nodes instead of full `innerHTML` swaps.    |   M    |
| P1-2 | **Sinks are stealth deductions.** Docking fee is only shown for the _current_ station (`screens.ts:134`), never the destination you're about to jump to; loan interest (+4% every 3 days, `game.ts:190`) arrives unannounced; sales tax (18% at Meridian!) only appears in the post-sale log. | Put costs on the jump buttons ("Jump to Meridian — 5⛽ · dock 45cr · 20%☠"); add an interest countdown chip on the debt stat ("+63cr in 2 days"); show "Sales tax here: X%" beside the docking fee and net proceeds on Sell buttons. |   M    |

## P2 — Medium

| #    | Friction point                                                                                                                                                                                                                                                            | Proposed improvement                                                                                                                                                                                                                           | Effort |
| :--- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----: |
| P2-1 | **Log tone is guessed by regex and misses money lines.** `toneOf` (`screens.ts:27`) pattern-matches message strings; "Docked… fee", "Bought…", "Sold…" all render neutral, so money in/out isn't consistently colored, and any new engine message silently falls through. | Have the engine emit structured entries `{ msg, tone, delta }` instead of bare strings (`types.ts:47` `log: string[]`), then render green `+860cr` / red `−23cr` right-aligned. Touches every `withLog` call site plus the renderer and tests. |   M    |
| P2-2 | **No market intel or cost basis.** Prices carry no context — no signal that Vulcan _produces_ parts (30% off) or Meridian _demands_ luxury (+40%), data that exists in `world.ts:11` but is never surfaced. Players also can't recall what they paid for held cargo.      | Add ▲/▼ glyphs vs `basePrice` with a muted "base 120cr" reference and a station-intel line ("Produces: Machine Parts · Buys: Water"). Cost-basis / unrealized P&L needs a new per-commodity avg-paid field in `GameState`.                     |  M–L   |
| P2-3 | **Contract cards omit feasibility.** "Deliver 10 water → Kiruna Belt by day 12 · reward 252cr" doesn't show cargo cost, fuel to get there, estimated profit, or "days left" (deadlines are absolute). Expired contracts just vanish with a log line.                      | Enrich the card: "cost ~180cr · 7⛽ · est. profit +65cr · 8 days left", amber when deadline ≤ 2 days. Keep an expired contract visible for one turn with a red ✗ "Expired — reward lost".                                                      |   M    |
| P2-4 | **Score is invisible until death.** Score = peak net worth × days (`economy.ts:41`), but `peakNetWorth` is never rendered during play, and the run-end "Copy score card" ignores `copyShare`'s result (`main.ts:82`), giving no confirmation.                             | Add "🏆 peak 1,240cr" to the stats bar so the daily chase is live; flip the share button to "Copied ✓" for 2s on success / "Copy failed" on failure.                                                                                           |   S    |

## P3 — Low

| #    | Friction point                                                                                                                                                                                                                                                             | Proposed improvement                                                                                                                                                                       | Effort |
| :--- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----: |
| P3-1 | **Log spam and ordering.** Consecutive identical lines ("Sold 1 water…" ×5) aren't collapsed; the `.log-entries` box (`styles.css:78`) renders oldest-first and doesn't auto-scroll to the newest entry.                                                                   | Collapse consecutive repeats into "…×5", order newest-first, and dim previous days with a "Day N" divider.                                                                                 |   M    |
| P3-2 | **No "juice" on state changes.** HUD numbers never react — hull 100→80 or +860cr just changes text. The only animation is the turn report's `flash-in` (`styles.css:147`).                                                                                                 | CSS-only wins: pulse the affected stat keyed off delta sign, floating "+860cr" toast, thin meter bars under ⛽/🛡️/📦, and green→amber→red danger pips on route buttons. Many small pieces. |   M    |
| P3-3 | **A11y / polish leftovers.** Full-DOM re-render drops keyboard focus to `<body>` every action; `document.title` never reflects Day/location; event screens have no `h1`; "Restart" (`screens.ts:160`) wipes a run with no confirm and silently reuses the same daily seed. | After render, restore focus to the acted-on control (match by `data-act`/`data-id`); set `document.title = "Day 4 · The Verge — Starlight Traders"`; confirm restart.                      |   M    |

---

## Suggested sequencing

1. **P0-1** (event HUD) and **P0-2** (stranding banner) close the two remaining
   ways a player loses without understanding why.
2. **P1-2** (forecast sinks) and **P2-3** (contract feasibility) both extend the
   existing turn-report idea from _reporting_ costs backward to _forecasting_ them
   forward — the core of the faucet/sink fantasy.
3. **P2-1** (structured log entries) is a useful foundation for P3-1 and P3-2 and
   is worth doing before piling more onto the string-matching `toneOf` heuristic.
