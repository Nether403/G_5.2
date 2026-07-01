import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { researchVoiceTurn } from "./voiceTurn";
import { FilePesConsentStore } from "./consentStore";
import { FilePesResearchStore } from "./researchStore";
import type { AudioRef, TranscribeResult } from "./transcribe";

const AUDIO: AudioRef = { data: new Uint8Array([1, 2, 3]), mimeType: "audio/webm" };

async function fixtures() {
  const root = await mkdtemp(path.join(tmpdir(), "pes-voice-"));
  const consentStore = new FilePesConsentStore(path.join(root, "consent"));
  const store = new FilePesResearchStore(path.join(root, "records"));
  const failuresRoot = path.join(root, "failures");
  return { consentStore, store, failuresRoot };
}

/** A transcribe stub that records whether it was invoked. */
function transcriber(result: TranscribeResult) {
  const spy = { called: false };
  const fn = async () => {
    spy.called = true;
    return result;
  };
  return { fn, spy };
}

test("does not transcribe and persists nothing when consent is absent (10.4/10.7)", async () => {
  const { consentStore, store, failuresRoot } = await fixtures();
  const { fn, spy } = transcriber({ ok: true, transcript: "hello world" });

  const result = await researchVoiceTurn({
    audio: AUDIO,
    sessionRef: "s1",
    consentRef: null,
    store,
    consentStore,
    failuresRoot,
    transcribe: fn,
  });

  assert.equal(result.stored, false);
  assert.equal(spy.called, false, "transcription must not run without consent");
  assert.deepEqual(await store.list(), []);
});

test("does not transcribe when consent is declined (10.4/10.7)", async () => {
  const { consentStore, store, failuresRoot } = await fixtures();
  const consent = await consentStore.record({
    sessionRef: "s1",
    status: "declined",
    consentVersion: "pes-consent-v1",
  });
  const { fn, spy } = transcriber({ ok: true, transcript: "hello world" });

  const result = await researchVoiceTurn({
    audio: AUDIO,
    sessionRef: "s1",
    consentRef: consent.id,
    store,
    consentStore,
    failuresRoot,
    transcribe: fn,
  });

  assert.equal(result.stored, false);
  assert.equal(spy.called, false);
  assert.deepEqual(await store.list(), []);
});

test("fails closed with no write when transcription fails (10.6)", async () => {
  const { consentStore, store, failuresRoot } = await fixtures();
  const consent = await consentStore.record({
    sessionRef: "s1",
    status: "granted",
    consentVersion: "pes-consent-v1",
  });
  const { fn } = transcriber({ ok: false, error: "timed out" });

  const result = await researchVoiceTurn({
    audio: AUDIO,
    sessionRef: "s1",
    consentRef: consent.id,
    store,
    consentStore,
    failuresRoot,
    transcribe: fn,
  });

  assert.equal(result.stored, false);
  assert.equal((result as { reason: string }).reason, "transcription_failed");
  assert.deepEqual(await store.list(), []);
});

test("routes a successful transcript through researchTurn and stores it (10.2)", async () => {
  const { consentStore, store, failuresRoot } = await fixtures();
  const consent = await consentStore.record({
    sessionRef: "s1",
    status: "granted",
    consentVersion: "pes-consent-v1",
  });
  // No-PII transcript: regex-only scrub completes without a classifier.
  const { fn } = transcriber({ ok: true, transcript: "hello world" });

  const result = await researchVoiceTurn({
    audio: AUDIO,
    sessionRef: "s1",
    consentRef: consent.id,
    store,
    consentStore,
    failuresRoot,
    transcribe: fn,
  });

  assert.equal(result.stored, true);
  const stored = await store.getBySessionRef("s1");
  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.content, "hello world");
});
