# G_5.2

G_5.2 is a canon-first structured inquiry runtime for a versioned authored persona.

The repo is organized around a simple baseline:
- `packages/canon` defines identity, epistemics, continuity, glossary terms, and recovered-artifact governance
- `packages/orchestration` builds turns from active canon via `draft -> critique -> revise -> memory decision`
- `packages/evals` pressure-tests the runtime and writes inspectable JSON reports
- `apps/dashboard` lets the operator inspect reports, compare diffs, and run persisted inquiries

The first goal is coherence and legibility, not theatrical complexity.

## Authoritative status

For current state and planning, the following documents are authoritative:
- [`docs/system-map.md`](docs/system-map.md) — official subsystem map (implemented vs planned).
- [`docs/release-criteria.md`](docs/release-criteria.md) — release ladder and v1 scope.
- [`docs/invariants.md`](docs/invariants.md) — four core invariants every change must preserve.
- [`g_52_project_overview_and_roadmap.md`](g_52_project_overview_and_roadmap.md) — milestone roadmap (M0 – M8).
- [`docs/product-brief.md`](docs/product-brief.md) — product framing.
- [`docs/LINEAGE_AND_BOUNDARIES.md`](docs/LINEAGE_AND_BOUNDARIES.md) — repository boundary rules.

If anything in this README appears to contradict the documents above, the documents above win.

## Current Scope

Implemented now:
- active-canon retrieval with continuity facts, glossary terms, and selectively retrieved recovered artifacts
- multi-pass response orchestration
- provider abstraction through OpenRouter-backed providers
- canon boundary validation
- eval reports with trace capture and metadata
- minimal inquiry session persistence with rolling summaries and recent-turn carryover
- selective durable memory with global/session scope, confirmation-based dedupe, and operator delete
- operator dashboard for report inspection, diffing, session inspection, and memory inspection
- minimal operator inquiry surface backed by persisted sessions, stored context snapshots, and inspectable memory
- canon / continuity-fact editorial workflow with diffable proposals, applyProposal, and changelog scaffolding (M4)
- reflection & authored-artifact workflow with draft → critique → revise → operator-approve → store, full provenance metadata, and a promote-to-canon-proposal hand-off that still routes through the editorial review path (M5)
- subsystem-tagged eval cases with per-subsystem scorecards, merge-blocking critical-case gating, drift budget docs, and a gold-baseline refresh process (M6)
- v1 release hardening: release checklist, operator handbook, recovery & backups doc, canonical demo paths with a `pnpm smoke` runner, RC baseline procedure, and a written post-v1 support posture (M8)

Not implemented yet:
- persistence & trace hardening for long-lived sessions (M1)
- inquiry surface v1.5 (M2)
- memory discipline v2 — triage, open-thread resolution, anti-pollution coverage (M3)
- operator studio integration (M7)

For v1 release gating, see [`docs/v1-release-checklist.md`](docs/v1-release-checklist.md), [`docs/operator-handbook.md`](docs/operator-handbook.md), [`docs/recovery-and-backups.md`](docs/recovery-and-backups.md), [`docs/demo-paths.md`](docs/demo-paths.md), [`docs/release-candidate-baseline.md`](docs/release-candidate-baseline.md), and [`docs/post-v1-support-posture.md`](docs/post-v1-support-posture.md).

See [`docs/system-map.md`](docs/system-map.md) for the full subsystem breakdown and [`docs/release-criteria.md`](docs/release-criteria.md) for the release ladder.

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
pnpm test
pnpm smoke
pnpm evals -- --trace
pnpm dashboard
```

Environment setup:
- copy `.env.example` to `.env`
- set `OPENROUTER_API_KEY`
- optionally set `EVAL_PROVIDER=openai|anthropic|gemini` (defaults to `gemini`)

Operator surfaces:
- reports/diff dashboard: `http://localhost:4400/`
- inquiry surface: `http://localhost:4400/inquiry.html`
- authoring surface (reflection topics, runs, authored artifacts): `http://localhost:4400/authoring.html`

## Notes

The four core invariants every change must preserve are captured in [`docs/invariants.md`](docs/invariants.md):

1. **Canon is the source of truth.**
2. **Output is not canon unless explicitly promoted** — recovered artifacts are historically authoritative and behaviorally non-binding.
3. **Memory is selective** — file-backed, inspectable, deletable, and ranked below canon, continuity, session summaries, and recent turns.
4. **Provider portability is preserved** — provider-specific logic stays behind the shared interface in `packages/orchestration/src/providers/`.

Canon changes should be versioned and recorded in `packages/canon/changelog/`, and pass through the editorial workflow once it lands in M4.


