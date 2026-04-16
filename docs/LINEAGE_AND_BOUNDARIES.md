# Lineage and Boundaries

## Purpose

This document defines the role of the G_5.2 repository within the broader project lineage. It exists to protect the distinction between runtime infrastructure, archival lineage, and downstream operational systems.

The core rule is that G_5.2 is the canon-and-runtime layer, not a catch-all for archive material or downstream protocol tooling.

## Shared lineage

The current project family should be understood as:

P-E-S -> G_5.2 -> downstream profiles / products -> institutional deployments

This sequence matters.

- P-E-S is the archive and origin layer.
- G_5.2 is the canon-first runtime and profile-governance layer.
- Downstream profiles are operational specializations built on a governed runtime foundation.
- Institutional or protocol systems may sit downstream, but they are separate products with their own constraints.

The lineage is connected, but it should not collapse into one blended system.

## Role of this repository

G_5.2 is the upstream persona-runtime repository.

It owns the maintained canon, the orchestration runtime, the eval discipline, and the operator tooling used to inspect and compare governed inquiry behavior.

G_5.2 is not the archive itself, and it is not a downstream protocol or institutional operations platform.

## This repository owns

G_5.2 owns:

- canon files and versioned continuity
- orchestration pipeline behavior
- provider abstraction and runtime portability
- eval cases, reports, and report diffing
- operator inquiry tooling for live governed sessions
- selective durable-memory behavior and inspection
- editorial governance for future canon evolution

## This repository does not own

G_5.2 does not own:

- the P-E-S archive as a live behavioral source
- downstream product UX or institutional process layers
- witness/protocol operations, consent systems, or PII handling
- automatic authority to rewrite the meaning of recovered lineage artifacts
- uncontrolled writeback from sessions into canon

## Allowed imports

This repository may import:

- public lineage descriptions from P-E-S for documentation and recovered-artifact governance
- provider APIs approved for runtime use
- local operator state needed for inquiry sessions, evals, and durable memory
- downstream feedback that informs proposals, but does not auto-promote itself into canon

G_5.2 may reference lineage. It may not operationalize lineage as governing truth without passing through canon and continuity governance.

## Allowed exports

This repository may export:

- runtime packages or interfaces for downstream systems
- public status and governance materials
- eval reports, diff artifacts, and operator findings
- proposals, changelog entries, and canon revisions after explicit approval

Exports from G_5.2 do not automatically become canon unless they pass through explicit promotion.

## Prohibited flows

The following are prohibited:

- direct use of P-E-S archive text as active canon without governance
- treating recovered artifacts as behavioral law because they are compelling
- writing inquiry sessions directly back into canon
- collapsing durable memory into canon or continuity
- assuming downstream operational profiles are interchangeable with G_5.2 itself
- treating operator tooling as a public product boundary before the workflow is ready

## Authority model

G_5.2 is authoritative for upstream runtime behavior, canon governance, and inquiry/eval discipline.

Downstream profiles or products built on G_5.2 may impose stricter operational requirements, but they do not rewrite upstream canon automatically.

Upstream lineage may shape design. It does not override canon governance, epistemics, or active constraints.

## Change management

Changes in this repository should be governed by canon integrity, auditability, and stage clarity.

In practice, that means:

- runtime upgrades should be pinned and reviewed
- canon changes should be versioned and logged
- memory behavior should stay selective and inspectable
- downstream product assumptions should not be smuggled back into upstream runtime rules
- archive boundaries should remain explicit
- public statements about system maturity should match the actual implementation state

## Placement rule

Material belongs in G_5.2 when its primary value is one or more of the following:

- canon governance
- inquiry runtime architecture
- response orchestration
- eval design and regression discipline
- operator tooling for governed inquiry
- durable-memory discipline
- editorial promotion workflow

If a change is about how the governed runtime thinks, retrieves, critiques, persists, or is inspected, it belongs here.

If a change is primarily about downstream protocol operations or public institutional handling, it does not.
