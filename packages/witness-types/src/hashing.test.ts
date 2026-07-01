import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertSourceHashAbsentFromPublic,
  assertSourceTestimonyHashMatches,
  canonicalize,
  computeRedactedPublicSliceHash,
  sha256,
} from "./hashing";
import { computePublicView } from "./partition";
import { cloneSyntheticCorpusEntry } from "./fixtures/syntheticCorpusEntry";

test("canonicalize is key-order independent", () => {
  assert.equal(canonicalize({ a: 1, b: 2 }), canonicalize({ b: 2, a: 1 }));
});

test("sha256 is deterministic and prefixed", () => {
  const a = sha256({ x: 1 });
  const b = sha256({ x: 1 });
  assert.equal(a, b);
  assert.ok(a.startsWith("sha256:"));
});

test("redacted_public_slice_hash changes when the public slice changes", () => {
  const entry = cloneSyntheticCorpusEntry();
  const before = computeRedactedPublicSliceHash(entry);
  entry.public_slice.situation_excerpt += " (edited)";
  const after = computeRedactedPublicSliceHash(entry);
  assert.notEqual(before, after);
});

test("Property 2: source hash match passes, mismatch throws", () => {
  const entry = cloneSyntheticCorpusEntry();
  const recorded = entry.meta.hashes.source_testimony_hash;
  assert.doesNotThrow(() => assertSourceTestimonyHashMatches(entry, recorded));
  assert.throws(() =>
    assertSourceTestimonyHashMatches(entry, "sha256:DIFFERENT"),
  );
});

test("public-exposure rule: a clean public view passes", () => {
  const entry = cloneSyntheticCorpusEntry();
  const view = computePublicView(entry);
  assert.doesNotThrow(() => assertSourceHashAbsentFromPublic(view, entry));
});

test("public-exposure rule: a public artifact containing the source hash throws", () => {
  const entry = cloneSyntheticCorpusEntry();
  const leakyArtifact = {
    ...computePublicView(entry),
    accidental_field: entry.meta.hashes.source_testimony_hash,
  };
  assert.throws(() => assertSourceHashAbsentFromPublic(leakyArtifact, entry));
});
