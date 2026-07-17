# Astro-Neon UI Transformation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the existing Starlight Traders game into the Astro-Neon cockpit (three-rail HUD over a starfield) with zero engine changes, using the design system already on this branch.

**Architecture:** Template re-skin on the existing renderer — innerHTML string templates in `src/ui/screens.ts`, `data-act` event delegation in `src/main.ts` (untouched), tri-state `render()` (untouched). Each task replaces one screen region with design-system markup and lands with tests green and the game playable.

**Tech Stack:** Vite + TypeScript (vanilla DOM), Vitest, CSS custom properties from `src/ui/tokens.css` + components from `src/ui/design-system.css`.

**Spec:** `docs/superpowers/specs/2026-07-17-astro-neon-ui-transformation-design.md`
**Branch:** work directly on `feat/design-system` (the design system this builds on lives here).

---

## File structure

| File                              | Role in this plan                                                                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create `src/ui/art.ts`            | Pure string constants/helpers: backdrop SVG, commodity icons + accent map, `iconBox()`, per-station orb gradients. No DOM APIs (node-safe for tests). |
| Create `tests/ui/art.test.ts`     | Unit tests for the art module.                                                                                                                        |
| Modify `index.html`               | Fonts link, `st-app-bg` body class, `#backdrop` container.                                                                                            |
| Modify `src/main.ts`              | One-time backdrop injection (outside the re-render cycle). Nothing else.                                                                              |
| Modify `src/ui/screens.ts`        | Panel template functions + cockpit composition. Exported signatures unchanged.                                                                        |
| Modify `src/ui/styles.css`        | Imports tokens + design system; screen glue; retokenized legacy contract classes; dead rules deleted at the end.                                      |
| Modify `tests/ui/screens.test.ts` | New assertions per panel. **Existing tests are contracts — never edit them.**                                                                         |
| Untouched                         | `src/engine/**`, `src/ui/render.ts`, `src/ui/share.ts`, `src/ui/tokens.css`, `src/ui/design-system.css`.                                              |

**DOM contracts that must survive verbatim** (asserted by existing tests): every current `aria-label` string; `data-act`/`data-id` attribute pairs and their order; `class="turn-report"`, `turn-report__title`, `tr-line tr-good/bad/neutral`, `tr-icon`; `jump-link` + `aria-disabled` + `aria-describedby="jump-hint-<id>"` + `(not enough fuel to jump)`; `aria-label="Ship's log"` + “Ship's Log” heading; `role="status"` on the turn report.

---

### Task 1: Art module, fonts, backdrop scaffold

**Files:**

- Create: `tests/ui/art.test.ts`
- Create: `src/ui/art.ts`
- Modify: `index.html`
- Modify: `src/main.ts:19-22`
- Modify: `src/ui/styles.css:1-14` (the `:root`/`body`/`#app` head of the file)

- [ ] **Step 1: Baseline check**

Run: `git branch --show-current && npm test`
Expected: `feat/design-system`; all 9 test files pass. Do not proceed on a red baseline.

- [ ] **Step 2: Write the failing test**

Create `tests/ui/art.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BACKDROP_SVG, COMMODITY_ACCENT, ORB_ART, iconBox } from "../../src/ui/art";
import { COMMODITIES, NODE_IDS } from "../../src/engine/world";

describe("backdrop art", () => {
  it("is a single self-contained svg sized for slicing", () => {
    expect(BACKDROP_SVG.startsWith("<svg")).toBe(true);
    expect(BACKDROP_SVG).toContain('viewBox="0 0 1440 810"');
    expect(BACKDROP_SVG).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(BACKDROP_SVG.trimEnd().endsWith("</svg>")).toBe(true);
  });
});

describe("commodity art", () => {
  it("has an icon and an accent entry for every commodity", () => {
    for (const c of COMMODITIES) {
      const box = iconBox(c.id);
      expect(box).toContain('class="st-icon-box');
      expect(box).toContain('aria-hidden="true"');
      expect(box).toContain("<svg");
      expect(COMMODITY_ACCENT[c.id]).toBeDefined();
    }
  });

  it("gives luxury goods the gold accent and the rest the cyan default", () => {
    expect(iconBox("luxury")).toContain("st-icon-box--gold");
    expect(iconBox("water")).not.toContain("st-icon-box--");
    expect(iconBox("parts")).not.toContain("st-icon-box--");
  });
});

describe("orb art", () => {
  it("defines a radial-gradient for every station", () => {
    for (const n of NODE_IDS) {
      expect(ORB_ART[n]).toContain("radial-gradient");
    }
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/ui/art.test.ts`
Expected: FAIL — `Cannot find module '../../src/ui/art'` (or equivalent resolve error).

- [ ] **Step 4: Create `src/ui/art.ts`**

```ts
// src/ui/art.ts — static art strings for the Astro-Neon cockpit.
// Pure data: no DOM access, safe to import from node-side tests.
import { CommodityId, NodeId } from "../engine/types";

const ICON_OPEN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">`;

export const COMMODITY_ICONS: Record<CommodityId, string> = {
  water: `${ICON_OPEN}<path d="M12 3.5c3.2 4 5.5 6.9 5.5 9.7a5.5 5.5 0 1 1-11 0C6.5 10.4 8.8 7.5 12 3.5z"/></svg>`,
  parts: `${ICON_OPEN}<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>`,
  luxury: `${ICON_OPEN}<path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3z"/><path d="M4 7.5l8 4.5 8-4.5"/><path d="M12 12v9"/></svg>`,
};

/** Category accent per commodity: "" = cyan default, "gold" = high-value. */
export const COMMODITY_ACCENT: Record<CommodityId, "" | "gold"> = {
  water: "",
  parts: "",
  luxury: "gold",
};

export function iconBox(id: CommodityId): string {
  const acc = COMMODITY_ACCENT[id];
  return `<span class="st-icon-box${acc ? ` st-icon-box--${acc}` : ""}" aria-hidden="true">${COMMODITY_ICONS[id]}</span>`;
}

/** Planet art per station (decorative layer — exempt from the functional accent rule). */
export const ORB_ART: Record<NodeId, string> = {
  terra: "radial-gradient(circle at 35% 30%, #7ec8e3, #1d4e6e 55%, #0c2431 82%)",
  kiruna: "radial-gradient(circle at 35% 30%, #9aa8b4, #3a4750 55%, #161d23 82%)",
  vulcan: "radial-gradient(circle at 35% 30%, #e0956a, #6e3a24 55%, #26140c 82%)",
  verge: "radial-gradient(circle at 35% 30%, #a98fd8, #4a3378 55%, #1c1230 82%)",
  meridian: "radial-gradient(circle at 35% 30%, #e8c17a, #7a5a24 55%, #2b1f0d 82%)",
};

// Deterministic backdrop: orbit ellipses, two planets, one moon, fixed star dots.
// Stars are zero-length path segments with round caps — compact and hand-editable.
export const BACKDROP_SVG = `<svg viewBox="0 0 1440 810" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bk-p1" cx="35%" cy="30%" r="75%">
      <stop offset="0%" stop-color="#e8c17a"/><stop offset="55%" stop-color="#7a5a24"/><stop offset="100%" stop-color="#2b1f0d"/>
    </radialGradient>
    <radialGradient id="bk-p2" cx="35%" cy="30%" r="75%">
      <stop offset="0%" stop-color="#7adfe8"/><stop offset="55%" stop-color="#1d6a7a"/><stop offset="100%" stop-color="#0c2830"/>
    </radialGradient>
  </defs>
  <g stroke="rgba(120, 170, 196, 0.1)" fill="none">
    <ellipse cx="430" cy="240" rx="360" ry="130"/>
    <ellipse cx="430" cy="240" rx="520" ry="196"/>
    <ellipse cx="1120" cy="120" rx="420" ry="150"/>
  </g>
  <path d="M872 96 1180 105" stroke="rgba(0, 217, 255, 0.18)" fill="none"/>
  <circle cx="300" cy="205" r="30" fill="url(#bk-p1)"/>
  <circle cx="1180" cy="105" r="18" fill="url(#bk-p2)"/>
  <circle cx="705" cy="330" r="7" fill="#3a4750"/>
  <path d="M120 90h.01M260 500h.01M340 700h.01M420 120h.01M540 620h.01M600 260h.01M660 80h.01M760 540h.01M820 180h.01M900 680h.01M960 320h.01M1040 90h.01M1100 470h.01M1180 640h.01M1260 240h.01M1330 520h.01M1390 130h.01M80 380h.01" stroke="rgba(234, 246, 251, 0.35)" stroke-width="1.6" stroke-linecap="round" fill="none"/>
  <path d="M180 240h.01M470 420h.01M700 150h.01M880 420h.01M1010 560h.01M1240 380h.01M1360 700h.01M560 40h.01M1420 300h.01M40 640h.01" stroke="rgba(234, 246, 251, 0.55)" stroke-width="2.2" stroke-linecap="round" fill="none"/>
</svg>`;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/ui/art.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Update `index.html`**

Replace the whole file with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="A daily roguelike trade-run. Buy low, sell high, and survive a faucet/sink economy — new seed every day, same map for everyone."
    />
    <title>Starlight Traders</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700&family=Orbitron:wght@500;600;700&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="/src/ui/styles.css" />
  </head>
  <body class="st-app-bg">
    <div id="backdrop" aria-hidden="true"></div>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: Inject the backdrop once in `src/main.ts`**

Add the import after the existing `copyShare` import, and the injection right after `app` is looked up:

```ts
import { copyShare } from "./ui/share";
import { BACKDROP_SVG } from "./ui/art";

const app = document.querySelector<HTMLDivElement>("#app")!;
// Static decoration, injected once — deliberately outside the paint() cycle.
document.querySelector<HTMLDivElement>("#backdrop")!.innerHTML = BACKDROP_SVG;
```

- [ ] **Step 8: Rebase `styles.css` on the design system**

In `src/ui/styles.css`, replace the current top block (`:root { color-scheme: dark; }`, `body { ... }`, `#app { ... }`, and the `header { ... }` rule — lines 1–24) with:

```css
@import "./tokens.css";
@import "./design-system.css";

:root {
  color-scheme: dark;
}
body {
  margin: 0;
  min-height: 100vh;
  font-family: var(--st-font-body);
  font-size: var(--st-text-md);
  line-height: var(--st-leading-body);
  color: var(--st-text);
  /* Backdrop gradient comes from .st-app-bg on <body>. */
}
#backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--st-z-bg);
  pointer-events: none;
}
#backdrop svg {
  display: block;
  width: 100%;
  height: 100%;
}
#app {
  position: relative;
  z-index: var(--st-z-hud);
  max-width: 1440px;
  margin: 0 auto;
}
/* Transitional: keeps the legacy header usable until Task 2 replaces it. */
header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--st-bg-panel-solid);
  padding: 10px 16px;
  border-bottom: 1px solid var(--st-border-panel);
}
```

Leave every rule below `header h1` untouched for now (they still style the legacy markup; Task 7 retires them).

- [ ] **Step 9: Verify the suite and formatting**

Run: `npm test && npm run lint && npm run format:check`
Expected: all pass. If prettier complains, run `npm run format` and re-check.

- [ ] **Step 10: Visual smoke check**

Run the dev server (`npm run dev`), open `http://localhost:5173/`. Expected: starfield gradient + orbit art behind the (still old-looking) game; Orbitron/Exo 2 loading in the network tab; no console errors.

- [ ] **Step 11: Commit**

```bash
git add tests/ui/art.test.ts src/ui/art.ts index.html src/main.ts src/ui/styles.css
git commit -m "feat(ui): add astro-neon backdrop, webfonts, and art module"
```

---

### Task 2: Cockpit shell, screen head, statbar

**Files:**

- Modify: `src/ui/screens.ts` (helpers + `stationScreen` composition; sections' inner markup unchanged)
- Modify: `src/ui/styles.css` (append shell glue)
- Test: `tests/ui/screens.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/screens.test.ts`:

```ts
describe("stationScreen cockpit shell", () => {
  it("renders the statbar chips for credits, fuel, hull, and hold", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain('class="st-statbar"');
    expect(html).toContain("Fuel 16/20");
    expect(html).toContain("Hull 100/100");
    expect(html).toContain("Hold 0/30");
  });

  it("marks the statbar as presentation-only duplicate of panel data", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain('<div class="st-statbar" aria-hidden="true">');
  });

  it("lays the screen out as a three-zone shell", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain("st-shell station-shell");
    expect(html).toContain("st-shell__stage");
    expect(html).toContain("st-shell__rail--right");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui/screens.test.ts`
Expected: the three new tests FAIL (`st-statbar` not found); all pre-existing tests still PASS.

- [ ] **Step 3: Add helpers and recompose `stationScreen`**

In `src/ui/screens.ts`, add below the `TONE_ICON` constant (`panel()` deliberately arrives in Task 3 — `tsconfig` has `noUnusedLocals: true`, so introducing it unused here would fail the build):

```ts
function screenHead(s: GameState): string {
  return `<header class="screen-head">
    <h1 class="st-screen-title">Starlight Traders</h1>
    <p class="screen-head__sub">${NODES[s.location].name} · Day ${s.day}</p>
  </header>`;
}

/** Sticky at-a-glance strip; duplicates logistics values, hence aria-hidden. */
function statbar(s: GameState, fuelClass: string): string {
  return `<div class="st-statbar" aria-hidden="true">
    <span class="st-statbar__chip st-statbar__chip--gold st-num">${cr(s.credits)}</span>
    <span class="st-statbar__chip st-num${fuelClass ? ` ${fuelClass}` : ""}">Fuel ${s.fuel}/${s.fuelCapacity}</span>
    <span class="st-statbar__chip st-num">Hull ${s.hull}/${s.hullMax}</span>
    <span class="st-statbar__chip st-num">Hold ${cargoUsed(s.cargo)}/${s.cargoCapacity}</span>
  </div>`;
}
```

Then change only the _composition_ at the end of `stationScreen` (move the `cheapestJump`/`fuelClass` computation above the return; keep every existing section template string exactly as-is):

```ts
return `
    ${screenHead(s)}
    ${statbar(s, fuelClass)}
    <div class="st-shell station-shell">
      <div class="st-shell__rail rail-left"></div>
      <div class="st-shell__stage">
        ${report}
        <section><h2>Market</h2><table>
          <thead>
            <tr>
              <th scope="col">Commodity</th>
              <th scope="col">Price</th>
              <th scope="col">Held</th>
              <th scope="col">Trade</th>
            </tr>
          </thead>
          <tbody>${market}</tbody>
        </table></section>
        <section><h2>Contracts</h2><ul>${missions || "<li>None today.</li>"}</ul></section>
        <section><h2>Active Contracts</h2>
          <p class="hint">Deliveries auto-complete when you arrive carrying the goods.</p>
          <ul>${active || "<li>None accepted. Accept a contract, buy its cargo, then jump to the destination.</li>"}</ul>
        </section>
        <section class="services">
          <button data-act="refuel"${
            s.fuel >= s.fuelCapacity
              ? ` disabled title="Fuel tank full"`
              : s.credits < REFUEL_PRICE
                ? ` disabled title="Not enough credits"`
                : ""
          }>Refuel +5 (${cr(40)})</button>
          <button data-act="repair"${
            s.hull >= s.hullMax
              ? ` disabled title="Hull fully repaired"`
              : s.credits < REPAIR_PRICE
                ? ` disabled title="Not enough credits"`
                : ""
          }>Repair +20 (${cr(120)})</button>
          <button data-act="payDebt"${
            s.debt <= 0
              ? ` disabled title="No debt to pay"`
              : s.credits <= 0
                ? ` disabled title="No credits to pay with"`
                : ""
          }>Pay 200 debt</button>
          <span class="fee">Docking fee here: ${cr(dockingFee(s.location))}</span>
        </section>
        <section><h2>Navigate</h2><div class="routes">${routes}</div></section>
        <section class="log" aria-label="Ship's log">
          <h2>Ship's Log</h2>
          <div class="log-entries">${logEntries}</div>
        </section>
      </div>
      <div class="st-shell__rail st-shell__rail--right rail-right"></div>
    </div>
  `;
```

The old `<header><h1>…<div class="stats">…</header>` block is deleted (statbar + screen head replace it).

- [ ] **Step 4: Append shell glue to `styles.css`**

```css
/* ── Cockpit shell glue ─────────────────────────────────────────────── */
.screen-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--st-space-4);
  padding: var(--st-space-5) var(--st-space-5) 0;
}
.screen-head__sub {
  margin: 0;
  font-family: var(--st-font-display);
  font-size: var(--st-text-sm);
  letter-spacing: var(--st-track-label);
  text-transform: uppercase;
  color: var(--st-text-dim);
}
.st-statbar {
  position: sticky;
  top: 0;
  z-index: var(--st-z-hud);
  display: flex;
  flex-wrap: wrap;
  gap: var(--st-space-3);
  padding: 6px var(--st-space-5);
  background: var(--st-bg-panel-solid);
  border-bottom: 1px solid var(--st-border-panel);
  font-size: var(--st-text-xs);
}
.st-statbar__chip {
  font-weight: 600;
  color: var(--st-text-hi);
}
.st-statbar__chip--gold {
  color: var(--st-accent-currency);
}
@media (max-width: 759.98px) {
  .station-shell .st-shell__stage {
    order: 1;
  }
  .station-shell .rail-left {
    order: 2;
  }
  .station-shell .st-shell__rail--right {
    order: 3;
  }
}
```

(The statbar is visible at all widths for now; Task 3 restricts it to <1100px once the logistics panel carries the data on desktop.)

- [ ] **Step 5: Run all tests**

Run: `npm test && npm run lint && npm run format:check`
Expected: PASS — new shell tests and every pre-existing contract test.

- [ ] **Step 6: Visual check + commit**

Dev server: cockpit head + statbar + old content centered in the stage, empty rails left/right. Then:

```bash
git add src/ui/screens.ts src/ui/styles.css tests/ui/screens.test.ts
git commit -m "feat(ui): wrap station screen in cockpit shell with statbar"
```

---

### Task 3: Right rail — Ship Logistics + Ship's Log panels

**Files:**

- Modify: `src/ui/screens.ts`
- Modify: `src/ui/styles.css` (append + one media rule)
- Test: `tests/ui/screens.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe("stationScreen ship logistics", () => {
  it("renders the fuel bar segmented per fuel unit with the current value", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain('aria-label="Fuel" aria-valuenow="16"');
    expect(html).toContain("--st-segments: 20");
    expect(html).toContain("--st-value: 80%");
  });

  it("marks the fuel bar critical when below the cheapest jump", () => {
    const html = stationScreen({ ...createGame(42), fuel: 2 }); // cheapest from terra = 3 (vulcan)
    expect(html).toContain("st-bar--critical");
    expect(html).toContain("stat-critical");
  });

  it("warns when fuel covers fewer than two cheapest jumps", () => {
    const html = stationScreen({ ...createGame(42), fuel: 5 });
    expect(html).toContain("stat-warn");
    expect(html).not.toContain("st-bar--critical");
  });

  it("keeps the services disabled hints", () => {
    const html = stationScreen({ ...createGame(42), credits: 0 });
    expect(html).toContain('data-act="refuel" disabled title="Not enough credits"');
    expect(html).toContain('data-act="payDebt" disabled title="No credits to pay with"');
  });

  it("renders a continuous hull meter", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain('aria-label="Hull" aria-valuenow="100"');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui/screens.test.ts`
Expected: the five new tests FAIL (no `--st-segments` etc. in output); everything else PASS.

- [ ] **Step 3: Add the two right-rail panels**

In `src/ui/screens.ts` add below `statbar` — first the shared `panel()` helper, then the two panels:

```ts
/** Standard HUD module: header strip + padded body. `attrs` lands on the <section>. */
function panel(title: string, body: string, attrs = ""): string {
  return `<section class="st-panel"${attrs}>
    <header class="st-panel__header"><h2 class="st-panel__title">${title}</h2></header>
    <div class="st-panel__body">${body}</div>
  </section>`;
}

function logisticsPanel(s: GameState, fuelClass: string): string {
  const fuelPct = Math.round((s.fuel / s.fuelCapacity) * 100);
  const hullPct = Math.round((s.hull / s.hullMax) * 100);
  const barMod = fuelClass === "stat-critical" ? "st-bar--critical" : "st-bar--gold";
  const kv = (label: string, value: string, gold = false) =>
    `<div class="st-kv"><span class="st-kv__label">${label}</span><span class="st-kv__value${gold ? " st-kv__value--gold" : ""} st-num">${value}</span></div>`;
  return panel(
    "Ship Logistics",
    `${kv("Credits", cr(s.credits), true)}
    ${kv("Debt", cr(s.debt), true)}
    ${kv("Net worth", cr(netWorth(s)), true)}
    ${kv("Day", String(s.day))}
    <div class="st-bar-label"><span>Fuel</span><span class="st-bar-label__value${fuelClass ? ` ${fuelClass}` : ""}">${s.fuel}/${s.fuelCapacity}</span></div>
    <div class="st-bar st-bar--segmented ${barMod}" role="meter" aria-label="Fuel" aria-valuenow="${s.fuel}" aria-valuemin="0" aria-valuemax="${s.fuelCapacity}" style="--st-value: ${fuelPct}%; --st-segments: ${s.fuelCapacity}"><div class="st-bar__fill"></div></div>
    <div class="st-bar-label"><span>Hull</span><span class="st-bar-label__value">${s.hull}/${s.hullMax}</span></div>
    <div class="st-bar" role="meter" aria-label="Hull" aria-valuenow="${s.hull}" aria-valuemin="0" aria-valuemax="${s.hullMax}" style="--st-value: ${hullPct}%"><div class="st-bar__fill"></div></div>
    <hr class="st-divider" />
    <div class="st-kv__label">Services</div>
    <div class="svc-row">
      <button class="st-btn st-btn--ghost st-btn--sm" data-act="refuel"${
        s.fuel >= s.fuelCapacity
          ? ` disabled title="Fuel tank full"`
          : s.credits < REFUEL_PRICE
            ? ` disabled title="Not enough credits"`
            : ""
      }>Refuel +5 (${cr(5 * REFUEL_PRICE)})</button>
      <button class="st-btn st-btn--ghost st-btn--sm" data-act="repair"${
        s.hull >= s.hullMax
          ? ` disabled title="Hull fully repaired"`
          : s.credits < REPAIR_PRICE
            ? ` disabled title="Not enough credits"`
            : ""
      }>Repair +20 (${cr(20 * REPAIR_PRICE)})</button>
      <button class="st-btn st-btn--ghost st-btn--sm" data-act="payDebt"${
        s.debt <= 0
          ? ` disabled title="No debt to pay"`
          : s.credits <= 0
            ? ` disabled title="No credits to pay with"`
            : ""
      }>Pay 200 debt</button>
    </div>
    <div class="st-kv"><span class="st-kv__label">Docking fee here</span><span class="fee st-kv__value st-kv__value--gold st-num">${cr(dockingFee(s.location))}</span></div>`
  );
}

function logPanel(s: GameState): string {
  const logEntries = s.log
    .slice(-8)
    .map((l) => `<div class="log-line tr-${toneOf(l)}">${l}</div>`)
    .join("");
  return panel(
    "Ship's Log",
    `<div class="log-entries">${logEntries}</div>`,
    ` aria-label="Ship's log"`
  );
}
```

In `stationScreen`: delete the local `logEntries` computation, delete the `services` section and the `log` section from the stage, and fill the right rail:

```ts
      <div class="st-shell__rail st-shell__rail--right rail-right">
        ${logisticsPanel(s, fuelClass)}
        ${logPanel(s)}
      </div>
```

Note `Refuel +5 (${cr(5 * REFUEL_PRICE)})` renders `Refuel +5 (40cr)` and `Repair +20 (${cr(20 * REPAIR_PRICE)})` renders `Repair +20 (120cr)` — identical strings to today, minus the magic numbers.

- [ ] **Step 4: Append CSS and restrict the statbar**

```css
.svc-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--st-space-2);
  margin: var(--st-space-1) 0 var(--st-space-2);
}
.log-entries {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 190px;
  overflow-y: auto;
  font-size: var(--st-text-sm);
}
.log-line {
  padding: 1px 0;
}
@media (min-width: 1100px) {
  .st-statbar {
    display: none;
  }
}
```

Also delete the now-duplicate legacy `.log-entries` / `.log-line` rules from the old section of the file (search for `max-height: 168px`).

- [ ] **Step 5: Run all tests, visual check, commit**

Run: `npm test && npm run lint && npm run format:check` — expected PASS. Dev server: logistics + log panels in the right rail; statbar only when the window is narrower than 1100px.

```bash
git add src/ui/screens.ts src/ui/styles.css tests/ui/screens.test.ts
git commit -m "feat(ui): move ship state and log into right-rail panels"
```

---

### Task 4: Left rail — Navigator orbs + Cargo tiles

**Files:**

- Modify: `src/ui/screens.ts`
- Modify: `src/ui/styles.css` (append)
- Test: `tests/ui/screens.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe("stationScreen navigator and cargo", () => {
  it("renders one jump orb per non-current station with fuel and danger info", () => {
    const html = stationScreen(createGame(42)); // starts at terra
    for (const id of ["kiruna", "vulcan", "verge", "meridian"]) {
      expect(html).toContain(`data-act="jump" data-id="${id}"`);
    }
    expect(html).toContain('aria-label="Jump to Kiruna Belt (4 fuel, danger 0%)"');
    expect(html).toContain('aria-label="Jump to The Verge (6 fuel, danger 50%)"');
    // No jump control targets the current station (mission ids may contain node
    // names, so scope the assertion to the jump prefix).
    expect(html).not.toContain('data-act="jump" data-id="terra"');
  });

  it("disables orbs the fuel cannot reach", () => {
    const html = stationScreen({ ...createGame(42), fuel: 0 });
    expect(html).toContain('aria-label="Jump to Kiruna Belt (4 fuel, danger 0%)" disabled');
  });

  it("shows the hold capacity and a tile per commodity", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain(">Hold<");
    expect(html).toContain(">0/30<");
    for (const c of COMMODITIES) {
      expect(html).toContain(c.name);
    }
    // all cargo starts empty → every tile is dimmed
    expect(html.match(/cargo-empty/g)?.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui/screens.test.ts`
Expected: new tests FAIL (`data-act="jump" data-id="kiruna"` currently appears in the old routes markup — but the aria-label format and `cargo-empty` do not exist yet, so the describe block fails); existing tests PASS.

- [ ] **Step 3: Add the panels and drop the Navigate section**

In `src/ui/screens.ts` add the import at the top:

```ts
import { COMMODITY_ACCENT, ORB_ART, iconBox } from "./art";
```

Add the panel functions:

```ts
function navigatorPanel(s: GameState): string {
  const orbs = NODE_IDS.filter((n) => n !== s.location)
    .map((n) => {
      const cost = fuelCost(s.location, n);
      const danger = Math.round(NODES[n].danger * 100);
      const disabled = s.fuel < cost;
      return `<button class="st-orb" data-act="jump" data-id="${n}" aria-label="Jump to ${NODES[n].name} (${cost} fuel, danger ${danger}%)"${disabled ? " disabled" : ""}>
        <span class="st-orb__sphere" style="--orb-art: ${ORB_ART[n]}"></span>
        <span class="st-orb__label">${NODES[n].name}</span>
        <span class="st-orb__meta st-num">${cost}⛽ · ${danger}%</span>
      </button>`;
    })
    .join("");
  return panel("Navigator", `<div class="st-orb-group">${orbs}</div>`);
}

function cargoPanel(s: GameState): string {
  const tiles = COMMODITIES.map((c) => {
    const qty = s.cargo[c.id];
    const acc = COMMODITY_ACCENT[c.id];
    return `<div class="st-tile${acc ? ` st-tile--${acc}` : ""}${qty === 0 ? " cargo-empty" : ""}">
      ${iconBox(c.id)}
      <span><span class="st-tile__name">${c.name}</span><span class="st-tile__meta st-num">${qty} units</span></span>
    </div>`;
  }).join("");
  return panel(
    "Cargo",
    `<div class="st-kv"><span class="st-kv__label">Hold</span><span class="st-kv__value st-num">${cargoUsed(s.cargo)}/${s.cargoCapacity}</span></div>
    <div class="cargo-tiles">${tiles}</div>`
  );
}
```

In `stationScreen`: delete the `routes` computation and the `<section><h2>Navigate</h2>…</section>` block; fill the left rail:

```ts
      <div class="st-shell__rail rail-left">
        ${navigatorPanel(s)}
        ${cargoPanel(s)}
      </div>
```

- [ ] **Step 4: Append CSS**

```css
.station-shell .st-orb-group {
  flex-wrap: wrap;
  gap: var(--st-space-3) var(--st-space-4);
}
.st-orb__meta {
  font-size: var(--st-text-2xs);
  color: var(--st-text-dim);
  font-variant-numeric: tabular-nums;
}
.st-orb:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.st-tile__name {
  display: block;
}
.cargo-tiles {
  display: grid;
  gap: var(--st-space-2);
  margin-top: var(--st-space-2);
}
.cargo-empty {
  opacity: 0.4;
}
```

- [ ] **Step 5: Run all tests, visual check, commit**

Run: `npm test && npm run lint && npm run format:check` — expected PASS. Dev server: orbs with planet gradients (Cygnus-style ring on hover), cargo tiles dimmed at 0.

```bash
git add src/ui/screens.ts src/ui/styles.css tests/ui/screens.test.ts
git commit -m "feat(ui): add navigator orbs and cargo tiles in left rail"
```

---

### Task 5: Center stage — Trade Hub window + turn-report restyle

**Files:**

- Modify: `src/ui/screens.ts`
- Modify: `src/ui/styles.css` (append + replace the `.turn-report` block)
- Test: `tests/ui/screens.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append:

```ts
describe("stationScreen trade hub", () => {
  it("titles the window after the current station", () => {
    const html = stationScreen(createGame(42));
    expect(html).toContain("Trade Hub — Terra Hub");
    expect(html).toContain("st-panel--tab");
    expect(html).toContain("Market Commodities");
  });

  it("shows the held count per market row", () => {
    const html = stationScreen(createGame(42));
    expect(html.match(/st-market__held/g)?.length).toBe(3);
    expect(html).toContain("×0");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui/screens.test.ts`
Expected: the two new tests FAIL; existing market/contract/jump-link tests PASS (they will be the safety net for Step 3).

- [ ] **Step 3: Replace the market/contract sections with the Trade Hub panel**

In `src/ui/screens.ts`, replace the `market` computation with:

```ts
const marketRows = COMMODITIES.map((c) => {
  const price = getPrice(s.seed, s.day, s.location, c.id);
  const cantAfford = price > s.credits;
  const holdFull = cargoUsed(s.cargo) + 1 > s.cargoCapacity;
  const buyDisabled = cantAfford || holdFull;
  const buyTitle = cantAfford ? "Not enough credits" : "Cargo hold full";
  const sellDisabled = s.cargo[c.id] < 1;
  return `<div class="st-market__row">
      ${iconBox(c.id)}
      <span class="st-market__name">${c.name}</span>
      <span class="st-market__prices st-num"><span class="st-market__buy-price">${cr(price)}</span></span>
      <span class="st-market__held st-num">×${s.cargo[c.id]}</span>
      <span class="st-market__actions">
        <button class="st-btn st-btn--sm" data-act="buy" data-id="${c.id}" aria-label="Buy 1 ${c.name}"${buyDisabled ? ` disabled title="${buyTitle}"` : ""}>Buy 1</button>
        <button class="st-btn st-btn--sell st-btn--sm" data-act="sell" data-id="${c.id}" aria-label="Sell 1 ${c.name}"${sellDisabled ? ` disabled title="None in hold"` : ""}>Sell 1</button>
      </span>
    </div>`;
}).join("");
```

Keep the `missions` (offered) and `active` computations exactly as they are today, with one change each: the offered `Accept` button gains classes —

```ts
        : `<button class="st-btn st-btn--ghost st-btn--sm" data-act="accept" data-id="${m.id}" aria-label="Accept contract: deliver ${m.qty} ${commodityName(m.commodity)} to ${NODES[m.destination].name}">Accept</button>`;
```

(the `active` mission template — `jump-link` buttons, hints, `aria-describedby` — stays byte-for-byte identical).

Add the panel function:

```ts
function tradeHubPanel(s: GameState, marketRows: string, missions: string, active: string): string {
  return `<section class="st-panel st-panel--tab">
    <header class="st-panel__header"><h2 class="st-panel__title">Trade Hub — ${NODES[s.location].name}</h2></header>
    <div class="st-panel__frame">
      <div class="st-panel__body st-panel__body--flush">
        <div class="st-market st-market--held">
          <div class="st-market__head">Market Commodities</div>
          ${marketRows}
        </div>
        <div class="st-panel__subhead">Contracts</div>
        <ul class="contract-list">${missions || "<li>None today.</li>"}</ul>
        <div class="st-panel__subhead">Active Contracts</div>
        <p class="hint trade-hint">Deliveries auto-complete when you arrive carrying the goods.</p>
        <ul class="contract-list">${active || "<li>None accepted. Accept a contract, buy its cargo, then jump to the destination.</li>"}</ul>
      </div>
    </div>
  </section>`;
}
```

In `stationScreen`'s returned template, the stage becomes:

```ts
      <div class="st-shell__stage">
        ${report}
        ${tradeHubPanel(s, marketRows, missions, active)}
      </div>
```

(the old Market/Contracts/Active `<section>` blocks are deleted).

- [ ] **Step 4: CSS — market glue and turn-report retokenization**

Append:

```css
.st-market--held .st-market__row {
  grid-template-columns: auto minmax(0, 1fr) auto auto auto;
}
.st-market__held {
  font-size: var(--st-text-sm);
  color: var(--st-text-dim);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.contract-list {
  list-style: none;
  margin: 0;
  padding: var(--st-space-1) 0;
}
.contract-list li {
  padding: var(--st-space-2) var(--st-space-3);
  font-size: var(--st-text-sm);
  border-bottom: 1px solid var(--st-border);
}
.contract-list li:last-child {
  border-bottom: 0;
}
.trade-hint {
  margin: var(--st-space-2) var(--st-space-3) 0;
}
```

Replace the legacy `.turn-report` / `.turn-report__title` / `.tr-line` / `.tr-icon` / `.tr-good` / `.tr-bad` / `.tr-neutral` rules and delete `@keyframes flash-in`:

```css
/* Turn report — class names are a test-asserted contract; style only. */
.turn-report {
  margin: 0 0 var(--st-space-4);
  padding: var(--st-space-2) var(--st-space-3);
  background: linear-gradient(90deg, var(--st-cyan-tint), transparent 130%);
  border: 1px solid var(--st-cyan-dim);
  border-left: 3px solid var(--st-cyan);
  border-radius: var(--st-radius-sm);
  animation: st-flash-in var(--st-dur-slow) ease-out;
}
.turn-report__title {
  margin: 0 0 6px;
  font-family: var(--st-font-display);
  font-size: var(--st-text-2xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--st-track-wide);
  color: var(--st-text-dim);
}
.tr-line {
  display: flex;
  gap: var(--st-space-2);
  align-items: baseline;
  padding: 3px 0;
  font-size: var(--st-text-sm);
  font-weight: 600;
}
.tr-line.tr-neutral {
  font-weight: 500;
}
.tr-icon {
  font-weight: 700;
}
.tr-good {
  color: var(--st-positive);
}
.tr-bad {
  color: var(--st-negative);
}
.tr-neutral {
  color: var(--st-text);
}
```

- [ ] **Step 5: Run all tests**

Run: `npm test && npm run lint && npm run format:check`
Expected: PASS — especially `stationScreen accessibility` and `ready contract jump control` (the contracts moved but their strings did not change).

- [ ] **Step 6: Visual check + commit**

Dev server: full cockpit now — Trade Hub tab window with icon rows and cyan/magenta buttons, contracts under subheads, turn report as a glowing banner after a jump.

```bash
git add src/ui/screens.ts src/ui/styles.css tests/ui/screens.test.ts
git commit -m "feat(ui): restyle market and contracts as trade hub window"
```

---

### Task 6: Event + run-end chamfer cards

**Files:**

- Modify: `src/ui/screens.ts:183-201` (`eventScreen`, `runEndScreen`)
- Modify: `src/ui/styles.css` (replace the `.event-card, .run-end` block)
- Test: `tests/ui/screens.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append (add `eventScreen`, `runEndScreen` to the existing import from `../../src/ui/screens`, and `GameEvent` to the type import from `../../src/engine/types`):

```ts
describe("event and run-end cards", () => {
  const event: GameEvent = {
    kind: "pirates",
    title: "Pirate ambush",
    description: "A cutter locks on.",
    choices: [{ id: "flee", label: "Flee" }],
  };

  it("wraps the event in a chamfered card and keeps resolve hooks", () => {
    const html = eventScreen(event);
    expect(html).toContain("st-panel--chamfer");
    expect(html).toContain('class="event-card"');
    expect(html).toContain('data-act="resolve" data-id="flee"');
  });

  it("wraps the run-end in a chamfered card and keeps restart/share hooks", () => {
    // Score 999 avoids locale-dependent thousands separators from toLocaleString.
    const html = runEndScreen(createGame(42), 999);
    expect(html).toContain("st-panel--chamfer");
    expect(html).toContain('class="run-end"');
    expect(html).toContain('data-act="share"');
    expect(html).toContain('data-act="restart"');
    expect(html).toContain("Score: 999");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui/screens.test.ts`
Expected: the two new tests FAIL (`st-panel--chamfer` absent).

- [ ] **Step 3: Replace both screen functions**

```ts
export function eventScreen(e: GameEvent): string {
  const choices = e.choices
    .map((c) => `<button class="st-btn" data-act="resolve" data-id="${c.id}">${c.label}</button>`)
    .join("");
  return `<div class="overlay-stage">
    <div class="st-glow-wrap">
      <div class="st-panel st-panel--chamfer"><div class="st-panel__inner">
        <div class="event-card">
          <h2>${e.title}</h2><p>${e.description}</p><div class="choices">${choices}</div>
        </div>
      </div></div>
    </div>
  </div>`;
}

export function runEndScreen(s: GameState, score: number): string {
  return `<div class="overlay-stage">
    <div class="st-glow-wrap">
      <div class="st-panel st-panel--chamfer"><div class="st-panel__inner">
        <div class="run-end">
          <h1>Run Over</h1>
          <p>You survived ${s.day} days.</p>
          <p class="score st-num">Score: ${score.toLocaleString()}</p>
          <p class="hint">Seed #${s.seed}</p>
          <button class="st-btn" data-act="share">Copy score card</button>
          <button class="st-btn st-btn--ghost" data-act="restart">New run</button>
        </div>
      </div></div>
    </div>
  </div>`;
}
```

- [ ] **Step 4: Replace the overlay CSS**

Replace the legacy `.event-card, .run-end { … }` and `.run-end .score { … }` rules with:

```css
.overlay-stage {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: var(--st-space-5);
}
.overlay-stage .st-panel--chamfer {
  width: 100%;
  max-width: 480px;
}
.event-card,
.run-end {
  text-align: center;
  padding: var(--st-space-6) var(--st-space-5);
}
.event-card h2,
.run-end h1 {
  margin: 0 0 var(--st-space-3);
  font-family: var(--st-font-display);
  font-size: var(--st-text-xl);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--st-text-hi);
}
.choices {
  display: flex;
  flex-wrap: wrap;
  gap: var(--st-space-2);
  justify-content: center;
  margin-top: var(--st-space-4);
}
.run-end .score {
  font-size: var(--st-text-2xl);
  font-weight: 700;
  color: var(--st-accent-currency);
  text-shadow: var(--st-text-glow-gold);
}
.run-end button {
  margin: var(--st-space-1);
}
```

- [ ] **Step 5: Run all tests, visual check, commit**

Run: `npm test && npm run lint && npm run format:check` — expected PASS. Dev server: trigger a jump to see the event card (chamfered, glowing, centered).

```bash
git add src/ui/screens.ts src/ui/styles.css tests/ui/screens.test.ts
git commit -m "feat(ui): chamfered event and run-end cards"
```

---

### Task 7: Retire legacy CSS, tokenize survivors

**Files:**

- Modify: `src/ui/styles.css`

- [ ] **Step 1: Delete dead rules**

All markup they styled is gone; delete these blocks entirely:

- `header { … }` (the Task-1 transitional rule) and `header h1 { … }`
- `.stats { … }`
- `section { … }`
- `table { … }`, `th, td { … }`, `thead th { … }`, `tbody th { … }`
- `button { … }`, `button:disabled { … }` (every button now carries `st-btn` or `jump-link` classes)
- `.routes { … }`

- [ ] **Step 2: Retokenize the surviving legacy contract classes**

Replace the remaining legacy rules with:

```css
/* Legacy contract classes — names are load-bearing (tests/markup), values tokenized. */
.hint {
  font-size: var(--st-text-xs);
  color: var(--st-text-dim);
  margin: 0 0 var(--st-space-2);
}
.good {
  color: var(--st-positive);
  font-size: var(--st-text-sm);
}
.bad {
  color: var(--st-negative);
  font-size: var(--st-text-sm);
}
.jump-link {
  background: none;
  border: 0;
  padding: 0;
  margin: 0;
  font: inherit;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.jump-link:hover:not(:disabled) {
  color: var(--st-cyan-bright);
}
.jump-link:disabled,
.jump-link[aria-disabled="true"] {
  text-decoration: none;
  cursor: not-allowed;
}
.jump-link:focus-visible {
  outline: 2px solid var(--st-focus-ring);
  outline-offset: 2px;
}
.stat-critical {
  color: var(--st-negative);
  font-weight: 700;
}
.stat-warn {
  color: var(--st-gold-bright);
  font-weight: 600;
}
.accepted {
  color: var(--st-positive);
  font-size: var(--st-text-sm);
  opacity: 0.85;
}
.fee {
  color: var(--st-accent-currency);
}
```

- [ ] **Step 3: Sanity scan**

Run: `grep -n "#" src/ui/styles.css | grep -v "var(--" | grep -vE "^\s*[0-9]+:\s*/\*"`
Expected: no raw hex colors left in `styles.css` (they live only in `tokens.css` and `art.ts`).

- [ ] **Step 4: Full gates**

Run: `npm test && npm run lint && npm run format:check && npm run build`
Expected: all pass (`build` runs `tsc` + `vite build`).

- [ ] **Step 5: Commit**

```bash
git add src/ui/styles.css
git commit -m "refactor(ui): retire legacy styles and tokenize survivors"
```

---

### Task 8: Browser verification pass

**Files:** none planned — fix-forward anything found (each fix gets its own small commit).

- [ ] **Step 1: Desktop pass (1280×800)**

Dev server → play one full turn: buy, accept a contract, jump, resolve the event, arrive. Verify against the concept: three rails populated; Trade Hub tab window; segmented gold fuel bar drops after the jump; turn-report banner flashes in; no console errors.

- [ ] **Step 2: Threshold states**

Refuel down / burn fuel until below 6 (warn: statbar chip gold) and below 3 (critical: orange pulsing fuel bar). Verify the pulse stops under OS reduced-motion.

- [ ] **Step 3: Mobile pass (375×812)**

Single column in the order statbar → turn report → Trade Hub → Navigator → Cargo → Logistics → Log; statbar sticky while scrolling; buttons comfortably tappable.

- [ ] **Step 4: Keyboard pass**

Tab through market buttons and orbs — cyan focus ring everywhere; `jump-link` with `aria-disabled` still focusable but inert.

- [ ] **Step 5: Run-end + share**

Play (or debt-spiral) to a run end — chamfered card, gold score, share button copies.

- [ ] **Step 6: Final gates + wrap-up**

Run: `npm test && npm run lint && npm run format:check && npm run build`
Expected: all green. Lighthouse budgets are enforced by CI on push (`.lighthouserc.json`).

If anything was fixed during this task:

```bash
git add -A && git commit -m "fix(ui): polish from browser verification pass"
```

---

## Execution notes

- Tasks are strictly ordered; each ends with the game playable and `npm test` green.
- Never edit an existing test to make it pass — those are the transformation's safety net. If one fails, the markup broke a contract; fix the markup.
- `npm run format` before each commit if `format:check` complains; Prettier owns whitespace.
- Do not modify `src/ui/tokens.css` or `src/ui/design-system.css` in this plan; all screen-specific styling belongs in `styles.css` as glue.
