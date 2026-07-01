/**
 * researchTurn — the gated P-E-S research write orchestrator (task 7.1).
 *
 * This is the P-E-S analogue of `persistWitnessTurnArtifacts`: it orchestrates the
 * consent-gated research write as `de-identify → Boundary_Guard → store`. It is the
 * single place that decides whether a turn's content reaches the PES_Research_Store.
 *
 * Hard rules realised here (Requirements 3.5, 5.1, 5.5, 7.6):
 *  - Only a resolved `granted` Consent_Decision permits a write. `declined`,
 *    `withdrawn`, not-yet-recorded, and record-failed (consentRef absent / record
 *    missing) all resolve to "store nothing" — failure falls to the safe side.
 *  - The Deidentifier runs before any byte is written and FAILS CLOSED: when scrub
 *    does not complete, a failure entry (no content, no partial) is written and the
 *    turn's content is never persisted (Requirement 5.5).
 *  - When `granted`, the write IS attempted; a subsequent store/guard failure is
 *    reported but does not prohibit the attempt (Requirement 7.6). The Boundary_Guard
 *    runs inside `FilePesResearchStore.write` (payload-type × target), so this
 *    orchestrator routes through it rather than re-implementing it.
 *
 * Parity guarantee (Requirement 3): this is pure orchestration of a POST-RESPONSE
 * side-effect. It returns a structured result and NEVER throws — so an invoking turn
 * handler can fire it after the reply is sent with no path that can block, delay, or
 * alter the operational reply, regardless of consent or write outcome.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { deidentifyTurn, type CandidateClassifier } from "./deidentify";
import type { FilePesConsentStore } from "./consentStore";
import type { FilePesResearchStore } from "./researchStore";
import { PES_CONSENT_VERSION } from "./privacyNotice";
import { PES_RESEARCH_DATASET_ID, type PesConsentStatus, type PesResearchRecord } from "./types";

/** Resolved consent state for the turn (for observability on the result). */
export type ResolvedConsentStatus = PesConsentStatus | "not_recorded";

/**
 * A scrub-failure marker: written when de-identification fails to complete, so the
 * affected turn is identifiable WITHOUT persisting any of its content (Requirement
 * 5.5). Mirrors the file-per-entry convention of the Boundary_Guard rejection log.
 */
export interface ResearchScrubFailureEntry {
  event: "research_scrub_failure";
  /** Identifies the affected turn for follow-up; carries no turn content. */
  sessionRef: string;
  consentDecisionRef: string;
  /** Deidentifier stage marker (e.g. `classify-failed`); never any content. */
  model: string;
  /** ISO 8601 UTC timestamp. */
  at: string;
}

/** Outcome of a research-turn orchestration attempt. Never thrown — always returned. */
export type ResearchTurnResult =
  | { stored: true; record: PesResearchRecord; detections: { type: string; replacement: string }[] }
  | { stored: false; reason: "not_granted"; consentStatus: ResolvedConsentStatus }
  | { stored: false; reason: "scrub_failed"; failureEntryPath: string }
  | { stored: false; reason: "write_failed"; error: string };

export interface ResearchTurnInput {
  /** Raw turn content to de-identify; never written raw (Requirements 5.3, 5.4). */
  content: string;
  /** Operational session this turn belongs to (links the research record for DSAR). */
  sessionRef: string;
  /** Server-resolved Consent_Decision reference; absent ⇒ no research write. */
  consentRef: string | null | undefined;
  /** PES_Research_Store (its `write` routes through the Boundary_Guard). */
  store: FilePesResearchStore;
  /** P-E-S consent store used to resolve consent server-side. */
  consentStore: FilePesConsentStore;
  /** Directory for scrub-failure entries (e.g. `researchRoot/failures`). */
  failuresRoot: string;
  /** Dataset id stamped on the record. Defaults to {@link PES_RESEARCH_DATASET_ID}. */
  datasetId?: string;
  /** Injectable classifier for the Deidentifier (defaults to env provider). */
  classifier?: CandidateClassifier;
  /** Injectable clock (testing). Defaults to `() => new Date()`. */
  now?: () => Date;
  /** Injectable research-record id factory (testing). Defaults to `randomUUID`. */
  idFactory?: () => string;
}

/**
 * Orchestrate one gated research write. Resolves consent, de-identifies (fail-closed),
 * then writes through the guarded store. Returns a structured result; never throws.
 */
export async function researchTurn(input: ResearchTurnInput): Promise<ResearchTurnResult> {
  const {
    content,
    sessionRef,
    consentRef,
    store,
    consentStore,
    failuresRoot,
    datasetId = PES_RESEARCH_DATASET_ID,
    classifier,
    now = () => new Date(),
    idFactory = randomUUID,
  } = input;

  try {
    // ── Gate on consent. Only a recorded, `granted` decision permits a write;
    //    everything else (declined / withdrawn / not-recorded / record-failed)
    //    stores nothing (Requirements 2.3, 3.3, 3.5, 7.4, 9.3).
    const consent = consentRef ? await consentStore.load(consentRef) : null;
    if (consent === null || consent.status !== "granted") {
      return {
        stored: false,
        reason: "not_granted",
        consentStatus: consent?.status ?? "not_recorded",
      };
    }

    // ── De-identify BEFORE any byte is written; fail closed (Requirements 5.1, 5.5).
    const scrub = await deidentifyTurn(content, classifier);
    if (!scrub.ok) {
      const at = now().toISOString();
      const failureEntryPath = await writeFailureEntry(failuresRoot, {
        event: "research_scrub_failure",
        sessionRef,
        consentDecisionRef: consent.id,
        model: scrub.model,
        at,
      });
      return { stored: false, reason: "scrub_failed", failureEntryPath };
    }

    // ── Build and write the de-identified record. The store validates and routes
    //    through the Boundary_Guard. A `granted` write is attempted; a write/guard
    //    failure is reported but does not prohibit the attempt (Requirement 7.6).
    const record: PesResearchRecord = {
      id: idFactory(),
      datasetId,
      sessionRef,
      consentDecisionRef: consent.id,
      consentVersion: consent.consentVersion ?? PES_CONSENT_VERSION,
      collectedAt: now().toISOString(),
      content: scrub.deIdentifiedText,
    };

    try {
      const saved = await store.write(record);
      return { stored: true, record: saved, detections: scrub.detections };
    } catch (error) {
      return { stored: false, reason: "write_failed", error: errMessage(error) };
    }
  } catch (error) {
    // Defensive: a research side-effect must never bubble into the operational reply.
    return { stored: false, reason: "write_failed", error: errMessage(error) };
  }
}

/** Persist a scrub-failure entry as one JSON file; returns the written path. */
async function writeFailureEntry(
  failuresRoot: string,
  entry: ResearchScrubFailureEntry
): Promise<string> {
  await mkdir(failuresRoot, { recursive: true });
  const filename = `${entry.at.replace(/[:.]/g, "-")}-${randomUUID()}.json`;
  const filePath = path.join(failuresRoot, filename);
  await writeFile(filePath, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  return filePath;
}

function errMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
