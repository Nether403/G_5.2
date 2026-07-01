import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { FilePesResearchStore, PesResearchWriteError } from "./researchStore";
import { WITNESS_DATASET_ID, type PesResearchRecord } from "./types";

function record(overrides: Partial<PesResearchRecord> = {}): PesResearchRecord {
  return {
    id: "rec-1",
    datasetId: "pes-research",
    sessionRef: "sess-1",
    consentDecisionRef: "consent-1",
    consentVersion: "pes-consent-v1",
    collectedAt: "2026-01-01T00:00:00.000Z",
    content: "de-identified content",
    ...overrides,
  };
}

async function withStore(
  fn: (store: FilePesResearchStore, root: string) => Promise<void>
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "pes-research-"));
  try {
    await fn(new FilePesResearchStore(root), root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("write persists a valid record and round-trips via list (Req 7.2)", async () => {
  await withStore(async (store) => {
    const saved = await store.write(record());
    assert.deepEqual(saved, record());
    const all = await store.list();
    assert.equal(all.length, 1);
    assert.deepEqual(all[0], record());
  });
});

test("getBySessionRef returns matching records, empty when none (Req 4.5, 4.6)", async () => {
  await withStore(async (store) => {
    await store.write(record({ id: "a", sessionRef: "s1" }));
    await store.write(record({ id: "b", sessionRef: "s2" }));
    assert.equal((await store.getBySessionRef("s1")).length, 1);
    assert.deepEqual(await store.getBySessionRef("none"), []);
  });
});

test("deleteBySessionRef erases only the target session (Req 4.7, 4.8)", async () => {
  await withStore(async (store) => {
    await store.write(record({ id: "a", sessionRef: "s1" }));
    await store.write(record({ id: "b", sessionRef: "s1" }));
    await store.write(record({ id: "c", sessionRef: "s2" }));
    assert.equal(await store.deleteBySessionRef("s1"), 2);
    assert.deepEqual((await store.list()).map((r) => r.id), ["c"]);
    // No record for the reference: nothing deleted, others unchanged.
    assert.equal(await store.deleteBySessionRef("none"), 0);
    assert.equal((await store.list()).length, 1);
  });
});

test("invalid writes are rejected whole, naming the field, with no partial persist (Req 7.3)", async () => {
  await withStore(async (store, root) => {
    const cases: Array<[Partial<PesResearchRecord>, string]> = [
      [{ sessionRef: "" }, "sessionRef"],
      [{ consentDecisionRef: "" }, "consentDecisionRef"],
      [{ consentVersion: "" }, "consentVersion"],
      [{ content: "" }, "content"],
      [{ datasetId: "" }, "datasetId"],
      [{ datasetId: WITNESS_DATASET_ID }, "datasetId"],
      [{ collectedAt: "2026-01-01" }, "collectedAt"],
      [{ collectedAt: "2026-01-01T00:00:00+02:00" }, "collectedAt"],
    ];
    for (const [override, field] of cases) {
      await assert.rejects(
        () => store.write(record(override)),
        (err: unknown) =>
          err instanceof PesResearchWriteError && err.field === field,
        `expected rejection naming field ${field}`
      );
    }
    // Nothing was persisted by any rejected write.
    assert.deepEqual(await readdir(root), []);
  });
});

test("delete returns false for a missing id", async () => {
  await withStore(async (store) => {
    assert.equal(await store.delete("nope"), false);
  });
});
