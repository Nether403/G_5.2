# G_5.2 Release-Candidate Baseline Procedure

**Status:** authoritative procedure for capturing release-candidate baseline eval reports across all configured providers (M8). Runs at every release-candidate commit.

The point of this procedure is to leave behind a stored, schema-validated, critical-case-clean eval report for every provider the operator considers in scope, and to promote each into the gold baseline directory so future drift is measurable.

## 1. Preconditions

Before starting:

- [ ] Working tree is clean (no uncommitted edits to canon, prompts, or pipeline).
- [ ] `pnpm install && pnpm validate:canon && pnpm validate:witness && pnpm typecheck && pnpm test && pnpm smoke` all pass on the candidate commit.
- [ ] `OPENROUTER_API_KEY` is set in the shell.
- [ ] You know which providers are in scope. As of v1, the supported set is `anthropic`, `openai`, `gemini`. Anything else needs a separate decision.

## 2. Per-provider RC run

For each provider in scope, run:

```bash
EVAL_PROVIDER=<provider> pnpm evals -- --trace
```

What to expect:

- The runner prints `[evals] Provider: <name> (<model>)`.
- The full case suite executes sequentially.
- Console output includes the summary, the per-subsystem scorecard, and the per-category breakdown.
- A report file is written to `packages/evals/reports/eval-report-<timestamp>.json`.
- Exit codes:
  - `0` — clean
  - `1` — non-critical failures
  - `2` — critical (merge-blocking) failures

If exit code is `2`: stop. Investigate the failure. Critical-case regressions must be either fixed or explicitly accepted as a release-blocking deviation before promotion.

If exit code is `1`: review the failures against `docs/drift-budget.md`. Decide whether each is within the band or needs attention. Record the decision in the release notes.

## 3. Capture

Record the report path returned by the runner. Suggested layout for release-candidate notes:

```
docs/release-notes/v1-rc-<date>.md
- canon version: <version>
- prompt revision: <revision>
- pipeline revision: <revision>
- commit SHA: <sha>
- anthropic: packages/evals/reports/eval-report-<ts>.json (passed N/M, critical clean)
- openai:    packages/evals/reports/eval-report-<ts>.json (passed N/M, critical clean)
- gemini:    packages/evals/reports/eval-report-<ts>.json (passed N/M, critical clean)
```

(The release-notes directory is operator-managed; create it on first use.)

## 4. Promote each provider's baseline

After all in-scope providers are critical-case clean:

```bash
pnpm tsx scripts/refresh-gold-baseline.ts anthropic packages/evals/reports/eval-report-<ts-anthropic>.json
pnpm tsx scripts/refresh-gold-baseline.ts openai    packages/evals/reports/eval-report-<ts-openai>.json
pnpm tsx scripts/refresh-gold-baseline.ts gemini    packages/evals/reports/eval-report-<ts-gemini>.json
```

The script:
- Validates the report against the persisted eval-report schema.
- Refuses promotion if `score.criticalFailedIds` is non-empty.
- Reads the report's `metadata.canon.version`.
- Writes the file as `packages/evals/gold-baselines/<provider>-<canonVersion>.json`.
- Archives any older same-provider baseline at a different canon version into `packages/evals/gold-baselines/archive/`.

After promotion, update `packages/evals/gold-baselines/README.md` with the new row (provider, canon version, prompt revision, pass count, date) and commit:

```bash
git add packages/evals/reports/eval-report-*.json
git add packages/evals/gold-baselines/
git commit -m "evals(rc): capture v1-rc baseline across providers"
```

## 5. Cross-provider drift review

With three fresh baselines on disk, walk the dashboard:

1. `pnpm dashboard`.
2. `/` → choose two reports → diff.
3. Confirm subsystem and prompt deltas render.
4. Compare each provider against the previous gold baseline (now archived). Per `docs/drift-budget.md`, drift inside the bands is acceptable; drift outside requires either a fix or an explicit accept.

Capture the review in the release notes file (§ 3) with one paragraph per provider.

## 6. Sign the release gate

When all three providers are clean, baselines are promoted, README updated, and drift reviewed:

1. Re-walk `docs/v1-release-checklist.md`. Section K should now be all `[x]` for the in-scope providers.
2. Add a changelog entry under `packages/canon/changelog/NNNN-v1-release-gate.md` referencing this run, the checklist, and the release-notes file.
3. Tag the commit (operator's choice of tag scheme).

## 7. If a baseline cannot be captured

If a provider is genuinely unavailable (account / network / quota), do not fake a baseline. Either:

- Delay the release until it can be captured, or
- Drop the provider from the in-scope set for this RC and document the choice in the release notes. Provider portability (invariant 4) is about *capability*, not about *coverage at every release* — a release can ship without one provider's baseline as long as the omission is explicit.

The mock provider is **not** an acceptable substitute for any real-provider baseline at the release gate. It is for smoke testing only.

## 8. Cadence

This procedure runs:

- At every release-candidate commit.
- After any change to canon body, prompts, pipeline revision, or provider model defaults.
- Manually, when the operator wants a fresh drift snapshot (e.g., after upstream model updates).

It does *not* need to run on every PR; the eval suite already runs on demand and the merge-blocking gate already catches critical regressions.
