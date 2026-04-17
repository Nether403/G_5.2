#!/usr/bin/env tsx
/**
 * scripts/validate-witness.ts
 *
 * Validate the Witness policy package against the shared policy-root contract.
 *
 * Usage:
 *   pnpm validate:witness
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCanonBoundary } from "../packages/orchestration/src/canon/validateCanon.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const witnessRoot = path.join(repoRoot, "packages", "inquisitor-witness");

  console.log(`validate:witness — checking ${witnessRoot}\n`);

  const result = await validateCanonBoundary(witnessRoot);

  const docCount = result.manifest.documents.length;
  const factCount = result.continuity.facts.length;
  const glossaryTermCount = result.glossary.terms.length;
  const indexedCount = result.recoveredIndex?.artifacts.length ?? 0;

  console.log(`  ✓ manifest.yaml            — ${docCount} documents`);
  console.log(`  ✓ continuity-facts.yaml    — ${factCount} facts`);
  console.log(`  ✓ glossary.yaml            — ${glossaryTermCount} terms`);
  console.log(`  ✓ recovered-index.yaml     — ${indexedCount} artifact(s) indexed`);
  console.log();

  if (result.warnings.length > 0) {
    console.log(`Warnings (${result.warnings.length}):`);
    for (const warning of result.warnings) {
      const ctx = warning.context ? ` [${warning.context}]` : "";
      console.warn(`  ⚠ ${warning.message}${ctx}`);
    }
    console.log();
  }

  console.log("validate:witness passed ✓\n");
}

main().catch((error) => {
  console.error("\nvalidate:witness failed ✗\n");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
