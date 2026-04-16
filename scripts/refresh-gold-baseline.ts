#!/usr/bin/env tsx
/**
 * scripts/refresh-gold-baseline.ts
 *
 * Promote a fresh eval report into the gold baseline directory.
 *
 * Usage:
 *   pnpm tsx scripts/refresh-gold-baseline.ts <provider> <reportPath>
 *
 * Example:
 *   pnpm tsx scripts/refresh-gold-baseline.ts anthropic \
 *     packages/evals/reports/eval-report-2026-04-16T12-00-00-000Z.json
 *
 * What it does:
 *   1. Validates the report against the persisted eval-report schema.
 *   2. Refuses promotion if the report has any critical failures.
 *      (See docs/eval-discipline.md for the merge-blocking policy.)
 *   3. Reads the report's canon version and writes the file as
 *      `packages/evals/gold-baselines/<provider>-<canonVersion>.json`.
 *   4. Archives the previous baseline for that provider to
 *      `gold-baselines/archive/` if the canon version changed.
 *
 * The script is intentionally conservative — it does NOT run evals,
 * mutate the report, or accept new providers automatically. It is the
 * "promote" step in the manual gold-baseline refresh process documented
 * in docs/gold-baseline-process.md.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";

import { validateReport } from "../packages/evals/src/reporters/reportSchema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPPORTED_PROVIDERS = new Set(["anthropic", "openai", "gemini"]);

async function main() {
  const [providerArg, reportArg] = process.argv.slice(2);
  if (!providerArg || !reportArg) {
    throw new Error(
      "Usage: refresh-gold-baseline.ts <provider> <reportPath>"
    );
  }
  if (!SUPPORTED_PROVIDERS.has(providerArg)) {
    throw new Error(
      `Unsupported provider "${providerArg}". Expected one of: ${[
        ...SUPPORTED_PROVIDERS,
      ].join(", ")}.`
    );
  }

  const repoRoot = path.resolve(__dirname, "..");
  const baselinesDir = path.join(
    repoRoot,
    "packages",
    "evals",
    "gold-baselines"
  );
  const archiveDir = path.join(baselinesDir, "archive");
  await mkdir(archiveDir, { recursive: true });

  const reportPath = path.isAbsolute(reportArg)
    ? reportArg
    : path.join(repoRoot, reportArg);
  const raw = JSON.parse(await readFile(reportPath, "utf8"));
  const report = validateReport(raw);

  const criticalFailed = report.score.criticalFailedIds ?? [];
  if (criticalFailed.length > 0) {
    throw new Error(
      `Refusing to promote: report has ${criticalFailed.length} critical failure(s): ${criticalFailed.join(", ")}.\n` +
        "Fix the regressions before refreshing the gold baseline."
    );
  }

  const canonVersion = report.metadata.canon.version;
  const targetName = `${providerArg}-${canonVersion}.json`;
  const targetPath = path.join(baselinesDir, targetName);

  // Archive any older baselines for this provider that are at a
  // different canon version. A same-version replacement just overwrites.
  const existing = await readdir(baselinesDir).catch(() => []);
  for (const entry of existing) {
    if (
      entry.startsWith(`${providerArg}-`) &&
      entry.endsWith(".json") &&
      entry !== targetName
    ) {
      await rename(
        path.join(baselinesDir, entry),
        path.join(archiveDir, entry)
      );
      console.log(`Archived previous baseline: ${entry}`);
    }
  }

  await writeFile(targetPath, JSON.stringify(report, null, 2), "utf8");
  console.log(
    `Promoted report -> ${path.relative(repoRoot, targetPath)}\n` +
      `  provider: ${providerArg}\n` +
      `  canon:    ${canonVersion}\n` +
      `  prompt:   ${report.metadata.revisions.prompt}\n` +
      `  pass:     ${report.score.passed}/${report.score.total}\n` +
      `  critical: ${criticalFailed.length} failed`
  );
  console.log(
    "\nNext: update packages/evals/gold-baselines/README.md with the new row, then commit."
  );
}

main().catch((err) => {
  console.error("refresh-gold-baseline failed:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
