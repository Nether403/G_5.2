/**
 * Privacy_Notice content model and consent-text versioning (task 5.2).
 *
 * The `PrivacyNotice` *type* lives in `./types` (task 1.1). This module provides
 * the concrete, versioned content instance (`pes-consent-v1`) and a
 * machine-checkable legal-review gate.
 *
 * Two obligations are realised here:
 *  - Requirement 4.4 / 6.4: the notice SEPARATELY states each required item —
 *    Research_Purpose, data-controller identity (the Stichting), retention period
 *    (a specific duration), de-identification practice, and access/erasure rights.
 *    The structured shape (one field per item) makes "separately states each"
 *    machine-checkable (see Property 16 / task 5.3).
 *  - Requirement 4.10: the notice/consent text is marked as requiring qualified
 *    legal-counsel review before production enablement. `legalReviewRequired`
 *    is the machine-checkable flag; `assertConsentCollectionEnabled` is the
 *    assertion the production-enable path runs to refuse collection until the
 *    flag is cleared.
 */

import type { PrivacyNotice } from "./types";

// Re-export the type so callers can depend on this module alone for the notice.
export type { PrivacyNotice } from "./types";

/** Current consent-text / Privacy_Notice version stamped on every research record. */
export const PES_CONSENT_VERSION = "pes-consent-v1";

/**
 * Configured research-data retention period, in one place so the human-readable
 * duration stated in the Privacy_Notice (Requirement 4.4/6.4) and the
 * Retention_Manager's `retentionMs` (Requirement 6.2, task 8.1) cannot drift
 * apart. The Retention_Manager builds its `RetentionConfig` from `ms` here.
 */
export const PES_RESEARCH_RETENTION_DAYS = 730; // 24 months
export const PES_RESEARCH_RETENTION_MS =
  PES_RESEARCH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const RETENTION_PERIOD_LABEL = "24 months (730 days) from collection";

/**
 * The concrete `pes-consent-v1` Privacy_Notice.
 *
 * `legalReviewRequired` is `true`: this text is engineering placeholder copy and
 * MUST be reviewed by qualified legal counsel and the flag cleared before consent
 * collection is enabled in production (Requirement 4.10). The production-enable
 * path asserts this via {@link assertConsentCollectionEnabled}.
 */
export const PES_CONSENT_V1: PrivacyNotice = {
  version: PES_CONSENT_VERSION,
  researchPurpose:
    "To study how people reason about moral and reflective questions in dialogue " +
    "with G_5.0, so the Stichting can build a consented, de-identified research " +
    "corpus that supports AI-alignment evaluation. Your conversation is used only " +
    "for this single research purpose.",
  dataController:
    "Stichting Processo Ergo Sum (the Dutch non-profit operating ProcessoErgoSum.info), " +
    "acting as the data controller for P-E-S chat research data.",
  retentionPeriod: RETENTION_PERIOD_LABEL,
  deidentificationPractice:
    "Before any conversation content is stored for research, it is actively scrubbed " +
    "to remove personally identifying information (including names, contact details, " +
    "locations, institutions, identifiers, and specific dates), which are replaced with " +
    "category-labeled redaction markers. Raw, un-scrubbed text is never stored.",
  dataSubjectRights: {
    access:
      "You may request a copy of the de-identified research record stored for your " +
      "session at any time, using your session reference.",
    erasure:
      "You may request erasure of your research record, or withdraw consent, at any " +
      "time; on withdrawal, previously collected research records for your session are " +
      "deleted and no further content is stored.",
  },
  legalReviewRequired: true,
};

/**
 * The required items a valid Privacy_Notice must SEPARATELY state (Requirement
 * 4.4/6.4, Property 16): Research_Purpose, data-controller identity, retention
 * period, de-identification practice, and the access and erasure rights. Returned
 * as a list so callers (and the property test) can check each item independently.
 */
export function privacyNoticeItems(notice: PrivacyNotice): string[] {
  return [
    notice.researchPurpose,
    notice.dataController,
    notice.retentionPeriod,
    notice.deidentificationPractice,
    notice.dataSubjectRights.access,
    notice.dataSubjectRights.erasure,
  ];
}

/**
 * Completeness predicate for Property 16: a Privacy_Notice is complete iff it
 * separately states every required item — i.e. each item is a non-empty string
 * and the items are mutually distinct (no single statement doing double duty).
 * Pure; cleared/un-cleared legal review does not affect completeness.
 */
export function isPrivacyNoticeComplete(notice: PrivacyNotice): boolean {
  const items = privacyNoticeItems(notice);
  const allStated = items.every((v) => typeof v === "string" && v.trim().length > 0);
  const distinct = new Set(items.map((v) => v.trim())).size === items.length;
  return allStated && distinct;
}

/** Error thrown when consent collection is enabled before legal review clears. */
export class LegalReviewRequiredError extends Error {
  constructor(version: string) {
    super(
      `Privacy_Notice "${version}" still has legalReviewRequired=true; qualified ` +
        "legal-counsel review must clear this flag before P-E-S consent collection " +
        "is enabled in production (Requirement 4.10)."
    );
    this.name = "LegalReviewRequiredError";
  }
}

/**
 * Production-enable gate (Requirement 4.10): asserts the given notice has cleared
 * legal review. Throws {@link LegalReviewRequiredError} if `legalReviewRequired`
 * is still set. Call this on the path that enables consent collection — it fails
 * closed so unreviewed copy can never go live.
 */
export function assertConsentCollectionEnabled(notice: PrivacyNotice): void {
  if (notice.legalReviewRequired) {
    throw new LegalReviewRequiredError(notice.version);
  }
}
