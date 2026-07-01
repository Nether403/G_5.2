import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { FilePesConsentStore } from "./consentStore";

async function withStore(fn: (store: FilePesConsentStore, root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "pes-consent-"));
  try {
    await fn(new FilePesConsentStore(root), root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("records a granted decision with no account identifier and round-trips", async () => {
  await withStore(async (store) => {
    const rec = await store.record({
      sessionRef: "sess-1",
      status: "granted",
      consentVersion: "pes-consent-v1",
      decidedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(rec.status, "granted");
    assert.equal(rec.sessionRef, "sess-1");
    assert.equal(rec.consentVersion, "pes-consent-v1");
    assert.equal(rec.withdrawnAt, undefined);
    // No account identifier on the persisted record (Requirement 1).
    assert.deepEqual(Object.keys(rec).sort(), [
      "consentVersion",
      "decidedAt",
      "id",
      "sessionRef",
      "status",
    ]);

    const loaded = await store.load(rec.id);
    assert.deepEqual(loaded, rec);
  });
});

test("withdraw transitions to withdrawn with a timestamp (Requirement 9.2)", async () => {
  await withStore(async (store) => {
    const rec = await store.record({
      sessionRef: "sess-2",
      status: "granted",
      consentVersion: "pes-consent-v1",
    });
    const withdrawn = await store.withdraw(rec.id, "2026-02-02T00:00:00.000Z");
    assert.equal(withdrawn?.status, "withdrawn");
    assert.equal(withdrawn?.withdrawnAt, "2026-02-02T00:00:00.000Z");
  });
});

test("withdrawing an already-withdrawn record is a no-op (Requirement 9.7)", async () => {
  await withStore(async (store) => {
    const rec = await store.record({
      sessionRef: "sess-3",
      status: "granted",
      consentVersion: "pes-consent-v1",
    });
    const first = await store.withdraw(rec.id, "2026-03-03T00:00:00.000Z");
    const second = await store.withdraw(rec.id, "2026-04-04T00:00:00.000Z");
    // No state change: original withdrawnAt preserved.
    assert.deepEqual(second, first);
  });
});

test("withdraw on a missing record returns null", async () => {
  await withStore(async (store) => {
    assert.equal(await store.withdraw("does-not-exist"), null);
  });
});
