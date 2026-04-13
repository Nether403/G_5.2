import path from "node:path";
import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { readManifest } from "./readManifest";
import type {
  CanonDocument,
  ContinuityFactsFile,
  LoadedCanon,
} from "../types/canon";

// These slugs are loaded separately as structured data, not as markdown docs
const YAML_ONLY_SLUGS = new Set(["continuity-facts", "glossary"]);

export async function loadCanon(rootDir: string): Promise<LoadedCanon> {
  const manifestPath = path.join(rootDir, "manifest.yaml");
  const continuityPath = path.join(rootDir, "continuity-facts.yaml");

  const manifest = await readManifest(manifestPath);

  const markdownDocs = manifest.documents.filter(
    (doc) => !YAML_ONLY_SLUGS.has(doc.slug)
  );

  const documents: CanonDocument[] = await Promise.all(
    markdownDocs.map(async (doc) => {
      const filename = `${doc.slug}.md`;
      const filePath = path.join(rootDir, filename);
      const content = await readFile(filePath, "utf8");

      return {
        slug: doc.slug,
        path: filePath,
        title: doc.title,
        content,
        type: doc.type,
        priority: doc.priority,
        retrievalTags: doc.retrieval_tags,
      };
    })
  );

  const continuityRaw = await readFile(continuityPath, "utf8");
  const continuity = YAML.parse(continuityRaw) as ContinuityFactsFile;

  return {
    rootDir,
    manifest,
    documents,
    continuityFacts: continuity.facts,
  };
}
