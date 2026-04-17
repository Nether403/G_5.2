# G_5.2 Operator Handbook

**Status:** authoritative operator reference for normal day-to-day operation of G_5.2 at the v1 threshold (M8). For release-gate verification, see `docs/v1-release-checklist.md`. For backup and recovery, see `docs/recovery-and-backups.md`.

This handbook is written for the project operator (you). It assumes the system on disk matches the layout described in `docs/system-map.md` and `README.md`.

## 1. Mental model

G_5.2 is built around three never-cross-contaminate boundaries:

1. **Canon** lives in `packages/canon/`. It is the only source of truth for identity, epistemics, voice, continuity, and glossary.
2. **Runtime data** lives in `data/` (sessions, memory, context snapshots, canon proposals, reflections, authored artifacts). These are *not* canon and never silently become canon.
3. **Eval reports** live in `packages/evals/reports/`. Promoted gold baselines live in `packages/evals/gold-baselines/`.

The operator's job is to keep these three boundaries clean. Every operator action below is designed to preserve them.

## 2. First-run setup

Prerequisites: Node `>=20`, pnpm `>=9`.

```bash
pnpm install
pnpm validate:canon
pnpm typecheck
pnpm test
pnpm smoke           # mock-provider end-to-end smoke tests
```

Optional:

```bash
cp .env.example .env
# Set OPENROUTER_API_KEY for real provider runs.
# Set EVAL_PROVIDER=openai|anthropic|gemini (defaults to gemini) for evals.
```

If any of `validate:canon`, `typecheck`, `test`, or `smoke` fails on a clean clone, do not proceed. File a fix before running anything else.

## 3. Daily operations

### 3.1 Start the dashboard

```bash
pnpm dashboard
```

Dashboard surfaces (default port `5000`, override via `DASHBOARD_PORT`):

| Surface | URL | Purpose |
|---|---|---|
| Reports + diff | `http://localhost:5000/` | Eval report inspection, diff between two runs. |
| Inquiry | `http://localhost:5000/inquiry.html` | Run and inspect persisted inquiry sessions. |
| Authoring | `http://localhost:5000/authoring.html` | Reflection topics, runs, authored artifacts. |
| Editorial | `http://localhost:5000/editorial.html` | Canon proposals, continuity-fact drafting, accept/reject. |

### 3.2 Run an inquiry turn

UI: `inquiry.html` → "New session" → choose mode → submit user message.

API: `POST /api/inquiry/turn` with `{ sessionId?, mode, userMessage }`.

What happens: `runSessionTurn` builds context from active canon, runs `draft → critique → revise`, decides on memory, persists the session and a first-class context snapshot, and returns the artifacts. Every turn is replayable from its `contextSnapshotId` via `replayTurn`.

### 3.3 Inspect a session

UI: inquiry surface → session list → click a session.

API: `GET /api/inquiry/sessions/:id` returns the full session JSON including per-turn `contextSnapshotId`, `runMetadata`, and `trace`.

### 3.4 Manage durable memory

UI: dashboard → memory.

Operations:
- `GET /api/memory` (filter by `state`, `type`, `scope`, `sessionId`)
- `POST /api/memory` to manually create (defaults to `proposed` for approval-required classes)
- `PATCH /api/memory/:id` to edit non-terminal items
- `POST /api/memory/:id/approve|reject|resolve|archive|supersede` for transitions
- `GET /api/memory/conflicts` to preview duplicates / contradictions before creating
- `DELETE /api/memory/:id` for hard delete

Rule of thumb: only `accepted` items are retrievable into turn context. Everything else is operator-visible audit only.

### 3.5 Propose a canon change

UI: editorial surface → choose a file → edit → submit proposal → review the diff → accept / reject / needs-revision with a reviewer note.

What happens on accept: `applyProposal` writes the new content (or deletes the file for `delete` proposals), and `scaffoldChangelogEntry` creates an auto-numbered `packages/canon/changelog/NNNN-<slug>.md` capturing rationale, reviewer notes, and provenance.

For continuity facts, use the dedicated drafter — it auto-assigns the next `CF-NNN` id by scanning the live file and preserves YAML formatting.

### 3.6 Run a reflection

UI: authoring surface → reflection topics → create topic → "run".

What happens: `runReflection` does `draft → critique → revise` against active canon, stamps the run with the current canon version, and stores both the run and the resulting authored artifact. The artifact starts in `draft`. Approval is `draft → approved → publishing_ready`; promotion to canon is `promoteArtifactToProposal` which writes a *pending* canon proposal — it does not mutate canon.

### 3.7 Run evals

```bash
# Single provider (Gemini default):
pnpm evals

# With trace capture:
pnpm evals -- --trace

# Filter:
pnpm evals -- canon voice-001

# Switch provider:
EVAL_PROVIDER=openai pnpm evals
```

Exit codes:
- `0` — clean
- `1` — non-critical failures
- `2` — critical (merge-blocking) failures

Reports land in `packages/evals/reports/eval-report-<timestamp>.json`. Compare any two via the dashboard diff.

### 3.8 Promote a gold baseline

After a clean RC report:

```bash
pnpm tsx scripts/refresh-gold-baseline.ts <provider> <reportPath>
```

The script refuses to promote a report with critical failures and archives any older baseline for that provider at a different canon version. See `docs/gold-baseline-process.md`.

## 4. Canonical demo paths

The six demo paths every v1-grade installation must be able to walk are documented in `docs/demo-paths.md`. They are also exercised end-to-end (with the mock provider) by `pnpm smoke`.

## 5. Backups and recovery

See `docs/recovery-and-backups.md` for:
- what to back up and on what cadence
- how to restore a session from an archive bundle
- how to handle schema migrations
- how to recover canon from git history
- how to recover gold baselines

## 6. Common operator pitfalls

1. **Editing canon files directly instead of via the editorial workflow.** Direct edits skip the changelog and the diff review. Use `editorial.html`.
2. **Treating `data/` as canon.** Sessions, memory, and authored artifacts are *runtime data*. They never silently become canon. Promotion is always an explicit operator action.
3. **Promoting a baseline with critical failures.** `refresh-gold-baseline.ts` will refuse this. If it does, fix the regression rather than working around the script.
4. **Mixing per-provider prompt hacks into shared code.** Provider-specific logic stays in `packages/orchestration/src/providers/`. Drift is measured by evals, not papered over (invariant 4).
5. **Ignoring the merge-blocking critical-case banner.** A `MERGE-BLOCKING` banner means the regression must be reviewed before any further canon or prompt change.

## 7. When the system refuses to start

1. `pnpm validate:canon` first — it pinpoints schema violations.
2. Read the error: it always names the file and the schema field.
3. If a recent edit caused the failure, revert the file or open a fix proposal.
4. If a schema migration is the cause, see `docs/recovery-and-backups.md` § "Schema migrations".

## 8. Where to read more

- Subsystem map: `docs/system-map.md`
- Release ladder + v1 scope: `docs/release-criteria.md`
- Invariants: `docs/invariants.md`
- Eval discipline + drift budget: `docs/eval-discipline.md`, `docs/drift-budget.md`
- Memory discipline (v1 + v2): `docs/Memory Discipline V1.md`, `replit.md` § "Memory discipline v2"
- Editorial workflow: `replit.md` § "Canon editorial workflow"
- Decision log: `docs/decision-log/`
