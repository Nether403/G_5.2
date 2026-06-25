import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classificationForPointer,
  computePublicView,
  resolveJsonPointer,
  validatePublicContainment,
} from "./partition";
import { cloneSyntheticCorpusEntry } from "./fixtures/syntheticCorpusEntry";

test("resolveJsonPointer resolves nested object and array tokens", () => {
  const entry = cloneSyntheticCorpusEntry();
  assert.equal(
    resolveJsonPointer(entry, "/human_readable/situation").found,
    true,
  );
  assert.equal(
    resolveJsonPointer(entry, "/reasoning_structure/claims/0/claim_id").value,
    "c1",
  );
  assert.equal(resolveJsonPointer(entry, "/does/not/exist").found, false);
});

test("the synthetic fixture passes public containment", () => {
  const result = validatePublicContainment(cloneSyntheticCorpusEntry());
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
});

test("Property 1: a non-public segment targeting a public region is a violation", () => {
  const entry = cloneSyntheticCorpusEntry();
  entry.consent_boundary.segments.push({
    segment_id: "leak",
    classification: "held_back",
    json_pointer: "/public_slice/situation_excerpt",
  });
  const result = validatePublicContainment(entry);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.segment_id === "leak"));
});

test("a public classification targeting the private subtree is a violation", () => {
  const entry = cloneSyntheticCorpusEntry();
  entry.consent_boundary.segments.push({
    segment_id: "private-as-public",
    classification: "public",
    json_pointer: "/private/held_back_notes",
  });
  const result = validatePublicContainment(entry);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.segment_id === "private-as-public"));
});

test("a dangling json_pointer is a violation", () => {
  const entry = cloneSyntheticCorpusEntry();
  entry.consent_boundary.segments.push({
    segment_id: "dangling",
    classification: "public",
    json_pointer: "/human_readable/nonexistent_field",
  });
  const result = validatePublicContainment(entry);
  assert.equal(result.ok, false);
  assert.ok(
    result.violations.some(
      (v) => v.segment_id === "dangling" && /does not resolve/.test(v.reason),
    ),
  );
});

test("computePublicView excludes the private subtree by construction", () => {
  const view = computePublicView(cloneSyntheticCorpusEntry());
  const serialized = JSON.stringify(view);
  assert.equal(Object.prototype.hasOwnProperty.call(view, "private"), false);
  assert.equal(serialized.includes("held_back_notes"), false);
  assert.equal(serialized.includes("compiler_artifacts"), false);
  assert.equal(serialized.includes("holdout_eval_cases"), false);
});

test("computePublicView includes the public witness label it is hashed to cover", () => {
  const entry = cloneSyntheticCorpusEntry();
  const view = computePublicView(entry);
  assert.equal(
    view.public_witness_label,
    entry.references.twp_control_plane.public_witness_label,
  );
  // The internal vault reference must never be in the hashed public view.
  assert.equal(
    JSON.stringify(view).includes(
      entry.references.twp_control_plane.witness_profile_ref,
    ),
    false,
  );
});

test("classificationForPointer is default-deny for unclassified pointers", () => {
  const entry = cloneSyntheticCorpusEntry();
  assert.equal(
    classificationForPointer(entry, "/human_readable/situation"),
    "public",
  );
  // Unlisted pointer falls back to the entry's default classification.
  assert.equal(
    classificationForPointer(entry, "/some/unlisted/pointer"),
    entry.consent_boundary.default_classification,
  );
});
