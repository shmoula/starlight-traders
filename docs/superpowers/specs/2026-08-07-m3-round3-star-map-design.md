# M3 Round 3 — "The Map Is the Territory" (E2-3)

**Date:** 2026-08-07 · **Status:** draft — awaiting review
**Source:** [ROADMAP.md](../../ROADMAP.md) Milestone 3 (sequence decided 2026-08-01:
E2-3 after the texture rounds, before E2-1's sim gate); spec in
[ENGAGEMENT_BACKLOG.md](../../ENGAGEMENT_BACKLOG.md) row E2-3.

## Scope

One round, one L-size feature — matching the M+S budget of rounds 1 and 2.
Theme: **danger belongs to the lane, not the destination — and the player should
see the geometry they're navigating.**

The problem (E2-3, backlog): danger is destination-only (events.ts:13 reads
`NODES[to].danger`), so routing around danger is impossible by construction — no
path decisions exist; the Navigator is a menu, not a map. The original spec's
Star Map never shipped.

**In scope:**

- **E2-3a Per-edge danger** — a 10-entry `EDGE_DANGER` table (one entry per
  unordered station pair) replaces `StationNode.danger` as the single source of
  danger truth. `pirateChance(from, to)` becomes a table lookup.
- **E2-3b Authored detour decisions** — edge values tuned so at least one real
  "cheap-and-raided direct vs. longer-and-safe detour" choice exists per
  destination class (Meridian is the headline; the Verge deliberately has no
  safe approach).
- **E2-3c Star map** — inline SVG in the Navigator panel: five nodes laid out
  safe-west/rich-east, current location marked, the four incident lanes
  emphasized and labeled (fuel + raid %), Meridian as the glittering weenie.
  Pointer-only click targets; the orb list remains the accessible surface.
- **E2-3d Per-edge surfaces** — the orb metas and tooltips show the raid % of
  the lane from _here_, and bulletin line 3 names the riskiest lane instead of
  the riskiest station.

**Explicitly out of scope (deferred):** heat reddening the map over days (E1-5 —
gated on playtest); any change to the fuel `DISTANCE` matrix, prices, fees, or
taxes (economy is byte-identical); achievements/calendar (E2-5); market depth +
contract reward re-anchoring (E2-1 + E2-2f — dead last, bundled); settlement-order
UI (E2-2g); map animation beyond a `prefers-reduced-motion`-guarded weenie halo;
pathfinding aids (multi-hop route suggestions — the player does the planning,
that's the game).

## Decisions

1. **The edge table is the single truth — `StationNode.danger` is removed.**
   `EDGE_DANGER` lives in world.ts beside `DISTANCE` and stores the _final_
   ambush probability per lane. The number shown is the number rolled: no
   floor-plus-slope formula between the table and the UI, so E1-4's honesty
   contract ("the UI shows the number the engine rolls with") holds by
   construction. The old universal 10% floor becomes an authored 5% floor,
   test-enforced: every lane ∈ [0.05, 0.35] — no lane is ever "0%".
2. **Lookup by canonical key, symmetric by construction.** `edgeKey(a, b)`
   sorts the two node ids; `EDGE_DANGER` is keyed on the sorted pair, so
   asymmetry is unrepresentable (same property `DISTANCE` only promises by
   convention). `pirateChance(from, to)` throws on a missing edge, matching
   `fuelCost`'s contract.
3. **Authored values, anchored to today's geometry.** Starting table (plan-time
   tuning may adjust within the [0.05, 0.35] band to keep sim bands green):

   | Lane            | Raid % | Was (dest-based) | Story                        |
   | :-------------- | :----: | :--------------: | :--------------------------- |
   | terra–kiruna    |   5%   |       10%        | patrolled core               |
   | terra–meridian  |   6%   |       19%        | the patrolled corridor       |
   | terra–vulcan    |   7%   |      16.75%      | patrolled core               |
   | kiruna–vulcan   |   8%   |      16.75%      | patrolled core               |
   | vulcan–meridian |  20%   |       19%        | direct but raided            |
   | kiruna–meridian |  22%   |       19%        | long and lawless             |
   | terra–verge     |  25%   |      32.5%       | frontier — no safe approach  |
   | vulcan–verge    |  28%   |      32.5%       | frontier — "watch the lanes" |
   | kiruna–verge    |  30%   |      32.5%       | frontier                     |
   | meridian–verge  |  30%   |      32.5%       | frontier                     |

   The headline decision this buys: **Meridian direct (6–8⛽ at 20–22%) vs. via
   Terra (+1 day, +2–1⛽ net, Terra's 1.6× dock fee, at 5–6% per leg)**. Deadline
   pressure from contracts keeps the direct lane alive; the detour prices
   safety in days and fees. The Verge stays dangerous from everywhere — exactly
   what its dossier already voices ("no help when the raiders come").

4. **`pirateChance(from, to)` — all three consumers already hold both ids.**
   `rollEvent` has `from`/`to`; the navigator orb loop has `s.location`; the
   bulletin switches from riskiest _station_ to riskiest _lane_ (decision 6).
   No new state, no snapshot change — danger is world data, not game state, so
   storage and the v3 snapshot are untouched.
5. **Station-level threat is derived where fiction needs it.**
   `safestApproach(id) = min(EDGE_DANGER over incident lanes)` replaces
   `NODES[id].danger` in the dossier presence test: a station whose _safest_
   way in is still dangerous (≥ 0.1) must voice that consequence. Only the
   Verge qualifies (min 25% — no safe approach exists), matching its prose
   exactly. The max would be wrong here: every station has a Verge lane at
   ≥ 25%, which would falsely demand danger-prose from Terra and Kiruna.
   Vulcan's "watch the approach lanes" stays true (its Verge lane runs 28%)
   and stays pinned by the existing per-station keyword test — it just isn't
   forced by the threat rule.
6. **Bulletin line 3 names the riskiest lane.** With per-edge danger, "chatter
   thick on the approach to X" no longer parses — approaches differ. New line:
   `${capFirst(crewName(seed))} chatter thick on the ${nameA}–${nameB} lane`,
   naming the max-danger edge (deterministic; ties broken by key order).
   Worst case (longest crew "the Hollow Crown" + "Kiruna Belt–Meridian") is
   63 chars — inside the 70-char budget, test-enforced.
7. **The map is a pointer-only enhancement; the orb list stays the accessible
   surface.** The SVG container is `aria-hidden="true"` — honest, because every
   fact on the map (fuel, dock fee, raid %) is already in the orb metas, which
   now show per-edge numbers. No focusable elements inside the hidden subtree
   (SVG shapes are not focusable by default; no `tabindex` is added), so the
   a11y contract is clean. Map nodes carry `data-act="jump" data-id="<node>"`
   and `aria-disabled="true"` when fuel is short — the same attributes the
   delegation already honors.
8. **One-line delegation widen in main.ts.** `closest("button")` →
   `closest("button, [data-act]")` (line 286). Buttons keep working unchanged
   (`act === undefined` falls through, as today); SVG `<g data-act>` becomes
   clickable. The `aria-disabled` guard and `dataset` reads work on
   `SVGElement` as they do on `HTMLElement`. Focus-restore selectors
   (main.ts:165) are unaffected: after a jump the destination is current, so
   no jump control with that id exists to collide with.
9. **Only incident lanes are labeled.** K5 has 10 edges and any full labeling
   collides in the center. The map re-renders per location anyway (it lives in
   the navigator panel), so: the 4 lanes from the current node render at full
   opacity with a `fuel⛽ · raid%` label and a tone class by danger band
   (<10% safe / <20% warn / ≥20% hot — same tone tokens the log uses); the
   other 6 render dimmed, unlabeled, non-interactive. The map always answers
   "where can I go from here, at what cost" — same question the orb list
   answers, same per-location scoping.
10. **Hand-laid layout, safe-west/rich-east.** Fixed coordinates in the map
    module (no layout algorithm): Kiruna far west, Vulcan south-west, Terra
    center, Meridian east, Verge far north-east. Meridian is the weenie:
    larger halo ring, static glow; any pulse animation is wrapped in
    `@media (prefers-reduced-motion: no-preference)`. Node art reuses the
    existing `ORB_ART` gradients so the map and the orb list read as one
    system.
11. **Sim bands move — property gates stay, fixtures don't exist.** This round
    changes mechanics (unlike round 2's byte-identical rule). The sweep tests
    are property bands (≥95% cautious/balanced audited, greedy deaths in
    [10%, 40%], greedy outearns cautious) and remain the gate; the 100-seed
    sweep runs before and after, both summaries are recorded in the plan
    review. If a band breaks, the edge table is retuned within decision 3's
    story (core stays safest, Verge stays hostile) — the test is not loosened.

## Build order

1. **world.ts edge table** — `EDGE_DANGER`, `edgeKey`, `safestApproach`; remove
   `StationNode.danger` (types.ts); world tests (coverage, symmetry, bounds).
2. **events.ts + bulletin.ts** — `pirateChance(from, to)`; band math unchanged
   otherwise; bulletin riskiest-lane line. Engine-complete and green before any
   UI change.
3. **fiction test rekey** — dossier presence test reads `safestApproach`.
4. **Map module + navigator** — `src/ui/map.ts` (layout constants + SVG
   renderer), navigator panel embeds it above the orb list; orb metas read
   per-edge `pirateChance(s.location, n)` (mechanical change already done in
   step 2 — this is just the call site); styles.css map classes.
5. **main.ts delegation widen** — one line + a regression test that buttons
   without `data-act` still no-op.
6. **Sim sweep** — run 100-seed sweep, record before/after bands, retune table
   if a property gate breaks.

## 1. Engine — world.ts, events.ts, bulletin.ts

```ts
// world.ts
export type EdgeKey = `${NodeId}-${NodeId}`; // sorted pair, e.g. "kiruna-terra"
export function edgeKey(a: NodeId, b: NodeId): EdgeKey;
export const EDGE_DANGER: Record<EdgeKey, number>; // decision 3's table
export function safestApproach(id: NodeId): number; // min over incident lanes

// events.ts
export function pirateChance(from: NodeId, to: NodeId): number; // EDGE_DANGER[edgeKey(from, to)]
```

- `rollEvent` band structure is untouched — `pPirates` just reads the new
  lookup. The second variant draw (E2-4c) and kind thresholds keep their draw
  order; kinds _will_ differ from pre-round fixtures wherever `pPirates`
  changed. That is the feature.
- `StationNode` loses `danger`; `NODES` entries drop the field. No other field
  changes.
- bulletin.ts: `riskiest` becomes a reduce over `EDGE_DANGER` entries; line 3
  renders both station names (decision 6).

## 2. UI — map module, navigator, styles

### `src/ui/map.ts`

```ts
export const MAP_LAYOUT: Record<NodeId, { x: number; y: number }>; // decision 10
export function starMap(s: GameState): string; // full <svg> markup
```

`starMap` renders, in paint order: 6 non-incident lanes (class
`map-edge map-edge--far`), 4 incident lanes (`map-edge map-edge--{safe|warn|hot}`)
with a midpoint-offset `<text>` label `${fuel}⛽ · ${raid}%`, then nodes.
Non-current nodes are `<g class="map-node" data-act="jump" data-id="${n}">`
(plus `aria-disabled="true"` and `map-node--unreachable` when
`s.fuel < fuelCost(...)`); the current node is a plain `<g class="map-node
map-node--here">` with a location ring and no `data-act`. Meridian additionally
carries `map-node--weenie` (halo ring; glow static, pulse behind the
reduced-motion media query). The whole SVG sits in
`<div class="star-map" aria-hidden="true">`.

### screens.ts navigator

- `navigatorPanel` prepends `starMap(s)` above the orb group.
- Orb loop: `pirateChance(n)` → `pirateChance(s.location, n)` — meta, tooltip,
  and sr-only text all pick up the lane number automatically (they read `raid`).

### styles.css

`.star-map` (responsive width, `max-width: 100%`), `.map-edge` stroke tones
mapped to existing tokens, `.map-edge--far` dimmed (contrast floor does not
apply — `aria-hidden` decoration), `.map-node--here` ring, `.map-node--weenie`
halo, `.map-node--unreachable` dimmed with `cursor: default`. Label text uses
the `st-num` numeric styling on a dark backing capsule for legibility over
edge lines.

## 3. main.ts

- Delegation: `closest("button")` → `closest("button, [data-act]")` (decision 8).
- No other change: `act`/`id`/`qty` reads, the `aria-disabled` guard, and the
  jump case work as-is for SVG targets.

## Testing

Vitest, same pure-logic/thin-I/O split:

- **world:** `EDGE_DANGER` has exactly one entry per unordered pair (10 for 5
  nodes, derived from `NODE_IDS` so adding a station fails loudly); every value
  ∈ [0.05, 0.35]; `edgeKey` is order-insensitive; `safestApproach` returns the
  incident min (verge = 0.25, meridian = 0.06); `DISTANCE`/`fuelCost` untouched by
  existing tests.
- **events:** `pirateChance(from, to)` equals the table both directions; the
  exact-band test (events.test.ts:43) rewrites to per-edge expectations; the
  "more pirates on dangerous routes" sweep compares kiruna→verge vs
  terra→kiruna; the honest-band sweep (events.test.ts:78) reads the two-arg
  form.
- **bulletin:** line 3 names the max-danger lane's two stations; worst-case
  length ≤ 70 chars (longest roster name × longest station pair, computed not
  hand-asserted); still deterministic per seed.
- **fiction:** dossier presence test keys on `safestApproach(id) >= 0.1`
  (a station with no safe approach must voice the consequence — only the
  Verge) plus the existing pinned per-station keywords — prose untouched.
- **screens:** orb raid % differs by origin for the same destination (render
  from kiruna vs terra, assert meridian's % changes); map SVG present inside
  `aria-hidden` container; exactly 4 `data-act="jump"` map targets, ids =
  non-current nodes; unreachable node carries `aria-disabled="true"`; current
  node has no `data-act`; meridian carries the weenie class; no `tabindex`
  anywhere in the map subtree.
- **main delegation (regression):** a click on an element with neither a
  `button` ancestor nor `data-act` is a no-op; an `aria-disabled` SVG target
  is a no-op; a map-node click dispatches the same jump as the orb.
- **sim:** the three property gates stay green on 100 seeds; before/after
  band summary (audit rate, death rate, net-worth spread) recorded in the
  plan review. No byte-identical expectation — this round moves outcomes.
- **Lighthouse CI stays green** — static SVG + CSS; the only animation is
  behind `prefers-reduced-motion`.

## Error handling

- `pirateChance` throws on a missing edge (same contract as `fuelCost`); the
  world coverage test makes that state unshippable, so no runtime fallback.
- `pirateChance(x, x)` is never called (navigator filters the current node;
  `rollEvent` only fires on real jumps) and throws if it ever is — a loud bug,
  not a silent 0%.
- Map click targets for unaffordable jumps carry `aria-disabled="true"` and are
  rejected by the existing delegation guard — no second fuel check needed.
- A viewport narrower than the map scales it via `max-width: 100%`
  (`viewBox` keeps proportions); labels stay inside the viewBox by
  construction (fixed layout, fixed label offsets — a screens test asserts
  every label coordinate is inside the viewBox).
- Pre-round v3 snapshots resume untouched: no state field changed shape;
  danger was never persisted.

## Acceptance criteria (round-level)

E2-3:

- [ ] Danger is per-lane: the same destination shows different raid % depending
      on origin, in the orb meta/tooltip, on the map label, and in the number
      `rollEvent` rolls with (all three read the same table).
- [ ] The Meridian decision is real: direct from Vulcan/Kiruna is cheaper in
      fuel and days but ≥ 20% raid; via Terra is ≤ 6% per leg but costs an
      extra day and Terra's dock fee. Both routes get flown by intent, not
      accident.
- [ ] The star map renders in the Navigator: current node marked, exactly the
      four incident lanes labeled `fuel · raid%` and tone-colored, other lanes
      dimmed, Meridian visually distinct, pointer click on a node jumps, and
      the map is invisible to assistive tech while the orb list carries every
      fact the map shows.
- [ ] Bulletin line 3 names the riskiest lane by both station names, ≤ 70 chars.

Round:

- [ ] Economy byte-identical: `DISTANCE`, prices, fees, taxes unchanged; no
      snapshot/storage change.
- [ ] Sim property gates green on 100 seeds; before/after bands recorded in the
      plan review; any retune stays within decision 3's story.
- [ ] Full suite green; Lighthouse CI green.
- [ ] ROADMAP/backlog rows ticked on land (E2-3).
