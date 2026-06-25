#!/usr/bin/env tsx
/**
 * scripts/corpus-entry-smoke.ts
 *
 * Wiring proof for the outreach-ready-corpus-entry pipeline (the NEW code from
 * the spec). It exercises the real governed-plane path end to end with no API
 * key and no live provider:
 *
 *   authored sections + sealed-testimony ref
 *     -> compileCorpusEntry  (partition + hashing + eval-standard + fail-closed parse)
 *     -> exportCorpusEntryBundle  (emits real bundle.json/.md/manifest.json)
 *     -> read the artifacts back and assert the public bundle leaks nothing
 *
 * It deliberately compiles a SYNTHETIC exemplar (real entries require a live
 * consented witness — see docs/first-real-corpus-entry-runbook.md) and then
 * demonstrates that the outreach-readiness preconditions correctly REFUSE a
 * synthetic entry (Property 6).
 *
 * The upstream live session (Inquisitor turns, testimony seal, synthesis,
 * annotation) is proven by scripts/smoke-tests.ts; the TWP control-plane gate,
 * disclosure ledger, and revocation coordinator are proven by the TWP vitest
 * suite. This script proves the corpus-entry assembly/export seam composes.
 *
 * Exit codes: 0 — wiring proof passed; 1 — a check failed.
 * Run via `pnpm smoke:corpus`.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  compileCorpusEntry,
  type CompileCorpusEntryInput,
} from "../packages/witness-types/src/compiler";
import { syntheticCorpusEntry } from "../packages/witness-types/src/fixtures/syntheticCorpusEntry";
import { exportCorpusEntryBundle } from "../packages/orchestration/src/witness/corpusEntryExport";

function buildInput(): CompileCorpusEntryInput {
  const f = structuredClone(syntheticCorpusEntry);
  return {
    entryId: "twp_entry_wiring_smoke_0001",
    entryKind: "synthetic_exemplar",
    isSynthetic: true,
    syntheticNotice: "SYNTHETIC wiring-proof entry — not real testimony.",
    framingStatement: f.meta.framing_statement,
    consentVersionRef: f.meta.consent_version_ref,
    testimony: {
      testimonyId: f.references.g52_governed.testimony_id,
      contentHash: f.meta.hashes.source_testimony_hash,
    },
    consentBoundary: f.consent_boundary,
    references: f.references,
    provenance: f.provenance,
    humanReadable: f.human_readable,
    reasoningStructure: f.reasoning_structure,
    plurality: f.plurality,
    evalCase: f.eval_case,
    publicSlice: f.public_slice,
    datasheetSummary: f.datasheet_summary,
    reviewSummary: f.review_summary,
    privateSection: f.private,
  };
}

/**
 * The two machine-enforced outreach preconditions (mirrors the structural gates
 * in TWP's outreach-readiness.ts evaluateOutreachReadiness; the R1–R10 checklist
 * is reviewer-confirmed there). Inlined here only to demonstrate the refusal.
 */
function outreachPreconditionsMet(entry: {
  meta: { entry_kind: string; outreach_ready: boolean; hashes: { redacted_public_slice_hash: string | null } };
}): boolean {
  return (
    entry.meta.entry_kind === "real" &&
    entry.meta.hashes.redacted_public_slice_hash !== null
  );
}

async function main(): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-corpus-entry-smoke-"));
  try {
    // 1. Compile — runs partition, hashing, eval-standard, and fail-closed parse.
    const entry = compileCorpusEntry(buildInput());
    assert.equal(entry.meta.outreach_ready, false, "compile must not assert readiness");
    assert.notEqual(
      entry.meta.hashes.redacted_public_slice_hash,
      null,
      "compile must compute the public-slice hash",
    );

    // 2. Export — emits the real bundle triplet and back-fills the bundle hash.
    const result = await exportCorpusEntryBundle({ publicationBundleRoot: root, entry });
    const jsonRaw = await readFile(result.bundleJsonPath, "utf8");
    const manifestRaw = await readFile(result.bundleManifestPath, "utf8");
    const bundle = JSON.parse(jsonRaw);
    const manifest = JSON.parse(manifestRaw);

    // 3. The public bundle exposes the public slice and nothing sensitive.
    assert.equal(bundle.publicSlice.eval_case_public, entry.eval_case.eval_id);
    const sourceHash = entry.meta.hashes.source_testimony_hash;
    const vaultRef = entry.references.twp_control_plane.witness_profile_ref;
    assert.equal(jsonRaw.includes(sourceHash), false, "source hash must not be in the public bundle");
    assert.equal(jsonRaw.includes(vaultRef), false, "internal vault ref must not be in the public bundle");
    assert.equal(jsonRaw.includes("held_back_notes"), false, "private notes must not be in the public bundle");

    // 4. Bundle hash integrity.
    const recomputed = `sha256:${createHash("sha256").update(jsonRaw).digest("hex")}`;
    assert.equal(result.publicationBundleHash, recomputed, "publication_bundle_hash must match the body");
    assert.equal(manifest.publicationBundleHash, recomputed, "manifest must carry the bundle hash");
    assert.equal(result.entry.meta.hashes.publication_bundle_hash, recomputed, "entry must be back-filled with the hash");

    // 5. The synthetic exemplar must NOT meet the outreach preconditions.
    assert.equal(outreachPreconditionsMet(entry), false, "a synthetic entry must be gate-refused (Property 6)");

    console.log("corpus-entry wiring proof: PASS");
    console.log(`  entry_id:                ${entry.meta.entry_id} (${entry.meta.entry_kind})`);
    console.log(`  bundle.json:             ${result.bundleJsonPath}`);
    console.log(`  manifest.json:           ${result.bundleManifestPath}`);
    console.log(`  publication_bundle_hash: ${result.publicationBundleHash}`);
    console.log(`  outreach-ready:          false (synthetic — gate correctly refuses)`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("corpus-entry wiring proof: FAIL");
  console.error(error);
  process.exit(1);
});
