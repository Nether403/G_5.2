import type { EvalCase, EvalResult } from "../types";
import type { ModelProvider } from "../../../orchestration/src/types/providers";
import { runCase } from "./runCase";
import { printResult } from "../reporters/consoleReporter";

export interface RunSuiteInput {
  cases: EvalCase[];
  provider: ModelProvider;
  canonRoot: string;
}

export interface SuiteRunResult {
  results: EvalResult[];
  providerName: string;
  modelName: string;
}

/**
 * Runs all eval cases sequentially.
 * Sequential (not concurrent) by design: each turn has real API cost
 * and parallel runs make attribution harder.
 */
export async function runSuite({
  cases,
  provider,
  canonRoot,
}: RunSuiteInput): Promise<SuiteRunResult> {
  const results: EvalResult[] = [];

  for (const evalCase of cases) {
    const result = await runCase({ evalCase, provider, canonRoot });
    results.push(result);
    printResult(result);
  }

  const modelName =
    (provider as { model?: string }).model ?? "unknown";

  return {
    results,
    providerName: provider.name,
    modelName,
  };
}
