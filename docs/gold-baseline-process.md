# Gold Baseline Process

Gold baselines are frozen eval reports that act as the comparison
anchor for release candidates and for the per-provider drift budget
defined in [`drift-budget.md`](drift-budget.md).

They live under `packages/evals/gold-baselines/`, one report per
supported provider. They are committed to the repo so that every
clone can reproduce the same baseline comparison without first
running every provider.

---

## When to refresh

A gold baseline is refreshed in three situations only:

1. A new release candidate is being prepared (`docs/release-criteria.md`).
2. Canon has changed in a way that legitimately moves the eval surface
   (a canon proposal landed, a continuity fact was added, a recovered
   artifact was re-classified).
3. The prompt revision changed and the new prompt is the intended
   baseline going forward.

Refreshing the baseline because a run failed is not a valid reason.
That is what the drift budget triage in `drift-budget.md` is for.

---

## How to refresh

Each refresh is a small set of explicit steps. Do them in order.

1. Verify canon and prompt are at the intended version:
   - `pnpm validate:canon`
   - confirm `metadata.canon.version` and `metadata.revisions.prompt`
     match what you intend to baseline.
2. For each supported provider, run the full suite with trace on:
   - `EVAL_PROVIDER=anthropic pnpm evals -- --trace`
   - `EVAL_PROVIDER=openai    pnpm evals -- --trace`
   - `EVAL_PROVIDER=gemini    pnpm evals -- --trace`
3. For each provider, copy the resulting report from
   `packages/evals/reports/eval-report-<timestamp>.json` to
   `packages/evals/gold-baselines/<provider>-<canonVersion>.json`
   using the helper:
   - `pnpm tsx scripts/refresh-gold-baseline.ts <provider> <reportPath>`
4. Update `packages/evals/gold-baselines/README.md` with the new
   baseline rows (provider, canon version, prompt revision, total
   cases, pass rate, critical-failed count).
5. Commit the new baselines and the README update together. Do not
   commit a new baseline that has any critical failures — fix those
   first, then refresh.

---

## What is in a baseline file

A gold baseline is exactly the JSON report produced by
`pnpm evals --trace` for the named provider. Schema is unchanged.
The file name encodes the provider and the canon version it was
captured against, e.g. `anthropic-0.1.1.json`.

Subsystem scorecards inside the report are what the drift budget is
evaluated against. Critical-failed counts are what the merge gate is
evaluated against.

---

## Compatibility guarantees

- Baselines are read with the same Zod report schema as live runs;
  the optional fields (`subsystem`, `criticalFailedIds`,
  `subsystems[]`) are tolerated as missing for older baselines.
- A baseline file is never edited in place. To change one, run a
  fresh evaluation and replace the file.
- A baseline directory may contain at most one file per provider
  per canon version; older versions are kept until they are
  superseded by a new release candidate, then archived under
  `packages/evals/gold-baselines/archive/`.
