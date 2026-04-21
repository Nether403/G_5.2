# Milestone 1 — Witness Bridge Slice

**Status:** proposed  
**Class:** bridge milestone  
**Scope posture:** operator-only, Witness-first, no public-scale hardening  
**Depends on:** Milestone 0 architecture decision resolved

---

## Summary

Milestone 1 exists to prove the first real end-to-end bridge between:

- **TWP** as the control plane for intake, gate decisions, invite issuance, and operator/admin workflows
- **G_5.2** as the governed Witness runtime for consent-aware dialogue, testimony persistence, and downstream Witness artifact handling

This milestone does **not** attempt full platform convergence. It proves one narrow, high-value slice:

> an accepted witness in TWP can enter a governed dialogue path backed by `G_5.2`, and the resulting session, consent, and testimony state land in the correct Witness roots with no cross-contamination into `pes` state.

---

## Why this milestone exists

The current system posture is asymmetric but useful:

- TWP already has meaningful platform infrastructure: Gate, Admin Portal, simple auth, and a live alpha surface.
- G_5.2 already has the stronger governed runtime kernel, explicit `witness` / `pes` routing, Witness-specific consent and testimony roots, and downstream Witness publication/package/delivery paths.
- The current TWP Inquisitor dialogue path is not yet aligned with the G_5.2 governance kernel.

That makes the next technical step clear:

- do **not** rebuild TWP from zero
- do **not** expand P-E-S first
- do **not** migrate historical alpha data yet
- instead, bridge TWP into the governed Witness runtime first

---

## Milestone decision record

### Locked decisions

1. **TWP creates `witnessId` first.**  
   TWP owns intake, Gate vetting, acceptance, and invite issuance.

2. **TWP keeps only a minimal linkage record.**  
   It keeps routing/access state, not dialogue bodies or derived Witness artifacts.

3. **The first bridge uses synchronous direct REST over a local service boundary.**  
   No queue/Redis/event bus in this milestone.

4. **No historical alpha migration is in scope.**  
   Legacy alpha data remains archived.

5. **The bridge is Witness-only.**  
   `pes` remains explicitly out of scope for this milestone.

---

## Goal

Prove one accepted-witness journey across the repo boundary:

1. a submission is accepted in TWP
2. TWP issues `witnessId` + invite/access state
3. TWP calls G_5.2 through a narrow internal bridge
4. G_5.2 opens or resumes a Witness session using that `witnessId`
5. consent, session, and testimony state persist only in Witness roots
6. TWP can read enough bridge state back to drive the witness/operator experience without duplicating the governed artifacts

---

## Owners

### Primary owner
- **Founder / operator / integrator** — final design authority, bridge implementation, acceptance testing

### Repo ownership by responsibility
- **TWP repo owner:** control-plane integration, invite flow, auth mapping, admin/operator surfaces
- **G_5.2 repo owner:** governed runtime contract, Witness routing, consent/testimony/session persistence, bridge-facing runtime adapter

### Review owner
- **Founder / operator** — verifies that product boundaries, privacy boundaries, and Witness-root storage rules remain intact

---

## Dependencies

This milestone depends on the following already being true:

1. **Milestone 0 is resolved**
   - TWP = control plane
   - G_5.2 = governed runtime and artifact plane
   - first bridge = Witness-only
   - main bridge identity = `witnessId`

2. **TWP has usable alpha control-plane surfaces**
   - Gate exists
   - Admin Portal exists
   - basic auth/invite path exists or can be minimally extended

3. **G_5.2 Witness runtime is already operational**
   - explicit `witness` product routing
   - Witness consent roots
   - Witness testimony roots
   - Witness session roots
   - inquiry turn APIs available through the dashboard server runtime

4. **No legacy alpha migration is required before first bridge proof**

---

## Architectural boundary

### TWP owns
- submission intake
- gate/curation workflow
- acceptance / deferral decisions
- invite issuance
- witness access/auth mapping
- operator-facing witness roster and status
- public/private web surfaces
- any PII-bearing control-plane records that must remain in the platform boundary

### G_5.2 owns
- `witness` runtime selection
- consent-aware inquiry execution
- Witness session persistence
- Witness testimony persistence
- Witness synthesis / annotation / archive / publication pipelines
- governed dialogue behavior
- eval/recovery/reproducibility discipline for the Witness runtime

### TWP may mirror, but not own as source of truth
- high-level witness status for UI (`invited`, `active`, `completed`)
- high-level consent display state for routing or operator visibility
- latest bridge heartbeat / last activity metadata

### G_5.2 remains the source of truth for
- operational Witness consent decisions
- persisted dialogue turns
- testimony segments
- Witness downstream review/export artifacts

---

## Minimal linkage record in TWP

The bridge should assume TWP keeps only the minimum linkage needed to operate the control plane.

Recommended minimum fields:

- `witnessId`
- `platformUserId` or invite-auth mapping
- `status` (`invited | active | completed | revoked`)
- `consentSummary` (high-level mirrored display state only)
- `g52SessionId` (optional cached pointer to current/open Witness session)
- `lastBridgeAt`
- `lastBridgeError` (nullable)

TWP must **not** duplicate:

- dialogue turns
- testimony bodies/segments
- annotations
- synthesis content
- publication bundles/packages

---

## Bridge contract for this milestone

### Required bridge actions

#### 1. Create or resume Witness runtime session
TWP sends:
- `witnessId`
- optional existing session pointer
- runtime mode if needed

G_5.2 returns:
- `sessionId`
- current witness consent gate state
- current testimony pointer if active
- session summary metadata sufficient for UI routing

#### 2. Record operational consent decision
TWP sends:
- `witnessId`
- consent scope
- status
- actor/context metadata

G_5.2 persists the Witness consent decision and returns:
- decision record
- updated gate state

#### 3. Submit witness turn
TWP sends:
- `witnessId`
- `sessionId`
- `userMessage`
- mode/provider override only if deliberately allowed

G_5.2 returns:
- persisted turn
- `sessionId`
- `testimonyId` if created/updated
- consent failure details on `409`
- structured failure details on provider/runtime error

#### 4. Read witness runtime status for TWP UI
TWP requests:
- witness-level current state by `witnessId`

G_5.2 returns enough for control-plane use:
- consent summary
- active/open sessions for that witness
- testimony summary metadata
- latest updated timestamps

### First bridge transport
- synchronous server-to-server REST
- local/private service boundary only
- no queued adapter
- no browser-direct calls into raw G_5.2 runtime from public witness pages

---

## Candidate G_5.2 surface for the first bridge

The current G_5.2 dashboard server already exposes the essential Witness/runtime endpoints needed for a first bridge slice, including:

- `POST /api/inquiry/turn`
- `POST /api/inquiry/preview`
- `GET /api/inquiry/sessions`
- `GET /api/inquiry/sessions/:id`
- `POST /api/witness/consent`
- `GET /api/witness/consent?witnessId=...`
- `GET /api/witness/testimony?witnessId=...`
- `GET /api/witness/testimony/:id`

Milestone 1 should decide whether TWP calls these directly over the private boundary or whether G_5.2 adds a thinner bridge-oriented facade that narrows and stabilizes the contract for TWP.

Preferred direction for this milestone:

- keep the first implementation simple
- allow a thin G_5.2 bridge facade **only if** it reduces UI coupling to dashboard-server internals
- do not create a second independent dialogue engine in TWP

---

## In scope

### Workstream 1 — TWP bridge integration boundary

Build the TWP-side internal service/client that talks to G_5.2.

In scope:
- bridge client module
- environment/config for G_5.2 base URL + shared secret or equivalent private auth
- explicit request/response shapes for the four bridge actions above
- failure handling that distinguishes consent denial, runtime failure, and transport failure

Done when:
- TWP has one bridge module instead of ad hoc route-to-route calls

### Workstream 2 — Witness acceptance-to-invite handoff

Connect accepted Gate outcomes to Witness bridge readiness.

In scope:
- generate `witnessId` on acceptance
- bind `witnessId` to invite/access mapping
- persist minimal linkage record in TWP
- prepare witness-facing entry path to begin or resume G_5.2-backed dialogue

Done when:
- an accepted witness can actually enter the bridge flow without manual DB edits

### Workstream 3 — First governed dialogue roundtrip

Make TWP use G_5.2 for the first live Witness turn flow.

In scope:
- create/resume Witness session through bridge
- mirror operational consent status at high level in TWP UI
- submit one or more turns through G_5.2
- render assistant response in TWP witness-facing surface
- persist turns/testimony only in G_5.2 Witness roots

Done when:
- one live accepted witness journey produces a valid Witness session + testimony in G_5.2

### Workstream 4 — Operator visibility and audit-friendly troubleshooting

Give the operator enough cross-system visibility to debug the first bridge.

In scope:
- TWP-side bridge event/error visibility per witness
- pointer display for `witnessId`, `sessionId`, and current testimony pointer
- clear operator messages for consent gate failures and transport/runtime failures

Done when:
- bridge failures are diagnosable without repo surgery

### Workstream 5 — Bridge verification note

Record the milestone outcome explicitly.

In scope:
- one dated milestone note or implementation note describing:
  - accepted witness path used
  - bridge contract chosen
  - exact fields kept in TWP
  - exact roots written in G_5.2
  - friction/gaps found

Done when:
- another operator/developer can understand the first bridge slice from docs alone

---

## Explicit non-goals

The following are deliberately out of scope for Milestone 1.

### 1. P-E-S bridge work
- no `pes` public runtime bridge
- no dual-product shared UX convergence yet

### 2. Historical alpha migration
- no import of legacy TWP alpha sessions/testimony into G_5.2
- no schema-mapping cleanup for old structural data

### 3. Queueing / event bus / distributed workers
- no Redis
- no async command bus
- no webhook choreography

### 4. Public-scale security branch
- no full production auth redesign
- no multi-user role lattice beyond current alpha needs
- no rate limiting / abuse hardening program

### 5. Corpus / MHS / outreach execution
- no Alpha Week cohort execution yet
- no Exemplar Corpus compilation yet
- no MHS packet packaging yet
- no Tier A outreach yet

Those belong after the bridge works.

---

## Deliverables

By the end of Milestone 1, the repos should have:

1. one agreed private bridge contract between TWP and G_5.2
2. one TWP bridge client or integration surface
3. accepted-witness handoff into `witnessId`
4. first live Witness dialogue roundtrip backed by G_5.2
5. persisted Witness consent/session/testimony state in the correct G_5.2 roots only
6. minimal operator visibility for bridge status/errors in TWP
7. one dated milestone note recording outcome and gaps

---

## Exit criteria

Milestone 1 is complete when all of the following are true.

### Boundary correctness
- TWP creates `witnessId`
- TWP keeps only minimal linkage/control-plane state
- G_5.2 remains source of truth for consent/session/testimony/runtime artifacts
- no `pes` roots are touched by the witness bridge flow

### Functional bridge proof
- one accepted witness can enter the dialogue path from TWP
- TWP can create or resume a Witness session through G_5.2
- TWP can submit a governed witness turn through G_5.2
- G_5.2 persists the result successfully in Witness roots

### Consent correctness
- missing required Witness consent still blocks persistence correctly
- consent decisions can be recorded and re-read through the bridge path
- TWP reflects consent summary without becoming the source of truth

### Operator diagnosability
- transport, runtime, and consent failures are distinguishable
- operator can identify the linked `witnessId`, `sessionId`, and testimony pointer
- the first bridge slice does not require hidden manual fixes to complete

### Documentation
- milestone outcome is recorded in a dated note
- the chosen contract and ownership boundary are explicit in repo docs

---

## Suggested execution order

### Phase 1 — Contract lock
- finalize bridge endpoint set
- decide direct dashboard-server endpoint use vs thin bridge facade
- define auth/config for private server-to-server calls

### Phase 2 — TWP linkage and invite handoff
- create `witnessId` on acceptance
- store minimal linkage record
- connect invite/access path to bridge entry

### Phase 3 — Session + consent bridge
- create/resume session action
- consent read/write action
- TWP witness-entry screen reflects bridge state

### Phase 4 — First live turn path
- submit witness turn through G_5.2
- render returned output in TWP
- confirm session/testimony state lands correctly in Witness roots

### Phase 5 — Operator proof + closeout
- run one accepted-witness proof journey
- record exact artifacts/IDs/roots touched
- document friction and next changes

---

## Risks and controls

### Risk: TWP quietly becomes a second dialogue runtime
**Control:** all dialogue execution goes through G_5.2 for this slice.

### Risk: TWP starts duplicating governed artifacts
**Control:** store only minimal linkage/access state in TWP.

### Risk: Witness traffic accidentally touches `pes` state
**Control:** all bridge calls explicitly target `product = witness` and verify resulting roots.

### Risk: bridge auth/config turns into premature infrastructure work
**Control:** use the thinnest private server-to-server auth/config that is sufficient for alpha.

### Risk: milestone expands into corpus/outreach prematurely
**Control:** keep Alpha Week, corpus, MHS, and outreach as downstream milestones.

---

## Done statement

Milestone 1 is done when:

> an accepted witness can move from TWP into a G_5.2-backed governed dialogue path, and the resulting consent, session, and testimony state land only in Witness roots while TWP retains only the minimal control-plane linkage needed to operate the journey.
