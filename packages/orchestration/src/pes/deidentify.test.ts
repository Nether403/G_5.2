import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import {
  deidentifyTurn,
  regexStrip,
  extractCandidates,
  type CandidateClassifier,
} from "./deidentify";

// A deterministic stub classifier: flags anything containing "Smith" or
// "Clinic" as PII so we can exercise the classification pass without network.
const stubClassifier: CandidateClassifier = async (candidates) => ({
  model: "stub",
  classifications: candidates.map((text) => ({
    text,
    type: /Smith|Clinic|Goldman/.test(text) ? "name" : "not_pii",
  })),
});

test("regexStrip redacts each required category, no original values leak", () => {
  const input =
    "mail me@x.com call 555-123-4567 see https://x.com/a ssn 123-45-6789 " +
    "ip 10.0.0.1 on March 3, 2020 or 03/04/2021";
  const { text, detections } = regexStrip(input);
  for (const raw of ["me@x.com", "555-123-4567", "https://x.com/a", "123-45-6789", "10.0.0.1", "March 3, 2020", "03/04/2021"]) {
    assert.ok(!text.includes(raw), `leaked: ${raw}`);
  }
  const types = new Set(detections.map((d) => d.type));
  for (const t of ["email", "phone", "url", "ssn", "ip_address", "date_specific", "date_numeric"]) {
    assert.ok(types.has(t), `missing detection type: ${t}`);
  }
  // detections must never carry original values (only type + replacement)
  for (const d of detections) {
    assert.deepEqual(Object.keys(d).sort(), ["replacement", "type"]);
  }
});

test("no detectable PII ⇒ ok and content unchanged (regex-only complete scrub)", async () => {
  const input = "the weather is calm today";
  const res = await deidentifyTurn(input, stubClassifier);
  assert.equal(res.ok, true);
  assert.equal(res.deIdentifiedText, input);
  assert.equal(res.model, "regex-only");
});

test("classification pass redacts a name candidate", async () => {
  const res = await deidentifyTurn("I met John Smith yesterday.", stubClassifier);
  assert.equal(res.ok, true);
  assert.ok(!res.deIdentifiedText.includes("John Smith"));
  assert.ok(res.deIdentifiedText.includes("[REDACTED_NAME]"));
});

test("fail closed: classifier error ⇒ ok:false and no content", async () => {
  const boom: CandidateClassifier = async () => {
    throw new Error("detector down");
  };
  const res = await deidentifyTurn("I met John Smith yesterday.", boom);
  assert.equal(res.ok, false);
  assert.equal(res.deIdentifiedText, "");
  assert.equal(res.detections.length, 0);
});

test("idempotent: deidentify(deidentify(x)) == deidentify(x)", async () => {
  const input = "Email me@x.com about John Smith at Mayo Clinic on 03/04/2021.";
  const once = await deidentifyTurn(input, stubClassifier);
  assert.equal(once.ok, true);
  // markers must not be re-extracted as candidates
  assert.equal(extractCandidates(once.deIdentifiedText).filter((c) => c.includes("REDACTED")).length, 0);
  const twice = await deidentifyTurn(once.deIdentifiedText, stubClassifier);
  assert.equal(twice.ok, true);
  assert.equal(twice.deIdentifiedText, once.deIdentifiedText);
});

// Property 6: De-identification is idempotent.
// deidentify(deidentify(x)) == deidentify(x) for arbitrary input text.
// Validates: Requirements 5.6
test("Property 6: deidentify is idempotent over arbitrary text", async () => {
  await fc.assert(
    fc.asyncProperty(fc.string(), async (input) => {
      const once = await deidentifyTurn(input, stubClassifier);
      // The offline stub never errors, so a complete scrub always succeeds.
      assert.equal(once.ok, true);
      // Redaction markers are all-caps and must never be re-extracted as candidates,
      // which is what makes a second pass a fixpoint.
      assert.equal(
        extractCandidates(once.deIdentifiedText).filter((c) => c.includes("REDACTED")).length,
        0,
      );
      const twice = await deidentifyTurn(once.deIdentifiedText, stubClassifier);
      assert.equal(twice.ok, true);
      assert.equal(twice.deIdentifiedText, once.deIdentifiedText);
    }),
    { numRuns: 300 },
  );
});
