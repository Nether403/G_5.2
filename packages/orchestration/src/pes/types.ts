// P-E-S research/consent types and dataset identifiers.
//
// P-E-S chat research data is its own dataset, with its own consent and its own
// purpose. It is explicitly NOT Witness Protocol testimony and must never be
// blended into the Witness corpus (see requirements R7/R8 and the project
// invariant "same engine, different identity; never duplicate sensitive bodies").
//
// The record schema is intentionally minimal: only fields necessary for the
// Research_Purpose are present (data minimisation, Requirement 4.2/4.3).

/** Dataset identifier stamped on every P-E-S research record (Requirement 8.4). */
export const PES_RESEARCH_DATASET_ID = "pes-research";

/** The forbidden target identity: research data must never carry/target this (Requirement 8.5). */
export const WITNESS_DATASET_ID = "witness";

/**
 * A persisted, consented, de-identified P-E-S conversation turn.
 *
 * Invariants:
 * - `content` holds the de-identified form only; raw pre-scrub text appears in no
 *   field (Requirements 5.3, 5.4).
 * - `datasetId` is non-empty and never equal to {@link WITNESS_DATASET_ID} (Requirement 8.4).
 * - `id` is a research-record id, NOT a `PES_Session_Store` session id (Requirement 7.1).
 * - `consentDecisionRef` resolves to an existing {@link PesConsentRecord} (Requirement 7.2).
 * - `collectedAt` is an ISO 8601 UTC timestamp (Requirements 6.1, 7.2).
 */
export interface PesResearchRecord {
  /** Research-record id (not a session id). */
  id: string;
  /** Non-empty dataset id; must not equal {@link WITNESS_DATASET_ID}. */
  datasetId: string;
  /** Links to the operational session for DSAR; deleted on purge/withdrawal. */
  sessionRef: string;
  /** Reference to the recorded Consent_Decision under which this was collected. */
  consentDecisionRef: string;
  /** Version of the consent text the visitor saw when consenting. */
  consentVersion: string;
  /** Collection timestamp in ISO 8601 UTC. */
  collectedAt: string;
  /** De-identified turn content ONLY. */
  content: string;
}

/** Lifecycle states of a P-E-S consent decision. */
export type PesConsentStatus = "granted" | "declined" | "withdrawn";

/**
 * A persisted P-E-S consent decision. Keyed by its own id (= the `consentRef`
 * returned to the client) and references a session; carries no account identifier.
 */
export interface PesConsentRecord {
  /** = consentRef returned to the client. */
  id: string;
  /** Operational session this decision governs. */
  sessionRef: string;
  status: PesConsentStatus;
  /** Version of the consent text the visitor saw. */
  consentVersion: string;
  /** Decision timestamp in ISO 8601 UTC. */
  decidedAt: string;
  /** Set when `status === "withdrawn"`; ISO 8601 UTC. */
  withdrawnAt?: string;
}

/**
 * Structured Privacy_Notice so the "separately states each" obligation is
 * machine-checkable (Requirement 4.4). `legalReviewRequired` gates production
 * enablement: the production-enable path asserts it is cleared (Requirement 4.10).
 */
export interface PrivacyNotice {
  version: string;
  researchPurpose: string;
  /** Data controller identity (the Stichting). */
  dataController: string;
  /** Retention period as a specific duration; matches Retention_Manager config. */
  retentionPeriod: string;
  deidentificationPractice: string;
  dataSubjectRights: { access: string; erasure: string };
  legalReviewRequired: boolean;
}

/**
 * Store targets the Boundary_Guard classifies writes against (Requirement 8.2).
 * Only `pes_research` is a valid target for a {@link PesResearchRecord}; the
 * Witness targets are rejected by payload-type × target matching.
 */
export type StoreTarget = "pes_research" | "witness_store" | "witness_corpus" | "testimony";
