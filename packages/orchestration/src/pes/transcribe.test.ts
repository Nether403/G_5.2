import test from "node:test";
import assert from "node:assert/strict";

import { transcribeForResearch } from "./transcribe";

const KEY = "DEEPGRAM_API_KEY";

function withEnv(value: string | undefined, fn: () => Promise<void>): Promise<void> {
  const prev = process.env[KEY];
  if (value === undefined) delete process.env[KEY];
  else process.env[KEY] = value;
  return fn().finally(() => {
    if (prev === undefined) delete process.env[KEY];
    else process.env[KEY] = prev;
  });
}

function withFetch(stub: typeof fetch, fn: () => Promise<void>): Promise<void> {
  const prev = globalThis.fetch;
  globalThis.fetch = stub;
  return fn().finally(() => {
    globalThis.fetch = prev;
  });
}

const audio = { data: new Uint8Array([1, 2, 3]), mimeType: "audio/webm" };

test("fails closed when Deepgram is not configured", async () => {
  await withEnv(undefined, async () => {
    const result = await transcribeForResearch(audio);
    assert.equal(result.ok, false);
    assert.equal(result.transcript, undefined);
    assert.match(result.error ?? "", /not configured/);
  });
});

test("fails closed (timeout) with no partial transcript when Deepgram hangs", async () => {
  // Stub fetch that never resolves but honors the abort signal, like real fetch.
  const hangingFetch = ((_url: string, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError"))
      );
    })) as unknown as typeof fetch;

  await withEnv("test-key", () =>
    withFetch(hangingFetch, async () => {
      const result = await transcribeForResearch(audio, { timeoutMs: 30 });
      assert.equal(result.ok, false);
      assert.equal(result.transcript, undefined);
      assert.match(result.error ?? "", /timed out/);
    })
  );
});

test("fails closed on a Deepgram HTTP error", async () => {
  const errorFetch = (async () =>
    new Response("unauthorized", { status: 401, statusText: "Unauthorized" })) as typeof fetch;

  await withEnv("test-key", () =>
    withFetch(errorFetch, async () => {
      const result = await transcribeForResearch(audio);
      assert.equal(result.ok, false);
      assert.equal(result.transcript, undefined);
      assert.match(result.error ?? "", /401/);
    })
  );
});

test("returns transcript on success", async () => {
  const okFetch = (async () =>
    new Response(
      JSON.stringify({
        results: { channels: [{ alternatives: [{ transcript: "hello world" }] }] },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;

  await withEnv("test-key", () =>
    withFetch(okFetch, async () => {
      const result = await transcribeForResearch(audio);
      assert.equal(result.ok, true);
      assert.equal(result.transcript, "hello world");
    })
  );
});

test("fails closed when the transcript is empty", async () => {
  const emptyFetch = (async () =>
    new Response(
      JSON.stringify({ results: { channels: [{ alternatives: [{ transcript: "   " }] }] } }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;

  await withEnv("test-key", () =>
    withFetch(emptyFetch, async () => {
      const result = await transcribeForResearch(audio);
      assert.equal(result.ok, false);
      assert.equal(result.transcript, undefined);
      assert.match(result.error ?? "", /no transcript/);
    })
  );
});
