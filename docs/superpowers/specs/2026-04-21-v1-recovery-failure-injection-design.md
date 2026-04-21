# V1 Recovery Failure-Injection Rehearsal Design

**Date:** 2026-04-21  
**Status:** proposed  
**Scope:** Post-v1 Milestone 1, follow-on recovery sub-project  
**Class:** recovery rehearsal / failure injection / operator durability

---

## Summary

This spec defines the **second recovery rehearsal pass** for the declared `v1`
line of G_5.2.

Unlike the first rehearsal, which proved the clean restore path, this pass
deliberately injects bounded operator-relevant failures **after** a clean
restore has succeeded.

The purpose is not to break the product arbitrarily. The purpose is to test
whether a documented operator can:

1. recognize the failure cleanly
2. recover using the intended system boundary
3. prove the restored environment is healthy again

This pass remains:

- same-machine
- operator-only
- Windows-first
- `git clone` for code plus full `data/` backup for runtime state

It does **not** introduce product-code changes as part of the recovery itself.

---

## Goal

Prove one failure-injection recovery rehearsal in which a fresh sibling restore
clone first reaches the same healthy state established in the clean pass, then
survives a small set of explicit recoverable failures without hidden operator
knowledge.

The output should be a dated drill note stating:

- which failures were injected
- what symptoms appeared
- how recovery was performed
- which paths were successfully re-verified afterward
- what documentation or operator assumptions were still missing

---

## Why this exists

The first rehearsal already established that:

- a fresh clone plus the captured `data/` backup is sufficient to recover the
  system
- the restored dashboard can serve one normal inquiry path, one Witness path,
  and one eval-report path
- the restore story is real, not theoretical

That is necessary, but it is not enough for Milestone 1 durability.

An operator release also needs evidence that common bounded failures can be
recognized and corrected without falling back to repo surgery, guesswork, or
product edits.

The second pass therefore moves from:

- "can we restore a healthy system?"

to:

- "can we recover a restored system from realistic, controlled failures?"

---

## Design decision

### Chosen structure

Use a **two-stage rehearsal**:

1. perform the same clean restore baseline proven in the first drill
2. inject a small number of explicit failures one at a time and recover after
   each one

### Why this structure

This keeps causal clarity.

If the system is already broken before the first injected fault, the drill is no
longer measuring resilience. It is only re-testing baseline recovery. By
requiring a clean restored starting point, each later failure can be judged on
its own merits.

This also keeps the pass auditable:

- baseline restore success is known
- failure symptoms are attributable
- recovery steps can be evaluated separately

---

## Chosen failure injections

This pass uses **three** bounded failures.

### Failure 1 — dashboard port contention

Inject:

- bind the default dashboard port before running `.\scripts\operator-start.ps1`

Why this is included:

- it is a real operator-facing startup problem
- the first rehearsal already surfaced adjacent listener-cleanup friction
- it tests whether the startup path and operator docs make port conflicts
  legible instead of ambiguous

Expected recovery posture:

- identify the occupied port
- stop the conflicting listener or override `DASHBOARD_PORT`
- prove the dashboard becomes reachable afterward

### Failure 2 — canon file corruption in the restored clone

Inject:

- deliberately corrupt one active canon file in the restored clone

Why this is included:

- `docs/recovery-and-backups.md` already defines a canon-file recovery path
- it tests the strongest repo-side authority boundary: code and canon recover
  from git, not from hand-edits
- it is operator-relevant and easy to verify with `pnpm validate:canon`

Expected recovery posture:

- observe `pnpm validate:canon` failure
- restore the file from git in the restored clone
- rerun validation successfully

### Failure 3 — persisted inquiry-session deletion from the restored clone

Inject:

- delete one restored inquiry-session JSON that the dashboard surface depends on

Why this is included:

- runtime recovery is the whole point of the backup boundary
- `data/` is explicitly operator-managed and non-regenerable
- the recovery docs already define an operator path for a deleted session
- it tests whether recovery truly comes from the captured backup rather than
  from live process memory or accidental source-tree reuse

Expected recovery posture:

- observe the missing session at the API or dashboard surface
- restore the deleted session artifact from the captured backup
- prove the affected surface works again

---

## Failure selection rules

The injected failures in this pass must all satisfy these constraints:

- operator-relevant
- observable through the documented operator surface
- recoverable without changing product code
- recoverable within the restored clone or its captured backup material
- narrow enough that cause and effect remain obvious

This pass must **not** inject failures that require:

- schema invention
- speculative data surgery
- provider-side failure simulation
- production-infrastructure branches
- multi-user or auth assumptions

---

## In scope

### Clean restore baseline

Repeat the first-pass recovery baseline far enough to establish:

- fresh sibling clone created by `git clone`
- captured full `data/` backup restored into the clone
- operator-local env restored intentionally
- `.\scripts\operator-install.ps1` completes
- dashboard startup is achievable

The baseline may reuse the first pass procedure, but it must still be executed
again for this new drill.

### Sequential failure injection

Inject the chosen failures **one at a time** after the baseline is healthy.

Each failure must be:

- introduced intentionally
- observed explicitly
- recovered before the next injected failure begins

### Recovery evidence

For each injected failure, capture:

- exact fault introduced
- exact command that exposed the symptom
- exact recovery command or sequence
- pass/fail result after recovery

### Minimal documentation updates

Only update docs if the failure-injection drill exposes a real missing recovery
assumption, unclear startup behavior, or incomplete operator guidance.

---

## Out of scope

This sub-project does **not** include:

- product-code changes to make the failures disappear
- cross-machine restore
- backup automation
- one-click repair tooling
- provider quota / RC follow-up
- public-surface or auth work
- hostile-network or abuse hardening
- synthetic corruption of every runtime class
- queued Witness delivery restart-reconciliation failure injection in this pass

---

## Drill flow

### Phase 1 — establish a clean restored baseline

Repeat the clean rehearsal flow until the restored clone is healthy enough to
prove:

- operator install succeeds
- operator start succeeds
- one normal inquiry path works
- one Witness path works
- one eval-report inspection path works

This is the baseline checkpoint.

### Phase 2 — inject and recover port contention

The operator should:

1. occupy the default dashboard port intentionally
2. run `.\scripts\operator-start.ps1`
3. observe the startup symptom
4. recover by freeing the port or using an explicit alternate port
5. prove the dashboard is reachable again

### Phase 3 — inject and recover canon corruption

The operator should:

1. corrupt one active canon file in the restored clone
2. run `pnpm validate:canon`
3. observe the validation failure
4. restore the file from git in the restored clone
5. rerun `pnpm validate:canon` successfully

### Phase 4 — inject and recover runtime-state deletion

The operator should:

1. delete the chosen restored inquiry-session JSON from the restored clone
2. observe the missing session through the relevant API or dashboard path
3. restore the session artifact from the captured backup
4. prove the affected surface works again

### Phase 5 — final re-verification

After all failures have been recovered, rerun the minimum checks needed to prove
the restored environment is healthy again.

At minimum:

- `pnpm validate:canon`
- `pnpm validate:witness`
- `pnpm typecheck`
- `.\scripts\operator-start.ps1`
- one normal inquiry or session inspection path
- one Witness path
- one eval-report inspection path

---

## Evidence requirements

The result note for this pass must record:

- source commit SHA
- restore target path
- backup path
- baseline clean-restore success
- each injected failure
- each observed symptom
- each recovery command
- post-recovery pass/fail state
- final overall judgment

For each failure, the note should make this explicit:

- `fault injected`
- `symptom observed`
- `recovery performed`
- `recovery confirmed`

This note must be specific enough that another operator can understand what
failed and why the recovery was considered successful.

---

## Success criteria

This sub-project is complete when all of the following are true:

- a fresh restored baseline was established again in a new clone
- dashboard port contention was injected, recognized, and recovered
- canon corruption was injected, recognized, and recovered
- one persisted inquiry-session deletion was injected, recognized, and
  recovered from the captured backup
- the restored environment passed the required post-recovery checks
- a dated result note records the exact failure and recovery evidence
- any newly exposed operator-doc gaps were corrected minimally

---

## Failure judgment posture

This pass is successful if it proves one of these outcomes clearly:

- `bounded failures were recovered from documented artifacts alone`

or

- `bounded failures were recoverable, but still depended on undocumented
  operator knowledge`

The pass is **not** successful if it only says "something failed but we got it
working again." The judgment must stay explicit about whether the operator path
was actually documented and defensible.

---

## Follow-on boundary

If this pass succeeds, the next recovery-related work should only escalate where
the evidence justifies it, for example:

- cross-machine restore
- a stronger backup bundle layout
- more targeted Witness-specific runtime failure cases
- queued Witness delivery restart-reconciliation failure cases once the remote
  delivery environment is explicitly in scope
- scripted repair helpers for problems that were already proven manually

Those belong **after** this bounded same-machine failure-injection pass, not
inside it.
