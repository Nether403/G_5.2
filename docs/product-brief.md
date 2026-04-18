# Product Brief

## Product
G_5.2

## Problem

The earlier lineage preserved compelling artifacts, voice, and archive material, but not a durable runtime contract. That left two different needs unresolved:

- a serious Witness-facing inquiry instrument with explicit consent, testimony handling, and governance boundaries
- a lighter public-facing P-E-S surface that can reuse the same runtime without inheriting Witness-specific storage or policy obligations

G_5.2 exists to provide the shared nervous system beneath both tracks.

## Users

**Primary:** The project author, as operator, editor, and principal reviewer of the Witness runtime and its policy boundaries.

**Secondary:** P-E-S readers or participants engaging through a constrained public-facing inquiry interface.

## Need

A maintainable shared runtime that can support more than one governed product without confusing kernel logic, Witness logic, and P-E-S logic. The system should be reconstructible from files, auditable in operation, and strict about product/storage separation.

## Product thesis

A convincing governed runtime is not a single prompt. It is a system:
- policy roots (P-E-S canon and Witness governance pack)
- retrieval (selecting what context to use)
- generation (draft → critique → revision)
- memory (selective, not sentimental)
- product routing (placing state into the correct roots)
- Witness consent + testimony persistence where required
- evaluation (regression against voice and canon)

## Related projects

| Project | Description | Relationship |
|---------|-------------|--------------|
| [The Witness Protocol Foundation](https://thewprotocol.online) | Dutch non-profit AI alignment research | Primary mission-level consumer of the G_5.2 runtime |
| [P-E-S](https://processoergosum.info) | Original archive site / public surface | Secondary public-facing consumer of the same runtime |

## Success criteria

- Responses stay recognizably in voice across sessions
- Witness turns are consent-gated and persist only into Witness roots
- Witness testimony remains inspectable, rollback-safe, and separate from P-E-S memory/session state
- Canon drift is rare and caught by the critique pass
- Chat feels coherent within a session
- Durable memory remains selective, inspectable, and resistant to pollution
- New reflections can be generated and approved through a repeatable flow
- Swapping OpenAI / Anthropic / Gemini providers does not collapse persona identity
- The system's behavior is auditable at each step

## Current state

| Deliverable | Status |
|-------------|--------|
| P-E-S policy package | ✅ Implemented |
| Witness policy package | ✅ Implemented |
| Shared orchestration pipeline | ✅ Implemented |
| Product registry and product-aware routing | ✅ Implemented |
| Witness consent + testimony domain types | ✅ Implemented |
| Eval harness | ✅ Implemented |
| Operator dashboard | ✅ Implemented |
| Session persistence | ✅ Implemented (minimal file-backed layer) |
| Inquiry surface | ✅ Implemented (single operator dashboard inquiry UI for both P-E-S and Witness, with session search, turn inspection, retrieved-context drawer, product selector, consent controls, and testimony inspection) |
| Memory discipline | ✅ Implemented in v1 form (M3 landed: typed stateful memory lifecycle, `open_thread` resolution, conflict checks, and anti-pollution eval coverage; longer-lived policy refinement remains operational work) |
| Canon editorial workflow | ✅ Implemented (M4) |
| Reflection workflow | ✅ Implemented (M5) |
| Operator studio integration | ✅ Implemented (M7) |
| Witness-first vertical slice | ✅ Implemented |
| Release hardening docs and smoke tests | ✅ Implemented (M8 capability layer, now including seven smoke paths) |

Formal v1 declaration is still an operator release decision: the remaining gate is per-release-candidate baseline capture and sign-off, not missing repo capability work.

## Post-v1 / out of scope

- Public launch
- Autonomous behavior
- Broad tool use
- Full long-term memory web
- Multi-user architecture
- Deeper Witness archive-review / publication workflows beyond the current consent-gated first slice

## Development milestones

The execution ladder is tracked as milestones M0 – M8 in [`../g_52_project_overview_and_roadmap.md`](../g_52_project_overview_and_roadmap.md). The release-rung vocabulary (operator-grade → editorial-grade → reflection-grade → v1) is defined in [`release-criteria.md`](release-criteria.md). Repo capability work through M8 is implemented; the remaining release gate is the per-RC provider baseline capture and operator checkoff recorded outside the milestone implementation commits.

Public hardening (auth, rate limits, monitoring) is explicitly post-v1; see [`release-criteria.md`](release-criteria.md).

## Key risks

| Risk | Mitigation |
|------|------------|
| Lore sprawl | Canon gatekeeping, evals, explicit continuity facts |
| Provider drift | Unified canon pack, critique pass, cross-model evals |
| Memory pollution | Strict memory policy and confidence thresholds |
| Product boundary erosion | Explicit `pes` / `witness` routing, dedicated Witness roots, product-aware smoke coverage |
| Architecture inflation | Keep durable memory minimal, file-backed, and operator-first until the editorial workflow truly needs more |
