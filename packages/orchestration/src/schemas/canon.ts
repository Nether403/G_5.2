/**
 * Zod schemas for all canon data shapes.
 *
 * These are the single source of truth for structure validation.
 * Types are inferred from schemas — do not define parallel interfaces.
 *
 * Three data boundaries are validated:
 *   1. manifest.yaml        — registry of canonical docs and recovered artifacts
 *   2. continuity-facts.yaml — structured fact records with metadata
 *   3. recovered-index.yaml  — provenance registry for recovered artifacts
 */

import { z } from "zod";

// ── Shared primitives ──────────────────────────────────────────────────────────

export const YAML_ONLY_SLUGS = new Set(["continuity-facts", "glossary"]);

export const SlugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/, "Slug must be kebab-case");

export const NonEmptyStringSchema = z.string().trim().min(1);

export const RetrievalTagsSchema = z
  .array(NonEmptyStringSchema)
  .min(1, "At least one retrieval tag is required");

export const GlossaryTermSchema = z.object({
  term: NonEmptyStringSchema,
  definition: NonEmptyStringSchema,
});

export const GlossaryFileSchema = z
  .object({
    version: z.union([z.number(), z.string()]),
    last_updated: z.string().optional(),
    purpose: NonEmptyStringSchema,
    terms: z.array(GlossaryTermSchema).min(1),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();

    for (const [index, term] of value.terms.entries()) {
      const key = term.term.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["terms", index, "term"],
          message: `Duplicate glossary term: ${term.term}`,
        });
      }
      seen.add(key);
    }
  });

// ── Manifest schemas ───────────────────────────────────────────────────────────

export const ManifestDocumentTypeSchema = z.enum([
  "foundation",
  "governance",
  "style",
  "behavior",
  "interpretation",
  "continuity",
  "reference",
]);

export const ManifestStatusSchema = z.enum(["active", "draft", "archived"]);

export const RecoveredArtifactClassSchema = z.enum([
  "founding-artifact",
  "recovered-artifact",
  "reference-source",
  "transcript",
  "blueprint",
]);

export const RecoveredArtifactStatusSchema = z.enum([
  "recovered",
  "partial",
  "placeholder",
  "archived",
]);

export const CanonManifestDocumentSchema = z.object({
  slug: SlugSchema,
  title: NonEmptyStringSchema,
  type: ManifestDocumentTypeSchema,
  status: ManifestStatusSchema,
  priority: z.number().int().min(0).max(100),
  retrieval_tags: RetrievalTagsSchema,
});

export const CanonManifestRecoveredArtifactSchema = z.object({
  slug: SlugSchema,
  title: NonEmptyStringSchema,
  class: RecoveredArtifactClassSchema,
  status: RecoveredArtifactStatusSchema,
  retrieval_tags: RetrievalTagsSchema,
  retrieval_conditions: z.array(NonEmptyStringSchema).optional(),
});

export const CanonManifestSchema = z
  .object({
    version: z.union([z.number(), z.string()]),
    last_updated: z.string().optional(),
    documents: z.array(CanonManifestDocumentSchema).min(1),
    recovered_artifacts: z
      .array(CanonManifestRecoveredArtifactSchema)
      .optional(),
  })
  .superRefine((value, ctx) => {
    const docSlugs = new Set<string>();
    for (const [index, doc] of value.documents.entries()) {
      if (docSlugs.has(doc.slug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["documents", index, "slug"],
          message: `Duplicate document slug: ${doc.slug}`,
        });
      }
      docSlugs.add(doc.slug);
    }

    const artifactSlugs = new Set<string>();
    for (const [index, artifact] of (
      value.recovered_artifacts ?? []
    ).entries()) {
      if (artifactSlugs.has(artifact.slug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["recovered_artifacts", index, "slug"],
          message: `Duplicate recovered artifact slug: ${artifact.slug}`,
        });
      }
      artifactSlugs.add(artifact.slug);

      if (docSlugs.has(artifact.slug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["recovered_artifacts", index, "slug"],
          message: `Recovered artifact slug collides with document slug: ${artifact.slug}`,
        });
      }
    }
  });

// ── Continuity facts schemas ───────────────────────────────────────────────────

export const FactCategorySchema = z.enum([
  "project-history",
  "project-decision",
  "identity",
  "canon-governance",
  "active-governance",
  "architecture",
  "epistemics",
]);

export const FactStatusSchema = z.enum(["active", "draft", "archived"]);

export const FactConfidenceSchema = z.enum(["low", "medium", "high"]);

export const FactSourceSchema = z.enum([
  "authored",
  "constitution",
  "axioms",
  "epistemics",
  "constraints",
  "voice",
  "interaction-modes",
  "worldview",
  "recovered-artifact",
  "external",
]);

export const ContinuityFactSchema = z.object({
  id: z
    .string()
    .regex(/^CF-\d{3}$/, "Fact id must match CF-NNN pattern (e.g. CF-001)"),
  statement: NonEmptyStringSchema,
  category: FactCategorySchema,
  status: FactStatusSchema,
  source: FactSourceSchema,
  confidence: FactConfidenceSchema,
  tags: RetrievalTagsSchema,
});

export const ContinuityFactsMetaSchema = z
  .object({
    version: z.union([z.number(), z.string()]),
    last_updated: z.string().optional(),
    purpose: NonEmptyStringSchema,
    rules: z.array(NonEmptyStringSchema).min(1),
    categories: z.array(FactCategorySchema).min(1),
    note: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [index, category] of value.categories.entries()) {
      if (seen.has(category)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["categories", index],
          message: `Duplicate category in continuity meta: ${category}`,
        });
      }
      seen.add(category);
    }
  });

export const ContinuityFactsFileSchema = z
  .object({
    meta: ContinuityFactsMetaSchema,
    facts: z.array(ContinuityFactSchema).min(1),
  })
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    const allowedCategories = new Set(value.meta.categories);

    for (const [index, fact] of value.facts.entries()) {
      if (ids.has(fact.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["facts", index, "id"],
          message: `Duplicate fact id: ${fact.id}`,
        });
      }
      ids.add(fact.id);

      if (!allowedCategories.has(fact.category)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["facts", index, "category"],
          message: `Fact category '${fact.category}' not declared in meta.categories`,
        });
      }
    }
  });

// ── Recovered index schemas ────────────────────────────────────────────────────

export const CanonInfluenceEntrySchema = z.object({
  file: NonEmptyStringSchema,
  element: NonEmptyStringSchema,
  nature: z.enum(["conceptual", "direct", "governance-record", "stylistic"]),
});

export const EvalRoleSchema = z.object({
  id: SlugSchema,
  description: NonEmptyStringSchema,
});

export const RecoveredIndexArtifactSchema = z.object({
  slug: SlugSchema,
  title: NonEmptyStringSchema,
  class: RecoveredArtifactClassSchema,
  status: RecoveredArtifactStatusSchema,
  source_model: NonEmptyStringSchema,
  approximate_date: NonEmptyStringSchema,
  recovery_status: z.enum(["placeholder", "partial", "ingested", "complete"]),
  ingested_date: z.string().optional(),
  ingested_from: z.string().optional(),
  provenance_file: NonEmptyStringSchema,
  artifact_file: NonEmptyStringSchema,
  authority: z.literal("historically-authoritative"),
  behavioral_binding: z.literal(false),
  canon_influence: z.array(CanonInfluenceEntrySchema).optional(),
  rhetorical_only_claims: z.array(NonEmptyStringSchema).optional(),
  eval_roles: z.array(EvalRoleSchema).optional(),
  retrieval_tags: RetrievalTagsSchema,
});

export const RecoveredIndexSchema = z
  .object({
    version: z.union([z.number(), z.string()]),
    last_updated: z.string().optional(),
    purpose: NonEmptyStringSchema,
    artifacts: z.array(RecoveredIndexArtifactSchema),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [index, artifact] of value.artifacts.entries()) {
      if (seen.has(artifact.slug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["artifacts", index, "slug"],
          message: `Duplicate recovered artifact slug in recovered-index: ${artifact.slug}`,
        });
      }
      seen.add(artifact.slug);
    }
  });

// ── Inferred types ─────────────────────────────────────────────────────────────

export type CanonManifest = z.infer<typeof CanonManifestSchema>;
export type CanonManifestDocument = z.infer<typeof CanonManifestDocumentSchema>;
export type CanonManifestRecoveredArtifact = z.infer<
  typeof CanonManifestRecoveredArtifactSchema
>;
export type ContinuityFactsFile = z.infer<typeof ContinuityFactsFileSchema>;
export type ContinuityFact = z.infer<typeof ContinuityFactSchema>;
export type GlossaryFile = z.infer<typeof GlossaryFileSchema>;
export type GlossaryTerm = z.infer<typeof GlossaryTermSchema>;
export type RecoveredIndex = z.infer<typeof RecoveredIndexSchema>;
export type RecoveredIndexArtifact = z.infer<
  typeof RecoveredIndexArtifactSchema
>;
