# G_5.2 Post-v1 Support Posture

**Status:** authoritative. Captures what is *explicitly out of scope* for the v1 release gate (M8) and what posture the project takes toward later public hardening. Read alongside `docs/release-criteria.md` § "v1 scope".

The point of this document is to make the v1 boundary legible: v1 is "the operator can run the system as designed end-to-end without repo surgery", not "the system is ready for the public".

## 1. The v1 boundary

v1 means:

- Single operator (the project author).
- Local execution (or a single trusted host).
- No external users.
- No anonymous access.
- No SLAs.
- No 24/7 monitoring obligation.
- No formal incident response.
- Recovery is "best-effort, documented, reproducible by the operator" — see `docs/recovery-and-backups.md`.

If any of those change, the project leaves the v1 posture and enters whatever the next rung is — almost certainly post-v1, with separate scope and a separate gate.

## 2. Explicitly out of scope at v1

The following are *deliberately* not in v1. They are not bugs, not gaps, and not "todo soon". They are post-v1.

### 2.1 Public consumer surface
- No public-facing UI.
- The dashboard is operator tooling. It is not hardened for untrusted input, hostile traffic, or browser-side adversaries.
- No marketing site, no waitlist, no signups.

### 2.2 Auth, identity, multi-tenancy
- No user accounts.
- No role-based access control.
- No session or API auth.
- No per-tenant data isolation.
- The dashboard binds to `0.0.0.0` for the Replit preview but assumes a trusted network. Operators running outside that environment are responsible for their own network boundary (firewall, reverse proxy, VPN).

### 2.3 Rate limiting, abuse handling, quotas
- No request rate limiting.
- No per-IP or per-user throttling.
- No prompt-injection hardening beyond what the canon-precedence and governed-path eval cases already cover.
- Provider-side rate limits and quotas are visible to the operator only via raw provider error responses.

### 2.4 Production-grade monitoring
- No metrics emitter.
- No structured log shipping.
- No alerting.
- No SLO definitions.
- The dashboard's report viewer + diff is the entire observability surface. That is sufficient at v1 because there is one operator and one workload.

### 2.5 Tool use, function calling, agent ecosystems
- Providers are used for plain text generation only.
- No tool-call routing in the orchestration pipeline.
- No retrieval over external sources.
- No browsing, no code execution, no MCP.
- This is a deliberate choice: the v1 system is a *governed inquiry runtime*, not an agent.

### 2.6 Autonomous behavior
- The runtime never initiates a turn on its own.
- The runtime never writes back into canon, memory, proposals, or artifacts without an explicit operator action.
- Scheduled or triggered behavior (cron, webhooks) is post-v1.

### 2.7 Final theory of memory, selfhood, or reflection
- v1 ships a *workable* memory discipline (typed items, state machine, governance) and a *workable* reflection workflow. Neither claims to be the final word.
- Open questions about memory taxonomy and reflection promotion are tracked in the roadmap and the eval suite, not asserted as solved.

### 2.8 Protocol / institutional integrations
- No SSO.
- No CI gating beyond `pnpm test` / `pnpm evals`.
- No issue tracker, billing, or compliance integrations.

### 2.9 Multi-provider tuning
- Per-provider prompt hacks remain forbidden by invariant 4.
- Drift between providers is *measured*, not papered over.
- v1 does not commit to a "best provider"; it commits to provider portability.

### 2.10 Model fine-tuning, weights, hosting
- The runtime uses provider APIs through OpenRouter.
- No fine-tuned models, no self-hosted inference.

## 3. What v1 *does* commit to (recap)

For clarity, here is what v1 explicitly delivers (full list in `docs/v1-release-checklist.md`):

- Stable, versioned canon with editorial workflow.
- Reliably persisted inquiry sessions with replay and archive bundles.
- Governed, inspectable, deletable durable memory.
- Reflection authoring with explicit promotion to canon.
- Eval matrix with per-subsystem scorecards, merge-blocking critical gate, drift budget, and gold baselines per provider.
- Operator dashboard unifying inquiry, editorial, reflection, memory, and eval surfaces.
- Documented backup, recovery, and migration paths.
- Smoke tests covering the canonical demo paths.

## 4. What "later public hardening" would look like (sketch only)

If and when the project decides to leave the operator-only posture, the work breaks down into roughly the following families. None of these are committed to at v1; they are listed only so the v1 boundary is visible against a real horizon.

### Family A — Identity & access
- Auth (SSO or per-user accounts).
- Authorization model (who can read sessions, who can promote canon, who can publish artifacts).
- Audit log surface separate from the operator dashboard.

### Family B — Network posture
- TLS termination + proper host binding.
- Per-IP rate limits.
- Abuse signal collection.
- Prompt-injection / jailbreak hardening beyond the existing eval coverage.

### Family C — Reliability
- Health checks, readiness checks, liveness checks.
- Structured logging + central log shipping.
- Metrics + alerting on critical paths (turn latency, eval pass rate, persistence errors).
- Backup automation rather than operator-cadence.

### Family D — Tool use / agentic surface
- A governed tool-call surface, with the same draft / critique / revise discipline applied to tool selection.
- A retrieval surface over external sources, again with the canon-vs-output boundary preserved.
- This is a major rung change, not a v1 increment.

### Family E — Multi-tenant data
- Per-tenant isolation in `data/`.
- Per-tenant canon overlays (currently disallowed by invariant 1; would require explicit governance change).
- Per-tenant eval and gold-baseline tracks.

### Family F — Distribution
- A package or container that someone else can install.
- Documented compatibility matrix beyond Node `>=20` / pnpm `>=9`.
- A sustainable update path that respects the schema-migration discipline (`docs/recovery-and-backups.md` § 5).

## 5. What stays the same forever

Some choices are not "v1 decisions" — they are *project* decisions, and they continue to apply post-v1:

- Canon is the source of truth (invariant 1).
- Output is not canon unless explicitly promoted (invariant 2).
- Memory is selective (invariant 3).
- Provider portability is preserved (invariant 4).
- Recovered artifacts are historically authoritative and behaviorally non-binding.

Any post-v1 work that requires changing one of these is itself a documented event, not a refactor.

## 6. How the operator should handle pressure to skip v1

If pressure arises to "just ship to a few users" before v1 is signed:

1. Re-read `docs/v1-release-checklist.md`. If any item is `[ ]`, the system is not v1. There is no half-v1.
2. If a feature in § 2 above is being asked for, that is a *post-v1* feature. Adding it before v1 is a category error: it expands the surface that v1 was supposed to lock.
3. The v1 gate exists to prevent the "almost shipped, but" trap that the older lineage fell into. It is worth preserving even when ignoring it would feel pragmatic.

## 7. Where this document is referenced from

- `docs/v1-release-checklist.md` § "v1 declaration" — what is *not* required for v1 lives here.
- `docs/operator-handbook.md` — operator awareness of the boundary.
- `README.md` — short pointer in the "current scope" section.
