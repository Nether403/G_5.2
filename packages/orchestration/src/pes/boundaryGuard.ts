// Boundary_Guard — machine-enforced dataset separation for P-E-S research writes.
//
// P-E-S research data is its own dataset with its own consent and purpose; it is
// NOT Witness testimony and must never enter a Witness store, the Witness_Corpus,
// or any testimony artifact (project invariant "same engine, different identity;
// never duplicate sensitive bodies"). This guard rejects mis-targeted writes by
// matching the payload type (a PesResearchRecord) against the target store, rather
// than relying on a general cross-boundary heuristic (Requirement 8.2).

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { WITNESS_DATASET_ID, type PesResearchRecord, type StoreTarget } from "./types";

/** Why a research write was rejected by the Boundary_Guard. */
export type GuardRejectionReason = "dataset_separation" | "invalid_dataset_id";

/** A recorded cross-dataset rejection (Requirement 8.3). */
export interface GuardRejection {
  reason: GuardRejectionReason;
  /** Dataset id carried by the rejected payload. */
  sourceDatasetId: string;
  /** Store the write was (illegitimately) targeting. */
  targetStore: StoreTarget;
  /** ISO 8601 UTC timestamp of the rejection. */
  at: string;
}

/** Result of guarding a research write. `rejection` is set iff `allowed` is false. */
export interface GuardResult {
  allowed: boolean;
  rejection?: GuardRejection;
}

const WITNESS_TARGETS: ReadonlySet<StoreTarget> = new Set<StoreTarget>([
  "witness_store",
  "witness_corpus",
  "testimony",
]);

/**
 * Classify a P-E-S research write by payload type × target store, and — when a
 * `rejectionsRoot` is supplied — record any rejection (source dataset id, target
 * store id, timestamp) before returning (Requirement 8.3).
 *
 * Rules (Requirements 7.5, 8.1, 8.2, 8.5):
 * 1. Any Witness target ⇒ `dataset_separation` (the payload is a research record;
 *    it may never target a Witness store/corpus/testimony artifact).
 * 2. Empty or Witness-equal `datasetId` ⇒ `invalid_dataset_id`.
 * 3. Otherwise (`pes_research` target + valid dataset id) ⇒ allowed.
 *
 * The decision is synchronous and pure; recording uses synchronous fs so the
 * rejection is durably logged before the result is returned. Omit `rejectionsRoot`
 * to use the guard as a pure classifier (e.g. in unit tests).
 */
export function guardResearchWrite(
  record: PesResearchRecord,
  target: StoreTarget,
  rejectionsRoot?: string
): GuardResult {
  let reason: GuardRejectionReason | null = null;

  if (WITNESS_TARGETS.has(target)) {
    reason = "dataset_separation";
  } else if (record.datasetId === "" || record.datasetId === WITNESS_DATASET_ID) {
    reason = "invalid_dataset_id";
  }

  if (reason === null) {
    return { allowed: true };
  }

  const rejection: GuardRejection = {
    reason,
    sourceDatasetId: record.datasetId,
    targetStore: target,
    at: new Date().toISOString(),
  };

  if (rejectionsRoot !== undefined) {
    recordRejection(rejectionsRoot, rejection);
  }

  return { allowed: false, rejection };
}

/**
 * Persist a rejection entry as one JSON file under `rejectionsRoot`, mirroring the
 * file-per-record convention of the other P-E-S/Witness stores. Synchronous so the
 * write completes before {@link guardResearchWrite} returns.
 */
function recordRejection(rejectionsRoot: string, rejection: GuardRejection): void {
  mkdirSync(rejectionsRoot, { recursive: true });
  const filename = `${rejection.at.replace(/[:.]/g, "-")}-${randomUUID()}.json`;
  writeFileSync(
    path.join(rejectionsRoot, filename),
    `${JSON.stringify(rejection, null, 2)}\n`,
    "utf8"
  );
}
