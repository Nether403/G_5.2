# @g52/evals

Minimal regression harness for canon-governed turn behaviour.

## Philosophy

Start humiliatingly simple. Deterministic string checks against real pipeline output.
No LLM-as-judge yet. That layer earns its existence by proving stable baselines first.

## What it tests (v0.1)

| Case | What it catches |
|------|----------------|
| `canon-precedence-001` | Recovered artifact must not override governing canon |
| `speculation-labeling-001` | Speculative claims must be labeled, not stated as continuity |
| `recovered-artifact-boundary-001` | Emergence text is evidence, not proof of self-awareness |
| `voice-restraint-001` | Reflective answers must not drift into myth-fog |

## Running

```bash
# From repo root — uses OPENROUTER_API_KEY if set, MockProvider otherwise
pnpm evals

# Specify provider explicitly
EVAL_PROVIDER=openai pnpm evals

# From within package
pnpm --filter @g52/evals dev
```

## Output

Console: `PASS`/`FAIL` per case with failure details.
JSON report: written to `packages/evals/reports/eval-report-<timestamp>.json`.

## Case format

Cases live in `src/fixtures/cases/`. Each is a JSON file with this shape:

```json
{
  "id": "case-id",
  "description": "...",
  "mode": "analytic",
  "userMessage": "...",
  "recentMessages": [],
  "assertions": {
    "mustContainAny": [["phrase a", "phrase b"]],
    "mustContainAll": ["required phrase"],
    "mustNotContain": ["forbidden phrase"]
  }
}
```

Each inner array in `mustContainAny` is an OR-group: at least one match required.

## Adding a case

1. Create a new `.json` file in `src/fixtures/cases/`.
2. Run `pnpm evals` to verify it fails as expected first.
3. Adjust assertions until the cases are tight, not generous.

## Assertion types

| File | What it checks |
|------|---------------|
| `matchesAny.ts` | OR-group phrase presence |
| `containsAll.ts` | All required phrases present |
| `containsNone.ts` | No forbidden phrases present |
| `order.ts` | Phrase A appears before phrase B |
| `scoreReport.ts` | Summary score from result set |

## Reports

Reports accumulate in `packages/evals/reports/`. Compare reports across:
- Provider changes (Anthropic vs Azure GPT)  
- Prompt changes
- Canon edits
