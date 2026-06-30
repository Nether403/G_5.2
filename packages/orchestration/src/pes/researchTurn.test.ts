import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { researchTurn } from "./researchTurn";
import { FilePesResearchStore } from "./researchStore";
import { FilePesConsentStore } from "./consentStore";
import type { CandidateClassifier } from "./deidentify";

// A classifier that never fires (no candidates flagged) — keeps scrub deterministic
// and offline. Tests that need a scrub failure inject a throwing classifier instead.
const noopClassifier: CandidateClassifier = async (candidates) => ({
  model: "stub",
  classifications: candidates.map((text) => ({ text, type: "not_pii" })),
});

const boomClassifier: CandidateClassifier = async () => {
  throw new Error("detector down");
};

async function harness(
  fn: (ctx: {
    store: FilePesResearchStore;
    consentStore: FilePesConsentStore;
    failuresRoot: string;
    recordsRoot: string;
  }) => Promise<void>
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "pes-research-turn-"));
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

const fixedNow = () => new Date("2026-01-01T00:00:00.000Z");

test("granted consent ⇒ de-identified record is stored (Req 5.1, 7.6)", async () => {
  await harness(async ({ store, consentStore, failuresRoot }) => {
    const consent = await consentStore.record({
      sessionRef: "s1",
      status: "granted",
      consentVersion: "pes-consent-v1",
    });
    const result = await researchTurn({
      content: "the weather is calm today",
      sessionRef: "s1",
      consentRef: consent.id,
      store,
      consentStore,
      failuresRoot,
      classifier: noopClassifier,
      now: fixedNow,
      idFactory: () => "rec-1",
    });
    assert.equal(result.stored, true);
    const stored = await store.getBySessionRef("s1");
    assert.equal(stored.length, 1);
    assert.equal(stored[0].content, "the weather is calm today");
    assert.equal(stored[0].consentDecisionRef, consent.id);
    assert.equal(stored[0].consentVersion, "pes-consent-v1");
  });
});

for (const status of ["declined", "withdrawn"] as const) {
  test(`${status} consent ⇒ nothing stored (Req 3.5, 7.4)`, async () => {
    await harness(async ({ store, consentStore, failuresRoot }) => {
      const consent = await consentStore.record({
        sessionRef: "s1",
        status: status === "withdrawn" ? "granted" : status,
        consentVersion: "pes-consent-v1",
      });
      if (status === "withdrawn") await consentStore.withdraw(consent.id);
      const result = await researchTurn({
        content: "I met someone yesterday",
        sessionRef: "s1",
        consentRef: consent.id,
        store,
        consentStore,
        failuresRoot,
        classifier: noopClassifier,
      });
      assert.equal(result.stored, false);
      assert.deepEqual(await store.list(), []);
    });
  });
}

test("absent consentRef ⇒ not_recorded, nothing stored (Req 3.5)", async () => {
  await harness(async ({ store, consentStore, failuresRoot }) => {
    const result = await researchTurn({
      content: "hello",
      sessionRef: "s1",
      consentRef: null,
      store,
      consentStore,
      failuresRoot,
      classifier: noopClassifier,
    });
    assert.equal(result.stored, false);
    if (result.stored === false && result.reason === "not_granted") {
      assert.equal(result.consentStatus, "not_recorded");
    } else {
      assert.fail("expected not_granted/not_recorded");
    }
    assert.deepEqual(await store.list(), []);
  });
});

test("scrub failure ⇒ failure entry only, no content stored (Req 5.5)", async () => {
  await harness(async ({ store, consentStore, failuresRoot }) => {
    const consent = await consentStore.record({
      sessionRef: "s1",
      status: "granted",
      consentVersion: "pes-consent-v1",
    });
    const result = await researchTurn({
      // contains a name candidate ⇒ classification runs ⇒ boom ⇒ fail closed
      content: "I met John Smith yesterday.",
      sessionRef: "s1",
      consentRef: consent.id,
      store,
      consentStore,
      failuresRoot,
      classifier: boomClassifier,
      now: fixedNow,
    });
    assert.equal(result.stored, false);
    assert.ok(result.stored === false && result.reason === "scrub_failed");
    // No research record persisted.
    assert.deepEqual(await store.list(), []);
    // Exactly one failure entry, carrying NO turn content.
    const files = await readdir(failuresRoot);
    assert.equal(files.length, 1);
    const entry = JSON.parse(await readFile(path.join(failuresRoot, files[0]), "utf8"));
    assert.equal(entry.event, "research_scrub_failure");
    assert.equal(entry.sessionRef, "s1");
    assert.equal(entry.consentDecisionRef, consent.id);
    assert.ok(!JSON.stringify(entry).includes("John Smith"), "failure entry leaked content");
  });
});

test("granted but store write fails ⇒ reported, never throws (Req 7.6)", async () => {
  await harness(async ({ consentStore, failuresRoot }) => {
    const consent = await consentStore.record({
      sessionRef: "s1",
      status: "granted",
      consentVersion: "pes-consent-v1",
    });
    // Store stub that throws on write — the attempt is made; failure is returned.
    const failingStore = {
      write: async () => {
        throw new Error("disk full");
      },
    } as unknown as FilePesResearchStore;
    const result = await researchTurn({
      content: "the weather is calm today",
      sessionRef: "s1",
      consentRef: consent.id,
      store: failingStore,
      consentStore,
      failuresRoot,
      classifier: noopClassifier,
    });
    assert.ok(result.stored === false && result.reason === "write_failed");
  });
});
