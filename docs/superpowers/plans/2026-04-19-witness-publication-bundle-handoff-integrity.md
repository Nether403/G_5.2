# Witness Publication Bundle Handoff And Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit operator download/handoff actions and a lightweight integrity manifest for Witness publication bundles without changing the existing governance or delivery boundaries.

**Architecture:** Keep the current publication bundle record as the lookup anchor and extend the existing validated artifact-delivery flow instead of inventing a parallel export path. New bundle creation should emit a third artifact, `manifest.json`, with stable integrity metadata and SHA-256 hashes for the emitted JSON and Markdown files; the dashboard should expose inline viewing plus explicit download actions through the same artifact endpoints.

**Tech Stack:** Node.js built-ins (`crypto`, `fs/promises`, `path`, `http`), TypeScript, existing file-backed Witness stores/runtime, static `inquiry.html` dashboard UI, Node test runner, existing smoke harness.

---

## File Structure

- Modify: `packages/witness-types/src/publicationBundle.ts`
  Purpose: extend `PublicationBundleRecord` to carry the manifest artifact path.
- Modify: `packages/witness-types/src/index.ts`
  Purpose: re-export any new publication artifact types if introduced in the shared types package.
- Create: `packages/witness-types/src/publicationArtifact.ts`
  Purpose: define explicit `PublicationBundleManifest` and export DTO types so runtime output is stable and not hidden inside server/runtime internals.
- Modify: `packages/orchestration/src/witness/filePublicationBundleStore.ts`
  Purpose: persist the manifest path in bundle metadata records.
- Modify: `packages/orchestration/src/witness/publicationRuntime.ts`
  Purpose: emit `manifest.json`, compute SHA-256 hashes, and write the integrity payload alongside the existing JSON and Markdown artifacts.
- Modify: `packages/orchestration/src/witness/publicationRuntime.test.ts`
  Purpose: cover manifest creation, DTO shape, and hash integrity.
- Modify: `apps/dashboard/src/server.ts`
  Purpose: serve manifest artifacts, support explicit download mode on artifact endpoints, and keep `realpath`-validated access rooted in `publication-bundles/exports/`.
- Modify: `apps/dashboard/src/server.test.ts`
  Purpose: verify manifest endpoint behavior, attachment/download semantics, path safety, and broken-state handling.
- Modify: `apps/dashboard/public/inquiry.html`
  Purpose: add `View Manifest`, `Download JSON`, `Download Markdown`, and `Download Manifest` actions on top of the current preview UI.
- Modify: `scripts/smoke-tests.ts`
  Purpose: extend the Witness smoke path through manifest creation and integrity verification.
- Modify: `README.md`
  Purpose: document the new manifest artifact and operator download behavior.
- Modify: `docs/operator-handbook.md`
  Purpose: document the new manifest endpoint and explicit handoff workflow.

## Task 1: Add Explicit Publication Artifact Types

**Files:**
- Create: `packages/witness-types/src/publicationArtifact.ts`
- Modify: `packages/witness-types/src/publicationBundle.ts`
- Modify: `packages/witness-types/src/index.ts`
- Test: `packages/orchestration/src/witness/publicationRuntime.test.ts`

- [ ] **Step 1: Write the failing runtime test expectation for a manifest path**

Add to `packages/orchestration/src/witness/publicationRuntime.test.ts`:

```ts
assert.match(bundle.bundleManifestPath, /manifest\.json$/);
```

Also assert the loaded record carries the same property:

```ts
assert.equal(storedBundle?.bundleManifestPath, bundle.bundleManifestPath);
```

- [ ] **Step 2: Run the focused runtime test to verify it fails**

Run:

```bash
pnpm --filter @g52/orchestration test -- --test-name-pattern "PublicationBundle createWitnessPublicationBundle requires publication_ready candidate and writes immutable export files"
```

Expected: FAIL because `bundleManifestPath` does not exist on the record yet.

- [ ] **Step 3: Add shared artifact types**

Create `packages/witness-types/src/publicationArtifact.ts`:

```ts
export interface PublicationBundleExportEntry {
  filename: string;
  sha256: string;
  contentType:
    | "application/json; charset=utf-8"
    | "text/markdown; charset=utf-8";
}

export interface PublicationBundleManifest {
  schemaVersion: "0.1.0";
  bundleId: string;
  witnessId: string;
  archiveCandidateId: string;
  testimonyId: string;
  testimonyUpdatedAt: string;
  synthesisId: string;
  annotationId: string;
  createdAt: string;
  exports: {
    json: PublicationBundleExportEntry;
    markdown: PublicationBundleExportEntry;
  };
}
```

Update `packages/witness-types/src/publicationBundle.ts`:

```ts
export interface PublicationBundleRecord {
  // existing fields...
  bundleJsonPath: string;
  bundleMarkdownPath?: string;
  bundleManifestPath: string;
}
```

Update `packages/witness-types/src/index.ts`:

```ts
export type {
  PublicationBundleManifest,
  PublicationBundleExportEntry,
} from "./publicationArtifact";
```

- [ ] **Step 4: Run witness-types and orchestration typecheck**

Run:

```bash
pnpm --filter @g52/witness-types typecheck
pnpm --filter @g52/orchestration typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/witness-types/src/publicationArtifact.ts packages/witness-types/src/publicationBundle.ts packages/witness-types/src/index.ts packages/orchestration/src/witness/publicationRuntime.test.ts
git commit -m "feat: add witness publication artifact types"
```

## Task 2: Emit Manifest And Integrity Hashes In Publication Runtime

**Files:**
- Modify: `packages/orchestration/src/witness/publicationRuntime.ts`
- Modify: `packages/orchestration/src/witness/publicationRuntime.test.ts`

- [ ] **Step 1: Write the failing runtime assertions for manifest contents**

Add to `packages/orchestration/src/witness/publicationRuntime.test.ts`:

```ts
const manifestRaw = await readFile(bundle.bundleManifestPath, "utf8");
const manifest = JSON.parse(manifestRaw);

assert.equal(manifest.schemaVersion, "0.1.0");
assert.equal(manifest.bundleId, bundle.id);
assert.equal(manifest.testimonyUpdatedAt, candidate.testimonyUpdatedAt);
assert.equal(manifest.exports.json.filename, path.basename(bundle.bundleJsonPath));
assert.equal(
  manifest.exports.markdown.filename,
  path.basename(bundle.bundleMarkdownPath as string)
);
assert.match(manifest.exports.json.sha256, /^[a-f0-9]{64}$/);
assert.match(manifest.exports.markdown.sha256, /^[a-f0-9]{64}$/);
```

- [ ] **Step 2: Run the focused runtime test to verify it fails**

Run:

```bash
pnpm --filter @g52/orchestration test -- --test-name-pattern "PublicationBundle createWitnessPublicationBundle"
```

Expected: FAIL because no manifest is written yet.

- [ ] **Step 3: Implement manifest creation and hashing**

In `packages/orchestration/src/witness/publicationRuntime.ts`, import hashing support:

```ts
import { createHash, randomUUID } from "node:crypto";
```

Add a helper:

```ts
function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
```

After building the JSON payload and Markdown text, emit the manifest:

```ts
const jsonBody = `${JSON.stringify(payload, null, 2)}\n`;
const markdownBody = `${buildPublicationBundleMarkdown(payload)}\n`;
const bundleManifestPath = path.join(
  exportRoot,
  `${archiveCandidate.id}-${exportId}-manifest.json`
);
const manifest: PublicationBundleManifest = {
  schemaVersion: "0.1.0",
  bundleId: exportId, // replace with final record id after create/save step
  witnessId: testimony.witnessId,
  archiveCandidateId: archiveCandidate.id,
  testimonyId: testimony.id,
  testimonyUpdatedAt: archiveCandidate.testimonyUpdatedAt,
  synthesisId: synthesis.id,
  annotationId: annotation.id,
  createdAt: createdAt,
  exports: {
    json: {
      filename: path.basename(bundleJsonPath),
      sha256: sha256(jsonBody),
      contentType: "application/json; charset=utf-8",
    },
    markdown: {
      filename: path.basename(bundleMarkdownPath),
      sha256: sha256(markdownBody),
      contentType: "text/markdown; charset=utf-8",
    },
  },
};
```

Use the final bundle record id in the manifest, not the temporary `exportId`. Keep rollback behavior symmetric:

```ts
await Promise.allSettled([
  rm(bundleJsonPath),
  rm(bundleMarkdownPath),
  rm(bundleManifestPath),
]);
```

- [ ] **Step 4: Persist the manifest path in the bundle record**

Update the `publicationBundleStore.create()` call in `publicationRuntime.ts`:

```ts
bundleManifestPath,
```

Update `CreatePublicationBundleInput` in `filePublicationBundleStore.ts` accordingly in the next task if needed.

- [ ] **Step 5: Run focused runtime tests**

Run:

```bash
pnpm --filter @g52/orchestration test -- --test-name-pattern "PublicationBundle createWitnessPublicationBundle"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/orchestration/src/witness/publicationRuntime.ts packages/orchestration/src/witness/publicationRuntime.test.ts packages/witness-types/src/publicationBundle.ts
git commit -m "feat: add witness publication bundle manifests"
```

## Task 3: Persist Manifest Paths In The Bundle Store

**Files:**
- Modify: `packages/orchestration/src/witness/filePublicationBundleStore.ts`
- Test: `packages/orchestration/src/witness/publicationRuntime.test.ts`

- [ ] **Step 1: Write the failing store expectation**

In the existing bundle-store round-trip coverage, assert:

```ts
assert.equal(saved.bundleManifestPath, created.bundleManifestPath);
```

- [ ] **Step 2: Run the focused runtime/store tests to verify it fails**

Run:

```bash
pnpm --filter @g52/orchestration test -- --test-name-pattern "PublicationBundle|FileWitnessPublicationBundleStore"
```

Expected: FAIL until the store input and persistence layer include the manifest path.

- [ ] **Step 3: Extend the store input and create path**

Update `packages/orchestration/src/witness/filePublicationBundleStore.ts`:

```ts
export interface CreatePublicationBundleInput {
  // existing fields...
  bundleJsonPath: string;
  bundleMarkdownPath?: string;
  bundleManifestPath: string;
}
```

And in `create()`:

```ts
bundleManifestPath: input.bundleManifestPath,
```

- [ ] **Step 4: Run orchestration tests**

Run:

```bash
pnpm --filter @g52/orchestration test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/orchestration/src/witness/filePublicationBundleStore.ts packages/orchestration/src/witness/publicationRuntime.test.ts
git commit -m "feat: persist witness publication manifest paths"
```

## Task 4: Add Manifest And Download Delivery Endpoints

**Files:**
- Modify: `apps/dashboard/src/server.ts`
- Modify: `apps/dashboard/src/server.test.ts`

- [ ] **Step 1: Write failing server tests for manifest and download mode**

Add to `apps/dashboard/src/server.test.ts`:

```ts
test("publication bundle manifest endpoint returns 200 with manifest json", async () => {
  const { response, text } = await requestText(
    `/api/witness/publication-bundles/${bundle.id}/manifest`
  );
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /application\/json/
  );
  assert.match(text, /"schemaVersion": "0\.1\.0"/);
});

test("publication bundle artifact endpoints support explicit download mode", async () => {
  const response = await request(
    `/api/witness/publication-bundles/${bundle.id}/json?download=1`
  );
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-disposition") ?? "",
    /^attachment; filename=/
  );
});
```

Also add a broken-state test for a missing manifest path:

```ts
assert.equal(response.status, 500);
```

- [ ] **Step 2: Run the focused dashboard tests to verify they fail**

Run:

```bash
pnpm --filter @g52/dashboard test -- --test-name-pattern "publication bundle"
```

Expected: FAIL because `/manifest` and download mode do not exist yet.

- [ ] **Step 3: Implement a shared artifact sender in the dashboard server**

In `apps/dashboard/src/server.ts`, add one helper that reuses the existing validated artifact path resolution:

```ts
async function sendWitnessPublicationArtifact(
  res: http.ServerResponse,
  bundleId: string,
  format: "json" | "markdown" | "manifest",
  download: boolean
) {
  const item = await publicationBundleStoreFor(WITNESS_CONFIG).load(bundleId);
  if (!item) {
    sendJson(res, 404, { error: "Publication bundle not found" });
    return;
  }

  const storedPath =
    format === "json"
      ? item.bundleJsonPath
      : format === "markdown"
        ? item.bundleMarkdownPath
        : item.bundleManifestPath;
  const artifactPath = await resolveWitnessPublicationArtifactPath(
    bundleId,
    storedPath,
    format === "manifest" ? "json" : format
  );
  const body = await fs.readFile(artifactPath, "utf8");
  const contentType =
    format === "markdown"
      ? "text/markdown; charset=utf-8"
      : "application/json; charset=utf-8";
  const headers: Record<string, string> = { "Content-Type": contentType };
  if (download) {
    headers["Content-Disposition"] =
      `attachment; filename=\"${path.basename(artifactPath)}\"`;
  }
  res.writeHead(200, headers);
  res.end(body);
}
```

Add routes:

```ts
GET /api/witness/publication-bundles/:id/manifest
GET /api/witness/publication-bundles/:id/json?download=1
GET /api/witness/publication-bundles/:id/markdown?download=1
GET /api/witness/publication-bundles/:id/manifest?download=1
```

- [ ] **Step 4: Run focused dashboard tests**

Run:

```bash
pnpm --filter @g52/dashboard test -- --test-name-pattern "publication bundle"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/server.ts apps/dashboard/src/server.test.ts
git commit -m "feat: add witness publication manifest and download endpoints"
```

## Task 5: Extend The Witness Publication Panel For Handoff

**Files:**
- Modify: `apps/dashboard/public/inquiry.html`
- Test: `apps/dashboard/src/server.test.ts`

- [ ] **Step 1: Write the failing UI assertions**

Extend the existing source-inspection test in `apps/dashboard/src/server.test.ts`:

```ts
assert.match(html, /data-witness-publication-view-manifest/);
assert.match(html, /data-witness-publication-download-json/);
assert.match(html, /data-witness-publication-download-markdown/);
assert.match(html, /data-witness-publication-download-manifest/);
assert.match(html, /\\/api\\/witness\\/publication-bundles\\/\\$\\{encodeURIComponent\\(id\\)\\}\\/manifest/);
assert.match(html, /\\?download=1/);
```

- [ ] **Step 2: Run the focused dashboard test to verify it fails**

Run:

```bash
pnpm --filter @g52/dashboard test -- --test-name-pattern "inquiry publication preview"
```

Expected: FAIL because the new actions are not wired yet.

- [ ] **Step 3: Add raw-view and download actions without changing the preview model**

In `apps/dashboard/public/inquiry.html`, extend the publication bundle card:

```html
<button class="btn quiet" data-witness-publication-view-json="${esc(item.id)}">View JSON</button>
<button class="btn quiet" data-witness-publication-view-markdown="${esc(item.id)}">View Markdown</button>
<button class="btn quiet" data-witness-publication-view-manifest="${esc(item.id)}">View Manifest</button>
<button class="btn quiet" data-witness-publication-download-json="${esc(item.id)}">Download JSON</button>
<button class="btn quiet" data-witness-publication-download-markdown="${esc(item.id)}">Download Markdown</button>
<button class="btn quiet" data-witness-publication-download-manifest="${esc(item.id)}">Download Manifest</button>
```

Add helpers:

```js
function publicationArtifactUrl(id, format, download){
  const base = `/api/witness/publication-bundles/${encodeURIComponent(id)}/${format}`;
  return download ? `${base}?download=1` : base;
}

function triggerPublicationDownload(id, format){
  window.open(publicationArtifactUrl(id, format, true), "_blank", "noopener");
}
```

Keep preview rendering raw:

```js
publicationPreviewBody.textContent = state.publicationPreview.text;
```

- [ ] **Step 4: Run focused dashboard tests**

Run:

```bash
pnpm --filter @g52/dashboard test -- --test-name-pattern "inquiry publication preview"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/public/inquiry.html apps/dashboard/src/server.test.ts
git commit -m "feat: add witness publication handoff actions"
```

## Task 6: Extend Smoke And Documentation

**Files:**
- Modify: `scripts/smoke-tests.ts`
- Modify: `README.md`
- Modify: `docs/operator-handbook.md`

- [ ] **Step 1: Write the smoke assertion for manifest integrity**

In `scripts/smoke-tests.ts`, after bundle creation add:

```ts
const bundleManifest = JSON.parse(
  await readFile(bundle.bundleManifestPath, "utf8")
);
assert.equal(bundleManifest.bundleId, bundle.id);
assert.equal(bundleManifest.testimonyUpdatedAt, publicationReady.testimonyUpdatedAt);
assert.match(bundleManifest.exports.json.sha256, /^[a-f0-9]{64}$/);
assert.match(bundleManifest.exports.markdown.sha256, /^[a-f0-9]{64}$/);
```

- [ ] **Step 2: Run smoke to verify it fails**

Run:

```bash
pnpm smoke
```

Expected: FAIL until manifest emission is wired through end to end.

- [ ] **Step 3: Update operator docs**

In `docs/operator-handbook.md`, add:

```md
- `GET /api/witness/publication-bundles/:id/manifest`
- `?download=1` is supported on `json`, `markdown`, and `manifest` artifact routes

Each publication bundle now emits a manifest artifact containing:
- source ids
- source testimony updatedAt
- SHA-256 hashes for the JSON and Markdown artifacts
```

In `README.md`, add one short runtime-data note:

```md
Publication bundle exports now include a manifest artifact for integrity and operator handoff.
```

- [ ] **Step 4: Run full verification**

Run:

```bash
pnpm typecheck
pnpm test
pnpm smoke
```

Expected:
- `pnpm typecheck` → PASS
- `pnpm test` → PASS
- `pnpm smoke` → PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/smoke-tests.ts README.md docs/operator-handbook.md
git commit -m "docs: cover witness publication handoff and integrity"
```

## Self-Review

- Spec coverage:
  - integrity metadata layer: covered by Tasks 1-3 and Task 6
  - explicit operator handoff/download actions: covered by Tasks 4-5
  - no bypass around existing endpoints: enforced by Task 4 shared artifact sender and Task 5 URL helpers
  - no governance/state-machine expansion: no task changes archive/publication state
- Placeholder scan:
  - no `TODO`/`TBD`
  - every code-changing step includes concrete code or interface snippets
  - every verification step includes exact commands
- Type consistency:
  - `bundleManifestPath` is introduced in shared type, store input, runtime persistence, server delivery, UI usage, and smoke
  - artifact formats are consistently `json | markdown | manifest`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-19-witness-publication-bundle-handoff-integrity.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
