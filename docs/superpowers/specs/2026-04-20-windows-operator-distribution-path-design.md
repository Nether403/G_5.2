# Windows Operator Distribution Path Design

**Date:** 2026-04-20  
**Status:** proposed  
**Scope:** Post-v1 Milestone 1, Sub-project 1  
**Class:** operator distribution / portability  

---

## Summary

This spec defines the first post-v1 portability sub-project for G_5.2:

- a **Windows-first local operator distribution path**
- implemented as a small PowerShell script pair
- documented as the primary supported install/start flow for the declared `v1` release line

The purpose of this sub-project is to turn the newly declared `v1` state into a repeatable operator workflow that can be installed, verified, and started on a trusted Windows host without repo surgery or tribal knowledge.

This spec does **not** include the recovery drill itself. It creates the install/start path that the later recovery rehearsal will consume.

---

## Goal

Provide one supported Windows-first operator path that allows a fresh trusted-host operator to:

1. verify that the repo is in a valid runnable state
2. identify the current release/commit context
3. start the dashboard through a stable documented wrapper

The result should be good enough that later portability and recovery work can build on it without reopening the v1 release gate.

---

## Why this exists

The repo has already crossed the v1 threshold under the Azure-first operator scope. What is still missing is a distribution path that makes that release durable in practice.

Right now, the operator flow is still implicit:

- know which commands to run
- know that `.env` matters
- know the validation stack
- know how to tell whether the current checkout is the declared release

That is acceptable for a dev repo, but weaker than it should be for a declared operator release.

This sub-project closes that gap by giving the repo:

- one supported Windows-first install path
- one supported Windows-first start path
- visible release identity at install/start time
- one short operator quickstart that points to the right commands

---

## Design decision

### Chosen path

Use a **PowerShell script pair**:

- `scripts/operator-install.ps1`
- `scripts/operator-start.ps1`

### Why this path

This is preferred over a single bootstrap script because install/verify and daily startup are different responsibilities.

This is preferred over a container path because Post-v1 Milestone 1 is intentionally conservative and Windows-first. A container would add another operator surface before the simple local path is proven.

This is preferred over a more formal packaged installer because that would introduce packaging mechanics before the repo has even established the minimal supported operator flow.

---

## In scope

### Scripted install/verify wrapper

Add a Windows PowerShell install script that:

- assumes the operator is already inside a clone of the repo
- checks that it is being run from the expected repo root
- checks prerequisite availability for `node` and `pnpm`
- runs the standard local verification chain
- fails fast on the first broken step
- prints a short release/context summary on success

### Scripted dashboard start wrapper

Add a Windows PowerShell start script that:

- assumes the repo has already been installed successfully
- loads `.env` if present
- prints the dashboard URL plus release identity
- starts `pnpm dashboard`

### Operator quickstart documentation

Add one short operator-facing quickstart doc that describes:

- prerequisites
- first install
- `.env` setup expectations
- start flow
- post-update revalidation flow
- how to confirm whether the checkout is exactly `v1`

### Light linkage updates

Update `README.md` and `docs/operator-handbook.md` to point to the quickstart rather than forcing the operator to infer the preferred bootstrap path from scattered setup notes.

---

## Out of scope

This sub-project deliberately does **not** include:

- the recovery drill itself
- provider baseline follow-up captures
- containerization
- Windows service setup
- background process management
- automatic Node/pnpm installation
- `.env` generation beyond documented copy/setup guidance
- auto-update logic
- Linux/macOS first-class support
- public, multi-user, or hostile-host posture work

---

## Operator flow

### First install

Expected Windows-first happy path:

1. Clone the repo or obtain the repo at the intended ref.
2. Optionally copy `.env.example` to `.env`.
3. Fill only the environment variables relevant to the operator's scope.
4. Run:

```powershell
.\scripts\operator-install.ps1
```

5. On success, run:

```powershell
.\scripts\operator-start.ps1
```

### Post-update flow

The update path remains explicit and local:

1. `git pull`
2. `.\scripts\operator-install.ps1`
3. `.\scripts\operator-start.ps1`

No separate update script is introduced in this milestone.

---

## File responsibilities

### `scripts/operator-install.ps1`

Responsibility:

- bootstrap and verify the repo on a trusted Windows host

Behavior:

- verify repo-root assumptions
- verify prerequisites
- run:
  - `pnpm install`
  - `pnpm validate:canon`
  - `pnpm validate:witness`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm smoke`
- print:
  - current commit short SHA
  - whether `HEAD` equals the `v1` tag target
  - a plain success/failure summary

Non-responsibilities:

- no background service setup
- no provider-key validation
- no runtime launch
- no auto-remediation beyond actionable error messaging

### `scripts/operator-start.ps1`

Responsibility:

- start the dashboard consistently from the repo root on Windows

Behavior:

- verify minimum repo/install assumptions
- load `.env` into the process environment if present
- print:
  - current commit short SHA
  - whether `HEAD` equals the `v1` tag target
  - dashboard URL
- run `pnpm dashboard`

Non-responsibilities:

- no full verification suite
- no update/install workflow
- no service registration

### `docs/operator-quickstart.md`

Responsibility:

- shortest supported path from clone to running dashboard

Content:

- prerequisites
- Windows-first install
- `.env` expectations
- start
- update/revalidate
- how to tell whether the checkout is exactly `v1`

### `README.md`

Responsibility in this sub-project:

- point to the quickstart as the preferred Windows-first operator bootstrap path

### `docs/operator-handbook.md`

Responsibility in this sub-project:

- remain the detailed day-to-day operations reference
- cross-link to the quickstart for install/start/update bootstrap

---

## Failure handling

The scripts should be strict and explicit.

### `operator-install.ps1` should stop immediately if:

- `node` is missing
- `pnpm` is missing
- the script is not being run from the repo root
- any verification command fails

It should print:

- which step failed
- the exact command that failed
- a short suggestion for what the operator should inspect next

It should **not**:

- auto-install prerequisites
- modify `.env`
- guess at missing provider credentials
- continue after a failed verification step

### `operator-start.ps1` should stop if:

- expected repo files are missing
- dependencies appear not to be installed
- dashboard launch fails immediately

It may warn without blocking if:

- `.env` is absent
- provider API keys are absent

Reason:

The dashboard itself can still run without live-provider credentials, and this sub-project is about operator distribution, not mandatory live-provider access.

---

## Release identity behavior

Release identity should become visible in the operator flow.

### Install success output should include:

- current short SHA
- whether `HEAD` matches tag `v1`
- plain statement of release context:
  - `This checkout matches v1`
  - or `This checkout is not exactly v1`

### Start output should include:

- current short SHA
- whether `HEAD` matches tag `v1`
- dashboard URL

This is intentionally simple. The goal is not sophisticated release management. The goal is to reduce ambiguity for the operator standing at a terminal.

---

## Documentation shape

The quickstart should be short and directive.

Suggested sections:

1. prerequisites
2. first install
3. environment setup
4. start the dashboard
5. update an existing checkout
6. confirm release identity
7. when to use the operator handbook instead

The quickstart should avoid re-explaining all runtime behavior. That belongs in the operator handbook.

---

## Testing and verification expectations

This sub-project is complete only if the new path is itself verified.

Minimum verification for implementation:

- script-level tests where practical for helper logic
- manual execution on Windows-first path
- `operator-install.ps1` succeeds on a clean trusted-host checkout
- `operator-start.ps1` launches the dashboard through the documented path

Repo-level verification after implementation:

- `pnpm validate:canon`
- `pnpm validate:witness`
- `pnpm typecheck`
- `pnpm test`
- `pnpm smoke`

If the implementation adds script logic that can be unit-tested safely, that logic should be isolated enough to test without making the scripts themselves over-abstracted.

---

## Risks and controls

### Risk: script complexity grows too quickly

Control:

- keep the scripts thin wrappers around existing repo commands
- avoid turning them into installers, package managers, or service orchestrators

### Risk: docs and scripts diverge

Control:

- make the quickstart point directly at the two scripts
- avoid duplicated long-form setup instructions across docs

### Risk: “Windows-first” becomes accidental “Windows-only forever”

Control:

- state plainly that Windows-first is the supported path for this milestone only
- avoid claiming cross-platform support that is not tested

### Risk: release identity remains ambiguous

Control:

- require both scripts to print SHA and `v1` match status

---

## Success criteria

This sub-project is complete when:

- `scripts/operator-install.ps1` exists and works as the documented Windows-first verification/install wrapper
- `scripts/operator-start.ps1` exists and works as the documented Windows-first startup wrapper
- `docs/operator-quickstart.md` exists and is the shortest supported path from clone to dashboard
- `README.md` points to that quickstart
- `docs/operator-handbook.md` cross-links it as the bootstrap path
- the scripts clearly identify whether the checkout is exactly `v1`
- the implementation does not broaden scope into recovery, containers, services, or public-surface work

---

## Follow-on boundary

This sub-project intentionally sets up, but does not itself perform, the next Milestone 1 slice:

- **Recovery rehearsal**

That later slice should consume the documented install/start path created here and prove that backup/restore can be executed against the declared v1 state without undocumented operator knowledge.
