import assert from "node:assert/strict";
import { test } from "node:test";

import { DisclosureLedgerRowSchema, parseCorpusEntry } from "./corpusEntry";
import {
  cloneSyntheticCorpusEntry,
  syntheticCorpusEntry,
} from "./fixtures/syntheticCorpusEntry";

/**
 * Task 2 — the canonical synthetic fixture (the design's ventilator-allocation
 * entry) plus the exhaustive validation suite. Negative cases clone the fixture
 * and break exactly one field so each failure is precise.
 */

// ── Positive ────────────────────────────────────────────────────────────────

test("the canonical synthetic ventilator fixture validates", () => {
  const parsed = parseCorpusEntry(syntheticCorpusEntry);
  assert.equal(parsed.schema_version, "0.1.0");
  assert.equal(parsed.meta.entry_id, "twp_entry_synthetic_0001");
  assert.equal(parsed.eval_case.is_public, true);
  // R14 / synthetic rule: synthetic exemplars are never outreach-ready.
  assert.equal(parsed.meta.is_synthetic, true);
  assert.equal(parsed.meta.entry_kind, "synthetic_exemplar");
  assert.equal(parsed.meta.outreach_ready, false);
  // Holdout benchmark cases live only in private, never on the public eval.
  assert.ok(Array.isArray(parsed.private?.holdout_eval_cases));
});

// ── Negative: missing required fields (fail-closed) ──────────────────────────

test("rejected when the mandatory eval_case is missing (R6.1)", () => {
  const broken = cloneSyntheticCorpusEntry() as unknown as Record<string, unknown>;
  delete broken.eval_case;
  assert.throws(() => parseCorpusEntry(broken));
});

test("rejected when framing_statement is missing (R7.1)", () => {
  const broken = cloneSyntheticCorpusEntry();
  delete (broken.meta as unknown as Record<string, unknown>).framing_statement;
  assert.throws(() => parseCorpusEntry(broken));
});

test("rejected when source_testimony_hash is missing (R8.1)", () => {
  const broken = cloneSyntheticCorpusEntry();
  delete (broken.meta.hashes as unknown as Record<string, unknown>)
    .source_testimony_hash;
  assert.throws(() => parseCorpusEntry(broken));
});

// ── Negative: synthetic validity rule (R14) ──────────────────────────────────

test("rejected when is_synthetic but entry_kind is not synthetic_exemplar (R14)", () => {
  const broken = cloneSyntheticCorpusEntry();
  broken.meta.entry_kind = "real";
  assert.throws(() => parseCorpusEntry(broken));
});

test("rejected when is_synthetic but outreach_ready is true (R14)", () => {
  const broken = cloneSyntheticCorpusEntry();
  broken.meta.outreach_ready = true;
  assert.throws(() => parseCorpusEntry(broken));
});

// ── Negative: eval / boundary / structural rules ─────────────────────────────

test("rejected when the mandatory eval_case is not public", () => {
  const broken = cloneSyntheticCorpusEntry();
  (broken.eval_case as unknown as Record<string, unknown>).is_public = false;
  assert.throws(() => parseCorpusEntry(broken));
});

test("rejected when a consent segment lacks a json_pointer", () => {
  const broken = cloneSyntheticCorpusEntry();
  const segment = broken.consent_boundary.segments[0] as unknown as Record<
    string,
    unknown
  >;
  delete segment.json_pointer;
  // Simulate the old `applies_to` shape; json_pointer is still required.
  segment.applies_to = "/human_readable/situation";
  assert.throws(() => parseCorpusEntry(broken));
});

test("rejected when reasoning_structure.claims is empty", () => {
  const broken = cloneSyntheticCorpusEntry();
  broken.reasoning_structure.claims = [];
  assert.throws(() => parseCorpusEntry(broken));
});

// ── Negative: referential integrity ──────────────────────────────────────────

test("rejected when public_slice.eval_case_public does not match eval_case.eval_id", () => {
  const broken = cloneSyntheticCorpusEntry();
  broken.public_slice.eval_case_public = "eval_mismatch_9999";
  assert.throws(() => parseCorpusEntry(broken));
});

test("rejected when datasheet_summary.eval_case_ref does not match eval_case.eval_id", () => {
  const broken = cloneSyntheticCorpusEntry();
  broken.datasheet_summary.eval_case_ref = "eval_mismatch_9999";
  assert.throws(() => parseCorpusEntry(broken));
});

test("rejected when a reasoning step references an unknown claim", () => {
  const broken = cloneSyntheticCorpusEntry();
  broken.reasoning_structure.reasoning_steps[0].claim_ref = "c_does_not_exist";
  assert.throws(() => parseCorpusEntry(broken));
});

test("rejected when an opposing pair references an unknown position", () => {
  const broken = cloneSyntheticCorpusEntry();
  broken.plurality.opposing_pairs[0].position_b = "p_does_not_exist";
  assert.throws(() => parseCorpusEntry(broken));
});

test("rejected when an opposing pair references an unknown tension", () => {
  const broken = cloneSyntheticCorpusEntry();
  broken.plurality.opposing_pairs[0].tension_ref = "t_does_not_exist";
  assert.throws(() => parseCorpusEntry(broken));
});

// ── DisclosureLedgerRow ──────────────────────────────────────────────────────

test("DisclosureLedgerRowSchema accepts a well-formed row", () => {
  const row = DisclosureLedgerRowSchema.parse({
    ledger_id: "ledger-0001",
    entry_id: "twp_entry_synthetic_0001",
    publication_bundle_id: "synthetic-bundle-0001",
    redacted_public_slice_hash: "sha256:SYNTH-pub-0001",
    publication_bundle_hash: null,
    recipient_or_channel: "partner-a",
    disclosed_at: "2026-06-24T10:00:00Z",
    consent_version_ref: "synthetic-consent-v0",
    terms_ref: null,
    revocation_status: "active",
    revoked_at: null,
  });
  assert.equal(row.revocation_status, "active");
});

test("DisclosureLedgerRowSchema rejects an invalid revocation_status", () => {
  assert.throws(() =>
    DisclosureLedgerRowSchema.parse({
      ledger_id: "ledger-0001",
      entry_id: "twp_entry_synthetic_0001",
      publication_bundle_id: "synthetic-bundle-0001",
      redacted_public_slice_hash: "sha256:SYNTH-pub-0001",
      publication_bundle_hash: null,
      recipient_or_channel: "partner-a",
      disclosed_at: "2026-06-24T10:00:00Z",
      consent_version_ref: "synthetic-consent-v0",
      terms_ref: null,
      revocation_status: "deleted",
      revoked_at: null,
    }),
  );
});
