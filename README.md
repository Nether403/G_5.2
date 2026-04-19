# G_5.2

G_5.2 is the shared runtime and governance kernel behind two product tracks:

- `witness` — the primary mission-level consumer, backed by `packages/inquisitor-witness`
- `pes` — the secondary public-facing / educational consumer, backed by `packages/canon`

The repo is a pnpm monorepo organized around four primary surfaces:

- `packages/orchestration` — shared runtime, retrieval, persistence, memory, editorial, reflection, and product registry
- `packages/canon` — P-E-S policy root and authored persona package
- `packages/inquisitor-witness` plus `packages/witness-types` — Witness policy root plus first-slice domain types for consent and testimony
- `packages/evals` plus `apps/dashboard` — regression pressure-testing and operator-facing inspection / control surfaces

The goal is a governed, inspectable runtime whose kernel logic can serve more than one product without cross-contaminating their policy or storage roots.

Milestone implementation work through M8 is landed in the repo, including the Witness-first vertical slice. Formal v1 declaration remains an operator release decision gated by the per-release-candidate baseline capture described in [`docs/v1-release-checklist.md`](docs/v1-release-checklist.md) and [`docs/release-candidate-baseline.md`](docs/release-candidate-baseline.md).

## Authoritative Status

These documents define the current repo state and release posture:

- [`docs/system-map.md`](docs/system-map.md) — implemented subsystem map
- [`docs/release-criteria.md`](docs/release-criteria.md) — release ladder and v1 scope
- [`docs/invariants.md`](docs/invariants.md) — invariants every change must preserve
- [`g_52_project_overview_and_roadmap.md`](g_52_project_overview_and_roadmap.md) — milestone roadmap
- [`docs/product-brief.md`](docs/product-brief.md) — product framing
- [`docs/LINEAGE_AND_BOUNDARIES.md`](docs/LINEAGE_AND_BOUNDARIES.md) — repository boundary rules

If this README ever disagrees with those documents, those documents win.

## Current Scope

Implemented now:

- product-aware runtime selection through `ProductId = "pes" | "witness"`
- active policy-root retrieval with continuity facts and glossary terms; P-E-S also retrieves selectively governed recovered artifacts while Witness does not require them
- multi-pass response orchestration with provider abstraction through OpenRouter-backed providers
- session persistence, context snapshots, replay, export/import, and migration-guarded schema versioning
- selective durable memory implemented in v1 form: global/session scope, dedupe, contradiction detection, operator transitions, with longer-lived policy refinement still ahead
- Witness-first vertical slice: consent-gated inquiry turns, file-backed testimony + consent stores, structured compensation logging, and rollback on failed artifact persistence
- downstream Witness governance slice: operator-sealed testimony, approved synthesis + annotation review, and archive-candidate / publication-bundle export state inside Witness roots only
- operator dashboard for reports, diffs, inquiry sessions, memory inspection, editorial workflow, and authored-artifact workflow
- single inquiry surface with a `Witness / P-E-S` selector, Witness ID handling, consent controls, and testimony inspection
- canon / continuity-fact editorial workflow with diffable proposals, apply-on-accept, and changelog scaffolding
- reflection and authored-artifact workflow with operator approval and promote-to-proposal handoff
- subsystem-tagged evals, critical-case gating, drift-budget docs, and gold-baseline refresh tooling
- release hardening docs and seven canonical smoke paths for the v1 threshold

## Repository Layout

```text
G_5.2/
├─ apps/
│  └─ dashboard/         # operator dashboard and workflow surfaces
├─ assets/               # tracked reference images and retained branding assets
├─ docs/                 # release, ops, subsystem, and archival reference docs
├─ packages/
│  ├─ canon/             # P-E-S policy root
│  ├─ inquisitor-witness/# Witness policy root
│  ├─ orchestration/     # shared runtime, persistence, editorial, reflection, products
│  ├─ witness-types/     # Witness consent + testimony domain types
│  └─ evals/             # regression harness and report tooling
├─ scripts/
│  ├─ run-evals.ts
│  ├─ smoke-tests.ts
│  ├─ validate-canon.ts
│  └─ validate-witness.ts
├─ AGENTS.md
└─ g_52_project_overview_and_roadmap.md
```

## Getting Started

Prerequisites:

- Node `>=20`
- `pnpm >=9`

Install and verify:

```bash
pnpm install
pnpm validate:canon
pnpm validate:witness
pnpm typecheck
pnpm test
pnpm smoke
```

Run the operator dashboard:

```bash
pnpm dashboard
```

Default environment variables:

- `DASHBOARD_PORT` — dashboard port, default `5000`
- `DASHBOARD_HOST` — bind host, default `0.0.0.0`
- `OPENROUTER_API_KEY` — required for live inquiry turns
- `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT_NAME`, `AZURE_OPENAI_API_VERSION` — direct Azure OpenAI configuration for the preferred `azure` provider path
- `AZURE_OPENAI_DEFAULT_MODEL` — display/model label for the Azure deployment, typically `gpt-5.4`
- `OPENROUTER_DEFAULT_MODEL` / `OPENROUTER_OPENAI_MODEL` — OpenRouter fallback model slug; pin an exact dated slug like `openai/gpt-5.4-20260305` when you want fallback runs to be reproducible
- `OPENROUTER_SECONDARY_MODEL` — lighter OpenAI model slug, typically `openai/gpt-5.4-mini`
- `OPENROUTER_OPENAI_PROVIDER_ORDER` — OpenRouter routing preference for OpenAI fallback requests; `azure,openai` keeps Azure first without making the fallback path redundant
- `OPENROUTER_OPENAI_PROVIDER_IGNORE` — provider ignore list for OpenAI requests; `OPENROUTER_IGNORE_PROVIDERS` remains as a legacy alias
- `OPENROUTER_OPENAI_ALLOW_FALLBACKS` — whether OpenRouter may fall back beyond the preferred OpenAI provider selection
- `OPENROUTER_OPENAI_MAX_COMPLETION_TOKENS` — cap for OpenRouter OpenAI fallback completion tokens; set this below the current affordability ceiling when needed
- `EVAL_PROVIDER` — default live provider: `azure`, `openai`, `openai-secondary`, `anthropic`, or `gemini`
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` — optional direct provider keys

Primary operator surfaces:

- `/` — eval dashboard
- `/inquiry.html` — inquiry surface for both `pes` and `witness`
- `/editorial.html` — canon editorial workflow
- `/authoring.html` — reflection and authored-artifact workflow

## Runtime Data

Operator-managed runtime data lives under `data/` and is intentionally ignored by git.
That directory holds product-scoped operational state, not canonical source.

Current roots include:

- `data/inquiry-sessions/`, `data/memory-items/`, `data/canon-proposals/`, `data/reflection/`, `data/authored-artifacts/` for P-E-S and shared operator workflows
- `data/witness/sessions/`, `data/witness/memory/`, `data/witness/testimony/`, `data/witness/consent/` for Witness runtime state
- `data/witness/synthesis/`, `data/witness/annotations/`, `data/witness/archive-candidates/`, and `data/witness/publication-bundles/` for downstream Witness review and export state
  Publication bundles split metadata and emitted artifacts under `data/witness/publication-bundles/records/` and `data/witness/publication-bundles/exports/`.
  The dashboard can inspect emitted bundle artifacts directly through raw JSON and Markdown delivery endpoints, and new JSON exports use an explicit `0.2.0` publication DTO.

In Witness mode, persisted turns require both conversational and retention consent. Witness sessions and testimony must write only into Witness roots; they must not read from or write into the P-E-S session/memory roots.

Local workspace state such as `.local/`, `.playwright-cli/`, `attached_assets/`, and
editor/IDE metadata is also ignored by git and should not be treated as repo content.

Historical source material and design notes that are worth keeping but are not authoritative runtime docs live under `docs/reference/`. Retained images and branding assets live under `assets/reference/`.

## Release and Operations

For release gating and day-to-day operation, start with:

- [`docs/v1-release-checklist.md`](docs/v1-release-checklist.md)
- [`docs/operator-handbook.md`](docs/operator-handbook.md)
- [`docs/recovery-and-backups.md`](docs/recovery-and-backups.md)
- [`docs/demo-paths.md`](docs/demo-paths.md)
- [`docs/release-candidate-baseline.md`](docs/release-candidate-baseline.md)
- [`docs/post-v1-support-posture.md`](docs/post-v1-support-posture.md)
