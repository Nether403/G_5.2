// Property 13: Erasure requests delete only the target.
//
// For any store state and any session reference, an erasure request deletes the
// research record(s) associated with that reference and reports success, leaving
// all other records unchanged; and an erasure request for a reference with no
// stored record reports that no record exists (deletes nothing) and changes nothing.
//
// Validates: Requirements 4.7, 4.8
//
// Exercised against the real FilePesResearchStore over a temp dir: a generated
// store state (records spread across several session refs) is written to disk,
// then deleteBySessionRef is invoked for a chosen reference. The deleted count is
// checked against that reference's record count, the targeted records are confirmed
// gone, and every other record is confirmed byte-for-byte unchanged. A reference
// with no stored record is also exercised (returns 0, store unchanged).

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import fc from "fast-check";

import { FilePesResearchStore } from "./researchStore";
import { type PesResearchRecord } from "./types";

/** Filesystem-safe id charset (ids double as on-disk filenames). */
const ID_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_".split("");

/** A small pool of session references so collisions across records are likely. */
const SESSION_REFS = ["s0", "s1", "s2", "s3"] as const;

/**
 * A store state: a set of records with unique ids spread across session refs,
 * plus a target session reference to erase. The target is drawn from the same
 * pool as the records (so it usually matches some) but the pool is larger than
 * the records can cover, so "no stored record" cases also occur.
 */
const stateArb = fc
  .array(
    fc.record({
      sessionRef: fc.constantFrom(...SESSION_REFS),
      consentVersion: fc.string({ minLength: 1 }),
      content: fc.string({ minLength: 1 }),
    }),
    { minLength: 0, maxLength: 12 }
  )
  .chain((seeds) =>
    fc.record({
      // Assign a unique id per record by index — ids are server-generated, not free text.
      records: fc.constant(
        seeds.map(
          (seed, index): PesResearchRecord => ({
            id: `rec-${index}`,
            datasetId: "pes-research",
            sessionRef: seed.sessionRef,
            consentDecisionRef: `consent-${index}`,
            consentVersion: seed.consentVersion,
            collectedAt: "2026-01-01T00:00:00.000Z",
            content: seed.content,
          })
        )
      ),
      // Target ref includes refs with no records (e.g. an unused pool member or a stranger).
      targetRef: fc.oneof(fc.constantFrom(...SESSION_REFS), fc.constant("absent-ref")),
    })
  );

test("Property 13: erasure deletes only the target session, leaving all others unchanged", async () => {
  await fc.assert(
    fc.asyncProperty(stateArb, async ({ records, targetRef }) => {
      const root = await mkdtemp(path.join(os.tmpdir(), "pes-research-erase-"));
      try {
        const store = new FilePesResearchStore(path.join(root, "records"));
        for (const record of records) {
          await store.write(record);
        }

        const targeted = records.filter((r) => r.sessionRef === targetRef);
        const survivors = records.filter((r) => r.sessionRef !== targetRef);

        // Erasure reports success as the count of records removed for that reference.
        const deleted = await store.deleteBySessionRef(targetRef);
        assert.equal(deleted, targeted.length);

        const remaining = await store.list();

        // Targeted records are gone.
        assert.deepEqual(await store.getBySessionRef(targetRef), []);

        // All other records remain, byte-for-byte unchanged.
        const survivorsById = new Map(survivors.map((r) => [r.id, r]));
        assert.equal(remaining.length, survivors.length);
        for (const record of remaining) {
          assert.deepEqual(record, survivorsById.get(record.id));
        }

        // A second erasure of the same reference now reports no record exists (0),
        // and changes nothing further — covers the "no stored record" case (Req 4.8).
        const deletedAgain = await store.deleteBySessionRef(targetRef);
        assert.equal(deletedAgain, 0);
        assert.equal((await store.list()).length, survivors.length);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }),
    { numRuns: 200 }
  );
});
