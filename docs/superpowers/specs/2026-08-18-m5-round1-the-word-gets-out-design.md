# M5 Round 1 — "The Word Gets Out" (E3-5 + E3-3 + E2-2k)

**Date:** 2026-08-18 · **Status:** 📝 drafted
**Source:** [ROADMAP.md](../../ROADMAP.md) ⚪ backlog tail; specs in
[ENGAGEMENT_BACKLOG.md](../../ENGAGEMENT_BACKLOG.md) rows E3-5, E3-3, and the
E2-2 follow-up row E2-2k.

## Scope

The launch round. Milestones 1–4 are closed; the marketing kit
([docs/marketing](../../marketing/01-launch-kit.md)) is written and waiting for
an artifact worth posting. One round at the usual budget (one L anchor, one M,
one XS). Theme: **the word gets out** — the run's story becomes a designed,
shareable picture, and the lanes gain a distress beacon whose answer says
something about the trader.

### The E3-5 gate, ruled

E3-5's deferral condition was _"craft on the acquisition surface only pays once
the loop it advertises is worth joining."_ It is ruled **met**: the loop now has
a bounded daily with three end states, a heat-driven endgame, seven daily
modifiers, feats, a debrief, and a persistence ledger — every retention
mechanism the backlog asked for is shipped, and the remaining tail (E3-3) ships
in this same round. What advertises that loop is still a text card whose emoji
strip renders ragged in every paste target (💰/💀 are narrower than 🟥/🟨/🟦)
and whose palette cannot be art-directed. The acquisition surface is the last
unbuilt piece of the growth loop.

**In scope:**

- **E3-5 Image share card** — the run card rendered to a 1200×630 PNG from a
  pure display-list, with designed strip cells instead of emoji; copied as an
  image where the platform allows, falling back to the existing text card;
  downloadable everywhere. The text card remains the fallback artifact.
- **E3-3 Distress Call** — the seventh event: spend 2⛽ and one full day to
  answer a beacon, seeded 60/40 between a grateful trader and a dead echo, odds
  and stakes shown per the E1-4 honesty rule. The event deck's first
  values-driven choice (greed vs. time vs. decency), and it feeds the strip —
  an answered call is worth telling.
- **E2-2k Liquidation-tax neutrality** — partial sales become exactly neutral
  against the single-sale tax charge, closing the last ±1cr path across
  E2-2h's escape line.
- **Sim re-record** — E3-3 re-deals part of the event tape (first band change
  since E3-1), so the 100-seed sweep is re-recorded and every gate re-held,
  plus new distress-specific gates.

**Explicitly out of scope (deferred):** B-4's root cause (full-DOM re-render)
— behaviorally resolved, revisit only if launch feedback resurfaces it. A
native share sheet (`navigator.share` with files) — clipboard + download covers
the platforms; file-share support is spotty and adds a third result path.
Per-day OG/social meta images (needs a server or build step; the game is a
static page). Changing `GAME_URL` to an itch.io page — the drawn card prints
`GAME_URL` as-is and picks up the swap whenever it happens. Cargo rewards from
the distress call (decision 4). Multiple card sizes (decision 10).

## Decisions

### E3-3 — Distress Call

1. **Distress is the seventh `GameEventKind`, banded after derelict, before
   customs.** In `rollEvent` (events.ts:87–100) the band stack becomes:

   ```ts
   const pDerelict = pEngine + 0.12;
   const pDistress = pDerelict + DISTRESS_BAND; // ⚙ 0.08
   const pCustoms = to === "meridian" ? pDistress + 0.15 : pDistress;
   ```

   Placement is deliberate: every band **below** the insertion point —
   pirates, salvage, engine, derelict, the four risk-outcome events — keeps its
   thresholds, so those rolls stay byte-identical for every seed; only rolls
   that landed in the old customs/quiet tail can re-deal. Distress is not
   hostile, so amnesty does **not** empty its band (amnesty zeroes the pirate
   and salvage bands only — E3-1's rule), and its width is constant on every
   lane: a beacon is no likelier on a frontier run than a milk run.

2. **Answering costs 2⛽ and one full day, through the same machinery as a
   jump.** `resolveDistress` on `answer` spends `DISTRESS_FUEL = 2` ⚙ and sets
   `day: s.day + 1`. The interest block currently inlined in `jump`
   (game.ts:556–559) is extracted into an `accrueInterest(s)` helper called by
   both, so a diversion day can neither dodge nor double the Syndicate's
   `INTEREST_EVERY` cadence (and still respects the E3-1 interest holiday). No
   second docking fee — the fee charged in `jump` was for the dock you are
   still heading to. Everything downstream of the day is inherited free:
   `arrive` settles mission deadlines against the advanced day (a contract that
   needed today expires — the "deadline pressure" the backlog priced in) and
   runs the Day-12 audit check.

   **Edge, tested:** answering on the day-12 transit advances to day 13;
   `arrive`'s `day >= RUN_LENGTH` check still banks the audit on arrival, and
   `daysSurvived` caps at `RUN_LENGTH` per the existing `RunEndBase` contract.
   The last jump's beacon is answerable — it just cannot postpone the audit.

3. **The outcome is a seeded 60/40, from its own salted stream, rolled on the
   event's day.**
   `hashSeed(s.seed, day₀, DISTRESS_SALT) % DISTRESS_GRATEFUL_DEN < DISTRESS_GRATEFUL_NUM`
   with `DISTRESS_SALT = 0xd157`, `DISTRESS_GRATEFUL_NUM = 3`,
   `DISTRESS_GRATEFUL_DEN = 5` ⚙ — the `BAIT_SALT` pattern, independent of the
   same-day hazard/bait draws and of the event rng. **Ordering is pinned:**
   `day₀` is the day the event fired (pre-advance), and `distressReward(day₀)`
   uses it too — the stake line the player priced was computed on that day, so
   the resolution must roll and pay on the same one (E1-4). The rescue mark
   (decision 6) then lands on the **advanced** day — the day the diversion
   spent is the rescue day. The odds label derives from the two knobs
   (`choiceOdds`: `"60/40"`, the derelict formula), so retuning the split
   cannot leave the label stale.

4. **The grateful trader pays credits, never cargo.**
   `distressReward(day) = DISTRESS_REWARD_BASE + day × DISTRESS_REWARD_PER_DAY`
   (⚙ 250 and 15). The backlog's "reward/cargo" alternative is rejected: a
   cargo gift threads hold capacity, cost-basis dilution, and market depth
   through one stake string — unpriceable at a glance, which fails the E1-4
   test the event exists to pass. At the defaults the expected value is
   ~+190cr mid-run minus the day. A day is worth far more than that to a rich
   run deep in the heat endgame and far less to a becalmed one — which is
   exactly the greed-vs-time-vs-decency tension the backlog asked this event
   to carry. Nothing about the reward touches `biggestPayday`'s
   earned-payout rule (E2-2j): a distress reward is an ordinary credit inflow.

5. **Stakes and odds are honest, and stranding is warned, not blocked.**
   `choiceStakes` gains:

   ```ts
   case "distress":
     return {
       answer: `−${DISTRESS_FUEL}⛽, −1 day — a grateful trader (~${distressReward(s.day)}cr), or nothing${strandIf(s)}`,
     };
   ```

   `strandIf` appends a new `STRAND_MARK` (`" — ⚠ could strand you"`, the
   `LETHAL_MARK` pattern) when `canEscape({ ...s, fuel: s.fuel - DISTRESS_FUEL })`
   is false — the event resolves at the destination dock (`jump` has already
   moved `location`), so the escape math prices the right station. The warning
   never disables the choice: flying yourself dry answering a beacon is an
   informed loss, the B-6 rule. What **is** disabled is answering with
   `fuel < DISTRESS_FUEL`: the UI disables the button with the P0-2 reason
   pattern ("Need 2⛽, have 1") and `resolveDistress` treats the choice as
   `ignore` (defense in depth, same as every other guarded action).

6. **An answered call marks the day on the strip — the choice, not the luck.**
   `DayHighlightKind` gains `"rescue"`, marked in `resolveDistress` on the
   advanced day whenever the player answers, whichever way the roll goes: the
   strip records that you diverted; the log already tells whether it paid.
   (On the day-13 audit edge the mark falls past the capped strip and is
   dropped — accepted: the audit headline is that day's story.) `HIGHLIGHT_RANK` renumbers
   to `pirates: 4, rescue: 3, bigTrade: 2, delivery: 1` — an ambush still owns
   its day, a rescue outranks the money the diverted day earned. Text-card
   glyph: 🟩 (staying in the uniform-width square family); `STRIP_NOUNS` gains
   `["distress call answered", "distress calls answered"]` for the sr-only
   summary. storage.ts's `HIGHLIGHT_KIND_TABLE` is exhaustive by construction,
   so the compiler forces the one-line widening; existing v6 snapshots stay
   valid (shape unchanged) — **no snapshot bump**.

7. **The beacon speaks in the shipped voice.** `EVENT_VARIANTS.distress` gains
   three authored variants (a thin voice on an open channel; coordinates deep
   in a debris shadow; a repeating automated call nobody else is answering —
   final prose authored at implementation, ≤2 sentences each, E2-4 register).
   Resolution logs are authored in game.ts like every event: a diversion line
   (tone `bad`, no delta — fuel is not credits), then either the grateful line
   (tone `good`, `delta: +reward`) or the dead-echo line (tone `neutral` — the
   costs were already logged, and a wasted day is not a punishment line).

8. **Sim personas answer by temperament.** In simulate.ts's choice policy:
   cautious ignores every beacon; greedy always answers (the fuel guard makes
   it safe); balanced answers only when the diversion keeps `canEscape` true —
   which protects the ≥95% cautious+balanced audit gate from stranding noise
   while still exercising the event in the sweep.

### E2-2k — liquidation tax becomes partition-neutral

9. **Tax is charged on the cumulative gross, derived — not stored.** Today
   `taxOnSale` rounds per transaction, so selling `q` then `n−q` units can net
   ±1cr against selling `n` at once — the one remaining path across E2-2h's
   escape line, because `liquidationValue` promises the single-charge total.
   The fix is the telescoping charge:

   ```ts
   // economy.ts — the tax a sale of `gross` more credits of `id` owes here, on top
   // of what today's earlier sales of it already paid. Cumulative, so any partition
   // of a stack telescopes to taxOnSale(node, totalGross) exactly (E2-2k).
   export function saleTax(s: GameState, id: CommodityId, gross: number): number {
     const before = grossSoldHere(s, id); // depth-curve gross of soldHere[id] units
     return taxOnSale(s.location, before + gross) - taxOnSale(s.location, before);
   }
   ```

   `grossSoldHere` recomputes the depth curve over the `soldHere[id]` units
   already sold this visit — derived from existing state, the `heatOf`
   precedent: no new `GameState` field, no migration. `sell()` and
   `netSaleProceeds` both charge through `saleTax`, so every surface
   (sale labels, escape math, the actual charge) inherits it (B-1), and
   `liquidationValue`'s single-charge answer becomes exactly realizable by any
   sequence of partial sales. `taxOnSale` keeps its signature as the underlying
   curve. Per-commodity basis: sales are per-commodity transactions, and the
   depth curve already resets with `soldHere` on jump, so the cumulative
   window is "this commodity, this visit" — the same window depth uses.

### E3-5 — the image share card

10. **The card is drawn from a pure display-list; the canvas is dumb.** New
    module `src/ui/card.ts` exports `cardOps(d: CardData): DrawOp[]` — a typed
    op list (`rect`, `rrect`, `text`, `poly`) in fixed 1200×630 coordinates —
    and a thin browser-only `paintCard(canvas, ops)` that replays it onto a 2D
    context. Vitest has no canvas, so the testable half is the layout
    (determinism, content, bounds) and the painter is verified in the browser,
    the P3-2 toast precedent. `CardData` is `ShareData` plus the structured
    strip (decision 11) and the score-breakdown lines the text card omits.
    **One fixed size:** 1200×630 (the 1.91:1 social-card ratio every major
    paste target previews well). The backlog's "per-platform preview size" is
    resolved as one canonical size, not N exports; the preview `<img>` scales
    responsively via CSS.

11. **One strip derivation, three renderers.** share.ts gains
    `stripKinds(highlights, daysSurvived, status): StripCellKind[]` where
    `StripCellKind = DayHighlightKind | "plain" | "death"` — the cell logic
    currently inlined in `runStrip` (share.ts:44–59). `runStrip` maps kinds to
    emoji, screens.ts's `stripCells` keeps mapping the emoji to spans, and
    `cardOps` maps the same kinds to drawn cells: uniform rounded squares in
    token colors with small vector glyphs (sabre-cross for pirates, coin for
    bigTrade, crate for delivery, beacon ring for rescue, skull for death).
    The glyph paths are authored at implementation; the spec fixes the rule —
    all three surfaces read `stripKinds`, so the pasted text, the debrief
    HTML, and the PNG can never tell three different stories (B-1).

12. **Canvas colors are hex constants mirrored from the design tokens.** A
    canvas cannot read CSS custom properties from a detached document, so
    card.ts carries a small `CARD_PALETTE` of hex values with a comment naming
    each token it mirrors (`--st-cyan`, `--st-gold`, `--st-orange`,
    background/ink pair). A drift comment in tokens.json's design-system doc
    is not needed — the palette is five values and the card is the only
    canvas surface.

13. **One share button; image first, text as the honest fallback.** The
    run-end button tries the image path: `canvas.toBlob` → `ClipboardItem`
    constructed **synchronously in the click gesture with a `Promise<Blob>`
    payload** (the Safari-safe pattern), `navigator.clipboard.write`. On
    unsupported `ClipboardItem`/`write`, a null blob, or rejection, it falls
    back to the existing `copyShare` text path. `ShareStatus` widens to
    `"idle" | "img" | "text" | "fail"` and the button reports which artifact
    actually landed: `Copied image ✓` / `Copied text ✓` / `Copy failed`, same
    2s revert (P2-4 machinery). A separate `Save PNG` anchor (`download`
    attribute + data URL) is the guaranteed path on platforms that reject
    clipboard images entirely.

14. **The preview lives in the template; the pixels are wired in main.ts.**
    `runEndScreen` renders `<img id="share-card" class="run-end__card" …>`
    above the share button, `alt` set to the existing `stripSummary` +
    score line (the sr-only story, now on the image where it belongs). Because
    `render` swaps `innerHTML` wholesale, main.ts re-assigns `img.src` after
    every paint from a **per-run memoized data URL** (drawn once on run end
    into an offscreen canvas; ~100KB of string, no object-URL lifecycle to
    leak). A missing element or a failed draw degrades to no preview — the
    text strip and text copy still work, never a throw (the toast rule).

### The sweep

15. **Byte-identity breaks by design — the first re-deal since E3-1.** Only
    old customs/quiet rolls can become distress (decision 1), but that is
    enough to shift run trajectories, so the 100-seed sweep is re-recorded
    and every existing gate must re-hold at its semantic threshold: every run
    ends ≤ day 12; ≥95% cautious+balanced audited; greedy deaths 10–40;
    greedy > cautious on peak; the three depth-decay gates vs. the committed
    pre-depth baseline; ≥2 viable loops/day; per-modifier fairness ≥90% (now
    with distress in the deck); both pressure-curve gates (E1-5). Any
    threshold that trips is re-recorded with the measured number and a stated
    rationale — the round-5 procedure. E2-2k's ±1cr corrections ride the same
    re-record.

16. **New distress gates.** (a) Generator honesty: over seeds 1–400, the
    grateful rate lands in a band around `3/5` (the heat-frequency test
    pattern). (b) Observability: the sweep encounters distress > 0 times and
    the non-cautious personas answer > 0 times — the event is actually in the
    game the gates measure. (c) The stranding risk has no new gate: the
    greedy 10–40 death band is already the guardrail. Per the round-5
    procedure, the first knob is named up front — `DISTRESS_BAND` shrinks
    first if deaths or fairness trip, then `DISTRESS_FUEL` drops to 1.

## Build order

1. **E2-2k** — `grossSoldHere` + `saleTax` in economy.ts; `sell`/
   `netSaleProceeds` re-route; partition-neutrality property tests;
   re-recorded unit expectations.
2. **E3-3 engine** — event kind, band insertion, `accrueInterest` extraction,
   `resolveDistress` (fuel guard, day advance, 60/40 roll, rescue mark,
   day-13 audit edge); knobs in preview.ts; tests.
3. **E3-3 surfaces** — `choiceStakes`/`choiceOdds` + `STRAND_MARK`; disabled
   answer button with reason; `EVENT_VARIANTS.distress`; 🟩 strip glyph +
   noun; storage highlight table; tests.
4. **Sim** — persona distress policy; sweep re-record with rationale per
   moved threshold; distress gates; fairness re-run.
5. **E3-5 derivation** — `stripKinds` extraction in share.ts; `runStrip`/
   `stripCells` re-route; tests prove the three surfaces agree.
6. **E3-5 card** — card.ts (`CARD_PALETTE`, `cardOps`, `paintCard`);
   `runEndScreen` preview img + `Save PNG`; main.ts draw-once memo,
   image-first copy with text fallback, widened `ShareStatus`; tests +
   browser verification.
7. **Close** — full suite, Lighthouse CI, ROADMAP/backlog rows, docs.

## Engine — events.ts, game.ts, preview.ts, economy.ts, fiction.ts, types.ts

```ts
// types.ts
export type GameEventKind =
  "quiet" | "pirates" | "salvage" | "derelict" | "customs" | "engine" | "distress";
export type DayHighlightKind = "pirates" | "rescue" | "bigTrade" | "delivery";

// events.ts — band insertion per decision 1; distress() event with choices
//   { id: "answer", label: "Answer the call (divert)" } and
//   { id: "ignore", label: "Hold your course" }.
export const DISTRESS_BAND = 0.08; // ⚙

// preview.ts
export const DISTRESS_FUEL = 2; // ⚙
export const DISTRESS_REWARD_BASE = 250; // ⚙
export const DISTRESS_REWARD_PER_DAY = 15; // ⚙
export const DISTRESS_GRATEFUL_NUM = 3; // ⚙ grateful outcomes per …
export const DISTRESS_GRATEFUL_DEN = 5; // ⚙ … total outcomes (odds label derives)
export const STRAND_MARK = " — ⚠ could strand you";
export function distressReward(day: number): number;

// game.ts — accrueInterest(s) extracted from jump; resolveDistress per
//   decisions 2–7; DISTRESS_SALT = 0xd157 beside BAIT_SALT.

// economy.ts — saleTax(s, id, gross) + grossSoldHere(s, id) per decision 9;
//   netSaleProceeds charges through saleTax.

// fiction.ts — EVENT_VARIANTS.distress: 3 authored variants.
```

## Storage

**No migration.** Run snapshot stays **v6**, save doc stays **v2**,
`STORAGE_KEY` unchanged. The only touched persisted shape is
`dayHighlights`, whose value set widens — `HIGHLIGHT_KIND_TABLE` gains
`rescue: true` (compiler-forced) and `isValidDayHighlights` accepts it; every
existing snapshot remains valid. `ShareStatus` and the card data URL are view
state that never persists.

## UI — screens.ts, share.ts, card.ts (new), main.ts, styles

- **Event screen:** distress renders like every event — stakes line from
  `choiceStakes` (with ⚠ strand mark when live), odds chip `60/40` from
  `choiceOdds`, answer button disabled with "Need 2⛽, have N" when short.
- **Statbar:** nothing new — the day counter, fuel chip, and interest chip
  already read the advanced state after an answer.
- **Run-end screen:** card preview `<img id="share-card">` with the
  `stripSummary` alt text; one share button (image-first, text fallback,
  status-labelled); `Save PNG` anchor; the HTML strip cells stay as the
  no-image fallback rendering.
- **share.ts:** `stripKinds` extraction; 🟩 rescue glyph; noun pair.
- **card.ts:** `CARD_PALETTE` (hex mirrors of the tokens), `cardOps`,
  `paintCard` — layout: header (rocket + `Starlight #N · date · label ·
modifier glyph+name`), score line with end headline, the drawn strip grid
  (wrapping at 12 cells/row — a full run is one row), feat line when present,
  `GAME_URL` footer.
- **main.ts:** per-run memoized card draw; `img.src` re-assign after paint;
  image-first copy handler with the Safari-safe `ClipboardItem` construction;
  widened `shareStatus` wiring on the existing 2s timer.
- **CSS:** `.run-end__card` (responsive width, chamfer border to match the
  panel); no new motion.

## Testing

Vitest, same pure-logic/thin-I/O split:

- **distress banding:** below-insertion rolls byte-identical (pirates/salvage/
  engine/derelict fixtures unchanged for sampled seeds); distress appears in
  the old customs/quiet tail; amnesty leaves the distress band intact;
  meridian still rolls customs above it.
- **distress resolution:** answer spends exactly `DISTRESS_FUEL` and one day;
  interest accrues iff the advanced day is an `INTEREST_EVERY` day (and
  respects the holiday); a deadline the diversion blows expires at arrival;
  the day-12 transit answer still audits with `daysSurvived = 12`; fuel <
  `DISTRESS_FUEL` resolves as ignore; grateful/echo split matches the salted
  hash; rescue mark lands on answer regardless of outcome; ignore marks
  nothing.
- **honesty:** stakes string carries the fuel, the day, and `~reward`; the ⚠
  strand mark appears exactly when post-answer `canEscape` fails; odds label
  derives from the knobs (`60/40`); disabled-button reason renders when short.
- **E2-2k:** property test — for sampled states, any partition of a stack
  sale nets identical credits to the single sale, and equals
  `liquidationValue`'s per-commodity promise; the ±1cr repro from the backlog
  row now holds the escape line.
- **stripKinds:** cell derivation matches today's `runStrip` output for the
  existing kinds; death still stamps a lost run's final day; 🟩 maps rescue;
  the sr-only summary counts rescues.
- **cardOps:** deterministic (same data → deep-equal ops); every op inside
  1200×630; one cell per surviving day; header/score/URL text present; palette
  values come from `CARD_PALETTE` only.
- **share fallback:** image path resolving → `img` status; `ClipboardItem`
  missing or write rejecting → text path → `text` status; both failing →
  `fail`; all three revert to idle.
- **sim:** decision 15's re-record with per-gate rationale; decision 16's
  distress gates; knob values and post-change numbers recorded in the plan.
- **Browser verification (manual, like the toast):** the painted card matches
  the ops list visually; copy lands a PNG in a paste target on Chromium and
  WebKit; `Save PNG` downloads; Lighthouse CI stays green.

## Error handling

- `resolveDistress` guards fuel (`< DISTRESS_FUEL` → ignore) even though the
  UI disables the button — no path to negative fuel.
- The strand ⚠ is a warning, never a gate: an informed player may answer into
  a stranding; `arrive` → `checkLoss` ends that run honestly (B-6 rule).
- `accrueInterest` is the single interest author — the diversion day cannot
  double-charge or skip the cadence.
- `saleTax` telescopes from `taxOnSale`, so a zero or negative gross charges
  0 and the sum over any partition is exact — no drift between promise and
  charge remains.
- Clipboard: unsupported `ClipboardItem`, a null `toBlob`, or a rejected
  write all fall through to the text path; a rejected text write lands on
  `Copy failed`. No path throws.
- A missing `#share-card` element or a failed draw degrades to no preview;
  the HTML strip and text copy still work.
- The card data URL memo is keyed to the run's end, so a restarted run can
  never show the previous run's card.

## Acceptance criteria (round-level)

E3-3:

- [ ] A seventh event rolls in the old customs/quiet tail; the four
      risk-outcome bands are untouched for every seed; amnesty does not
      remove it.
- [ ] Answering costs 2⛽ + 1 day through the shared interest/deadline/audit
      machinery; the stake, the odds, the strand warning, and the disabled
      reason are all shown and all derived from the knobs (E1-4).
- [ ] An answered call marks 🟩 on the strip regardless of outcome; the
      grateful/echo split is seeded 60/40 and test-pinned.
- [ ] Fiction: three authored variants in the shipped register; authored
      grateful/echo log lines with correct tone/delta.

E3-5:

- [ ] The card renders at 1200×630 from a deterministic pure op list; strip
      cells, HTML strip, and text strip all derive from one `stripKinds`.
- [ ] Copy is image-first with the Safari-safe pattern, falls back to the
      text card, and the button reports which landed; `Save PNG` works
      everywhere; the preview carries the strip-summary alt text.
- [ ] The text card remains byte-identical for a run with no rescue (🟩 is
      the only glyph change this round).

E2-2k:

- [ ] Any partition of a stack sale nets exactly the single-sale total;
      `liquidationValue` is exactly realizable; the escape line cannot be
      crossed by tax rounding.

Round:

- [ ] Sweep re-recorded with measured numbers and per-gate rationale; all
      existing gates re-held (greedy deaths 10–40, fairness ≥90% per modifier
      with distress in the deck); new distress gates green.
- [ ] Full suite green; Lighthouse CI green; no snapshot or save-doc
      migration.
- [ ] ROADMAP gains a Milestone 5 section with these three rows ticked on
      land; ENGAGEMENT_BACKLOG rows E3-3/E3-5/E2-2k updated; the ⚪ backlog
      tail is empty (only B-4's stretch remains, in BACKLOG.md).
