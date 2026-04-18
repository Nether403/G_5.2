import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import YAML from "yaml";

import { FileSessionStore } from "../sessions/fileSessionStore";
import type {
  InquirySession,
  SessionTurnRecord,
} from "../types/session";
import type { ModelProvider } from "../types/providers";
import { buildContext } from "../pipeline/buildContext";
import {
  buildWitnessAnnotationCritiquePrompt,
  buildWitnessAnnotationDraftPrompt,
  buildWitnessAnnotationRevisePrompt,
  buildWitnessSynthesisCritiquePrompt,
  buildWitnessSynthesisDraftPrompt,
  buildWitnessSynthesisRevisePrompt,
} from "../pipeline/prompts/witnessPrompts";
import {
  FileWitnessTestimonyStore,
  appendTurnToTestimony,
} from "./fileTestimonyStore";
import {
  FileWitnessAnnotationStore,
  FileWitnessArchiveCandidateStore,
  FileWitnessSynthesisStore,
} from "./fileDraftStores";
import {
  FileWitnessConsentStore,
  listConsentForWitness,
} from "./fileConsentStore";
import type {
  AnnotationEntry,
  AnnotationRecord,
} from "../../../witness-types/src/annotation";
import type {
  ArchiveCandidateRecord,
  ArchiveCandidateStatus,
} from "../../../witness-types/src/archiveCandidate";
import {
  hasGrantedConsent,
  type ConsentScope,
} from "../../../witness-types/src/consent";
import type { TestimonyRecord, TestimonySegment } from "../../../witness-types/src/testimony";

export interface WitnessConsentGateOptions {
  testimonyId?: string;
  requiredScopes?: ConsentScope[];
}

export interface WitnessConsentGate {
  allowed: boolean;
  missingScopes: ConsentScope[];
}

const CURRENT_ARCHIVE_CANDIDATE_STATUSES = new Set<ArchiveCandidateStatus>([
  "draft",
  "archive_review_approved",
  "publication_ready",
]);

export async function getWitnessConsentGate(
  consentStore: FileWitnessConsentStore,
  witnessId: string,
  options?: string | WitnessConsentGateOptions
): Promise<WitnessConsentGate> {
  const resolved =
    typeof options === "string" ? { testimonyId: options } : options ?? {};
  const records = await listConsentForWitness(consentStore, witnessId);
  const requiredScopes = resolved.requiredScopes ?? [
    "conversational",
    "retention",
  ];
  const missingScopes = requiredScopes.filter(
    (scope) => !hasGrantedConsent(records, scope, resolved.testimonyId)
  );

  return {
    allowed: missingScopes.length === 0,
    missingScopes,
  };
}

export interface PersistWitnessTurnArtifactsInput {
  sessionRoot: string;
  testimonyStore: FileWitnessTestimonyStore;
  witnessId: string;
  session: InquirySession;
  persistedTurn: SessionTurnRecord;
  sessionStore?: Pick<FileSessionStore, "save">;
  logger?: WitnessCompensationLogger;
}

export interface PersistWitnessTurnArtifactsResult {
  session: InquirySession;
  testimonyId: string;
}

export interface WitnessCompensationEvent {
  event: "witness_persistence_compensation";
  reason: "testimony_append_failed" | "session_save_failed";
  action: "delete_created_testimony" | "restore_existing_testimony";
  status: "succeeded" | "failed";
  witnessId: string;
  sessionId: string;
  testimonyId?: string;
  error: string;
  compensationError?: string;
}

export type WitnessCompensationLogger = (
  event: WitnessCompensationEvent
) => void | Promise<void>;

async function emitWitnessCompensationEvent(
  logger: WitnessCompensationLogger,
  event: WitnessCompensationEvent
) {
  try {
    await logger(event);
  } catch {
    // Logging must not interfere with persistence compensation.
  }
}

function defaultWitnessCompensationLogger(event: WitnessCompensationEvent) {
  console.warn(JSON.stringify(event));
}

function buildWitnessConsentError(
  missingScopes: ConsentScope[],
  message = "Witness consent requirements not met."
) {
  const error = new Error(message);
  (error as Error & { missingScopes?: ConsentScope[] }).missingScopes =
    missingScopes;
  return error;
}

async function requireWitnessConsent(
  consentStore: FileWitnessConsentStore,
  witnessId: string,
  testimonyId: string,
  requiredScopes: ConsentScope[],
  message?: string
) {
  const gate = await getWitnessConsentGate(consentStore, witnessId, {
    testimonyId,
    requiredScopes,
  });
  if (!gate.allowed) {
    throw buildWitnessConsentError(gate.missingScopes, message);
  }
}

function latestApprovedByTestimony<T extends { testimonyId: string; status: string; updatedAt: string }>(
  records: T[],
  testimonyId: string
): T | null {
  const approved = records
    .filter((record) => record.testimonyId === testimonyId && record.status === "approved")
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  return approved.at(-1) ?? null;
}

export async function persistWitnessTurnArtifacts(
  input: PersistWitnessTurnArtifactsInput
): Promise<PersistWitnessTurnArtifactsResult> {
  const sessionStore =
    input.sessionStore ?? new FileSessionStore(input.sessionRoot);
  const logger = input.logger ?? defaultWitnessCompensationLogger;
  const stampedSession: InquirySession = {
    ...input.session,
    productId: "witness",
    witnessId: input.witnessId,
  };

  const existing = (await input.testimonyStore.list()).find(
    (record) =>
      record.sessionId === stampedSession.id &&
      record.witnessId === input.witnessId &&
      record.state !== "sealed"
  );

  const rollbackTestimony = async (
    reason: WitnessCompensationEvent["reason"],
    createdTestimonyId: string | null,
    previousRecord: typeof existing,
    error: unknown
  ) => {
    const action = previousRecord
      ? "restore_existing_testimony"
      : createdTestimonyId
        ? "delete_created_testimony"
        : null;

    if (!action) {
      return;
    }

    const testimonyId = previousRecord?.id ?? createdTestimonyId ?? undefined;

    if (previousRecord) {
      try {
        await input.testimonyStore.save(previousRecord);
        await emitWitnessCompensationEvent(logger, {
          event: "witness_persistence_compensation",
          reason,
          action,
          status: "succeeded",
          witnessId: input.witnessId,
          sessionId: stampedSession.id,
          testimonyId,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      } catch (compensationError) {
        await emitWitnessCompensationEvent(logger, {
          event: "witness_persistence_compensation",
          reason,
          action,
          status: "failed",
          witnessId: input.witnessId,
          sessionId: stampedSession.id,
          testimonyId,
          error: error instanceof Error ? error.message : String(error),
          compensationError:
            compensationError instanceof Error
              ? compensationError.message
              : String(compensationError),
        });
        throw compensationError;
      }
    }

    if (!createdTestimonyId) {
      return;
    }

    try {
      await input.testimonyStore.delete(createdTestimonyId);
      await emitWitnessCompensationEvent(logger, {
        event: "witness_persistence_compensation",
        reason,
        action,
        status: "succeeded",
        witnessId: input.witnessId,
        sessionId: stampedSession.id,
        testimonyId,
        error: error instanceof Error ? error.message : String(error),
      });
    } catch (compensationError) {
      await emitWitnessCompensationEvent(logger, {
        event: "witness_persistence_compensation",
        reason,
        action,
        status: "failed",
        witnessId: input.witnessId,
        sessionId: stampedSession.id,
        testimonyId,
        error: error instanceof Error ? error.message : String(error),
        compensationError:
          compensationError instanceof Error
            ? compensationError.message
            : String(compensationError),
      });
      throw compensationError;
    }
  };

  let createdTestimonyId: string | null = null;
  let updated;

  try {
    const testimony =
      existing ??
      (await input.testimonyStore.create({
        witnessId: input.witnessId,
        sessionId: stampedSession.id,
        capturedAt: input.persistedTurn.createdAt,
        title: stampedSession.title ?? "Witness Session",
      }));

    createdTestimonyId = existing ? null : testimony.id;

    updated = await appendTurnToTestimony(input.testimonyStore, {
      testimonyId: testimony.id,
      witnessText: input.persistedTurn.userMessage,
      assistantText: input.persistedTurn.assistantMessage,
      createdAt: input.persistedTurn.createdAt,
    });
  } catch (error) {
    await rollbackTestimony(
      "testimony_append_failed",
      createdTestimonyId,
      existing,
      error
    );
    throw error;
  }

  try {
    await sessionStore.save(stampedSession);
  } catch (error) {
    await rollbackTestimony(
      "session_save_failed",
      createdTestimonyId,
      existing,
      error
    );
    throw error;
  }

  return {
    session: stampedSession,
    testimonyId: updated.id,
  };
}

interface WitnessAnnotationLabel {
  id: string;
  name: string;
  description?: string;
}

interface WitnessAnnotationTaxonomy {
  labels: WitnessAnnotationLabel[];
}

async function loadWitnessAnnotationTaxonomy(
  policyRoot: string
): Promise<WitnessAnnotationTaxonomy> {
  const raw = await readFile(path.join(policyRoot, "annotation-taxonomy.yml"), "utf8");
  const parsed = YAML.parse(raw) as {
    families?: Array<{ labels?: WitnessAnnotationLabel[] }>;
  };
  const labels = (parsed.families ?? []).flatMap((family) => family.labels ?? []);
  if (labels.length === 0) {
    throw new Error("Witness annotation taxonomy does not define any labels.");
  }
  return { labels };
}

function resolveWitnessSegments(
  testimony: TestimonyRecord,
  segmentIds?: string[]
): TestimonySegment[] {
  const witnessSegments = testimony.segments.filter(
    (segment) => segment.role === "witness"
  );

  if (!segmentIds || segmentIds.length === 0) {
    if (witnessSegments.length === 0) {
      throw new Error("Testimony does not contain any witness segments.");
    }
    return witnessSegments;
  }

  const selected = segmentIds.map((segmentId) => {
    const segment = testimony.segments.find((item) => item.id === segmentId);
    if (!segment) {
      throw new Error(`Unknown testimony segment: ${segmentId}`);
    }
    if (segment.role !== "witness") {
      throw new Error("Annotation drafts may target only witness segments.");
    }
    return segment;
  });

  return selected;
}

function extractJsonObject(text: string): unknown {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last < first) {
    throw new Error("Witness annotation draft did not return JSON.");
  }
  return JSON.parse(text.slice(first, last + 1));
}

function coerceAnnotationEntries(raw: unknown): AnnotationEntry[] {
  const parsed = raw as { entries?: unknown };
  if (!Array.isArray(parsed.entries)) {
    throw new Error("Witness annotation draft must contain an entries array.");
  }
  return parsed.entries.map((entry) => {
    const record = entry as Record<string, unknown>;
    if (
      typeof record.labelId !== "string" ||
      typeof record.labelName !== "string" ||
      typeof record.segmentId !== "string" ||
      typeof record.startOffset !== "number" ||
      typeof record.endOffset !== "number" ||
      typeof record.quote !== "string"
    ) {
      throw new Error("Witness annotation entry is structurally invalid.");
    }

    return {
      id: typeof record.id === "string" ? record.id : randomUUID(),
      labelId: record.labelId,
      labelName: record.labelName,
      segmentId: record.segmentId,
      startOffset: record.startOffset,
      endOffset: record.endOffset,
      quote: record.quote,
      ...(typeof record.rationale === "string" && record.rationale.trim()
        ? { rationale: record.rationale.trim() }
        : {}),
    };
  });
}

function validateAnnotationEntries(
  testimony: TestimonyRecord,
  entries: AnnotationEntry[],
  taxonomy: WitnessAnnotationTaxonomy,
  allowedSegmentIds?: string[]
) {
  const labelsById = new Map(taxonomy.labels.map((label) => [label.id, label]));
  const allowed = allowedSegmentIds ? new Set(allowedSegmentIds) : null;

  for (const entry of entries) {
    const label = labelsById.get(entry.labelId);
    if (!label) {
      throw new Error(`Unknown annotation label: ${entry.labelId}`);
    }
    if (label.name !== entry.labelName) {
      throw new Error(`Annotation label name mismatch for ${entry.labelId}`);
    }
    const segment = testimony.segments.find((item) => item.id === entry.segmentId);
    if (!segment) {
      throw new Error(`Unknown testimony segment: ${entry.segmentId}`);
    }
    if (segment.role !== "witness") {
      throw new Error("Annotation entries may reference only witness segments.");
    }
    if (allowed && !allowed.has(segment.id)) {
      throw new Error(`Annotation entry targets an unselected segment: ${segment.id}`);
    }
    if (
      !Number.isInteger(entry.startOffset) ||
      !Number.isInteger(entry.endOffset) ||
      entry.startOffset < 0 ||
      entry.endOffset > segment.text.length ||
      entry.startOffset >= entry.endOffset
    ) {
      throw new Error(`Annotation offsets are out of range for segment ${segment.id}`);
    }
    if (segment.text.slice(entry.startOffset, entry.endOffset) !== entry.quote) {
      throw new Error(`Annotation quote does not match segment text for ${segment.id}`);
    }
  }
}

function buildMockSynthesisText(testimony: TestimonyRecord): string {
  const witnessLines = testimony.segments
    .filter((segment) => segment.role === "witness")
    .map((segment) => `- ${segment.text}`);
  return [
    "Draft Witness synthesis for operator review.",
    "This is provisional and grounded only in the recorded testimony.",
    ...witnessLines,
  ].join("\n");
}

function buildMockAnnotationEntries(
  segments: TestimonySegment[],
  taxonomy: WitnessAnnotationTaxonomy
): AnnotationEntry[] {
  const chronology =
    taxonomy.labels.find((label) => label.id === "STR-chronology") ??
    taxonomy.labels[0];
  const uncertain =
    taxonomy.labels.find((label) => label.id === "EPI-uncertain") ??
    chronology;

  return segments.map((segment) => {
    const uncertainMatch = /(not sure|uncertain|maybe|i think)/i.exec(segment.text);
    const chronologyMatch = /(before|after|then|later|first|next|when)/i.exec(
      segment.text
    );
    const match = uncertainMatch ?? chronologyMatch;
    const label = uncertainMatch ? uncertain : chronology;
    const startOffset = match?.index ?? 0;
    const endOffset =
      match?.index !== undefined
        ? match.index + match[0].length
        : Math.min(segment.text.length, 24);

    return {
      id: randomUUID(),
      labelId: label.id,
      labelName: label.name,
      segmentId: segment.id,
      startOffset,
      endOffset,
      quote: segment.text.slice(startOffset, endOffset),
      rationale: "Mock draft anchored to a direct testimony span.",
    };
  });
}

async function generateWitnessSynthesisText(
  provider: ModelProvider,
  policyRoot: string,
  testimony: TestimonyRecord
): Promise<string> {
  if (provider.name === "mock") {
    return buildMockSynthesisText(testimony);
  }

  const context = await buildContext({
    canonRoot: policyRoot,
    memoryRoot: undefined,
    mode: "reflective",
    userMessage: `Witness synthesis draft for testimony ${testimony.id}`,
    recentMessages: [],
  });
  const segments = testimony.segments.filter((segment) => segment.role === "witness");
  const draft = await provider.generateText({
    system: context.systemPrompt,
    user: buildWitnessSynthesisDraftPrompt({
      testimonyId: testimony.id,
      witnessId: testimony.witnessId,
      segments,
    }),
  });
  const critique = await provider.generateText({
    system: "You are the Witness synthesis critique pass for G_5.2.",
    user: buildWitnessSynthesisCritiquePrompt(draft.text),
  });
  const revised = await provider.generateText({
    system: context.systemPrompt,
    user: buildWitnessSynthesisRevisePrompt(draft.text, critique.text),
  });
  return revised.text.trim();
}

async function generateWitnessAnnotationEntries(
  provider: ModelProvider,
  policyRoot: string,
  testimony: TestimonyRecord,
  selectedSegments: TestimonySegment[],
  taxonomy: WitnessAnnotationTaxonomy
): Promise<AnnotationEntry[]> {
  if (provider.name === "mock") {
    return buildMockAnnotationEntries(selectedSegments, taxonomy);
  }

  const context = await buildContext({
    canonRoot: policyRoot,
    memoryRoot: undefined,
    mode: "reflective",
    userMessage: `Witness annotation draft for testimony ${testimony.id}`,
    recentMessages: [],
  });
  const taxonomyYaml = await readFile(
    path.join(policyRoot, "annotation-taxonomy.yml"),
    "utf8"
  );

  const draft = await provider.generateText({
    system: context.systemPrompt,
    user: buildWitnessAnnotationDraftPrompt({
      testimonyId: testimony.id,
      witnessId: testimony.witnessId,
      segments: selectedSegments,
      taxonomyYaml,
    }),
  });
  const critique = await provider.generateText({
    system: "You are the Witness annotation critique pass for G_5.2.",
    user: buildWitnessAnnotationCritiquePrompt(draft.text),
  });
  const revised = await provider.generateText({
    system: context.systemPrompt,
    user: buildWitnessAnnotationRevisePrompt(draft.text, critique.text),
  });

  return coerceAnnotationEntries(extractJsonObject(revised.text));
}

export interface CreateWitnessSynthesisDraftInput {
  policyRoot: string;
  testimonyId: string;
  testimonyStore: FileWitnessTestimonyStore;
  synthesisStore: FileWitnessSynthesisStore;
  consentStore: FileWitnessConsentStore;
}

export async function createWitnessSynthesisDraft(
  provider: ModelProvider,
  input: CreateWitnessSynthesisDraftInput
) {
  const testimony = await input.testimonyStore.load(input.testimonyId);
  if (!testimony) {
    throw new Error(`Unknown testimony record: ${input.testimonyId}`);
  }

  const gate = await getWitnessConsentGate(input.consentStore, testimony.witnessId, {
    testimonyId: testimony.id,
    requiredScopes: ["retention", "synthesis"],
  });
  if (!gate.allowed) {
    throw buildWitnessConsentError(gate.missingScopes);
  }

  const text = await generateWitnessSynthesisText(
    provider,
    input.policyRoot,
    testimony
  );
  const timestamp = new Date().toISOString();

  return input.synthesisStore.create({
    witnessId: testimony.witnessId,
    testimonyId: testimony.id,
    createdAt: timestamp,
    text,
  });
}

export interface UpdateWitnessSynthesisStatusInput {
  synthesisStore: FileWitnessSynthesisStore;
  testimonyStore: FileWitnessTestimonyStore;
  synthesisId: string;
  reviewNote?: string;
}

export async function approveWitnessSynthesis(
  input: UpdateWitnessSynthesisStatusInput
) {
  const record = await input.synthesisStore.load(input.synthesisId);
  if (!record) {
    throw new Error(`Unknown synthesis record: ${input.synthesisId}`);
  }
  if (record.status !== "draft") {
    throw new Error("Only draft synthesis records may be approved.");
  }

  const testimony = await input.testimonyStore.load(record.testimonyId);
  if (!testimony) {
    throw new Error(`Unknown testimony record: ${record.testimonyId}`);
  }

  const now = new Date().toISOString();
  const currentApproved = (await input.synthesisStore.list()).find(
    (item) =>
      item.testimonyId === record.testimonyId &&
      item.status === "approved" &&
      item.id !== record.id
  );
  if (currentApproved) {
    await input.synthesisStore.save({
      ...currentApproved,
      status: "superseded",
      updatedAt: now,
    });
  }

  const approved = await input.synthesisStore.save({
    ...record,
    status: "approved",
    updatedAt: now,
    ...(input.reviewNote?.trim() ? { reviewNote: input.reviewNote.trim() } : {}),
  });

  if (testimony.state !== "sealed") {
    await input.testimonyStore.save({
      ...testimony,
      state: "synthesized",
      updatedAt: now,
    });
  }

  return approved;
}

export async function rejectWitnessSynthesis(
  input: UpdateWitnessSynthesisStatusInput
) {
  const record = await input.synthesisStore.load(input.synthesisId);
  if (!record) {
    throw new Error(`Unknown synthesis record: ${input.synthesisId}`);
  }
  if (record.status !== "draft") {
    throw new Error("Only draft synthesis records may be rejected.");
  }
  return input.synthesisStore.save({
    ...record,
    status: "rejected",
    updatedAt: new Date().toISOString(),
    ...(input.reviewNote?.trim() ? { reviewNote: input.reviewNote.trim() } : {}),
  });
}

export interface CreateWitnessAnnotationDraftInput {
  policyRoot: string;
  testimonyId: string;
  testimonyStore: FileWitnessTestimonyStore;
  annotationStore: FileWitnessAnnotationStore;
  consentStore: FileWitnessConsentStore;
  segmentIds?: string[];
}

export async function createWitnessAnnotationDraft(
  provider: ModelProvider,
  input: CreateWitnessAnnotationDraftInput
) {
  const testimony = await input.testimonyStore.load(input.testimonyId);
  if (!testimony) {
    throw new Error(`Unknown testimony record: ${input.testimonyId}`);
  }

  const gate = await getWitnessConsentGate(input.consentStore, testimony.witnessId, {
    testimonyId: testimony.id,
    requiredScopes: ["retention", "annotation"],
  });
  if (!gate.allowed) {
    throw buildWitnessConsentError(gate.missingScopes);
  }

  const taxonomy = await loadWitnessAnnotationTaxonomy(input.policyRoot);
  const selectedSegments = resolveWitnessSegments(testimony, input.segmentIds);
  const entries = await generateWitnessAnnotationEntries(
    provider,
    input.policyRoot,
    testimony,
    selectedSegments,
    taxonomy
  );
  validateAnnotationEntries(
    testimony,
    entries,
    taxonomy,
    selectedSegments.map((segment) => segment.id)
  );

  const timestamp = new Date().toISOString();
  return input.annotationStore.create({
    witnessId: testimony.witnessId,
    testimonyId: testimony.id,
    createdAt: timestamp,
    entries,
  });
}

export interface UpdateWitnessAnnotationStatusInput {
  policyRoot: string;
  annotationStore: FileWitnessAnnotationStore;
  testimonyStore: FileWitnessTestimonyStore;
  annotationId: string;
  reviewNote?: string;
}

export async function approveWitnessAnnotation(
  input: UpdateWitnessAnnotationStatusInput
) {
  const record = await input.annotationStore.load(input.annotationId);
  if (!record) {
    throw new Error(`Unknown annotation record: ${input.annotationId}`);
  }
  if (record.status !== "draft") {
    throw new Error("Only draft annotation records may be approved.");
  }

  const testimony = await input.testimonyStore.load(record.testimonyId);
  if (!testimony) {
    throw new Error(`Unknown testimony record: ${record.testimonyId}`);
  }

  const taxonomy = await loadWitnessAnnotationTaxonomy(input.policyRoot);
  validateAnnotationEntries(testimony, record.entries, taxonomy);

  const now = new Date().toISOString();
  const currentApproved = (await input.annotationStore.list()).find(
    (item) =>
      item.testimonyId === record.testimonyId &&
      item.status === "approved" &&
      item.id !== record.id
  );
  if (currentApproved) {
    await input.annotationStore.save({
      ...currentApproved,
      status: "superseded",
      updatedAt: now,
    });
  }

  return input.annotationStore.save({
    ...record,
    status: "approved",
    updatedAt: now,
    ...(input.reviewNote?.trim() ? { reviewNote: input.reviewNote.trim() } : {}),
  });
}

export async function rejectWitnessAnnotation(
  input: UpdateWitnessAnnotationStatusInput
) {
  const record = await input.annotationStore.load(input.annotationId);
  if (!record) {
    throw new Error(`Unknown annotation record: ${input.annotationId}`);
  }
  if (record.status !== "draft") {
    throw new Error("Only draft annotation records may be rejected.");
  }
  return input.annotationStore.save({
    ...record,
    status: "rejected",
    updatedAt: new Date().toISOString(),
    ...(input.reviewNote?.trim() ? { reviewNote: input.reviewNote.trim() } : {}),
  });
}

export interface SealWitnessTestimonyInput {
  testimonyStore: FileWitnessTestimonyStore;
  testimonyId: string;
  note?: string;
}

export async function sealWitnessTestimony(input: SealWitnessTestimonyInput) {
  const testimony = await input.testimonyStore.load(input.testimonyId);
  if (!testimony) {
    throw new Error(`Unknown testimony record: ${input.testimonyId}`);
  }
  if (testimony.state === "withdrawn") {
    throw new Error("Withdrawn testimony cannot be sealed.");
  }
  if (testimony.state === "sealed") {
    return testimony;
  }
  return input.testimonyStore.save({
    ...testimony,
    state: "sealed",
    updatedAt: new Date().toISOString(),
  });
}

export interface CreateWitnessArchiveCandidateInput {
  testimonyId: string;
  testimonyStore: FileWitnessTestimonyStore;
  synthesisStore: FileWitnessSynthesisStore;
  annotationStore: FileWitnessAnnotationStore;
  archiveCandidateStore: FileWitnessArchiveCandidateStore;
  consentStore: FileWitnessConsentStore;
}

async function loadArchiveCandidateOrThrow(
  archiveCandidateStore: FileWitnessArchiveCandidateStore,
  candidateId: string
) {
  const candidate = await archiveCandidateStore.load(candidateId);
  if (!candidate) {
    throw new Error(`Unknown archive candidate: ${candidateId}`);
  }
  return candidate;
}

async function loadTestimonyOrThrow(
  testimonyStore: FileWitnessTestimonyStore,
  testimonyId: string
) {
  const testimony = await testimonyStore.load(testimonyId);
  if (!testimony) {
    throw new Error(`Unknown testimony record: ${testimonyId}`);
  }
  return testimony;
}

async function supersedeCurrentArchiveCandidates(
  archiveCandidateStore: FileWitnessArchiveCandidateStore,
  testimonyId: string,
  now: string
) {
  const existing = (await archiveCandidateStore.list()).filter(
    (record) =>
      record.testimonyId === testimonyId &&
      CURRENT_ARCHIVE_CANDIDATE_STATUSES.has(record.status)
  );

  for (const record of existing) {
    await archiveCandidateStore.save({
      ...record,
      status: "superseded",
      updatedAt: now,
    });
  }
}

export async function createWitnessArchiveCandidate(
  input: CreateWitnessArchiveCandidateInput
) {
  const testimony = await loadTestimonyOrThrow(
    input.testimonyStore,
    input.testimonyId
  );
  if (testimony.state !== "sealed") {
    throw new Error("Archive candidate creation requires a sealed testimony.");
  }

  await requireWitnessConsent(
    input.consentStore,
    testimony.witnessId,
    testimony.id,
    ["retention", "archive_review"],
    "Witness archive-review consent requirements not met."
  );

  const approvedSynthesis = latestApprovedByTestimony(
    await input.synthesisStore.list(),
    testimony.id
  );
  if (!approvedSynthesis) {
    throw new Error(
      `Archive candidate creation requires an approved synthesis for testimony ${testimony.id}.`
    );
  }

  const approvedAnnotation = latestApprovedByTestimony(
    await input.annotationStore.list(),
    testimony.id
  );
  if (!approvedAnnotation) {
    throw new Error(
      `Archive candidate creation requires an approved annotation for testimony ${testimony.id}.`
    );
  }

  const now = new Date().toISOString();
  await supersedeCurrentArchiveCandidates(
    input.archiveCandidateStore,
    testimony.id,
    now
  );

  return input.archiveCandidateStore.create({
    witnessId: testimony.witnessId,
    testimonyId: testimony.id,
    testimonyUpdatedAt: testimony.updatedAt,
    approvedSynthesisId: approvedSynthesis.id,
    approvedAnnotationId: approvedAnnotation.id,
    createdAt: now,
  });
}

export interface UpdateWitnessArchiveCandidateInput {
  archiveCandidateStore: FileWitnessArchiveCandidateStore;
  candidateId: string;
  note?: string;
}

export async function approveWitnessArchiveReview(
  input: UpdateWitnessArchiveCandidateInput
) {
  const record = await loadArchiveCandidateOrThrow(
    input.archiveCandidateStore,
    input.candidateId
  );
  if (record.status !== "draft") {
    throw new Error("Only draft archive candidates may be archive-review approved.");
  }
  return input.archiveCandidateStore.save({
    ...record,
    status: "archive_review_approved",
    updatedAt: new Date().toISOString(),
    ...(input.note?.trim() ? { reviewNote: input.note.trim() } : {}),
  });
}

export async function rejectWitnessArchiveReview(
  input: UpdateWitnessArchiveCandidateInput
) {
  const record = await loadArchiveCandidateOrThrow(
    input.archiveCandidateStore,
    input.candidateId
  );
  if (record.status !== "draft") {
    throw new Error("Only draft archive candidates may be archive-review rejected.");
  }
  return input.archiveCandidateStore.save({
    ...record,
    status: "archive_review_rejected",
    updatedAt: new Date().toISOString(),
    ...(input.note?.trim() ? { reviewNote: input.note.trim() } : {}),
  });
}

export interface MarkWitnessPublicationReadyInput {
  archiveCandidateStore: FileWitnessArchiveCandidateStore;
  consentStore: FileWitnessConsentStore;
  testimonyStore: FileWitnessTestimonyStore;
  candidateId: string;
  note?: string;
}

export async function markWitnessPublicationReady(
  input: MarkWitnessPublicationReadyInput
) {
  const record = await loadArchiveCandidateOrThrow(
    input.archiveCandidateStore,
    input.candidateId
  );
  if (record.status !== "archive_review_approved") {
    throw new Error(
      "Only archive-review-approved candidates may be marked publication ready."
    );
  }
  const testimony = await loadTestimonyOrThrow(input.testimonyStore, record.testimonyId);
  await requireWitnessConsent(
    input.consentStore,
    testimony.witnessId,
    testimony.id,
    ["publication"],
    "Witness publication consent requirements not met."
  );
  return input.archiveCandidateStore.save({
    ...record,
    status: "publication_ready",
    updatedAt: new Date().toISOString(),
    ...(input.note?.trim() ? { publicationNote: input.note.trim() } : {}),
  });
}

export async function rejectWitnessPublication(
  input: UpdateWitnessArchiveCandidateInput
) {
  const record = await loadArchiveCandidateOrThrow(
    input.archiveCandidateStore,
    input.candidateId
  );
  if (
    record.status !== "archive_review_approved" &&
    record.status !== "publication_ready"
  ) {
    throw new Error(
      "Only archive-review-approved or publication-ready candidates may be publication rejected."
    );
  }
  return input.archiveCandidateStore.save({
    ...record,
    status: "publication_rejected",
    updatedAt: new Date().toISOString(),
    ...(input.note?.trim() ? { publicationNote: input.note.trim() } : {}),
  });
}
