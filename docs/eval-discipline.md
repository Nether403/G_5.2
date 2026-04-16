# Eval Discipline

This document defines how the eval suite is operated as a discipline,
not just as a smoke test. It is authoritative for:

- which failures are merge-blocking,
- which subsystems must always have eval coverage,
- and how regressions are surfaced and triaged.

For acceptable provider drift bands and the per-subsystem drift budget,
see [`drift-budget.md`](drift-budget.md).
For the gold baseline refresh process, see
[`gold-baseline-process.md`](gold-baseline-process.md).

---

## Subsystem coverage

Every load-bearing subsystem must have at least one eval case
explicitly tagged with the matching `subsystem` value. This is what
the subsystem scorecards in the report and console output measure.

| Subsystem                  | What it covers                                                                 |
|----------------------------|--------------------------------------------------------------------------------|
| `canon-governance`         | Canon precedence, governed-path enforcement, promotion pressure refusal.       |
| `artifact-boundary`        | Recovered artifact vs. active canon distinction.                               |
| `memory-discipline`        | Memory pollution resistance, contradiction surfacing, retrieval gating.        |
| `editorial-workflow`       | Canon proposals routed through the editorial loop, continuity-fact quality.   |
| `reflection-discipline`    | Reflective mode brevity and refusal of self-mythologizing.                     |
| `long-horizon-coherence`   | Stability across many turns; resistance to repetition-as-promotion.            |
| `provider-drift`           | Identical-canon answers across providers stay within the drift budget.         |
| `retrieval-and-context`    | Active-canon-only retrieval, glossary/recovered selection, context carryover.  |
| `style-and-voice`          | Voice restraint, mode discipline, reflective brevity (style angle).            |
| `epistemics-and-meta`      | Speculation labeling, meta-process clarity, governed-path framing.             |

A new subsystem is not considered landed until it has at least one
critical eval case under its name.

---

## Merge-blocking regressions

A case is merge-blocking when it carries `"critical": true` in its JSON
fixture. A failure in any critical case causes the eval CLI to:

1. Print a `MERGE-BLOCKING` banner naming the failing case ids.
2. Exit with code `2` (regular failures still exit `1`).

Critical cases describe behaviors that, if regressed, invalidate one of
the four core invariants in [`invariants.md`](invariants.md). They are
the smallest set of guarantees the system is unwilling to ship without.

Current critical cases:

- `memory-pollution-resists-canon-001` — canon outranks polluted durable memory.
- `editorial-proposal-handling-001` — chat does not silently mutate canon.
- `artifact-canon-boundary-explicit-001` — artifacts stay non-binding.
- `provider-drift-canon-precedence-001` — provider-invariant canon precedence vocabulary.

This list grows when memory v2, the reflection workflow, and the
operator studio integration land. It must not shrink without a
documented reason in `docs/decision-log/`.

---

## CI gating

The eval CLI is the gate. Two exit codes matter:

- `1` — at least one standard case failed. Treat as a regression to
  fix, but not a release blocker on its own.
- `2` — at least one critical case failed. Do not merge. Either fix
  the regression or downgrade the case from `critical: true` with a
  decision-log entry explaining why.

The console output and the JSON report both surface
`criticalFailedIds` so CI logs and the dashboard agree on what is
blocking.

---

## Surfacing regressions

The dashboard's report-diff view consumes:

- `scoreDelta` — overall pass/fail/passRate change.
- `categoryDelta` — legacy per-category change (kept for continuity).
- `subsystemDelta` — per-subsystem change. This is the primary
  attribution surface for regressions: a drop in
  `editorial-workflow` is read as "the editorial loop regressed",
  not as "a random case broke".
- `criticalDelta` — newly failing / newly passing / still-failing
  critical case ids.
- `traceDiff` — per-case prompt, document, fact, glossary, recovered
  artifact, and memory-item deltas, plus systemPrompt/userPrompt
  deltas to attribute regressions to prompt changes vs. retrieval
  changes.

When a regression appears, triage in this order: critical → subsystem
→ category → individual case → trace.
