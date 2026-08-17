// src/ui/map.ts — the Navigator's star map (E2-3c).
//
// Pure string renderer, same contract as screens.ts panels: no DOM access, safe
// to test in node. The map is a pointer-only enhancement — the whole SVG sits in
// an aria-hidden container and adds no focusable elements (SVG shapes are not
// focusable by default; no tabindex anywhere). The orb list below it remains the
// accessible jump surface and carries every fact shown here, so nothing is
// hidden from assistive tech that isn't available in text.
import { GameState, NodeId } from "../engine/types";
import { NODES, NODE_IDS, fuelCost } from "../engine/world";
import { pirateChance } from "../engine/events";
import { ORB_COLORS } from "./art";

export const MAP_VIEW = { w: 640, h: 360 } as const;

/** Hand-laid safe-west/rich-east geometry (spec decision 10). */
export const MAP_LAYOUT: Record<NodeId, { x: number; y: number }> = {
  kiruna: { x: 84, y: 168 },
  vulcan: { x: 238, y: 274 },
  terra: { x: 306, y: 104 },
  meridian: { x: 484, y: 210 },
  verge: { x: 574, y: 66 },
};

const NODE_R = 14;

/** Tone class per danger band — the table's three story tiers (plan deviation 1):
 *  patrolled (<10%), direct-but-raided (<25%), frontier (≥25%). Shared with the
 *  Navigator's orb pips (P3-2) so the map and the buttons cannot disagree. */
export function laneTone(p: number): "safe" | "warn" | "hot" {
  return p < 0.1 ? "safe" : p < 0.25 ? "warn" : "hot";
}

/** Label anchor: 45% along the lane from the current node, nudged up — close
 *  enough to "here" to dodge the K5 center pile-up. Clamped to the viewBox so a
 *  future MAP_LAYOUT edit can't push a label off-canvas (the -8 nudge could
 *  otherwise go negative for a station near the top edge). No-op for the current
 *  layout, where every label already sits well inside the bounds. */
function labelPos(here: { x: number; y: number }, other: { x: number; y: number }) {
  const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, v));
  return {
    x: clamp(Math.round(here.x + (other.x - here.x) * 0.45), MAP_VIEW.w),
    y: clamp(Math.round(here.y + (other.y - here.y) * 0.45) - 8, MAP_VIEW.h),
  };
}

function gradientDefs(): string {
  const stops = NODE_IDS.map((n) => {
    const [light, mid, dark] = ORB_COLORS[n];
    return (
      `<radialGradient id="map-orb-${n}" cx="35%" cy="30%" r="75%">` +
      `<stop offset="0%" stop-color="${light}"/>` +
      `<stop offset="55%" stop-color="${mid}"/>` +
      `<stop offset="100%" stop-color="${dark}"/>` +
      `</radialGradient>`
    );
  }).join("");
  return `<defs>${stops}</defs>`;
}

/** Static per-station orb gradients — invariant across game state, so built once
 *  at module load rather than rebuilt on every starMap() call. */
const GRADIENT_DEFS = gradientDefs();

function nodeMarkup(s: GameState, n: NodeId): string {
  const { x, y } = MAP_LAYOUT[n];
  const weenie = n === "meridian" ? " map-node--weenie" : "";
  const halo =
    n === "meridian"
      ? `<circle class="map-weenie-halo" cx="${x}" cy="${y}" r="${NODE_R + 7}"/>`
      : "";
  const orb = `<circle cx="${x}" cy="${y}" r="${NODE_R}" fill="url(#map-orb-${n})"/>`;
  const name = `<text class="map-name" x="${x}" y="${y + NODE_R + 14}">${NODES[n].name}</text>`;
  if (n === s.location) {
    const ring = `<circle class="map-here-ring" cx="${x}" cy="${y}" r="${NODE_R + 5}"/>`;
    return `<g class="map-node map-node--here${weenie}">${halo}${ring}${orb}${name}</g>`;
  }
  const unreachable = s.fuel < fuelCost(s.seed, s.location, n);
  const cls = unreachable ? " map-node--unreachable" : "";
  const dis = unreachable ? ' aria-disabled="true"' : "";
  return `<g class="map-node${weenie}${cls}" data-act="jump" data-id="${n}"${dis}>${halo}${orb}${name}</g>`;
}

/**
 * The Navigator's star map. Renders all 10 lanes — the 4 incident to the current
 * location emphasized, tone-classed, and labeled `fuel⛽ · raid%`; the other 6
 * dimmed and unlabeled (spec decision 9) — then the 5 station nodes on top.
 */
export function starMap(s: GameState): string {
  const here = MAP_LAYOUT[s.location];
  const lanes: string[] = [];
  const labels: string[] = [];
  for (const a of NODE_IDS) {
    for (const b of NODE_IDS) {
      if (a >= b) continue;
      const pa = MAP_LAYOUT[a];
      const pb = MAP_LAYOUT[b];
      const line = (cls: string) =>
        `<line class="map-edge ${cls}" x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}"/>`;
      if (a !== s.location && b !== s.location) {
        lanes.push(line("map-edge--far"));
        continue;
      }
      const other = a === s.location ? b : a;
      const risk = pirateChance(s, other);
      lanes.push(line(`map-edge--${laneTone(risk)}`));
      const lp = labelPos(here, MAP_LAYOUT[other]);
      labels.push(
        `<text class="map-label st-num" x="${lp.x}" y="${lp.y}">` +
          `${fuelCost(s.seed, s.location, other)}⛽ · ${Math.round(risk * 100)}%</text>`
      );
    }
  }
  const nodes = NODE_IDS.map((n) => nodeMarkup(s, n)).join("");
  return (
    `<div class="star-map" aria-hidden="true">` +
    `<svg viewBox="0 0 ${MAP_VIEW.w} ${MAP_VIEW.h}" xmlns="http://www.w3.org/2000/svg">` +
    `${GRADIENT_DEFS}${lanes.join("")}${labels.join("")}${nodes}</svg></div>`
  );
}
