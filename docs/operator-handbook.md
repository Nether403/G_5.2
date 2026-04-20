# G_5.2 Operator Handbook

**Status:** authoritative operator reference for normal day-to-day operation of G_5.2 at the v1 threshold (M8). For release-gate verification, see `docs/v1-release-checklist.md`. For backup and recovery, see `docs/recovery-and-backups.md`.

This handbook is written for the project operator (you). It assumes the system on disk matches the layout described in `docs/system-map.md` and `README.md`.

## 1. Mental model

G_5.2 is built around five never-cross-contaminate boundaries:

1. **Policy roots** live in `packages/canon/` for P-E-S and `packages/inquisitor-witness/` for Witness. They are the only source of truth for their respective governance packs.
2. **Product-scoped runtime data** lives in `data/`. P-E-S and Witness session/memory roots are separate. These are *not* canon and never silently become canon.
3. **Witness testimony + consent** live only in the Witness roots under `data/witness/`. They are operational records, not editorial canon.
4. **Witness downstream review and export state** lives only in `data/witness/synthesis/`, `data/witness/annotations/`, `data/witness/archive-candidates/`, and `data/witness/publication-bundles/`. Publication bundle metadata records live under `data/witness/publication-bundles/records/`, emitted JSON/Markdown artifacts live under `data/witness/publication-bundles/exports/`, packaged exports live under `data/witness/publication-bundles/package-records/` and `data/witness/publication-bundles/packages/`, and remote-delivery audit records live under `data/witness/publication-bundles/delivery-records/`. Archive-review, publication-ready, publication-bundle, package, and delivery records never imply canon promotion or public release by themselves.
5. **Eval reports** live in `packages/evals/reports/`. Promoted gold baselines live in `packages/evals/gold-baselines/`.

The operator's job is to keep these five boundaries clean. Every operator action below is designed to preserve them.

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
# Set AZURE_OPENAI_* for direct Azure runs.
# Set AZURE_BLOB_* when using remote Witness package delivery.
# Set EVAL_PROVIDER=azure|openai|anthropic|gemini (Azure is preferred when configured).
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

For downstream governance work, seal the testimony first:

- `POST /api/witness/testimony/:id/seal`

Sealing is a hard boundary. Once sealed, that testimony is no longer appendable. New Witness turns for the same witness/session must create a new testimony record instead of mutating the sealed one.

### 3.5 Manage Witness synthesis, annotations, and archive candidates

UI: inquiry surface in Witness mode → select a testimony explicitly → use the synthesis / annotation / archive controls in the Witness card.

Operational rules:
- archive candidates can only be created from `sealed` testimony
- candidate creation requires one approved synthesis and one approved annotation batch
- candidate creation persists a pinned `testimonyUpdatedAt` field so the candidate records which sealed testimony version it was created from
- missing consent scopes return `409`
- missing approved synthesis/annotation prerequisites also return `409`
- unknown testimony or unknown archive candidate ids return `404`

Archive APIs:
- `GET /api/witness/archive-candidates?witnessId=...&testimonyId=...`
- `GET /api/witness/archive-candidates/:id`
- `POST /api/witness/archive-candidates`
- `POST /api/witness/archive-candidates/:id/approve-archive-review`
- `POST /api/witness/archive-candidates/:id/reject-archive-review`
- `POST /api/witness/archive-candidates/:id/mark-publication-ready`
- `POST /api/witness/archive-candidates/:id/reject-publication`

Status semantics:
- current candidate statuses: `draft | archive_review_approved | publication_ready`
- non-current statuses: `archive_review_rejected | publication_rejected | superseded`

### 3.6 Create Witness publication bundles

UI: inquiry surface in Witness mode → select a testimony explicitly → use the publication export controls below archive candidates.

Operational rules:
- publication bundle creation requires an archive candidate with status `publication_ready`
- bundle creation is operator-triggered and read-only with respect to testimony, synthesis, annotations, and archive candidates
- missing required body/query fields return `400`
- unknown archive candidate ids or unknown publication bundle ids return `404`
- missing source artifacts surface as `500` runtime/store failures in this slice rather than `404`

Publication bundle APIs:
- `POST /api/witness/publication-bundles`
- `GET /api/witness/publication-bundles?witnessId=...&testimonyId=...`
- `GET /api/witness/publication-bundles/:id`
- `GET /api/witness/publication-bundles/:id/json`
- `GET /api/witness/publication-bundles/:id/markdown`
- `GET /api/witness/publication-bundles/:id/manifest`
- append `?download=1` to any artifact route to force `Content-Disposition: attachment`

The create call accepts `{ archiveCandidateId }` and writes a new bundle record under `data/witness/publication-bundles/records/` plus emitted JSON, Markdown, and manifest artifacts under `data/witness/publication-bundles/exports/`. New JSON artifacts use `schemaVersion: "0.2.0"` with an explicit export DTO rather than direct runtime-record serialization. The artifact read routes serve raw bytes for operator inspection, validate the resolved artifact path against the canonical exports root, and treat broken bundle state as `500`. The manifest route uses the same validation path as JSON and Markdown. In the inquiry UI, preview rendering is raw-text-only and uses a `<pre>` with `textContent`, not HTML rendering, while the download buttons hand off the artifact as an attachment.

### 3.7 Create Witness publication packages

Publication packages are local `.zip` handoff artifacts created from an existing publication bundle.

APIs:
- `POST /api/witness/publication-packages`
- `GET /api/witness/publication-packages?witnessId=...&testimonyId=...&bundleId=...`
- `GET /api/witness/publication-packages/:id`
- `GET /api/witness/publication-packages/:id/file`

Operational rules:
- one package per publication bundle
- repeated create requests return the existing package record
- the package contains `bundle.json`, `bundle.md`, `manifest.json`, and `README.txt`
- package delivery validates the canonical `packages/` root via realpath before reading bytes

### 3.8 Create Witness publication deliveries

Publication deliveries are synchronous, operator-triggered upload attempts over an existing Witness publication package. The package remains the artifact of record; delivery uploads that exact `.zip` unchanged and records the attempt separately from package metadata.

UI: inquiry surface in Witness mode → create or select a package → `Deliver Package`.

APIs:
- `POST /api/witness/publication-deliveries`
- `GET /api/witness/publication-deliveries?packageId=...&bundleId=...&witnessId=...&testimonyId=...`
- `GET /api/witness/publication-deliveries/:id`

Operational rules:
- delivery requires an existing package record and package file
- the current backend is `azure-blob`, behind the generic object-delivery contract
- each upload attempt writes a delivery record under `data/witness/publication-bundles/delivery-records/`
- successful deliveries record backend, status, remote key, and remote URL when available
- failed remote uploads still persist a `failed` delivery record and do not mutate package records or package bytes
- local/config/runtime failures return `500`; remote target failures return `502`

Current backend configuration:
- `AZURE_BLOB_CONNECTION_STRING`
- `AZURE_BLOB_CONTAINER_NAME`

### 3.9 Queue Witness publication deliveries

Queued Witness delivery jobs allow operators to enqueue package uploads without running them in the request path.

UI: inquiry surface in Witness mode → create or select a package → `Queue Delivery`; failed queued jobs expose `Retry Delivery`.

APIs:
- `POST /api/witness/publication-delivery-jobs`
- `GET /api/witness/publication-delivery-jobs?packageId=...&bundleId=...&witnessId=...&testimonyId=...&status=...`
- `GET /api/witness/publication-delivery-jobs/:id`
- `POST /api/witness/publication-delivery-jobs/:id/retry`

Operational rules:
- queued jobs are separate from concrete delivery attempts
- only one queued job is processed at a time by the in-process dashboard worker
- failed jobs remain failed until an operator explicitly retries them
- retry creates a new queued job and leaves the failed job unchanged for audit history
- restart reconciliation converts stale `in_progress` jobs into `failed` jobs with a recovery note
- queued processing still uploads the existing package unchanged

### 3.9 Manage durable memory

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

### 3.10 Propose a canon change

UI: editorial surface → choose a file → edit → submit proposal → review the diff → accept / reject / needs-revision with a reviewer note.

What happens on accept: `applyProposal` writes the new content (or deletes the file for `delete` proposals), and `scaffoldChangelogEntry` creates an auto-numbered `packages/canon/changelog/NNNN-<slug>.md` capturing rationale, reviewer notes, and provenance.

For continuity facts, use the dedicated drafter — it auto-assigns the next `CF-NNN` id by scanning the live file and preserves YAML formatting.

In Witness mode, editorial controls remain disabled. Witness testimony is not edited through the canon proposal workflow.

### 3.11 Run a reflection

UI: authoring surface → reflection topics → create topic → "run".

What happens: `runReflection` does `draft → critique → revise` against active canon, stamps the run with the current canon version, and stores both the run and the resulting authored artifact. The artifact starts in `draft`. Approval is `draft → approved → publishing_ready`; promotion to canon is `promoteArtifactToProposal` which writes a *pending* canon proposal — it does not mutate canon.

Witness mode does not expose editorial or authoring workflows. Those surfaces remain operator workflows for the shared runtime and P-E-S canon.

### 3.12 Run evals

```bash
# Single provider (Gemini default):
pnpm evals

# With trace capture:
pnpm evals -- --trace

# Filter:
pnpm evals -- canon voice-001

# Switch provider:
EVAL_PROVIDER=azure pnpm evals
```

Exit codes:
- `0` — clean
- `1` — non-critical failures
- `2` — critical (merge-blocking) failures

Reports land in `packages/evals/reports/eval-report-<timestamp>.json`. Compare any two via the dashboard diff.

### 3.12 Promote a gold baseline

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
