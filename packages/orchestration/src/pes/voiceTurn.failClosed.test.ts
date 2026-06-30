/**
 * voiceTurn.failClosed.test.ts — fail-closed and consent-transition coverage for the
 * optional voice path (task 14.3). Complements `voiceTurn.test.ts` (happy/absent paths)
 * with the three safety-critical cases:
 *
 *  (a) Deepgram error/timeout ⇒ abort with NO write, error surfaced (Requirement 10.6).
 *  (b) A transcript that fails de-identification ⇒ the unscrubbed transcript is
 *      discarded, nothing is stored, only a failure entry is written (Requirement 10.3).
 *  (c) Consent transitions to `declined` DURING the transcription window ⇒ transcription
 *      result is dropped and nothing is persisted (Requirement 10.7).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { researchVoiceTurn } from "./voiceTurn";
import { FilePesConsentStore } from "./consentStore";
import { FilePesResearchStore } from "./researchStore";
import type { AudioRef, TranscribeResult } from "./transcribe";
import type { CandidateClassifier } from "./deidentify";

const AUDIO: AudioRef = { data: new Uint8Array([1, 2, 3]), mimeType: "audio/webm" };

async function fixtures() {
  const root = await mkdtemp(path.join(tmpdir(), "pes-voice-failclosed-"));
  const consentStore = new FilePesConsentStore(path.join(root, "consent"));
  const store = new FilePesResearchStore(path.join(root, "records"));
  const failuresRoot = path.join(root, "failures");
  return { consentStore, store, failuresRoot };
}

async function grantedConsent(consentStore: FilePesConsentStore) {
  return consentStore.record({
    sessionRef: "s1",
    status: "granted",
    consentVersion: "pes-consent-v1",
  });
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

// ── (a) Deepgram error/timeout aborts with no write and a surfaced error (10.6) ──
test("Deepgram error/timeout aborts: no write, no failure entry, error surfaced (10.6)", async () => {
  const { consentStore, store, failuresRoot } = await fixtures();
  const consent = await grantedConsent(consentStore);

  // Simulate Deepgram returning ok:false (the shape produced on error or 30s timeout).
  const transcribe = async (): Promise<TranscribeResult> => ({
    ok: false,
    error: "Deepgram timed out after 30000ms",
  });

  const result = await researchVoiceTurn({
    audio: AUDIO,
    sessionRef: "s1",
    consentRef: consent.id,
    store,
    consentStore,
    failuresRoot,
    transcribe,
  });

  assert.equal(result.stored, false);
  assert.equal((result as { reason: string }).reason, "transcription_failed");
  assert.match(
    (result as { error: string }).error,
    /timed out/,
    "the transcription error must be surfaced to the caller"
  );
  // Nothing persisted, and a transcription abort is not a scrub failure: no entry either.
  assert.deepEqual(await store.list(), []);
  assert.deepEqual(await listFiles(failuresRoot), []);
});

// ── (b) Unscrubbed transcript is discarded; only a failure entry is written (10.3) ──
test("unscrubbed transcript is discarded; only a failure entry is written (10.3)", async () => {
  const { consentStore, store, failuresRoot } = await fixtures();
  const consent = await grantedConsent(consentStore);

  // A transcript with a PII candidate (a title-case name) forces classification,
  // which we make fail — so de-identification cannot complete and fails closed.
  const transcript = "I spoke with Jonathan Reederman about the case yesterday";
  const transcribe = async (): Promise<TranscribeResult> => ({ ok: true, transcript });
  const throwingClassifier: CandidateClassifier = async () => {
    throw new Error("classifier unavailable");
  };

  const result = await researchVoiceTurn({
    audio: AUDIO,
    sessionRef: "s1",
    consentRef: consent.id,
    store,
    consentStore,
    failuresRoot,
    transcribe,
    classifier: throwingClassifier,
  });

  assert.equal(result.stored, false);
  assert.equal((result as { reason: string }).reason, "scrub_failed");

  // The unscrubbed transcript is never persisted as a research record.
  assert.deepEqual(await store.list(), []);

  // Exactly one failure entry was written, and it carries NO transcript content.
  const failureFiles = await listFiles(failuresRoot);
  assert.equal(failureFiles.length, 1, "a single scrub-failure entry should be written");
  const entryRaw = await readFile(path.join(failuresRoot, failureFiles[0]!), "utf8");
  const entry = JSON.parse(entryRaw) as Record<string, unknown>;
  assert.equal(entry.event, "research_scrub_failure");
  assert.equal(entry.sessionRef, "s1");
  assert.ok(
    !entryRaw.includes("Jonathan") && !entryRaw.includes("Reederman"),
    "the failure entry must not leak any of the unscrubbed transcript"
  );
});

// ── (c) Consent transitions to `declined` mid-session ⇒ nothing persisted (10.7) ──
test("consent declined during transcription ⇒ transcript dropped, nothing persisted (10.7)", async () => {
  const { consentStore, store, failuresRoot } = await fixtures();
  const consent = await grantedConsent(consentStore);

  // The pre-transcription gate sees `granted`; while "Deepgram" runs, the data
  // subject withdraws/declines. researchTurn re-resolves consent at write time and
  // must therefore persist nothing (Requirement 10.7).
  const transcribe = async (): Promise<TranscribeResult> => {
    await consentStore.record({
      id: consent.id,
      sessionRef: "s1",
      status: "declined",
      consentVersion: "pes-consent-v1",
    });
    return { ok: true, transcript: "hello world" };
  };

  const result = await researchVoiceTurn({
    audio: AUDIO,
    sessionRef: "s1",
    consentRef: consent.id,
    store,
    consentStore,
    failuresRoot,
    transcribe,
  });

  assert.equal(result.stored, false);
  assert.equal((result as { reason: string }).reason, "not_granted");
  assert.equal((result as { consentStatus: string }).consentStatus, "declined");
  assert.deepEqual(await store.list(), []);
});
