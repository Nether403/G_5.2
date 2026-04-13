import type { EvalCase, EvalFailure, EvalResult } from "../types";
import type { ModelProvider } from "../../../orchestration/src/types/providers";
import { runTurn } from "../../../orchestration/src/pipeline/runTurn";
import { assertMatchesAny } from "../assertions/matchesAny";
import { assertContainsAll } from "../assertions/containsAll";
import { assertContainsNone } from "../assertions/containsNone";

export interface RunCaseInput {
  evalCase: EvalCase;
  provider: ModelProvider;
  canonRoot: string;
}

function evaluateAssertions(
  output: string,
  evalCase: EvalCase
): EvalFailure[] {
  const { assertions } = evalCase;
  return [
    ...assertMatchesAny(output, assertions.mustContainAny ?? []),
    ...assertContainsAll(output, assertions.mustContainAll ?? []),
    ...assertContainsNone(output, assertions.mustNotContain ?? []),
  ];
}

export async function runCase({
  evalCase,
  provider,
  canonRoot,
}: RunCaseInput): Promise<EvalResult> {
  const turn = await runTurn(provider, {
    canonRoot,
    mode: evalCase.mode,
    userMessage: evalCase.userMessage,
    recentMessages: evalCase.recentMessages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      // passType maps role to the pipeline's message union
      passType: msg.role === "user" ? ("user" as const) : ("final" as const),
    })),
  });

  const output = turn.final;
  const failures = evaluateAssertions(output, evalCase);

  return {
    id: evalCase.id,
    description: evalCase.description,
    passed: failures.length === 0,
    failures,
    output,
    provider: provider.name,
    // model: not yet on TurnArtifacts — tracked for v0.2
    model: (provider as { model?: string }).model ?? "unknown",
  };
}
