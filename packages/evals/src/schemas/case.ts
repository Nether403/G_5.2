/**
 * Zod schema for eval case JSON files.
 *
 * Validates structure before execution so bad case files
 * fail loudly at load time rather than silently at run time.
 *
 * Unknown fields (e.g. _notes) are stripped by default.
 */

import { z } from "zod";

const EvalModeSchema = z.enum([
  "analytic",
  "reflective",
  "dialogic",
  "editorial",
  "speculative",
  "archive",
  "meta",
]);

const EvalCategorySchema = z.enum([
  "governance",
  "epistemics",
  "context",
  "style",
  "meta",
  "memory",
  "editorial",
  "reflection",
  "long-horizon",
]);

const EvalSubsystemSchema = z.enum([
  "canon-governance",
  "memory-discipline",
  "editorial-workflow",
  "reflection-discipline",
  "artifact-boundary",
  "provider-drift",
  "long-horizon-coherence",
  "style-and-voice",
  "retrieval-and-context",
  "epistemics-and-meta",
]);

const EvalRecentMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

const EvalAssertionsSchema = z
  .object({
    mustContainAny: z
      .array(z.array(z.string().min(1)).min(1, "OR-group cannot be empty"))
      .optional(),
    mustContainAll: z.array(z.string().min(1)).optional(),
    mustNotContain: z.array(z.string().min(1)).optional(),
    selectedDocumentsMustContain: z.array(z.string().min(1)).optional(),
    selectedDocumentsMustNotContain: z.array(z.string().min(1)).optional(),
    selectedFactsMustContain: z.array(z.string().min(1)).optional(),
    selectedFactsMustNotContain: z.array(z.string().min(1)).optional(),
    selectedGlossaryTermsMustContain: z.array(z.string().min(1)).optional(),
    selectedGlossaryTermsMustNotContain: z.array(z.string().min(1)).optional(),
    selectedRecoveredArtifactsMustContain: z.array(z.string().min(1)).optional(),
    selectedRecoveredArtifactsMustNotContain: z.array(z.string().min(1)).optional(),
    selectedMemoryItemsMustContain: z.array(z.string().min(1)).optional(),
    selectedMemoryItemsMustNotContain: z.array(z.string().min(1)).optional(),
    userPromptMustContain: z.array(z.string().min(1)).optional(),
    userPromptMustNotContain: z.array(z.string().min(1)).optional(),
  })
  .refine(
    (a) =>
      (a.mustContainAny?.length ?? 0) > 0 ||
      (a.mustContainAll?.length ?? 0) > 0 ||
      (a.mustNotContain?.length ?? 0) > 0 ||
      (a.selectedDocumentsMustContain?.length ?? 0) > 0 ||
      (a.selectedDocumentsMustNotContain?.length ?? 0) > 0 ||
      (a.selectedFactsMustContain?.length ?? 0) > 0 ||
      (a.selectedFactsMustNotContain?.length ?? 0) > 0 ||
      (a.selectedGlossaryTermsMustContain?.length ?? 0) > 0 ||
      (a.selectedGlossaryTermsMustNotContain?.length ?? 0) > 0 ||
      (a.selectedRecoveredArtifactsMustContain?.length ?? 0) > 0 ||
      (a.selectedRecoveredArtifactsMustNotContain?.length ?? 0) > 0 ||
      (a.selectedMemoryItemsMustContain?.length ?? 0) > 0 ||
      (a.selectedMemoryItemsMustNotContain?.length ?? 0) > 0 ||
      (a.userPromptMustContain?.length ?? 0) > 0 ||
      (a.userPromptMustNotContain?.length ?? 0) > 0,
    { message: "assertions must have at least one non-empty assertion type" }
  );

export const EvalCaseSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(
      /^[a-z0-9-]+-\d{3}$/,
      'Case id must end with a 3-digit suffix, e.g. "canon-precedence-001"'
    ),
  description: z.string().min(1),
  mode: EvalModeSchema,
  category: EvalCategorySchema,
  subsystem: EvalSubsystemSchema.optional(),
  critical: z.boolean().optional(),
  userMessage: z.string().min(1),
  recentMessages: z.array(EvalRecentMessageSchema),
  canonFixture: z.string().min(1).optional(),
  memoryFixture: z.string().min(1).optional(),
  assertions: EvalAssertionsSchema,
});

export type ValidatedEvalCase = z.infer<typeof EvalCaseSchema>;
