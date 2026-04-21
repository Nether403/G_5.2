# G_5.2 × TWP Technical Roadmap to Project Start

**Status:** proposed  
**Class:** cross-repo technical roadmap  
**Scope:** G_5.2 post-v1 convergence with TWP operational alpha  
**Primary audience:** founder / operator  
**Companion to:** `New-TWP-functional-roadmap.md`

---

## 1. Summary

This roadmap defines the technical path from the current repo state to a real project start.

It does **not** try to define final completion.
It defines the nearer threshold:

> the project is technically startable when one accepted witness can move end-to-end through intake, invite, dialogue, governed storage, annotation, and export without ad hoc glue or hidden operator steps.

This roadmap accompanies the functional roadmap and translates it into implementation milestones, owners, dependencies, and exit criteria.

---

## 2. Current starting point

### 2.1 G_5.2 status

G_5.2 is no longer a concept-stage runtime.
It has already crossed the v1 threshold under the Azure-first operator scope and is now in post-v1 milestone work rather than pre-release gate work.

Relevant current state:
- `v1` was formally declared on 2026-04-20 under the Azure-first operator scope.
- Post-v1 Milestone 1 is in progress.
- The Windows-first operator distribution path is implemented and documented.
- Clean recovery rehearsal and bounded failure-injection rehearsal have both been completed and recorded.
- Additional provider portability remains follow-up work rather than a missing v1 prerequisite.

### 2.2 TWP status

TWP is already a live platform, not a blank slate.
Its own repo identifies the current state as **Operational Alpha (Live)** and says that global deployment, the Gate, the Inquisitor, the Admin Portal, strict PII de-identification, auth, notifications, and monitoring are already completed infrastructure.

### 2.3 Meaning for planning

The next step is **not** “build everything.”
The next step is:

1. define the cross-repo boundary cleanly
2. bridge TWP into G_5.2 Witness flows
3. prove one real end-to-end witness journey
4. turn that journey into the first repeatable corpus artifact pipeline

---

## 3. Architectural decision

### 3.1 Recommended boundary

Use this ownership split:

**TWP owns:**
- public/control-plane surfaces
- Gate intake
- admin / HCC workflow
- invite issuance and acceptance state
- user/session auth
- PII segmentation and privacy boundary
- external presentation, packet hosting, and outreach support

**G_5.2 owns:**
- governed runtime orchestration
- Witness dialogue turns
- Witness consent/testimony/session state
- synthesis / annotation / archive / publication workflow
- package/export/handoff artifacts
- eval discipline and runtime recoverability

### 3.2 Recommended integration shape

TWP should **not** directly embed the file-backed G_5.2 runtime inside normal serverless request handling.
The safer model is:

- **TWP = control plane**
- **G_5.2 = governed stateful runtime**
- **Bridge = narrow authenticated internal API / service boundary**

### 3.3 First-slice discipline

The first bridge slice should be **Witness-only**.
Do not pull P-E-S into the first integration milestone.
P-E-S remains a later secondary track.

---

## 4. Definition of “project start”

The project is technically started when all of the following are true:

1. one submission can pass through Gate review and become an accepted witness invite
2. one invited witness can complete one real dialogue session through the TWP surface
3. that session writes only into the G_5.2 Witness roots with the correct consent boundary
4. one accepted dialogue can be annotated and turned into a stable export artifact
5. the operator can restore the system and explain the audit trail and artifact provenance
6. the resulting artifact can be included in a private packet without hand-assembled glue

This is the start threshold.
It is intentionally smaller than “complete.”

---

## 5. Milestones

## Milestone 0 — Cross-repo boundary lock

**Goal:** prevent duplicate systems and hidden overlap before more bridge code lands.

**Owner:** Founder / Operator  
**Supporting roles:** none required  
**Dependencies:** current repo docs, current runtime and platform understanding

### In scope
- write one short architecture decision note for G_5.2 ↔ TWP ownership
- define the first bridge transport shape
- define the source-of-truth entity map
- define the first witness journey sequence from intake to export

### Deliverables
- architecture note: repo ownership split
- entity map covering:
  - applicant
  - accepted witness
  - invite token
  - witnessId
  - sessionId
  - testimonyId
  - synthesis / annotation / archive / package artifact ids
  - TWP admin / HCC actors
- one end-to-end sequence diagram or numbered flow
- one explicit “out of scope for first bridge” note

### Non-goals
- full production deployment redesign
- auth redesign
- public launch work
- P-E-S bridge work

### Exit criteria
- both repos have a written ownership split with no ambiguous overlap
- there is exactly one chosen first bridge pattern
- one witness journey can be described step-by-step without handwaving

---

## Milestone 1 — Witness bridge MVP

**Goal:** create the first real TWP → G_5.2 Witness roundtrip.

**Owner:** Founder / Operator  
**Supporting roles:** optional advisor review  
**Dependencies:** Milestone 0 boundary lock

### In scope
- connect accepted witness flow in TWP to a narrow G_5.2 Witness interface
- create witness session from TWP
- submit witness turn from TWP
- read session/testimony/consent summary back into TWP operator surfaces
- preserve strict Witness-only storage routing

### Deliverables
- internal bridge interface with explicit request/response contracts
- first TWP route or service layer that invokes the G_5.2 Witness path
- mapping between TWP witness/application identity and G_5.2 witness/session identity
- operator-visible proof that a turn wrote to Witness roots only

### Non-goals
- public self-service witness flow at scale
- P-E-S routing
- remote package delivery expansion
- multi-provider generalization

### Exit criteria
- one invited witness can complete one live dialogue turn from TWP
- TWP can retrieve the resulting session/testimony summary
- all resulting runtime state is visible in Witness roots only
- no P-E-S roots are touched by the Witness bridge path

---

## Milestone 2 — Gate and HCC operational convergence

**Goal:** make the intake → review → invite path defensible and auditable with the bridge in place.

**Owner:** Founder / Operator  
**Supporting roles:** future HCC / trusted reviewer(s)  
**Dependencies:** Milestone 1 Witness bridge MVP

### In scope
- verify existing Gate logic is wired to the live review path you actually use
- verify HCC/admin decisions carry rationale and audit trace
- verify invite issuance / redemption behavior
- verify privacy boundary and identity segmentation across the bridge
- define the minimum accepted/deferred operational path

### Deliverables
- documented accepted/deferred decision path
- documented invite issuance path
- auditability check for admin decisions
- privacy boundary check for witness-facing dialogue flow

### Non-goals
- fancy admin UX iteration
- full analytics or dashboards
- large-cohort scaling

### Exit criteria
- one intake can move from submission to accepted/deferred state without manual DB surgery
- accepted intake can produce a valid witness invite
- invite redemption can reach the Witness bridge path cleanly
- privacy / identity boundaries remain intact throughout the flow

---

## Milestone 3 — Corpus artifact pipeline

**Goal:** turn live dialogue output into a repeatable reviewed artifact, not just a runtime event.

**Owner:** Founder / Operator  
**Supporting roles:** trusted alpha annotator(s), if available  
**Dependencies:** Milestone 2 operational convergence

### In scope
- transcript normalization or extraction for accepted dialogue outputs
- annotation workflow for CAP / REL / FELT labeling
- use existing G_5.2 Witness downstream artifact machinery where possible
- define corpus inclusion criteria
- define timestamping/proof-of-existence step
- define packet-ready export format

### Deliverables
- one documented artifact pipeline from accepted testimony to reviewed export
- one packet-ready export package format
- one inclusion rubric for exemplar excerpts
- one timestamp/proof procedure

### Non-goals
- final 200-page corpus immediately
- Constitutional Mirror or Icarus dependency
- public repository of testimony

### Exit criteria
- one accepted witness dialogue can become one reviewed export artifact
- the artifact can be reproduced from stored state and documented steps
- the artifact can be packaged without ad hoc file copying or manual reformatting

---

## Milestone 4 — Alpha cohort execution

**Goal:** run the first small trusted cohort through the real system and log the friction honestly.

**Owner:** Founder / Operator  
**Supporting roles:** small trusted alpha cohort  
**Dependencies:** Milestone 3 corpus artifact pipeline

### In scope
- run a small trusted witness cohort through the actual intake/dialogue flow
- capture operator friction, witness friction, and boundary failures
- reject feature temptation; focus on observing the real path
- collect enough accepted material to validate the corpus pipeline

### Deliverables
- alpha-week runbook
- failure log for the cohort run
- first reviewed set of accepted dialogue artifacts
- first corpus assembly draft

### Non-goals
- famous or Tier-A outreach
- broad user acquisition
- scaling optimization

### Exit criteria
- at least a small handful of real end-to-end witness journeys are completed
- every serious blocker is categorized as fixed / accepted / deferred
- the first corpus draft is assembled from real system outputs

---

## Milestone 5 — Minimum Honest Signal packet

**Goal:** package the first undeniable proof-of-work asset for serious outreach.

**Owner:** Founder / Operator  
**Supporting roles:** optional trusted editorial reviewer  
**Dependencies:** Milestone 4 alpha cohort execution

### In scope
- one-pager
- gate stub / consent summary
- exemplar extracts
- datasheet / receipts / timestamp evidence
- secure private hosting on the platform side

### Deliverables
- MHS packet v1
- private hosted packet route
- artifact provenance note linking excerpts to reviewed export sources

### Non-goals
- PR campaign
- public launch deck
- generalized marketing site

### Exit criteria
- one private packet exists and is sober, accurate, and reproducible
- every included extract has a provenance chain back to governed runtime artifacts
- the packet can be sent without relying on unpublished operator explanation to seem real

---

## Milestone 6 — Tiered outreach readiness

**Goal:** make the system ready for Anchor Voices outreach without pretending the platform is further along than it is.

**Owner:** Founder / Operator  
**Supporting roles:** optional advisors / introducers  
**Dependencies:** Milestone 5 MHS packet

### In scope
- define Wave 1 list
- define bounded ask
- define follow-up sequence
- define response intake and storage path for packet feedback
- confirm platform and runtime can support a modest first-wave load

### Deliverables
- outreach runbook
- target segmentation sheet
- response-capture workflow
- operator checklist for live invites / live witness handling

### Non-goals
- mass outreach
- generalized CRM buildout
- broad product launch

### Exit criteria
- first-wave targets can be contacted with a packet backed by real artifacts
- the platform/runtime path is stable enough to support actual replies and live witness sessions
- the operator can explain exactly what happens after a positive response

---

## 6. Cross-cutting technical tracks

These tracks run across multiple milestones.

### Track A — Recoverability and operator trust

**Owner:** Founder / Operator  
**Start:** already in progress  
**Ends:** never fully ends; must remain current

Keep aligned:
- operator quickstart
- recovery-and-backups
- recovery drills
- release status docs
- install/start path

**Exit condition for current phase:** the bridge and corpus pipeline are reflected in the operator docs without hidden steps.

### Track B — Eval expansion for real Witness use

**Owner:** Founder / Operator  
**Dependencies:** Milestones 1–4

Focus:
- expand Witness eval coverage where alpha-week friction reveals gaps
- add bridge-specific regression coverage once the integration path exists
- keep governance/output failures and product-flow failures distinct

**Exit condition for current phase:** the first real bridge path has regression pressure, not just manual confidence.

### Track C — Provider portability

**Owner:** Founder / Operator  
**Dependencies:** live credentials / quota

This remains post-v1 follow-up, not a blocker for project start.

**Exit condition for current phase:** Azure-first remains acceptable, and any non-Azure gaps are explicitly documented rather than handwaved.

---

## 7. Major dependencies and ordering rules

### Hard dependencies
- Milestone 1 depends on Milestone 0
- Milestone 2 depends on Milestone 1
- Milestone 3 depends on Milestone 2
- Milestone 4 depends on Milestone 3
- Milestone 5 depends on Milestone 4
- Milestone 6 depends on Milestone 5

### Ordering rules
- do not integrate P-E-S before the Witness bridge is real
- do not do Tier-A outreach before the first corpus artifact pipeline is real
- do not let TWP and G_5.2 both become dialogue source-of-truth systems
- do not treat local recovery drills as proof of public multi-host robustness
- do not broaden the scope to auth/public-surface redesign during these milestones

---

## 8. Ownership model

Because this is effectively founder-led, “owner” in this roadmap means execution lead, not a large team split.

### Default ownership
- **Founder / Operator:** primary owner for every milestone
- **Trusted alpha cohort:** temporary supporting role during Milestone 4
- **Advisors / introducers:** temporary supporting role during Milestone 6
- **Future HCC participants:** supporting role once the review loop is no longer single-operator

If more hands appear later, the first ownership split should probably be:
- platform/control-plane ownership
- governed runtime / artifact ownership
- operations / review / corpus ownership

---

## 9. Immediate next moves

### Next 3 concrete technical actions

1. Write the boundary note and entity map first.
2. Implement the first Witness-only bridge slice second.
3. Prove one real end-to-end witness journey before touching P-E-S or broader outreach tooling.

### Things to avoid right now

- another large internal subsystem branch
- public-facing polish work before the bridge is real
- trying to define final completion
- duplicating annotation/export logic in both repos
- treating TWP’s existing alpha infrastructure as if it still needs to be invented from zero

---

## 10. Done statement for this roadmap phase

This roadmap phase is successful when:

> TWP and G_5.2 are cleanly connected through a Witness-only bridge, one accepted witness can complete a real governed dialogue journey end to end, that journey can be turned into a reviewed export artifact, and the resulting packet is strong enough to begin serious outreach without overclaiming.

