# G_5.2 Canonical Demo Paths

**Status:** authoritative list of the demo paths every v1-grade installation must be able to walk. Each path is exercised end-to-end (with the mock provider) by `pnpm smoke` (`scripts/smoke-tests.ts`). Real-provider demos follow the same script.

These paths exist to prove, with one command, that the system still works as designed. They are not a replacement for the eval suite; they are the operator's "is the box on?" check.

## 1. Inquiry turn

**What it proves:** canon loads, the `draft → critique → revise` pipeline runs, the turn persists with a first-class context snapshot, `runMetadata` is captured, and the session is replayable.

**Steps:**
1. Run `runSessionTurn` against `packages/canon/` with a mock provider and a fresh `data/` directory.
2. Verify the persisted session has `schemaVersion`, the turn carries a `contextSnapshotId` and `runMetadata` (provider, model, canon version, prompt revision, pipeline revision, captured-at).
3. Load the snapshot via `FileContextSnapshotStore` and confirm it matches the user message.
4. Replay the turn from the snapshot via `replayTurn(null, …)` (no provider call) and assert that `final` matches the persisted assistant message.

**UI walk:** open `inquiry.html`, start a new session, submit a turn, click the turn to inspect its trace and retrieved context.

## 2. Memory governance

**What it proves:** memory items move through the typed state machine, only `accepted` items are retrievable into context, deletion is final, and provenance is preserved.

**Steps:**
1. Create a `user_preference` memory item via `FileMemoryStore.upsert` (origin `turn`).
2. Confirm it lands as `accepted` (turn-origin items auto-accept).
3. Manually create a second item via the operator path; confirm it lands as `proposed` and is *not* retrievable.
4. Approve it; confirm it becomes `accepted` and *is* retrievable.
5. Hard-delete it; confirm it is gone.

**UI walk:** dashboard → memory → create → approve → delete.

## 3. Canon proposal

**What it proves:** the editorial workflow is the only path that mutates canon, line-level diffs are computable, accept produces a changelog entry, and reject is terminal.

**Steps:**
1. Create a temp canon root by copying the editable canon files.
2. Create a `pending` proposal modifying `voice.md` (just append a single sentence).
3. Compute the line diff and assert it is non-empty.
4. Mark the proposal `accepted` and call `applyProposal`; assert `voice.md` now contains the new sentence.
5. Call `scaffoldChangelogEntry`; assert a new file appears under `<canonRoot>/changelog/NNNN-<slug>.md` with the rationale and provenance.

**UI walk:** editorial.html → choose `voice.md` → edit → submit → review diff → accept with reviewer note → confirm changelog entry exists.

## 4. Reflection authoring

**What it proves:** reflection topics + runs are governed; authored artifacts go through `draft → approved → publishing_ready`; promotion to canon writes a *pending* proposal and never silently mutates canon.

**Steps:**
1. Create a reflection topic via `FileReflectionStore.createTopic`.
2. Run `runReflection` with a mock provider against `packages/canon/`; assert `status === "completed"`, `canonVersion` matches a semver, and `final === revision`.
3. Create an authored artifact via `FileAuthoredArtifactStore.create`; assert `status === "draft"`.
4. Refuse promotion: `promoteArtifactToProposal` must throw for a draft.
5. Transition to `approved`; promote; assert a pending canon proposal file exists and references the artifact id.

**UI walk:** authoring.html → topics → create → run → artifacts → approve → propose-to-canon → confirm a pending proposal appears in editorial.html.

## 5. Reports & diff

**What it proves:** eval reports validate against the persisted schema, gold baselines refuse promotion when critical cases fail, and dashboard diffs surface subsystem and prompt-level deltas.

**Steps (smoke variant):**
1. Build a synthetic minimal report (no provider call required) with two critical cases — one passing, one failing — and validate it via `validateReport`.
2. Attempt promotion via the same logic as `scripts/refresh-gold-baseline.ts`; assert it refuses because of the critical failure.
3. Build a second synthetic report with all critical cases passing; assert promotion succeeds (into a temp baselines dir).

**UI walk:** dashboard → reports → click a report → diff against another report → confirm subsystem and prompt deltas render.

**Real-provider walk:** `pnpm evals -- --trace`, then dashboard → reports → diff. Critical-case failures must show the merge-blocking banner.

## 6. Backup round-trip

**What it proves:** sessions and their context snapshots survive export → import → reload without loss, and schema versions are preserved.

**Steps:**
1. Run an inquiry turn (path 1).
2. `exportSessionBundle` to a temp file.
3. `importSessionBundle` into a fresh sessions root.
4. Reload the session via `FileSessionStore.load`; assert turn count, `contextSnapshotId`, and snapshot user-message match the original.

**UI walk:** there is no UI for archive bundles in v1; this is operator tooling. See `docs/recovery-and-backups.md` § 3.

## 7. How to run all of these

```bash
pnpm smoke
```

Exit codes:
- `0` — every demo path passed
- non-zero — at least one path failed; the failure is printed with the path name

`pnpm smoke` requires no API keys; it uses the mock provider. To walk the same paths against a real provider, run them through the dashboard with `OPENROUTER_API_KEY` set.

## 8. Why these and not others

The six paths above were chosen because each one exercises a distinct invariant or subsystem boundary:

| Path | Subsystem touched | Invariant exercised |
|---|---|---|
| Inquiry turn | Orchestration, persistence | 1, 4 |
| Memory governance | Memory | 3 |
| Canon proposal | Editorial workflow, canon | 1, 2 |
| Reflection authoring | Reflection workflow | 2 |
| Reports & diff | Evals, dashboard | 4 |
| Backup round-trip | Persistence | 1 (preservation) |

Adding new demo paths is welcome — but they should map to a real subsystem boundary, not a feature wishlist. Update this doc and `scripts/smoke-tests.ts` together.
