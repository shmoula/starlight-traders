// tests/sim/baseline.probe.test.ts — TEMPORARY, deleted in Task 11.
// Dumps every archetype × seed result so Task 11 can diff byte-for-byte.
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { runArchetype, Archetype } from "../../src/sim/simulate";

const OUT = process.env.SIM_DUMP ?? "/tmp/sim-dump.json";

it("dumps the 300-run sweep", () => {
  const rows: unknown[] = [];
  for (const k of ["cautious", "balanced", "greedy"] as Archetype[]) {
    for (let seed = 1; seed <= 100; seed++) rows.push({ k, seed, ...runArchetype(k, seed) });
  }
  writeFileSync(OUT, JSON.stringify(rows, null, 1));
});
