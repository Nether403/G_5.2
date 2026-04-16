import { z } from "zod";

/**
 * Memory schema v3 (M3 — Memory Discipline v2).
 *
 * A memory item is typed by `type`, carries rich provenance, and moves
 * through an explicit state machine captured by `state`. Retrieval only
 * considers items in state `accepted`; all other states are inspectable
 * through the operator surface but excluded from turn context.
 */

export const MemoryTypeSchema = z.enum([
  "user_preference",
  "project_decision",
  "open_thread",
  "session_context",
  "operator_note",
  "rejected_candidate",
]);

export const MemoryScopeSchema = z.enum(["global", "session"]);

export const MemoryConfidenceSchema = z.enum(["high", "medium", "low"]);

export const MemoryStateSchema = z.enum([
  "proposed",
  "accepted",
  "rejected",
  "superseded",
  "resolved",
  "archived",
]);

export const MemoryOriginSchema = z.enum(["turn", "operator"]);

export const MemorySourceRefSchema = z.object({
  sessionId: z.string().min(1).optional(),
  turnId: z.string().min(1),
  createdAt: z.string().min(1),
});

export const MemoryCandidateSchema = z.object({
  type: MemoryTypeSchema,
  scope: MemoryScopeSchema,
  statement: z.string().min(1),
  justification: z.string().min(1),
  confidence: MemoryConfidenceSchema,
  tags: z.array(z.string().min(1)).default([]),
  rejectionReason: z.string().min(1).optional(),
});

export const MemoryItemSchema = z.object({
  schemaVersion: z.literal(3).optional(),
  id: z.string().min(1),
  type: MemoryTypeSchema,
  scope: MemoryScopeSchema,
  state: MemoryStateSchema,
  origin: MemoryOriginSchema,
  statement: z.string().min(1),
  justification: z.string().min(1),
  confidence: MemoryConfidenceSchema,
  tags: z.array(z.string().min(1)),
  sessionId: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  createdFrom: MemorySourceRefSchema,
  lastConfirmedFrom: MemorySourceRefSchema,
  confirmationCount: z.number().int().positive(),
  // Provenance for state transitions (all optional; recorded as they happen).
  approvedAt: z.string().min(1).optional(),
  approvedBy: z.string().min(1).optional(),
  rejectedAt: z.string().min(1).optional(),
  rejectionReason: z.string().min(1).optional(),
  resolvedAt: z.string().min(1).optional(),
  resolvedReason: z.string().min(1).optional(),
  archivedAt: z.string().min(1).optional(),
  archivedReason: z.string().min(1).optional(),
  supersedes: z.string().min(1).optional(),
  supersededBy: z.string().min(1).optional(),
});

export const MemoryStoredItemSnapshotSchema = MemoryItemSchema.extend({
  action: z.enum(["created", "confirmed"]),
});

export const MemoryDecisionSchema = z.object({
  shouldStore: z.boolean(),
  reason: z.string().min(1),
  candidates: z.array(MemoryCandidateSchema),
  skippedCandidates: z.array(MemoryCandidateSchema),
  storedItems: z.array(MemoryStoredItemSnapshotSchema),
});

export const MemoryModelCandidateSchema = z.object({
  type: MemoryTypeSchema,
  statement: z.string().min(1),
  justification: z.string().min(1),
  confidence: MemoryConfidenceSchema,
  tags: z.array(z.string().min(1)).default([]),
});

export const MemoryModelResponseSchema = z.object({
  reason: z.string().min(1),
  candidates: z.array(MemoryModelCandidateSchema).default([]),
});

export const MemoryFixtureSchema = z.array(MemoryItemSchema);

export type MemoryType = z.infer<typeof MemoryTypeSchema>;
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;
export type MemoryConfidence = z.infer<typeof MemoryConfidenceSchema>;
export type MemoryState = z.infer<typeof MemoryStateSchema>;
export type MemoryOrigin = z.infer<typeof MemoryOriginSchema>;
export type MemorySourceRef = z.infer<typeof MemorySourceRefSchema>;
export type MemoryCandidate = z.infer<typeof MemoryCandidateSchema>;
export type MemoryItem = z.infer<typeof MemoryItemSchema>;
export type MemoryStoredItemSnapshot = z.infer<
  typeof MemoryStoredItemSnapshotSchema
>;
export type MemoryDecision = z.infer<typeof MemoryDecisionSchema>;
export type MemoryModelCandidate = z.infer<typeof MemoryModelCandidateSchema>;
export type MemoryModelResponse = z.infer<typeof MemoryModelResponseSchema>;

/**
 * Classes whose newly-proposed items go through an explicit operator
 * approval step. Turn-generated items of these classes are still
 * auto-accepted (the pipeline gating is the approval contract); manual
 * operator-authored items default to `proposed` and require approval.
 */
export const APPROVAL_REQUIRED_TYPES: readonly MemoryType[] = [
  "user_preference",
  "project_decision",
  "operator_note",
];

export function typeRequiresApproval(type: MemoryType): boolean {
  return APPROVAL_REQUIRED_TYPES.includes(type);
}
