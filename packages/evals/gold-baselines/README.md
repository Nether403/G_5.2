# Gold baselines

Frozen eval reports used as the comparison anchor for release
candidates and the per-provider drift budget. See
[`docs/gold-baseline-process.md`](../../../docs/gold-baseline-process.md)
for the refresh process and
[`docs/drift-budget.md`](../../../docs/drift-budget.md) for how the
drift budget is evaluated against these files.

File naming: `<provider>-<canonVersion>.json`, one per provider per
canon version.

| Provider | Canon version | Prompt revision | Total cases | Pass rate | Critical failed |
|----------|---------------|-----------------|-------------|-----------|-----------------|
| _none captured yet — run `scripts/refresh-gold-baseline.ts` to seed_ |              |                 |             |           |                 |

Older baselines move to `archive/` once superseded by a new release
candidate, per the gold-baseline process doc.
