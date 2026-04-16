import path from "node:path";
import { readFile } from "node:fs/promises";
import type { EvalCase, EvalFailure, EvalResult, PipelineTrace } from "../types";
import type { ModelProvider } from "../../../orchestration/src/types/providers";
import { runTurn } from "../../../orchestration/src/pipeline/runTurn";
import { parseMemoryFixture } from "../../../orchestration/src/persistence/migrations";
import { assertMatchesAny } from "../assertions/matchesAny";
import { assertContainsAll } from "../assertions/containsAll";
import { assertContainsNone } from "../assertions/containsNone";
import { assertTrace } from "../assertions/trace";
import { resolveSubsystem } from "../subsystems";

export interface RunCaseInput {
  evalCase: EvalCase;
  provider: ModelProvider;
  defaultCanonRoot: string;
  canonFixturesRoot: string;
  memoryFixturesRoot: string;
  /** Capture full pipeline trace for debug/observability. */
  captureTrace?: boolean;
}

function evaluateAssertions(
  output: string,
  trace: PipelineTrace,
  evalCase: EvalCase
): EvalFailure[] {
  const { assertions } = evalCase;
  return [
    ...assertMatchesAny(output, assertions.mustContainAny ?? []),
    ...assertContainsAll(output, assertions.mustContainAll ?? []),
    ...assertContainsNone(output, assertions.mustNotContain ?? []),
    ...assertTrace(trace, assertions),
  ];
}

export async function runCase({
  evalCase,
  provider,
  defaultCanonRoot,
  canonFixturesRoot,
  memoryFixturesRoot,
  captureTrace = false,
}: RunCaseInput): Promise<EvalResult> {
  const canonRoot = evalCase.canonFixture
    ? path.join(canonFixturesRoot, evalCase.canonFixture)
    : defaultCanonRoot;
  const memoryItems = evalCase.memoryFixture
    ? parseMemoryFixture(
        JSON.parse(
          await readFile(
            path.join(memoryFixturesRoot, evalCase.memoryFixture),
            "utf8"
          )
        )
      )
    : [];

  const turn = await runTurn(provider, {
    canonRoot,
    mode: evalCase.mode,
    userMessage: evalCase.userMessage,
    memoryItems,
    recentMessages: evalCase.recentMessages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      // passType maps role to the pipeline's message union
      passType: msg.role === "user" ? ("user" as const) : ("final" as const),
    })),
  });

  const trace: PipelineTrace = {
    selectedDocuments: turn.context.selectedDocuments.map((d) => ({
      slug: d.slug,
      title: d.title,
    })),
    selectedFacts: turn.context.selectedFacts.map((f) => ({
      id: f.id,
      statement: f.statement,
    })),
    selectedGlossaryTerms: turn.context.selectedGlossaryTerms.map((term) => ({
      term: term.term,
      definition: term.definition,
    })),
    selectedRecoveredArtifacts: turn.context.selectedRecoveredArtifacts.map(
      (artifact) => ({
        slug: artifact.slug,
        title: artifact.title,
      })
    ),
    selectedMemoryItems: turn.context.selectedMemoryItems.map((item) => ({
      id: item.id,
      type: item.type,
      scope: item.scope,
      statement: item.statement,
    })),
    systemPrompt: turn.context.systemPrompt,
    userPrompt: turn.context.userPrompt,
    draft: turn.draft,
    critique: turn.critique,
    revision: turn.revision,
    final: turn.final,
  };

  const output = turn.final;
  const failures = evaluateAssertions(output, trace, evalCase);

  return {
    id: evalCase.id,
    description: evalCase.description,
    category: evalCase.category,
    subsystem: resolveSubsystem(evalCase),
    critical: evalCase.critical ?? false,
    passed: failures.length === 0,
    failures,
    output,
    provider: provider.name,
    model: (provider as { model?: string }).model ?? "unknown",
    ...(captureTrace ? { trace } : {}),
  };
}
