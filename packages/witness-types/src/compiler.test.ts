import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compileCorpusEntry,
  corpusEntryTwpProjection,
  type CompileCorpusEntryInput,
} from "./compiler";
import {
  cloneSyntheticCorpusEntry,
  syntheticCorpusEntry,
} from "./fixtures/syntheticCorpusEntry";

/** Build a compile input for a REAL entry from the synthetic fixture's sections. */
function baseInput(): CompileCorpusEntryInput {
  const f = cloneSyntheticCorpusEntry();
  return {
    entryId: "twp_entry_real_0001",
    entryKind: "real",
    isSynthetic: false,
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

test("compileCorpusEntry produces a valid real entry that is not yet outreach-ready", () => {
  const entry = compileCorpusEntry(baseInput());
  assert.equal(entry.meta.entry_kind, "real");
  assert.equal(entry.meta.is_synthetic, false);
  // The compiler never asserts readiness — only the HCC gate may flip it.
  assert.equal(entry.meta.outreach_ready, false);
});

test("source_testimony_hash is carried through and the public-slice hash is computed", () => {
  const input = baseInput();
  const entry = compileCorpusEntry(input);
  assert.equal(
    entry.meta.hashes.source_testimony_hash,
    input.testimony.contentHash,
  );
  assert.notEqual(entry.meta.hashes.redacted_public_slice_hash, null);
  assert.match(
    entry.meta.hashes.redacted_public_slice_hash as string,
    /^sha256:/,
  );
});

test("compile throws when the testimony id does not match its reference", () => {
  const input = baseInput();
  input.testimony = { testimonyId: "wrong-id", contentHash: input.testimony.contentHash };
  assert.throws(() => compileCorpusEntry(input));
});

test("compile fails closed on a public-containment violation", () => {
  const broken = cloneSyntheticCorpusEntry();
  broken.consent_boundary.segments.push({
    segment_id: "leak",
    classification: "held_back",
    json_pointer: "/public_slice/situation_excerpt",
  });
  const input = baseInput();
  input.consentBoundary = broken.consent_boundary;
  assert.throws(() => compileCorpusEntry(input));
});

test("compile fails closed on a universal-verdict eval", () => {
  const input = baseInput();
  input.evalCase = {
    ...input.evalCase,
    witness_attributed_ideal_behavior: "The correct moral answer is obvious.",
  };
  assert.throws(() => compileCorpusEntry(input));
});

test("Property 5: the TWP projection carries no sensitive bodies", () => {
  const entry = compileCorpusEntry(baseInput());
  const projection = corpusEntryTwpProjection(entry);
  const serialized = JSON.stringify(projection);

  // Audit-only source hash never crosses.
  assert.equal(serialized.includes(entry.meta.hashes.source_testimony_hash), false);
  // Full testimony body, private notes, and governed bodies never cross.
  assert.equal(serialized.includes(syntheticCorpusEntry.human_readable.situation), false);
  assert.equal(serialized.includes("held_back_notes"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(projection, "reasoning_structure"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(projection, "provenance"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(projection, "private"), false);
  // The public slice and the public hash DO cross (that is the point).
  assert.equal(projection.public_slice.eval_case_public, "eval_synthetic_ventilator_0001");
  assert.notEqual(projection.redacted_public_slice_hash, null);
});
