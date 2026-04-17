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
  testimonyRoot?: string;
  consentRoot?: string;
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
