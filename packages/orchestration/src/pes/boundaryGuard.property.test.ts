// Property 10: Boundary guard blocks cross-dataset writes.
// Validates: Requirements 7.5, 8.1, 8.2, 8.3
//
// For any PES_Research_Store record and any Witness target (witness_store,
// witness_corpus, testimony), the Boundary_Guard rejects the write by matching
// the payload type against the target store, returns a dataset-separation
// rejection to the caller, and records a rejection entry capturing the source
// dataset id, the target store id, and a timestamp. The guard never performs a
// write to the target — it returns the rejection before any byte could be
// persisted — so "leaves the target store unchanged" holds structurally.

import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import fc from "fast-check";

import { guardResearchWrite } from "./boundaryGuard";
import { WITNESS_DATASET_ID, type PesResearchRecord, type StoreTarget } from "./types";

const WITNESS_TARGETS = ["witness_store", "witness_corpus", "testimony"] as const;

/** Arbitrary valid PES_Research_Store records: every field non-empty, dataset id
 *  is a non-empty source id that is not the Witness dataset id. */
const researchRecordArb: fc.Arbitrary<PesResearchRecord> = fc.record({
  id: fc.string({ minLength: 1 }),
  datasetId: fc.string({ minLength: 1 }).filter((s) => s !== WITNESS_DATASET_ID),
  sessionRef: fc.string({ minLength: 1 }),
  consentDecisionRef: fc.string({ minLength: 1 }),
  consentVersion: fc.string({ minLength: 1 }),
  collectedAt: fc.date({
    min: new Date("2000-01-01T00:00:00.000Z"),
    max: new Date("2100-01-01T00:00:00.000Z"),
    noInvalidDate: true,
  }).map((d) => d.toISOString()),
  content: fc.string(),
});

const targetArb: fc.Arbitrary<StoreTarget> = fc.constantFrom(...WITNESS_TARGETS);

test("Property 10: Boundary_Guard blocks every research write to a Witness target and logs it", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pes-guard-prop-"));
  try {
    await fc.assert(
      fc.asyncProperty(researchRecordArb, targetArb, async (record, target) => {
        const before = new Set(await readdir(root));

        const result = guardResearchWrite(record, target, root);

        // Rejected before any byte is persisted, with a dataset-separation reason
        // returned to the caller (Requirements 7.5, 8.1, 8.2).
        assert.equal(result.allowed, false);
        assert.equal(result.rejection?.reason, "dataset_separation");
        assert.equal(result.rejection?.targetStore, target);
        assert.equal(result.rejection?.sourceDatasetId, record.datasetId);

        // Exactly one rejection entry recorded, capturing source dataset id,
        // target store id, and timestamp (Requirement 8.3).
        const after = await readdir(root);
        const added = after.filter((f) => !before.has(f) && f.endsWith(".json"));
        assert.equal(added.length, 1);
        const entry = JSON.parse(await readFile(path.join(root, added[0]), "utf8"));
        assert.equal(entry.reason, "dataset_separation");
        assert.equal(entry.targetStore, target);
        assert.equal(entry.sourceDatasetId, record.datasetId);
        assert.ok(typeof entry.at === "string" && entry.at.length > 0);
      }),
      { numRuns: 200 }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Property 11: Invalid dataset identifiers are rejected.
// Validates: Requirements 8.5
//
// For any record presented for write whose dataset identifier is empty or equal
// to the Witness dataset identifier, the Boundary_Guard (targeting the legitimate
// pes_research store) rejects the write with an invalid_dataset_id reason, returns
// that rejection to the caller, and records a rejection entry capturing the source
// dataset id, the target store id, and a timestamp. The guard returns the rejection
// before any byte could be persisted, so "leaves the target store unchanged" holds
// structurally.

/** Arbitrary record fields, with datasetId forced to an invalid value: either the
 *  empty string or exactly the Witness dataset id. All other fields are arbitrary. */
const invalidDatasetRecordArb: fc.Arbitrary<PesResearchRecord> = fc
  .record({
    id: fc.string({ minLength: 1 }),
    datasetId: fc.constantFrom("", WITNESS_DATASET_ID),
    sessionRef: fc.string({ minLength: 1 }),
    consentDecisionRef: fc.string({ minLength: 1 }),
    consentVersion: fc.string({ minLength: 1 }),
    collectedAt: fc
      .date({
        min: new Date("2000-01-01T00:00:00.000Z"),
        max: new Date("2100-01-01T00:00:00.000Z"),
        noInvalidDate: true,
      })
      .map((d) => d.toISOString()),
    content: fc.string(),
  });

test("Property 11: Boundary_Guard rejects empty or Witness-equal dataset ids and logs it", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pes-guard-invalid-"));
  try {
    await fc.assert(
      fc.asyncProperty(invalidDatasetRecordArb, async (record) => {
        const before = new Set(await readdir(root));

        // Target the legitimate research store: the only reason to reject is the
        // invalid dataset id, not dataset separation (Requirement 8.5).
        const result = guardResearchWrite(record, "pes_research", root);

        assert.equal(result.allowed, false);
        assert.equal(result.rejection?.reason, "invalid_dataset_id");
        assert.equal(result.rejection?.targetStore, "pes_research");
        assert.equal(result.rejection?.sourceDatasetId, record.datasetId);

        // Exactly one rejection entry recorded, capturing source dataset id,
        // target store id, and timestamp.
        const after = await readdir(root);
        const added = after.filter((f) => !before.has(f) && f.endsWith(".json"));
        assert.equal(added.length, 1);
        const entry = JSON.parse(await readFile(path.join(root, added[0]), "utf8"));
        assert.equal(entry.reason, "invalid_dataset_id");
        assert.equal(entry.targetStore, "pes_research");
        assert.equal(entry.sourceDatasetId, record.datasetId);
        assert.ok(typeof entry.at === "string" && entry.at.length > 0);
      }),
      { numRuns: 200 }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
