import { z } from "zod";

/**
 * Current persisted eval report schema.
 *
 * Reports predating versioning omit the `schemaVersion` field. The
 * loader accepts that absence (v1) and normalizes it on the way in.
 */
export const CURRENT_REPORT_SCHEMA_VERSION = 2 as const;

const RunMetadataBlock = z.object({
  gitCommit: z.string().nullable(),
  canonVersion: z.string(),
  canonLastUpdated: z.string().nullable().optional(),
  promptRevision: z.string(),
  filter: z.array(z.string()),
  captureTrace: z.boolean(),
  git: z.object({
    commit: z.string().nullable(),
    shortCommit: z.string().nullable(),
    dirty: z.boolean().nullable(),
  }),
  canon: z.object({
    version: z.string(),
    lastUpdated: z.string().nullable().optional(),
  }),
  revisions: z.object({
    pipeline: z.string(),
    prompt: z.string(),
  }),
  runContext: z.object({
    entrypoint: z.string(),
    captureTrace: z.boolean(),
    filter: z.array(z.string()),
    caseCount: z.number().int(),
    nodeVersion: z.string(),
    evalProviderPreference: z.string().nullable(),
  }),
});

const SubsystemScorecardSchema = z
  .object({
    subsystem: z.string(),
    total: z.number(),
    passed: z.number(),
    failed: z.number(),
    passRate: z.number(),
    failedIds: z.array(z.string()),
    criticalFailedIds: z.array(z.string()),
  })
  .passthrough();

const ScoreSchema = z
  .object({
    total: z.number(),
    passed: z.number(),
    failed: z.number(),
    passRate: z.number(),
    criticalFailedIds: z.array(z.string()).optional(),
    subsystems: z.array(SubsystemScorecardSchema).optional(),
  })
  .passthrough();

const EvalResultSchema = z
  .object({
    id: z.string(),
    category: z.string(),
    subsystem: z.string().optional(),
    critical: z.boolean().optional(),
    passed: z.boolean(),
    failures: z
      .array(z.object({ message: z.string() }).passthrough())
      .default([]),
    output: z.string().default(""),
  })
  .passthrough();

export const EvalReportSchema = z
  .object({
    schemaVersion: z
      .literal(CURRENT_REPORT_SCHEMA_VERSION)
      .optional(),
    generatedAt: z.string().min(1),
    provider: z.string().min(1),
    model: z.string().min(1),
    metadata: RunMetadataBlock,
    score: ScoreSchema,
    results: z.array(EvalResultSchema),
  })
  .passthrough();

export type ValidatedEvalReport = z.infer<typeof EvalReportSchema>;

export function validateReport(raw: unknown): ValidatedEvalReport {
  const result = EvalReportSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `validateReport: ${result.error.message}`
    );
  }
  // Normalize legacy reports (schemaVersion absent) by stamping the
  // current version on the returned record. This gives downstream
  // consumers the same migration guarantee as session/memory loads.
  return {
    ...result.data,
    schemaVersion: CURRENT_REPORT_SCHEMA_VERSION,
  };
}
