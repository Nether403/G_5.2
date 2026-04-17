# G_5.2 v1 Release Checklist

**Status:** authoritative checklist for the G_5.2 v1 release gate. Reviewed at the close of M8 and re-reviewed before any subsequent canon-version bump that would call itself "v1".

This checklist exists to make the v1 go/no-go decision concrete. It is a *release gate*, not a marketing milestone — v1 means "the operator can run the system as designed, end-to-end, without repo surgery". Public launch is explicitly out of scope (see `docs/post-v1-support-posture.md`).

The criteria below are derived from the v1 rung in `docs/release-criteria.md` and the M8 task plan. Each item is either green (✅), or has a concrete gap captured next to it.

### Two layers, deliberately

This checklist has two layers, and confusing them is the most common review pitfall:

1. **M8-implementation layer** (sections A–J, L). These items describe the *capabilities* and *artifacts* that must exist in the repo for v1 to be a coherent release. They are independent of any particular release-candidate run and are the deliverable of milestone M8 itself.
2. **Per-RC operator layer** (section K, plus the last item of section F). These items must be re-run by the operator on every release-candidate commit, because they require live API access (`OPENROUTER_API_KEY` or direct provider keys) and produce report artifacts that are tied to a specific canon version. M8 ships the procedure, scripts, and gates; the operator captures the artifacts at RC time.

M8 is "implemented" when every M8-implementation-layer box is `[x]`. v1 is "declared" when, in addition, the per-RC operator-layer boxes are `[x]` for the providers in scope for that release candidate.

The per-RC operator layer is *deliberately* not part of the M8 commit, for three reasons:

- It requires live API access (`OPENROUTER_API_KEY` or direct provider keys), which is an operator concern, not a milestone concern.
- The captured artifacts (`packages/evals/reports/eval-report-*.json` and `packages/evals/gold-baselines/<provider>-<canonVersion>.json`) are tied to a specific canon version. If they were committed at M8, they would go stale the moment canon advances and would need to be re-captured anyway.
- The script that captures them (`scripts/refresh-gold-baseline.ts`) refuses to promote a report with critical failures, which is the actual behavioral gate. Shipping the gate is M8's job; running it is the operator's.

Follow-up task #25 ("Capture the first cross-provider RC baseline trio and check it in") tracks the first concrete RC capture against this checklist.

## How to use this document

1. Walk every section top-to-bottom.
2. For each item, mark `[x]` only when there is a verifiable artifact (code, test, doc, or stored report) that proves the item.
3. If an item cannot be marked, capture the gap in the same line and either fix it before declaring v1, or move it to `docs/post-v1-support-posture.md` with an explicit justification.
4. Re-run `pnpm validate:canon`, `pnpm typecheck`, `pnpm test`, and `pnpm smoke` before signing the gate.

## A. Canon stability and versioning

- [x] Canon manifest declares an explicit `version` and `last_updated`, and `pnpm validate:canon` passes against the working tree.
- [x] Canon changes flow through the editorial workflow (`packages/orchestration/src/canon-proposals/` + `editorial.html`); raw edits to canon outside the workflow are not part of normal operation.
- [x] Every accepted canon proposal scaffolds a numbered changelog entry under `packages/canon/changelog/` capturing rationale, reviewer notes, and provenance.
- [x] `recovered-artifacts/` is preserved as historically authoritative and behaviorally non-binding (invariant 2). The editorial workflow does not edit it.
- [x] Canon load-time validation refuses to start the runtime when canon is malformed (invariant 1).

## B. Inquiry sessions persist reliably across upgrades

- [x] Every persisted object (session, turn, memory item, context snapshot, report, proposal, reflection) carries an explicit `schemaVersion`.
- [x] Older unversioned shapes are upgraded on load by `packages/orchestration/src/persistence/migrations.ts`.
- [x] Unknown / future shapes are refused with a `SchemaMigrationError` rather than silently degraded (`migrateSession` rejects future versions; covered by `persistence.test.ts`).
- [x] Each turn references its context snapshot by `contextSnapshotId` and stores `runMetadata` (provider, model, canon version, prompt revision, pipeline revision, commit SHA, captured-at).
- [x] `replayTurn` reproduces a persisted turn from its snapshot without provider calls; `checkReplayCompatibility` reports drift against the current environment.
- [x] `exportSessionBundle` / `importSessionBundle` round-trip a session and its snapshots into a single archive bundle (verified end-to-end in `persistence.test.ts`).

## C. Memory is governed and inspectable

- [x] Memory items are typed (`user_preference`, `project_decision`, `open_thread`, `session_context`, `operator_note`, `rejected_candidate`).
- [x] Memory items move through the explicit state machine `proposed → accepted | rejected`, `accepted → superseded | resolved | archived`; `rejected` and `archived` are terminal.
- [x] Every item carries provenance (`origin`, `createdFrom`, `lastConfirmedFrom`, per-transition timestamps, supersedes / supersededBy).
- [x] Only `accepted` items are retrievable into turn context. Other states remain visible in the operator surface for audit.
- [x] Operators can list, inspect, edit, transition, and hard-delete memory items via `apps/dashboard/`.
- [x] `findConflicts` surfaces duplicates and polarity-based contradictions on create; never auto-resolved.

## D. Canon change workflow exists and is usable

- [x] Operators can create proposals against the allowlisted canon files (`canon-proposals/canonPaths.ts`); path traversal is rejected at the schema layer.
- [x] Proposals carry `pending → accepted | rejected | needs_revision` state; `accepted` and `rejected` are terminal.
- [x] Continuity-fact drafter assigns the next `CF-NNN` id by scanning the live file.
- [x] Line-level diff is available for proposal review.
- [x] `applyProposal` is the only mutation path into `packages/canon/` outside the changelog scaffolder; `scaffoldChangelogEntry` writes the matching changelog entry.
- [x] Operator UI: `editorial.html` (linked from the main dashboard nav) supports filter, edit, diff, accept / reject / needs-revision with reviewer notes.

## E. Reflection workflow exists and is usable

- [x] Reflection topics + runs are stored under `data/reflection/` with explicit state machines.
- [x] `runReflection` follows `draft → critique → revise` and stamps each run with the active canon version.
- [x] Authored artifacts have `draft → approved → publishing_ready` state transitions enforced at the store layer.
- [x] Promotion to canon goes through `promoteArtifactToProposal`, which writes a pending proposal and refuses drafts (verified in `reflection.test.ts`).
- [x] Reflection authoring never silently mutates canon (invariant 2).

## F. Eval matrix is healthy enough to detect drift

- [x] Per-case `subsystem` and `critical: true` tags are honored by the eval runner.
- [x] Subsystem scorecards print to the console and are persisted in JSON reports.
- [x] Critical-case failures exit the eval CLI with code `2` and print a `MERGE-BLOCKING` banner.
- [x] Drift bands are documented in `docs/drift-budget.md`; merge-blocking policy in `docs/eval-discipline.md`; gold baseline refresh process in `docs/gold-baseline-process.md`.
- [x] `scripts/refresh-gold-baseline.ts` validates a fresh report and refuses to promote one with critical failures.
- [ ] **(per-RC operator layer)** RC baseline reports captured for each configured provider (anthropic, openai, gemini) — see `docs/release-candidate-baseline.md` for the procedure. This step requires `OPENROUTER_API_KEY` and is performed by the operator on the release-candidate commit. M8 ships the procedure; the artifacts are captured at RC time.

## G. Operator studio is coherent and navigable

- [x] Eval reports + diffs (`/`), inquiry surface (`/inquiry.html`), authoring surface (`/authoring.html`), and editorial workflow (`/editorial.html`) are all served by `apps/dashboard/`.
- [x] Memory inspection + transitions are reachable from the dashboard.
- [x] Reflection topics, runs, and authored artifacts are reachable from the authoring surface.
- [x] Canon proposals and continuity-fact drafting are reachable from the editorial surface.
- [x] No surface mutates canon without going through the proposal flow.

## H. Documentation describes the actually-shipped system

- [x] `README.md` current-scope list matches the system-map.
- [x] `docs/system-map.md`, `docs/release-criteria.md`, `docs/invariants.md` are all marked authoritative and referenced from the README.
- [x] `g_52_project_overview_and_roadmap.md` defers to `docs/release-criteria.md` for release terminology.
- [x] M8 deliverables are linked from the README: this checklist, `docs/operator-handbook.md`, `docs/recovery-and-backups.md`, `docs/demo-paths.md`, `docs/release-candidate-baseline.md`, `docs/post-v1-support-posture.md`.

## I. Normal operation no longer requires manual repo intervention

- [x] `pnpm install && pnpm validate:canon && pnpm typecheck && pnpm test && pnpm smoke` succeeds on a clean clone (no API key required for `pnpm smoke`).
- [x] `pnpm dashboard` starts the operator dashboard against a clean `data/` directory.
- [x] Persisted data lives entirely under `data/` and `packages/evals/reports/`; nothing in those directories is checked into git as part of normal operation.
- [x] `scripts/post-merge.sh` performs the post-merge bootstrap step automatically (no manual `pnpm install` typically required after pulling).
- [x] Canon changes are made through the editorial workflow, not by direct file edits in the operator's working tree.

## J. Backups, recovery, and migration are verified

- [x] `docs/recovery-and-backups.md` documents the full backup surface (canon git history, `data/` directories, eval reports, gold baselines).
- [x] `exportSessionBundle` / `importSessionBundle` round-trip is covered by `persistence.test.ts`.
- [x] `migrateSession` and `migrateMemoryItem` upgrade legacy fixtures and are covered by `persistence.test.ts`.
- [x] Smoke tests (`scripts/smoke-tests.ts`) exercise the demo paths — including export → import — with the mock provider.
- [x] Recovery procedures are reproducible from the documentation alone; no operator-only knowledge is assumed.

## K. RC baseline evals across providers (per-RC operator layer)

This is the section that must be re-verified at every release-candidate commit, because canon and prompts evolve. M8 ships the procedure (`docs/release-candidate-baseline.md`), the script (`scripts/refresh-gold-baseline.ts`), the schema (`packages/evals/src/reporters/reportSchema.ts`), and the gates (critical-failure refusal, drift bands). The boxes below stay unchecked in the repo and are checked on the operator's release-candidate branch / release notes when the runs happen.

- [ ] Anthropic baseline captured: `packages/evals/reports/eval-report-<timestamp>.json` and promoted via `scripts/refresh-gold-baseline.ts anthropic <reportPath>`.
- [ ] OpenAI baseline captured + promoted.
- [ ] Gemini baseline captured + promoted.
- [ ] Cross-provider drift reviewed against `docs/drift-budget.md`; deltas outside the bands either fixed or explicitly accepted in the release notes.

The procedure (env, command, capture, promote, review) is documented in `docs/release-candidate-baseline.md`.

## L. Invariants check

Every release gate must affirm the four core invariants from `docs/invariants.md`:

- [x] Invariant 1 — Canon is the source of truth: the runtime loads and validates canon on startup; no surface overrides canon at runtime.
- [x] Invariant 2 — Output is not canon unless explicitly promoted: reflections, memory, and proposals all require an explicit operator action with provenance.
- [x] Invariant 3 — Memory is selective: typed, justified, inspectable, deletable, ranked below canon / continuity / summary / recent turns.
- [x] Invariant 4 — Provider portability is preserved: provider-specific logic is confined to `packages/orchestration/src/providers/`; eval cases are provider-agnostic.

## v1 declaration

v1 is reached when:

1. Every box above is `[x]`, with the exception of section K which must be `[x]` for the providers that the operator considers in-scope for the release candidate.
2. `docs/release-candidate-baseline.md` records the actual provider runs that were captured.
3. The operator records the v1 declaration as a changelog entry under `packages/canon/changelog/` (e.g. `NNNN-v1-release-gate.md`) referencing this checklist.

Anything beyond v1 — public launch surface, multi-user concerns, autonomous behavior, broad tool use — is explicitly post-v1 and lives in `docs/post-v1-support-posture.md`.
