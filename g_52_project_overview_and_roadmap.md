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

G_5.2 is a canon-first engineered runtime for a versioned authored persona.

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
A structured canon-first identity layer now exists and is the real center of gravity of the repo.

Key canon files include:
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
- canon loading
- canon validation
- continuity fact loading
- canon selection
- retrieval set construction
- draft pass
- critique pass
- revision pass
- structured memory decision logic
- selective durable-memory persistence
- session persistence with summaries and recent-turn carryover
- provider abstraction

It is already operating as a real system rather than as a stack of aspirations.

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

This turned the project from “interesting runtime” into “inspectable runtime.”

---

## 5. What this means now

G_5.2 is no longer just a design direction.
It is now a functioning governed runtime with:
- a typed identity layer
- a real orchestration loop
- eval-driven discipline
- provider comparison
- report diffing
- operator visibility
- persisted inquiry sessions
- selective durable memory

That is the foundation.

It does not yet make the project complete.
But it does mean the project has crossed the line from concept into durable system.

---

## 6. What is not built yet

Important missing pieces still remain.

### 6.1 Editorial workflow for canon evolution
The system knows canon must evolve through review, but the workflow still needs a practical operator-facing loop.

That means:
- proposal creation
- proposal review
- acceptance/rejection flow
- continuity-fact drafting flow
- canon revision logging

### 6.2 Memory discipline beyond V1
Durable memory now exists, but the next stage still needs more refinement.

That includes:
- better operator triage for proposed-but-skipped memory
- clearer handling of resolved `open_thread` items
- stronger anti-pollution coverage under longer-lived real sessions
- eventual approval or editorial workflow only if it proves necessary

### 6.3 Public-facing product boundary
The current dashboard is operator tooling, not a public-facing experience.
That distinction should remain intact until the inquiry runtime is ready.

---

## 7. Current maturity assessment

### What is already strong
- identity layer
- governance logic
- canon/artifact separation
- provider portability
- eval discipline
- observability
- operator ergonomics
- inquiry persistence
- memory visibility

### What is stable enough to trust
- canon loading and validation
- recovered artifact handling
- response orchestration
- critique pass usefulness
- regression harness as baseline guardrail
- provider-drift interpretation
- session persistence
- durable-memory write/retrieval rules
- inquiry inspection surface

### What is still provisional
- memory policy in live use
- editorial studio flow
- long-horizon product UX
- how much of the operator surface becomes formal product surface later

---

## 8. Milestone roadmap to v1

This roadmap is expressed as milestones M0 – M8. Each milestone advances one or more rungs of the release ladder defined in [`docs/release-criteria.md`](docs/release-criteria.md).

Completed foundation work (pre-M0) is captured in sections 4 and 7 above: baseline governance lock, inquiry persistence, minimal inquiry surface, and memory discipline v1 are all implemented.

### M0 — Baseline lock & source-of-truth cleanup
**Status:** In progress

Converge documentation onto a single authoritative definition of the system. Define the subsystem map, release ladder, v1 scope, and core invariants. No code changes to canon, orchestration, evals, or dashboard subsystems.

Deliverable: `docs/system-map.md`, `docs/release-criteria.md`, `docs/invariants.md`, and aligned README + roadmap.

### M1 — Persistence & trace hardening
Strengthen the persistence and trace layer so long-lived inquiry sessions and long trace histories remain reliable and inspectable. Prerequisite for the editorial-grade rung.

### M2 — Inquiry surface v1.5
Extend the operator inquiry UI to support the workflows M3 – M5 will need: richer turn navigation, clearer context disclosure, better session management.

### M3 — Memory discipline v2
Add triage for proposed-but-skipped memory, explicit handling of resolved `open_thread` items, stronger anti-pollution coverage under longer-lived real sessions, and eval cases that protect the new behavior.

### M4 — Canon editorial workflow ✅ implemented
Turn governed canon change into a first-class workflow: proposals, continuity-fact drafting, approval / rejection notes, explicit promotion tooling, and operator prompts that distinguish "draft as proposal" from "promote to canon".

Landed via `packages/orchestration/src/canon-proposals/` (proposal schema, allowlisted canon paths with traversal protection, line-level diff, continuity-fact YAML drafter with auto-assigned `CF-NNN` ids, file-backed proposal store, applyProposal, and changelog scaffolding) plus the `/api/canon/...` endpoints in `apps/dashboard/src/server.ts` and the `editorial.html` operator UI (proposal list with status/source/path filters, doc + continuity-fact editors, diff viewer, accept / reject / needs-revision controls, review history, changelog auto-scaffold under `packages/canon/changelog/`).

### M5 — Reflection & authored artifact workflow
A disciplined reflection loop: draft → critique → revise authoring path, artifact storage with metadata, and an explicit promotion path from reflection artifact into canon only when the operator approves.

### M6 — Eval & drift-control expansion ✅ implemented
Expand eval coverage to protect editorial, reflection, and memory-v2 behavior; formalize provider comparison runs as first-class artifacts; keep drift measurable rather than papered over with per-provider tuning.

Landed via per-case `subsystem` and `critical` tagging in `packages/evals/src/types.ts` + `schemas/case.ts`, subsystem scorecards in `packages/evals/src/subsystems.ts` plumbed through `buildScoreReport`, console (`printSubsystemScorecards`), and the persisted JSON report (`reportSchema.ts`); merge-blocking gate (exit code `2` + `MERGE-BLOCKING` banner) wired into both `packages/evals/src/index.ts` and `scripts/run-evals.ts`; new eval suites for memory pollution, memory contradiction, editorial proposal handling, continuity-fact proposal quality, reflection discipline, artifact/canon boundary, provider drift on identical canon, and long-horizon coherence under `packages/evals/src/fixtures/cases/`; dashboard diff (`apps/dashboard/src/reportUtils.ts`) extended with `subsystemDelta`, `criticalDelta`, and prompt-deltas (`systemPrompt` / `userPrompt`); drift bands captured in `docs/drift-budget.md`, merge-blocking policy in `docs/eval-discipline.md`, and the gold-baseline refresh flow in `docs/gold-baseline-process.md` + `scripts/refresh-gold-baseline.ts` + `packages/evals/gold-baselines/`.

### M7 — Operator studio integration
Unify the inquiry, editorial, reflection, memory, and eval surfaces into one coherent operator studio experience.

### M8 — Release hardening & v1 threshold ✅ implemented
Stabilize configuration, reproducibility, and upgrade paths so the system can be used regularly without repo surgery. Cross the v1 threshold as defined in `docs/release-criteria.md`.

Landed via the v1 release checklist (`docs/v1-release-checklist.md`) covering canon, persistence, memory, editorial, reflection, evals, studio, docs, ops, backups, RC baselines, and invariants; an operator handbook (`docs/operator-handbook.md`); a recovery & backups doc with six numbered scenarios (`docs/recovery-and-backups.md`); six canonical demo paths (`docs/demo-paths.md`), all exercised end-to-end against the MockProvider by `scripts/smoke-tests.ts` (run via `pnpm smoke`); a per-provider RC baseline procedure (`docs/release-candidate-baseline.md`) that reuses `scripts/refresh-gold-baseline.ts`; and an explicit post-v1 support posture (`docs/post-v1-support-posture.md`) marking public-launch concerns out of scope. No runtime behavior changes.

---

## 9. What “complete” might mean later

“Complete” should stay undefined for now.
That is the right answer.

Still, the later horizon likely includes:
- a mature inquiry runtime
- a strong editorial studio
- reflection authoring and publication
- multi-provider governance comparisons
- durable memory discipline
- archive + runtime integration without conflation
- possible public-facing release surface

But that should remain secondary to the actual nearer milestone:
**a genuinely usable V1.**

---

## 10. Recommended immediate next moves

The shortest path from the current strong foundation to a first usable v1 is the milestone ladder in section 8:

1. **M0** — lock the baseline and converge documentation (this milestone).
2. **M1** — harden persistence and traces so later workflows can rely on them.
3. **M2 – M4** — extend the operator surface, harden memory, and land the canon editorial workflow (editorial-grade rung).
4. **M5 – M6** — add the reflection / authored-artifact workflow and expand eval + drift control (reflection-grade rung).
5. **M7 – M8** — integrate the operator studio and cross the v1 release threshold.

Milestones M1 – M8 each have their own task record; this roadmap is the shared map, not the per-milestone specification.

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
