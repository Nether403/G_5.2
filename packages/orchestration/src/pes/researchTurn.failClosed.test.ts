/**
 * Task 7.3 — focused unit tests for fail-closed failure entries.
 *
 * Two Req 5.5 / 7.6 behaviours, asserted sharply (these complement, and do not
 * collide with, `researchTurn.test.ts` and `failClosed.property.test.ts`):
 *
 *  (a) Scrub-failure ⇒ failure entry ONLY (Req 5.5): when de-identification does
 *      not complete under a `granted` decision, `researchTurn` writes exactly one
 *      failure entry that carries no turn content, and persists NO research record
 *      (no partial record, no record file at all).
 *
 *  (b) `granted`-then-write-failure does not prohibit the transfer ATTEMPT (Req 7.6):
 *      when consent is `granted`, the store write IS attempted; a write failure is
 *      reported (`reason:"write_failed"`) and `researchTurn` never throws — the
 *      transfer prohibition of Req 7.4 applies only while consent is declined/absent.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { researchTurn } from "./researchTurn";
import { FilePesResearchStore } from "./researchStore";
import { FilePesConsentStore } from "./consentStore";
import type { CandidateClassifier } from "./deidentify";

// Offline, deterministic classifier that flags nothing — keeps a clean scrub.
const noopClassifier: CandidateClassifier = async (candidates) => ({
  model: "stub",
  classifications: candidates.map((text) => ({ text, type: "not_pii" })),
});

// A classifier that throws — drives the fail-closed path for candidate-bearing text.
const boomClassifier: CandidateClassifier = async () => {
  throw new Error("detector down");
};

const fixedNow = () => new Date("2026-01-01T00:00:00.000Z");

async function harness(
  fn: (ctx: {
    store: FilePesResearchStore;
    consentStore: FilePesConsentStore;
    failuresRoot: string;
    recordsRoot: string;
  }) => Promise<void>
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "pes-failclosed-unit-"));
  try {
    await fn({
      store: new FilePesResearchStore(path.join(root, "records")),
      consentStore: new FilePesConsentStore(path.join(root, "consent")),
      failuresRoot: path.join(root, "failures"),
      recordsRoot: path.join(root, "records"),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function jsonFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

// ── (a) Scrub-failure ⇒ failure entry only, no content, no partial record (Req 5.5).
test("scrub-failure under granted ⇒ exactly one failure entry, zero research records (Req 5.5)", async () => {
  await harness(async ({ store, consentStore, failuresRoot, recordsRoot }) => {
    const consent = await consentStore.record({
      sessionRef: "sess-A",
      status: "granted",
      consentVersion: "pes-consent-v1",
    });

    const content = "I met Maria Okonkwo at the clinic on Tuesday.";
    const result = await researchTurn({
      content,
      sessionRef: "sess-A",
      consentRef: consent.id,
      store,
      consentStore,
      failuresRoot,
      classifier: boomClassifier, // candidate present ⇒ classification runs ⇒ throws
      now: fixedNow,
    });

    assert.equal(result.stored, false);
    assert.ok(result.stored === false && result.reason === "scrub_failed");

    // No research record was persisted — not even a partial one. The records
    // directory must contain no record files (and `list()` must be empty).
    assert.deepEqual(await store.list(), []);
    assert.deepEqual(await jsonFiles(recordsRoot), []);

    // Exactly one failure entry, identifying the affected turn, carrying NO content.
    const files = await readdir(failuresRoot);
    assert.equal(files.length, 1);
    const raw = await readFile(path.join(failuresRoot, files[0]), "utf8");
    const entry = JSON.parse(raw);
    assert.equal(entry.event, "research_scrub_failure");
    assert.equal(entry.sessionRef, "sess-A");
    assert.equal(entry.consentDecisionRef, consent.id);
    assert.equal(entry.at, "2026-01-01T00:00:00.000Z");
    // The entry must leak neither the raw turn nor the seeded identifier.
    assert.ok(!raw.includes(content), "failure entry leaked the raw turn text");
    assert.ok(!raw.includes("Maria Okonkwo"), "failure entry leaked the seeded name");
    // result.failureEntryPath points at the single written entry.
    if (result.stored === false && result.reason === "scrub_failed") {
      assert.equal(path.basename(result.failureEntryPath), files[0]);
    }
  });
});

// ── (b) granted-then-write-failure: the transfer ATTEMPT is made (Req 7.6).
test("granted + store write throws ⇒ write was ATTEMPTED, write_failed reported, never throws (Req 7.6)", async () => {
  await harness(async ({ consentStore, failuresRoot }) => {
    const consent = await consentStore.record({
      sessionRef: "sess-B",
      status: "granted",
      consentVersion: "pes-consent-v1",
    });

    // Store stub that records that `write` was invoked, then throws — proving the
    // transfer was attempted (Req 7.6) rather than prohibited.
    let writeAttempts = 0;
    const failingStore = {
      write: async (record: unknown) => {
        writeAttempts += 1;
        assert.ok(record, "write must be called with the candidate record");
        throw new Error("disk full");
      },
    } as unknown as FilePesResearchStore;

    const result = await researchTurn({
      content: "the weather is calm today", // no PII ⇒ scrub succeeds, write is reached
      sessionRef: "sess-B",
      consentRef: consent.id,
      store: failingStore,
      consentStore,
      failuresRoot,
      classifier: noopClassifier,
      now: fixedNow,
    });

    // The attempt was made exactly once; the failure is reported, not thrown.
    assert.equal(writeAttempts, 1, "granted consent must attempt the research write (Req 7.6)");
    assert.equal(result.stored, false);
    assert.ok(result.stored === false && result.reason === "write_failed");
    if (result.stored === false && result.reason === "write_failed") {
      assert.match(result.error, /disk full/);
    }

    // A write failure does NOT produce a scrub-failure entry (different failure mode).
    assert.deepEqual(await jsonFiles(failuresRoot), []);
  });
});

// ── (b cont.) Contrast: declined consent ⇒ write is NEVER attempted (Req 7.4 vs 7.6).
test("declined consent ⇒ store write is never attempted (Req 7.4 boundary vs 7.6)", async () => {
  await harness(async ({ consentStore, failuresRoot }) => {
    const consent = await consentStore.record({
      sessionRef: "sess-C",
      status: "declined",
      consentVersion: "pes-consent-v1",
    });

    let writeAttempts = 0;
    const trackingStore = {
      write: async () => {
        writeAttempts += 1;
        throw new Error("should never be called");
      },
    } as unknown as FilePesResearchStore;

    const result = await researchTurn({
      content: "the weather is calm today",
      sessionRef: "sess-C",
      consentRef: consent.id,
      store: trackingStore,
      consentStore,
      failuresRoot,
      classifier: noopClassifier,
      now: fixedNow,
    });

    assert.equal(writeAttempts, 0, "declined consent must not attempt any research write (Req 7.4)");
    assert.equal(result.stored, false);
    assert.ok(result.stored === false && result.reason === "not_granted");
    if (result.stored === false && result.reason === "not_granted") {
      assert.equal(result.consentStatus, "declined");
    }
  });
});
