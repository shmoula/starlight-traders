# Astro-Neon Design System

**Starlight Traders · v1 · 2026-07-17**

The visual language of the Starlight Traders HUD, extracted from the approved concept art
into implementable tokens and components. The UI reads as a clean, glowing holographic
tactical cockpit: deep-space canvas, translucent steel-blue modules, and four neon accents
that always mean the same thing.

| File                                                         | Role                                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| [`src/ui/tokens.css`](../../src/ui/tokens.css)               | Design tokens as CSS custom properties — the source of truth          |
| [`src/ui/design-system.css`](../../src/ui/design-system.css) | Component classes (`st-` prefix), safe to import alongside legacy CSS |
| [`docs/design/tokens.json`](tokens.json)                     | Token mirror for design tooling (keep in sync with tokens.css)        |
| [`docs/design/styleguide.html`](styleguide.html)             | Living style guide — every token and component rendered               |

View the style guide through the dev server: `npm run dev` →
`http://localhost:5173/docs/design/styleguide.html`.

---

## 1. Aesthetic rules

These are the rules that make a screen read as "Astro-Neon". Break one and the cockpit
illusion collapses.

1. **Dark canvas, luminous data.** The page is a near-black gradient (`#0b1520 → #060a0f`);
   panels are translucent blue-grey; only _meaningful_ elements glow. If everything glows,
   nothing does — one pulsing alert per screen, at most.
2. **Color is functional, never decorative.** Every accent is a category:
   - **Cyan** — interactive: navigation, buttons, active states, ship systems (Hull).
   - **Gold** — value and energy: credits, fees, luxury cargo (Rare Earths), the fuel bar.
   - **Magenta** — divestment: Sell actions.
   - **Orange** — hazard: warnings, pirates, critical states.
     A gold button or a magenta heading is a bug.
3. **Chrome whispers, values speak.** Labels are small, uppercase, letterspaced, dim.
   Values are brighter, heavier, tabular. The eye should land on `12,500 CR`, not on
   "CREDITS".
4. **Geometry over ornament.** Angled header tabs, chamfered corners, segmented bars —
   the sci-fi flavor comes from shape, not from texture or gradients on content.
5. **Everything lives in a module.** No floating text on the starfield. If it's data, it's
   inside a `PanelCard`.

---

## 2. Design tokens

Tokens are CSS custom properties in [`tokens.css`](../../src/ui/tokens.css), prefixed
`--st-`. Two tiers: **primitives** (raw values) and **semantic aliases** (roles).
Components reference the semantic tier where a role exists.

### 2.1 Backgrounds

| Token                  | Value                   | Use                                |
| ---------------------- | ----------------------- | ---------------------------------- |
| `--st-bg-space`        | `#060a0f`               | Page gradient bottom               |
| `--st-bg-nebula`       | `#0b1520`               | Page gradient top                  |
| `--st-bg-panel`        | `rgba(13, 27, 42, .82)` | Module fill (translucent)          |
| `--st-bg-panel-solid`  | `#0d1b2a`               | Opaque fallback, segment gap color |
| `--st-bg-header-hi/lo` | `#1b3144` / `#112233`   | Panel header gradient              |
| `--st-bg-inset`        | `#081119`               | Wells: bar tracks, empty slots     |
| `--st-bg-row-alt`      | `rgba(126,190,228,.04)` | Zebra striping                     |

The page backdrop is the `.st-app-bg` utility: two faint radial nebula pools over the
vertical gradient. Starfield/orbit art belongs on a separate decorative layer (`--st-z-bg`).

### 2.2 Neon accents

Each accent ships in four strengths. Use them by role, not by taste:

- **core** — icon glyphs, bar fills, borders of active elements
- **bright** — text on dark fills (higher luminance for contrast)
- **dim** — resting borders and dividers (rgba ~40–50%)
- **tint** — translucent fills behind text (rgba ~10–14%)

| Accent  | core      | bright    | Category (semantic alias)                      |
| ------- | --------- | --------- | ---------------------------------------------- |
| Cyan    | `#00d9ff` | `#8ceeff` | `--st-accent-interactive` — nav, buttons, Hull |
| Gold    | `#ffb84d` | `#ffd89a` | `--st-accent-currency` — credits, Rare Earths  |
| Magenta | `#ff4d97` | `#ff9ac4` | `--st-accent-consumable` — fuel, Sell          |
| Orange  | `#ff9838` | `#ffcf96` | `--st-accent-alert` — warnings, pirates        |

Support tones (deltas only, never on borders/headers): `--st-positive #57e6a8`,
`--st-negative #ff6a55` — for profit/loss readouts like the existing `.good`/`.bad`.

### 2.3 Text & borders

| Token                | Value                   | Contrast on panel fill | Use                          |
| -------------------- | ----------------------- | ---------------------- | ---------------------------- |
| `--st-text-hi`       | `#eaf6fb`               | ~15:1                  | Values, numbers              |
| `--st-text`          | `#c2d6e2`               | ~11:1                  | Body copy                    |
| `--st-text-dim`      | `#8ba5b7`               | ~6.7:1                 | Labels, captions             |
| `--st-text-faint`    | `#5d7789`               | ~3.7:1 (AA large only) | Decorative separators only   |
| `--st-text-title`    | `#cfe9f4`               | ~12:1                  | Panel header titles          |
| `--st-border`        | `rgba(120,170,196,.24)` | —                      | Hairlines, dividers          |
| `--st-border-panel`  | `rgba(86,164,196,.32)`  | —                      | Module outlines (steel-cyan) |
| `--st-border-strong` | `rgba(0,217,255,.55)`   | —                      | Active/selected outlines     |

Gold and cyan core values sit at ~10:1 on the panel fill, so prices and stats stay
readable. `--st-text-faint` fails AA for body text — never put information in it alone.

### 2.4 Glow recipes

Glows are pre-baked `box-shadow` lists — never hand-roll shadows:

```
--st-glow-cyan:  0 0 2px rgba(0,217,255,.55), 0 0 10px rgba(0,217,255,.35), 0 0 22px rgba(0,217,255,.15)
--st-glow-gold / --st-glow-magenta / --st-glow-orange   (same three-layer recipe)
--st-glow-panel: 0 0 0 1px rgba(0,217,255,.05), 0 0 18px rgba(0,217,255,.07), 0 10px 30px rgba(0,0,0,.45)
--st-text-glow-cyan / --st-text-glow-gold                (text-shadow variants)
```

The recipe is always: **2px crisp edge → 10px halo → 22px ambient falloff**. Panels get the
ambient `--st-glow-panel`; saturated accent glows are reserved for hover, active, and alert
states.

### 2.5 Typography

| Token               | Value                                           |
| ------------------- | ----------------------------------------------- |
| `--st-font-display` | `"Orbitron", "Exo 2", ui-sans-serif, system-ui` |
| `--st-font-body`    | `"Exo 2", ui-sans-serif, system-ui, "Segoe UI"` |
| `--st-font-mono`    | `ui-monospace, "SF Mono", Menlo, Consolas`      |

Sizes: `10 / 11 / 13 / 14 / 16 / 20 / 28px` (`--st-text-2xs … --st-text-2xl`).
Tracking: `0.04em` display, `0.08em` uppercase labels, `0.14em` panel titles.

- **Display (Orbitron)** — panel titles, screen title, tab-header text. Always uppercase +
  wide tracking. Never for body copy.
- **Body (Exo 2)** — everything else. Dense numbers use body + `font-variant-numeric:
tabular-nums` (the `.st-num` utility) rather than a monospace: columns align without
  mono's low density.
- **Webfonts are opt-in.** The stacks degrade gracefully to system fonts. For production,
  self-host the two families (WOFF2, weights 400/600/700 body, 500–700 display) rather than
  hitting Google's CDN at runtime; the style guide uses the CDN for convenience only.

### 2.6 Spacing, radii, motion, z

- **Spacing**: 4px base grid — `--st-space-1…8` = `4, 8, 12, 16, 20, 24, 32, 48`.
  Rhythm constants: panel padding `--st-pad-panel` (12), data row `--st-row-h` (40),
  compact control `--st-control-h` (26).
- **Radii**: `3 / 5 / 8 / 12px` (`xs/sm/md/lg`); `--st-chamfer: 14px` is the corner-cut and
  tab-slant run.
- **Motion**: `120ms` hovers, `200ms` fills/fades, `350ms` entrances, one shared ease
  `cubic-bezier(0.2, 0.7, 0.3, 1)`. Every animation must respect `prefers-reduced-motion`
  (the component sheet disables all `st-` animation/transitions globally under it).
- **Z-layers**: `0` starfield · `10` HUD panels · `50` overlays/event cards · `90` toasts.

---

## 3. Components

All classes live in [`design-system.css`](../../src/ui/design-system.css), prefixed `st-`,
BEM-ish (`st-panel__header`, `st-btn--sell`). No bare element selectors — importing the
sheet changes nothing until classes are applied.

### 3.1 PanelCard

The universal HUD module. Anatomy:

```
┌─ st-panel ─────────────────────────────┐
│ st-panel__header (gradient strip)      │  ← __title + __controls (__toggle)
├────────────────────────────────────────┤
│ st-panel__body (12px pad | --flush 0)  │
│ st-panel__subhead (secondary strip)    │  ← optional, e.g. "CURRENT MISSION"
│ st-panel__body                         │
└────────────────────────────────────────┘
```

```html
<section class="st-panel">
  <header class="st-panel__header">
    <h3 class="st-panel__title">Ship Logistics</h3>
    <div class="st-panel__controls">
      <button
        class="st-panel__toggle"
        type="button"
        aria-expanded="true"
        aria-label="Collapse panel"
      >
        ︿
      </button>
    </div>
  </header>
  <div class="st-panel__body">…</div>
</section>
```

| Variant       | Class + required structure                          | Use                                          |
| ------------- | --------------------------------------------------- | -------------------------------------------- |
| Default       | `st-panel`                                          | Rail modules (Navigator, Cargo, Logistics)   |
| Header tab    | `st-panel--tab` + body wrapped in `st-panel__frame` | Featured center-stage windows (Trade Hub)    |
| Chamfered     | `st-panel--chamfer` + `st-panel__inner` wrapper     | Overlays, event cards — strongest silhouette |
| Frosted glass | add `st-panel--glass`                               | Only on surfaces floating over live content  |

Implementation notes (the non-obvious bits):

- **Tab variant**: the container drops its own frame; the header becomes an inline-flex tab
  clipped with `polygon(0 0, calc(100% - 14px) 0, 100% 100%, 0 100%)` and overlaps the
  framed body by `-1px` so they fuse.
- **Chamfer + borders**: a CSS border cannot follow a `clip-path`. The variant paints the
  border as a 1px-padded backing layer and clips both layers with the same polygon — that is
  why `__inner` is required and why this variant uses the solid fill.
- **Chamfer + glow**: `box-shadow` is clipped away by `clip-path`. Wrap the panel in
  `.st-glow-wrap`, which applies `filter: drop-shadow(…)` to the clipped silhouette.
- **Zebra bleed**: use `st-panel__body--flush` so data-grid stripes run edge-to-edge.
- `overflow: hidden` on the panel keeps header gradients and stripes inside the radius —
  anchor popovers outside the panel, not inside.

Accessibility: title is a real heading (`h2–h4` per page outline); collapse toggles carry
`aria-expanded` + `aria-label`.

### 3.2 Buttons

```html
<button class="st-btn" type="button">Buy</button>
<button class="st-btn st-btn--sell" type="button">Sell</button>
<button class="st-btn st-btn--ghost" type="button">Pay All</button>
<button class="st-btn st-btn--sm" type="button">Buy</button>
<!-- 22px, for dense rows -->
```

Outline style: transparent fill, `dim` border, `bright` text, uppercase 11px. Variants remap
five local channels (`--btn-core/bright/dim/tint/glow`) — that's the whole theming API:

| Variant   | Accent        | Meaning                         |
| --------- | ------------- | ------------------------------- |
| (default) | cyan          | Acquire / confirm / interactive |
| `--sell`  | magenta       | Dispose / spend                 |
| `--ghost` | neutral steel | Utility: PAY ALL, MISSION LOG   |

States: hover = tint fill + core border + glow; active = 1px press + brighten; disabled =
35% opacity, no glow; focus = 2px cyan `outline` offset 2px (`:focus-visible` only).

### 3.3 MarketRow

Grid columns `auto | 1fr | auto | auto`: icon box · name · price pair · actions. 40px rows,
zebra via `nth-child(even)`.

```html
<div class="st-market">
  <div class="st-market__head">Market Commodities</div>
  <div class="st-market__row">
    <span class="st-icon-box st-icon-box--gold" aria-hidden="true"><svg>…</svg></span>
    <span class="st-market__name">Rare Earths</span>
    <span class="st-market__prices st-num">
      <span class="st-market__buy-price">120 CR</span>
      <span class="st-market__price-sep">/</span>
      <span class="st-market__sell-price">135 CR</span>
    </span>
    <span class="st-market__actions">
      <button class="st-btn st-btn--sm" type="button" aria-label="Buy Rare Earths">Buy</button>
      <button class="st-btn st-btn--sell st-btn--sm" type="button" aria-label="Sell Rare Earths">
        Sell
      </button>
    </span>
  </div>
  …
</div>
```

Rules:

- **Buy price is `text-hi` (what it costs); sell price is gold (what you gain).** The gold
  number is the one traders scan for.
- Prices right-align through the grid and use tabular numerals — never proportional digits
  in a column.
- Buy/Sell buttons carry the commodity in `aria-label`; the visible label stays terse.
- The current game renders the market as a semantic `<table>` — that's fine: keep the
  table, apply the same tokens (row height, zebra, price colors, button classes) to
  `tr/td`. The div-grid blueprint is for new screens where table semantics aren't needed.

### 3.4 ProgressBar

One markup, two skins. Fill level is an inline custom property — no width math in JS
templates beyond the percentage itself.

```html
<!-- Continuous (Hull) -->
<div
  class="st-bar"
  role="meter"
  aria-label="Hull integrity"
  aria-valuenow="95"
  aria-valuemin="0"
  aria-valuemax="100"
  style="--st-value: 95%"
>
  <div class="st-bar__fill"></div>
</div>

<!-- Segmented energy blocks (Fuel), 10 cells by default -->
<div
  class="st-bar st-bar--segmented st-bar--gold"
  role="meter"
  aria-label="Fuel"
  aria-valuenow="80"
  aria-valuemin="0"
  aria-valuemax="100"
  style="--st-value: 80%; --st-segments: 10"
>
  <div class="st-bar__fill"></div>
</div>
```

- The segmented skin is a striped `::after` overlay that slices the fill into cells
  (`repeating-linear-gradient` with a `calc(100% / var(--st-segments))` period) — markup
  stays identical across variants. Snap `--st-value` to whole cells in game code when the
  quantity is discrete (8/10 fuel → `80%`).
- Color: cyan default (`Hull`), `--gold` for fuel/energy. Threshold states: `--warn`
  (gold) and `--critical` (orange + slow opacity pulse). Suggested game mapping: warn below
  40%, critical below 20% — mirrors the existing `.stat-warn` / `.stat-critical` logic.
- Pair with `.st-bar-label` (`FUEL … 80%`) — label left, tabular value right.
- 16px track, 2px inner padding, inset well background so fills read as energy inside a
  housing.

### 3.5 StatusBadge

Message banners and inline status chips.

```html
<div class="st-badge st-badge--alert st-badge--pulse" role="status">
  <svg class="st-badge__icon" …>…</svg>
  Pirate activity reported: Cygnus orbit
</div>
```

| Variant     | Accent | Use                            |
| ----------- | ------ | ------------------------------ |
| (default)   | cyan   | Info: docking clearance, tips  |
| `--alert`   | orange | Hazards: pirates, deadlines    |
| `--success` | mint   | Completed contracts, profits   |
| `--danger`  | red    | Damage, failures, broke states |

Anatomy: 3px accent left rule, 1px dim border, tint gradient fill, uppercase 11px bright
text, 18px monoline icon. `--pulse` fades a glow layer in and out for _unacknowledged_
alerts — remove the class once seen, keep at most one pulsing element per screen. The pulse
animates a pseudo-element's **opacity** (compositor-friendly), and dies under
`prefers-reduced-motion`.

Never rely on color alone: every variant pairs an icon shape with the hue (triangle=alert,
circle=info, check=success, cross=danger).

### 3.6 Supporting patterns

- **`st-icon-box`** — 30px rounded bounding box: category tint fill + dim border + core
  glyph. Variants `--gold/--magenta/--orange` (cyan default).
- **`st-kv`** — label/value line for logistics readouts. `__value--gold` for currency
  (with text glow), `__value--cyan` for ship systems.
- **`st-tile`** — cargo slot: icon box + name + quantity, category-tinted border and
  left-fading fill (`--gold/--magenta`).
- **`st-orb`** — navigator planet button: 44px sphere (`--orb-art` radial-gradient per
  planet) + uppercase label; active = cyan ring + glow + `aria-pressed="true"`.
- **`st-tabbar` / `st-tab`** — dock navigation: icon over 10px uppercase label, hairline
  dividers; active tab gets cyan tint + inset top notch (`inset 0 2px 0` cyan) +
  `aria-current="page"`.

---

## 4. Iconography

Monoline, minimalist, geometric — icons read as etched HUD glyphs, not illustrations.

- `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="1.75"`,
  round caps and joins. Rendered at 16–18px.
- Icons never carry their own color: they inherit from the `st-icon-box` (or parent), which
  ties them to the category accent.
- One concept per glyph, ≤ 5 paths: crate=cube, water=droplet, fuel=crystal, alert=triangle.
  No fills, no duotone, no detail that dies at 16px.

```html
<span class="st-icon-box st-icon-box--gold" aria-hidden="true">
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linejoin="round"
    stroke-linecap="round"
  >
    <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3z" />
    <path d="M4 7.5l8 4.5 8-4.5" />
    <path d="M12 12v9" />
  </svg>
</span>
```

Icons are decorative next to a text label (`aria-hidden="true"`); icon-only controls need
an `aria-label`.

---

## 5. Layout principles

### 5.1 The HUD shell

Every gameplay screen is the same fixed cockpit; only the center stage changes.

```
┌──────────────────────────────────────────────────────────────┐
│ st-app-bg (starfield / orbit art, z-0)                       │
│ ┌─ rail 260px ─┐  ┌─ stage 1fr ────────┐  ┌─ rail 300px ──┐  │
│ │ NAVIGATOR    │  │                    │  │ SHIP LOGISTICS│  │
│ │ CARGO        │  │   TRADE HUB (tab   │  │ MESSAGES      │  │
│ │              │  │   panel, floats)   │  │               │  │
│ └──────────────┘  └────────────────────┘  └───────────────┘  │
│                                    st-tabbar (bottom-right) ─┘│
└──────────────────────────────────────────────────────────────┘
```

`st-shell` = `grid-template-columns: 260px minmax(0, 1fr) 300px`, 16px gaps, 20px page
padding, `align-items: start`. Rails are `st-shell__rail` (vertical grids, 16px gaps);
the center is `st-shell__stage`.

- **Left rail** = where you can go / what you carry. **Right rail** = ship state & feed.
  **Stage** = the current activity. New screens (Station, Navigation, Settings) swap the
  stage contents and keep both rails, so the cockpit never "changes rooms".
- Overlays (event cards, run-end) mount on the stage at `--st-z-overlay`, ideally as
  `st-panel--chamfer st-panel--glass` — the one sanctioned use of blur.

### 5.2 Density rhythm

Consistent vertical rhythm is what makes the dashboard feel engineered:

- Panel header 30px · data row 40px · compact control 26px · bar track 16px.
- Everything snaps to the 4px grid; panel padding is always 12px, rail gaps always 16px.
- One panel = one concern (navigation, cargo, logistics, messages). If a panel needs a
  second scrollbar or a third subhead, split it.

### 5.3 Responsive collapse

The shell collapses in content-priority order:

- `<1100px` — right rail drops below as a two-up row (`st-shell__rail--right` spans full
  width); stage keeps priority.
- `<760px` — single column: stage → logistics → messages → navigation/cargo; the tab bar
  hugs the bottom edge full-width. Touch targets stay ≥ 40px (rows already are; `--sm`
  buttons grow to full row height inside touch layouts).

### 5.4 Motion & performance budget

- Entrances: `st-flash-in` (350ms fade+drop) — already matches the game's turn-report.
  State changes: 200ms fills. Hovers: 120ms.
- **Animate only `opacity` and `transform`.** The pulse pattern (glow on a pseudo-element,
  opacity keyframes) exists because animating `box-shadow`/`filter` repaints the blur
  region every frame.
- `backdrop-filter` is opt-in (`st-panel--glass`) and reserved for overlays: a blur behind
  every HUD module re-blurs the whole backdrop on each scroll/animation frame.
- Budget: ≤ 1 pulsing element, ≤ 1 glass surface per screen; panel glows use the shared
  ambient recipe, not per-panel custom shadows.

### 5.5 Accessibility

- Text on panel fill: ≥ 4.5:1 for all information-bearing tokens (see §2.3);
  `--st-text-faint` is decorative only.
- Category color is always paired with a second signal: icon shape, label, or position.
- Focus is always the 2px cyan `:focus-visible` ring — never remove, never restyle per
  component.
- Bars are `role="meter"` with value attributes; badges announcing runtime events use
  `role="status"`.
- All motion honors `prefers-reduced-motion: reduce` (blanket kill in the component sheet).

---

## 6. Adopting the system in the current game

The sheets are import-safe next to the legacy `styles.css`:

```css
/* styles.css, first lines */
@import "./tokens.css";
@import "./design-system.css";
```

Migration map (screen by screen, no big-bang needed):

| Today (`styles.css` / `screens.ts`)    | Astro-Neon replacement                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| `body` flat `#0b1020`                  | `st-app-bg` gradient utility                                                           |
| `header` + `.stats` strip              | `st-panel` + `st-kv` rows (credits gold, fuel/hull cyan)                               |
| `section` boxes                        | `st-panel` with `__header`/`__title`/`__body`                                          |
| Market `<table>` + buy/sell `button`s  | Keep table semantics; apply row/price tokens + `st-btn st-btn--sm` (`--sell` on sells) |
| `.routes` destination buttons          | `st-orb` group (or ghost `st-btn`s while art lands)                                    |
| `.turn-report` banner                  | `st-panel` + `st-badge` lines (`--success`/`--danger`)                                 |
| `.stat-warn` / `.stat-critical` colors | `st-bar--warn` / `st-bar--critical` + kv value colors                                  |
| `.log-entries` feed                    | Messages `st-panel` with dim rows / `st-badge` events                                  |
| `.event-card`                          | `st-panel--chamfer st-panel--glass` overlay on stage                                   |
| `.good` / `.bad`                       | `--st-positive` / `--st-negative`                                                      |

Conventions when extending:

- New component classes are `st-` + BEM-ish; theme through local channel custom properties
  (the `--btn-*` / `--badge-*` pattern) so variants stay one-liners.
- New category = four strengths + a glow recipe in `tokens.css` **and** `tokens.json`.
- Reach for a semantic alias (`--st-accent-currency`) before a primitive (`--st-gold`);
  if neither fits, the token set — not the component — is what needs extending.
