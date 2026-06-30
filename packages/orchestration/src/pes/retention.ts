/**
 * Retention_Manager — retention evaluation and purge for the PES_Research_Store (task 8.1).
 *
 * Research records are kept no longer than the Research_Purpose requires. A sweep
 * evaluates EVERY stored record against a configured retention period and purges any
 * whose age (from its `collectedAt` ISO 8601 UTC timestamp) exceeds that period
 * (Requirements 6.1, 6.2, 6.5). The operator runs the sweep on an interval ≤24h
 * (task 8.3); this module is the testable core: `isExpired` + `runRetentionSweep`.
 *
 * Purge semantics (Requirements 6.3, 6.6):
 *  - A record's de-identified content AND its `sessionRef` (the only re-association
 *    data) both live in a single JSON file, so `FilePesResearchStore.delete` removes
 *    them together in one `fs.rm`. There is no intermediate state in which content is
 *    gone but the session link survives — the purge is atomic, nothing partial.
 *  - A failed purge therefore leaves the whole record intact (not partially purged);
 *    its id is returned in `failed` and it is naturally re-evaluated — and retried —
 *    on the next sweep, since it is still expired and still present.
 *
 * The retention duration is imported from `privacyNotice.ts` (`PES_RESEARCH_RETENTION_MS`)
 * so the period enforced here cannot drift from the duration stated in the Privacy_Notice
 * (Requirement 4.4 / 6.4).
 */

import { PES_RESEARCH_RETENTION_MS } from "./privacyNotice";
import type { FilePesResearchStore } from "./researchStore";
import type { PesResearchRecord } from "./types";

/** Configured retention period for research records. */
export interface RetentionConfig {
  /** Maximum age, in milliseconds, a record may reach before it must be purged. */
  retentionMs: number;
}

/**
 * Default retention config, built from the single shared constant in `privacyNotice.ts`
 * so the enforced duration and the stated Privacy_Notice duration stay in lock-step.
 */
export const PES_RETENTION_CONFIG: RetentionConfig = {
  retentionMs: PES_RESEARCH_RETENTION_MS,
};

/**
 * True iff the record's age from `collectedAt` exceeds the configured retention period
 * (Requirement 6.2 — strictly greater than). `collectedAt` is validated as ISO 8601 UTC
 * on write, so it always parses; an unparseable timestamp yields `NaN` and a `false`
 * result, which keeps an un-evaluable record on the safe side (not purged).
 */
export function isExpired(record: PesResearchRecord, now: Date, cfg: RetentionConfig): boolean {
  const collectedAtMs = Date.parse(record.collectedAt);
  return now.getTime() - collectedAtMs > cfg.retentionMs;
}

/**
 * Evaluate every stored research record and purge those past their retention period.
 *
 * Returns the ids purged and the ids whose purge failed (left fully intact, retried next
 * sweep). The sweep evaluates the entire store (Requirement 6.5); a `delete` returning
 * `false` (record already gone) is neither a purge nor a failure.
 */
export async function runRetentionSweep(
  store: FilePesResearchStore,
  now: Date,
  cfg: RetentionConfig
): Promise<{ purged: string[]; failed: string[] }> {
  const records = await store.list();
  const purged: string[] = [];
  const failed: string[] = [];

  for (const record of records) {
    if (!isExpired(record, now, cfg)) {
      continue;
    }
    try {
      // Single atomic file removal deletes de-identified content AND sessionRef together.
      const deleted = await store.delete(record.id);
      if (deleted) {
        purged.push(record.id);
      }
    } catch {
      // Purge failed: the record is left whole (nothing partially purged) and will be
      // re-attempted on the next sweep since it remains expired and present (Req 6.6).
      failed.push(record.id);
    }
  }

  return { purged, failed };
}
