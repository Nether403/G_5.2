// Property 5: De-identification covers the required PII categories.
//
// For any text seeded with a value from the categories handled by TWP `pii.ts`
// (email, phone, URL, government identifier, IP address, specific and numeric
// dates, and classified names, institutions, locations), the Deidentifier's
// output contains none of the seeded original values and replaces each with its
// category-labeled redaction marker.
//
// Validates: Requirements 5.2, 5.6
//
// The LLM-classified categories (names/institutions/locations) are driven by a
// deterministic stub `CandidateClassifier` so the test runs offline: it tags the
// seeded value by an injected original->category lookup.

import { test } from "node:test";
import fc from "fast-check";
import {
  deidentifyTurn,
  type CandidateClassifier,
} from "./deidentify";

type Seed = {
  value: string;
  marker: string;
  // present only for the LLM-classified categories
  category?: "name" | "institution" | "location";
};

// ─── Generators for each regex-handled category ────────────

const emailGen: fc.Arbitrary<Seed> = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/),
    fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/),
    fc.constantFrom("com", "org", "net", "io"),
  )
  .map(([user, host, tld]) => ({
    value: `${user}@${host}.${tld}`,
    marker: "[REDACTED_EMAIL]",
  }));

const phoneGen: fc.Arbitrary<Seed> = fc
  .tuple(
    fc.integer({ min: 200, max: 999 }),
    fc.integer({ min: 200, max: 999 }),
    fc.integer({ min: 1000, max: 9999 }),
  )
  .map(([a, b, c]) => ({ value: `${a}-${b}-${c}`, marker: "[REDACTED_PHONE]" }));

const urlGen: fc.Arbitrary<Seed> = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/),
    fc.constantFrom("com", "org", "net"),
    fc.stringMatching(/^[a-z0-9]{1,8}$/),
  )
  .map(([host, tld, path]) => ({
    value: `https://${host}.${tld}/${path}`,
    marker: "[REDACTED_URL]",
  }));

const ssnGen: fc.Arbitrary<Seed> = fc
  .tuple(
    fc.integer({ min: 100, max: 999 }),
    fc.integer({ min: 10, max: 99 }),
    fc.integer({ min: 1000, max: 9999 }),
  )
  .map(([a, b, c]) => ({ value: `${a}-${b}-${c}`, marker: "[REDACTED_SSN]" }));

const ipGen: fc.Arbitrary<Seed> = fc
  .tuple(
    fc.integer({ min: 1, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 1, max: 255 }),
  )
  .map(([a, b, c, d]) => ({ value: `${a}.${b}.${c}.${d}`, marker: "[REDACTED_IP]" }));

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const dateSpecificGen: fc.Arbitrary<Seed> = fc
  .tuple(
    fc.constantFrom(...MONTHS),
    fc.integer({ min: 1, max: 28 }),
    fc.integer({ min: 1900, max: 2099 }),
  )
  .map(([m, d, y]) => ({ value: `${m} ${d}, ${y}`, marker: "[REDACTED_DATE]" }));

const dateNumericGen: fc.Arbitrary<Seed> = fc
  .tuple(
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
    fc.integer({ min: 1900, max: 2099 }),
  )
  .map(([m, d, y]) => ({ value: `${m}/${d}/${y}`, marker: "[REDACTED_DATE]" }));

// ─── Generators for the LLM-classified categories ──────────
// Distinctive title-case two-word tokens the candidate extractor isolates and
// that are not in the common-phrase allowlist.

const nameGen: fc.Arbitrary<Seed> = fc
  .tuple(
    fc.constantFrom("Aldous", "Bartholomew", "Cornelius", "Ferdinand", "Reginald"),
    fc.constantFrom("Wexford", "Pennington", "Harrington", "Fairbanks", "Lockwood"),
  )
  .map(([first, last]) => ({
    value: `${first} ${last}`,
    marker: "[REDACTED_NAME]",
    category: "name" as const,
  }));

const institutionGen: fc.Arbitrary<Seed> = fc
  .tuple(
    fc.constantFrom("Meridian", "Crestwood", "Ashbury", "Halcyon", "Brightmoor"),
    fc.constantFrom("Institute", "Clinic", "Foundation", "Laboratories", "College"),
  )
  .map(([a, b]) => ({
    value: `${a} ${b}`,
    marker: "[REDACTED_INSTITUTION]",
    category: "institution" as const,
  }));

const locationGen: fc.Arbitrary<Seed> = fc
  .tuple(
    fc.constantFrom("Willowbrook", "Thornfield", "Ravenscroft", "Elmsworth", "Hollowmere"),
    fc.constantFrom("Avenue", "Lane", "Crossing", "Hollow", "Heights"),
  )
  .map(([a, b]) => ({
    value: `${a} ${b}`,
    marker: "[REDACTED_LOCATION]",
    category: "location" as const,
  }));

const seedGen: fc.Arbitrary<Seed> = fc.oneof(
  emailGen,
  phoneGen,
  urlGen,
  ssnGen,
  ipGen,
  dateSpecificGen,
  dateNumericGen,
  nameGen,
  institutionGen,
  locationGen,
);

// Deterministic, offline classifier. The candidate extractor tokenizes a
// multi-word value (e.g. "Willowbrook Avenue") into separate candidates
// ("Willowbrook", "Avenue"), so — like a real classifier — the stub tags each
// candidate that is a token of the seeded classified value with its category.
// Everything else is not_pii.
function makeStubClassifier(seed: Seed): CandidateClassifier {
  const tokens = seed.category ? new Set(seed.value.split(/\s+/)) : new Set<string>();
  return async (candidates) => ({
    model: "stub",
    classifications: candidates.map((text) => ({
      text,
      type: seed.category && tokens.has(text) ? seed.category : "not_pii",
    })),
  });
}

// Embed the seed in lowercase surrounding text so the connective words never
// introduce spurious title-case candidates.
function buildTurn(seed: Seed): string {
  return `i wanted to share the detail ${seed.value} with you earlier today`;
}

test("Property 5: every required PII category is redacted with its labeled marker", async () => {
  await fc.assert(
    fc.asyncProperty(seedGen, async (seed) => {
      const res = await deidentifyTurn(buildTurn(seed), makeStubClassifier(seed));

      // Scrubbing must complete.
      if (!res.ok) return false;
      // The seeded original value must not survive anywhere in the output.
      if (res.deIdentifiedText.includes(seed.value)) return false;
      // It must be replaced with that category's labeled redaction marker.
      if (!res.deIdentifiedText.includes(seed.marker)) return false;
      return true;
    }),
    { numRuns: 500 },
  );
});
