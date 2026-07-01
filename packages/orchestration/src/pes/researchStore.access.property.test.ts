// Property 12: Access requests round-trip.
// Validates: Requirements 4.5, 4.6
//
// For any research record written under a session reference, a data-subject
// access request for that reference returns the stored record; and for any
// reference with no stored record, the access request indicates that no record
// exists.
//
// Exercised for real against FilePesResearchStore.getBySessionRef over a temp
// dir: N records are written across several session refs, then for every used
// ref getBySessionRef returns exactly the records collected under it (the DSAR
// "return the stored record" obligation, Req 4.5), and for a ref with no stored
// record it returns [] (the "indicate that no record exists" obligation, Req 4.6).

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import fc from "fast-check";

import { FilePesResearchStore } from "./researchStore";
import { type PesResearchRecord } from "./types";

/** Filesystem-safe non-empty identifier (no path separators, no surprises). */
const safeId: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
    minLength: 1,
    maxLength: 16,
  })
  .map((chars) => chars.join(""));

/**
 * A scenario: several records spread across a handful of session refs, plus one
 * ref guaranteed to have no stored record. Record ids are unique (the store keys
 * files by id), and each record's sessionRef is drawn from the small ref pool so
 * multiple records can share a ref.
 */
const scenarioArb = fc
  .record({
    // A small pool of session refs so records actually cluster onto shared refs.
    refPool: fc.uniqueArray(safeId, { minLength: 1, maxLength: 4 }),
    // For each record: which ref pool index it belongs to, and its content.
    records: fc.array(
      fc.record({ refIndex: fc.nat(), content: fc.string({ minLength: 1 }) }),
      { minLength: 1, maxLength: 12 }
    ),
    // A candidate "unknown" ref; filtered below to be absent from the pool.
    unknownRef: safeId,
  })
  .filter(({ refPool, unknownRef }) => !refPool.includes(unknownRef))
  .map(({ refPool, records, unknownRef }) => ({
    unknownRef,
    records: records.map((r, i) => ({
      id: `rec-${i}`,
      datasetId: "pes-research",
      sessionRef: refPool[r.refIndex % refPool.length],
      consentDecisionRef: `consent-${i}`,
      consentVersion: "pes-consent-v1",
      collectedAt: "2026-01-01T00:00:00.000Z",
      content: r.content,
    })) as PesResearchRecord[],
  }));

test("Property 12: access requests round-trip per session ref, and report none for an unknown ref", async () => {
  await fc.assert(
    fc.asyncProperty(scenarioArb, async ({ records, unknownRef }) => {
      const root = await mkdtemp(path.join(os.tmpdir(), "pes-research-access-"));
      try {
        const store = new FilePesResearchStore(path.join(root, "records"));
        for (const rec of records) {
          await store.write(rec);
        }

        // For every session ref that has records, the access request returns
        // exactly the records collected under that ref — no more, no fewer (Req 4.5).
        const usedRefs = [...new Set(records.map((r) => r.sessionRef))];
        for (const ref of usedRefs) {
          const expected = records.filter((r) => r.sessionRef === ref);
          const got = await store.getBySessionRef(ref);
          assert.deepEqual(
            [...got].sort((a, b) => a.id.localeCompare(b.id)),
            [...expected].sort((a, b) => a.id.localeCompare(b.id)),
            `getBySessionRef(${ref}) must return exactly its stored records`
          );
        }

        // A reference with no stored record indicates none exists (Req 4.6).
        assert.deepEqual(await store.getBySessionRef(unknownRef), []);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }),
    { numRuns: 200 }
  );
});
