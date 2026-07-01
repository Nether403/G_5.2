// Property 17: Research dataset is namespaced apart from the session store.
// Validates: Requirements 7.1
//
// For any persisted research record, its identifier is not a PES_Session_Store
// session identifier, and it is stored under the research dataset root, sharing
// no storage location or namespace with PES_Session_Store.
//
// Two facets, tested separately:
//  (a) Per-record: a written record persists under the store's research root only
//      (and never into a sibling session-store location), and its file is named by
//      its own research-record `id` — never by its `sessionRef`. The store names
//      files by `id`, so even when `id !== sessionRef` the persisted identifier is
//      the research-record id, independent of the session identifier.
//  (b) Config: in the `pes` product the research records root and the operational
//      sessions root share no path — neither is the other, nor an ancestor of it.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import fc from "fast-check";

import { FilePesResearchStore } from "./researchStore";
import { createProductRegistry } from "../products";
import { WITNESS_DATASET_ID, type PesResearchRecord } from "./types";

/** Filesystem-safe non-empty identifier (no path separators, no surprises). */
const safeId: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
    minLength: 1,
    maxLength: 24,
  })
  .map((chars) => chars.join(""));

/** A valid PES_Research_Store record whose `id` and `sessionRef` are distinct,
 *  so the two namespaces cannot be conflated by accident. */
const recordArb: fc.Arbitrary<PesResearchRecord> = fc
  .record({
    id: safeId,
    sessionRef: safeId,
    datasetId: fc.string({ minLength: 1 }).filter((s) => s !== WITNESS_DATASET_ID),
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
  })
  .filter((r) => r.id !== r.sessionRef);

test("Property 17(a): persisted records live under the research root, keyed by research-record id not session id", async () => {
  await fc.assert(
    fc.asyncProperty(recordArb, async (record) => {
      // A research root and a SEPARATE sibling session-store location.
      const base = await mkdtemp(path.join(os.tmpdir(), "pes-ns-"));
      const researchRoot = path.join(base, "pes-research", "records");
      const sessionsRoot = path.join(base, "inquiry-sessions");
      await mkdir(sessionsRoot, { recursive: true });
      try {
        const store = new FilePesResearchStore(researchRoot);
        await store.write(record);

        // Stored under the research root only: exactly one file, named by `id`.
        const researchFiles = await readdir(researchRoot);
        assert.deepEqual(researchFiles, [`${record.id}.json`]);

        // The persisted identifier is the research-record id, never the session id.
        assert.notEqual(record.id, record.sessionRef);
        assert.ok(
          !researchFiles.includes(`${record.sessionRef}.json`),
          "no file is keyed by the session identifier"
        );

        // Nothing leaked into the operational session-store location.
        assert.deepEqual(await readdir(sessionsRoot), []);
      } finally {
        await rm(base, { recursive: true, force: true });
      }
    }),
    { numRuns: 200 }
  );
});

/** True when neither path is the other, nor an ancestor of the other. */
function sharesNoPath(a: string, b: string): boolean {
  const ra = path.resolve(a);
  const rb = path.resolve(b);
  if (ra === rb) return false;
  const under = (parent: string, child: string): boolean => {
    const rel = path.relative(parent, child);
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  };
  return !under(ra, rb) && !under(rb, ra);
}

test("Property 17(b): pes research records root and sessions root share no path", () => {
  fc.assert(
    fc.property(fc.string(), (repoRoot) => {
      const registry = createProductRegistry(path.join(os.tmpdir(), "repo", repoRoot));
      const pes = registry.pes;
      assert.ok(pes.researchRecordsRoot, "pes config defines researchRecordsRoot");
      assert.ok(
        sharesNoPath(pes.researchRecordsRoot!, pes.sessionsRoot),
        "researchRecordsRoot and sessionsRoot must share no path"
      );
    }),
    { numRuns: 100 }
  );
});
