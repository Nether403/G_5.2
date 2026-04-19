# Witness Packaged Export Design

## Summary

Add a local packaged export layer for Witness publication bundles. The package should be the artifact of record for operator handoff and the exact object that future remote delivery adapters will send unchanged.

This slice sits strictly on top of the existing Witness publication-bundle boundary:

- package creation starts from an existing publication bundle id
- packaging is read-only over the already-emitted JSON, Markdown, and manifest artifacts
- packaging does not regenerate bundle content
- packaging does not recompute bundle semantics
- packaging stays inside Witness-local roots

The package format should be a single `.zip` archive that contains the bundle JSON, bundle Markdown, manifest, and a short operator-facing handoff note.

## Goals

- define one portable handoff unit for Witness publication bundles
- keep package creation fully downstream of the existing publication-ready and publication-bundle gates
- preserve the current schema authority at the bundle layer rather than letting a future remote target define it
- make future remote delivery consume the existing package unchanged

## Non-Goals

- no remote upload target in this slice
- no new governance states
- no change to publication bundle generation rules
- no repacking or rewriting bundle contents during delivery
- no canonicalization beyond what the bundle and manifest already define

## Design Constraints

1. Package as artifact of record

The `.zip` package is the operator-facing handoff artifact. Future transports should move this package as-is rather than rebuilding it from testimony, synthesis, annotation, or archive-candidate records.

2. Transport as adapter

Remote delivery is a separate concern. It should later accept a bundle id or package id, resolve the already-created package, and transmit that exact file unchanged while recording delivery metadata separately.

3. Read-only packaging

Package creation must not:

- re-run publication bundle generation
- re-render Markdown
- re-emit JSON
- rewrite the manifest
- modify testimony, synthesis, annotations, archive candidates, or publication bundle records

4. One package per bundle

Package creation is idempotent by bundle. A publication bundle should have one packaged export by default. If the operator requests packaging again for the same bundle, the system should return the existing `PublicationPackageRecord` rather than minting a second equally valid package.

5. Witness-local containment

Packaged exports and their metadata remain in Witness-local roots under `data/witness/publication-bundles/`. Nothing in this slice touches P-E-S roots or any external destination.

6. Root-validated delivery

Package file delivery must use the same realpath-based root validation discipline as the current raw bundle artifact endpoints. This is a hard invariant of the slice, not an implementation detail.

## Proposed Architecture

### Source of truth

The existing publication bundle remains the source-of-truth export set:

- bundle JSON
- bundle Markdown
- manifest

The packaged export wraps those emitted files into a single `.zip` without changing them.

### Package record

Add a `PublicationPackageRecord` stored separately from raw bundle records and raw exported bundle files.

Recommended fields:

- `id`
- `bundleId`
- `witnessId`
- `testimonyId`
- `archiveCandidateId`
- `createdAt`
- `packagePath`
- `packageFilename`
- `packageSha256`
- `packageByteSize`
- `sourceBundleJsonPath`
- `sourceBundleMarkdownPath`
- `sourceBundleManifestPath`

This record is for package lookup and audit. It should not duplicate the bundle contents themselves.

### Storage layout

Keep the current split intact and add a dedicated package root:

- `data/witness/publication-bundles/records/`
- `data/witness/publication-bundles/exports/`
- `data/witness/publication-bundles/packages/`
- `data/witness/publication-bundles/package-records/`

Recommended split:

- bundle metadata records stay in `records/`
- raw bundle artifacts stay in `exports/`
- packaged zip files live in `packages/`
- package metadata records live in `package-records/`

That keeps responsibilities explicit and avoids making raw bundle records absorb transport-specific concerns.

### Package filename

Use a deterministic filename derived from bundle id plus createdAt, sanitized for filesystem safety.

Recommended shape:

`<bundleId>--<createdAt-safe>.zip`

Where `createdAt-safe` is an ISO timestamp normalized for filenames, for example:

`2026-04-19T14-22-31-000Z`

This gives operators a stable and readable artifact name while preserving uniqueness and ordering.

### Package identity and determinism

Package identity is the identity of the created `.zip` artifact itself, not just the underlying bundle id. Because this slice treats the package as the artifact of record, the packaging process should be deterministic when repeated against the same bundle.

That means packaging should normalize at least:

- entry order
- entry timestamps
- archive layout/paths

so that the same bundle produces the same zip bytes if packaging is re-run in a clean environment.

In practice, because package creation is idempotent by bundle in this slice, operators should normally receive the existing package record rather than triggering a second archive build. But the underlying packaging algorithm should still be deterministic so the package hash is meaningful as the handoff identity.

### Package contents

The zip should contain:

- `bundle.json`
- `bundle.md`
- `manifest.json`
- `README.txt`

The internal filenames should be stable and simple, not derived from external filesystem paths.

`README.txt` should be short and operator-oriented. It should explain:

- this package is a read-only Witness publication handoff package
- it contains the publication bundle JSON, Markdown, and manifest
- the manifest includes source ids and hashes
- future remote delivery should send this zip unchanged

I would keep detached checksum files out of the first slice unless there is a concrete operator workflow that needs checksum verification outside the app. The manifest already provides the integrity metadata.

## Operator Flow

### Creation

From the existing Witness publication section, the operator should be able to:

- select an existing publication bundle
- create a packaged export for that bundle

Package creation is explicit and operator-triggered. It is not automatic when a publication bundle is created.

Package creation is also idempotent:

- if no package exists for the bundle, create one
- if a package already exists for that bundle, return the existing package record

### Inspection

The dashboard should show package metadata for the selected testimony or selected bundle, including:

- package id
- source bundle id
- createdAt
- package filename

### Handoff

The dashboard should provide:

- `Create Package`
- `Download Package`
- optionally `View Package Metadata`

The current raw JSON, Markdown, and manifest preview/download paths remain useful and should stay. The package is an additional handoff layer, not a replacement for raw artifact inspection.

## API Surface

Keep this within the existing dashboard server.

Recommended endpoints:

- `POST /api/witness/publication-packages`
  - body: `{ bundleId }`
- `GET /api/witness/publication-packages?bundleId=...&witnessId=...&testimonyId=...`
- `GET /api/witness/publication-packages/:id`
- `GET /api/witness/publication-packages/:id/file`
  - supports `?download=1`

Behavior:

- unknown bundle/package ids return `404`
- malformed ids or missing required body fields return `400`
- broken source bundle state returns `500`
- `POST /api/witness/publication-packages` returns the existing package record if one already exists for the requested bundle id
- package file delivery must validate the resolved file path against the canonical packages root using realpath on both the root and target file before reading bytes

## Error Handling

Package creation should fail if:

- the referenced publication bundle record does not exist
- any required bundle artifact path is missing
- any required bundle artifact file is missing
- any required artifact path resolves outside the canonical exports root
- the package path resolves outside the canonical packages root at read time
- package write fails

On package write failure, cleanup should remove any partially written zip artifact and avoid leaving a half-created package record.

This slice should preserve the same compensation discipline already used in the Witness runtime: no partial operator-visible success.

## Testing Strategy

### Runtime/store tests

- package creation requires an existing publication bundle record
- package creation is idempotent for the same bundle id
- package creation is read-only over source bundle artifacts
- package creation rolls back partial files on write failure
- package record round-trips correctly
- package record captures `packageSha256` and `packageByteSize`
- package filename is deterministic from bundle id plus createdAt
- package bytes are deterministic for the same bundle contents

### Server tests

- create/list/detail/file routes behave as documented
- package list supports `bundleId` as a first-class filter
- package file delivery validates the canonical packages root via realpath
- unknown ids return `404`
- broken bundle/package state returns `500`

### UI tests

- Witness publication panel exposes `Create Package` and `Download Package`
- package actions are scoped to the selected testimony / relevant bundle
- UI still uses explicit operator actions rather than implicit background packaging

### Smoke

Extend the Witness smoke path:

1. create publication bundle
2. create packaged export from that bundle
3. verify the zip exists under the package root
4. verify package record points at the correct bundle and records `packageSha256` / `packageByteSize`
5. verify repeated package creation for the same bundle returns the existing package
6. verify only Witness-local roots changed

## Remote Delivery Follow-On

The next slice after this one should make a remote adapter consume the package unchanged.

That adapter should do only this:

- accept bundle id or package id
- resolve the existing package
- upload/copy/send the zip
- record delivery attempt/result metadata separately

It should not:

- rebuild the bundle
- rewrite the package
- reinterpret the schema

That keeps the package as the transport-neutral handoff object and prevents one remote target from becoming the de facto schema authority.

## Recommendation

Build the local zip package now as the handoff artifact of record.

This is the cleanest next step because:

- the Witness bundle layer is already strong and integrity-checked
- the dashboard already treats emitted artifacts as the delivery surface
- packaging can stay fully read-only and Witness-local
- future remote delivery can remain a thin adapter over a stable package, not a second export pipeline
