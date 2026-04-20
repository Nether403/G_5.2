# G_5.2 Codex Handoff Summary — archived session recovery

**Status:** reference-only historical handoff.

This note was useful for resuming work after an archived Codex session failed mid-implementation. The queued remote delivery work it described has since been completed and merged, so this file should now be read only as project-history context, not as a current resume point or authority document.

## Purpose
This handoff is a compact restart brief for the next Codex session after the archived long-running session ended with a usage/rate-limit failure during the queued remote delivery slice.

It is written from:
- the archived Codex session log (`rollout-2026-04-17...jsonl`)
- the queued remote delivery design and implementation-plan files attached here
- the current project authority docs already uploaded into this project

## Current authority / interpretation frame
Use this order when context conflicts:
1. live code
2. current `README.md` and the docs it names as authoritative
3. `CURRENT_MISSION_AND_AUTHORITY_ORDER.md`
4. `Architecture-Note-How-G_5.2,-P-E-S,-and-the-Witness-Inquisitor-Fit-Together.txt`
5. this handoff
6. historical / lineage / narrative archive

The current mission is **not** narrative reconstruction.
The current mission is **Witness-first hardening of G_5.2 as a governed inquiry runtime**.

## Locked decisions that should not be casually reopened
- `G_5.2` remains the shared runtime / brain repo.
- Witness / Inquisitor remains the primary serious consumer.
- P-E-S remains the secondary public / educational consumer.
- One monorepo.
- One operator dashboard.
- No “neutral kernel rewrite first”.
- Archive / lineage material is historically important but not current implementation authority.

## What the archived Codex session accomplished
The session was not just planning. It moved substantial Witness-first work forward.

### 1. Witness-first pivot was implemented, not just discussed
The session began from the pivot request: use `G_5.2` as the framework for the Witness Inquisitor, with Witness taking priority over the earlier G_5.2-only path.

The resulting repo interpretation was:
- shared runtime surfaces stay in `packages/orchestration`, `packages/evals`, and `apps/dashboard`
- `packages/canon` remains the P-E-S policy root
- Witness gets its own policy/package boundary (`packages/inquisitor-witness` in the architecture framing)
- product identity, memory, storage, and governance must remain separated even though the runtime is shared

### 2. First Witness vertical slice landed
By the time the session moved on, the repo had already been pushed through the first serious Witness implementation layer, including:
- product-aware runtime / dashboard behavior
- Witness-specific storage separation
- consent gating
- testimony persistence
- eval and smoke coverage for the first Witness slice
- compensation-based rollback for persistence-failure handling

The user explicitly reviewed this slice and only called out one remaining hardening weakness at that time: **session/testimony persistence was not yet fully atomic**, which then drove follow-up tightening work.

### 3. Witness hardening and acceptance work continued
The session then moved through:
- rollback / compensation hardening
- documentation reconciliation to match actual repo state
- Witness eval-expansion planning and implementation
- provider / routing work around OpenRouter vs direct Azure/OpenAI behavior
- budget-diagnostics cleanup so trim logging became useful instead of noisy

### 4. Repo hygiene / branch cleanup happened
During the session, the earlier `feature/witness-vertical-slice` branch was accidentally merged/deleted and then reconciled.
The repo was checked against GitHub `master`, the merge state was reviewed, and the stale local feature branch was intentionally removed after confirmation.

### 5. Witness packaged export slice was completed before queued delivery started
Immediately before the final queued-delivery work, the session had already completed the packaged export layer.
That means queued remote delivery is **not** the first Witness publication step; it is the next layer **on top of** the existing package + delivery-attempt model.

## Current repo truth at handoff time
By the time the archived session reached its final stage, the working truth was approximately:
- Witness-first pivot is the active direction
- shared runtime model is still correct
- first Witness vertical slice exists
- publication package / packaged export work exists
- next active feature is queued/background remote delivery for Witness publication packages

## Final active task when the session died
The last active effort was the queued remote delivery feature.
Two documents define that slice:
- `2026-04-20-witness-queued-remote-delivery-design.md`
- `2026-04-20-witness-queued-remote-delivery.md`

### Design intent of that slice
Add queued/background delivery on top of the existing package and per-attempt delivery model.

Key design choices already settled in the attached design/plan:
- keep the publication package as the artifact of record
- keep `PublicationDeliveryRecord` as the concrete upload-attempt audit log
- add a separate `PublicationDeliveryJobRecord` for queued work
- use a small in-process worker loop inside the dashboard/server
- one active job at a time
- explicit restart reconciliation for stale `in_progress` jobs
- manual retry only
- operator-facing enqueue/list/detail/retry routes and UI actions

## Exact stop point in the archived session
The session did **not** stop at planning only.
It got into implementation in an isolated worktree/branch for queued delivery.

### Worktree / branch context
The session created a dedicated queued-delivery worktree on:
- branch: `feature/witness-queued-remote-delivery`
- worktree path: `.worktrees/witness-queued-remote-delivery`

Baseline status in that worktree before new work:
- dependency sync done
- baseline `pnpm test` green

### Task sequencing at the stop point
The queued-delivery plan was being executed task-by-task.

#### Task 1 status: implemented, then reviewed, then tightened
Task 1 was the shared queued-job types + file-backed job store slice.

Initial implementation landed, but review found three store-level concerns:
- `ENOENT` during a scan could incorrectly make the queue look empty
- caller-supplied duplicate ids could silently overwrite an existing job
- “oldest queued job” ordering was not strictly FIFO if timestamps tied and later saves changed ordering

A follow-up fix worker then addressed those concerns.

### What was changed in that follow-up
In the queued-delivery worktree, the follow-up changed the job-store slice so that:
- `list()` treats `ENOENT` per-file instead of aborting the whole scan
- `create()` writes with no-overwrite semantics and raises a duplicate-job error on id collision
- queue ordering is explicit and FIFO-safe via a persisted `queueOrder` field
- tests were expanded for disappearing-file tolerance, duplicate-id protection, and FIFO behavior on tied `createdAt`

### Verification result at the exact end
The last successful verification reported in the archived session was:
- `pnpm --filter @g52/orchestration exec tsx --test src/witness/fileStores.test.ts`
- result: `14` tests passed, `0` failed

### Last known commit inside the queued-delivery worktree
The last recorded commit SHA from the subagent for the Task 1 follow-up was:
- `42bec710da5aa52a19548040e1b66dc0f868703c`

### Why the session stopped
The main Codex session then hit a usage limit before it could:
- finish the parent-session review/write-up of the fixed Task 1 slice
- open Task 2 for the queue runtime / worker semantics
- continue with the remaining server/UI/smoke/docs tasks in the plan

So the session ended **after Task 1 + fix implementation was complete in the queued-delivery worktree, but before full continuation / integration of the rest of the plan**.

## Practical next-step for the new Codex session
The next session should begin by checking the queued-delivery worktree and confirming the actual on-disk state before doing anything else.

Recommended first commands / checks:
1. Inspect branch/worktree status for `feature/witness-queued-remote-delivery`.
2. Confirm whether the Task 1 commits are present locally and whether the design/plan docs are committed in the relevant branch.
3. Re-run the focused store tests for Task 1.
4. Review the current file contents against the attached plan/design docs.
5. Only then resume with **Task 2: queue runtime and worker semantics**.

## Resume point after validation
If the worktree state matches the archived session, resume from:
- `packages/orchestration/src/witness/publicationDeliveryQueue.ts`
- `packages/orchestration/src/witness/publicationDeliveryQueue.test.ts`

Then continue through the remaining queued-delivery plan in order:
1. queue runtime / reconciliation / retry helpers
2. dashboard server routes and worker lifecycle wiring
3. inquiry/dashboard UI updates
4. smoke tests
5. README / operator docs
6. final validation and integration review

## What the next session should optimize for
- finish the queued remote delivery slice cleanly
- preserve package-vs-job-vs-attempt boundaries
- keep Witness storage / policy separation intact
- avoid reopening the monorepo and Witness-first architecture decisions
- maintain eval/smoke-backed acceptance discipline
- keep operator-facing behavior legible and auditable

## One-paragraph version
G_5.2 is already in its Witness-first phase: the shared runtime architecture is locked, the first Witness vertical slice and packaged export layer are already in place, and the archived session died while implementing the **next** Witness publication layer: queued/background remote delivery. The last session got as far as building and tightening Task 1 of that queued-delivery slice in `feature/witness-queued-remote-delivery` / `.worktrees/witness-queued-remote-delivery`, including a reviewed fix for ENOENT scan handling, duplicate-id overwrite protection, and FIFO queue ordering, with focused store tests passing. The next Codex session should first verify that local worktree state, then resume at Task 2 of the queued-delivery plan rather than re-deriving the architecture.
