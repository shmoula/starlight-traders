// src/ui/card.ts
//
// The image share card (E3-5): a pure display-list layout and a thin canvas painter.
// cardOps is deterministic data — testable without a canvas (vitest has none) — and
// paintCard just replays ops, so the testable half carries every decision (the
// pulse.ts split applied to pixels).
import { ShareData, StripCellKind, GAME_URL } from "./share";

export const CARD_W = 1200;
export const CARD_H = 630; // the 1.91:1 social-card ratio every paste target previews well

/** Hex mirrors of the design tokens — a canvas cannot read CSS custom properties.
 *  Sources: src/ui/tokens.css / docs/design/tokens.json. */
export const CARD_PALETTE = {
  bg: "#0b1520", // --st-bg-nebula
  panel: "#1b3144", // --st-bg-header-hi — the "plain day" cell (🟦's muted blue)
  ink: "#eaf6fb", // --st-text-hi
  dim: "#7ebee4", // the muted blue --st-bg-row-alt tints from
  cyan: "#00d9ff", // --st-cyan
  gold: "#ffb84d", // --st-gold — 💰 and 🟨
  green: "#57e6a8", // --st-positive — 🟩 rescue
  red: "#ff6a55", // --st-negative — 🟥 pirates, and the death cell's X
} as const;

export type DrawOp =
  | { op: "rect"; x: number; y: number; w: number; h: number; fill: string }
  | {
      op: "rrect";
      x: number;
      y: number;
      w: number;
      h: number;
      r: number;
      fill?: string;
      stroke?: string;
      lineWidth?: number;
    }
  | {
      op: "circle";
      x: number;
      y: number;
      r: number;
      fill?: string;
      stroke?: string;
      lineWidth?: number;
    }
  | {
      op: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stroke: string;
      lineWidth: number;
    }
  | {
      op: "text";
      x: number;
      y: number;
      text: string;
      font: string;
      fill: string;
      align: "left" | "center" | "right";
    };

export interface CardData extends ShareData {
  /** Structured strip from stripKinds() — the card draws cells, not emoji. */
  kinds: StripCellKind[];
  /** Peak net worth — the one breakdown line the text card omits. */
  peak: number;
}

// System stack, deliberately: the card must lay out identically whether or not a web
// font finished loading, and nothing here measures text.
const FONT = "system-ui, sans-serif";

const CELL = 64;
const CELL_GAP = 12;
const CELLS_PER_ROW = 12; // a full run is exactly one row

/** Fill per cell kind — the same story the emoji strip tells (share.ts STRIP_GLYPHS). */
const CELL_FILL: Record<StripCellKind, string> = {
  plain: CARD_PALETTE.panel,
  pirates: CARD_PALETTE.red,
  bigTrade: CARD_PALETTE.gold,
  delivery: CARD_PALETTE.gold,
  rescue: CARD_PALETTE.green,
  death: CARD_PALETTE.bg,
};

/** The small vector glyph inside a cell, centered on (cx, cy). Kinds that share a fill
 *  (bigTrade/delivery) are told apart by glyph: coin vs crate. */
function cellGlyph(kind: StripCellKind, cx: number, cy: number): DrawOp[] {
  const ink = CARD_PALETTE.bg; // glyphs sit on bright fills
  switch (kind) {
    case "pirates": // crossed sabres → thin X
      return [
        {
          op: "line",
          x1: cx - 11,
          y1: cy - 11,
          x2: cx + 11,
          y2: cy + 11,
          stroke: ink,
          lineWidth: 4,
        },
        {
          op: "line",
          x1: cx - 11,
          y1: cy + 11,
          x2: cx + 11,
          y2: cy - 11,
          stroke: ink,
          lineWidth: 4,
        },
      ];
    case "bigTrade": // coin
      return [
        { op: "circle", x: cx, y: cy, r: 12, stroke: ink, lineWidth: 4 },
        { op: "circle", x: cx, y: cy, r: 3, fill: ink },
      ];
    case "delivery": // crate
      return [
        { op: "rrect", x: cx - 11, y: cy - 11, w: 22, h: 22, r: 3, stroke: ink, lineWidth: 4 },
      ];
    case "rescue": // beacon ring
      return [
        { op: "circle", x: cx, y: cy, r: 12, stroke: ink, lineWidth: 3 },
        { op: "circle", x: cx, y: cy, r: 4, fill: ink },
      ];
    case "death": // bold red X on the dark cell
      return [
        {
          op: "line",
          x1: cx - 12,
          y1: cy - 12,
          x2: cx + 12,
          y2: cy + 12,
          stroke: CARD_PALETTE.red,
          lineWidth: 6,
        },
        {
          op: "line",
          x1: cx - 12,
          y1: cy + 12,
          x2: cx + 12,
          y2: cy - 12,
          stroke: CARD_PALETTE.red,
          lineWidth: 6,
        },
      ];
    case "plain":
      return [];
  }
}

/** The whole card as data. Same input → deep-equal output; every op inside CARD_W×CARD_H. */
export function cardOps(d: CardData): DrawOp[] {
  const ops: DrawOp[] = [
    { op: "rect", x: 0, y: 0, w: CARD_W, h: CARD_H, fill: CARD_PALETTE.bg },
    {
      op: "rrect",
      x: 12,
      y: 12,
      w: CARD_W - 24,
      h: CARD_H - 24,
      r: 16,
      stroke: CARD_PALETTE.cyan,
      lineWidth: 2,
    },
    {
      op: "text",
      x: 60,
      y: 96,
      text: "STARLIGHT TRADERS",
      font: `bold 44px ${FONT}`,
      fill: CARD_PALETTE.cyan,
      align: "left",
    },
    {
      op: "text",
      x: 60,
      y: 148,
      text: `#${d.runNumber} · ${d.dateLabel} · ${d.label} · ${d.modifier}`,
      font: `28px ${FONT}`,
      fill: CARD_PALETTE.dim,
      align: "left",
    },
    {
      op: "text",
      x: 60,
      y: 250,
      text: `Score ${d.score.toLocaleString("en-US")}`,
      font: `bold 64px ${FONT}`,
      fill: CARD_PALETTE.gold,
      align: "left",
    },
    {
      op: "text",
      x: 60,
      y: 300,
      text: `survived ${d.daysSurvived} day${d.daysSurvived === 1 ? "" : "s"} — ${d.endLabel}`,
      font: `30px ${FONT}`,
      fill: CARD_PALETTE.ink,
      align: "left",
    },
    {
      op: "text",
      x: 60,
      y: 344,
      text: `Peak ${d.peak.toLocaleString("en-US")}cr`,
      font: `24px ${FONT}`,
      fill: CARD_PALETTE.dim,
      align: "left",
    },
  ];

  // The strip: one centered row of CELLS_PER_ROW slots; a full run fills it exactly.
  const rowW = CELLS_PER_ROW * CELL + (CELLS_PER_ROW - 1) * CELL_GAP;
  const x0 = (CARD_W - rowW) / 2;
  const y0 = 392;
  d.kinds.forEach((kind, i) => {
    const x = x0 + (i % CELLS_PER_ROW) * (CELL + CELL_GAP);
    const y = y0 + Math.floor(i / CELLS_PER_ROW) * (CELL + CELL_GAP);
    // Dark cells (plain/death) get the dim border so they read against the bg.
    ops.push(
      kind === "plain" || kind === "death"
        ? {
            op: "rrect",
            x,
            y,
            w: CELL,
            h: CELL,
            r: 12,
            fill: CELL_FILL[kind],
            stroke: CARD_PALETTE.dim,
            lineWidth: 2,
          }
        : { op: "rrect", x, y, w: CELL, h: CELL, r: 12, fill: CELL_FILL[kind] }
    );
    ops.push(...cellGlyph(kind, x + CELL / 2, y + CELL / 2));
  });

  if (d.featNames?.length) {
    const feat = `★ ${d.featNames[0]}${d.featNames.length > 1 ? ` +${d.featNames.length - 1} more` : ""}`;
    ops.push({
      op: "text",
      x: CARD_W / 2,
      y: 528,
      text: feat,
      font: `26px ${FONT}`,
      fill: CARD_PALETTE.gold,
      align: "center",
    });
  }

  ops.push({
    op: "text",
    x: CARD_W / 2,
    y: 588,
    text: `Beat my run: ${GAME_URL}`,
    font: `24px ${FONT}`,
    fill: CARD_PALETTE.dim,
    align: "center",
  });
  return ops;
}

/** Replay ops onto a canvas. Browser-only; verified manually (the toast rule). */
export function paintCard(canvas: HTMLCanvasElement, ops: DrawOp[]): void {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  for (const o of ops) {
    switch (o.op) {
      case "rect":
        ctx.fillStyle = o.fill;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        break;
      case "rrect":
        ctx.beginPath();
        ctx.roundRect(o.x, o.y, o.w, o.h, o.r);
        if (o.fill) {
          ctx.fillStyle = o.fill;
          ctx.fill();
        }
        if (o.stroke) {
          ctx.strokeStyle = o.stroke;
          ctx.lineWidth = o.lineWidth ?? 1;
          ctx.stroke();
        }
        break;
      case "circle":
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        if (o.fill) {
          ctx.fillStyle = o.fill;
          ctx.fill();
        }
        if (o.stroke) {
          ctx.strokeStyle = o.stroke;
          ctx.lineWidth = o.lineWidth ?? 1;
          ctx.stroke();
        }
        break;
      case "line":
        ctx.beginPath();
        ctx.moveTo(o.x1, o.y1);
        ctx.lineTo(o.x2, o.y2);
        ctx.strokeStyle = o.stroke;
        ctx.lineWidth = o.lineWidth;
        ctx.lineCap = "round";
        ctx.stroke();
        break;
      case "text":
        ctx.font = o.font;
        ctx.fillStyle = o.fill;
        ctx.textAlign = o.align;
        ctx.fillText(o.text, o.x, o.y);
        break;
    }
  }
}

/** Copy the painted card as a PNG; false means "fall back to the text card". Safari
 *  requires the ClipboardItem to be constructed synchronously in the user gesture with
 *  a Promise payload — do not await the blob first. */
export async function copyCardImage(canvas: HTMLCanvasElement): Promise<boolean> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
  try {
    const blob = new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
        "image/png"
      )
    );
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}
