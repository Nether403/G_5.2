import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";

import { loadCanon } from "./canon/loadCanon";
import { validateCanonBoundary } from "./canon/validateCanon";
import { createProductRegistry, getProductConfig } from "./products";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

test("createProductRegistry maps pes and witness to separate policy and data roots", () => {
  const registry = createProductRegistry(repoRoot);

  assert.deepEqual(Object.keys(registry).sort(), ["pes", "witness"]);

  assert.equal(
    registry.pes.policyRoot,
    path.join(repoRoot, "packages", "canon")
  );
  assert.equal(
    registry.pes.sessionsRoot,
    path.join(repoRoot, "data", "inquiry-sessions")
  );
  assert.equal(
    registry.pes.memoryRoot,
    path.join(repoRoot, "data", "memory-items")
  );

  assert.equal(
    registry.witness.policyRoot,
    path.join(repoRoot, "packages", "inquisitor-witness")
  );
  assert.equal(
    registry.witness.sessionsRoot,
    path.join(repoRoot, "data", "witness", "sessions")
  );
  assert.equal(
    registry.witness.memoryRoot,
    path.join(repoRoot, "data", "witness", "memory")
  );
  assert.equal(
    registry.witness.testimonyRoot,
    path.join(repoRoot, "data", "witness", "testimony")
  );
  assert.equal(
    registry.witness.consentRoot,
    path.join(repoRoot, "data", "witness", "consent")
  );
  assert.equal(registry.witness.capabilities.editorial, false);
  assert.equal(registry.witness.capabilities.authoring, false);
});

test("getProductConfig defaults to pes when product is omitted", () => {
  const registry = createProductRegistry(repoRoot);

  assert.equal(getProductConfig(registry).id, "pes");
  assert.equal(getProductConfig(registry, "witness").id, "witness");
  assert.throws(() => getProductConfig(registry, "unknown"), /Unknown product/);
});

test("validateCanonBoundary and loadCanon allow policy roots without recovered artifacts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-witness-policy-"));

  try {
    await mkdir(root, { recursive: true });
    await writeFile(
      path.join(root, "manifest.yaml"),
      `version: "0.1.0"
last_updated: "2026-04-17"
documents:
  - slug: constitution
    title: Constitution
    type: foundation
    status: active
    priority: 100
    retrieval_tags: [witness, inquiry]
  - slug: continuity-facts
    title: Continuity Facts
    type: continuity
    status: active
    priority: 90
    retrieval_tags: [witness, continuity]
  - slug: glossary
    title: Glossary
    type: reference
    status: active
    priority: 70
    retrieval_tags: [witness, glossary]
`,
      "utf8"
    );
    await writeFile(
      path.join(root, "constitution.md"),
      "# Constitution\n\nWitness policy root.",
      "utf8"
    );
    await writeFile(
      path.join(root, "glossary.yaml"),
      `version: "0.1.0"
purpose: "Witness glossary"
terms:
  - term: witness
    definition: "The source of testimony."
`,
      "utf8"
    );
    await writeFile(
      path.join(root, "continuity-facts.yaml"),
      `meta:
  version: "0.1.0"
  purpose: "Witness continuity"
  rules:
    - "Facts stay explicit."
  categories:
    - architecture
facts:
  - id: CF-001
    statement: "Witness uses a separate policy root."
    category: architecture
    status: active
    source: authored
    confidence: high
    tags: [witness, architecture]
`,
      "utf8"
    );

    const result = await validateCanonBoundary(root);
    assert.equal(result.manifest.documents.length, 3);
    assert.equal(result.recoveredIndex, null);

    const loaded = await loadCanon(root);
    assert.equal(loaded.documents.length, 1);
    assert.equal(loaded.recoveredArtifacts.length, 0);
    assert.equal(loaded.continuityFacts.length, 1);
    assert.equal(loaded.glossary.terms.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
