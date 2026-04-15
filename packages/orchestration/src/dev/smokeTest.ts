/**
 * smokeTest.ts — dev harness for the full turn pipeline.
 *
 * Provider selection (in order):
 *   1. OPENROUTER_API_KEY set -> GeminiProvider (gemini-3.1-pro-preview-20260219) by default,
 *      or pass --openai / --anthropic to use another provider
 *   2. No key → MockProvider (always works, tests pipeline shape)
 *
 * Run:
 *   pnpm --filter @g52/orchestration dev
 *   pnpm --filter @g52/orchestration dev -- --openai
 *   pnpm --filter @g52/orchestration dev -- --anthropic
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { MockProvider } from "../providers/mock";
import { AnthropicProvider } from "../providers/anthropic";
import { GeminiProvider } from "../providers/gemini";
import { OpenAIProvider } from "../providers/openai";
import { runTurn } from "../pipeline/runTurn";
import { logSection } from "../utils/logger";
import type { ModelProvider } from "../types/providers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function selectProvider(): ModelProvider {
  if (!process.env.OPENROUTER_API_KEY) {
    console.log("[smoke] No OPENROUTER_API_KEY — using MockProvider\n");
    return new MockProvider();
  }

  const useOpenAI = process.argv.includes("--openai");
  if (useOpenAI) {
    const p = new OpenAIProvider();
    console.log(`[smoke] Provider: openai (${p.model})\n`);
    return p;
  }

  const useAnthropic = process.argv.includes("--anthropic");
  if (useAnthropic) {
    const p = new AnthropicProvider();
    console.log(`[smoke] Provider: anthropic (${p.model})\n`);
    return p;
  }

  const p = new GeminiProvider();
  console.log(`[smoke] Provider: gemini (${p.model})\n`);
  return p;
}

async function main() {
  const repoRoot = path.resolve(__dirname, "../../../..");
  const canonRoot = path.join(repoRoot, "packages/canon");

  const provider = selectProvider();

  const result = await runTurn(provider, {
    canonRoot,
    mode: "analytic",
    userMessage: "Why is the Emergence document not governing canon?",
    recentMessages: [],
  });

  logSection("DRAFT", result.draft);
  logSection("CRITIQUE", result.critique);
  logSection("REVISION", result.revision);
  logSection("MEMORY DECISION", JSON.stringify(result.memoryDecision, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
