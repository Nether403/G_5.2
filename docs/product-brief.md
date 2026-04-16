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
| Durable memory discipline | ✅ Implemented (selective file-backed global/session memory with inspection, delete, and eval coverage) |

## Not in v0.1

- Public launch
- Autonomous behavior
- Broad tool use
- Full long-term memory web
- Multi-user architecture
- Canon proposal/editorial workflow

## Development phases

| Phase | Scope |
|-------|-------|
| 0 — Foundation | Canon package, provider abstraction, canon validation, orchestration baseline, eval harness |
| 1 — Governance baseline hardening | Active-only retrieval, glossary/recovered-artifact runtime support, report metadata, operator diffing |
| 2 — Inquiry MVP | Session-connected inquiry flow, simple operator inquiry UI, richer summaries, response review |
| 2.5 — Operator refinement | Better session browsing, turn inspection, lighter report ergonomics |
| 3 — Memory Discipline V1 | Selective durable memory writes, retrieval, inspection, delete, and regression coverage |
| 4 — Editorial workflow | Canon proposal review, continuity drafting, promotion workflow |
| 5 — Reflection system | Draft + critique + revision authoring flow, artifact storage, publishing path |
| 6 — Public hardening | Auth, rate limits, monitoring, error handling |

## Key risks

| Risk | Mitigation |
|------|------------|
| Lore sprawl | Canon gatekeeping, evals, explicit continuity facts |
| Provider drift | Unified canon pack, critique pass, cross-model evals |
| Memory pollution | Strict memory policy and confidence thresholds |
| Architecture inflation | Keep durable memory minimal, file-backed, and operator-first until the editorial workflow truly needs more |


