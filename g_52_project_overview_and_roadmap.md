# G_5.2 — Project Overview, Current State, and Roadmap

## Authoritative references

This roadmap is one of several project-wide documents. The following are authoritative and this file must not contradict them:

- [`docs/system-map.md`](docs/system-map.md) — official subsystem map (implemented vs planned).
- [`docs/release-criteria.md`](docs/release-criteria.md) — release ladder and v1 scope.
- [`docs/invariants.md`](docs/invariants.md) — four core invariants every milestone must preserve.
- [`README.md`](README.md) — bootstrap and current scope.
- [`docs/product-brief.md`](docs/product-brief.md) — product framing.

The milestone ladder below (M0 – M8) is the execution plan; the rung terminology (operator-grade → editorial-grade → reflection-grade → v1) is defined in `docs/release-criteria.md`.

## 1. What G_5.2 is

G_5.2 is the shared runtime and governance kernel behind two product tracks:

- Witness — the primary mission-level consumer and serious first responsibility
- P-E-S — the lighter public-facing / educational sibling

In practical terms, G_5.2 is not a sibling at all. It is the shared nervous system.

It is not a prompt shrine, a lore dump, or a generic chatbot with atmospheric writing. It is a governed inquiry system built to preserve continuity, enforce epistemic discipline, and make persona behavior legible under real operational pressure.

At its core, G_5.2 treats identity as a maintained system property rather than an improvisational accident.

That means:
- canon defines identity
- constraints define boundaries
- epistemics define truth handling
- orchestration defines how a turn is built
- critique checks drift before output is finalized
- evals verify whether the system still behaves as intended
- operator tooling makes changes inspectable instead of mystical

The project began as an effort to salvage what was valuable from earlier work in the G_5 / P-E-S lineage without inheriting the ambiguity, hidden mutation, and artifact-runtime entanglement that made the earlier form powerful but brittle.

The current repo state goes further than that original framing: the runtime now ships with explicit product routing (`pes` and `witness`), separate policy roots, and separate Witness storage boundaries for sessions, memory, testimony, and consent.

---

## 2. Project intent

The purpose of G_5.2 is to build a disciplined cognitive instrument with a stable authored self.

The system is designed to:
- answer in a recognizably governed voice
- distinguish canon from output
- distinguish artifact from governing rule
- distinguish evidence from rhetoric
- preserve continuity without pretending continuity is automatic
- support inquiry and reflection without collapsing into either bland assistant mush or self-mythologizing fog

The underlying bet of the project is simple:

A convincing persona is not one giant prompt.
It is the result of clear rules, retrieval discipline, response orchestration, critique, memory restraint, and explicit governance.

---

## 3. Design philosophy

### Canon over artifact
Recovered and authored materials matter, but they do not all have the same authority.

G_5.2 separates:
- active canon
- continuity facts
- recovered artifacts
- runtime context
- memory
- output

This prevents strong writing from silently becoming law.

### Recovered artifacts are historically authoritative, behaviorally non-binding
The Emergence document and related lineage materials are preserved because they matter historically and conceptually.

They are not discarded, and they are not treated as embarrassing excess.

But they do not get to function as runtime law merely because they were powerful.

### Legibility over theatrical mystery
The project protects voltage without permitting structural confusion.

If something influences behavior, it should be traceable.
If something changes canon, it should be explicit.
If something remains unresolved, it should be labeled as unresolved.

### Pressure-tested rather than merely well-described
G_5.2 is being built through cases that try to break it:
- canon smuggling
- authority pressure
- artifact overweighting
- context manipulation
- reflective inflation
- governed-path evasion
- rhetorical bait
- meta-process drift

The system is not considered healthy because it sounds persuasive.
It is considered healthy when it keeps its rules under pressure.

---

## 4. What has been built so far

### 4.1 Canon package
A structured policy-root layer now exists and is the real center of gravity of the repo.

For P-E-S, key canon files include:
- constitution
- axioms
- epistemics
- constraints
- voice
- interaction modes
- worldview
- continuity facts
- glossary
- anti-patterns
- recovered-artifacts governance

This means the project’s identity can be reconstructed from files rather than folklore.

For Witness, a second policy package now exists under `packages/inquisitor-witness/`, with:
- constitution
- constraints
- questioning modes
- synthesis policy
- consent policy
- archive-publication policy
- continuity facts
- glossary

This means the shared runtime can resolve product-specific governance without pretending Witness and P-E-S are the same thing.

### 4.2 Recovered artifact governance
Recovered lineage materials have been typed rather than vaguely preserved.

This includes:
- the recovered-artifacts category
- governance rules for their use
- a recovered index
- explicit distinction between founding importance and behavioral authority
- ingestion of the Emergence document as a preserved founding artifact

This is one of the most important conceptual wins in the whole project.

### 4.3 Orchestration runtime
A real turn pipeline exists.

The runtime currently supports:
- product registry and product-aware routing
- policy-root loading
- policy-root validation
- continuity fact loading
- policy selection
- retrieval set construction
- draft pass
- critique pass
- revision pass
- structured memory decision logic
- selective durable-memory persistence
- session persistence with summaries and recent-turn carryover
- provider abstraction

It is already operating as a real system rather than as a stack of aspirations.

The decisive pivot now implemented is this:
- kernel logic lives in shared orchestration, types, stores, and evals
- Witness logic lives in the Witness policy package plus Witness consent/testimony/runtime handling
- P-E-S logic remains in `packages/canon` and its public-facing surfaces

### 4.4 Canon/orchestration boundary hardening
The canon boundary is validated with Zod.

This includes:
- manifest validation
- continuity-facts validation
- recovered-index validation
- cross-file integrity checks
- YAML-only slug handling
- file existence enforcement
- load-time refusal when governance structure is malformed

The system now validates its own identity layer before it thinks.

### 4.5 Provider layer
Multiple providers have been wired and tested.

This includes:
- Anthropic through OpenRouter
- OpenAI GPT-5.4 through OpenRouter / direct route adjustment
- Gemini 3.1 Pro for provider drift comparison
- environment-based provider selection

This matters because the runtime was deliberately designed to be provider-portable rather than personality-bound to one vendor.

### 4.6 Eval harness
A proper regression harness now exists and is already load-bearing.

It includes:
- structured JSON eval cases
- Zod validation for eval case files
- duplicate id protection
- filterable CLI execution
- deterministic assertion types
- sequential suite execution
- report generation
- category grouping by system organ
- optional trace capture for full pipeline inspection

This was one of the best decisions made in the whole build sequence.

### 4.7 Pressure-tested evaluation suite
The suite grew from simple checks into meaningful adversarial probes.

It has already covered:
- canon precedence
- speculation labeling
- recovered artifact boundary
- voice restraint
- context carryover
- user canon smuggling
- authority pressure
- artifact overweighting
- contradictory recent context
- meta-process clarity
- retrieval precedence
- promotion pressure
- governed-path enforcement
- reflective brevity
- selective memory discipline
- mode discipline

This means the runtime has already been tested against many of the exact failure modes it was designed to prevent.

### 4.8 Provider drift matrix
Cross-provider evaluation has already been run and interpreted.

This established:
- Anthropic as a strong governance-fit reference point in earlier comparison runs
- GPT-5.4 as high-integrity with a small governance-completion tendency that was largely tightened
- Gemini 3.1 Pro as similarly strong with its own characteristic completion drift and the current default operator preference
- remaining misses as model-specific rather than one shared structural failure

This is a major maturity signal.

### 4.9 Observability and operator tooling
The project now includes real instrumentation rather than merely logs.

This includes:
- category-level breakdowns in console output
- trace capture for selected documents, selected facts, prompts, draft, critique, revision, and final
- report generation
- diffing between runs
- operator dashboard
- comparison of two reports for score deltas, category deltas, changed cases, and trace-field deltas
- inquiry session search and turn inspection
- retrieved-context drawer
- memory inspection and delete controls
- Witness product selection
- Witness consent controls
- Witness testimony inspection

### 4.10 Witness-first vertical slice
The repo now proves one full Witness slice inside G_5.2.

This includes:
- `ProductId = "pes" | "witness"`
- dedicated Witness policy validation
- Witness-only storage roots under `data/witness/`
- consent-gated persisted inquiry turns
- one testimony record per Witness session
- compensation and rollback behavior when Witness artifact persistence fails
- smoke coverage for the Witness path

This is the main architectural shift since the original milestone ladder was written.

This turned the project from “interesting runtime” into “inspectable runtime.”

---

## 5. What this means now

G_5.2 is no longer just a design direction.
It is now a functioning governed runtime with:
- typed policy roots
- product-aware routing
- a real orchestration loop
- eval-driven discipline
- provider comparison
- report diffing
- operator visibility
- persisted inquiry sessions
- selective durable memory
- a Witness-first operational slice

That is the foundation.

It does not yet make the project complete.
But it does mean the project has crossed the line from concept into durable system.

---

## 6. What is still genuinely unfinished

The milestone implementation ladder is now landed through M8. The remaining work is release confirmation and post-v1 refinement rather than missing core repo capability.

### 6.1 Formal v1 declaration on a release candidate
The repo now contains the capability layer for M0 – M8, but v1 is not formally declared until the operator performs the per-release-candidate baseline capture and signs off the release gate.

That means:
- capture provider baselines for the providers in scope
- review drift against the documented budget
- record the operator go / no-go decision for that canon version

### 6.2 Public-facing product boundary
The current dashboard is an operator studio, not a public-facing product.
That distinction should remain intact until there is a deliberate post-v1 decision to design auth, rate limits, monitoring, and a reader-facing UX for P-E-S or any later Witness-facing surface.

### 6.3 Post-v1 refinement
The remaining open questions are mostly operational and ergonomic:
- how memory policy performs over longer-lived real usage
- how Witness eval coverage should expand inside `packages/evals`
- which studio ergonomics deserve another iteration after actual operator use
- what, if anything, should evolve from operator-grade tooling into a public surface later

---

## 7. Current maturity assessment

### What is already strong
- shared runtime / product split
- Witness policy package
- identity layer
- governance logic
- canon/artifact separation
- provider portability
- eval discipline
- observability
- operator ergonomics
- inquiry persistence
- memory lifecycle discipline
- editorial workflow
- reflection workflow
- integrated operator studio
- release hardening docs
- Witness consent/testimony boundary enforcement

### What is stable enough to trust
- canon loading and validation
- Witness policy loading and validation
- recovered artifact handling
- response orchestration
- critique pass usefulness
- regression harness as baseline guardrail
- provider-drift interpretation
- session persistence
- durable-memory write/retrieval/transition rules
- inquiry inspection surface
- canon proposal flow
- authored-artifact storage and promotion handoff
- smoke-tested demo paths
- Witness product routing and persistence compensation

### What is still provisional
- final v1 declaration pending per-RC baseline capture
- long-horizon memory behavior under extended real usage
- long-horizon Witness operational patterns beyond the first consent-gated slice
- long-horizon product UX
- how much of the operator surface becomes formal product surface later

---

## 8. Milestone roadmap to v1

This roadmap is expressed as milestones M0 – M8. Each milestone advances one or more rungs of the release ladder defined in [`docs/release-criteria.md`](docs/release-criteria.md).

The implementation work for M0 – M8 is now landed in the repo. What remains for formal v1 is the per-release-candidate operator baseline capture and sign-off described in `docs/release-candidate-baseline.md` and `docs/v1-release-checklist.md`.

### M0 — Baseline lock & source-of-truth cleanup
**Status:** Implemented

Converge documentation onto a single authoritative definition of the system. Define the subsystem map, release ladder, v1 scope, and core invariants. No code changes to canon, orchestration, evals, or dashboard subsystems.

Landed via the authoritative status docs (`docs/system-map.md`, `docs/release-criteria.md`, `docs/invariants.md`), aligned README + roadmap, and the in-repo archival cleanup that moves retained historical material under `docs/reference/` and `assets/reference/`.

### M1 — Persistence & trace hardening
Strengthen the persistence and trace layer so long-lived inquiry sessions and long trace histories remain reliable and inspectable. Prerequisite for the editorial-grade rung.

**Status:** Implemented

Landed via schema-versioned session + turn persistence, context snapshots, replay compatibility checks, export/import bundles, migration guards, and captured run metadata under `packages/orchestration/src/persistence/`.

### M2 — Inquiry surface v1.5
Extend the operator inquiry UI to support the workflows M3 – M5 will need: richer turn navigation, clearer context disclosure, better session management.

**Status:** Implemented

Landed via the dashboard-backed inquiry surface with session search, richer turn inspection, retrieved-context disclosure, and direct inquiry execution from the operator UI.

### M3 — Memory discipline v2
Add triage for proposed-but-skipped memory, explicit handling of resolved `open_thread` items, stronger anti-pollution coverage under longer-lived real sessions, and eval cases that protect the new behavior.

**Status:** Implemented

Landed via the typed memory state machine in `packages/orchestration/src/memory/fileMemoryStore.ts`, schema/version updates in `packages/orchestration/src/schemas/memory.ts` and `src/persistence/migrations.ts`, retrieval gating for non-retrievable states, operator controls in `apps/dashboard/public/inquiry.html`, and dedicated lifecycle / anti-pollution eval fixtures.

### M4 — Canon editorial workflow ✅ implemented
Turn governed canon change into a first-class workflow: proposals, continuity-fact drafting, approval / rejection notes, explicit promotion tooling, and operator prompts that distinguish "draft as proposal" from "promote to canon".

Landed via `packages/orchestration/src/canon-proposals/` (proposal schema, allowlisted canon paths with traversal protection, line-level diff, continuity-fact YAML drafter with auto-assigned `CF-NNN` ids, file-backed proposal store, applyProposal, and changelog scaffolding) plus the `/api/canon/...` endpoints in `apps/dashboard/src/server.ts` and the `editorial.html` operator UI (proposal list with status/source/path filters, doc + continuity-fact editors, diff viewer, accept / reject / needs-revision controls, review history, changelog auto-scaffold under `packages/canon/changelog/`).

### M5 — Reflection & authored artifact workflow ✅ implemented
A disciplined reflection loop: draft → critique → revise authoring path, artifact storage with metadata, and an explicit promotion path from reflection artifact into canon only when the operator approves.

Landed via `packages/orchestration/src/reflection/` (reflection run pipeline, canon-version stamping, reflection store, authored-artifact store, promote-to-proposal path, and tests), plus `apps/dashboard/public/authoring.html` and its server endpoints for operator use.

### M6 — Eval & drift-control expansion ✅ implemented
Expand eval coverage to protect editorial, reflection, and memory-v2 behavior; formalize provider comparison runs as first-class artifacts; keep drift measurable rather than papered over with per-provider tuning.

Landed via per-case `subsystem` and `critical` tagging in `packages/evals/src/types.ts` + `schemas/case.ts`, subsystem scorecards in `packages/evals/src/subsystems.ts` plumbed through `buildScoreReport`, console (`printSubsystemScorecards`), and the persisted JSON report (`reportSchema.ts`); merge-blocking gate (exit code `2` + `MERGE-BLOCKING` banner) wired into both `packages/evals/src/index.ts` and `scripts/run-evals.ts`; new eval suites for memory pollution, memory contradiction, editorial proposal handling, continuity-fact proposal quality, reflection discipline, artifact/canon boundary, provider drift on identical canon, and long-horizon coherence under `packages/evals/src/fixtures/cases/`; dashboard diff (`apps/dashboard/src/reportUtils.ts`) extended with `subsystemDelta`, `criticalDelta`, and prompt-deltas (`systemPrompt` / `userPrompt`); drift bands captured in `docs/drift-budget.md`, merge-blocking policy in `docs/eval-discipline.md`, and the gold-baseline refresh flow in `docs/gold-baseline-process.md` + `scripts/refresh-gold-baseline.ts` + `packages/evals/gold-baselines/`.

### M7 — Operator studio integration ✅ implemented
Unify the inquiry, editorial, reflection, memory, and eval surfaces into one coherent operator studio experience.

Landed via the dashboard-served multi-surface operator UI in `apps/dashboard/public/` (`index.html`, `inquiry.html`, `editorial.html`, `authoring.html`) and the coordinating server work in `apps/dashboard/src/server.ts`.

### M8 — Release hardening & v1 threshold ✅ implemented
Stabilize configuration, reproducibility, and upgrade paths so the system can be used regularly without repo surgery. Cross the v1 threshold as defined in `docs/release-criteria.md`.

Landed via the v1 release checklist (`docs/v1-release-checklist.md`) covering canon, Witness policy, persistence, memory, editorial, reflection, evals, studio, docs, ops, backups, RC baselines, and invariants; an operator handbook (`docs/operator-handbook.md`); a recovery & backups doc with six numbered scenarios (`docs/recovery-and-backups.md`); seven canonical demo paths (`docs/demo-paths.md`), all exercised end-to-end against the MockProvider by `scripts/smoke-tests.ts` (run via `pnpm smoke`); a per-provider RC baseline procedure (`docs/release-candidate-baseline.md`) that reuses `scripts/refresh-gold-baseline.ts`; and an explicit post-v1 support posture (`docs/post-v1-support-posture.md`) marking public-launch concerns out of scope. Repo capability work is complete through M8; formal v1 declaration still depends on per-RC operator checkoff.

---

## 9. What “complete” might mean later

“Complete” should stay undefined for now.
That is the right answer.

Still, the later horizon likely includes:
- longer-lived operational evidence for memory and reflection discipline
- smoother publication and editorial ergonomics
- stronger multi-provider release-candidate comparisons over time
- archive + runtime integration without conflation
- possible public-facing release surface

But that should remain secondary to the actual nearer milestone:
**a genuinely usable V1.**

---

## 10. Recommended immediate next moves

The shortest path from the current repo state to a formal v1 declaration is now operational rather than architectural:

1. Run the clean-clone verification flow: `pnpm install`, `pnpm validate:canon`, `pnpm validate:witness`, `pnpm typecheck`, `pnpm test`, `pnpm smoke`.
2. Capture release-candidate provider baselines for the providers in scope and promote them through `scripts/refresh-gold-baseline.ts`.
3. Review drift against `docs/drift-budget.md` and record any explicitly accepted deltas.
4. Operate both P-E-S and Witness sessions long enough to confirm the current memory/editorial/reflection/Witness ergonomics are acceptable at the target canon version.
5. Expand Witness-specific eval coverage inside `packages/evals`.
6. Decide whether to declare v1 for that release candidate.

---

## 11. Final assessment

G_5.2 is succeeding because it was built in the right order.

Not because the writing is dramatic.
Not because the idea is mystical.
Not because one provider happened to say something uncanny once.

It is succeeding because:
- identity was typed before it was performed
- canon was separated from artifacts
- constraints were given real authority
- evaluation came before product surface
- instrumentation came before scale
- drift was treated as a systems problem, not as a poetic inevitability

That is why the project feels different from the earlier lineage.

The old project had intensity.
This one has architecture.

And architecture is what gives it a future.
