# Milestone 0 — Architecture Decision Note and Entity Map

**Status:** accepted for implementation  
**Class:** cross-repo boundary / pre-bridge architecture  
**Scope:** TWP ↔ G_5.2 convergence, Witness-first  
**Date:** 2026-04-21

---

## 1. Summary

Milestone 0 exists to lock the architectural boundary between:

- **TWP** — the live public/control-plane platform
- **G_5.2** — the governed stateful runtime and Witness artifact pipeline

This note assumes the following corrected starting point:

- TWP is **not** a blank slate. It already has meaningful platform infrastructure in place, including the Gate, Admin Portal, basic auth/privacy posture, and a live alpha environment.
- TWP is also **not** the finished target architecture. Its current dialogue path is not yet aligned with the G_5.2 governance kernel.
- G_5.2 is now the stronger governed runtime layer for Witness operations and should become the runtime authority for the first bridge slice.

Milestone 0 therefore does **not** build new product features directly.  
It decides **what owns what**, **which IDs and records are canonical**, and **how the two repos communicate** before bridge implementation begins.

---

## 2. Decision

### 2.1 Primary decision

Adopt a **split-plane architecture**:

- **TWP = control plane**
- **G_5.2 = governed runtime and artifact plane**

TWP remains responsible for intake, auth, operator/admin workflows, and public/private web surfaces.

G_5.2 remains responsible for Witness runtime behavior, consent-aware session orchestration, testimony state, downstream Witness review/export state, and governed artifact generation.

### 2.2 First bridge scope

The first real bridge is **Witness-only**.

Do **not** include the P-E-S public track in the initial bridge slice.

The first end-to-end objective is:

> accepted witness -> invited witness session -> G_5.2 Witness runtime -> testimony/consent state -> reviewed/exportable Witness artifact

### 2.3 Integration style

Do **not** embed G_5.2 file-backed runtime logic directly into TWP request handlers as if it were just another web helper library.

Use a **narrow internal bridge contract** instead:

- TWP initiates and reads bounded Witness operations
- G_5.2 owns runtime execution and Witness-root persistence
- TWP stores only the minimum linkage and control-plane metadata it needs

### 2.4 Data-boundary rule

TWP must not become the de facto owner of Witness runtime state.

G_5.2 Witness operations must continue to write only into Witness product roots, not into P-E-S roots and not into generic TWP app state.

### 2.5 Artifact rule

The existing G_5.2 Witness publication/package pipeline is the canonical source for downstream corpus/export artifacts.

TWP may host, present, gate, or distribute those artifacts, but it should not invent a second parallel artifact model for the same underlying testimony flow.

For the first MHS packet, source material should come only from the newly generated Alpha Week corpus, not from legacy alpha records.

---

## 3. Why this decision

This architecture keeps the strongest current capabilities where they already live.

### TWP already has real platform infrastructure

TWP is already a live alpha platform with:

- gate/invite posture
- admin portal
- auth
- privacy/audit constraints
- public/private web delivery shape

### G_5.2 already has the stronger governed runtime boundary

G_5.2 already provides:

- explicit product routing (`pes` vs `witness`)
- Witness-only storage roots
- consent/testimony/synthesis/annotation/archive/publication state
- publication packages and delivery/handoff mechanics
- operator/recovery/rehearsal discipline

The lowest-risk convergence path is therefore:

- keep TWP as the platform shell and control plane
- move Witness runtime authority to G_5.2
- bridge them intentionally instead of duplicating runtime logic in both repos

---

## 4. Architectural ownership

## 4.1 TWP owns

- public and semi-private web surfaces
- application intake and Gate workflows
- AI sieve / qualitative triage orchestration as long as it remains part of platform intake
- HCC/admin review UX
- invite issuance and token redemption UX
- authenticated admin identity and role checks
- audit logging for TWP-native mutations
- PII segmentation / de-identification boundary
- operational communications and notifications
- packet hosting / presentation surfaces

## 4.2 G_5.2 owns

- product-aware runtime selection
- Witness dialogue orchestration
- Witness session persistence
- Witness consent persistence
- Witness testimony persistence
- Witness memory boundaries
- Witness synthesis / annotation / archive candidate state
- Witness publication bundles / packages / delivery records
- governed runtime rules, evals, and recovery posture for the runtime side

## 4.3 Shared / bridge-owned concerns

These need an explicit contract rather than ad hoc duplication:

- mapping from TWP person/applicant/invite context to `witnessId`
- mapping from TWP operator/admin identity to runtime actor metadata
- bridge auth between TWP and G_5.2
- status synchronization for a witness journey
- packet/export discovery for downstream presentation in TWP

---

## 5. Non-goals for Milestone 0

Milestone 0 does **not**:

- rebuild the TWP Gate from scratch
- migrate all historical platform data immediately
- fold P-E-S into the first bridge slice
- redesign auth or public launch posture
- add multi-tenant/public-user hardening
- create a second export pipeline outside the G_5.2 Witness artifact flow
- define long-horizon “complete” product state

---

## 6. Recommended owners

These are role owners, not necessarily separate people.

| Workstream | Recommended owner |
|---|---|
| Architecture decision / boundary lock | Founder / operator |
| TWP control-plane mapping | Founder / operator |
| G_5.2 Witness runtime authority | Founder / operator |
| Bridge contract definition | Founder / operator |
| Data migration policy | Founder / operator |
| Security / privacy sanity review | Founder / operator, later supported by specialist review |
| Packet / corpus artifact presentation | Founder / operator |

If collaborators join later, the natural split is:

- **frontend/control-plane contributor:** TWP UX, admin surfaces, invite flows
- **runtime/backend contributor:** G_5.2 bridge API, Witness runtime integration, artifact/export path
- **ops/reliability contributor:** deployment, secrets, backups, environment separation

---

## 7. Dependencies

Milestone 0 depends on the following already-landed facts:

- TWP has a live alpha platform shell and operator/admin shape
- G_5.2 has declared `v1` under Azure-first operator scope
- G_5.2 has Windows-first operator bootstrap and recovery discipline
- G_5.2 Witness publication/package/delivery flow exists already
- the functional roadmap prioritizes bridge -> alpha corpus -> MHS packet -> outreach

Milestone 0 should complete **before**:

- wiring live TWP witness dialogue traffic into G_5.2
- doing any broad P-E-S bridge work
- building packet-generation shortcuts directly in TWP
- attempting a larger alpha cohort

---

## 8. Exit criteria

Milestone 0 is complete when all of the following are true:

1. the control-plane vs runtime-plane split is written down and accepted
2. the first bridge scope is explicitly Witness-only
3. canonical ownership is named for each major entity
4. the minimum bridge operations are listed
5. the initial data migration / legacy-data stance is chosen
6. one end-to-end witness journey sequence is documented
7. future work can be planned without ambiguity about where logic belongs

---

## 9. Minimum bridge contract (first slice)

These are the minimum operations TWP should be able to request from G_5.2 for the first Witness bridge.

### 9.1 Create or resolve witness session
Input:
- TWP invite/applicant context
- mapped `witnessId`
- operator/runtime metadata as needed

Output:
- `witnessId`
- `sessionId`
- current consent state
- any currently active testimony linkage if applicable

### 9.2 Submit witness turn
Input:
- `witnessId`
- `sessionId`
- mode
- user message
- consent-eligible runtime context

Output:
- turn result
- runtime metadata
- testimony linkage / append result
- any blocking status if consent is not granted

### 9.3 Read witness status summary
Input:
- `witnessId`
- optional `sessionId`

Output:
- latest consent decisions
- active / sealed testimony records
- high-level session summary
- downstream review/export availability if present

### 9.4 Read artifact/export availability
Input:
- `witnessId` and/or `testimonyId`

Output:
- publication bundle/package availability
- delivery status / packet eligibility metadata

---

## 10. Entity map

The goal of this map is not to define every field.  
It is to define **canonical ownership, identifiers, and relationships**.

| Entity | Canonical owner | Primary ID | Purpose | Notes |
|---|---|---|---|---|
| Applicant | TWP | `applicantId` | Gate/intake person record before acceptance | May still contain or reference PII under TWP’s privacy boundary |
| GateSubmission | TWP | `submissionId` | Submitted intake artifact for screening | Input to AI sieve / qualifier / HCC review |
| GateDecision | TWP | `decisionId` | Accepted / deferred / rejected decision record | Must remain auditable in TWP |
| InviteToken | TWP | `inviteTokenId` / token | Grants access to the next witness step | TWP owns issuance and redemption flow |
| TWPUser / AdminUser | TWP | `userId` | Authenticated operator/admin identity | Governed by TWP auth and admin-role checks |
| WitnessProfile / WitnessLink | Bridge-owned, represented in TWP and G_5.2 | `witnessId` | Stable bridge identity for an accepted witness | This is the key cross-system bridge ID |
| WitnessConsentDecision | G_5.2 | consent record id | Runtime consent state for Witness operations | Must remain inside Witness roots |
| WitnessSession | G_5.2 | `sessionId` | One governed witness dialogue session | Writes only into Witness session roots |
| WitnessTurn | G_5.2 | `turnId` | One runtime turn inside a witness session | Returned to TWP for display, not re-owned by TWP |
| TestimonyRecord | G_5.2 | `testimonyId` | Persisted Witness testimony artifact | Canonical downstream source for review/export |
| SynthesisRecord | G_5.2 | synthesis record id | Model/operator synthesis over testimony | Witness-root only |
| AnnotationRecord / Batch | G_5.2 | annotation batch id | Structured annotation over testimony | Witness-root only |
| ArchiveCandidate | G_5.2 | archive candidate id | Review boundary before publication/export | Requires approved prerequisites |
| PublicationBundle | G_5.2 | `bundleId` | Structured export bundle | Canonical governed export object |
| PublicationPackage | G_5.2 | `packageId` | Deterministic handoff package over bundle | Artifact of record for external handoff |
| DeliveryRecord | G_5.2 | delivery id | Upload / handoff attempt record | Separate from package metadata |
| MHS Packet | TWP presentation over G_5.2 artifacts | packet slug / packet id | Private hosted packet for outreach | Should consume governed artifacts, not recreate them ad hoc |

---

## 11. Key identifier rules

### 11.1 `witnessId` is the main bridge identifier
This is the most important cross-system ID.

Rules:
- created by TWP only after a Gate acceptance path
- stable across TWP and G_5.2
- used to resolve Witness sessions, consent, testimony, and export state
- not reused for P-E-S
- treated by G_5.2 as an externally authoritative bridge identifier

### 11.2 `sessionId`, `turnId`, `testimonyId`, `bundleId`, `packageId` remain G_5.2-native
TWP may store references to these IDs for navigation and packet assembly.

But TWP should not become their canonical owner.

### 11.3 TWP admin/user IDs remain TWP-native
When TWP operators trigger bridge actions, actor metadata may be forwarded to G_5.2, but TWP remains canonical for authenticated user identity.

---

## 12. Relationship map

### 12.1 Intake and acceptance
`Applicant`
-> `GateSubmission`
-> `GateDecision`
-> `InviteToken`
-> `witnessId`

### 12.2 Runtime
`witnessId`
-> `WitnessSession`
-> `WitnessTurn`
-> `TestimonyRecord`

### 12.3 Downstream Witness artifact flow
`TestimonyRecord`
-> `SynthesisRecord`
-> `AnnotationRecord`
-> `ArchiveCandidate`
-> `PublicationBundle`
-> `PublicationPackage`
-> `DeliveryRecord`

### 12.4 Outreach / packet layer
`PublicationBundle` and/or `PublicationPackage`
-> curated packet assets
-> `MHS Packet` presentation in TWP

---

## 13. Legacy-data decision

**Decision:** no historical TWP alpha data is migrated in the first bridge slice.

Operational stance:
- historical alpha data remains archived in TWP-native structures
- only newly accepted witnesses use the G_5.2-backed Witness runtime
- any future migration is a separate project, not a prerequisite for bridge launch

Reason:
- avoids hidden migration debt
- avoids forcing older alpha records into new consent-aware Witness schemas
- keeps the first bridge slice focused on proving one clean end-to-end path from zero

---

## 14. First witness journey sequence

### Step 1 — intake
A person submits through TWP Gate.

TWP creates:
- applicant/submission records
- triage outputs
- HCC/admin review state

### Step 2 — acceptance
TWP accepts or defers.

If accepted:
- TWP issues invite token
- TWP creates or reserves `witnessId`

### Step 3 — witness enters dialogue
The invited witness reaches the secure dialogue interface in TWP.

TWP calls G_5.2 bridge operation:
- resolve/create witness session
- fetch consent/runtime readiness

### Step 4 — runtime turn
Witness submits a turn through TWP UI.

TWP forwards bounded request to G_5.2:
- `witnessId`
- `sessionId`
- mode
- user message

G_5.2:
- runs Witness runtime
- enforces consent boundary
- persists session/turn/testimony in Witness roots
- returns turn result

TWP:
- renders result
- stores only required linkage metadata

### Step 5 — downstream review
Operator later reviews testimony through G_5.2-backed workflows.

Resulting artifacts:
- synthesis
- annotations
- archive candidate
- publication bundle
- package

### Step 6 — packet use
TWP may then host or present selected artifact outputs inside a private packet surface.

---

## 15. Risks to avoid

### 15.1 Dual-runtime drift
Do not keep two competing dialogue engines in production indefinitely.

### 15.2 Duplicate artifact systems
Do not build one export model in TWP and another in G_5.2 for the same Witness flow.

### 15.3 Boundary leakage
Do not let TWP request paths write directly into arbitrary G_5.2 file roots without a clear bridge contract.

### 15.4 P-E-S bleed
Do not mix the P-E-S public track into the first Witness bridge slice.

### 15.5 Hidden migration debt
Do not pretend legacy alpha data already fits the new Witness runtime if it does not.

---

## 16. Recommended Milestone 1 after this note

Once this note is accepted, the next implementation milestone should be:

**Milestone 1 — Witness bridge slice**
- establish bridge auth/transport
- map accepted invite -> `witnessId`
- create/resolve witness session from TWP
- submit one witness turn through G_5.2
- read witness summary back into TWP
- prove all persistence lands in G_5.2 Witness roots only

---

## 17. Resolved implementation decisions

### 17.1 `witnessId` creation
**Decision:** TWP creates `witnessId` first.

Reason:
- TWP owns intake, Gate vetting, HCC acceptance, and invite issuance
- `witnessId` therefore begins at the moment an accepted witness becomes eligible for runtime entry
- G_5.2 must treat `witnessId` as an externally authoritative bridge identity, not mint its own competing witness identifier

### 17.2 Minimum TWP linkage record after acceptance
**Decision:** TWP keeps only the minimum routing and access state it needs.

Minimum fields:
- `witnessId`
- auth mapping (`userId`, magic-link identity, or equivalent invite binding)
- lifecycle status (`invited`, `active`, `completed`)
- high-level control-plane consent flags (`granted` / `revoked` mirror only)

Boundary rule:
- TWP must not duplicate dialogue turns, testimony segments, synthesis, annotations, or downstream Witness artifacts
- G_5.2 remains the system of record for runtime consent decisions and all Witness-root operational state

### 17.3 First bridge transport
**Decision:** use a local service boundary with direct synchronous REST calls.

Reason:
- lowest operational overhead for an alpha run
- easiest to debug end-to-end as a solo founder
- proves the Witness journey without introducing queue infrastructure prematurely

Non-goal in the first slice:
- no Redis/job queue/async adapter unless operational pressure later justifies it

### 17.4 Historical alpha data
**Decision:** migrate none of it now.

Reason:
- retrofitting legacy alpha data into the new G_5.2 Witness schemas would create hidden debt
- the bridge should be proven cleanly using the new alpha cohort
- legacy alpha data stays archived and is not treated as bridge-launch input

### 17.5 Source material for the first MHS packet
**Decision:** the first MHS packet uses only the newly generated Alpha Week corpus.

Interpretation:
- the packet should be built from the upcoming 5–15 witness alpha cohort
- the packet does not need to expose the full raw 200-page corpus directly
- the packet should contain selective governed extracts plus the supporting one-pager, gate stub, and datasheet
- those governed extracts should ultimately come from the new Witness artifact flow rather than legacy alpha material

---

## 18. Done statement

Milestone 0 is done when:

> the team can point to one written boundary where TWP owns the platform shell, G_5.2 owns the Witness runtime and artifact plane, `witnessId` is the agreed bridge identity, and the first Witness-only integration slice can be built without ambiguity.
