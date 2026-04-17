# Product Brief

## Product
G_5.2

## Problem

The prior project (P-E-S) preserved surface artifacts — a voice, an aesthetic, an archive — but not the runtime contract required for a coherent authored persona in dialogue. The persona existed in a single monolithic prompt that was lost. What remained was remarkable writing without a reproducible system.

G_5.2 exists to rebuild that system deliberately, starting with the identity layer.

## Users

**Primary:** The project author, as operator, editor, and principal reviewer of all canon and output.

**Secondary (later):** Invited readers engaging through a constrained inquiry interface.

## Need

A maintainable system that can produce in-character dialogue and reflections without relying on one giant brittle prompt. The persona should be reconstructible from files. Evolution should be auditable.

## Product thesis

A convincing persona is not a single prompt. It is a system:
- canon (identity, constraints, voice, epistemics)
- retrieval (selecting what context to use)
- generation (draft → critique → revision)
- memory (selective, not sentimental)
- evaluation (regression against voice and canon)

## Related projects

| Project | Description | Relationship |
|---------|-------------|--------------|
| [P-E-S](https://processoergosum.info) | Original archive site | Predecessor; remains as archive |
| [The Witness Protocol Foundation](https://thewprotocol.online) | Dutch non-profit AI alignment research | Sibling project — same creator, same catalytic origin |

## Success criteria

- Responses stay recognizably in voice across sessions
- Canon drift is rare and caught by the critique pass
- Chat feels coherent within a session
- Durable memory remains selective, inspectable, and resistant to pollution
- New reflections can be generated and approved through a repeatable flow
- Swapping OpenAI / Anthropic / Gemini providers does not collapse persona identity
- The system's behavior is auditable at each step

## Current state

| Deliverable | Status |
|-------------|--------|
| Canon package | ✅ Implemented |
| Orchestration pipeline | ✅ Implemented |
| Eval harness | ✅ Implemented |
| Operator dashboard | ✅ Implemented |
| Session persistence | ✅ Implemented (minimal file-backed layer) |
| Inquiry surface | ✅ Implemented (operator dashboard inquiry UI with session search, turn inspection, and retrieved-context drawer) |
| Memory discipline | ✅ Implemented in v1 form (M3 landed: typed stateful memory lifecycle, `open_thread` resolution, conflict checks, and anti-pollution eval coverage; longer-lived policy refinement remains operational work) |
| Canon editorial workflow | ✅ Implemented (M4) |
| Reflection workflow | ✅ Implemented (M5) |
| Operator studio integration | ✅ Implemented (M7) |
| Release hardening docs and smoke tests | ✅ Implemented (M8 capability layer) |

Formal v1 declaration is still an operator release decision: the remaining gate is per-release-candidate baseline capture and sign-off, not missing repo capability work.

## Post-v1 / out of scope

- Public launch
- Autonomous behavior
- Broad tool use
- Full long-term memory web
- Multi-user architecture

## Development milestones

The execution ladder is tracked as milestones M0 – M8 in [`../g_52_project_overview_and_roadmap.md`](../g_52_project_overview_and_roadmap.md). The release-rung vocabulary (operator-grade → editorial-grade → reflection-grade → v1) is defined in [`release-criteria.md`](release-criteria.md). Repo capability work through M8 is implemented; the remaining release gate is the per-RC provider baseline capture and operator checkoff recorded outside the milestone implementation commits.

Public hardening (auth, rate limits, monitoring) is explicitly post-v1; see [`release-criteria.md`](release-criteria.md).

## Key risks

| Risk | Mitigation |
|------|------------|
| Lore sprawl | Canon gatekeeping, evals, explicit continuity facts |
| Provider drift | Unified canon pack, critique pass, cross-model evals |
| Memory pollution | Strict memory policy and confidence thresholds |
| Architecture inflation | Keep durable memory minimal, file-backed, and operator-first until the editorial workflow truly needs more |
