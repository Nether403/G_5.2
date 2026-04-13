# Orchestration

This package builds G_5.2 responses from canon.

## Current scope

- load canon from disk
- select relevant canon documents and continuity facts
- build context (system prompt + user prompt)
- run draft → critique → revise pipeline
- return a structured `TurnArtifacts` result

## Not in scope yet

- DB persistence
- web integration
- auth
- eval harness

## Smoke test

```bash
pnpm --filter @g52/orchestration dev
```

Runs `src/dev/smokeTest.ts` against the MockProvider with a sample question.
Outputs each pipeline pass to console so you can inspect context shape,
canon selection, and pipeline flow without hitting a real model.

## Provider wiring

Real providers (`OpenAIProvider`, `AnthropicProvider`) are stubbed.
To wire Azure OpenAI or OpenRouter, implement `generateText()` in
`src/providers/openai.ts` and `src/providers/anthropic.ts` respectively,
using credentials from `.env`.

## Pipeline shape

```
buildContext  →  draftResponse  →  critiqueResponse  →  reviseResponse  →  decideMemory
     ↓                ↓                  ↓                   ↓                  ↓
  context          draft text        critique text        final text       memory vote
```
