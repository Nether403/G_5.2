export interface CanonManifestDocument {
  slug: string;
  title: string;
  type: string;
  status: string;
  priority: number;
  retrieval_tags: string[];
}

export interface CanonManifestRecoveredArtifact {
  slug: string;
  title: string;
  class: string;
  status: string;
  retrieval_tags: string[];
  retrieval_conditions?: string[];
}

export interface CanonManifest {
  version: number | string;
  last_updated?: string;
  documents: CanonManifestDocument[];
  recovered_artifacts?: CanonManifestRecoveredArtifact[];
}

export interface ContinuityFact {
  id: string;
  statement: string;
  category: string;
  status: string;
  source: string;
  confidence: string;
  tags: string[];
}

export interface ContinuityFactsFile {
  meta: Record<string, unknown>;
  facts: ContinuityFact[];
}

export interface CanonDocument {
  slug: string;
  path: string;
  title: string;
  content: string;
  type: string;
  priority: number;
  retrievalTags: string[];
}

export interface LoadedCanon {
  rootDir: string;
  manifest: CanonManifest;
  documents: CanonDocument[];
  continuityFacts: ContinuityFact[];
}
