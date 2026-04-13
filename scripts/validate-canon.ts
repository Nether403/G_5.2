#!/usr/bin/env tsx
/**
 * scripts/validate-canon.ts
 *
 * Minimal canon validator for commit 1.
 * Checks that all required canon files exist and that YAML files parse cleanly.
 *
 * Run: pnpm validate-canon
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ── Required files ─────────────────────────────────────────────────────────────
// Resolve __dirname portably across tsx versions
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const CANON_ROOT = resolve(REPO_ROOT, "packages/canon");


const REQUIRED_FILES: string[] = [
  "constitution.md",
  "axioms.md",
  "epistemics.md",
  "constraints.md",
  "voice.md",
  "interaction-modes.md",
  "worldview.md",
  "continuity-facts.yaml",
  "glossary.yaml",
  "anti-patterns.md",
  "manifest.yaml",
  "README.md",
  "recovered-artifacts/README.md",
  "recovered-artifacts/recovered-index.yaml",
  "recovered-artifacts/emergence-provenance.md",
  "recovered-artifacts/emergence-gemini-5-first-person-account.md",
];

const YAML_FILES: string[] = [
  "continuity-facts.yaml",
  "glossary.yaml",
  "manifest.yaml",
  "recovered-artifacts/recovered-index.yaml",
];

// ── Helpers ────────────────────────────────────────────────────────────────────
let failures = 0;

function pass(msg: string) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg: string) {
  console.error(`  ✗ ${msg}`);
  failures++;
}

function parseYamlBasic(content: string, fileName: string): boolean {
  // Minimal structural check: no tabs (YAML forbids them as indentation),
  // and at least one key-value pair present.
  if (/^\t/m.test(content)) {
    fail(`${fileName}: contains tab indentation (invalid YAML)`);
    return false;
  }
  if (!/\w+\s*:/.test(content)) {
    fail(`${fileName}: no recognizable key-value pairs found`);
    return false;
  }
  return true;
}

// ── 1. File presence ──────────────────────────────────────────────────────────
console.log("\nvalidate-canon: checking file presence");
for (const rel of REQUIRED_FILES) {
  const abs = resolve(CANON_ROOT, rel);
  if (existsSync(abs)) {
    pass(rel);
  } else {
    fail(`${rel} — MISSING`);
  }
}

// ── 2. YAML basic parse ───────────────────────────────────────────────────────
console.log("\nvalidate-canon: checking YAML structure");
for (const rel of YAML_FILES) {
  const abs = resolve(CANON_ROOT, rel);
  if (!existsSync(abs)) continue; // already reported above
  const content = readFileSync(abs, "utf-8");
  if (parseYamlBasic(content, rel)) {
    pass(`${rel} — basic structure OK`);
  }
}

// ── 3. Recovered artifact marker check ────────────────────────────────────────
console.log("\nvalidate-canon: checking recovery markers");
const emergenceFile = resolve(
  CANON_ROOT,
  "recovered-artifacts/emergence-gemini-5-first-person-account.md"
);
if (existsSync(emergenceFile)) {
  const content = readFileSync(emergenceFile, "utf-8");
  const hasBegin = content.includes("<!-- RECOVERED TEXT BEGINS -->");
  const hasEnd = content.includes("<!-- RECOVERED TEXT ENDS -->");
  const isPlaceholder = content.includes("Transfer pending");

  if (isPlaceholder) {
    fail("emergence document is still a placeholder — ingest the source text");
  } else if (!hasBegin || !hasEnd) {
    fail("emergence document is missing required recovery markers");
  } else {
    pass("emergence document: recovery markers present");
  }
}

// ── Result ────────────────────────────────────────────────────────────────────
console.log();
if (failures === 0) {
  console.log("validate-canon: all checks passed ✓\n");
  process.exit(0);
} else {
  console.error(`validate-canon: ${failures} check(s) failed ✗\n`);
  process.exit(1);
}
