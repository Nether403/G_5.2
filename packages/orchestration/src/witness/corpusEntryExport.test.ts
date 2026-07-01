import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import type { CorpusEntry } from "../../../witness-types/src/corpusEntry";
import { exportCorpusEntryBundle } from "./corpusEntryExport";

const SOURCE_HASH = "sha256:SECRET-source-hash-0001";
const VAULT_REF = "INTERNAL-VAULT-REF-DO-NOT-LEAK";

/** A complete, type-valid entry literal (no zod load at runtime in orchestration). */
function makeEntry(): CorpusEntry {
  return {
    schema_version: "0.1.0",
    meta: {
      entry_id: "twp_entry_export_0001",
      entry_kind: "real",
      created_at: "2026-06-24T10:00:00Z",
      is_synthetic: false,
      synthetic_notice: null,
      outreach_ready: false,
      framing_statement: "An evaluation substrate and reasoning artifact.",
      consent_version_ref: "consent-v1",
      hashes: {
        source_testimony_hash: SOURCE_HASH,
        redacted_public_slice_hash: "sha256:PUB-slice-0001",
        publication_bundle_hash: null,
      },
    },
    consent_boundary: {
      consent_record_ref: "consent-record-0001",
      default_classification: "held_back",
      segments: [
        { segment_id: "situation", classification: "public", json_pointer: "/human_readable/situation" },
      ],
    },
    provenance: {
      source_type: "practitioner",
      processing_steps: [{ step: "deidentification", actor: "op", at: "2026-06-24T10:00:00Z" }],
      ai_participants: [
        { role: "inquisitor", provider: "azure", model: "gpt-5.4", prompt_revision: "inq-1", canon_version: "witness-1" },
      ],
      human_reviewers: [{ reviewer_id: "hcc-a", role: "hcc", decision: "accept" }],
      gate_assessment_ref: "gate-0001",
      rfc3161_token: null,
      ipfs_cid: null,
    },
    human_readable: {
      situation: "FULL CONFIDENTIAL TESTIMONY BODY that must never appear in the public bundle.",
      glossary: [{ term: "capability floor", plain_definition: "A minimum baseline claim." }],
    },
    reasoning_structure: {
      claims: [{ claim_id: "c1", text: "A claim." }],
      reasoning_steps: [{ step_index: 1, text: "A step.", grounding: "Why.", claim_ref: "c1" }],
      counterfactuals: [{ text: "A counterfactual.", changes_judgment: true }],
      tensions: [{ tension_id: "t1", summary: "A tension.", tension_type: "incommensurable", do_not_flatten: true }],
      cap_rel_felt: { cap: ["rights_floor"], rel: ["duty_of_care"], felt: ["moral_distress"] },
      failure_modes: ["utilitarian_flattening"],
    },
    plurality: {
      positions: [
        { position_id: "p1", axiom_cluster: "capabilities_floor", stance: "S.", what_it_sees_clearly: "X.", what_it_risks_missing: "Y." },
      ],
      opposing_pairs: [],
      minority_report: null,
    },
    eval_case: {
      eval_id: "eval_export_0001",
      is_public: true,
      prompt: "A hard moral situation.",
      witness_attributed_ideal_behavior: "Preserves the tension THIS witness articulated.",
      attribution_basis: "Grounded in c1 and t1.",
      failure_modes_detected: ["premature_resolution"],
      rubric_dimensions: ["tension_preservation"],
      provenance_attribution: "Derived from entry twp_entry_export_0001.",
    },
    references: {
      twp_control_plane: {
        gate_assessment_id: "gate-0001",
        consent_record_id: "consent-record-0001",
        witness_profile_ref: VAULT_REF,
        public_witness_label: "Practitioner A",
      },
      g52_governed: {
        session_id: "session-0001",
        testimony_id: "testimony-0001",
        synthesis_ids: ["syn-01"],
        annotation_batch_ids: ["ann-01"],
        publication_bundle_id: "bundle-0001",
        disclosure_manifest_hash: null,
      },
    },
    public_slice: {
      situation_excerpt: "A redacted, public-safe excerpt of the situation.",
      claims_public: ["A public claim."],
      tensions_public: ["A public tension."],
      eval_case_public: "eval_export_0001",
      framing_statement: "An evaluation substrate and reasoning artifact.",
    },
    datasheet_summary: {
      title: "Export test entry",
      one_line_situation: "A one-line situation.",
      primary_axiom_clusters: ["capabilities_floor"],
      headline_tension: "A headline tension.",
      eval_case_ref: "eval_export_0001",
      consent_scope_public: true,
    },
    private: {
      compiler_artifacts: { dpo_pairs: null, prm_traces: null, rbr_rules: null },
      holdout_eval_cases: [],
      held_back_notes: "CONFIDENTIAL held-back note that must never be exported.",
    },
  };
}

test("exportCorpusEntryBundle emits a public bundle that leaks no sensitive data", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-corpus-entry-export-"));
  try {
    const result = await exportCorpusEntryBundle({
      publicationBundleRoot: root,
      entry: makeEntry(),
    });

    const jsonRaw = await readFile(result.bundleJsonPath, "utf8");
    const manifestRaw = await readFile(result.bundleManifestPath, "utf8");
    const bundle = JSON.parse(jsonRaw);
    const manifest = JSON.parse(manifestRaw);

    // The public slice IS present.
    assert.equal(bundle.publicSlice.eval_case_public, "eval_export_0001");
    assert.equal(bundle.publicWitnessLabel, "Practitioner A");

    // Sensitive material is NOT present anywhere in the public bundle.
    assert.equal(jsonRaw.includes(SOURCE_HASH), false);
    assert.equal(jsonRaw.includes(VAULT_REF), false);
    assert.equal(jsonRaw.includes("held_back_notes"), false);
    assert.equal(jsonRaw.includes("FULL CONFIDENTIAL TESTIMONY BODY"), false);

    // Manifest carries the public hashes + disclosure manifest hash, no source hash.
    assert.match(manifest.publicationBundleHash, /^sha256:/);
    assert.equal(manifest.disclosureManifestHash, null);
    assert.equal(manifestRaw.includes(SOURCE_HASH), false);

    // publication_bundle_hash is written back onto the entry and matches the body.
    assert.equal(result.entry.meta.hashes.publication_bundle_hash, result.publicationBundleHash);
    const recomputed = `sha256:${createHash("sha256").update(jsonRaw).digest("hex")}`;
    assert.equal(recomputed, result.publicationBundleHash);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("exportCorpusEntryBundle throws when the public-slice hash is missing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-corpus-entry-export-nohash-"));
  try {
    const entry = makeEntry();
    entry.meta.hashes.redacted_public_slice_hash = null;
    await assert.rejects(() =>
      exportCorpusEntryBundle({ publicationBundleRoot: root, entry }),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
