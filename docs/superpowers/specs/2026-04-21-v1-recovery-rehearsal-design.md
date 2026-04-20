# V1 Recovery Rehearsal Design

**Date:** 2026-04-21  
**Status:** proposed  
**Scope:** Post-v1 Milestone 1, Sub-project 2  
**Class:** recovery rehearsal / operator durability  

---

## Summary

This spec defines the second post-v1 Milestone 1 sub-project for G_5.2:

- a **manual operator recovery rehearsal**
- against the declared `v1` line
- using **`git clone` for repo code** and a **full `data/` backup** for runtime state
- restored into a **fresh sibling working directory on the same machine**

The purpose of this sub-project is to prove that the declared `v1` system can be restored and re-verified from documented artifacts alone, without repo surgery or hidden operator knowledge.

This pass does **not** include failure injection. It proves the clean recovery path first. The next rehearsal should deliberately add fault conditions once the normal path is confirmed.

---

## Goal

Prove one end-to-end restore drill for the declared `v1` system in which a fresh operator can:

1. identify the intended restore ref
2. back up the authoritative runtime state that is meant to survive restore
3. restore that state into a fresh clone
4. pass the required verification and startup checks
5. demonstrate one normal inquiry path, one Witness path, and one eval-report inspection path

The result should be a concrete, dated recovery result note stating whether restore truly succeeded from documented artifacts alone.

---

## Why this exists

The repo now has:

- a durable `v1` reference
- a clean Azure-first release declaration chain
- a supported Windows-first operator install/start path

What is still unproven is the restore claim.

`docs/recovery-and-backups.md` already explains what to back up and how recovery is supposed to work. But until the operator actually performs a restore into a fresh environment and records the result, the recovery story is still partly theoretical.

This sub-project closes that gap by turning the recovery docs into an observed operator drill instead of a purely descriptive document.

---

## Design decision

### Chosen path

Use a **manual same-machine restore drill** with:

- **`git clone`** for code recovery
- **full `data/` backup** for runtime-state recovery
- **fresh sibling working directory** as the restore target

### Why this path

This is preferred over copying the live repo tree because the point of the rehearsal is to prove the durable boundary:

- repo state comes from git
- runtime state comes from backup

This is preferred over a fully scripted restore harness because the milestone goal is to expose undocumented operator knowledge. A manual drill is better at showing where the docs are still insufficient.

This is preferred over cross-machine restore for the first pass because same-machine rehearsal reduces noise. It tests the recovery path itself without adding host-migration variables yet.

---

## In scope

### Recovery input capture

Define and execute one recovery-input capture for the drill:

- record the source repo commit / release context
- capture a full backup copy of `data/`
- record whether `.env` is reused, copied, or replaced with an operator-local equivalent for the restored clone

The backup surface for this pass is the real runtime state, not a narrower session-only export.

### Fresh restore target

Restore into a new sibling working directory on the same machine by:

- creating a fresh target directory
- cloning the repo into it
- checking out the intended restore ref explicitly

The restored environment must remain clearly separate from the live source checkout.

### Runtime-state restore

Restore the backed-up `data/` directory into the fresh clone:

- no mixing of live and restored runtime state
- no partial merge with an already-used restore target
- no reliance on the original live repo after backup capture is complete

### Verification and startup checks

Run the required post-restore checks inside the restored clone:

- `pnpm validate:canon`
- `pnpm validate:witness`
- `pnpm typecheck`
- `.\scripts\operator-install.ps1`
- `.\scripts\operator-start.ps1`

The documented Windows operator path is part of the rehearsal itself, not merely a convenience layer.

### Operational proof checks

Confirm the restored system is actually usable by proving:

- one normal inquiry path
- one Witness path
- one eval-report inspection path in the dashboard

### Recovery result note

Write one dated result note recording:

- what was backed up
- where it was restored
- what passed
- what failed
- what still required undocumented operator knowledge
- what should change before the next rehearsal

### Minimal documentation updates

Update recovery/operator docs only if the rehearsal exposes real gaps or misleading guidance.

---

## Out of scope

This sub-project deliberately does **not** include:

- failure injection
- cross-machine restore
- container restore path
- backup automation
- one-click restore tooling
- provider RC follow-up captures
- public-surface, auth, or hostile-network work
- reopening the v1 gate or redefining release scope

---

## Recovery drill flow

### Phase 1 — Capture

The operator should:

1. record the source repo path and current commit / release context
2. confirm the intended restore ref
3. copy `data/` to a dated backup location
4. record how `.env` will be handled for the restored clone

Guardrail:

- after backup capture, the live source checkout is no longer the thing being validated

### Phase 2 — Fresh restore target

The operator should:

1. create a fresh sibling working directory
2. `git clone` the repo into it
3. check out the intended restore ref explicitly

Guardrail:

- the restored clone must not be produced by copying the live repo tree

### Phase 3 — Runtime-state restore

The operator should:

1. copy the backed-up `data/` directory into the fresh clone
2. restore any required operator-local environment material intentionally
3. confirm the restored tree is self-contained

Guardrail:

- do not point the restored clone at the original checkout’s runtime state

### Phase 4 — Verification

The operator should run:

```powershell
pnpm validate:canon
pnpm validate:witness
pnpm typecheck
.\scripts\operator-install.ps1
.\scripts\operator-start.ps1
```

Guardrail:

- these checks must be judged inside the restored clone, not inferred from prior success in the source checkout

### Phase 5 — Operational proof

The operator should confirm:

- one normal inquiry path succeeds
- one Witness path succeeds
- one eval-report inspection path is reachable and usable

This is the minimum proof that restore recovered a usable operator system rather than only a syntactically valid tree.

---

## Recovery inputs and artifacts

### Authoritative restore inputs

For this rehearsal, the authoritative inputs are:

- git history for repo content
- the chosen restore ref
- the backed-up `data/` directory
- operator-local environment material needed to start the system

### Evidence the result note must capture

The drill note must record:

- source commit SHA
- restore ref used
- source repo path
- restore target path
- backup path
- whether `.env` was reused, copied, or recreated
- exact commands run
- pass/fail result for each verification step
- pass/fail result for each operational proof check
- any undocumented assumptions or manual fixes needed
- explicit overall judgment:
  - `restore succeeded from documented artifacts alone`, or
  - `restore succeeded but still depended on undocumented operator knowledge`

That final judgment is the most important output of the whole rehearsal.

---

## Documentation responsibilities

### `docs/recovery-and-backups.md`

Responsibility in this sub-project:

- remain the authoritative recovery reference
- receive clarifications only if the rehearsal exposes real operator gaps

### `docs/operator-quickstart.md`

Responsibility in this sub-project:

- remain the shortest install/start path
- receive restore-related clarifications only if they directly affect operator bootstrap expectations

### `docs/operator-handbook.md`

Responsibility in this sub-project:

- remain the day-to-day runtime reference
- receive clarifications only if the drill exposes missing operational steps

### Recovery result note

Responsibility:

- capture the observed drill outcome as a dated milestone artifact

This note is not a generic how-to. It is the record of what actually happened in the rehearsal.

---

## Failure handling posture

This pass is intentionally a **clean recovery path** rehearsal.

If the drill fails, the operator should record:

- the failing step
- the exact error or blockage
- whether the failure came from bad docs, missing backup assumptions, environment mismatch, or actual product/runtime breakage

The purpose of this pass is not to simulate breakage. It is to learn whether the documented normal path already works.

Failure injection should be reserved for the next rehearsal, after the clean path is either proven or corrected.

---

## Risks and controls

### Risk: the rehearsal accidentally validates the live environment instead of the restored one

Control:

- require a fresh sibling restore target
- record restore target path explicitly
- keep the restored clone clearly separate from the source checkout

### Risk: runtime recovery is faked by reusing live `data/`

Control:

- require a copied backup artifact of `data/`
- restore only from that captured backup

### Risk: the result note becomes vague and non-auditable

Control:

- require exact commands, paths, pass/fail results, and an explicit overall judgment

### Risk: the first recovery rehearsal absorbs too much scope

Control:

- explicitly exclude failure injection, cross-machine restore, and automation from this pass

---

## Success criteria

This sub-project is complete when:

- one full restore drill has been executed against the declared `v1` line
- the restored clone was created by `git clone`, not by copying the live repo
- the restored runtime state came from a captured full `data/` backup
- `pnpm validate:canon` passes in the restored clone
- `pnpm validate:witness` passes in the restored clone
- `pnpm typecheck` passes in the restored clone
- `.\scripts\operator-install.ps1` passes in the restored clone
- `.\scripts\operator-start.ps1` starts the dashboard in the restored clone
- one normal inquiry path works in the restored clone
- one Witness path works in the restored clone
- one eval-report inspection path works in the restored clone
- a dated recovery result note records whether restore succeeded from documented artifacts alone

---

## Follow-on boundary

This sub-project intentionally proves only the clean restore path.

The **next recovery pass** should build on this result by adding deliberate failure injection, such as:

- missing or stale backup material
- malformed or incomplete runtime-state restore
- environment mismatch
- missing supporting operator assumptions

That later rehearsal should test resilience. This one tests whether the baseline recovery story is actually true.
