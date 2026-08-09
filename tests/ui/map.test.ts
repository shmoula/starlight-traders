// tests/ui/map.test.ts
import { describe, it, expect } from "vitest";
import { starMap, MAP_LAYOUT, MAP_VIEW } from "../../src/ui/map";
import { createGame } from "../../src/engine/game";
import { NODE_IDS } from "../../src/engine/world";

const atTerra = () => starMap(createGame(42)); // createGame starts at terra

describe("starMap (E2-3c)", () => {
  it("is a pointer-only enhancement: aria-hidden container, nothing focusable", () => {
    const h = atTerra();
    expect(h).toContain('<div class="star-map" aria-hidden="true">');
    expect(h).not.toContain("tabindex");
    expect(h).not.toContain("<button");
  });

  it("renders a jump target per non-current station and none for the current one", () => {
    const h = atTerra();
    for (const id of ["kiruna", "vulcan", "verge", "meridian"]) {
      expect(h).toContain(`data-act="jump" data-id="${id}"`);
    }
    expect(h).not.toContain('data-id="terra"');
    expect(h).toContain("map-node--here");
  });

  it("from every location: exactly 4 jump targets and never the current station (E2-3c)", () => {
    for (const loc of NODE_IDS) {
      const h = starMap({ ...createGame(42), location: loc });
      expect(h.match(/data-act="jump"/g), loc).toHaveLength(4);
      expect(h, `${loc} should not be its own jump target`).not.toContain(`data-id="${loc}"`);
      for (const other of NODE_IDS.filter((n) => n !== loc)) {
        expect(h, `${loc} → ${other}`).toContain(`data-act="jump" data-id="${other}"`);
      }
    }
  });

  it("labels exactly the four incident lanes with fuel and raid %", () => {
    const h = atTerra();
    expect(h.match(/class="map-label/g)).toHaveLength(4);
    expect(h).toContain("4⛽ · 5%"); // terra–kiruna
    expect(h).toContain("5⛽ · 6%"); // terra–meridian
    expect(h).toContain("3⛽ · 7%"); // terra–vulcan
    expect(h).toContain("6⛽ · 25%"); // terra–verge
  });

  it("tone-classes incident lanes by danger band and dims non-incident lanes", () => {
    const fromTerra = atTerra();
    expect(fromTerra.match(/map-edge--safe/g)).toHaveLength(3); // kiruna 5, meridian 6, vulcan 7
    expect(fromTerra.match(/map-edge--hot/g)).toHaveLength(1); // verge 25
    expect(fromTerra.match(/map-edge--far/g)).toHaveLength(6);
    const fromVulcan = starMap({ ...createGame(42), location: "vulcan" });
    expect(fromVulcan.match(/map-edge--warn/g)).toHaveLength(1); // meridian 20
    expect(fromVulcan.match(/map-edge--hot/g)).toHaveLength(1); // verge 28
  });

  it("marks unreachable stations aria-disabled when fuel is short", () => {
    const h = starMap({ ...createGame(42), fuel: 0 });
    expect(h.match(/aria-disabled="true"/g)).toHaveLength(4);
    expect(h.match(/map-node--unreachable/g)).toHaveLength(4);
    expect(atTerra()).not.toContain("map-node--unreachable");
  });

  it("gives Meridian the weenie treatment", () => {
    const h = atTerra();
    expect(h).toContain("map-node--weenie");
    expect(h).toContain('class="map-weenie-halo"');
  });

  it("keeps every lane label inside the viewBox from every location", () => {
    for (const loc of NODE_IDS) {
      const h = starMap({ ...createGame(42), location: loc });
      for (const m of h.matchAll(/<text class="map-label st-num" x="([\d.]+)" y="([\d.]+)"/g)) {
        const x = Number(m[1]);
        const y = Number(m[2]);
        expect(x, `${loc}: x`).toBeGreaterThanOrEqual(0);
        expect(x, `${loc}: x`).toBeLessThanOrEqual(MAP_VIEW.w);
        expect(y, `${loc}: y`).toBeGreaterThanOrEqual(0);
        expect(y, `${loc}: y`).toBeLessThanOrEqual(MAP_VIEW.h);
      }
    }
  });

  it("lays out every station inside the viewBox", () => {
    for (const n of NODE_IDS) {
      expect(MAP_LAYOUT[n].x).toBeGreaterThan(0);
      expect(MAP_LAYOUT[n].x).toBeLessThan(MAP_VIEW.w);
      expect(MAP_LAYOUT[n].y).toBeGreaterThan(0);
      expect(MAP_LAYOUT[n].y).toBeLessThan(MAP_VIEW.h);
    }
  });
});
