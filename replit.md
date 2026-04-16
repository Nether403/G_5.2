# G_5.2 — Structured Inquiry Runtime

## Overview

G_5.2 is a canon-first structured inquiry runtime for a versioned authored persona. It is a governed system where identity, rules, and memory are explicitly defined and enforced through a multi-pass orchestration pipeline — designed to resist "assistant mush" and maintain epistemic integrity.

## Architecture

This is a **pnpm monorepo** using **Turborepo** for task orchestration.

### Apps
- `apps/dashboard/` — Operator-facing web dashboard (Node.js HTTP server, no external deps)

### Packages
- `packages/canon/` — Source-of-truth identity layer (markdown/YAML persona definitions)
- `packages/orchestration/` — Core runtime pipeline (loadCanon → retrieval → draft → critique → revise → memory decision)
- `packages/evals/` — Regression testing harness

### Scripts
- `scripts/validate-canon.ts` — Validates canon files against Zod schemas
- `scripts/run-evals.ts` — Runs evaluation suite and generates reports

## Technology Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript
- **Package Manager:** pnpm 9+ (workspaces)
- **Build Tool:** Turborepo
- **Execution:** tsx (TypeScript runner)
- **Validation:** Zod
- **AI Providers:** OpenRouter (Anthropic, OpenAI, Gemini)

## Running the Project

The **"Start application"** workflow runs the operator dashboard:
```
tsx apps/dashboard/src/server.ts
```

The dashboard runs on port **5000** (bound to `0.0.0.0` for Replit preview).

### Dashboard Endpoints
- `GET /` — Eval dashboard HTML
- `GET /inquiry.html` — Inquiry UI
- `GET /api/reports` — List eval reports
- `GET /api/reports/:name` — Full report JSON
- `GET /api/diff?a=:name&b=:name` — Diff between two reports
- `GET /api/inquiry/sessions` — List inquiry sessions
- `GET /api/inquiry/sessions/:id` — Full session JSON
- `POST /api/inquiry/turn` — Run a new inquiry turn
- `GET /api/memory` — List durable memory items (filter by `state`, `type`, `scope`, `sessionId`)
- `POST /api/memory` — Operator-create a memory item (defaults to `proposed` for classes needing approval)
- `PATCH /api/memory/:id` — Edit a non-terminal memory item
- `POST /api/memory/:id/:action` — State transitions (`approve` | `reject` | `resolve` | `archive` | `supersede`)
- `GET /api/memory/conflicts` — Preview duplicate/contradiction conflicts for a candidate
- `DELETE /api/memory/:id` — Hard-delete a memory item

## Memory discipline v2 (M3)

- Typed item classes: `user_preference`, `project_decision`, `open_thread`,
  `session_context`, `operator_note`, `rejected_candidate`.
- Explicit state machine (`proposed → accepted | rejected`, `accepted →
  superseded | resolved | archived`). `rejected` and `archived` are terminal.
  `resolve` is gated to `open_thread` only.
- Every item carries provenance (`origin`: `turn` | `operator` | `import`;
  `createdFrom`, `lastConfirmedFrom`, plus per-transition timestamps/reasons
  and `supersedes`/`supersededBy` links).
- Only `accepted` items are retrievable into turn context. Other states remain
  visible in the operator surface for audit.
- Turn-generated items enter `accepted` (pipeline gating is the approval
  contract). Operator-created items in approval-required classes default to
  `proposed`; `open_thread` / `session_context` auto-accept.
- `findConflicts` detects duplicates (dedupe key) and polarity-based
  contradictions against accepted items; surfaced to the operator on create,
  never auto-resolved.

## Data Directories

- `data/inquiry-sessions/` — Persisted session JSON files (versioned via `schemaVersion`)
- `data/memory-items/` — Durable memory store (versioned via `schemaVersion`)
- `data/context-snapshots/` — First-class per-turn context snapshots (replay-ready)
- `packages/evals/reports/` — Evaluation report outputs (versioned via `schemaVersion`)

## Persistence layer (M1)

- Every persisted object (session, turn, memory item, context snapshot, report)
  carries an explicit `schemaVersion`. Older unversioned data is upgraded on load
  by `packages/orchestration/src/persistence/migrations.ts`; unknown / newer
  shapes are refused with a `SchemaMigrationError`.
- Each turn references its context snapshot by `contextSnapshotId` and records
  normalized `runMetadata` (provider, model, canon version, prompt revision,
  pipeline revision, commit SHA, captured-at timestamp).
- `replayTurn` in `persistence/replay.ts` re-runs a persisted turn with the
  exact inputs captured in its snapshot.
- `exportSessionBundle` / `importSessionBundle` in `persistence/archive.ts`
  serialize a session and all of its snapshots into a single bundle for
  archive and round-trip import.

## Environment Variables

- `DASHBOARD_PORT` — Port for the dashboard server (default: 5000)
- `DASHBOARD_HOST` — Host to bind to (default: 0.0.0.0)
- `OPENROUTER_API_KEY` — API key for OpenRouter (required for inquiry turns)
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` — Direct provider keys (optional)

## Key Scripts

```bash
pnpm validate:canon   # Validate canon files
pnpm evals            # Run evaluation suite
pnpm dashboard        # Start operator dashboard
```

## Dependencies Note

In the Replit environment, dependencies are installed via npm at the root level:
- `yaml`, `zod` — runtime dependencies from orchestration package
- `tsx` — installed globally for TypeScript execution
