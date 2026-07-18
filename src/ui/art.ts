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
