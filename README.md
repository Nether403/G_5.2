# G_5.2

G_5.2 is a canon-first structured inquiry runtime for a versioned authored persona.

The repo is organized around a simple baseline:
- `packages/canon` defines identity, epistemics, continuity, glossary terms, and recovered-artifact governance
- `packages/orchestration` builds turns from active canon via `draft -> critique -> revise`
- `packages/evals` pressure-tests the runtime and writes inspectable JSON reports
- `apps/dashboard` lets the operator inspect reports and compare diffs

The first goal is coherence and legibility, not theatrical complexity.

## Current Scope

Implemented now:
- active-canon retrieval with continuity facts, glossary terms, and selectively retrieved recovered artifacts
- multi-pass response orchestration
- provider abstraction through OpenRouter-backed providers
- canon boundary validation
- eval reports with trace capture and metadata
- minimal inquiry session persistence with rolling summaries and recent-turn carryover
- operator dashboard for report inspection and diffing

Not implemented yet:
- live chat/session product surface
- governed memory storage
- canon proposal/editorial workflow

## Repo Structure

```text
G_5.2/
├─ apps/
│  └─ dashboard/         # operator report viewer + diff UI
├─ docs/
│  ├─ decision-log/
│  └─ product-brief.md
├─ packages/
│  ├─ canon/             # source-of-truth identity layer
│  ├─ orchestration/     # provider-agnostic turn pipeline
│  └─ evals/             # regression harness + reports
├─ scripts/
│  ├─ run-evals.ts
│  └─ validate-canon.ts
├─ AGENTS.md
└─ g_52_project_overview_and_roadmap.md
```

## Bootstrap

Prerequisites:
- Node `>=20`
- `pnpm >=9`

Install and verify:

```bash
npm install -g pnpm@9
pnpm install
pnpm validate:canon
pnpm typecheck
pnpm evals -- --trace
pnpm dashboard
```

Environment setup:
- copy `.env.example` to `.env`
- set `OPENROUTER_API_KEY`
- optionally set `EVAL_PROVIDER=openai|anthropic|gemini` (defaults to `gemini`)

## Notes

- Recovered artifacts are historically authoritative and behaviorally non-binding.
- Output does not become canon unless explicitly promoted.
- Canon changes should be versioned and recorded in `packages/canon/changelog/`.

