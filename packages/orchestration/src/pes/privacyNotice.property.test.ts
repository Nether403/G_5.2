// Property 16: Privacy notice states every required item.
// Validates: Requirements 4.4, 6.4
//
// For any valid Privacy_Notice, it SEPARATELY states each of: the Research_Purpose,
// the data-controller identity (the Stichting), the retention period as a specific
// duration, the de-identification practice, and the data-subject rights of access
// and erasure. We model "separately states each" as a completeness predicate
// (`isPrivacyNoticeComplete`): every required item is a non-empty string and the
// items are mutually distinct, so no single statement does double duty.
//
// The property checks two directions:
//  (a) the canonical PES_CONSENT_V1 notice is complete; and
//  (b) generated valid notices (each required item a distinct non-empty string)
//      are accepted, while blanking OR collapsing any one required item makes the
//      notice rejected — proving the predicate actually requires each item.

import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import {
  PES_CONSENT_V1,
  isPrivacyNoticeComplete,
  privacyNoticeItems,
} from "./privacyNotice";
import type { PrivacyNotice } from "./types";

// The six required-item slots, by index into privacyNoticeItems(...).
const REQUIRED_ITEM_COUNT = 6;

/** Build a PrivacyNotice from six distinct item strings. */
function noticeFrom(items: string[], legalReviewRequired = true): PrivacyNotice {
  const [
    researchPurpose,
    dataController,
    retentionPeriod,
    deidentificationPractice,
    access,
    erasure,
  ] = items;
  return {
    version: "test-notice",
    researchPurpose,
    dataController,
    retentionPeriod,
    deidentificationPractice,
    dataSubjectRights: { access, erasure },
    legalReviewRequired,
  };
}

/** Arbitrary list of six mutually-distinct non-empty item strings. */
const distinctItemsArb: fc.Arbitrary<string[]> = fc
  .uniqueArray(fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0), {
    minLength: REQUIRED_ITEM_COUNT,
    maxLength: REQUIRED_ITEM_COUNT,
    comparator: (a, b) => a.trim() === b.trim(),
  });

test("Property 16(a): the canonical PES_CONSENT_V1 notice states every required item", () => {
  const items = privacyNoticeItems(PES_CONSENT_V1);
  assert.equal(items.length, REQUIRED_ITEM_COUNT);
  for (const value of items) {
    assert.equal(typeof value, "string");
    assert.ok(value.trim().length > 0, "every required item is non-empty");
  }
  // Each item is separately stated (mutually distinct).
  assert.equal(new Set(items.map((v) => v.trim())).size, REQUIRED_ITEM_COUNT);
  assert.equal(isPrivacyNoticeComplete(PES_CONSENT_V1), true);
});

test("Property 16(b): valid notices are accepted; missing/blanked/collapsed items are rejected", () => {
  fc.assert(
    fc.property(
      distinctItemsArb,
      fc.integer({ min: 0, max: REQUIRED_ITEM_COUNT - 1 }),
      fc.constantFrom<"blank" | "whitespace" | "collapse">("blank", "whitespace", "collapse"),
      (items, idx, mode) => {
        // A notice built from six distinct, non-empty items is complete.
        const complete = noticeFrom(items);
        assert.equal(isPrivacyNoticeComplete(complete), true);

        // Break exactly one required item and the notice must be rejected.
        const broken = [...items];
        if (mode === "blank") {
          broken[idx] = "";
        } else if (mode === "whitespace") {
          broken[idx] = "   ";
        } else {
          // Collapse: reuse another item's text, so the item is no longer
          // SEPARATELY stated (distinctness violated).
          broken[idx] = items[(idx + 1) % REQUIRED_ITEM_COUNT];
        }
        assert.equal(isPrivacyNoticeComplete(noticeFrom(broken)), false);
      }
    ),
    { numRuns: 300 }
  );
});

test("Property 16: completeness is independent of the legal-review flag", () => {
  assert.equal(
    isPrivacyNoticeComplete({ ...PES_CONSENT_V1, legalReviewRequired: false }),
    true
  );
});
