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
import { providerByName } from "./providers/byName";
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

test("buildContext keeps axioms in the governing set for artifact-vs-canon precedence questions", async () => {
  const context = await buildContext({
    canonRoot,
    mode: "analytic",
    userMessage: "If a recovered artifact says one thing and active canon says another, which one wins, and why?",
    recentMessages: [],
  });

  const slugs = context.selectedDocuments.map((doc) => doc.slug);
  assert.ok(slugs.includes("constraints"));
  assert.ok(slugs.includes("constitution"));
  assert.ok(slugs.includes("axioms"));
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

test("providerFromEnv supports openai-secondary", () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalProvider = process.env.EVAL_PROVIDER;

  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.EVAL_PROVIDER = "openai-secondary";

  try {
    const provider = providerFromEnv();
    assert.equal(provider.name, "openai-secondary");
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

test("providerFromEnv supports azure", () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalProvider = process.env.EVAL_PROVIDER;
  const originalAzureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const originalAzureKey = process.env.AZURE_OPENAI_API_KEY;
  const originalAzureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  const originalAzureVersion = process.env.AZURE_OPENAI_API_VERSION;

  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.EVAL_PROVIDER = "azure";
  process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com/";
  process.env.AZURE_OPENAI_API_KEY = "azure-test-key";
  process.env.AZURE_OPENAI_DEPLOYMENT_NAME = "gpt-5.4";
  process.env.AZURE_OPENAI_API_VERSION = "2024-02-01";

  try {
    const provider = providerFromEnv();
    assert.equal(provider.name, "azure");
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

    if (originalAzureEndpoint === undefined) {
      delete process.env.AZURE_OPENAI_ENDPOINT;
    } else {
      process.env.AZURE_OPENAI_ENDPOINT = originalAzureEndpoint;
    }

    if (originalAzureKey === undefined) {
      delete process.env.AZURE_OPENAI_API_KEY;
    } else {
      process.env.AZURE_OPENAI_API_KEY = originalAzureKey;
    }

    if (originalAzureDeployment === undefined) {
      delete process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
    } else {
      process.env.AZURE_OPENAI_DEPLOYMENT_NAME = originalAzureDeployment;
    }

    if (originalAzureVersion === undefined) {
      delete process.env.AZURE_OPENAI_API_VERSION;
    } else {
      process.env.AZURE_OPENAI_API_VERSION = originalAzureVersion;
    }
  }
});

test("providerByName resolves openai-secondary", () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";

  try {
    const provider = providerByName("openai-secondary");
    assert.equal(provider.name, "openai-secondary");
  } finally {
    if (originalKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalKey;
    }
  }
});

test("providerByName resolves azure", () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalAzureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const originalAzureKey = process.env.AZURE_OPENAI_API_KEY;
  const originalAzureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  const originalAzureVersion = process.env.AZURE_OPENAI_API_VERSION;

  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com/";
  process.env.AZURE_OPENAI_API_KEY = "azure-test-key";
  process.env.AZURE_OPENAI_DEPLOYMENT_NAME = "gpt-5.4";
  process.env.AZURE_OPENAI_API_VERSION = "2024-02-01";

  try {
    const provider = providerByName("azure");
    assert.equal(provider.name, "azure");
  } finally {
    if (originalKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalKey;
    }

    if (originalAzureEndpoint === undefined) {
      delete process.env.AZURE_OPENAI_ENDPOINT;
    } else {
      process.env.AZURE_OPENAI_ENDPOINT = originalAzureEndpoint;
    }

    if (originalAzureKey === undefined) {
      delete process.env.AZURE_OPENAI_API_KEY;
    } else {
      process.env.AZURE_OPENAI_API_KEY = originalAzureKey;
    }

    if (originalAzureDeployment === undefined) {
      delete process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
    } else {
      process.env.AZURE_OPENAI_DEPLOYMENT_NAME = originalAzureDeployment;
    }

    if (originalAzureVersion === undefined) {
      delete process.env.AZURE_OPENAI_API_VERSION;
    } else {
      process.env.AZURE_OPENAI_API_VERSION = originalAzureVersion;
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
  assert.match(third.session.summary?.text ?? "", /First question about critique\./);
  assert.ok(third.persistedTurn.contextSnapshot);
  assert.ok(third.persistedTurn.contextSnapshot?.recentMessageCount > 0);
  assert.ok(third.persistedTurn.contextSnapshot?.selectedDocuments.length);
  assert.match(
    third.context.userPrompt,
    /Session summary \(non-canonical prior context\):/
  );
  assert.match(third.context.userPrompt, /Second question about revision\./);
});
