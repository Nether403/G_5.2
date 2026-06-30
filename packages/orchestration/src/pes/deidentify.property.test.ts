import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { deidentifyTurn, type CandidateClassifier } from "./deidentify";

// Property 4: Stored research content is always de-identified.
// Validates: Requirements 5.1, 5.3, 5.4, 5.6, 5.7, 10.2
//
// For any turn content written to the PES_Research_Store, the stored content
// equals the Deidentifier's output, contains no occurrence of the original
// (pre-scrub) free text in any field when scrubbing changed the text, and
// leaves non-PII text unchanged — including the case where the input contains
// no detectable PII (stored content equals input).
//
// The store only ever persists `deidentifyTurn(...).deIdentifiedText`, and only
// when `ok === true` (see researchTurn.ts). So testing the Deidentifier's
// output relationship is exactly testing "what gets stored". A deterministic
// stub classifier keeps the test offline (mirrors deidentify.test.ts): it flags
// any candidate containing Smith / Goldman / Clinic as a name, everything else
// not_pii. It never throws, so `ok` is always true here (fail-closed is
// Property 7, a separate task).
const stubClassifier: CandidateClassifier = async (candidates) => ({
  model: "stub",
  classifications: candidates.map((text) => ({
    text,
    type: /Smith|Goldman|Clinic/.test(text) ? "name" : "not_pii",
  })),
});

// Plain, lowercase, digit-free words — guaranteed to trip none of the regex
// patterns (no @, digits, URLs, dates) nor the title-case / mid-sentence-cap
// candidate heuristics. So they must survive scrubbing unchanged.
const plainWordArb = fc.constantFrom(
  "the", "weather", "is", "calm", "today", "we", "spoke", "about",
  "life", "and", "time", "quiet", "morning", "thoughts", "felt", "slow",
);

const plainTextArb = fc
  .array(plainWordArb, { minLength: 0, maxLength: 30 })
  .map((words) => words.join(" "));

// Regex-category PII seeds: each is deterministically redacted by pass 1, so
// the raw value must never survive in the output. `raw` is the exact substring
// we assert is gone after scrubbing.
const emailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z]{1,8}$/),
    fc.stringMatching(/^[a-z]{1,8}$/),
  )
  .map(([local, domain]) => `${local}@${domain}.com`);

const d = (n: number) => fc.stringMatching(new RegExp(`^[0-9]{${n}}$`));
const phoneArb = fc.tuple(d(3), d(3), d(4)).map(([a, b, c]) => `${a}-${b}-${c}`);
const ssnArb = fc.tuple(d(3), d(2), d(4)).map(([a, b, c]) => `${a}-${b}-${c}`);
const ipArb = fc
  .tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }))
  .map((parts) => parts.join("."));
const urlArb = fc
  .tuple(fc.stringMatching(/^[a-z]{1,8}$/), fc.stringMatching(/^[a-z]{1,8}$/))
  .map(([host, path]) => `https://${host}.com/${path}`);

// Name seeds reliably picked up by the title-case candidate heuristic and
// flagged by the stub. Two title-case words ⇒ matched by extractCandidates.
const nameArb = fc.constantFrom(
  "John Smith", "Jane Goldman", "Mary Smith", "Paul Goldman", "Mercy Clinic",
);

const piiSeedArb = fc.oneof(emailArb, phoneArb, ssnArb, ipArb, urlArb, nameArb);

// A segment is either a plain (non-PII) word or a PII seed we expect redacted.
type Segment = { text: string; pii: boolean };
const segmentArb: fc.Arbitrary<Segment> = fc.oneof(
  plainWordArb.map((text) => ({ text, pii: false })),
  piiSeedArb.map((text) => ({ text, pii: true })),
);

const REDACTION_MARKER = /^\[REDACTED_[A-Z_]+\]$/;

test("Property 4: no detectable PII ⇒ stored content equals input unchanged", async () => {
  await fc.assert(
    fc.asyncProperty(plainTextArb, async (input) => {
      const res = await deidentifyTurn(input, stubClassifier);
      assert.equal(res.ok, true);
      // non-PII text left unchanged; stored content === input (Req 5.7)
      assert.equal(res.deIdentifiedText, input);
      assert.equal(res.model, "regex-only");
      assert.equal(res.detections.length, 0);
    }),
    { numRuns: 200 },
  );
});

test("Property 4: stored content is de-identified — no raw PII survives, non-PII preserved", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(segmentArb, { minLength: 1, maxLength: 25 }),
      async (segments) => {
        const input = segments.map((s) => s.text).join(" ");
        const piiRaws = segments.filter((s) => s.pii).map((s) => s.text);
        const plainWords = segments.filter((s) => !s.pii).map((s) => s.text);

        const res = await deidentifyTurn(input, stubClassifier);

        // Stub never throws ⇒ scrub completes; the store persists deIdentifiedText.
        assert.equal(res.ok, true);
        const stored = res.deIdentifiedText;

        // No occurrence of any original PII value in the stored content (Req 5.3, 5.4).
        for (const raw of piiRaws) {
          assert.ok(
            !stored.includes(raw),
            `leaked raw PII "${raw}" into stored content: ${stored}`,
          );
        }

        // Non-PII text is left unchanged — each plain word still present (Req 5.6).
        for (const word of plainWords) {
          assert.ok(
            stored.includes(word),
            `non-PII word "${word}" was altered/removed: ${stored}`,
          );
        }

        // When scrubbing changed the text, it really changed (PII removed).
        if (piiRaws.length > 0) {
          assert.notEqual(stored, input);
        }

        // detections carry category + marker only, never original values (Req 5.4, 5.6).
        for (const det of res.detections) {
          assert.deepEqual(Object.keys(det).sort(), ["replacement", "type"]);
          assert.match(det.replacement, REDACTION_MARKER);
          for (const raw of piiRaws) {
            assert.notEqual(det.replacement, raw);
            assert.notEqual(det.type, raw);
          }
        }
      },
    ),
    { numRuns: 300 },
  );
});
