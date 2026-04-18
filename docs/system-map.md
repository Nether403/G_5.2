# G_5.2 System Map

**Status:** authoritative. This document names the official subsystems of G_5.2 and which are implemented today versus planned. The README and roadmap defer to this map for subsystem naming.

## Subsystems

| Subsystem | On disk | Status | Purpose |
|---|---|---|---|
| **P-E-S policy root** | `packages/canon/` | Implemented | P-E-S source-of-truth identity layer: constitution, axioms, epistemics, constraints, voice, interaction modes, interaction-modes reference, worldview, continuity facts, glossary, anti-patterns, anti-patterns reference, recovered-artifacts governance, changelog. |
| **Witness policy root** | `packages/inquisitor-witness/` | Implemented | Witness source-of-truth policy layer: constitution, constraints, questioning modes, synthesis policy, consent policy, archive-publication policy, continuity facts, glossary. Uses the shared policy-root contract but does not require recovered artifacts. |
| **Product registry & routing** | `packages/orchestration/src/products.ts`, `apps/dashboard/src/server.ts`, `apps/dashboard/public/inquiry.html` | Implemented | Product-aware selection of `pes` or `witness`, mapping each product to its policy root, session root, memory root, and dashboard capability boundaries. |
| **Orchestration** | `packages/orchestration/` | Implemented | Provider-agnostic shared turn pipeline: active-policy retrieval, `draft → critique → revise → memory decision`, provider abstraction. |
| **Evals** | `packages/evals/`, `docs/eval-discipline.md`, `docs/drift-budget.md`, `docs/gold-baseline-process.md`, `packages/evals/gold-baselines/` | Implemented (M6 expanded) | Regression harness, structured eval cases, trace capture, report generation, cross-provider drift coverage. M6 added subsystem tagging, per-subsystem scorecards in console + JSON report, merge-blocking critical-case gate (CLI exit `2`), prompt + per-subsystem dashboard diff, drift budget docs, and a gold-baseline refresh flow. |
| **Persistence** | `packages/orchestration/` (session + memory stores) | Implemented (M1, file-backed) | Inquiry session records, rolling summaries, recent-turn carryover, context snapshots, replay/export/import, and schema-versioned migrations for long-lived sessions. |
| **Witness domain & persistence** | `packages/witness-types/`, `apps/dashboard/src/witnessRuntime.ts`, `apps/dashboard/src/witness/` | Implemented | First-slice Witness consent and testimony types, file-backed consent/testimony stores, testimony append/rollback handling, and structured compensation logging around failed persistence. |
| **Memory** | `packages/orchestration/` (memory module) | Implemented (M3) | Typed durable memory with global/session scope, explicit lifecycle states, conflict checks, `open_thread` resolution, operator transitions, and anti-pollution eval coverage. |
| **Dashboard / Operator surface** | `apps/dashboard/` | Implemented (M7 integrated) | Report viewer, diff UI, inquiry inspection (session search, turn drawer, retrieved-context drawer), memory inspection and lifecycle controls, plus links into editorial and authoring surfaces. |
| **Inquiry surface** | `apps/dashboard/` (`/inquiry.html`) | Implemented (M2, Witness-first extended) | Operator-grade inquiry UI with session search, richer turn navigation, product selector, Witness ID handling, consent controls, testimony inspection, and live turn execution backed by product-scoped persisted sessions. |
| **Editorial workflow** | `packages/orchestration/src/canon-proposals/`, `apps/dashboard/src/server.ts` (`/api/canon/...`), `apps/dashboard/public/editorial.html`, `data/canon-proposals/` | Implemented (M4) | First-class canon-change workflow: proposals against an allowlisted set of canon files (constitution, axioms, epistemics, constraints, voice, interaction-modes, interaction-modes-reference, worldview, anti-patterns, anti-patterns-reference, continuity-facts, glossary, manifest), continuity-fact YAML drafter with auto-assigned `CF-NNN` ids, line-level diff, `pending → accepted / rejected / needs_revision` state machine, reviewer notes + rationale + provenance, and changelog auto-scaffolding under `packages/canon/changelog/` on accept. |
| **Reflection workflow** | `packages/orchestration/src/reflection/`, `apps/dashboard/public/authoring.html`, `data/reflection/`, `data/authored-artifacts/` | Implemented (M5) | Authored-artifact loop (draft → critique → revise → operator-approve → store) with provenance metadata and a promote-to-canon-proposal hand-off that still routes through the editorial review path. |
| **Operator studio integration** | `apps/dashboard/public/index.html`, `apps/dashboard/public/inquiry.html`, `apps/dashboard/public/editorial.html`, `apps/dashboard/public/authoring.html`, `apps/dashboard/src/server.ts` | Implemented (M7) | Unified operator surface bringing inquiry, editorial, reflection, memory, and eval workflows into one coherent dashboard-served experience. |
| **Release hardening & v1 threshold** | `docs/v1-release-checklist.md`, `docs/operator-handbook.md`, `docs/recovery-and-backups.md`, `docs/demo-paths.md`, `docs/release-candidate-baseline.md`, `docs/post-v1-support-posture.md`, `scripts/smoke-tests.ts` | Implemented (M8 capability layer) | Release gate docs, operator handbook, recovery/backups guidance, demo-path smoke coverage, RC baseline procedure, and post-v1 support posture. Formal v1 declaration still depends on per-RC baseline capture and operator sign-off. |

## Scripts and supporting layout

- `scripts/run-evals.ts` — eval runner entry point.
- `scripts/validate-canon.ts` — P-E-S policy-root validation.
- `scripts/validate-witness.ts` — Witness policy-root validation.
- `docs/` — authoritative project documentation plus retained archival references under `docs/reference/`.
- `assets/reference/` — tracked retained images and branding assets.
- `AGENTS.md` — agent-role and pipeline rules.

## Repo structure reality check

The on-disk structure matches the tree shown in `README.md` today:

```
G_5.2/
├─ apps/dashboard/           ✓ exists
├─ packages/
│  ├─ canon/                 ✓ exists
│  ├─ inquisitor-witness/    ✓ exists
│  ├─ orchestration/         ✓ exists
│  ├─ witness-types/         ✓ exists
│  └─ evals/                 ✓ exists
├─ docs/                     ✓ exists
├─ scripts/                  ✓ exists
├─ AGENTS.md                 ✓ exists
└─ g_52_project_overview_and_roadmap.md   ✓ exists
```

No separate `packages/persistence`, `packages/memory`, `packages/editorial`, or `packages/reflection` packages exist. Persistence, memory, editorial, and reflection all live inside `packages/orchestration/`, while Witness consent/testimony authority lives in `packages/witness-types/` and the integrated operator surfaces live in `apps/dashboard/`.

## Naming rules

- Use the subsystem names above in every doc, commit message, and eval category.
- Do not invent synonyms (e.g. "studio", "editor", "reflection engine") without updating this map first.
- When a subsystem is referenced as "planned", it must link back to the milestone that will introduce it.
