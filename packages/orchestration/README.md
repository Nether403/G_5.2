# Orchestration

This package builds G_5.2 turns from canon.

## Current Scope

- load canon, glossary terms, and recovered-artifact metadata from disk
- validate the canon boundary before any turn runs
- retrieve active canon documents and active continuity facts only
- retrieve glossary terms when the query is definition-oriented
- retrieve recovered artifacts only when the query explicitly concerns lineage/founding material
- build a governed system prompt
- run `draft -> critique -> revise -> memory decision`
- persist inquiry sessions to disk with recent-turn carryover and rolling summaries
- return structured turn artifacts for evals and operator tooling

## Not In Scope Yet

- inquiry UI / live chat surface
- governed memory storage
- canon proposal workflow

## Smoke Test

```bash
pnpm --filter @g52/orchestration dev
pnpm --filter @g52/orchestration dev -- --openai
pnpm --filter @g52/orchestration dev -- --anthropic
```

With no `OPENROUTER_API_KEY`, the smoke test falls back to `MockProvider`.

## Provider Wiring

Current provider classes:
- `OpenAIProvider` -> OpenRouter (`openai/gpt-5.4` by default)
- `AnthropicProvider` -> OpenRouter (`anthropic/claude-sonnet-4.6` by default)
- `GeminiProvider` -> OpenRouter (`google/gemini-3.1-pro-preview-20260219` by default)
- `MockProvider` -> deterministic local fallback for offline/dev inspection

Provider selection is environment-driven via `providerFromEnv()`, with Gemini as the default preference when `EVAL_PROVIDER` is unset.

## Pipeline Shape

```text
buildContext -> draftResponse -> critiqueResponse -> reviseResponse -> decideMemory
```

Session persistence now sits one layer above the core turn pipeline through `runSessionTurn()`. Governed long-term memory remains a separate concern.

