import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { isExpired, runRetentionSweep, PES_RETENTION_CONFIG } from "./retention";
import { FilePesResearchStore } from "./researchStore";
import { PES_RESEARCH_RETENTION_MS } from "./privacyNotice";
import type { PesResearchRecord } from "./types";

const cfg = { retentionMs: 1000 };

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
  fn: (store: FilePesResearchStore) => Promise<void>
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "pes-retention-"));
  try {
    await fn(new FilePesResearchStore(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("isExpired is strictly-greater-than the retention period (Req 6.2)", () => {
  const collectedAt = "2026-01-01T00:00:00.000Z";
  const base = Date.parse(collectedAt);
  const r = record({ collectedAt });
  assert.equal(isExpired(r, new Date(base + 999), cfg), false); // within period
  assert.equal(isExpired(r, new Date(base + 1000), cfg), false); // exactly at period: not exceeded
  assert.equal(isExpired(r, new Date(base + 1001), cfg), true); // past period
});

test("default config is pinned to the shared Privacy_Notice duration (Req 4.4/6.4)", () => {
  assert.equal(PES_RETENTION_CONFIG.retentionMs, PES_RESEARCH_RETENTION_MS);
});

test("sweep purges expired records and retains in-period ones, deleting content + sessionRef (Req 6.3, 6.5)", async () => {
  await withStore(async (store) => {
    // now = 2s after "old" was collected; "fresh" collected 0.5s before now.
    await store.write(record({ id: "old", collectedAt: "2026-01-01T00:00:00.000Z" }));
    await store.write(record({ id: "fresh", collectedAt: "2026-01-01T00:00:01.500Z" }));

    const now = new Date("2026-01-01T00:00:02.000Z");
    const result = await runRetentionSweep(store, now, cfg); // 1s retention period

    assert.deepEqual(result, { purged: ["old"], failed: [] });
    const remaining = (await store.list()).map((r) => r.id);
    assert.deepEqual(remaining, ["fresh"]); // whole record (content + sessionRef) gone for "old"
  });
});
