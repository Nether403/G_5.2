// Property 9: Invalid research writes are rejected whole.
//
// For any attempted PES_Research_Store write that is missing a required field or
// is otherwise invalid, the store rejects the write, persists no partial record,
// and indicates the missing or invalid field.
//
// Validates: Requirements 7.3
//
// Strategy: generate an otherwise-valid record, then corrupt EXACTLY ONE required
// field per run. Because only one field is invalid, the store's first-offender
// reporting is unambiguous, so we can assert the thrown PesResearchWriteError names
// precisely the corrupted field. After each rejection we confirm the store
// directory stays empty — no partial record is ever persisted.
//
// This lives in its own file (not researchStore.property.test.ts, which holds
// Property 8) to avoid a filename collision.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import fc from "fast-check";

import { FilePesResearchStore, PesResearchWriteError } from "./researchStore";
import { WITNESS_DATASET_ID, type PesResearchRecord } from "./types";

/** Filesystem-safe id charset (record id is used as the on-disk filename). */
const ID_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_".split("");

/** The store's own ISO 8601 UTC shape — used to keep corrupt timestamps genuinely bad. */
const ISO_8601_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

/** Arbitrary otherwise-valid records (every required field present and valid). */
const validRecordArb: fc.Arbitrary<PesResearchRecord> = fc.record({
  id: fc
    .array(fc.constantFrom(...ID_CHARS), { minLength: 1, maxLength: 32 })
    .map((chars) => chars.join("")),
  datasetId: fc.string({ minLength: 1 }).filter((s) => s !== WITNESS_DATASET_ID),
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
  content: fc.string({ minLength: 1 }),
});

/** A corruption: the field it targets and how to break exactly that field. */
type Corruption = { field: keyof PesResearchRecord; mutate: fc.Arbitrary<Partial<PesResearchRecord>> };

/** Non-ISO / malformed timestamps that must never accidentally satisfy ISO_8601_UTC. */
const badTimestampArb = fc
  .oneof(
    fc.constantFrom(
      "2026-01-01", // date only
      "2026-01-01T00:00:00+02:00", // non-UTC offset
      "2026-01-01 00:00:00Z", // space separator
      "01/01/2026", // wrong format
      "not-a-date",
      "2026-13-99T99:99:99Z" // numerically impossible but regex-shaped — still must be rejected
    ),
    fc.string()
  )
  .filter((s) => !ISO_8601_UTC.test(s));

/**
 * Corrupt one required field. Empty string breaks every required string field;
 * datasetId additionally fails when it equals the Witness identity; collectedAt
 * fails on any non-ISO-UTC value.
 */
const corruptionArb: fc.Arbitrary<Corruption> = fc.oneof(
  fc.constant<Corruption>({ field: "id", mutate: fc.constant({ id: "" }) }),
  fc.constant<Corruption>({ field: "sessionRef", mutate: fc.constant({ sessionRef: "" }) }),
  fc.constant<Corruption>({
    field: "consentDecisionRef",
    mutate: fc.constant({ consentDecisionRef: "" }),
  }),
  fc.constant<Corruption>({ field: "consentVersion", mutate: fc.constant({ consentVersion: "" }) }),
  fc.constant<Corruption>({ field: "content", mutate: fc.constant({ content: "" }) }),
  fc.constant<Corruption>({
    field: "datasetId",
    mutate: fc.constantFrom({ datasetId: "" }, { datasetId: WITNESS_DATASET_ID }),
  }),
  fc.constant<Corruption>({
    field: "collectedAt",
    mutate: badTimestampArb.map((collectedAt) => ({ collectedAt })),
  })
);

/** Directory entries, tolerating a never-created store dir (ENOENT ⇒ empty). */
async function entries(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

test("Property 9: invalid research writes are rejected whole, naming the field, with no partial persist", async () => {
  await fc.assert(
    fc.asyncProperty(
      validRecordArb,
      corruptionArb.chain((c) => c.mutate.map((override) => ({ field: c.field, override }))),
      async (valid, { field, override }) => {
        const root = await mkdtemp(path.join(os.tmpdir(), "pes-research-invalid-"));
        const storeDir = path.join(root, "records");
        try {
          const store = new FilePesResearchStore(storeDir);
          const corrupted: PesResearchRecord = { ...valid, ...override };

          // The write is rejected whole, naming precisely the corrupted field.
          await assert.rejects(
            () => store.write(corrupted),
            (err: unknown) => err instanceof PesResearchWriteError && err.field === field,
            `expected PesResearchWriteError naming field "${field}"`
          );

          // No partial record persisted: the store directory holds nothing.
          assert.deepEqual(await entries(storeDir), []);
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      }
    ),
    { numRuns: 300 }
  );
});
