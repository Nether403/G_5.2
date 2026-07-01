/**
 * retentionSweep.ts — operator script for the PES_Research_Store retention sweep (task 8.3).
 *
 * Runs ONE retention pass: it lists every research record, purges those whose age from
 * `collectedAt` exceeds the configured retention period (`PES_RETENTION_CONFIG`, sourced
 * from the Privacy_Notice duration), and reports purged/failed counts. The record's
 * de-identified content and its `sessionRef` are deleted together in a single atomic
 * file removal (Requirements 6.2, 6.3, 6.5).
 *
 * Cadence (Requirement 6.5): a cron/scheduler MUST invoke this script on an interval
 * NOT exceeding 24 hours. The script itself runs a single pass with `now = new Date()`;
 * the ≤24h scheduling is the operator's responsibility — consistent with the other
 * G_5.2 operator tooling (e.g. `src/dev/smokeTest.ts`, run via a package `script`).
 * A record whose purge fails is left whole (nothing partially purged) and is retried on
 * the next pass, since it remains expired and present (Requirement 6.6).
 *
 * Run:
 *   pnpm --filter @g52/orchestration sweep:pes-retention
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { createProductRegistry } from "../products";
import { FilePesResearchStore } from "../pes/researchStore";
import { PES_RETENTION_CONFIG, runRetentionSweep } from "../pes/retention";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  // repoRoot is the G_5.2 root: src/dev → src → orchestration → packages → G_5.2.
  const repoRoot = path.resolve(__dirname, "../../../..");
  const registry = createProductRegistry(repoRoot);
  const recordsRoot = registry.pes.researchRecordsRoot;
  if (recordsRoot === undefined) {
    throw new Error("pes product is missing researchRecordsRoot");
  }

  const store = new FilePesResearchStore(recordsRoot);
  const now = new Date();

  const retentionDays = (PES_RETENTION_CONFIG.retentionMs / 86_400_000).toFixed(1);
  console.log(`[pes-retention] sweep at ${now.toISOString()}`);
  console.log(`[pes-retention] root: ${recordsRoot}`);
  console.log(`[pes-retention] retention: ${retentionDays} day(s)`);

  const { purged, failed } = await runRetentionSweep(store, now, PES_RETENTION_CONFIG);

  console.log(`[pes-retention] purged: ${purged.length}`);
  console.log(`[pes-retention] failed: ${failed.length}`);

  // A failed purge is retried next interval, but a non-empty failed set is an operator
  // signal — exit non-zero so a scheduler surfaces it.
  if (failed.length > 0) {
    console.error(`[pes-retention] failed ids: ${failed.join(", ")}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
