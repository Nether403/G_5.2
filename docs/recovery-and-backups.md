# G_5.2 Recovery & Backups

**Status:** authoritative recovery + backups reference for v1 (M8). Read alongside `docs/operator-handbook.md`.

This document covers what to back up, how to restore, and what the system already gives you for free (schema migrations, replay, archive bundles, gold-baseline archival).

## 1. The four data classes

| Class | Where | Authoritative? | Backup priority |
|---|---|---|---|
| Canon | `packages/canon/` | Yes (invariant 1) | **Critical** — versioned in git, never edit outside the editorial workflow. |
| Persisted runtime data | `data/` | No | High — operator-visible audit trail, replayable but not regenerable. |
| Eval reports | `packages/evals/reports/` | No | Medium — historical record, regeneratable if the operator still has the relevant provider keys and canon version. |
| Gold baselines | `packages/evals/gold-baselines/` | Yes (release-gate truth) | **Critical** — versioned in git; every promotion archives the previous baseline. |

## 2. What to back up, on what cadence

### 2.1 Canon (always)

Canon lives in git. The only mutation paths are:
- `packages/orchestration/src/canon-proposals/applyProposal.ts` (writes after acceptance)
- `packages/orchestration/src/canon-proposals/changelogScaffold.ts` (writes the changelog entry)

Every accepted proposal produces a numbered changelog entry under `packages/canon/changelog/`. **Do not** edit canon files outside the editorial workflow during normal operation; doing so silently breaks the changelog history.

Recovery: `git log -- packages/canon/<file>` and `git checkout <sha> -- packages/canon/<file>`.

### 2.2 Runtime data (`data/`)

The operator decides backup cadence; the contents are file-backed JSON, so a periodic copy of the whole `data/` directory is sufficient. Suggested layout:

```
data/
├── inquiry-sessions/         # Session JSON, one file per session
├── inquiry-sessions/snapshots/ # Replay-ready context snapshots (linked by contextSnapshotId)
├── memory-items/             # Durable memory items
├── canon-proposals/          # Pending / accepted / rejected proposals
├── reflection/topics/        # Reflection topics
├── reflection/runs/          # Reflection runs
└── authored-artifacts/      # Authored artifacts (linked to reflection runs by topicId/runId)
```

Suggested cadence:
- After any meaningful inquiry session: export the session as a bundle (see § 3).
- Daily during active editorial work: copy `data/canon-proposals/` and `data/reflection/`.
- Weekly during long-horizon use: snapshot the full `data/` directory.

### 2.3 Eval reports

Reports under `packages/evals/reports/` are append-only and timestamped. Periodic copy alongside `data/` is sufficient. Reports are also re-creatable by re-running `pnpm evals` against the captured canon version (see § 4 on replay).

### 2.4 Gold baselines

Live under `packages/evals/gold-baselines/<provider>-<canonVersion>.json` and are versioned in git. The refresh script archives the previous baseline for that provider into `packages/evals/gold-baselines/archive/` automatically.

## 3. Session archive bundles (export / import)

The persistence layer ships a first-class export/import format used for archiving and round-tripping a single session with all of its context snapshots.

API: `exportSessionBundle` / `importSessionBundle` in `packages/orchestration/src/persistence/archive.ts`.

```ts
import { exportSessionBundle, importSessionBundle } from "./packages/orchestration/src/persistence/archive";

await exportSessionBundle({
  sessionsRoot: "data/inquiry-sessions",
  sessionId: "<id>",
  outputPath: "backups/session-<id>.json",
});

await importSessionBundle({
  bundlePath: "backups/session-<id>.json",
  sessionsRoot: "data/inquiry-sessions",
  // overwrite: true,  // only if you intend to replace
});
```

The schema is `SessionArchiveSchema`:

```json
{
  "schemaVersion": <archive version>,
  "kind": "session",
  "exportedAt": "<ISO>",
  "session": { ... },
  "contextSnapshots": [ ... ]
}
```

Round-trip safety is covered by `packages/orchestration/src/persistence/persistence.test.ts` ("exportSessionBundle and importSessionBundle round-trip a session with its snapshots") and re-exercised by `pnpm smoke`.

## 4. Replay

A turn can be re-run from its persisted snapshot, with no provider call:

```ts
import { replayTurn } from "./packages/orchestration/src/persistence/replay";

const replay = await replayTurn(null, {
  sessionsRoot: "data/inquiry-sessions",
  sessionId: "<id>",
  turnId: "<turn-id>",
});
```

Or to actually re-run the pipeline against the snapshot's inputs:

```ts
const rerun = await replayTurn(provider, {
  sessionsRoot: "data/inquiry-sessions",
  canonRoot: "packages/canon",
  sessionId: "<id>",
  turnId: "<turn-id>",
  mode: "rerun",
});
```

`checkReplayCompatibility` reports whether the persisted `runMetadata` (canon version, prompt revision, pipeline revision, commit SHA) still matches the current environment. Drift is hard-failed by default; use it to detect "this turn was captured against a different canon version" before trying to compare reruns.

## 5. Schema migrations

Every persisted object carries a `schemaVersion`. The migration story:

- Older / unversioned shapes are upgraded on load by `packages/orchestration/src/persistence/migrations.ts`. The upgraded shape is written back next time the object is saved.
- Unknown / future shapes are refused with a `SchemaMigrationError`. The object is **not** silently coerced.

If `pnpm dashboard` (or any tool that loads sessions / memory / proposals) fails with a `SchemaMigrationError`:

1. Read the message — it includes the kind (`session`, `memoryItem`, `archive`, etc.) and the offending version.
2. If you are running an *older* build against *newer* data, upgrade the build.
3. If you are running a *newer* build against *older* data, the migration should have run automatically. If it did not, capture the offending file and file a migration bug. Do not hand-edit it.

The migration test fixtures in `persistence.test.ts` exercise the legacy → current upgrade path and the future-version refusal.

## 6. Recovery scenarios

### 6.1 "I corrupted a canon file"

1. `git status -- packages/canon/`
2. `git checkout HEAD -- packages/canon/<file>`
3. `pnpm validate:canon` to confirm.
4. If the corruption was already committed: `git log --oneline -- packages/canon/<file>` and `git checkout <good-sha> -- packages/canon/<file>`, then run `pnpm validate:canon` and `pnpm test`.

### 6.2 "I deleted a session by accident"

If you have an export bundle for the session: re-import via `importSessionBundle`. Otherwise: restore the session JSON and any referenced snapshots from the most recent `data/` backup, then `pnpm dashboard` to confirm visibility.

Important boundary:

- a session created **after** the backup/export was captured is not recoverable
  from that older artifact
- if you want to rehearse session-deletion recovery, make sure the target
  session already exists in the backup or export bundle before you delete the
  live copy

### 6.3 "Memory items got into a bad state"

Use the dashboard memory surface to inspect the items, then `DELETE /api/memory/:id` to hard-remove. If a transition produced an inconsistent state (e.g. two `accepted` items contradict): use `POST /api/memory/:id/supersede` rather than editing files by hand.

### 6.4 "An accepted canon proposal needs to be rolled back"

Accepted proposals are terminal — they cannot be re-opened. The recovery path is:

1. Open a *new* proposal that reverses the change.
2. Reference the original proposal id in the rationale.
3. Accept the new proposal — it scaffolds its own changelog entry, preserving the full audit trail.

This matches invariant 1 (canon changes are explicit and changelogged).

### 6.5 "The gold baseline for a provider is wrong"

The baseline was promoted by `scripts/refresh-gold-baseline.ts` from a specific report. To roll back:

1. Look in `packages/evals/gold-baselines/archive/` for the previous baseline at the same provider.
2. Move it back into `packages/evals/gold-baselines/<provider>-<canonVersion>.json`.
3. Update `packages/evals/gold-baselines/README.md` with the corrected row.
4. Commit.

If no archive exists, re-run evals against the canon version at which the baseline was promoted, then re-promote.

### 6.6 "I lost `data/` entirely"

`data/` is operator-managed, not generated. If you have no backups, the loss is real — the system will start fresh. Canon, eval reports, and gold baselines are unaffected because they live elsewhere. This is by design: runtime data does not get to silently re-materialize.

To minimize blast radius going forward: see § 2.2 cadence.

## 7. Sanity checks the operator should run after any restore

Restore-ref boundary:

- for the declared release line, prefer a published ref (`origin/master`, a
  release tag, or another pushed branch)
- if the target ref exists only locally, treat the exercise as a
  **branch-local rehearsal**, not as proof that another machine can recover the
  same ref from the remote repository alone

On a fresh clone or freshly restored checkout, install dependencies first:

```powershell
.\scripts\operator-install.ps1
```

Then run the post-restore checks:

```powershell
pnpm validate:canon
pnpm validate:witness
pnpm typecheck
pnpm test
pnpm smoke
```

If those pass, the runtime is healthy enough for an inquiry turn. Run
`.\scripts\operator-start.ps1` and confirm a small inquiry through
`inquiry.html` before resuming normal use.

## 8. What is *not* recoverable

- Provider-side state is opaque to G_5.2. Anthropic / OpenAI / Gemini do not expose a recovery path.
- Anything the operator deleted intentionally (memory items, proposals) without a backup. Deletion is a first-class action and is final.
- A canon edit made outside the editorial workflow that wasn't committed to git. The system has no shadow snapshot of canon — git is the source of truth.

These limits are intentional. They keep the boundary between canon, runtime data, and external providers visible.
