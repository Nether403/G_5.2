# V1 Recovery Failure-Injection Rehearsal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rehearse one same-machine restore of the declared `v1` line, then inject three bounded failures in the restored clone and prove they can be recovered from documented artifacts alone.

**Architecture:** Treat this as a two-stage operator drill. First establish the same clean restored baseline proven in the prior rehearsal. Then inject each chosen failure one at a time in the restored clone: dashboard port contention, canon-file corruption, and persisted inquiry-session deletion. After each failure, observe the symptom, recover using the intended operator boundary, and re-verify the affected surface before continuing. The durable outputs are a dated result note and only the minimum doc corrections the drill exposes.

**Tech Stack:** PowerShell, git, pnpm, Windows process control, the existing operator wrappers, Markdown docs, file-copy restore operations.

---

## File Structure

- Create: `docs/recovery-drills/2026-04-21-v1-recovery-failure-injection.md`
  Purpose: dated result note for the failure-injection drill, including the clean baseline, each injected fault, observed symptoms, recovery commands, and overall judgment.
- Modify: `docs/recovery-and-backups.md`
  Purpose: capture any recovery-reference clarifications exposed by the injected faults, if needed.
- Modify: `docs/operator-quickstart.md`
  Purpose: capture any startup-path clarifications exposed by the injected faults, if needed.
- Modify: `docs/operator-handbook.md`
  Purpose: capture any operational clarifications exposed by the injected faults, if needed.
- Create: `.local/recovery-failure-injection/2026-04-21-data-backup/`
  Purpose: dated local backup copy of the full `data/` directory used as the authoritative runtime-state restore input for this drill.
- Create: `F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21\`
  Purpose: fresh sibling restore target for the cloned repo plus restored runtime state. This is operational drill state, not a repo file.

## Task 1: Capture Source State And Backup Runtime Data

**Files:**
- Create: `.local/recovery-failure-injection/2026-04-21-data-backup/`
- Later write into: `docs/recovery-drills/2026-04-21-v1-recovery-failure-injection.md`

- [ ] **Step 1: Confirm the source checkout context and record the source commit**

Run:

```powershell
git status --short --branch
git rev-parse HEAD
git rev-parse --short HEAD
git rev-parse refs/tags/v1
```

Expected:

- the source branch context is explicit
- `HEAD` is recorded explicitly
- local `v1` tag SHA is available for reference

- [ ] **Step 2: Create the dated local backup root**

Run:

```powershell
New-Item -ItemType Directory -Force -Path .local\recovery-failure-injection\2026-04-21-data-backup | Out-Null
```

Expected:

- `.local\recovery-failure-injection\2026-04-21-data-backup` exists

- [ ] **Step 3: Copy the full `data/` directory into the backup root**

Run:

```powershell
Copy-Item -LiteralPath .\data -Destination .local\recovery-failure-injection\2026-04-21-data-backup -Recurse -Force
```

Expected:

- `.local\recovery-failure-injection\2026-04-21-data-backup\data\` exists
- backup is a real copy, not a pointer to live runtime state

- [ ] **Step 4: Record how `.env` will be handled for the restore**

Use one of these and record it in the drill note:

- reuse the existing `.env` as operator-local config for the restored clone
- copy `.env.example` and manually fill only what is needed
- copy a redacted/operator-local equivalent

- [ ] **Step 5: Commit nothing yet**

There should be no tracked repo changes required from backup capture itself.

## Task 2: Create The Fresh Restore Target

**Files:**
- Create: `F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21\`
- Later write into: `docs/recovery-drills/2026-04-21-v1-recovery-failure-injection.md`

- [ ] **Step 1: Remove any stale restore target from an earlier aborted drill**

Run:

```powershell
if (Test-Path 'F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21') {
  Remove-Item -LiteralPath 'F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21' -Recurse -Force
}
```

Expected:

- no stale restore target remains

- [ ] **Step 2: Clone the repo into the fresh sibling restore target**

Run:

```powershell
git clone . 'F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21'
```

Expected:

- restore target contains a fresh clone
- restore target was created by `git clone`, not by copying the live repo tree

- [ ] **Step 3: Check out the intended restore ref explicitly**

Run:

```powershell
git -C 'F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21' checkout feature/v1-recovery-rehearsal
git -C 'F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21' rev-parse HEAD
git -C 'F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21' rev-parse --short HEAD
```

Expected:

- restore clone is on the intended ref for the first recovery baseline
- restore commit is recorded explicitly for the result note

- [ ] **Step 4: Confirm the restore target starts without recovered runtime state**

Run:

```powershell
Test-Path 'F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21\data'
```

Expected:

- result is `False`, or the path is absent prior to restore

## Task 3: Restore Runtime State And Establish The Clean Baseline

**Files:**
- Copy into: `F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21\data\`
- Optional copy into: `F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21\.env`
- Later write into: `docs/recovery-drills/2026-04-21-v1-recovery-failure-injection.md`

- [ ] **Step 1: Copy the backed-up `data/` directory into the restored clone**

Run:

```powershell
Copy-Item `
  -LiteralPath .local\recovery-failure-injection\2026-04-21-data-backup\data `
  -Destination 'F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21' `
  -Recurse `
  -Force
```

Expected:

- `F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21\data\` exists

- [ ] **Step 2: Apply the chosen `.env` handling path**

Use exactly one of the following:

```powershell
Copy-Item -LiteralPath .\.env -Destination 'F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21\.env' -Force
```

or

```powershell
Copy-Item -LiteralPath .\.env.example -Destination 'F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21\.env' -Force
```

Expected:

- restore clone has the intended operator-local env file state

- [ ] **Step 3: Run the supported install wrapper in the restored clone**

Run:

```powershell
pwsh -NoProfile -File .\scripts\operator-install.ps1
```

Workdir:

```text
F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21
```

Expected:

- install wrapper passes

- [ ] **Step 4: Prove the same clean restored baseline as the first rehearsal**

Run enough of the baseline to confirm:

- `pnpm validate:canon`
- `pnpm validate:witness`
- `pnpm typecheck`
- `.\scripts\operator-start.ps1`
- one normal inquiry/session path
- one Witness path
- one eval-report inspection path

This step is complete only when the result note can state that the restored environment was healthy **before** any failure was injected.

## Task 4: Inject And Recover Dashboard Port Contention

**Files:**
- Later write into: `docs/recovery-drills/2026-04-21-v1-recovery-failure-injection.md`

- [ ] **Step 1: Intentionally occupy the default dashboard port**

Use a bounded local listener on the expected dashboard port before starting the wrapper.

Expected:

- the port is genuinely occupied by the injected conflict

- [ ] **Step 2: Run `.\scripts\operator-start.ps1` and observe the symptom**

Expected:

- startup does not succeed normally
- the symptom is captured explicitly for the result note

- [ ] **Step 3: Recover from the port conflict**

Recover by one of:

- stopping the conflicting listener, or
- setting an explicit alternate `DASHBOARD_PORT`

Expected:

- the dashboard becomes reachable afterward

- [ ] **Step 4: Record exact fault, symptom, and recovery**

The result note must capture:

- how the port was occupied
- what `operator-start.ps1` did under the conflict
- how the port conflict was resolved

## Task 5: Inject And Recover Canon Corruption

**Files:**
- Later write into: `docs/recovery-drills/2026-04-21-v1-recovery-failure-injection.md`

- [ ] **Step 1: Corrupt one active canon file in the restored clone**

Pick a file already covered by `pnpm validate:canon`, such as:

- `packages/canon/manifest.yaml`
- `packages/canon/continuity-facts.yaml`
- `packages/canon/glossary.yaml`

Expected:

- the corruption is explicit and reversible

- [ ] **Step 2: Observe the validation failure**

Run:

```powershell
pnpm validate:canon
```

Expected:

- validation fails and points to the corrupted canon state

- [ ] **Step 3: Restore the canon file from git in the restored clone**

Use the documented recovery path, for example:

```powershell
git checkout HEAD -- packages/canon/<file>
```

Expected:

- the file is restored from git, not hand-edited back into shape

- [ ] **Step 4: Re-run validation successfully**

Run:

```powershell
pnpm validate:canon
```

Expected:

- validation passes again

## Task 6: Inject And Recover Persisted Inquiry-Session Deletion

**Files:**
- Later write into: `docs/recovery-drills/2026-04-21-v1-recovery-failure-injection.md`

- [ ] **Step 1: Choose one restored inquiry session as the deletion target**

Prefer a session already used in the clean baseline proof so the before/after effect is easy to observe.

- [ ] **Step 2: Delete the session JSON from the restored clone**

Delete only the chosen session artifact in the restored clone. Do not delete the backup copy.

Expected:

- the session is absent from the restored clone

- [ ] **Step 3: Observe the missing-session symptom**

Use the relevant API or dashboard path, for example:

- session list no longer includes the target session, or
- direct session read returns not found

Expected:

- the missing runtime artifact is observable through the documented operator surface

- [ ] **Step 4: Restore the deleted session from the captured backup**

Recover the deleted file from:

- `.local\recovery-failure-injection\2026-04-21-data-backup\data\...`

Expected:

- the target session file is restored from backup, not recreated manually

- [ ] **Step 5: Prove the session is visible again**

Use the same API or dashboard path as in Step 3.

Expected:

- the deleted session is visible again

## Task 7: Final Re-Verification And Result Note

**Files:**
- Create: `docs/recovery-drills/2026-04-21-v1-recovery-failure-injection.md`

- [ ] **Step 1: Re-run the minimum post-recovery checks**

Run in the restored clone:

```powershell
pnpm validate:canon
pnpm validate:witness
pnpm typecheck
```

And prove:

- dashboard start works
- one normal inquiry/session path works
- one Witness path works
- one eval-report inspection path works

- [ ] **Step 2: Write the failure-injection result note**

Create `docs/recovery-drills/2026-04-21-v1-recovery-failure-injection.md` with this structure:

```md
# V1 Recovery Failure-Injection Rehearsal — 2026-04-21

**Status:** <bounded failures recovered from documented artifacts alone | bounded failures recovered but depended on undocumented operator knowledge | failed>

## Source

- source repo path: `...`
- source commit SHA: `...`
- restore ref: `...`
- backup path: `...`
- restore target path: `...`
- `.env` handling: `...`

## Baseline restore

- <how the clean restored baseline was established>

## Injected failures

### 1. Port contention

- fault injected:
- symptom observed:
- recovery performed:
- recovery confirmed:

### 2. Canon corruption

- fault injected:
- symptom observed:
- recovery performed:
- recovery confirmed:

### 3. Session deletion

- fault injected:
- symptom observed:
- recovery performed:
- recovery confirmed:

## Final verification

- `pnpm validate:canon` — `<pass/fail>`
- `pnpm validate:witness` — `<pass/fail>`
- `pnpm typecheck` — `<pass/fail>`
- dashboard start — `<pass/fail>`
- normal inquiry/session path — `<pass/fail>`
- Witness path — `<pass/fail>`
- eval-report inspection path — `<pass/fail>`

## Friction and undocumented knowledge

- <bullet list of real gaps, if any>

## Judgment

<explicit statement of whether bounded failures were recovered from documented artifacts alone>

## Next changes

- <doc gaps or follow-up fixes>
```

- [ ] **Step 3: Apply minimal doc corrections only if justified**

Only proceed if the drill exposed:

- unclear startup-failure handling
- unclear canon recovery handling
- unclear runtime backup restore handling

If no doc gaps were exposed, skip doc edits and state that explicitly in the final summary.

## Task 8: Final Verification And Commit

**Files:**
- Create: `docs/recovery-drills/2026-04-21-v1-recovery-failure-injection.md`
- Modify: `docs/recovery-and-backups.md` if needed
- Modify: `docs/operator-quickstart.md` if needed
- Modify: `docs/operator-handbook.md` if needed

- [ ] **Step 1: Re-run focused operator-path verification in the branch checkout**

Run:

```powershell
pnpm test:operator-path
```

Expected:

- operator-path helper coverage still passes

- [ ] **Step 2: Confirm the branch checkout is clean apart from the intended docs**

Run:

```powershell
git status --short --branch
```

Expected:

- only the result note and any justified doc updates are present

- [ ] **Step 3: Commit the rehearsal artifacts**

If only the result note was added:

```bash
git add docs/recovery-drills/2026-04-21-v1-recovery-failure-injection.md
git commit -m "docs: record recovery failure-injection rehearsal"
```

If doc clarifications were also needed:

```bash
git add docs/recovery-drills/2026-04-21-v1-recovery-failure-injection.md docs/recovery-and-backups.md docs/operator-quickstart.md docs/operator-handbook.md
git commit -m "docs: record recovery failure-injection rehearsal"
```

---

## Self-Review

### Spec coverage

- clean baseline restored before failures: covered by Tasks 1 through 3
- dashboard port contention injection and recovery: covered by Task 4
- canon corruption injection and git-based recovery: covered by Task 5
- persisted inquiry-session deletion and backup-based recovery: covered by Task 6
- final re-verification: covered by Task 7
- dated drill note with explicit failure evidence and judgment: covered by Task 7
- minimal doc corrections only if exposed by the drill: covered by Task 7 and Task 8

### Placeholder scan

- No `TBD`, `TODO`, or "implement later" markers remain.
- All restore, failure, recovery, and evidence paths are concrete enough to execute.

### Type and interface consistency

- The restore target path is consistently `F:\ProcessoErgoSum\G_5.2-recovery-failure-injection-2026-04-21`.
- The backup path is consistently `.local/recovery-failure-injection/2026-04-21-data-backup`.
- The durable tracked output is consistently `docs/recovery-drills/2026-04-21-v1-recovery-failure-injection.md`.
