/**
 * validateCanon.ts
 *
 * Three-phase canon boundary validation.
 *
 * Phase 1 — Structural: parse all three YAML registries with Zod.
 *            Rejects malformed YAML, bad field types, duplicate slugs,
 *            invalid enums, missing required fields.
 *
 * Phase 2 — Boundary: enforce cross-file consistency rules.
 *            Errors: missing .md files, broken recovered-artifact links,
 *                    manifest/index slug mismatches.
 *            Warnings: placeholder artifacts, non-standard sources.
 *
 * Phase 3 — Load-time enforcement: called by loadCanon() before any
 *            document content is read, so orchestration never runs on
 *            half-broken canon.
 *
 * Schema source: ../schemas/canon.ts
 */

import path from "node:path";
import { access, readFile } from "node:fs/promises";
import YAML from "yaml";
import {
  CanonManifestSchema,
  ContinuityFactsFileSchema,
  GlossaryFileSchema,
  RecoveredIndexSchema,
  YAML_ONLY_SLUGS,
  type CanonManifest,
  type ContinuityFactsFile,
  type GlossaryFile,
  type RecoveredIndex,
} from "../schemas/canon";

// ── Result types ───────────────────────────────────────────────────────────────

export interface ValidationWarning {
  message: string;
  context?: string;
}

export interface CanonBoundaryResult {
  manifest: CanonManifest;
  continuity: ContinuityFactsFile;
  glossary: GlossaryFile;
  recoveredIndex: RecoveredIndex | null;
  warnings: ValidationWarning[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseYaml(raw: string, label: string): unknown {
  try {
    return YAML.parse(raw);
  } catch (err) {
    throw new Error(
      `${label}: YAML parse error — ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function formatZodError(label: string, error: { toString(): string }): string {
  return `${label} schema validation failed:\n${error.toString()}`;
}

// ── Phase 1 — Structural ───────────────────────────────────────────────────────

async function parseManifest(rootDir: string): Promise<CanonManifest> {
  const filePath = path.join(rootDir, "manifest.yaml");
  const raw = await readFile(filePath, "utf8");
  const parsed = parseYaml(raw, "manifest.yaml");
  const result = CanonManifestSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(formatZodError("manifest.yaml", result.error));
  }
  return result.data;
}

async function parseContinuityFacts(
  rootDir: string
): Promise<ContinuityFactsFile> {
  const filePath = path.join(rootDir, "continuity-facts.yaml");
  const raw = await readFile(filePath, "utf8");
  const parsed = parseYaml(raw, "continuity-facts.yaml");
  const result = ContinuityFactsFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(formatZodError("continuity-facts.yaml", result.error));
  }
  return result.data;
}

async function parseGlossary(rootDir: string): Promise<GlossaryFile> {
  const filePath = path.join(rootDir, "glossary.yaml");
  const raw = await readFile(filePath, "utf8");
  const parsed = parseYaml(raw, "glossary.yaml");
  const result = GlossaryFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(formatZodError("glossary.yaml", result.error));
  }
  return result.data;
}

async function parseRecoveredIndex(
  rootDir: string,
  required: boolean
): Promise<RecoveredIndex | null> {
  const filePath = path.join(
    rootDir,
    "recovered-artifacts",
    "recovered-index.yaml"
  );
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!required && code === "ENOENT") {
      return null;
    }
    throw error;
  }
  const parsed = parseYaml(raw, "recovered-artifacts/recovered-index.yaml");
  const result = RecoveredIndexSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      formatZodError("recovered-artifacts/recovered-index.yaml", result.error)
    );
  }
  return result.data;
}

// ── Phase 2 — Boundary ────────────────────────────────────────────────────────

async function validateBoundary(
  rootDir: string,
  manifest: CanonManifest,
  recoveredIndex: RecoveredIndex | null
): Promise<{ errors: string[]; warnings: ValidationWarning[] }> {
  const errors: string[] = [];
  const warnings: ValidationWarning[] = [];

  // 1. Manifest documents must have corresponding files
  for (const doc of manifest.documents) {
    if (YAML_ONLY_SLUGS.has(doc.slug)) {
      // Must exist as .yaml
      const yamlPath = path.join(rootDir, `${doc.slug}.yaml`);
      if (!(await fileExists(yamlPath))) {
        errors.push(
          `YAML-only slug '${doc.slug}' declared in manifest but '${doc.slug}.yaml' not found`
        );
      }
    } else {
      // Must exist as .md
      const mdPath = path.join(rootDir, `${doc.slug}.md`);
      if (!(await fileExists(mdPath))) {
        errors.push(
          `Manifest document '${doc.slug}' declared but '${doc.slug}.md' not found`
        );
      }
    }
  }

  // 2. Recovered artifacts in manifest must exist in recovered-index
  const indexSlugSet = new Set(
    (recoveredIndex?.artifacts ?? []).map((artifact) => artifact.slug)
  );
  for (const artifact of manifest.recovered_artifacts ?? []) {
    if (!indexSlugSet.has(artifact.slug)) {
      errors.push(
        `Manifest recovered artifact '${artifact.slug}' not found in recovered-index.yaml`
      );
    }
  }

  // 3. Recovered index artifacts must have their backing files
  for (const artifact of recoveredIndex?.artifacts ?? []) {
    const artifactPath = path.join(
      rootDir,
      "recovered-artifacts",
      artifact.artifact_file
    );
    const provenancePath = path.join(
      rootDir,
      "recovered-artifacts",
      artifact.provenance_file
    );

    if (!(await fileExists(artifactPath))) {
      errors.push(
        `Recovered artifact '${artifact.slug}': artifact_file '${artifact.artifact_file}' not found`
      );
    }
    if (!(await fileExists(provenancePath))) {
      errors.push(
        `Recovered artifact '${artifact.slug}': provenance_file '${artifact.provenance_file}' not found`
      );
    }

    // Warn about placeholders that made it past bootstrap
    if (artifact.recovery_status === "placeholder") {
      warnings.push({
        message: `Recovered artifact '${artifact.slug}' still has recovery_status 'placeholder'`,
        context: "recovered-artifacts/recovered-index.yaml",
      });
    }

    // Warn about partial recoveries
    if (artifact.recovery_status === "partial") {
      warnings.push({
        message: `Recovered artifact '${artifact.slug}' recovery is partial — content may be incomplete`,
        context: "recovered-artifacts/recovered-index.yaml",
      });
    }
  }

  return { errors, warnings };
}

// ── Main validator ─────────────────────────────────────────────────────────────

export async function validateCanonBoundary(
  rootDir: string
): Promise<CanonBoundaryResult> {
  const manifest = await parseManifest(rootDir);
  const requiresRecoveredArtifacts =
    (manifest.recovered_artifacts?.length ?? 0) > 0;

  // Phase 1: structural schema validation (throws on failure)
  const [continuity, glossary, recoveredIndex] = await Promise.all([
    parseContinuityFacts(rootDir),
    parseGlossary(rootDir),
    parseRecoveredIndex(rootDir, requiresRecoveredArtifacts),
  ]);

  // Phase 2: cross-file boundary checks
  const { errors, warnings } = await validateBoundary(
    rootDir,
    manifest,
    recoveredIndex
  );

  if (errors.length > 0) {
    throw new Error(
      `Canon boundary validation failed with ${errors.length} error(s):\n` +
        errors.map((e) => `  ✗ ${e}`).join("\n")
    );
  }

  return { manifest, continuity, glossary, recoveredIndex, warnings };
}
