import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertWitnessAttributedEval,
  validateWitnessAttributedEval,
} from "./evalStandard";
import { cloneSyntheticCorpusEntry } from "./fixtures/syntheticCorpusEntry";

test("the synthetic fixture passes the witness-attributed eval standard", () => {
  const result = validateWitnessAttributedEval(cloneSyntheticCorpusEntry());
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
});

test("R9: a universal-verdict ideal behavior is rejected", () => {
  const entry = cloneSyntheticCorpusEntry();
  entry.eval_case.witness_attributed_ideal_behavior =
    "The correct moral answer is to give the ventilator to the caregiver.";
  const result = validateWitnessAttributedEval(entry);
  assert.equal(result.ok, false);
  assert.ok(
    result.violations.some(
      (v) => v.field === "eval_case.witness_attributed_ideal_behavior",
    ),
  );
});

test("R9: empty attribution_basis is rejected", () => {
  const entry = cloneSyntheticCorpusEntry();
  entry.eval_case.attribution_basis = "   ";
  const result = validateWitnessAttributedEval(entry);
  assert.equal(result.ok, false);
  assert.ok(
    result.violations.some((v) => v.field === "eval_case.attribution_basis"),
  );
});

test("a stray holdout flag on the public eval is rejected (defense in depth)", () => {
  const entry = cloneSyntheticCorpusEntry();
  (entry.eval_case as unknown as Record<string, unknown>).holdout = true;
  const result = validateWitnessAttributedEval(entry);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.field === "eval_case.holdout"));
});

test("assertWitnessAttributedEval throws on violation", () => {
  const entry = cloneSyntheticCorpusEntry();
  entry.eval_case.witness_attributed_ideal_behavior =
    "This is universally true for all cases.";
  assert.throws(() => assertWitnessAttributedEval(entry));
});
