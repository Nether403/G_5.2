# G_5.2 Operator Handbook

**Status:** authoritative operator reference for normal day-to-day operation of G_5.2 at the v1 threshold (M8). For release-gate verification, see `docs/v1-release-checklist.md`. For backup and recovery, see `docs/recovery-and-backups.md`.

This handbook is written for the project operator (you). It assumes the system on disk matches the layout described in `docs/system-map.md` and `README.md`.

## 1. Mental model

G_5.2 is built around four never-cross-contaminate boundaries:

1. **Policy roots** live in `packages/canon/` for P-E-S and `packages/inquisitor-witness/` for Witness. They are the only source of truth for their respective governance packs.
2. **Product-scoped runtime data** lives in `data/`. P-E-S and Witness session/memory roots are separate. These are *not* canon and never silently become canon.
3. **Witness testimony + consent** live only in the Witness roots under `data/witness/`. They are operational records, not editorial canon.
4. **Eval reports** live in `packages/evals/reports/`. Promoted gold baselines live in `packages/evals/gold-baselines/`.

The operator's job is to keep these four boundaries clean. Every operator action below is designed to preserve them.

## 2. First-run setup

Prerequisites: Node `>=20`, pnpm `>=9`.

```bash
pnpm install
pnpm validate:canon
pnpm validate:witness
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

If any of `validate:canon`, `validate:witness`, `typecheck`, `test`, or `smoke` fails on a clean clone, do not proceed. File a fix before running anything else.

## 3. Daily operations

### 3.1 Start the dashboard

```bash
pnpm dashboard
```

Dashboard surfaces (default port `5000`, override via `DASHBOARD_PORT`):

| Surface | URL | Purpose |
|---|---|---|
| Reports + diff | `http://localhost:5000/` | Eval report inspection, diff between two runs. |
| Inquiry | `http://localhost:5000/inquiry.html` | Run and inspect persisted P-E-S or Witness inquiry sessions. |
| Authoring | `http://localhost:5000/authoring.html` | Reflection topics, runs, authored artifacts. |
| Editorial | `http://localhost:5000/editorial.html` | Canon proposals, continuity-fact drafting, accept/reject. |

### 3.2 Run an inquiry turn

UI: `inquiry.html` → choose product (`P-E-S` or `Witness`) → if Witness, enter a witness ID and confirm consent state → "New session" → choose mode → submit user message.

API: `POST /api/inquiry/turn` with `{ sessionId?, mode, userMessage, product? }`.

- `product` defaults to `pes`
- `product: "witness"` requires `witnessId`
- Witness persistence is blocked unless the latest `conversational` and `retention` consent decisions are both `granted`
- blocked Witness turns return `409` and must not write session, testimony, or memory state

What happens: the product registry resolves the active policy root and storage roots, `runSessionTurn` builds context from that policy root, runs `draft → critique → revise`, decides on memory, persists the session and a first-class context snapshot, and returns the artifacts. Every turn is replayable from its `contextSnapshotId` via `replayTurn`.

In Witness mode, accepted turns also create or append the Witness testimony record for that session. If testimony/session persistence diverges, the runtime compensates and rolls the failed operation back instead of leaving partial Witness artifacts behind.

### 3.3 Inspect a session

UI: inquiry surface → session list → click a session.

API: `GET /api/inquiry/sessions/:id` returns the full session JSON including per-turn `contextSnapshotId`, `runMetadata`, and `trace`.

Use the `product` query parameter when reading product-scoped session lists and sessions:

- `GET /api/inquiry/sessions?product=pes`
- `GET /api/inquiry/sessions?product=witness`

Witness sessions also carry `productId: "witness"` and `witnessId`.

### 3.4 Inspect Witness consent and testimony

UI: inquiry surface in Witness mode → witness card.

APIs:
- `POST /api/witness/consent` with `{ witnessId, scope, status, actor, testimonyId? }`
- `GET /api/witness/consent?witnessId=...`
- `GET /api/witness/testimony?witnessId=...`
- `GET /api/witness/testimony/:id`

Use these endpoints to confirm that:
- conversational consent exists
- retention consent exists
- the current Witness session is linked to exactly one testimony record
- testimony segments are accumulating as expected

### 3.5 Manage durable memory

UI: dashboard → memory.

Operations:
- `GET /api/memory` (filter by `state`, `type`, `scope`, `sessionId`)
- `POST /api/memory` to manually create (defaults to `proposed` for approval-required classes)
- `PATCH /api/memory/:id` to edit non-terminal items
- `POST /api/memory/:id/approve|reject|resolve|archive|supersede` for transitions
- `GET /api/memory/conflicts` to preview duplicates / contradictions before creating
- `DELETE /api/memory/:id` for hard delete

Rule of thumb: only `accepted` items are retrievable into turn context. Everything else is operator-visible audit only.

In Witness mode, memory reads and writes must stay inside `data/witness/memory/`. They must not touch `data/memory-items/`.

### 3.6 Propose a canon change

UI: editorial surface → choose a file → edit → submit proposal → review the diff → accept / reject / needs-revision with a reviewer note.

What happens on accept: `applyProposal` writes the new content (or deletes the file for `delete` proposals), and `scaffoldChangelogEntry` creates an auto-numbered `packages/canon/changelog/NNNN-<slug>.md` capturing rationale, reviewer notes, and provenance.

For continuity facts, use the dedicated drafter — it auto-assigns the next `CF-NNN` id by scanning the live file and preserves YAML formatting.

In Witness mode, editorial controls remain disabled. Witness testimony is not edited through the canon proposal workflow.

### 3.7 Run a reflection

UI: authoring surface → reflection topics → create topic → "run".

What happens: `runReflection` does `draft → critique → revise` against active canon, stamps the run with the current canon version, and stores both the run and the resulting authored artifact. The artifact starts in `draft`. Approval is `draft → approved → publishing_ready`; promotion to canon is `promoteArtifactToProposal` which writes a *pending* canon proposal — it does not mutate canon.

Witness mode does not expose editorial or authoring workflows. Those surfaces remain operator workflows for the shared runtime and P-E-S canon.

### 3.8 Run evals

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

### 3.9 Promote a gold baseline

After a clean RC report:

```bash
pnpm tsx scripts/refresh-gold-baseline.ts <provider> <reportPath>
```

The script refuses to promote a report with critical failures and archives any older baseline for that provider at a different canon version. See `docs/gold-baseline-process.md`.

## 4. Canonical demo paths

The seven demo paths every v1-grade installation must be able to walk are documented in `docs/demo-paths.md`. They are also exercised end-to-end (with the mock provider) by `pnpm smoke`.

## 5. Backups and recovery

See `docs/recovery-and-backups.md` for:
- what to back up and on what cadence
- how to restore a session from an archive bundle
- how to handle schema migrations
- how to recover canon from git history
- how to recover gold baselines

## 6. Common operator pitfalls

1. **Editing policy files directly instead of via the editorial workflow.** Direct edits skip the changelog and the diff review. Use `editorial.html` for P-E-S canon changes.
2. **Treating `data/` as canon.** Sessions, testimony, consent, memory, and authored artifacts are *runtime data*. They never silently become canon. Promotion is always an explicit operator action.
3. **Promoting a baseline with critical failures.** `refresh-gold-baseline.ts` will refuse this. If it does, fix the regression rather than working around the script.
4. **Mixing per-provider prompt hacks into shared code.** Provider-specific logic stays in `packages/orchestration/src/providers/`. Drift is measured by evals, not papered over (invariant 4).
5. **Ignoring the merge-blocking critical-case banner.** A `MERGE-BLOCKING` banner means the regression must be reviewed before any further canon or prompt change.
6. **Running Witness turns without checking consent roots first.** Witness mode is intentionally blocked without `conversational=granted` and `retention=granted`.
7. **Assuming Witness can use P-E-S runtime state.** Product boundaries are strict by design; Witness session/memory/testimony state must stay inside Witness roots.

## 7. When the system refuses to start

1. `pnpm validate:canon` and `pnpm validate:witness` first — they pinpoint policy-root schema violations.
2. Read the error: it always names the file and the schema field.
3. If a recent edit caused the failure, revert the file or open a fix proposal.
4. If a schema migration is the cause, see `docs/recovery-and-backups.md` § "Schema migrations".

## 8. Where to read more

- Subsystem map: `docs/system-map.md`
- Release ladder + v1 scope: `docs/release-criteria.md`
- Invariants: `docs/invariants.md`
- Eval discipline + drift budget: `docs/eval-discipline.md`, `docs/drift-budget.md`
- Memory discipline (v1 + v2): `docs/Memory Discipline V1.md`, `docs/v1-release-checklist.md` § "C. Memory is governed and inspectable", `g_52_project_overview_and_roadmap.md` § "M3 — Memory discipline v2"
- Editorial workflow: `docs/system-map.md`, `docs/v1-release-checklist.md` § "D. Canon change workflow exists and is usable"
- Decision log: `docs/decision-log/`
