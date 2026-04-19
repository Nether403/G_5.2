# Witness Remote Package Delivery Design

## Summary

Add the first remote delivery slice for Witness packaged exports. Remote delivery should consume the existing packaged export unchanged, treat the package as the artifact of record, and record each delivery attempt separately from package metadata.

This slice sits strictly on top of the current packaged-export boundary:

- delivery starts from an existing `PublicationPackageRecord`
- delivery uploads the existing `.zip` package unchanged
- delivery does not rebuild or reinterpret bundle contents
- delivery does not modify package, bundle, testimony, synthesis, annotation, or archive-candidate records
- delivery records live in Witness-local roots

The first delivery mode should be operator-triggered, synchronous, and backed by generic object-storage semantics with Azure Blob as the first concrete backend.

## Goals

- add the first remote transport layer without changing the packaged export as artifact of record
- keep remote delivery generic at the adapter contract level
- ship one concrete backend now: Azure Blob
- record delivery attempts and outcomes in a minimal, auditable form
- preserve the option to add queued/background delivery later on top of the same abstraction

## Non-Goals

- no background jobs or delivery queue in this slice
- no retry worker or retry scheduler
- no package mutation, repacking, or content regeneration
- no package verification/download-from-remote flow yet
- no transport-specific schema authority
- no cross-product delivery surface for P-E-S

## Design Constraints

1. Package remains the artifact of record

Remote delivery must resolve an already-created publication package and transmit that exact `.zip` file unchanged.

2. Transport is an adapter

Delivery should depend on a generic object-storage interface, not on Azure-specific semantics at the core runtime boundary. Azure Blob is just the first implementation.

3. Delivery attempts are first-class records

Every operator-triggered delivery attempt should produce a `PublicationDeliveryRecord`, even when the attempt fails.

4. Synchronous operator-triggered delivery only

The first slice should run the upload in the request path initiated by the operator from the dashboard. No queue or background worker should be introduced yet.

5. Witness-local containment

Delivery records remain under Witness-local roots. Remote upload is allowed, but the system of record for delivery attempts remains local and product-scoped.

6. No bypass around package delivery

Remote delivery must not reconstruct the package from bundle JSON, Markdown, or manifest. It must consume the existing package file through the same root-validated local package path resolution discipline already in place.

## Proposed Architecture

### Source object

The source object for remote delivery is the existing publication package:

- `PublicationPackageRecord`
- package `.zip` file under `data/witness/publication-bundles/packages/`

The delivery path should load the package record, resolve the package path inside the canonical packages root, and upload that exact file.

### Delivery record

Add a `PublicationDeliveryRecord` stored separately from package records and package artifacts.

Recommended fields:

- `id`
- `packageId`
- `bundleId`
- `witnessId`
- `testimonyId`
- `backend`
- `status`
- `createdAt`
- `updatedAt`
- `remoteKey`
- `remoteUrl?`
- `error?`

Recommended status values:

- `succeeded`
- `failed`

I would keep the first slice intentionally narrow and avoid an intermediate `pending` or `uploading` state unless the request path truly needs it.

### Storage layout

Extend the current Witness publication-bundles layout:

- `data/witness/publication-bundles/records/`
- `data/witness/publication-bundles/exports/`
- `data/witness/publication-bundles/packages/`
- `data/witness/publication-bundles/package-records/`
- `data/witness/publication-bundles/delivery-records/`

This keeps remote-delivery metadata separate from both the package metadata and the raw bundle metadata.

### Adapter contract

Define a generic object-delivery interface around object semantics, not Azure-specific APIs.

Recommended shape:

- `putObject({ key, filePath, contentType, metadata? }): Promise<{ remoteKey, remoteUrl? }>`

Or equivalently:

- input: resolved package path plus a target key
- output: normalized remote locator data

The adapter should not know anything about Witness governance objects beyond the package file it is asked to upload.

### First backend

Provide one concrete backend implementation:

- Azure Blob object delivery adapter

Keep all Azure-specific configuration and SDK wiring behind that adapter so future S3/GCS-compatible backends can be added without changing the delivery runtime contract.

### Remote key

Use a deterministic remote key derived from package identity.

Recommended shape:

- `witness/<witnessId>/testimony/<testimonyId>/packages/<packageFilename>`

This makes remote location traceable without introducing backend-specific semantics into the record model.

## Operator Flow

### Delivery

From the existing Witness publication/package section, the operator should be able to:

- select an existing package
- trigger `Deliver Package`

The request should:

1. load the package record
2. resolve and validate the local package path
3. upload the package synchronously through the selected backend
4. persist a delivery record with the outcome
5. return the resulting delivery record

### Status visibility

The dashboard should show per-package delivery status/history in a minimal form:

- backend
- status
- createdAt
- remote key
- remote URL when available
- error when failed

No advanced delivery management UI is needed in this slice.

## API Surface

Keep this within the existing dashboard server.

Recommended endpoints:

- `POST /api/witness/publication-deliveries`
  - body: `{ packageId, backend? }`
- `GET /api/witness/publication-deliveries?packageId=...&bundleId=...&witnessId=...&testimonyId=...`
- `GET /api/witness/publication-deliveries/:id`

Behavior:

- unknown package or delivery ids return `404`
- malformed ids or missing required body fields return `400`
- broken local package state returns `500`
- backend upload failure returns `502` or `500`, but still persists a failed delivery record if the failure happens after the attempt begins

I would prefer:

- `500` for local/store/runtime/config errors
- `502` for remote backend upload failure

That keeps local failures distinct from remote target failures.

## Error Handling

Delivery should fail if:

- the referenced package record does not exist
- the package path is missing or invalid
- the resolved package path escapes the canonical packages root
- the package file is missing
- the backend is unknown or misconfigured
- the remote upload fails

Failure handling rule:

- if the delivery attempt meaningfully starts, persist a failed `PublicationDeliveryRecord`
- do not mutate the package record or package file

This preserves auditability without turning delivery into a package-regeneration path.

## Testing Strategy

### Runtime/store tests

- delivery requires an existing package record
- delivery resolves and validates the local package path through the canonical packages root
- successful delivery writes a `succeeded` delivery record
- failed remote upload writes a `failed` delivery record
- delivery leaves package files and package records unchanged
- Azure adapter stays behind the generic object-delivery contract

### Server tests

- create/list/detail routes behave as documented
- malformed ids return `400`
- unknown ids return `404`
- broken local package state returns `500`
- backend upload failure returns the chosen remote-failure status and persists a failed delivery record

### UI tests

- Witness package UI exposes `Deliver Package`
- delivery status renders for the selected package
- operator action remains explicit and synchronous

### Smoke

Extend the Witness smoke path:

1. create publication bundle
2. create packaged export
3. deliver the package through a fake object backend
4. verify the package file is unchanged
5. verify a delivery record is written with backend, status, and remote key
6. verify only Witness-local roots changed on disk apart from the simulated remote target

## Recommended Follow-On

If this slice works well, the next layer should be queued/background delivery on top of the same `PublicationDeliveryRecord` abstraction.

That follow-on should:

- reuse the same package identity and adapter contract
- reuse the same delivery record model
- add retry orchestration without changing the core handoff artifact

It should not:

- replace the synchronous delivery path
- rebuild packages
- move schema authority out of the package layer

## Recommendation

Build the first remote delivery slice now as a synchronous, operator-triggered upload over a generic object-storage adapter with Azure Blob as the first backend.

This is the cleanest next step because:

- the package is already the artifact of record
- the current local handoff seam is strong
- generic object semantics keep future storage options open
- delivery records add auditability and future retry room without forcing a queue into the first slice
