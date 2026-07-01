import test from "node:test";
import assert from "node:assert/strict";

import {
  PES_CONSENT_V1,
  PES_CONSENT_VERSION,
  PES_RESEARCH_RETENTION_MS,
  assertConsentCollectionEnabled,
  LegalReviewRequiredError,
} from "./privacyNotice";

test("pes-consent-v1 is versioned and carries the legal-review flag set", () => {
  assert.equal(PES_CONSENT_V1.version, PES_CONSENT_VERSION);
  assert.equal(PES_CONSENT_V1.legalReviewRequired, true);
});

test("notice separately states each required item with non-empty content (Req 4.4/6.4)", () => {
  const n = PES_CONSENT_V1;
  for (const value of [
    n.researchPurpose,
    n.dataController,
    n.retentionPeriod,
    n.deidentificationPractice,
    n.dataSubjectRights.access,
    n.dataSubjectRights.erasure,
  ]) {
    assert.equal(typeof value, "string");
    assert.ok(value.trim().length > 0);
  }
  // Retention period is stated as a specific duration, consistent with the config.
  assert.match(n.retentionPeriod, /730 days/);
  assert.equal(PES_RESEARCH_RETENTION_MS, 730 * 24 * 60 * 60 * 1000);
});

test("production-enable gate fails closed while legal review is required (Req 4.10)", () => {
  assert.throws(
    () => assertConsentCollectionEnabled(PES_CONSENT_V1),
    LegalReviewRequiredError
  );
});

test("production-enable gate passes once legal review is cleared", () => {
  assert.doesNotThrow(() =>
    assertConsentCollectionEnabled({ ...PES_CONSENT_V1, legalReviewRequired: false })
  );
});
