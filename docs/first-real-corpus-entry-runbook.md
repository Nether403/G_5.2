# Runbook — Producing the First Real Consented Corpus Entry

This is the operator procedure for spec task 11 (`outreach-ready-corpus-entry`): take one
real, consented witness through the full path and produce one entry that is
`entry_kind: "real"`, `outreach_ready: true`, schema-valid, and leak-free. That entry — not
the synthetic exemplar — is the project's first credibility artifact.

The wiring is already proven: `pnpm smoke:corpus` runs compile → export end to end against a
synthetic entry and asserts the public bundle leaks nothing. This runbook is about doing it
for real, with a person, across both planes.

## Definition of done (the bar)

1. One applicant passes Gate review and is invited.
2. One invited witness completes one real governed dialogue.
3. That session seals into G_5.2 Witness state only, with the right consent.
4. The sealed testimony is compiled and exported into one reusable, leak-free bundle.
5. The HCC checklist passes and the entry is marked outreach-ready.
6. The bundle can go into a private packet without hand-assembled glue.
7. Every serious failure mode encountered is logged.

## Prerequisites

- G_5.2 governed runtime running locally / on a trusted host (`pnpm dashboard`), with a live
  provider configured (`EVAL_PROVIDER` + the matching key; Azure is the v1 default).
- TWP-platform deployed (or local) with Supabase reachable, and the disclosure-ledger
  migration applied (`src/lib/db/migrations/20260624120000_m2_disclosure_ledger.sql` — it is
  written and drift-checked but **not yet applied to a live DB**; apply it first).
- The Witness bridge configured on both ends (`G52_WITNESS_BRIDGE_*` on TWP,
  `TWP_WITNESS_BRIDGE_SHARED_SECRET` on G_5.2).
- One real, willing witness who has given explicit, recorded consent.

## The path, step by step

Each step names the real code that does the work.

1. **Intake + consent (TWP).** Applicant submits an essay through the Gate; record granular
   consent in `consent_records` (internal_research / partner_sharing / public_publication)
   and the runtime conversational + retention consent that the bridge requires.

2. **Gate review (TWP).** Run the existing Tier 1 sieve / Tier 2 qualifier, then HCC Tier 3
   accept. On accept, issue the invite and create the `witness_runtime_links` row.

3. **Governed dialogue (G_5.2, via bridge).** The invited witness runs consent-gated inquiry
   turns. Turns and testimony persist **only** into `data/witness/` roots. Confirm nothing
   lands in P-E-S roots.

4. **Seal testimony (G_5.2).** Bring the testimony to `state: "sealed"`. Capture its id and
   content hash — these become `references.g52_governed.testimony_id` and
   `meta.hashes.source_testimony_hash`.

5. **Author the structured sections (human work — there is no auto-mapper).** From the sealed
   dialogue, a curator authors the entry's sections: `human_readable`, `reasoning_structure`
   (claims / steps / counterfactuals / tensions / CAP-REL-FELT / failure_modes), `plurality`
   (axiom clusters, opposing pairs, minority report), the **one public** `eval_case`
   (witness-attributed ideal behavior — never a universal verdict), the `public_slice`, and
   the `datasheet_summary`. Use the existing synthesis + annotation workflow as the working
   surface. This is the genuine intellectual labor; the pipeline validates it, it does not
   invent it.

6. **Compile (G_5.2).** Call `compileCorpusEntry` (`packages/witness-types/src/compiler.ts`)
   with `entryKind: "real"`, the sealed-testimony ref, the TWP reference ids, and the authored
   sections. It runs partition containment, computes `redacted_public_slice_hash`, enforces the
   witness-attributed eval standard, checks referential integrity, and fail-closed parses. A
   throw here means an authoring problem to fix — read the message, fix the section, recompile.

7. **Export (G_5.2).** Call `exportCorpusEntryBundle`
   (`packages/orchestration/src/witness/corpusEntryExport.ts`). It emits `bundle.json` /
   `bundle.md` / `manifest.json`, computes `publication_bundle_hash`, and back-fills it onto the
   entry. The public bundle excludes the source hash, the internal `witness_profile_ref`, and
   all private content by construction.

8. **HCC outreach checklist (TWP).** Walk the R1–R10 checklist and call
   `evaluateOutreachReadiness` (`src/lib/witness-bridge/outreach-readiness.ts`). It returns
   ready only when every item is confirmed AND `entry_kind === "real"` AND
   `redacted_public_slice_hash` is present. Then `recordReadinessDecision` writes the Tier 3
   record. Only now flip the entry's `meta.outreach_ready` to true (re-export, or persist).

9. **Disclosure on share (TWP).** For every recipient/channel, append a row with
   `recordDisclosure` (`src/lib/witness-bridge/disclosure-ledger.ts`) capturing the bundle id,
   hashes, recipient, consent version, and terms. The ledger is the authoritative registry of
   what was shared.

10. **Revocation, if the witness withdraws (TWP).** Call `revokeEntry`
    (`src/lib/witness-bridge/revocation.ts`). It flips every ledger exposure to `revoked`
    (never deletes) and signals the runtime; `assertEntryNotRevoked` then blocks any re-export.

## Verify (see the actual output, do not infer)

- `pnpm smoke:corpus` is green (wiring intact).
- The compiled entry: `entry_kind === "real"`, `is_synthetic === false`, `outreach_ready === true`
  only after step 8.
- Open the emitted `bundle.json` and confirm by eye: the public slice is present; the witness's
  real name, the source testimony body, `witness_profile_ref`, and `source_testimony_hash` are
  NOT present.
- Recompute the bundle hash and confirm it matches `manifest.publicationBundleHash`.
- Confirm the testimony/turns exist only under `data/witness/`.

## Friction log

Capture every serious failure (gate threshold wrong, inquisitor not reaching the "why",
authoring ambiguity, bridge/consent error, leak caught in review) in the failure log. The first
real run is a stress test of the whole path; logged friction is a credibility asset, not an
embarrassment.

## Seams not yet wired (known, by design)

- **No live G_5.2 runtime-revocation endpoint.** `revokeEntry` takes an injected signal port;
  in production wire it to a bridge POST that marks the governed entry/bundle revoked so G_5.2
  also fails closed. (`ponytail:` noted in `revocation.ts`.)
- **No automated testimony → corpus-entry mapper.** Step 5 is intentionally human authoring.
- **HCC checklist is reviewer-confirmed**, not machine-proven against the entry (cross-repo).
  The G_5.2 compiler is the machine backstop. See the steering doc's "Known alpha tradeoffs".
