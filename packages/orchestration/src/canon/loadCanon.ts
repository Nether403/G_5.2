import path from "node:path";
import { readFile } from "node:fs/promises";
import { validateCanonBoundary } from "./validateCanon";
import { parseFrontmatter } from "./parseFrontmatter";
import { YAML_ONLY_SLUGS } from "../schemas/canon";
import type {
  CanonDocument,
  LoadedCanon,
  LoadedRecoveredArtifact,
} from "../types/canon";

export async function loadCanon(rootDir: string): Promise<LoadedCanon> {
  // Phase 3 — load-time enforcement: validate before trusting disk
  const { manifest, continuity, glossary, recoveredIndex, warnings } =
    await validateCanonBoundary(rootDir);

  for (const warning of warnings) {
    const ctx = warning.context ? ` [${warning.context}]` : "";
    console.warn(`[canon warning]${ctx} ${warning.message}`);
  }

  // Load markdown-backed documents only (YAML-only slugs are already loaded
  // as structured data via validateCanonBoundary → ContinuityFactsFile)
  const markdownDocs = manifest.documents.filter(
    (doc) => !YAML_ONLY_SLUGS.has(doc.slug)
  );

  const documents: CanonDocument[] = await Promise.all(
    markdownDocs.map(async (doc) => {
      const filePath = path.join(rootDir, `${doc.slug}.md`);
      const raw = await readFile(filePath, "utf8");
      // Strip YAML frontmatter if present; canon files don't use it today
      // but this keeps loading forward-compatible if they ever do
      const { body } = parseFrontmatter(raw);

      return {
        slug: doc.slug,
        path: filePath,
        title: doc.title,
        content: body,
        type: doc.type,
        status: doc.status,
        priority: doc.priority,
        retrievalTags: doc.retrieval_tags,
      };
    })
  );

  const recoveredIndexBySlug = new Map(
    (recoveredIndex?.artifacts ?? []).map((artifact) => [artifact.slug, artifact])
  );

  const recoveredArtifacts: LoadedRecoveredArtifact[] = await Promise.all(
    (manifest.recovered_artifacts ?? []).map(async (artifact) => {
      const indexEntry = recoveredIndexBySlug.get(artifact.slug);
      if (!indexEntry) {
        throw new Error(
          `Recovered artifact '${artifact.slug}' declared in manifest but missing from recovered index`
        );
      }

      const artifactPath = path.join(
        rootDir,
        "recovered-artifacts",
        indexEntry.artifact_file
      );
      const provenancePath = path.join(
        rootDir,
        "recovered-artifacts",
        indexEntry.provenance_file
      );

      const [artifactRaw, provenanceRaw] = await Promise.all([
        readFile(artifactPath, "utf8"),
        readFile(provenancePath, "utf8"),
      ]);

      return {
        slug: artifact.slug,
        title: artifact.title,
        class: artifact.class,
        status: artifact.status,
        recoveryStatus: indexEntry.recovery_status,
        sourceModel: indexEntry.source_model,
        approximateDate: indexEntry.approximate_date,
        retrievalTags: artifact.retrieval_tags,
        retrievalConditions: artifact.retrieval_conditions ?? [],
        authority: indexEntry.authority,
        behavioralBinding: indexEntry.behavioral_binding,
        rhetoricalOnlyClaims: indexEntry.rhetorical_only_claims ?? [],
        artifactPath,
        provenancePath,
        content: parseFrontmatter(artifactRaw).body,
        provenance: parseFrontmatter(provenanceRaw).body,
      };
    })
  );

  return {
    rootDir,
    manifest,
    documents,
    continuityFacts: continuity.facts,
    glossary,
    recoveredArtifacts,
  };
}
