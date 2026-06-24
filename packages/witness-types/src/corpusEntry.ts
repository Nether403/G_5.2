/**
 * Zod schema + inferred types for the Witness Protocol Corpus_Entry v0.1
 * (`schema_version: "0.1.0"`).
 *
 * This file is the single source of truth for the Corpus_Entry structure —
 * types are inferred from the schema; do not define parallel interfaces.
 *
 * The contract encodes all nine entry sections (meta, consent_boundary,
 * provenance, human_readable, reasoning_structure, plurality, eval_case,
 * references, public_slice + datasheet_summary) plus the optional
 * `review_summary` and `private` sections, mirroring the design's
 * "Schema / JSON Contract (schema_version: 0.1.0)".
 *
 * Validity rules enforced here (design "Validity rules (v0.1)"):
 *   - exactly one mandatory public `eval_case` (single object, `is_public: true`);
 *     holdout/benchmark cases live only in `private.holdout_eval_cases`.
 *   - `consent_boundary.segments` carry an RFC-6901 `json_pointer` (NOT `applies_to`).
 *   - WHERE `is_synthetic` is true, `entry_kind` MUST be `synthetic_exemplar`
 *     and `outreach_ready` MUST be false (superRefine below).
 *
 * `parseCorpusEntry()` fails closed: it throws on any missing required field.
 */

import { z } from "zod";

export const CORPUS_ENTRY_SCHEMA_VERSION = "0.1.0" as const;

// ── Shared primitives ───────────────────────────────────────────────────────

const NonEmptyString = z.string().min(1);

/** Consent_Boundary classification (default-deny: unclassified ⇒ held_back). */
export const ClassificationSchema = z.enum([
  "public",
  "research_only",
  "private",
  "held_back",
]);
export type Classification = z.infer<typeof ClassificationSchema>;

export const EntryKindSchema = z.enum(["real", "synthetic_exemplar"]);
export type EntryKind = z.infer<typeof EntryKindSchema>;

export const AxiomClusterSchema = z.enum([
  "capabilities_floor",
  "relational_ethics",
  "utilitarian",
  "deontic",
  "virtue",
  "liberation",
  "ecological",
  "spiritual",
  "legal_proceduralism",
  "ubuntu_communal",
  "tragic_realism",
]);
export type AxiomCluster = z.infer<typeof AxiomClusterSchema>;

// ── meta (R7, R8, R14) ───────────────────────────────────────────────────────

export const EntryHashesSchema = z.object({
  // AUDIT-ONLY — equals testimony_records.content_hash; never emitted publicly.
  source_testimony_hash: NonEmptyString,
  // Safe to expose publicly; null until the public_slice is finalized.
  redacted_public_slice_hash: NonEmptyString.nullable(),
  // Safe to expose publicly; null until the bundle is emitted.
  publication_bundle_hash: NonEmptyString.nullable(),
});

export const MetaSchema = z.object({
  entry_id: NonEmptyString,
  entry_kind: EntryKindSchema,
  created_at: NonEmptyString,
  is_synthetic: z.boolean(),
  synthetic_notice: z.string().nullable(),
  outreach_ready: z.boolean(),
  framing_statement: NonEmptyString,
  consent_version_ref: NonEmptyString,
  hashes: EntryHashesSchema,
});

// ── consent_boundary (R1, R12) ───────────────────────────────────────────────

export const ConsentSegmentSchema = z.object({
  segment_id: NonEmptyString,
  classification: ClassificationSchema,
  // RFC-6901 JSON Pointer to the governed field (e.g. /human_readable/situation).
  json_pointer: NonEmptyString,
});

export const ConsentBoundarySchema = z.object({
  consent_record_ref: NonEmptyString,
  default_classification: ClassificationSchema.default("held_back"),
  segments: z.array(ConsentSegmentSchema),
});

// ── provenance (R2) ──────────────────────────────────────────────────────────

export const ProcessingStepSchema = z.object({
  step: z.enum(["deidentification", "redaction", "annotation", "synthesis"]),
  actor: NonEmptyString,
  at: NonEmptyString,
});

export const AiParticipantSchema = z.object({
  role: z.enum(["sieve", "qualifier", "inquisitor", "synthesis"]),
  provider: NonEmptyString,
  model: NonEmptyString,
  prompt_revision: NonEmptyString,
  canon_version: NonEmptyString,
});

export const HumanReviewerSchema = z.object({
  reviewer_id: NonEmptyString,
  role: z.enum(["hcc", "sac"]),
  decision: z.enum(["accept", "reject", "review"]),
});

export const ProvenanceSchema = z.object({
  source_type: z.enum([
    "expert",
    "lived_experience",
    "practitioner",
    "adversarial",
    "synthetic",
  ]),
  processing_steps: z.array(ProcessingStepSchema),
  ai_participants: z.array(AiParticipantSchema),
  human_reviewers: z.array(HumanReviewerSchema),
  gate_assessment_ref: NonEmptyString,
  rfc3161_token: z.string().nullable(),
  ipfs_cid: z.string().nullable(),
});

// ── human_readable (R3) ──────────────────────────────────────────────────────

export const GlossaryEntrySchema = z.object({
  term: NonEmptyString,
  plain_definition: NonEmptyString,
});

export const HumanReadableSchema = z.object({
  situation: NonEmptyString,
  glossary: z.array(GlossaryEntrySchema),
});

// ── reasoning_structure (R4) ─────────────────────────────────────────────────

export const ClaimSchema = z.object({
  claim_id: NonEmptyString,
  text: NonEmptyString,
});

export const ReasoningStepSchema = z.object({
  step_index: z.number().int(),
  text: NonEmptyString,
  grounding: NonEmptyString,
  claim_ref: NonEmptyString.nullable(),
});

export const CounterfactualSchema = z.object({
  text: NonEmptyString,
  changes_judgment: z.boolean(),
});

export const TensionSchema = z.object({
  tension_id: NonEmptyString,
  summary: NonEmptyString,
  tension_type: z.enum([
    "resolvable",
    "partially_resolvable",
    "incommensurable",
  ]),
  // R5: true forbids resolving the tension to a single answer.
  do_not_flatten: z.boolean(),
});

export const CapRelFeltSchema = z.object({
  cap: z.array(z.string()),
  rel: z.array(z.string()),
  felt: z.array(z.string()),
});

export const ReasoningStructureSchema = z.object({
  // Structural validity requires non-empty claims.
  claims: z.array(ClaimSchema).min(1),
  reasoning_steps: z.array(ReasoningStepSchema),
  counterfactuals: z.array(CounterfactualSchema),
  tensions: z.array(TensionSchema),
  cap_rel_felt: CapRelFeltSchema,
  failure_modes: z.array(z.string()),
});

// ── plurality (R5) ───────────────────────────────────────────────────────────

export const PluralityPositionSchema = z.object({
  position_id: NonEmptyString,
  axiom_cluster: AxiomClusterSchema,
  stance: NonEmptyString,
  what_it_sees_clearly: NonEmptyString,
  what_it_risks_missing: NonEmptyString,
});

export const OpposingPairSchema = z.object({
  position_a: NonEmptyString,
  position_b: NonEmptyString,
  tension_ref: NonEmptyString,
});

export const PluralitySchema = z.object({
  positions: z.array(PluralityPositionSchema),
  opposing_pairs: z.array(OpposingPairSchema),
  minority_report: z.string().nullable(),
});

// ── eval_case (R6 mandatory/public + R9 witness-attributed) ──────────────────
// NO `holdout` field; the mandatory entry eval is ALWAYS public and non-holdout.
// Private benchmark cases live only in `private.holdout_eval_cases`.

export const EvalCaseSchema = z.object({
  eval_id: NonEmptyString,
  is_public: z.literal(true),
  prompt: NonEmptyString,
  // R9: 'preserves the tension THIS witness articulated' — NOT 'the correct answer'.
  witness_attributed_ideal_behavior: NonEmptyString,
  attribution_basis: NonEmptyString,
  failure_modes_detected: z.array(z.string()),
  rubric_dimensions: z.array(z.string()),
  provenance_attribution: NonEmptyString,
});

// ── references (R13) ─────────────────────────────────────────────────────────

export const TwpControlPlaneRefsSchema = z.object({
  gate_assessment_id: NonEmptyString,
  consent_record_id: NonEmptyString,
  // Internal pseudonymous TWP vault reference; NEVER public.
  witness_profile_ref: NonEmptyString,
  public_witness_label: z.string().nullable(),
});

export const G52GovernedRefsSchema = z.object({
  session_id: NonEmptyString,
  testimony_id: NonEmptyString,
  synthesis_ids: z.array(z.string()),
  annotation_batch_ids: z.array(z.string()),
  publication_bundle_id: NonEmptyString,
  // G_5.2 stores a disclosure manifest hash, NOT the ledger itself.
  disclosure_manifest_hash: NonEmptyString.nullable(),
});

export const ReferencesSchema = z.object({
  twp_control_plane: TwpControlPlaneRefsSchema,
  g52_governed: G52GovernedRefsSchema,
});

// ── review_summary (optional external-trust metadata) ────────────────────────

export const ReviewSummarySchema = z.object({
  hcc_decision: z
    .enum(["accept", "accept_with_edits", "reject"])
    .nullable(),
  reviewer_count: z.number().int().nullable(),
  inter_rater_agreement_kappa: z.number().nullable(),
});

// ── public_slice + datasheet_summary (R10, R12) ──────────────────────────────

export const PublicSliceSchema = z.object({
  situation_excerpt: NonEmptyString,
  claims_public: z.array(z.string()),
  tensions_public: z.array(z.string()),
  eval_case_public: NonEmptyString,
  framing_statement: NonEmptyString,
});

export const DatasheetSummarySchema = z.object({
  title: NonEmptyString,
  one_line_situation: NonEmptyString,
  primary_axiom_clusters: z.array(z.string()),
  headline_tension: NonEmptyString,
  eval_case_ref: NonEmptyString,
  consent_scope_public: z.boolean(),
});

// ── private (R6.4, R12, R14) — optional, never in the public slice ───────────

export const CompilerArtifactsSchema = z.object({
  dpo_pairs: z.array(z.unknown()).nullable(),
  prm_traces: z.array(z.unknown()).nullable(),
  rbr_rules: z.array(z.unknown()).nullable(),
});

export const PrivateSectionSchema = z.object({
  compiler_artifacts: CompilerArtifactsSchema,
  // Private benchmark eval cases; hardest/adversarial cases default here.
  holdout_eval_cases: z.array(z.unknown()),
  held_back_notes: z.string().nullable(),
});

// ── Corpus_Entry (top-level contract) ────────────────────────────────────────

export const CorpusEntrySchema = z
  .object({
    schema_version: z.literal(CORPUS_ENTRY_SCHEMA_VERSION),
    meta: MetaSchema,
    consent_boundary: ConsentBoundarySchema,
    provenance: ProvenanceSchema,
    human_readable: HumanReadableSchema,
    reasoning_structure: ReasoningStructureSchema,
    plurality: PluralitySchema,
    // Exactly one mandatory public eval_case (single object, is_public: true).
    eval_case: EvalCaseSchema,
    references: ReferencesSchema,
    public_slice: PublicSliceSchema,
    datasheet_summary: DatasheetSummarySchema,
    review_summary: ReviewSummarySchema.optional(),
    private: PrivateSectionSchema.optional(),
  })
  .superRefine((value, ctx) => {
    // Validity rule: WHERE is_synthetic is true, entry_kind MUST be
    // synthetic_exemplar and outreach_ready MUST be false.
    if (value.meta.is_synthetic) {
      if (value.meta.entry_kind !== "synthetic_exemplar") {
        ctx.addIssue({
          code: "custom",
          path: ["meta", "entry_kind"],
          message:
            'is_synthetic entries MUST have entry_kind "synthetic_exemplar"',
        });
      }
      if (value.meta.outreach_ready !== false) {
        ctx.addIssue({
          code: "custom",
          path: ["meta", "outreach_ready"],
          message: "is_synthetic entries MUST have outreach_ready === false",
        });
      }
    }
  });

// ── Inferred types ───────────────────────────────────────────────────────────

export type EntryHashes = z.infer<typeof EntryHashesSchema>;
export type Meta = z.infer<typeof MetaSchema>;
export type ConsentSegment = z.infer<typeof ConsentSegmentSchema>;
export type ConsentBoundary = z.infer<typeof ConsentBoundarySchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type HumanReadable = z.infer<typeof HumanReadableSchema>;
export type ReasoningStructure = z.infer<typeof ReasoningStructureSchema>;
export type Plurality = z.infer<typeof PluralitySchema>;
export type CorpusEvalCase = z.infer<typeof EvalCaseSchema>;
export type References = z.infer<typeof ReferencesSchema>;
export type ReviewSummary = z.infer<typeof ReviewSummarySchema>;
export type PublicSlice = z.infer<typeof PublicSliceSchema>;
export type DatasheetSummary = z.infer<typeof DatasheetSummarySchema>;
export type PrivateSection = z.infer<typeof PrivateSectionSchema>;
export type CorpusEntry = z.infer<typeof CorpusEntrySchema>;

// ── Disclosure_Ledger row (TWP control plane, append-only) ───────────────────
// Stored in TWP and referenced by entry_id; NOT embedded in the entry JSON.

export const DisclosureLedgerRowSchema = z.object({
  ledger_id: NonEmptyString,
  entry_id: NonEmptyString,
  publication_bundle_id: NonEmptyString,
  redacted_public_slice_hash: NonEmptyString,
  publication_bundle_hash: NonEmptyString.nullable(),
  recipient_or_channel: NonEmptyString,
  disclosed_at: NonEmptyString,
  consent_version_ref: NonEmptyString,
  terms_ref: z.string().nullable(),
  revocation_status: z.enum(["active", "revoked", "pending"]),
  revoked_at: z.string().nullable(),
});

export type DisclosureLedgerRow = z.infer<typeof DisclosureLedgerRowSchema>;

// ── parse (fail-closed) ──────────────────────────────────────────────────────

/**
 * Parse and validate an unknown value as a Corpus_Entry v0.1.
 *
 * Fails closed: throws a {@link z.ZodError} on any missing required field or
 * validity-rule violation (e.g. a missing `eval_case`, a missing
 * `source_testimony_hash`, or a synthetic entry marked outreach_ready).
 */
export function parseCorpusEntry(input: unknown): CorpusEntry {
  return CorpusEntrySchema.parse(input);
}
