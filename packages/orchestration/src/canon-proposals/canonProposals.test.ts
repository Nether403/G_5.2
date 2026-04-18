import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, copyFile, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  CanonProposalSchema,
  PROPOSAL_SCHEMA_VERSION,
  FileProposalStore,
  applyProposal,
  scaffoldChangelogEntry,
  computeLineDiff,
  parseContinuityFacts,
  nextContinuityFactId,
  appendContinuityFact,
  isEditableCanonFile,
  resolveCanonPath,
  canonFileLabel,
  type CanonProposal,
} from "./index";

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../..");
const realCanonRoot = path.join(repoRoot, "packages", "canon");

async function makeCanonRoot(): Promise<string> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "g52-canon-"));
  // Copy just the files the workflow needs.
  const filesToCopy = [
    "constitution.md",
    "axioms.md",
    "epistemics.md",
    "constraints.md",
    "voice.md",
    "interaction-modes.md",
    "interaction-modes-reference.md",
    "worldview.md",
    "anti-patterns.md",
    "anti-patterns-reference.md",
    "continuity-facts.yaml",
    "glossary.yaml",
    "manifest.yaml",
  ];
  for (const file of filesToCopy) {
    await copyFile(path.join(realCanonRoot, file), path.join(tmp, file));
  }
  return tmp;
}

function buildProposal(overrides: Partial<CanonProposal> = {}): CanonProposal {
  const now = new Date().toISOString();
  const base: CanonProposal = CanonProposalSchema.parse({
    schemaVersion: PROPOSAL_SCHEMA_VERSION,
    id: randomUUID(),
    title: "Test proposal",
    status: "pending",
    changeKind: "modify",
    target: {
      path: "constitution.md",
      label: "Constitution",
      kind: "canon_document",
    },
    beforeContent: "old\n",
    afterContent: "new\n",
    rationale: "tightening drift",
    provenance: { source: "manual" },
    createdAt: now,
    updatedAt: now,
    reviewHistory: [
      { at: now, action: "created", status: "pending" },
    ],
  });
  return CanonProposalSchema.parse({ ...base, ...overrides });
}

test("FileProposalStore round-trips a proposal through save/load/list/delete", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "g52-prop-"));
  const store = new FileProposalStore(dir);

  const proposal = buildProposal();
  const saved = await store.save(proposal);
  assert.equal(saved.id, proposal.id);

  const loaded = await store.load(proposal.id);
  assert.ok(loaded);
  assert.equal(loaded?.title, "Test proposal");

  const list = await store.list();
  assert.equal(list.length, 1);

  const deleted = await store.delete(proposal.id);
  assert.equal(deleted, true);
  const afterDelete = await store.load(proposal.id);
  assert.equal(afterDelete, null);
});

test("computeLineDiff produces add/remove/context lines and stats", () => {
  const diff = computeLineDiff("a\nb\nc\n", "a\nB\nc\nd\n");
  assert.equal(diff.stats.added, 2);
  assert.equal(diff.stats.removed, 1);
  assert.ok(diff.stats.unchanged >= 2);
  const ops = diff.lines.map((l) => l.op);
  assert.ok(ops.includes("add"));
  assert.ok(ops.includes("remove"));
  assert.ok(ops.includes("context"));
});

test("computeLineDiff handles null/empty content (create proposals)", () => {
  const diff = computeLineDiff(null, "hello\nworld\n");
  assert.equal(diff.stats.removed, 0);
  assert.equal(diff.stats.added, 2);
});

test("isEditableCanonFile allowlists only known canon files", () => {
  assert.equal(isEditableCanonFile("constitution.md"), true);
  assert.equal(isEditableCanonFile("interaction-modes-reference.md"), true);
  assert.equal(isEditableCanonFile("anti-patterns-reference.md"), true);
  assert.equal(isEditableCanonFile("continuity-facts.yaml"), true);
  assert.equal(isEditableCanonFile("README.md"), false);
  assert.equal(isEditableCanonFile("recovered-artifacts/foo.md"), false);
  assert.equal(isEditableCanonFile("../etc/passwd"), false);
});

test("resolveCanonPath rejects path traversal", () => {
  const root = path.join(os.tmpdir(), "canon-root");
  assert.throws(() => resolveCanonPath(root, "../escape.md"));
  assert.throws(() => resolveCanonPath(root, path.resolve(root, "abs.md")));
  const ok = resolveCanonPath(root, "axioms.md");
  assert.equal(ok, path.join(root, "axioms.md"));
});

test("parseContinuityFacts and nextContinuityFactId parse the real file", async () => {
  const yaml = await readFile(
    path.join(realCanonRoot, "continuity-facts.yaml"),
    "utf8"
  );
  const facts = parseContinuityFacts(yaml);
  assert.ok(facts.length > 0);
  for (const fact of facts) {
    assert.match(fact.id, /^CF-\d{3,}$/);
  }
  const next = nextContinuityFactId(facts);
  assert.match(next, /^CF-\d{3,}$/);
  assert.ok(!facts.some((f) => f.id === next));
});

test("appendContinuityFact extends the file with a parseable entry", async () => {
  const yaml = await readFile(
    path.join(realCanonRoot, "continuity-facts.yaml"),
    "utf8"
  );
  const facts = parseContinuityFacts(yaml);
  const newId = nextContinuityFactId(facts);
  const after = appendContinuityFact(yaml, {
    id: newId,
    statement: "A new fact for tests; quotes should be \"escaped\".",
    category: "epistemics",
    status: "active",
    source: "test",
  });

  const parsed = parseContinuityFacts(after);
  const appended = parsed.find((f) => f.id === newId);
  assert.ok(appended, `Expected fact ${newId} to be parseable`);
  assert.match(appended!.statement, /A new fact for tests/);
  assert.equal(appended!.category, "epistemics");
});

test("appendContinuityFact refuses to duplicate an existing id", async () => {
  const yaml = await readFile(
    path.join(realCanonRoot, "continuity-facts.yaml"),
    "utf8"
  );
  const facts = parseContinuityFacts(yaml);
  assert.throws(() =>
    appendContinuityFact(yaml, {
      id: facts[0].id,
      statement: "x",
      category: "epistemics",
      status: "active",
    })
  );
});

test("applyProposal writes afterContent and scaffoldChangelogEntry creates a sequential entry", async () => {
  const canonRoot = await makeCanonRoot();
  try {
    const original = await readFile(
      path.join(canonRoot, "constitution.md"),
      "utf8"
    );
    const updated = `${original}\n<!-- editorial workflow test -->\n`;
    const proposal = buildProposal({
      target: {
        path: "constitution.md",
        label: "Constitution",
        kind: "canon_document",
      },
      beforeContent: original,
      afterContent: updated,
      title: "Add editorial test marker",
    });

    const apply = await applyProposal(canonRoot, proposal);
    assert.equal(apply.relPath, "constitution.md");
    const written = await readFile(
      path.join(canonRoot, "constitution.md"),
      "utf8"
    );
    assert.equal(written, updated);

    // Pre-populate one existing changelog so we exercise the index logic.
    await mkdir(path.join(canonRoot, "changelog"), { recursive: true });
    const scaffold = await scaffoldChangelogEntry(canonRoot, proposal, {
      now: "2026-04-16T00:00:00.000Z",
    });
    assert.match(toPosixPath(scaffold.relPath), /^changelog\/0001-/);
    const entry = await readFile(scaffold.filePath, "utf8");
    assert.match(entry, /Add editorial test marker/);
    assert.match(entry, /Status:\*\* Accepted/);
    assert.match(entry, /constitution\.md/);

    // A second proposal should advance the index.
    const scaffold2 = await scaffoldChangelogEntry(canonRoot, proposal);
    assert.match(toPosixPath(scaffold2.relPath), /^changelog\/0002-/);
  } finally {
    await rm(canonRoot, { recursive: true, force: true });
  }
});

test("applyProposal supports delete proposals", async () => {
  const canonRoot = await makeCanonRoot();
  try {
    const proposal = buildProposal({
      changeKind: "delete",
      target: {
        path: "anti-patterns.md",
        label: "Anti-Patterns",
        kind: "canon_document",
      },
      beforeContent: await readFile(
        path.join(canonRoot, "anti-patterns.md"),
        "utf8"
      ),
      afterContent: null,
    });
    await applyProposal(canonRoot, proposal);
    assert.equal(existsSync(path.join(canonRoot, "anti-patterns.md")), false);
  } finally {
    await rm(canonRoot, { recursive: true, force: true });
  }
});

test("CanonProposalSchema rejects path traversal targets", () => {
  assert.throws(() =>
    CanonProposalSchema.parse({
      schemaVersion: PROPOSAL_SCHEMA_VERSION,
      id: randomUUID(),
      title: "bad",
      status: "pending",
      changeKind: "modify",
      target: { path: "../escape", label: "x", kind: "canon_document" },
      beforeContent: "",
      afterContent: "",
      rationale: "x",
      provenance: { source: "manual" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      reviewHistory: [],
    })
  );
});

test("canonFileLabel returns human-readable labels", () => {
  assert.equal(canonFileLabel("continuity-facts.yaml"), "Continuity Facts");
  assert.equal(canonFileLabel("constitution.md"), "Constitution");
  assert.equal(
    canonFileLabel("interaction-modes-reference.md"),
    "Interaction Modes Reference"
  );
  assert.equal(
    canonFileLabel("anti-patterns-reference.md"),
    "Anti-Patterns Reference"
  );
  assert.equal(canonFileLabel("unknown.md"), "unknown.md");
});
