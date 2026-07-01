// Property 7: De-identification fails closed.
//
// For any turn whose scrubbing does not complete (detector error, timeout, or
// unhandled content), the PES_Research_Store writes no part of that turn's
// content, leaves no partial or raw content stored, and records a failure entry
// identifying the affected turn.
//
// Validates: Requirements 5.5, 10.3
//
// Two layers, both driven over arbitrary candidate-bearing inputs:
//  (a) `deidentifyTurn` returns `ok:false` (empty content, no detections)
//      whenever the injected CandidateClassifier throws/times out on inputs that
//      produce candidates.
//  (b) `researchTurn` under a `granted` decision turns that scrub failure into a
//      failure-entry-only outcome: no record stored, exactly one failure entry
//      that identifies the affected turn and carries none of the raw content.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import fc from "fast-check";

import { deidentifyTurn, type CandidateClassifier } from "./deidentify";
import { researchTurn } from "./researchTurn";
import { FilePesResearchStore } from "./researchStore";
import { FilePesConsentStore } from "./consentStore";

// ── Classifiers that never complete: the two fail-closed triggers we can drive
//    deterministically (a thrown detector error, and a timeout that rejects).
const throwingClassifier: CandidateClassifier = async () => {
  throw new Error("detector down");
};

const timeoutClassifier: CandidateClassifier = () =>
  new Promise((_resolve, reject) =>
    // Rejects like a real timeout would; resolves quickly so the suite stays fast.
    setTimeout(() => reject(new Error("classification timed out")), 5),
  );

const failingClassifiers: CandidateClassifier[] = [throwingClassifier, timeoutClassifier];

// A generator that reliably produces at least one PII candidate (a full name in
// mid-sentence position) so the classification pass MUST run — that is the only
// path where an injected classifier failure can be observed. Free text is mixed
// in around the name so the property ranges over arbitrary candidate-bearing
// turns rather than one fixed string.
const firstNames = ["John", "Maria", "Devon", "Priya", "Olen", "Sasha"];
const lastNames = ["Smith", "Okonkwo", "Larsson", "Mehta", "Vance", "Ridley"];

const candidateBearingTurn = fc
  .record({
    pre: fc.lorem({ maxCount: 6 }),
    first: fc.constantFrom(...firstNames),
    last: fc.constantFrom(...lastNames),
    post: fc.lorem({ maxCount: 6 }),
  })
  .map(({ pre, first, last, post }) => ({
    // Lowercase lead-in guarantees the name is "mid-sentence" for the extractor.
    text: `i spoke with ${first} ${last} ${post} ${pre}`.trim(),
    name: `${first} ${last}`,
  }));

test("Property 7a: scrub of candidate-bearing text fails closed when the classifier never completes", async () => {
  await fc.assert(
    fc.asyncProperty(
      candidateBearingTurn,
      fc.integer({ min: 0, max: failingClassifiers.length - 1 }),
      async ({ text }, classifierIdx) => {
        const res = await deidentifyTurn(text, failingClassifiers[classifierIdx]);
        // Fail closed: not ok, no content, no detections.
        assert.equal(res.ok, false);
        assert.equal(res.deIdentifiedText, "");
        assert.equal(res.detections.length, 0);
      },
    ),
    { numRuns: 60 },
  );
});

test("Property 7b: a granted turn whose scrub fails ⇒ failure entry only, no content stored", async () => {
  await fc.assert(
    fc.asyncProperty(
      candidateBearingTurn,
      fc.integer({ min: 0, max: failingClassifiers.length - 1 }),
      async ({ text, name }, classifierIdx) => {
        const root = await mkdtemp(path.join(os.tmpdir(), "pes-failclosed-"));
        try {
          const store = new FilePesResearchStore(path.join(root, "records"));
          const consentStore = new FilePesConsentStore(path.join(root, "consent"));
          const failuresRoot = path.join(root, "failures");

          const consent = await consentStore.record({
            sessionRef: "s1",
            status: "granted",
            consentVersion: "pes-consent-v1",
          });

          const result = await researchTurn({
            content: text,
            sessionRef: "s1",
            consentRef: consent.id,
            store,
            consentStore,
            failuresRoot,
            classifier: failingClassifiers[classifierIdx],
            now: () => new Date("2026-01-01T00:00:00.000Z"),
          });

          // No content written, scrub failure reported.
          assert.equal(result.stored, false);
          assert.ok(result.stored === false && result.reason === "scrub_failed");
          assert.deepEqual(await store.list(), []);

          // Exactly one failure entry, identifying the turn, carrying NO content.
          const files = await readdir(failuresRoot);
          assert.equal(files.length, 1);
          const raw = await readFile(path.join(failuresRoot, files[0]), "utf8");
          const entry = JSON.parse(raw);
          assert.equal(entry.event, "research_scrub_failure");
          assert.equal(entry.sessionRef, "s1");
          assert.equal(entry.consentDecisionRef, consent.id);
          assert.ok(!raw.includes(name), "failure entry leaked the seeded name");
          assert.ok(!raw.includes(text), "failure entry leaked the raw turn text");
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      },
    ),
    { numRuns: 40 },
  );
});
