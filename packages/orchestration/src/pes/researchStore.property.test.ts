// Property 8: Persisted research records are complete and minimal.
//
// For any record persisted to the PES_Research_Store, the record carries
// de-identified content, a collection timestamp in ISO 8601 UTC, the consent
// text version under which it was collected, a consent-decision reference that
// resolves to an existing Consent_Decision, and a non-empty dataset identifier
// not equal to the Witness dataset identifier; and the record contains no fields
// outside the defined research-record schema.
//
// Validates: Requirements 4.1, 4.2, 4.3, 4.9, 6.1, 7.2, 8.4
//
// The "resolves to an existing Consent_Decision" clause is exercised for real:
// each generated record's `consentDecisionRef` is the id of a decision first
// written to a FilePesConsentStore, and the test loads it back to confirm it
// resolves. Completeness/minimality is checked against the record read back from
// disk (via `list`), so "no fields outside the schema" reflects what was actually
// persisted, not just the in-memory input.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import fc from "fast-check";

import { FilePesResearchStore } from "./researchStore";
import { FilePesConsentStore } from "./consentStore";
import { WITNESS_DATASET_ID, type PesResearchRecord } from "./types";

/** The exact, minimal research-record schema (Requirement 4.2/4.3 data minimisation). */
const SCHEMA_KEYS = [
  "id",
  "datasetId",
  "sessionRef",
  "consentDecisionRef",
  "consentVersion",
  "collectedAt",
  "content",
].sort();

/** Same ISO 8601 UTC shape the store validates against (Requirements 6.1, 7.2). */
const ISO_8601_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

/** Arbitrary valid records, minus `consentDecisionRef` (filled from a real decision). */
const recordSeedArb = fc.record({
  // Research-record ids are server-generated identifiers (used as the on-disk
  // filename), not arbitrary free text — constrain to a realistic id charset.
  id: fc
    .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_".split("")), {
      minLength: 1,
      maxLength: 32,
    })
    .map((chars) => chars.join("")),
  // Non-empty dataset id that is never the Witness identity (Requirement 8.4).
  datasetId: fc.string({ minLength: 1 }).filter((s) => s !== WITNESS_DATASET_ID),
  sessionRef: fc.string({ minLength: 1 }),
  consentVersion: fc.string({ minLength: 1 }),
  collectedAt: fc
    .date({
      min: new Date("2000-01-01T00:00:00.000Z"),
      max: new Date("2100-01-01T00:00:00.000Z"),
      noInvalidDate: true,
    })
    .map((d) => d.toISOString()),
  // De-identified content stands in here; Property 4 covers the scrub itself.
  // Non-empty: the store treats content as a required field, so an empty-content
  // record is never a *persisted* record — outside the scope of this property.
  content: fc.string({ minLength: 1 }),
});

test("Property 8: persisted research records are complete, minimal, and consent-backed", async () => {
  await fc.assert(
    fc.asyncProperty(recordSeedArb, async (seed) => {
      const root = await mkdtemp(path.join(os.tmpdir(), "pes-research-prop-"));
      try {
        const store = new FilePesResearchStore(path.join(root, "records"));
        const consentStore = new FilePesConsentStore(path.join(root, "consent"));

        // A real Consent_Decision the record's reference must resolve to (Req 7.2).
        const consent = await consentStore.record({
          sessionRef: seed.sessionRef,
          status: "granted",
          consentVersion: seed.consentVersion,
        });

        const input: PesResearchRecord = {
          ...seed,
          consentDecisionRef: consent.id,
        };

        await store.write(input);

        // Round-trip from disk via list and getBySessionRef.
        const all = await store.list();
        assert.equal(all.length, 1);
        const persisted = all[0];
        assert.deepEqual(persisted, input);
        assert.deepEqual(await store.getBySessionRef(seed.sessionRef), [input]);

        // Complete & minimal: exactly the schema keys, nothing outside it (Req 4.2/4.3).
        assert.deepEqual(Object.keys(persisted).sort(), SCHEMA_KEYS);

        // De-identified content carried verbatim (Req 4.1 — content present).
        assert.equal(persisted.content, seed.content);

        // Collection timestamp is ISO 8601 UTC (Requirements 6.1, 7.2).
        assert.match(persisted.collectedAt, ISO_8601_UTC);

        // Dataset id is non-empty and not the Witness identity (Requirement 8.4).
        assert.ok(persisted.datasetId.length > 0);
        assert.notEqual(persisted.datasetId, WITNESS_DATASET_ID);

        // Consent-decision reference resolves to an existing decision (Req 7.2, 4.9).
        const resolved = await consentStore.load(persisted.consentDecisionRef);
        assert.notEqual(resolved, null);
        assert.equal(resolved?.consentVersion, persisted.consentVersion);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }),
    { numRuns: 200 }
  );
});
