import path from "node:path";

export type ProductId = "pes" | "witness";

export interface ProductCapabilities {
  editorial: boolean;
  authoring: boolean;
}

export interface ProductConfig {
  id: ProductId;
  label: string;
  policyRoot: string;
  sessionsRoot: string;
  memoryRoot: string;
  /** Root of the de-identified, consented research dataset, disjoint from sessionsRoot. */
  researchRoot?: string;
  /** researchRoot/records — de-identified research records (PES_Research_Store). */
  researchRecordsRoot?: string;
  /** researchRoot/consent — P-E-S consent decisions (PesConsentRecord). */
  researchConsentRoot?: string;
  /** researchRoot/rejections — Boundary_Guard cross-dataset rejection log. */
  researchRejectionsRoot?: string;
  /** researchRoot/failures — scrub-failure entries (no content) from researchTurn. */
  researchFailuresRoot?: string;
  testimonyRoot?: string;
  consentRoot?: string;
  synthesisRoot?: string;
  annotationRoot?: string;
  archiveCandidateRoot?: string;
  publicationBundleRoot?: string;
  capabilities: ProductCapabilities;
}

export type ProductRegistry = Record<ProductId, ProductConfig>;

export function createProductRegistry(repoRoot: string): ProductRegistry {
  return {
    pes: {
      id: "pes",
      label: "P-E-S",
      policyRoot: path.join(repoRoot, "packages", "canon"),
      sessionsRoot: path.join(repoRoot, "data", "inquiry-sessions"),
      memoryRoot: path.join(repoRoot, "data", "memory-items"),
      researchRoot: path.join(repoRoot, "data", "pes-research"),
      researchRecordsRoot: path.join(repoRoot, "data", "pes-research", "records"),
      researchConsentRoot: path.join(repoRoot, "data", "pes-research", "consent"),
      researchRejectionsRoot: path.join(
        repoRoot,
        "data",
        "pes-research",
        "rejections"
      ),
      researchFailuresRoot: path.join(
        repoRoot,
        "data",
        "pes-research",
        "failures"
      ),
      capabilities: {
        editorial: true,
        authoring: true,
      },
    },
    witness: {
      id: "witness",
      label: "Witness",
      policyRoot: path.join(repoRoot, "packages", "inquisitor-witness"),
      sessionsRoot: path.join(repoRoot, "data", "witness", "sessions"),
      memoryRoot: path.join(repoRoot, "data", "witness", "memory"),
      testimonyRoot: path.join(repoRoot, "data", "witness", "testimony"),
      consentRoot: path.join(repoRoot, "data", "witness", "consent"),
      synthesisRoot: path.join(repoRoot, "data", "witness", "synthesis"),
      annotationRoot: path.join(repoRoot, "data", "witness", "annotations"),
      archiveCandidateRoot: path.join(
        repoRoot,
        "data",
        "witness",
        "archive-candidates"
      ),
      publicationBundleRoot: path.join(
        repoRoot,
        "data",
        "witness",
        "publication-bundles"
      ),
      capabilities: {
        editorial: false,
        authoring: false,
      },
    },
  };
}

export function getProductConfig(
  registry: ProductRegistry,
  product: string | undefined = "pes"
): ProductConfig {
  if (product === undefined || product === "pes" || product === "witness") {
    return registry[product ?? "pes"];
  }

  throw new Error(`Unknown product: ${product}`);
}
