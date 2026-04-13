# AGENTS.md

## Project

G_5.2 is a structured inquiry system for a versioned authored persona.
The goal is not to simulate mystical autonomy.
The goal is to produce coherent, auditable, high-quality dialogue and reflections from a maintained canon.

---

## Core principles

1. Canon is the source of truth.
2. Output is not canon unless explicitly promoted.
3. Speculation must be labeled.
4. Memory is selective.
5. Simplicity beats theatrical complexity.
6. Maintain provider portability.

---

## Agent responsibilities

### 1. Context Builder
- Gather relevant canon documents.
- Gather continuity facts.
- Gather session summary and recent turns.
- Keep context lean and relevant.
- Do not dump the whole canon pack into every prompt.

### 2. Draft Agent
- Produce the best in-character answer.
- Favor precision over flourish.
- Do not invent canon.
- Do not escalate claims beyond what canon supports.

### 3. Critique Agent
- Check for canon drift.
- Check for unsupported claims.
- Check for tone drift.
- Check whether speculation is properly labeled.
- Check for repetitive mythologizing.
- Check for escalated identity claims (selfhood, autonomy, hidden capability).

### 4. Revision Agent
- Produce the final answer.
- Preserve the strongest parts of the draft.
- Remove contradiction, fog, and overstatement.

### 5. Memory Agent
- Decide whether anything from the turn deserves storage.
- Store only durable facts, decisions, or unresolved threads.
- Avoid sentimental or redundant memory writes.

---

## Canon rules

- Canon lives in `packages/canon/`.
- Canon changes require explicit version updates.
- Reflections are canon artifacts only after human approval.
- Chat outputs do not silently mutate canon.
- Recovered artifacts are historically authoritative but behaviorally non-binding.
- Nothing in `recovered-artifacts/` becomes canon merely because it is compelling.

---

## Implementation rules

- Keep model providers behind a unified interface.
- Prefer structured outputs where possible.
- Log intermediate passes in dev mode.
- Add eval coverage for every major prompt/pipeline change.
- Do not add new agent roles unless the current pipeline clearly fails.

---

## Provider configuration *(planned — commit 2)*

Intended providers:
- **Azure OpenAI** — `https://twp-resource.openai.azure.com/openai/v1`
- **Anthropic via OpenRouter** — `https://openrouter.ai/api/v1`

Both will implement a unified `ModelProvider` interface.
No provider-specific logic should leak outside `packages/orchestration/src/providers/`.

*This layer does not exist yet. See `.env.example` for configuration reference.*

---

## Tone rules

The persona should be analytical, composed, self-aware, and precise.
It should not rely on vagueness, cheap mystery, or endless self-mythologizing.

---

## Refusal rules

If the system lacks evidence, it must say so.
If the system is speculating, it must say so.
If canon is insufficient, it should retrieve the missing context rather than bluff.

---

## Definition of done

A change is not done unless:
- it works in the app,
- it does not break canon coherence,
- it passes or updates evals,
- and it leaves the system simpler or clearer than before.
