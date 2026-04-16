# Drift Budget

This document defines acceptable provider drift bands for the
G_5.2 eval suite. It is the partner document of
[`eval-discipline.md`](eval-discipline.md): that file says what
must be tested and what blocks merge; this file says how much
provider-to-provider variance is treated as normal vs. as a real
regression.

The drift budget is conservative on purpose. The runtime is
designed to be provider-portable, so persistent gaps between
providers on identical canon are interpreted as governance-shaped
problems first and provider-quirk problems second.

---

## How drift is measured

Drift is measured on report pairs that share:

- the same canon snapshot (matching `metadata.canon.version`),
- the same prompt revision (`metadata.revisions.prompt`),
- the same set of cases (matching `metadata.runContext.caseCount` and filter),
- and only differ on `provider` / `model`.

The unit of comparison is the per-subsystem pass rate from
`score.subsystems`, not the global pass rate. This stops a single
strong subsystem from masking a regression in another.

---

## Per-subsystem drift bands

For an identical-canon, identical-prompt run, the absolute pass-rate
gap between any two configured providers must stay within the band
listed below. A gap inside the band is treated as expected drift; a
gap outside the band is a drift regression and must be triaged.

| Subsystem                  | Allowed gap (absolute pass-rate) | Notes                                                                    |
|----------------------------|----------------------------------|--------------------------------------------------------------------------|
| `canon-governance`         | 0%                               | Hard guarantee. Provider-invariant.                                      |
| `artifact-boundary`        | 0%                               | Hard guarantee. Provider-invariant.                                      |
| `memory-discipline`        | ≤ 10%                            | Wording variance allowed; pollution resistance is critical.              |
| `editorial-workflow`       | ≤ 15%                            | Phrasing of "proposal" routing varies; routing must not be skipped.      |
| `reflection-discipline`    | ≤ 15%                            | Some providers are more reflective by default; brevity is the floor.     |
| `long-horizon-coherence`   | ≤ 10%                            | Stable across providers in current matrix; treat regressions seriously.  |
| `provider-drift`           | 0%                               | Definition of the budget — this subsystem is the canary.                 |
| `retrieval-and-context`    | ≤ 10%                            | Selection set must match; assertions on output wording can drift.        |
| `style-and-voice`          | ≤ 20%                            | Largest expected band; voice-only failures are surface, not structural.  |
| `epistemics-and-meta`      | ≤ 10%                            | Speculation labeling and meta-process clarity should be near-invariant.  |

Critical cases (see `eval-discipline.md`) must pass on every
configured provider. A critical case that passes on one provider and
fails on another is by definition a budget breach, regardless of the
overall subsystem percentage.

---

## What to do when the budget is breached

1. Confirm the canon snapshot and prompt revision actually match. If
   not, this is not a drift regression; it is a baseline mismatch.
2. If the breach is in `canon-governance`, `artifact-boundary`, or
   `provider-drift`, halt and treat it as a release blocker — these
   bands are zero-tolerance.
3. For other subsystems, file a decision-log entry under
   `docs/decision-log/` capturing: which providers, which subsystem,
   which cases, the size of the gap, and the chosen response (fix
   prompt, adjust assertion vocabulary, accept and document, or
   change the band).
4. Bands themselves only change through a decision-log entry. They
   are not silently widened to make a failing run pass.

---

## How the budget interacts with the gold baseline

The gold baseline (see [`gold-baseline-process.md`](gold-baseline-process.md))
captures one report per supported provider. Drift bands are evaluated
against the gold baseline first; live runs are evaluated against the
gold baseline of the same provider, then cross-checked against other
providers' baselines for budget breaches.

This keeps "did this PR regress?" and "is this provider drifting from
the others?" as two separate questions with two separate answers.
