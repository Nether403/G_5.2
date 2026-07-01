import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { guardResearchWrite } from "./boundaryGuard";
import { PES_RESEARCH_DATASET_ID, WITNESS_DATASET_ID, type PesResearchRecord } from "./types";

function record(datasetId: string): PesResearchRecord {
  return {
    id: "rec-1",
    datasetId,
    sessionRef: "sess-1",
    consentDecisionRef: "consent-1",
    consentVersion: "pes-consent-v1",
    collectedAt: new Date().toISOString(),
    content: "de-identified content",
  };
}

test("allows valid pes_research write", () => {
  const result = guardResearchWrite(record(PES_RESEARCH_DATASET_ID), "pes_research");
  assert.equal(result.allowed, true);
  assert.equal(result.rejection, undefined);
});

test("rejects every Witness target with dataset_separation", () => {
  for (const target of ["witness_store", "witness_corpus", "testimony"] as const) {
    const result = guardResearchWrite(record(PES_RESEARCH_DATASET_ID), target);
    assert.equal(result.allowed, false);
    assert.equal(result.rejection?.reason, "dataset_separation");
    assert.equal(result.rejection?.targetStore, target);
  }
});

test("rejects empty or Witness-equal datasetId with invalid_dataset_id", () => {
  for (const bad of ["", WITNESS_DATASET_ID]) {
    const result = guardResearchWrite(record(bad), "pes_research");
    assert.equal(result.allowed, false);
    assert.equal(result.rejection?.reason, "invalid_dataset_id");
    assert.equal(result.rejection?.sourceDatasetId, bad);
  }
});

test("records a rejection entry to the rejections root before returning", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pes-guard-"));
  try {
    const result = guardResearchWrite(record(PES_RESEARCH_DATASET_ID), "witness_store", root);
    assert.equal(result.allowed, false);

    const files = (await readdir(root)).filter((f) => f.endsWith(".json"));
    assert.equal(files.length, 1);
    const entry = JSON.parse(await readFile(path.join(root, files[0]), "utf8"));
    assert.equal(entry.reason, "dataset_separation");
    assert.equal(entry.targetStore, "witness_store");
    assert.equal(entry.sourceDatasetId, PES_RESEARCH_DATASET_ID);
    assert.ok(typeof entry.at === "string" && entry.at.length > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
