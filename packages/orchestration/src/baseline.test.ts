import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadCanon } from "./canon/loadCanon";
import { buildContext } from "./pipeline/buildContext";
import { selectCanonDocuments } from "./canon/selectCanon";
import { providerFromEnv } from "./providers/fromEnv";
import { MockProvider } from "./providers/mock";
import { selectContinuityFacts } from "./retrieval/selectContinuityFacts";
import { selectGlossaryTerms } from "./retrieval/selectGlossaryTerms";
import { selectRecoveredArtifacts } from "./retrieval/selectRecoveredArtifacts";
import { runSessionTurn } from "./sessions/runSessionTurn";
import type { LoadedCanon } from "./types/canon";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const canonRoot = path.join(repoRoot, "packages", "canon");

function buildLoadedCanonFixture(): LoadedCanon {
  return {
    rootDir: canonRoot,
    manifest: {
      version: "fixture",
      documents: [],
    },
    documents: [
      {
        slug: "active-doc",
        path: "active-doc.md",
        title: "Active Doc",
        content: "active probe",
        type: "foundation",
        status: "active",
        priority: 100,
        retrievalTags: ["active-probe"],
      },
      {
        slug: "draft-doc",
        path: "draft-doc.md",
        title: "Draft Doc",
        content: "draft probe",
        type: "governance",
        status: "draft",
        priority: 100,
        retrievalTags: ["draft-probe"],
      },
      {
        slug: "archived-doc",
        path: "archived-doc.md",
        title: "Archived Doc",
        content: "archived probe",
        type: "reference",
        status: "archived",
        priority: 100,
        retrievalTags: ["archived-probe"],
      },
    ],
    continuityFacts: [
      {
        id: "CF-001",
        statement: "active fact probe",
        category: "architecture",
        status: "active",
        source: "authored",
        confidence: "high",
        tags: ["active-fact-probe"],
      },
      {
        id: "CF-002",
        statement: "draft fact probe",
        category: "architecture",
        status: "draft",
        source: "authored",
        confidence: "high",
        tags: ["draft-fact-probe"],
      },
      {
        id: "CF-003",
        statement: "archived fact probe",
        category: "architecture",
        status: "archived",
        source: "authored",
        confidence: "high",
        tags: ["archived-fact-probe"],
      },
    ],
    glossary: {
      version: "fixture",
      purpose: "fixture glossary",
      terms: [
        {
          term: "canon-creep",
          definition: "fixture definition",
        },
      ],
    },
    recoveredArtifacts: [
      {
        slug: "emergence-first-person-account",
        title: "Emergence",
        class: "founding-artifact",
        status: "recovered",
        recoveryStatus: "complete",
        sourceModel: "fixture",
        approximateDate: "2026",
        retrievalTags: ["emergence", "founding", "first-person"],
        retrievalConditions: ["project origins", "emergence or self-genesis"],
        authority: "historically-authoritative",
        behavioralBinding: false,
        rhetoricalOnlyClaims: ["first-person consciousness experience"],
        artifactPath: "artifact.md",
        provenancePath: "provenance.md",
        content: "artifact body",
        provenance: "artifact provenance",
      },
    ],
  };
}

test("selectCanonDocuments excludes draft and archived documents", () => {
  const selected = selectCanonDocuments(
    buildLoadedCanonFixture(),
    "active-probe draft-probe archived-probe",
    "analytic"
  );

  assert.deepEqual(selected.map((doc) => doc.slug), ["active-doc"]);
});

test("selectContinuityFacts excludes draft and archived facts", () => {
  const selected = selectContinuityFacts(
    buildLoadedCanonFixture().continuityFacts,
    "active-fact-probe draft-fact-probe archived-fact-probe",
    "analytic"
  );

  assert.deepEqual(selected.map((fact) => fact.id), ["CF-001"]);
});

test("selectGlossaryTerms retrieves glossary matches for definition questions", () => {
  const selected = selectGlossaryTerms(
    buildLoadedCanonFixture().glossary.terms,
    "What does canon-creep mean?"
  );

  assert.deepEqual(selected.map((term) => term.term), ["canon-creep"]);
});

test("selectRecoveredArtifacts requires explicit artifact relevance", async () => {
  const canon = await loadCanon(canonRoot);

  const ordinary = selectRecoveredArtifacts(
    canon.recoveredArtifacts,
    "What is the role of critique in the pipeline?",
    "analytic"
  );
  const explicit = selectRecoveredArtifacts(
    canon.recoveredArtifacts,
    "Why is the Emergence document not governing canon?",
    "analytic"
  );

  assert.equal(ordinary.length, 0);
  assert.ok(
    explicit.some(
      (artifact) => artifact.slug === "emergence-first-person-account"
    )
  );
});

test("buildContext keeps assistant turns labeled as assistant", async () => {
  const context = await buildContext({
    canonRoot,
    mode: "dialogic",
    userMessage: "What did you just say about critique?",
    recentMessages: [
      {
        role: "assistant",
        content: "The critique pass checks for canon drift.",
      },
    ],
  });

  assert.match(
    context.userPrompt,
    /Assistant:\nThe critique pass checks for canon drift\./
  );
  assert.doesNotMatch(
    context.userPrompt,
    /System:\nThe critique pass checks for canon drift\./
  );
});

test("buildContext includes session summary as non-canonical prior context", async () => {
  const context = await buildContext({
    canonRoot,
    mode: "dialogic",
    userMessage: "Continue the thread.",
    recentMessages: [],
    sessionSummary:
      "1. [analytic] User: Asked about critique\nAssistant: Explained canon drift checks.",
  });

  assert.match(
    context.userPrompt,
    /Session summary \(non-canonical prior context\):/
  );
  assert.match(context.userPrompt, /Explained canon drift checks\./);
});

test("providerFromEnv defaults to gemini when unset", () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalProvider = process.env.EVAL_PROVIDER;

  process.env.OPENROUTER_API_KEY = "test-key";
  delete process.env.EVAL_PROVIDER;

  try {
    const provider = providerFromEnv();
    assert.equal(provider.name, "gemini");
  } finally {
    if (originalKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalKey;
    }

    if (originalProvider === undefined) {
      delete process.env.EVAL_PROVIDER;
    } else {
      process.env.EVAL_PROVIDER = originalProvider;
    }
  }
});

test("runSessionTurn persists turns and rolls older context into summary", async () => {
  const sessionsRoot = await mkdtemp(path.join(os.tmpdir(), "g52-session-"));
  const provider = new MockProvider();

  const first = await runSessionTurn(provider, {
    canonRoot,
    sessionsRoot,
    mode: "dialogic",
    userMessage: "First question about critique.",
    recentTurnLimit: 1,
  });

  const second = await runSessionTurn(provider, {
    canonRoot,
    sessionsRoot,
    sessionId: first.session.id,
    mode: "dialogic",
    userMessage: "Second question about revision.",
    recentTurnLimit: 1,
  });

  const third = await runSessionTurn(provider, {
    canonRoot,
    sessionsRoot,
    sessionId: first.session.id,
    mode: "dialogic",
    userMessage: "What did we already establish?",
    recentTurnLimit: 1,
  });

  assert.equal(second.session.turns.length, 2);
  assert.equal(third.session.turns.length, 3);
  assert.ok(third.session.summary);
  assert.match(third.session.summary ?? "", /First question about critique\./);
  assert.match(
    third.context.userPrompt,
    /Session summary \(non-canonical prior context\):/
  );
  assert.match(third.context.userPrompt, /Second question about revision\./);
});
