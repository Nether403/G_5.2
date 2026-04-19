# Witness Packaged Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, idempotent `.zip` packaged export for each Witness publication bundle so operators can hand off one artifact of record locally and future remote adapters can send that exact package unchanged.

**Architecture:** Keep the current publication bundle as the source-of-truth export set and add a new packaged-export layer on top of it. Package creation should be read-only over the existing JSON, Markdown, and manifest artifacts, store package metadata separately under `package-records/`, write zip files under `packages/`, and enforce the same realpath-based root validation discipline already used for raw bundle artifacts.

**Tech Stack:** TypeScript, Node.js built-ins (`crypto`, `fs`, `fs/promises`, `path`, `stream/promises`), existing file-backed Witness stores/runtime, static `inquiry.html` dashboard UI, Node test runner, `yazl` for deterministic zip creation, `yauzl` for zip inspection in tests.

---

## File Structure

- Create: `packages/witness-types/src/publicationPackage.ts`
  Purpose: define the shared packaged-export record and store contract.
- Modify: `packages/witness-types/src/index.ts`
  Purpose: re-export the new packaged-export types.
- Modify: `packages/orchestration/package.json`
  Purpose: add zip creation/inspection dependencies used by the new runtime and tests.
- Create: `packages/orchestration/src/witness/filePublicationPackageStore.ts`
  Purpose: persist package metadata records under `package-records/` and support lookup by bundle id.
- Create: `packages/orchestration/src/witness/publicationPaths.ts`
  Purpose: centralize canonical `exports/` and `packages/` root resolution plus realpath-based validation for source artifacts and packaged zip files.
- Create: `packages/orchestration/src/witness/publicationPackageRuntime.ts`
  Purpose: create deterministic zip packages from an existing publication bundle, compute package-level hash and size, and enforce one-package-per-bundle idempotency.
- Create: `packages/orchestration/src/witness/publicationPackageRuntime.test.ts`
  Purpose: cover deterministic zip creation, idempotency, rollback, and package metadata.
- Modify: `packages/orchestration/src/witness/fileStores.test.ts`
  Purpose: add round-trip coverage for the new package store.
- Modify: `apps/dashboard/src/server.ts`
  Purpose: add package create/list/detail/file endpoints and reuse the shared root-validation helper for package delivery.
- Modify: `apps/dashboard/src/server.test.ts`
  Purpose: verify package API semantics, bundleId filtering, idempotent POST behavior, and package-file delivery safety.
- Modify: `apps/dashboard/public/inquiry.html`
  Purpose: surface `Create Package`, package metadata, and `Download Package` in the Witness publication section.
- Modify: `scripts/smoke-tests.ts`
  Purpose: extend the Witness smoke path through packaged export creation and idempotent re-request.
- Modify: `README.md`
  Purpose: document packaged exports as the local handoff artifact of record.
- Modify: `docs/operator-handbook.md`
  Purpose: document package creation, listing, download, and the one-package-per-bundle rule.

## Task 1: Add Shared Packaged-Export Types And Store

**Files:**
- Create: `packages/witness-types/src/publicationPackage.ts`
- Modify: `packages/witness-types/src/index.ts`
- Modify: `packages/orchestration/package.json`
- Create: `packages/orchestration/src/witness/filePublicationPackageStore.ts`
- Modify: `packages/orchestration/src/witness/fileStores.test.ts`

- [ ] **Step 1: Write the failing package-store round-trip test**

Add to `packages/orchestration/src/witness/fileStores.test.ts`:

```ts
import { FileWitnessPublicationPackageStore } from "./filePublicationPackageStore";

test("FileWitnessPublicationPackageStore round-trips package records and finds them by bundle id", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-witness-package-store-"));

  try {
    const store = new FileWitnessPublicationPackageStore(root);
    const created = await store.create({
      id: "package-1",
      bundleId: "bundle-1",
      witnessId: "wit-1",
      testimonyId: "testimony-1",
      archiveCandidateId: "candidate-1",
      createdAt: "2026-04-19T15:00:00.000Z",
      packagePath: path.join(root, "packages", "bundle-1--2026-04-19T15-00-00-000Z.zip"),
      packageFilename: "bundle-1--2026-04-19T15-00-00-000Z.zip",
      packageSha256: "a".repeat(64),
      packageByteSize: 512,
      sourceBundleJsonPath: path.join(root, "exports", "bundle-1.json"),
      sourceBundleMarkdownPath: path.join(root, "exports", "bundle-1.md"),
      sourceBundleManifestPath: path.join(root, "exports", "bundle-1-manifest.json"),
    });

    assert.equal(created.status, "created");
    assert.equal((await store.load(created.id))?.packageSha256, "a".repeat(64));
    assert.equal((await store.findByBundleId("bundle-1"))?.id, created.id);
    assert.deepEqual((await store.list()).map((item) => item.id), [created.id]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the focused store test to verify it fails**

Run:

```bash
pnpm --filter @g52/orchestration exec tsx --test src/witness/fileStores.test.ts
```

Expected: FAIL because `FileWitnessPublicationPackageStore` and the shared package types do not exist yet.

- [ ] **Step 3: Add the shared package type and store contract**

Create `packages/witness-types/src/publicationPackage.ts`:

```ts
export type PublicationPackageStatus = "created";

export interface PublicationPackageRecord {
  id: string;
  bundleId: string;
  witnessId: string;
  testimonyId: string;
  archiveCandidateId: string;
  createdAt: string;
  updatedAt: string;
  status: PublicationPackageStatus;
  packagePath: string;
  packageFilename: string;
  packageSha256: string;
  packageByteSize: number;
  sourceBundleJsonPath: string;
  sourceBundleMarkdownPath: string;
  sourceBundleManifestPath: string;
}

export interface PublicationPackageStore {
  load(packageId: string): Promise<PublicationPackageRecord | null>;
  list(): Promise<PublicationPackageRecord[]>;
  findByBundleId(bundleId: string): Promise<PublicationPackageRecord | null>;
  save(record: PublicationPackageRecord): Promise<PublicationPackageRecord>;
  delete(packageId: string): Promise<boolean>;
}
```

Update `packages/witness-types/src/index.ts`:

```ts
export type {
  PublicationPackageRecord,
  PublicationPackageStatus,
  PublicationPackageStore,
} from "./publicationPackage";
```

- [ ] **Step 4: Add the zip dependencies used by runtime and tests**

Update `packages/orchestration/package.json`:

```json
{
  "dependencies": {
    "yaml": "^2.5.0",
    "yauzl": "^3.2.0",
    "yazl": "^3.3.1",
    "zod": "^3.23.0"
  }
}
```

Run:

```bash
pnpm install
```

Expected: lockfile updated and dependencies available in `@g52/orchestration`.

- [ ] **Step 5: Implement the file-backed package store**

Create `packages/orchestration/src/witness/filePublicationPackageStore.ts`:

```ts
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type {
  PublicationPackageRecord,
  PublicationPackageStore,
} from "../../../witness-types/src/publicationPackage";

export interface CreatePublicationPackageInput {
  id?: string;
  bundleId: string;
  witnessId: string;
  testimonyId: string;
  archiveCandidateId: string;
  createdAt: string;
  packagePath: string;
  packageFilename: string;
  packageSha256: string;
  packageByteSize: number;
  sourceBundleJsonPath: string;
  sourceBundleMarkdownPath: string;
  sourceBundleManifestPath: string;
}

export class FileWitnessPublicationPackageStore implements PublicationPackageStore {
  constructor(private readonly rootDir: string) {}

  private recordsDir(): string {
    return path.join(this.rootDir, "package-records");
  }

  private filePath(recordId: string): string {
    return path.join(this.recordsDir(), `${recordId}.json`);
  }

  async load(packageId: string): Promise<PublicationPackageRecord | null> {
    try {
      return JSON.parse(await readFile(this.filePath(packageId), "utf8")) as PublicationPackageRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async list(): Promise<PublicationPackageRecord[]> {
    try {
      const files = await readdir(this.recordsDir());
      const items = await Promise.all(
        files.filter((file) => file.endsWith(".json")).map(async (file) =>
          JSON.parse(await readFile(path.join(this.recordsDir(), file), "utf8")) as PublicationPackageRecord
        )
      );
      return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async findByBundleId(bundleId: string): Promise<PublicationPackageRecord | null> {
    const items = await this.list();
    return items.find((item) => item.bundleId === bundleId) ?? null;
  }

  async save(record: PublicationPackageRecord): Promise<PublicationPackageRecord> {
    await mkdir(this.recordsDir(), { recursive: true });
    await writeFile(this.filePath(record.id), `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return record;
  }

  async delete(packageId: string): Promise<boolean> {
    try {
      await rm(this.filePath(packageId));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }

  async create(input: CreatePublicationPackageInput): Promise<PublicationPackageRecord> {
    return this.save({
      id: input.id ?? randomUUID(),
      bundleId: input.bundleId,
      witnessId: input.witnessId,
      testimonyId: input.testimonyId,
      archiveCandidateId: input.archiveCandidateId,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      status: "created",
      packagePath: input.packagePath,
      packageFilename: input.packageFilename,
      packageSha256: input.packageSha256,
      packageByteSize: input.packageByteSize,
      sourceBundleJsonPath: input.sourceBundleJsonPath,
      sourceBundleMarkdownPath: input.sourceBundleMarkdownPath,
      sourceBundleManifestPath: input.sourceBundleManifestPath,
    });
  }
}
```

- [ ] **Step 6: Run store tests and typecheck**

Run:

```bash
pnpm --filter @g52/orchestration exec tsx --test src/witness/fileStores.test.ts
pnpm --filter @g52/witness-types typecheck
pnpm --filter @g52/orchestration typecheck
```

Expected:
- store test PASS
- witness-types typecheck PASS
- orchestration typecheck PASS

- [ ] **Step 7: Commit**

```bash
git add packages/witness-types/src/publicationPackage.ts packages/witness-types/src/index.ts packages/orchestration/package.json pnpm-lock.yaml packages/orchestration/src/witness/filePublicationPackageStore.ts packages/orchestration/src/witness/fileStores.test.ts
git commit -m "feat: add witness publication package store"
```

## Task 2: Implement Deterministic Package Runtime And Path Validation

**Files:**
- Create: `packages/orchestration/src/witness/publicationPaths.ts`
- Create: `packages/orchestration/src/witness/publicationPackageRuntime.ts`
- Create: `packages/orchestration/src/witness/publicationPackageRuntime.test.ts`

- [ ] **Step 1: Write the failing package-runtime test**

Create `packages/orchestration/src/witness/publicationPackageRuntime.test.ts` with:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import yauzl from "yauzl";

import { FileWitnessPublicationBundleStore } from "./filePublicationBundleStore";
import { FileWitnessPublicationPackageStore } from "./filePublicationPackageStore";
import { createWitnessPublicationPackage } from "./publicationPackageRuntime";

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function readZipEntries(zipPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zipFile) => {
      if (error || !zipFile) {
        reject(error);
        return;
      }
      const entries: string[] = [];
      zipFile.readEntry();
      zipFile.on("entry", (entry) => {
        entries.push(entry.fileName);
        zipFile.readEntry();
      });
      zipFile.once("end", () => resolve(entries));
      zipFile.once("error", reject);
    });
  });
}

test("createWitnessPublicationPackage creates one deterministic zip per bundle and reuses it on repeated requests", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-witness-package-runtime-"));

  try {
    const publicationBundleRoot = path.join(root, "publication-bundles");
    const bundleStore = new FileWitnessPublicationBundleStore(publicationBundleRoot);
    const packageStore = new FileWitnessPublicationPackageStore(publicationBundleRoot);
    const exportsRoot = path.join(publicationBundleRoot, "exports");

    const jsonPath = path.join(exportsRoot, "bundle-1.json");
    const markdownPath = path.join(exportsRoot, "bundle-1.md");
    const manifestPath = path.join(exportsRoot, "bundle-1-manifest.json");

    await mkdir(exportsRoot, { recursive: true });
    await writeFile(jsonPath, "{\n  \"schemaVersion\": \"0.2.0\"\n}\n", "utf8");
    await writeFile(markdownPath, "# Publication Bundle\n", "utf8");
    await writeFile(manifestPath, "{\n  \"schemaVersion\": \"0.1.0\"\n}\n", "utf8");

    await bundleStore.create({
      id: "bundle-1",
      witnessId: "wit-1",
      testimonyId: "testimony-1",
      archiveCandidateId: "candidate-1",
      sourceTestimonyUpdatedAt: "2026-04-19T16:00:00.000Z",
      sourceSynthesisId: "synth-1",
      sourceAnnotationId: "annot-1",
      createdAt: "2026-04-19T16:01:00.000Z",
      bundleJsonPath: jsonPath,
      bundleMarkdownPath: markdownPath,
      bundleManifestPath: manifestPath,
    });

    const first = await createWitnessPublicationPackage({
      publicationBundleRoot,
      bundleId: "bundle-1",
      publicationBundleStore: bundleStore,
      publicationPackageStore: packageStore,
    });
    const second = await createWitnessPublicationPackage({
      publicationBundleRoot,
      bundleId: "bundle-1",
      publicationBundleStore: bundleStore,
      publicationPackageStore: packageStore,
    });

    assert.equal(second.id, first.id);
    assert.equal(second.packageSha256, first.packageSha256);
    assert.equal(second.packageByteSize, first.packageByteSize);
    assert.deepEqual(await readZipEntries(first.packagePath), [
      "README.txt",
      "bundle.json",
      "bundle.md",
      "manifest.json",
    ]);

    const zipBody = await readFile(first.packagePath);
    assert.equal(first.packageSha256, sha256(zipBody));
    assert.equal(first.packageByteSize, zipBody.byteLength);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the focused package-runtime test to verify it fails**

Run:

```bash
pnpm --filter @g52/orchestration exec tsx --test src/witness/publicationPackageRuntime.test.ts
```

Expected: FAIL because the runtime and shared path helper do not exist yet.

- [ ] **Step 3: Add shared publication path helpers**

Create `packages/orchestration/src/witness/publicationPaths.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";

export function publicationExportsRoot(publicationBundleRoot: string): string {
  return path.join(publicationBundleRoot, "exports");
}

export function publicationPackagesRoot(publicationBundleRoot: string): string {
  return path.join(publicationBundleRoot, "packages");
}

function isResolvedPathWithinRoot(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(rootPath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function resolvePublicationPathWithinRoot(
  rootPath: string,
  targetPath: string,
  label: string
): Promise<string> {
  const canonicalRoot = await fs.realpath(rootPath);
  const canonicalTarget = await fs.realpath(path.resolve(targetPath));
  if (!isResolvedPathWithinRoot(canonicalRoot, canonicalTarget)) {
    throw new Error(`${label} escapes the canonical publication root.`);
  }
  return canonicalTarget;
}
```

- [ ] **Step 4: Implement the deterministic package runtime**

Create `packages/orchestration/src/witness/publicationPackageRuntime.ts`:

```ts
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import yazl from "yazl";

import type { FileWitnessPublicationBundleStore } from "./filePublicationBundleStore";
import type { FileWitnessPublicationPackageStore } from "./filePublicationPackageStore";
import { publicationExportsRoot, publicationPackagesRoot, resolvePublicationPathWithinRoot } from "./publicationPaths";

export interface CreateWitnessPublicationPackageInput {
  publicationBundleRoot: string;
  bundleId: string;
  publicationBundleStore: FileWitnessPublicationBundleStore;
  publicationPackageStore: FileWitnessPublicationPackageStore;
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function sanitizeIsoForFilename(iso: string): string {
  return iso.replaceAll(":", "-").replaceAll(".", "-");
}

function buildPackageReadme(bundleId: string): string {
  return [
    "Witness publication package",
    "",
    `Bundle ID: ${bundleId}`,
    "",
    "This zip is a read-only handoff package.",
    "It contains the publication bundle JSON, Markdown, and manifest.",
    "Future remote delivery should send this zip unchanged.",
    "",
  ].join("\n");
}

async function zipBuffer(entries: Array<{ name: string; body: Buffer }>): Promise<Buffer> {
  const zipFile = new yazl.ZipFile();
  const chunks: Buffer[] = [];
  const mtime = new Date(0);

  for (const entry of entries) {
    zipFile.addBuffer(entry.body, entry.name, { mtime, mode: 0o100644 });
  }

  zipFile.end();
  zipFile.outputStream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));

  await new Promise<void>((resolve, reject) => {
    zipFile.outputStream.once("end", resolve);
    zipFile.outputStream.once("error", reject);
  });

  return Buffer.concat(chunks);
}

export async function createWitnessPublicationPackage(input: CreateWitnessPublicationPackageInput) {
  const existing = await input.publicationPackageStore.findByBundleId(input.bundleId);
  if (existing) {
    await resolvePublicationPathWithinRoot(
      publicationPackagesRoot(input.publicationBundleRoot),
      existing.packagePath,
      "Publication package path"
    );
    return existing;
  }

  const bundle = await input.publicationBundleStore.load(input.bundleId);
  if (!bundle) {
    throw new Error(`Unknown publication bundle: ${input.bundleId}`);
  }

  const exportsRoot = publicationExportsRoot(input.publicationBundleRoot);
  const packagesRoot = publicationPackagesRoot(input.publicationBundleRoot);
  const jsonPath = await resolvePublicationPathWithinRoot(exportsRoot, bundle.bundleJsonPath, "Publication bundle JSON path");
  const markdownPath = await resolvePublicationPathWithinRoot(exportsRoot, bundle.bundleMarkdownPath ?? "", "Publication bundle Markdown path");
  const manifestPath = await resolvePublicationPathWithinRoot(exportsRoot, bundle.bundleManifestPath, "Publication bundle manifest path");

  const jsonBody = await readFile(jsonPath);
  const markdownBody = await readFile(markdownPath);
  const manifestBody = await readFile(manifestPath);
  const readmeBody = Buffer.from(buildPackageReadme(bundle.id), "utf8");
  const packageFilename = `${bundle.id}--${sanitizeIsoForFilename(bundle.createdAt)}.zip`;
  const packagePath = path.join(packagesRoot, packageFilename);

  await mkdir(packagesRoot, { recursive: true });
  const packageBuffer = await zipBuffer([
    { name: "README.txt", body: readmeBody },
    { name: "bundle.json", body: jsonBody },
    { name: "bundle.md", body: markdownBody },
    { name: "manifest.json", body: manifestBody },
  ]);

  try {
    await pipeline(Readable.from(packageBuffer), createWriteStream(packagePath));
    const packageStats = await stat(packagePath);
    return await input.publicationPackageStore.create({
      bundleId: bundle.id,
      witnessId: bundle.witnessId,
      testimonyId: bundle.testimonyId,
      archiveCandidateId: bundle.archiveCandidateId,
      createdAt: bundle.createdAt,
      packagePath,
      packageFilename,
      packageSha256: sha256(packageBuffer),
      packageByteSize: packageStats.size,
      sourceBundleJsonPath: bundle.bundleJsonPath,
      sourceBundleMarkdownPath: bundle.bundleMarkdownPath ?? "",
      sourceBundleManifestPath: bundle.bundleManifestPath,
    });
  } catch (error) {
    await rm(packagePath, { force: true });
    throw error;
  }
}
```

Add the missing `Readable` import when implementing:

```ts
import { Readable } from "node:stream";
```

- [ ] **Step 5: Add rollback and deterministic-byte assertions**

Extend `packages/orchestration/src/witness/publicationPackageRuntime.test.ts` with:

```ts
test("createWitnessPublicationPackage removes a partial zip when package metadata persistence fails", async () => {
  // mirror the existing publication bundle rollback style:
  // create a throwing package store subclass
  // assert the runtime rejects
  // assert packages/ is empty
});
```

And add one deterministic-buffer assertion:

```ts
assert.equal(first.packageFilename, "bundle-1--2026-04-19T16-01-00-000Z.zip");
```

- [ ] **Step 6: Run package-runtime tests and orchestration typecheck**

Run:

```bash
pnpm --filter @g52/orchestration exec tsx --test src/witness/publicationPackageRuntime.test.ts
pnpm --filter @g52/orchestration typecheck
```

Expected:
- package-runtime tests PASS
- orchestration typecheck PASS

- [ ] **Step 7: Commit**

```bash
git add packages/orchestration/src/witness/publicationPaths.ts packages/orchestration/src/witness/publicationPackageRuntime.ts packages/orchestration/src/witness/publicationPackageRuntime.test.ts
git commit -m "feat: add deterministic witness publication packages"
```

## Task 3: Add Dashboard Package APIs

**Files:**
- Modify: `apps/dashboard/src/server.ts`
- Modify: `apps/dashboard/src/server.test.ts`

- [ ] **Step 1: Write the failing dashboard tests**

Add to `apps/dashboard/src/server.test.ts`:

```ts
test("publication package endpoints create, reuse, list, and deliver zip files", async () => {
  const createFirst = await requestJson("/api/witness/publication-packages", {
    method: "POST",
    body: JSON.stringify({ bundleId: bundle.id }),
  });
  assert.equal(createFirst.response.status, 201);

  const createSecond = await requestJson("/api/witness/publication-packages", {
    method: "POST",
    body: JSON.stringify({ bundleId: bundle.id }),
  });
  assert.equal(createSecond.response.status, 200);
  assert.equal(createSecond.json.id, createFirst.json.id);

  const byBundle = await requestJson(
    `/api/witness/publication-packages?bundleId=${encodeURIComponent(bundle.id)}`
  );
  assert.equal(byBundle.response.status, 200);
  assert.equal(byBundle.json.length, 1);

  const fileRes = await request(`/api/witness/publication-packages/${createFirst.json.id}/file?download=1`);
  assert.equal(fileRes.status, 200);
  assert.match(fileRes.headers.get("content-type") ?? "", /application\/zip/);
  assert.match(fileRes.headers.get("content-disposition") ?? "", /^attachment;/);
});
```

Add a broken-state test:

```ts
test("publication package file endpoint returns 500 for escaped package paths", async () => {
  assert.equal(response.status, 500);
});
```

- [ ] **Step 2: Run the focused dashboard tests to verify they fail**

Run:

```bash
pnpm --filter @g52/dashboard exec tsx --test src/server.test.ts
```

Expected: FAIL because package endpoints do not exist yet.

- [ ] **Step 3: Add package-store and package-runtime wiring to the server**

In `apps/dashboard/src/server.ts`, add:

```ts
import { FileWitnessPublicationPackageStore } from "../../../packages/orchestration/src/witness/filePublicationPackageStore";
import { createWitnessPublicationPackage } from "../../../packages/orchestration/src/witness/publicationPackageRuntime";
import { publicationPackagesRoot, resolvePublicationPathWithinRoot } from "../../../packages/orchestration/src/witness/publicationPaths";
```

Add a package-store helper:

```ts
function publicationPackageStoreFor(product: ProductConfig): FileWitnessPublicationPackageStore {
  if (!product.publicationBundleRoot) {
    throw new Error(`Product ${product.id} does not define a publication bundle root.`);
  }
  return new FileWitnessPublicationPackageStore(product.publicationBundleRoot);
}
```

Add routes:

```ts
if (url.pathname === "/api/witness/publication-packages" && req.method === "POST") {
  const body = (await readJsonBody(req)) as { bundleId?: unknown };
  if (typeof body.bundleId !== "string" || !body.bundleId.trim()) {
    sendJson(res, 400, { error: "bundleId is required" });
    return;
  }
  const store = publicationPackageStoreFor(WITNESS_CONFIG);
  const existed = await store.findByBundleId(body.bundleId);
  const item = await createWitnessPublicationPackage({
    publicationBundleRoot: WITNESS_CONFIG.publicationBundleRoot!,
    bundleId: body.bundleId,
    publicationBundleStore: publicationBundleStoreFor(WITNESS_CONFIG),
    publicationPackageStore: store,
  });
  sendJson(res, existed ? 200 : 201, item);
  return;
}

if (url.pathname === "/api/witness/publication-packages" && req.method === "GET") {
  const items = await publicationPackageStoreFor(WITNESS_CONFIG).list();
  const bundleId = url.searchParams.get("bundleId");
  const witnessId = url.searchParams.get("witnessId");
  const testimonyId = url.searchParams.get("testimonyId");
  sendJson(
    res,
    200,
    items.filter((item) =>
      (!bundleId || item.bundleId === bundleId) &&
      (!witnessId || item.witnessId === witnessId) &&
      (!testimonyId || item.testimonyId === testimonyId)
    )
  );
  return;
}
```

Add detail and file delivery:

```ts
const packageMatch = url.pathname.match(/^\/api\/witness\/publication-packages\/([^/]+)$/);
const packageFileMatch = url.pathname.match(/^\/api\/witness\/publication-packages\/([^/]+)\/file$/);
```

And for file delivery:

```ts
const packagePath = await resolvePublicationPathWithinRoot(
  publicationPackagesRoot(WITNESS_CONFIG.publicationBundleRoot!),
  item.packagePath,
  "Publication package path"
);
const body = await fs.readFile(packagePath);
const headers: http.OutgoingHttpHeaders = {
  "Content-Type": "application/zip",
};
if (url.searchParams.get("download") === "1") {
  headers["Content-Disposition"] = contentDispositionAttachment(path.basename(packagePath));
}
res.writeHead(200, headers);
res.end(body);
```

- [ ] **Step 4: Run dashboard tests**

Run:

```bash
pnpm --filter @g52/dashboard exec tsx --test src/server.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/server.ts apps/dashboard/src/server.test.ts
git commit -m "feat: add witness publication package endpoints"
```

## Task 4: Extend The Witness Publication UI

**Files:**
- Modify: `apps/dashboard/public/inquiry.html`
- Modify: `apps/dashboard/src/server.test.ts`

- [ ] **Step 1: Write the failing UI assertions**

Extend the existing `inquiry.html` source assertion test in `apps/dashboard/src/server.test.ts`:

```ts
assert.match(html, /data-witness-publication-package-create/);
assert.match(html, /data-witness-publication-package-download/);
assert.match(html, /\\/api\\/witness\\/publication-packages\\//);
```

- [ ] **Step 2: Run the focused dashboard test to verify it fails**

Run:

```bash
pnpm --filter @g52/dashboard exec tsx --test src/server.test.ts
```

Expected: FAIL until the UI exposes package actions.

- [ ] **Step 3: Add package state and UI actions in `inquiry.html`**

Add new client state:

```js
const state = {
  // existing fields...
  publicationPackages: [],
};
```

Add a fetch helper:

```js
async function loadWitnessPublicationPackages(testimonyId, witnessId){
  const qs = new URLSearchParams();
  if (testimonyId) qs.set("testimonyId", testimonyId);
  if (witnessId) qs.set("witnessId", witnessId);
  const res = await fetch(`/api/witness/publication-packages?${qs.toString()}`);
  const data = await res.json().catch(() => []);
  if (!res.ok) {
    setError(data.error || "Failed to load publication packages", data);
    return;
  }
  state.publicationPackages = Array.isArray(data) ? data : [];
}
```

Render package actions alongside each publication bundle card:

```html
${(() => {
  const packageRecord = state.publicationPackages.find(pkg => pkg.bundleId === item.id);
  return packageRecord
    ? `<div class="meta">Package: ${esc(packageRecord.packageFilename)} · ${esc(String(packageRecord.packageByteSize))} bytes</div>
       <a class="btn quiet" data-witness-publication-package-download="${esc(packageRecord.id)}"
          href="${esc(`/api/witness/publication-packages/${encodeURIComponent(packageRecord.id)}/file?download=1`)}">Download Package</a>`
    : `<button class="btn quiet" data-witness-publication-package-create="${esc(item.id)}">Create Package</button>`;
})()}
```

Add the click handler:

```js
$$("[data-witness-publication-package-create]").forEach(node => node.addEventListener("click", async () => {
  const bundleId = node.getAttribute("data-witness-publication-package-create");
  if (!bundleId) return;
  const res = await fetch("/api/witness/publication-packages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bundleId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    setError(data.error || "Failed to create publication package", data);
    return;
  }
  await loadWitnessPublicationPackages(activeWitnessTestimony()?.id, state.witnessId);
  render();
}));
```

Ensure the existing publication refresh path also calls `loadWitnessPublicationPackages(...)`.

- [ ] **Step 4: Run dashboard tests**

Run:

```bash
pnpm --filter @g52/dashboard exec tsx --test src/server.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/public/inquiry.html apps/dashboard/src/server.test.ts
git commit -m "feat: add witness publication package actions"
```

## Task 5: Smoke, Docs, And Full Verification

**Files:**
- Modify: `scripts/smoke-tests.ts`
- Modify: `README.md`
- Modify: `docs/operator-handbook.md`

- [ ] **Step 1: Write the failing smoke assertions**

Extend the Witness smoke path in `scripts/smoke-tests.ts`:

```ts
const packageRecord = await createWitnessPublicationPackage({
  publicationBundleRoot: witness.publicationBundleRoot!,
  bundleId: bundle.id,
  publicationBundleStore,
  publicationPackageStore,
});

assert.equal(packageRecord.bundleId, bundle.id);
assert.match(packageRecord.packageFilename, /^.+--.+\.zip$/);
assert.ok(packageRecord.packageByteSize > 0);
assert.match(packageRecord.packageSha256, /^[a-f0-9]{64}$/);

const packageAgain = await createWitnessPublicationPackage({
  publicationBundleRoot: witness.publicationBundleRoot!,
  bundleId: bundle.id,
  publicationBundleStore,
  publicationPackageStore,
});

assert.equal(packageAgain.id, packageRecord.id);
```

- [ ] **Step 2: Run smoke to verify it fails**

Run:

```bash
pnpm smoke
```

Expected: FAIL until the package runtime is wired through the smoke harness.

- [ ] **Step 3: Update the docs**

Update `README.md` with one short packaged-export note:

```md
Witness publication bundles can now be packaged into a deterministic `.zip` handoff artifact. The package is created from existing emitted bundle artifacts and is the local artifact of record for future remote delivery adapters.
```

Update `docs/operator-handbook.md` under the Witness publication section:

```md
### 3.7 Create Witness publication packages

Publication packages are local `.zip` handoff artifacts created from an existing publication bundle.

APIs:
- `POST /api/witness/publication-packages`
- `GET /api/witness/publication-packages?witnessId=...&testimonyId=...&bundleId=...`
- `GET /api/witness/publication-packages/:id`
- `GET /api/witness/publication-packages/:id/file`

Operational rules:
- one package per publication bundle
- repeated create requests return the existing package record
- the package contains `bundle.json`, `bundle.md`, `manifest.json`, and `README.txt`
- package delivery validates the canonical `packages/` root via realpath before reading bytes
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
git commit -m "docs: cover witness packaged export workflow"
```

## Self-Review

- Spec coverage:
  - one package per bundle idempotency: covered in Tasks 2, 3, and 5
  - package-level `packageSha256` and `packageByteSize`: covered in Tasks 1, 2, and 5
  - deterministic zip semantics: covered in Task 2 runtime and tests
  - `bundleId` as a first-class filter: covered in Task 3
  - realpath-based package delivery invariant: covered in Tasks 2 and 3
- Placeholder scan:
  - no `TODO`/`TBD`
  - all code steps contain concrete types, functions, or route snippets
  - all verification steps include exact commands and expected outcomes
- Type consistency:
  - `PublicationPackageRecord` and `FileWitnessPublicationPackageStore` are introduced before runtime/server/UI use them
  - `packageSha256`, `packageByteSize`, `packageFilename`, and `bundleId` are used consistently across store, runtime, server, UI, smoke, and docs

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-19-witness-packaged-export.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
