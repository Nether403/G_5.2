import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import fc from "fast-check";

import { researchTurn } from "./researchTurn";
import { FilePesResearchStore } from "./researchStore";
import { FilePesConsentStore } from "./consentStore";
import type { CandidateClassifier } from "./deidentify";

/**
 * Property 1: Consent gating — only `granted` permits research storage.
 *
 * For any P-E-S session and any sequence of turns, if the resolved consent
 * state is anything other than `granted` (not-yet-recorded, declined,
 * withdrawn, or record-failed) then the PES_Research_Store contains zero
 * content originating from that session. Only `granted` yields stored content.
 *
 * **Validates: Requirements 2.3, 2.6, 2.7, 3.3, 3.5, 7.4, 9.3, 10.4, 10.5, 10.7**
 */

// Deterministic, offline classifier: flags nothing as PII so scrubbing always
// completes (ok:true). This isolates the consent gate as the only thing that
// can stop a write — a non-empty store after a run means consent permitted it.
const noopClassifier: CandidateClassifier = async (candidates) => ({
  model: "stub",
  classifications: candidates.map((text) => ({ text, type: "not_pii" })),
});

// The four resolvable non-/granted states the orchestrator distinguishes.
// `not_recorded` models both "not yet recorded" and "record failed" (absent ref).
type ConsentState = "not_recorded" | "declined" | "withdrawn" | "granted";

const fixedNow = () => new Date("2026-01-01T00:00:00.000Z");

async function withTempStores(
  fn: (ctx: {
    store: FilePesResearchStore;
    consentStore: FilePesConsentStore;
    failuresRoot: string;
  }) => Promise<void>
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "pes-consent-gating-"));
  try {
    await fn({
      store: new FilePesResearchStore(path.join(root, "records")),
      consentStore: new FilePesConsentStore(path.join(root, "consent")),
      failuresRoot: path.join(root, "failures"),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// Resolve a consent state into the `consentRef` the turn path would carry.
async function setUpConsent(
  consentStore: FilePesConsentStore,
  sessionRef: string,
  state: ConsentState
): Promise<string | null> {
  switch (state) {
    case "not_recorded":
      return null; // absent ref ⇒ record-failed / not-yet-recorded
    case "declined": {
      const c = await consentStore.record({ sessionRef, status: "declined", consentVersion: "pes-consent-v1" });
      return c.id;
    }
    case "withdrawn": {
      const c = await consentStore.record({ sessionRef, status: "granted", consentVersion: "pes-consent-v1" });
      await consentStore.withdraw(c.id);
      return c.id;
    }
    case "granted": {
      const c = await consentStore.record({ sessionRef, status: "granted", consentVersion: "pes-consent-v1" });
      return c.id;
    }
  }
}

test("Property 1: only `granted` permits research storage; every other state stores nothing", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom<ConsentState>("not_recorded", "declined", "withdrawn", "granted"),
      // A sequence of turns: each a non-empty content string.
      fc.array(fc.string({ minLength: 1, maxLength: 40 }), { minLength: 1, maxLength: 6 }),
      async (state, turns) => {
        await withTempStores(async ({ store, consentStore, failuresRoot }) => {
          const sessionRef = "s1";
          const consentRef = await setUpConsent(consentStore, sessionRef, state);

          for (const content of turns) {
            const result = await researchTurn({
              content,
              sessionRef,
              consentRef,
              store,
              consentStore,
              failuresRoot,
              classifier: noopClassifier,
              now: fixedNow,
            });
            if (state !== "granted") {
              // Non-granted must never store: the orchestrator returns not_granted.
              assert.equal(result.stored, false);
            }
          }

          const stored = await store.list();
          if (state === "granted") {
            // Granted permits storage: one de-identified record per turn, all
            // originating from this session.
            assert.equal(stored.length, turns.length);
            for (const rec of stored) {
              assert.equal(rec.sessionRef, sessionRef);
              assert.equal(rec.consentDecisionRef, consentRef);
            }
          } else {
            // Every non-granted state ⇒ zero content from this session.
            assert.deepEqual(stored, []);
            assert.deepEqual(await store.getBySessionRef(sessionRef), []);
          }
        });
      }
    ),
    { numRuns: 100 }
  );
});
