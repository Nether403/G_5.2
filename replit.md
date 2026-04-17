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
- `GET /editorial.html` — Canon editorial workflow UI (M4)
- `GET /api/canon/files` — List editable canon files
- `GET /api/canon/files/:path` — Read a canon file's current content
- `GET /api/canon/proposals` — List proposals (filter by `status`, `source`, `path`)
- `POST /api/canon/proposals` — Create a pending proposal against a canon file
- `POST /api/canon/proposals/draft-continuity-fact` — Drafting path for new continuity facts
- `GET /api/canon/proposals/:id` — Full proposal JSON
- `PATCH /api/canon/proposals/:id` — Update status (state machine), rationale, or afterContent
- `DELETE /api/canon/proposals/:id` — Delete a non-accepted proposal
- `GET /api/canon/proposals/:id/diff` — Line-level diff of `beforeContent` vs `afterContent`
- `GET /api/canon/continuity-facts/next-id` — Suggest the next available `CF-NNN` id

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
- `data/canon-proposals/` — Pending / accepted / rejected canon proposals (M4)
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

## Canon editorial workflow (M4)

- `packages/orchestration/src/canon-proposals/` is the proposal subsystem.
  Proposals carry `schemaVersion`, target an allowlisted canon file (path
  traversal is rejected at the schema layer), and move through a
  `pending → accepted | rejected | needs_revision` state machine. `accepted`
  and `rejected` are terminal; `needs_revision` and `pending` can transition
  freely.
- On accept, `applyProposal` writes `afterContent` to the target canon file
  (or deletes it for `delete` proposals) and `scaffoldChangelogEntry` creates
  an auto-numbered `packages/canon/changelog/NNNN-<slug>.md` capturing
  rationale, reviewer notes, and provenance.
- Continuity facts are drafted as YAML text (preserving comments / formatting)
  and the next `CF-NNN` id is suggested by scanning the live file.
- Proposals are stored as JSON in `data/canon-proposals/`, separate from the
  canon directory itself.
- Operator UI: `apps/dashboard/public/editorial.html` (linked from the main
  dashboard nav). Supports filtering by status / source / path, doc and
  continuity-fact editors, line-level diff viewer, accept / reject /
  needs-revision controls with reviewer notes, and review history.

## Eval discipline & drift control (M6)

- Every eval case in `packages/evals/src/fixtures/cases/` may declare an
  optional `subsystem` (one of `canon-governance`, `memory-discipline`,
  `editorial-workflow`, `reflection-discipline`, `artifact-boundary`,
  `provider-drift`, `long-horizon-coherence`, `style-and-voice`,
  `retrieval-and-context`, `epistemics-and-meta`) and a `critical: true`
  flag. Subsystem is derived from `category` when absent so legacy cases
  remain stable. See `packages/evals/src/subsystems.ts`.
- The eval CLI (`scripts/run-evals.ts` and `packages/evals/src/index.ts`)
  prints a per-subsystem scorecard and a `MERGE-BLOCKING` banner when any
  critical case fails, and exits with code `2` for critical failures
  (still `1` for ordinary failures, `0` clean).
- Persisted reports include `score.criticalFailedIds` and
  `score.subsystems[]` so dashboard diffs can attribute regressions per
  subsystem; see `packages/evals/src/reporters/reportSchema.ts`.
- Dashboard diff (`apps/dashboard/src/reportUtils.ts`) now surfaces
  `subsystemDelta`, `criticalDelta`, and prompt-level trace deltas
  (`systemPrompt`, `userPrompt`) alongside existing draft/critique/
  revision/final and selection-set deltas.
- Drift bands: `docs/drift-budget.md`. Merge-blocking policy and
  subsystem coverage requirements: `docs/eval-discipline.md`. Gold
  baseline refresh process: `docs/gold-baseline-process.md`, with
  `scripts/refresh-gold-baseline.ts` to promote a report into
  `packages/evals/gold-baselines/<provider>-<canonVersion>.json`.

## Release hardening & v1 threshold (M8)

This milestone defines the first true v1 release gate and ships the
operator-facing documentation that goes with it. No runtime behavior
changes; the milestone is documentation, smoke tests, and procedure.

Deliverables:

- `docs/v1-release-checklist.md` — sectioned release gate (canon,
  persistence, memory, editorial, reflection, evals, studio, docs, ops,
  backups, RC baselines, invariants).
- `docs/operator-handbook.md` — daily operator reference: mental model,
  first-run setup, daily ops, demo paths pointer, common pitfalls,
  refusal-to-start recovery.
- `docs/recovery-and-backups.md` — four data classes, backup cadence,
  archive bundles, replay, schema migrations, six recovery scenarios.
- `docs/demo-paths.md` — six canonical demo paths, each grounded in
  the corresponding subsystem and owner code paths.
- `docs/release-candidate-baseline.md` — per-provider RC procedure that
  reuses `scripts/refresh-gold-baseline.ts` (no new tooling).
- `docs/post-v1-support-posture.md` — explicit out-of-scope statement
  for post-v1 concerns (public auth, rate limiting, paid SLOs, etc.).
- `scripts/smoke-tests.ts` (run via `pnpm smoke`) — exercises all six
  canonical demo paths end-to-end against the MockProvider in temp
  directories: inquiry turn + replay, memory governance, canon proposal
  + apply + changelog, reflection authoring + promote, reports & diff,
  and the export/import backup round-trip.

The smoke runner exits non-zero on any path failure and is the
mechanical floor for release readiness; `docs/v1-release-checklist.md`
is the human ceiling.

## Environment Variables

- `DASHBOARD_PORT` — Port for the dashboard server (default: 5000)
- `DASHBOARD_HOST` — Host to bind to (default: 0.0.0.0)
- `OPENROUTER_API_KEY` — API key for OpenRouter (required for inquiry turns)
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` — Direct provider keys (optional)

## Key Scripts

```bash
pnpm validate:canon   # Validate canon files
pnpm smoke            # Run end-to-end smoke tests for canonical demo paths
pnpm evals            # Run evaluation suite
pnpm dashboard        # Start operator dashboard
```

## Dependencies Note

In the Replit environment, dependencies are installed via npm at the root level:
- `yaml`, `zod` — runtime dependencies from orchestration package
- `tsx` — installed globally for TypeScript execution
