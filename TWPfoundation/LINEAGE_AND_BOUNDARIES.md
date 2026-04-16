# Lineage and Boundaries

## Purpose

This document defines the role of the TWP repository within the broader project lineage. It exists to protect the distinction between runtime infrastructure, archival lineage, and protocol operations.

The core rule is that TWP is an operational boundary, not a catch-all for upstream concepts.

## Shared lineage

The current project family should be understood as:

P-E-S -> G_5.2 -> Inquisitor profile -> TWP

This sequence matters.

- P-E-S is the archive and origin layer.
- G_5.2 is the runtime and profile-governance layer.
- The Inquisitor is a TWP-specific operational profile built on a runtime foundation.
- TWP is the protocol, platform, safety, and institutional layer.

TWP is connected to the lineage, but it should not collapse the lineage into one blended system.

## Role of this repository

TWP is the witness protocol repository.

It owns the platform through which testimony is elicited, qualified, safeguarded, annotated, stored, reviewed, and surfaced. It also owns the operational version of the Inquisitor, including the rules that make that profile appropriate for witness work.

TWP is not the origin archive, and it is not the upstream persona-runtime lab.

## This repository owns

TWP owns:

- witness intake and gate logic
- session flow and protocol state management
- the operational Inquisitor profile used inside the witness process
- privacy, consent, de-identification, and PII boundaries
- annotation workflows and archive handling
- admin, review, and platform operations
- public status, governance, and institutional communication
- database-backed persistence for protocol activity

## This repository does not own

TWP does not own:

- the P-E-S archive as a live behavioral source
- G_5.2 canon as an editable local concern
- upstream runtime contracts or profile specification standards
- automatic authority to rewrite the meaning of lineage artifacts
- uncontrolled writeback into upstream persona systems

## Allowed imports

This repository may import:

- pinned runtime packages from G_5.2
- profile specifications and validation contracts from G_5.2
- provider adapters approved for runtime use
- public lineage descriptions from P-E-S for documentation only

TWP may reference lineage. It may not operationalize lineage without passing through the runtime and profile boundary.

## Allowed exports

This repository may export:

- protocol documentation
- public status and governance materials
- de-identified witness-derived outputs as permitted by policy
- operational feedback relevant to downstream integration work

Exports from TWP do not automatically become canon in upstream systems.

## Prohibited flows

The following are prohibited:

- direct use of P-E-S archive text as active runtime prompt material in witness sessions
- unpinned dependency on G_5.2 runtime or profile contracts
- writing witness sessions directly back into G_5.2 canon
- allowing protocol data to bypass TWP privacy and safety controls
- assuming that G_5.2 and the Inquisitor are interchangeable
- exporting raw PII beyond the TWP operational boundary

## Authority model

TWP is authoritative for protocol behavior, operational safety, and witness data handling.

The Inquisitor profile inside TWP must obey TWP’s protocol requirements, even when built on top of upstream runtime capabilities.

Upstream lineage may shape design. It does not override witness safety, privacy, or institutional obligations.

## Change management

Changes in this repository should be governed by protocol safety, auditability, and stage clarity.

In practice, that means:

- runtime upgrades should be pinned and reviewed
- profile changes should be distinguishable from platform changes
- protocol changes should be tested as protocol changes, not hidden inside persona edits
- privacy and archive boundaries should be explicit
- public statements about system maturity should match the actual implementation state

## Placement rule

Material belongs in TWP when its primary value is one or more of the following:

- witness process design
- protocol-specific interviewing behavior
- safety and distress handling
- privacy and de-identification
- annotation and archive workflow
- admin and operational tooling
- public institutional communication

If a change is about how testimony is handled in practice, it belongs here.

If a change is about general persona-runtime architecture, it does not.
