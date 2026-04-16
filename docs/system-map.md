# G_5.2 System Map

**Status:** authoritative. This document names the official subsystems of G_5.2 and which are implemented today versus planned. The README and roadmap defer to this map for subsystem naming.

## Subsystems

| Subsystem | On disk | Status | Purpose |
|---|---|---|---|
| **Canon** | `packages/canon/` | Implemented | Source-of-truth identity layer: constitution, axioms, epistemics, constraints, voice, interaction modes, worldview, continuity facts, glossary, anti-patterns, recovered-artifacts governance, changelog. |
| **Orchestration** | `packages/orchestration/` | Implemented | Provider-agnostic turn pipeline: active-canon retrieval, `draft → critique → revise → memory decision`, provider abstraction. |
| **Evals** | `packages/evals/`, `docs/eval-discipline.md`, `docs/drift-budget.md`, `docs/gold-baseline-process.md`, `packages/evals/gold-baselines/` | Implemented (M6 expanded) | Regression harness, structured eval cases, trace capture, report generation, cross-provider drift coverage. M6 added subsystem tagging, per-subsystem scorecards in console + JSON report, merge-blocking critical-case gate (CLI exit `2`), prompt + per-subsystem dashboard diff, drift budget docs, and a gold-baseline refresh flow. |
| **Persistence** | `packages/orchestration/` (session + memory stores) | Implemented (minimal, file-backed) | Inquiry session records, rolling summaries, recent-turn carryover, durable memory items. Planned hardening is tracked under M1. |
| **Memory** | `packages/orchestration/` (memory module) | Implemented v1 | Selective durable memory with global/session scope, confirmation-based dedupe, operator delete. v2 discipline is tracked under M3. |
| **Dashboard / Operator surface** | `apps/dashboard/` | Implemented | Report viewer, diff UI, inquiry inspection (session search, turn drawer, retrieved-context drawer), memory inspection and delete. |
| **Inquiry surface** | `apps/dashboard/` (`/inquiry.html`) | Implemented v1 | Minimal operator-grade inquiry UI backed by persisted sessions. v1.5 expansion is tracked under M2. |
| **Editorial workflow** | `packages/orchestration/src/canon-proposals/`, `apps/dashboard/src/server.ts` (`/api/canon/...`), `apps/dashboard/public/editorial.html`, `data/canon-proposals/` | Implemented (M4) | First-class canon-change workflow: proposals against an allowlisted set of canon files (constitution, axioms, epistemics, constraints, voice, interaction-modes, worldview, anti-patterns, continuity-facts, glossary, manifest), continuity-fact YAML drafter with auto-assigned `CF-NNN` ids, line-level diff, `pending → accepted / rejected / needs_revision` state machine, reviewer notes + rationale + provenance, and changelog auto-scaffolding under `packages/canon/changelog/` on accept. |
| **Reflection workflow** | *not yet on disk* | Planned (M5) | Authored-artifact generation loop (draft → critique → revise) with explicit promotion path into canon. No code today. |
| **Operator studio integration** | *not yet on disk* | Planned (M7) | Unified studio bringing inquiry, editorial, reflection, memory, and eval surfaces into one operator experience. |

## Scripts and supporting layout

- `scripts/run-evals.ts` — eval runner entry point.
- `scripts/validate-canon.ts` — canon boundary validation.
- `docs/` — authoritative project documentation (this file, `release-criteria.md`, `invariants.md`, `product-brief.md`, `LINEAGE_AND_BOUNDARIES.md`, `Memory Discipline V1.md`, `decision-log/`).
- `AGENTS.md` — agent-role and pipeline rules.

## Repo structure reality check

The on-disk structure matches the tree shown in `README.md` today:

```
G_5.2/
├─ apps/dashboard/           ✓ exists
├─ packages/
│  ├─ canon/                 ✓ exists
│  ├─ orchestration/         ✓ exists
│  └─ evals/                 ✓ exists
├─ docs/                     ✓ exists
├─ scripts/                  ✓ exists
├─ AGENTS.md                 ✓ exists
└─ g_52_project_overview_and_roadmap.md   ✓ exists
```

No separate `packages/persistence`, `packages/memory`, `packages/editorial`, or `packages/reflection` packages exist yet. Persistence, memory, and the editorial canon-proposal subsystem all live inside `packages/orchestration/` (see `src/canon-proposals/` for M4). The reflection subsystem remains a roadmap item with no code yet and must not be referred to as a present capability in user-facing docs.

## Naming rules

- Use the subsystem names above in every doc, commit message, and eval category.
- Do not invent synonyms (e.g. "studio", "editor", "reflection engine") without updating this map first.
- When a subsystem is referenced as "planned", it must link back to the milestone that will introduce it.
