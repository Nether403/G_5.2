# Post-v1 Milestone 1 — Portability, Packaging, and Recovery

**Status:** proposed  
**Class:** post-v1 milestone  
**Scope posture:** operator-only, trusted-host, no public-user expansion

---

## Summary

Post-v1 Milestone 1 exists to turn the `v1` release from a declared repo state into a durable operator release that can be identified, installed, restored, and verified without tribal knowledge.

This milestone does **not** reopen the v1 gate.  
It does **not** expand the system into a public product surface.  
It does **not** introduce multi-user auth, hostile-network hardening, or a new agent/tool architecture branch.

Instead, it focuses on four practical goals:

1. close the release artifact chain cleanly
2. improve provider-portability coverage where credentials exist
3. produce one supported operator distribution path
4. rehearse backup and recovery against the declared v1 state

---

## Why this milestone exists

The repo has already crossed the v1 threshold under the current Azure-first operator scope. The immediate need is no longer “build the missing core system.” The immediate need is to make the release durable, portable, and reproducible.

The right next step is therefore not broader architecture. It is consolidation:

- durable release reference
- installable operator package or container
- restore verification
- additional provider RC captures where available

This preserves the v1 boundary while reducing operator fragility.

---

## Goals

### Goal 1 — Release artifact closure

Make the v1 release legible and durable from repo artifacts alone.

Desired outcome:

- an operator can identify exactly what `v1` points to
- the release declaration, RC note, and active baseline chain are easy to follow
- the release is not dependent on one local machine state

### Goal 2 — Provider portability progress

Advance the provider-baseline follow-up that was left intentionally outside the Azure-first v1 declaration.

Desired outcome:

- Anthropic and Gemini RC baselines are captured when credentials/quota exist
- OpenAI-path RC baseline is captured if that path becomes part of active operator scope
- any remaining provider gaps are explicitly documented rather than ambiguous

### Goal 3 — Operator distribution

Produce one supported operator-installable distribution path for the current v1 system.

Desired outcome:

- a fresh operator environment can install and start the system without repo surgery
- the install path is documented and repeatable
- update expectations are documented

### Goal 4 — Recovery rehearsal

Verify that the documented backup and recovery path works in practice against the v1 state.

Desired outcome:

- backup surface is clear
- restore path succeeds in a fresh environment or fresh working directory
- recovered system passes the expected validation and startup checks

---

## In scope

### 1. Release closure work

- push or otherwise durable-reference the `v1` release point
- add or refine the release summary for the declared v1 state
- ensure the release points clearly to:
  - the v1 release gate entry
  - the clean RC note
  - the active promoted gold baseline
  - recovery / backup instructions

### 2. Distribution path

Choose one primary supported operator distribution path for this milestone:

- **Option A:** container image
- **Option B:** documented local package / install script path

Only one path needs to be primary in Milestone 1.

Implementation work may include:

- startup wrapper or documented boot command
- environment-variable contract
- install / update instructions
- compatibility note for supported runtime assumptions
- explicit version / commit readout in the running surface, if needed

### 3. Recovery rehearsal

Run one full restore drill against the declared v1 state.

The drill should cover:

- backup capture
- restore into a fresh environment or fresh working tree
- `pnpm validate:canon`
- `pnpm validate:witness`
- `pnpm typecheck`
- dashboard startup
- one normal inquiry path
- one Witness path
- one eval-report inspection path

Record anything that still depends on undocumented operator knowledge.

### 4. Provider RC follow-up

As credentials and quota permit:

- capture Anthropic RC baseline
- capture Gemini RC baseline
- capture OpenAI-path RC baseline if it is part of active operator scope

Each capture should either:

- be promoted cleanly, or
- be recorded explicitly as blocked / out-of-scope / pending access

### 5. Operator quickstart polish

Add the minimum documentation needed to support the above:

- short operator quickstart
- install / update note
- restore note
- distribution note
- milestone closeout note

---

## Explicit non-goals

The following are deliberately **out of scope** for Post-v1 Milestone 1.

### Public surface expansion

- public-facing UI
- signup flow
- waitlist / marketing site
- anonymous or consumer access

### Auth and multi-user posture

- user accounts
- RBAC
- API authentication
- multi-tenant isolation
- shared-user dashboard model

### Network / abuse / production-hardening branch

- rate limiting
- hostile-input posture
- abuse handling
- incident-response flow
- monitoring / metrics / alerting stack
- SLOs or 24/7 operations posture

### Agent / tool / autonomous branch

- external retrieval
- browsing
- tool routing
- MCP
- scheduled runtime behavior
- webhooks / cron-driven actions
- autonomous writeback behavior

### Major architecture refactors

- reopening memory architecture
- reopening Witness architecture
- changing canon invariants
- introducing a new product split
- redesigning the editorial or reflection stack

---

## Deliverables

By the end of this milestone, the repo should have:

1. a durable v1 release reference
2. a concise operator-facing release summary
3. one supported operator distribution path
4. one documented and rehearsed restore result
5. updated install / update / restore docs
6. any newly available provider RC captures or explicit notes explaining why they remain pending
7. a milestone-close note recording what was completed and what remains for later post-v1 work

---

## Success criteria

Milestone 1 is complete when all of the following are true.

### Release integrity

- the v1 release point is durably referenced
- the release declaration chain is legible from the repo alone
- an operator can identify the exact commit, gate basis, and active baseline without asking for extra context

### Installability

- the documented install path works from a clean environment
- the system starts without repo surgery
- the operator dashboard is reachable through the documented path

### Recoverability

- a restore from documented backup material succeeds in practice
- restored system passes the required validation steps
- restored system can serve at least one inquiry path and one Witness path

### Portability progress

- at least one additional provider RC baseline is captured if credentials/quota exist
- any remaining uncaptured providers are explicitly documented as pending access or out of active scope

### Scope discipline

- no auth, public-surface, agent/tool, or hostile-network branch work was pulled into the milestone
- the v1 threshold was not reopened or redefined

---

## Suggested execution order

### Phase 1 — Release closure

- durable v1 reference
- release summary cleanup
- quick operator-facing release note linkage

### Phase 2 — Distribution

- choose primary distribution path
- implement install/start flow
- validate on clean environment

### Phase 3 — Recovery rehearsal

- capture backup
- restore into fresh environment
- run validation and startup checks
- document gaps uncovered by the drill

### Phase 4 — Provider follow-up

- capture Anthropic / Gemini / OpenAI-path RC baselines where access exists
- promote or document outcomes
- do not block the whole milestone indefinitely on unavailable credentials

### Phase 5 — Closeout

- write milestone note
- record remaining provider gaps
- nominate candidate scope for Post-v1 Milestone 2

---

## Done statement

Post-v1 Milestone 1 is done when:

> a fresh operator can identify v1, install it, restore it, run it, and verify it from documented artifacts alone, and provider portability has advanced wherever live access actually exists.

---

## Notes

- This milestone is intentionally conservative.
- It strengthens the declared v1 system without broadening the product surface.
- Anything involving public users, auth, hostile-network posture, or agent/tool expansion belongs to a later post-v1 milestone with its own gate.