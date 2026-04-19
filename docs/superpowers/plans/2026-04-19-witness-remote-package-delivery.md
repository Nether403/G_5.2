# Witness Remote Package Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first remote delivery slice for Witness packaged exports by uploading the existing `.zip` package unchanged through a generic object-storage adapter, with Azure Blob as the first backend and delivery attempts recorded locally.

**Architecture:** Keep the package as the artifact of record and add a new delivery layer on top of it. Delivery should resolve an existing `PublicationPackageRecord`, validate the local package path through the canonical packages root, synchronously upload that exact file through a generic object-storage interface, and persist a minimal `PublicationDeliveryRecord` for each attempt.

**Tech Stack:** TypeScript, Node.js built-ins, existing Witness file-backed stores/runtime, static `inquiry.html` dashboard UI, Node test runner, Azure Blob SDK for the first backend, fake object backend for smoke and runtime tests.

---

## File Structure

- Create: `packages/witness-types/src/publicationDelivery.ts`
  Purpose: define the shared delivery-record types and delivery-store contract.
- Modify: `packages/witness-types/src/index.ts`
  Purpose: re-export the new delivery types.
- Modify: `packages/orchestration/package.json`
  Purpose: add the Azure Blob SDK dependency used by the first object backend.
- Create: `packages/orchestration/src/witness/filePublicationDeliveryStore.ts`
  Purpose: persist `PublicationDeliveryRecord` entries under `delivery-records/`.
- Create: `packages/orchestration/src/witness/objectDelivery.ts`
  Purpose: define the generic object-storage delivery interface and backend selection contract.
- Create: `packages/orchestration/src/witness/azureBlobObjectDelivery.ts`
  Purpose: implement the first concrete backend behind the generic object-delivery interface.
- Create: `packages/orchestration/src/witness/publicationDeliveryRuntime.ts`
  Purpose: resolve package records, validate package paths, upload synchronously, and persist delivery attempts.
- Create: `packages/orchestration/src/witness/publicationDeliveryRuntime.test.ts`
  Purpose: cover successful and failed delivery attempts, path validation, and package immutability.
- Modify: `packages/orchestration/src/witness/fileStores.test.ts`
  Purpose: add round-trip coverage for the delivery store.
- Modify: `apps/dashboard/src/server.ts`
  Purpose: add publication-delivery create/list/detail routes.
- Modify: `apps/dashboard/src/server.test.ts`
  Purpose: verify delivery API behavior, error mapping, and persisted failure records.
- Modify: `apps/dashboard/public/inquiry.html`
  Purpose: surface `Deliver Package` and minimal delivery status/history for the selected package.
- Modify: `scripts/smoke-tests.ts`
  Purpose: extend the Witness smoke path through a fake remote package delivery.
- Modify: `README.md`
  Purpose: document remote package delivery as the first transport layer over packaged exports.
- Modify: `docs/operator-handbook.md`
  Purpose: document delivery creation, delivery records, and the synchronous operator-triggered behavior.

## Task 1: Add Shared Delivery Types And Store

**Files:**
- Create: `packages/witness-types/src/publicationDelivery.ts`
- Modify: `packages/witness-types/src/index.ts`
- Create: `packages/orchestration/src/witness/filePublicationDeliveryStore.ts`
- Modify: `packages/orchestration/src/witness/fileStores.test.ts`

- [ ] **Step 1: Write the failing delivery-store round-trip test**

Add to `packages/orchestration/src/witness/fileStores.test.ts`:

```ts
import { FileWitnessPublicationDeliveryStore } from "./filePublicationDeliveryStore";

test("FileWitnessPublicationDeliveryStore round-trips delivery records and filters by package id", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-delivery-store-")
  );

  try {
    const store = new FileWitnessPublicationDeliveryStore(root);
    const created = await store.create({
      packageId: "bundle-1",
      bundleId: "bundle-1",
      witnessId: "wit-1",
      testimonyId: "testimony-1",
      backend: "azure-blob",
      status: "succeeded",
      createdAt: "2026-04-19T22:00:00.000Z",
      remoteKey: "witness/wit-1/testimony/testimony-1/packages/bundle-1.zip",
      remoteUrl: "https://example.invalid/container/bundle-1.zip",
    });

    assert.equal(created.status, "succeeded");
    assert.equal((await store.load(created.id))?.packageId, "bundle-1");
    assert.equal((await store.findLatestByPackageId("bundle-1"))?.id, created.id);
    assert.deepEqual(
      (await store.list({ packageId: "bundle-1" })).map((record) => record.id),
      [created.id]
    );
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

Expected: FAIL because the delivery store and types do not exist yet.

- [ ] **Step 3: Add the shared delivery type and store contract**

Create `packages/witness-types/src/publicationDelivery.ts`:

```ts
export type PublicationDeliveryBackend = "azure-blob";
export type PublicationDeliveryStatus = "succeeded" | "failed";

export interface PublicationDeliveryRecord {
  id: string;
  packageId: string;
  bundleId: string;
  witnessId: string;
  testimonyId: string;
  backend: PublicationDeliveryBackend;
  status: PublicationDeliveryStatus;
  createdAt: string;
  updatedAt: string;
  remoteKey: string;
  remoteUrl?: string;
  error?: string;
}

export interface PublicationDeliveryStore {
  load(deliveryId: string): Promise<PublicationDeliveryRecord | null>;
  list(filters?: {
    packageId?: string;
    bundleId?: string;
    witnessId?: string;
    testimonyId?: string;
  }): Promise<PublicationDeliveryRecord[]>;
  findLatestByPackageId(
    packageId: string
  ): Promise<PublicationDeliveryRecord | null>;
  save(record: PublicationDeliveryRecord): Promise<PublicationDeliveryRecord>;
  delete(deliveryId: string): Promise<boolean>;
}
```

Update `packages/witness-types/src/index.ts`:

```ts
export type {
  PublicationDeliveryBackend,
  PublicationDeliveryRecord,
  PublicationDeliveryStatus,
  PublicationDeliveryStore,
} from "./publicationDelivery";
```

- [ ] **Step 4: Implement the file-backed delivery store**

Create `packages/orchestration/src/witness/filePublicationDeliveryStore.ts`:

```ts
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type {
  PublicationDeliveryRecord,
  PublicationDeliveryStore,
} from "../../../witness-types/src/publicationDelivery";

export interface CreatePublicationDeliveryInput {
  id?: string;
  packageId: string;
  bundleId: string;
  witnessId: string;
  testimonyId: string;
  backend: PublicationDeliveryRecord["backend"];
  status: PublicationDeliveryRecord["status"];
  createdAt: string;
  remoteKey: string;
  remoteUrl?: string;
  error?: string;
}

export class FileWitnessPublicationDeliveryStore
  implements PublicationDeliveryStore
{
  constructor(private readonly rootDir: string) {}

  private recordsDir(): string {
    return path.join(this.rootDir, "delivery-records");
  }

  private filePath(recordId: string): string {
    return path.join(this.recordsDir(), `${recordId}.json`);
  }

  async load(deliveryId: string): Promise<PublicationDeliveryRecord | null> {
    try {
      const raw = await readFile(this.filePath(deliveryId), "utf8");
      return JSON.parse(raw) as PublicationDeliveryRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async list(filters?: {
    packageId?: string;
    bundleId?: string;
    witnessId?: string;
    testimonyId?: string;
  }): Promise<PublicationDeliveryRecord[]> {
    try {
      const files = await readdir(this.recordsDir());
      const records = await Promise.all(
        files
          .filter((file) => file.endsWith(".json"))
          .map(async (file) => {
            const raw = await readFile(path.join(this.recordsDir(), file), "utf8");
            return JSON.parse(raw) as PublicationDeliveryRecord;
          })
      );

      return records
        .filter((record) =>
          (!filters?.packageId || record.packageId === filters.packageId) &&
          (!filters?.bundleId || record.bundleId === filters.bundleId) &&
          (!filters?.witnessId || record.witnessId === filters.witnessId) &&
          (!filters?.testimonyId || record.testimonyId === filters.testimonyId)
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async findLatestByPackageId(
    packageId: string
  ): Promise<PublicationDeliveryRecord | null> {
    const records = await this.list({ packageId });
    return records.at(-1) ?? null;
  }

  async save(
    record: PublicationDeliveryRecord
  ): Promise<PublicationDeliveryRecord> {
    await mkdir(this.recordsDir(), { recursive: true });
    await writeFile(
      this.filePath(record.id),
      `${JSON.stringify(record, null, 2)}\n`,
      "utf8"
    );
    return record;
  }

  async delete(deliveryId: string): Promise<boolean> {
    try {
      await rm(this.filePath(deliveryId));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }

  async create(
    input: CreatePublicationDeliveryInput
  ): Promise<PublicationDeliveryRecord> {
    const record: PublicationDeliveryRecord = {
      id: input.id ?? randomUUID(),
      packageId: input.packageId,
      bundleId: input.bundleId,
      witnessId: input.witnessId,
      testimonyId: input.testimonyId,
      backend: input.backend,
      status: input.status,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      remoteKey: input.remoteKey,
      remoteUrl: input.remoteUrl,
      error: input.error,
    };

    return this.save(record);
  }
}
```

- [ ] **Step 5: Run the focused store test to verify it passes**

Run:

```bash
pnpm --filter @g52/orchestration exec tsx --test src/witness/fileStores.test.ts
```

Expected: PASS with the new delivery-store test green.

- [ ] **Step 6: Commit**

```bash
git add packages/witness-types/src/publicationDelivery.ts packages/witness-types/src/index.ts packages/orchestration/src/witness/filePublicationDeliveryStore.ts packages/orchestration/src/witness/fileStores.test.ts
git commit -m "feat: add witness publication delivery records"
```

## Task 2: Add Generic Object Delivery Interface And Azure Backend

**Files:**
- Modify: `packages/orchestration/package.json`
- Create: `packages/orchestration/src/witness/objectDelivery.ts`
- Create: `packages/orchestration/src/witness/azureBlobObjectDelivery.ts`

- [ ] **Step 1: Write the failing backend-selection test**

Create `packages/orchestration/src/witness/objectDelivery.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  getPublicationObjectDeliveryBackend,
  type ObjectDeliveryBackend,
} from "./objectDelivery";

test("getPublicationObjectDeliveryBackend resolves azure-blob", async () => {
  const backend = getPublicationObjectDeliveryBackend("azure-blob");
  assert.equal(backend.name, "azure-blob");
});

test("getPublicationObjectDeliveryBackend rejects unknown backends", async () => {
  assert.throws(
    () =>
      getPublicationObjectDeliveryBackend(
        "not-real" as unknown as ObjectDeliveryBackend["name"]
      ),
    /Unknown publication object delivery backend/i
  );
});
```

- [ ] **Step 2: Run the focused backend test to verify it fails**

Run:

```bash
pnpm --filter @g52/orchestration exec tsx --test src/witness/objectDelivery.test.ts
```

Expected: FAIL because the object-delivery contract does not exist yet.

- [ ] **Step 3: Add the Azure Blob dependency**

Update `packages/orchestration/package.json`:

```json
{
  "dependencies": {
    "@azure/storage-blob": "^12.28.0",
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

Expected: lockfile updated and Azure Blob SDK available in `@g52/orchestration`.

- [ ] **Step 4: Define the generic object-delivery interface**

Create `packages/orchestration/src/witness/objectDelivery.ts`:

```ts
export interface PutObjectInput {
  key: string;
  filePath: string;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface PutObjectResult {
  remoteKey: string;
  remoteUrl?: string;
}

export interface ObjectDeliveryBackend {
  name: "azure-blob";
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
}

import { AzureBlobObjectDelivery } from "./azureBlobObjectDelivery";

export function getPublicationObjectDeliveryBackend(
  backendName: ObjectDeliveryBackend["name"]
): ObjectDeliveryBackend {
  switch (backendName) {
    case "azure-blob":
      return new AzureBlobObjectDelivery();
    default:
      throw new Error(
        `Unknown publication object delivery backend: ${backendName as string}`
      );
  }
}
```

- [ ] **Step 5: Implement the first Azure backend**

Create `packages/orchestration/src/witness/azureBlobObjectDelivery.ts`:

```ts
import { BlobServiceClient } from "@azure/storage-blob";

import type { ObjectDeliveryBackend, PutObjectInput, PutObjectResult } from "./objectDelivery";

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing Azure Blob delivery config: ${name}`);
  }
  return value;
}

export class AzureBlobObjectDelivery implements ObjectDeliveryBackend {
  readonly name = "azure-blob" as const;

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const connectionString = getRequiredEnv("AZURE_BLOB_CONNECTION_STRING");
    const containerName = getRequiredEnv("AZURE_BLOB_CONTAINER_NAME");

    const client = BlobServiceClient.fromConnectionString(connectionString);
    const container = client.getContainerClient(containerName);
    const blob = container.getBlockBlobClient(input.key);

    await blob.uploadFile(input.filePath, {
      blobHTTPHeaders: {
        blobContentType: input.contentType,
      },
      metadata: input.metadata,
    });

    return {
      remoteKey: input.key,
      remoteUrl: blob.url,
    };
  }
}
```

- [ ] **Step 6: Run the focused backend test to verify it passes**

Run:

```bash
pnpm --filter @g52/orchestration exec tsx --test src/witness/objectDelivery.test.ts
```

Expected: PASS with backend selection covered.

- [ ] **Step 7: Commit**

```bash
git add packages/orchestration/package.json pnpm-lock.yaml packages/orchestration/src/witness/objectDelivery.ts packages/orchestration/src/witness/objectDelivery.test.ts packages/orchestration/src/witness/azureBlobObjectDelivery.ts
git commit -m "feat: add publication object delivery backends"
```

## Task 3: Implement Delivery Runtime

**Files:**
- Create: `packages/orchestration/src/witness/publicationDeliveryRuntime.ts`
- Create: `packages/orchestration/src/witness/publicationDeliveryRuntime.test.ts`

- [ ] **Step 1: Write the failing runtime test for successful delivery**

Create `packages/orchestration/src/witness/publicationDeliveryRuntime.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

import { FileWitnessPublicationPackageStore } from "./filePublicationPackageStore";
import { FileWitnessPublicationDeliveryStore } from "./filePublicationDeliveryStore";
import { deliverWitnessPublicationPackage } from "./publicationDeliveryRuntime";

class FakeObjectDeliveryBackend {
  readonly name = "azure-blob" as const;

  constructor(private readonly remoteRoot: string) {}

  async putObject(input: {
    key: string;
    filePath: string;
    contentType: string;
    metadata?: Record<string, string>;
  }) {
    const target = path.join(this.remoteRoot, input.key.replaceAll("/", path.sep));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await readFile(input.filePath));
    return {
      remoteKey: input.key,
      remoteUrl: `file://${target.replaceAll("\\\\", "/")}`,
    };
  }
}

test("deliverWitnessPublicationPackage uploads the existing package unchanged and writes a succeeded delivery record", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-witness-publication-delivery-runtime-"));

  try {
    const publicationBundleRoot = path.join(root, "publication-bundles");
    const packagesRoot = path.join(publicationBundleRoot, "packages");
    const remoteRoot = path.join(root, "remote");
    await mkdir(packagesRoot, { recursive: true });

    const packagePath = path.join(packagesRoot, "bundle-1--2026-04-19T22-00-00-000Z.zip");
    const packageBytes = Buffer.from("package-bytes");
    await writeFile(packagePath, packageBytes);

    const packageStore = new FileWitnessPublicationPackageStore(publicationBundleRoot);
    const deliveryStore = new FileWitnessPublicationDeliveryStore(publicationBundleRoot);
    const packageRecord = await packageStore.create({
      id: "bundle-1",
      bundleId: "bundle-1",
      witnessId: "wit-1",
      testimonyId: "testimony-1",
      archiveCandidateId: "candidate-1",
      createdAt: "2026-04-19T22:00:00.000Z",
      packagePath,
      packageFilename: "bundle-1--2026-04-19T22-00-00-000Z.zip",
      packageSha256: "1".repeat(64),
      packageByteSize: packageBytes.byteLength,
      sourceBundleJsonPath: "bundle.json",
      sourceBundleMarkdownPath: "bundle.md",
      sourceBundleManifestPath: "manifest.json",
    });

    const result = await deliverWitnessPublicationPackage({
      publicationBundleRoot,
      packageId: packageRecord.id,
      packageStore,
      deliveryStore,
      backend: new FakeObjectDeliveryBackend(remoteRoot),
    });

    assert.equal(result.status, "succeeded");
    assert.equal(result.packageId, packageRecord.id);
    assert.match(result.remoteKey, /^witness\/wit-1\/testimony\/testimony-1\/packages\//);
    assert.ok(result.remoteUrl);
    const uploaded = await readFile(
      path.join(remoteRoot, result.remoteKey.replaceAll("/", path.sep))
    );
    assert.deepEqual(uploaded, packageBytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the focused runtime test to verify it fails**

Run:

```bash
pnpm --filter @g52/orchestration exec tsx --test src/witness/publicationDeliveryRuntime.test.ts
```

Expected: FAIL because the delivery runtime does not exist yet.

- [ ] **Step 3: Implement the delivery runtime**

Create `packages/orchestration/src/witness/publicationDeliveryRuntime.ts`:

```ts
import type { ObjectDeliveryBackend } from "./objectDelivery";
import type { FileWitnessPublicationPackageStore } from "./filePublicationPackageStore";
import type { FileWitnessPublicationDeliveryStore } from "./filePublicationDeliveryStore";
import { publicationPackagesRoot, resolvePublicationPathWithinRoot } from "./publicationPaths";

export interface DeliverWitnessPublicationPackageInput {
  publicationBundleRoot: string;
  packageId: string;
  packageStore: FileWitnessPublicationPackageStore;
  deliveryStore: FileWitnessPublicationDeliveryStore;
  backend: ObjectDeliveryBackend;
}

function buildRemoteKey(record: {
  witnessId: string;
  testimonyId: string;
  packageFilename: string;
}): string {
  return `witness/${record.witnessId}/testimony/${record.testimonyId}/packages/${record.packageFilename}`;
}

export async function deliverWitnessPublicationPackage(
  input: DeliverWitnessPublicationPackageInput
) {
  const packageRecord = await input.packageStore.load(input.packageId);
  if (!packageRecord) {
    throw new Error(`Unknown publication package: ${input.packageId}`);
  }

  const packagePath = await resolvePublicationPathWithinRoot(
    publicationPackagesRoot(input.publicationBundleRoot),
    packageRecord.packagePath,
    "Publication package path"
  );

  const createdAt = new Date().toISOString();
  const remoteKey = buildRemoteKey(packageRecord);

  try {
    const uploaded = await input.backend.putObject({
      key: remoteKey,
      filePath: packagePath,
      contentType: "application/zip",
      metadata: {
        packageId: packageRecord.id,
        bundleId: packageRecord.bundleId,
      },
    });

    return await input.deliveryStore.create({
      packageId: packageRecord.id,
      bundleId: packageRecord.bundleId,
      witnessId: packageRecord.witnessId,
      testimonyId: packageRecord.testimonyId,
      backend: input.backend.name,
      status: "succeeded",
      createdAt,
      remoteKey: uploaded.remoteKey,
      remoteUrl: uploaded.remoteUrl,
    });
  } catch (error) {
    return await input.deliveryStore.create({
      packageId: packageRecord.id,
      bundleId: packageRecord.bundleId,
      witnessId: packageRecord.witnessId,
      testimonyId: packageRecord.testimonyId,
      backend: input.backend.name,
      status: "failed",
      createdAt,
      remoteKey,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
```

- [ ] **Step 4: Add a failing-upload test**

Append to `packages/orchestration/src/witness/publicationDeliveryRuntime.test.ts`:

```ts
class ThrowingObjectDeliveryBackend {
  readonly name = "azure-blob" as const;

  async putObject(): Promise<never> {
    throw new Error("simulated remote upload failure");
  }
}

test("deliverWitnessPublicationPackage writes a failed delivery record when remote upload fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-witness-publication-delivery-failure-"));

  try {
    const publicationBundleRoot = path.join(root, "publication-bundles");
    const packagesRoot = path.join(publicationBundleRoot, "packages");
    await mkdir(packagesRoot, { recursive: true });

    const packagePath = path.join(packagesRoot, "bundle-2--2026-04-19T22-05-00-000Z.zip");
    await writeFile(packagePath, Buffer.from("package-bytes"));

    const packageStore = new FileWitnessPublicationPackageStore(publicationBundleRoot);
    const deliveryStore = new FileWitnessPublicationDeliveryStore(publicationBundleRoot);
    const packageRecord = await packageStore.create({
      id: "bundle-2",
      bundleId: "bundle-2",
      witnessId: "wit-2",
      testimonyId: "testimony-2",
      archiveCandidateId: "candidate-2",
      createdAt: "2026-04-19T22:05:00.000Z",
      packagePath,
      packageFilename: "bundle-2--2026-04-19T22-05-00-000Z.zip",
      packageSha256: "2".repeat(64),
      packageByteSize: 13,
      sourceBundleJsonPath: "bundle.json",
      sourceBundleMarkdownPath: "bundle.md",
      sourceBundleManifestPath: "manifest.json",
    });

    const failed = await deliverWitnessPublicationPackage({
      publicationBundleRoot,
      packageId: packageRecord.id,
      packageStore,
      deliveryStore,
      backend: new ThrowingObjectDeliveryBackend(),
    });

    assert.equal(failed.status, "failed");
    assert.match(failed.error ?? "", /simulated remote upload failure/i);
    assert.equal((await deliveryStore.list({ packageId: packageRecord.id })).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 5: Run the focused runtime tests to verify they pass**

Run:

```bash
pnpm --filter @g52/orchestration exec tsx --test src/witness/publicationDeliveryRuntime.test.ts
```

Expected: PASS with both succeeded and failed delivery cases green.

- [ ] **Step 6: Commit**

```bash
git add packages/orchestration/src/witness/publicationDeliveryRuntime.ts packages/orchestration/src/witness/publicationDeliveryRuntime.test.ts
git commit -m "feat: add witness publication delivery runtime"
```

## Task 4: Add Delivery API Endpoints

**Files:**
- Modify: `apps/dashboard/src/server.ts`
- Modify: `apps/dashboard/src/server.test.ts`

- [ ] **Step 1: Write the failing API test for delivery creation**

Add to `apps/dashboard/src/server.test.ts`:

```ts
test("publication delivery endpoints create, list, and fetch delivery records", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-dashboard-publication-deliveries-"));

  try {
    const publicationBundleRoot = path.join(root, "publication-bundles");
    const packagesRoot = path.join(publicationBundleRoot, "packages");
    await mkdir(packagesRoot, { recursive: true });

    const packagePath = path.join(packagesRoot, "bundle-1--2026-04-19T22-10-00-000Z.zip");
    await writeFile(packagePath, Buffer.from("package-bytes"));

    const packageStore = new FileWitnessPublicationPackageStore(publicationBundleRoot);
    const packageRecord = await packageStore.create({
      id: "bundle-1",
      bundleId: "bundle-1",
      witnessId: "wit-1",
      testimonyId: "testimony-1",
      archiveCandidateId: "candidate-1",
      createdAt: "2026-04-19T22:10:00.000Z",
      packagePath,
      packageFilename: "bundle-1--2026-04-19T22-10-00-000Z.zip",
      packageSha256: "1".repeat(64),
      packageByteSize: 13,
      sourceBundleJsonPath: "bundle.json",
      sourceBundleMarkdownPath: "bundle.md",
      sourceBundleManifestPath: "manifest.json",
    });

    process.env.AZURE_BLOB_CONNECTION_STRING = "UseDevelopmentStorage=true";
    process.env.AZURE_BLOB_CONTAINER_NAME = "witness";

    const createRes = await requestJson("POST", "/api/witness/publication-deliveries", {
      packageId: packageRecord.id,
      backend: "azure-blob",
    }, {
      publicationBundleRoot,
      publicationObjectDeliveryBackendOverride: {
        name: "azure-blob",
        async putObject(input) {
          return {
            remoteKey: input.key,
            remoteUrl: `https://example.invalid/${input.key}`,
          };
        },
      },
    });

    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.packageId, packageRecord.id);

    const listRes = await requestJson(
      "GET",
      `/api/witness/publication-deliveries?packageId=${encodeURIComponent(packageRecord.id)}`,
      undefined,
      { publicationBundleRoot }
    );
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.length, 1);

    const detailRes = await requestJson(
      "GET",
      `/api/witness/publication-deliveries/${encodeURIComponent(createRes.body.id)}`,
      undefined,
      { publicationBundleRoot }
    );
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.body.id, createRes.body.id);
  } finally {
    await rm(root, { recursive: true, force: true });
    delete process.env.AZURE_BLOB_CONNECTION_STRING;
    delete process.env.AZURE_BLOB_CONTAINER_NAME;
  }
});
```

- [ ] **Step 2: Run the focused server test to verify it fails**

Run:

```bash
pnpm --filter @g52/dashboard exec tsx --test src/server.test.ts
```

Expected: FAIL because the delivery endpoints do not exist yet.

- [ ] **Step 3: Add the delivery endpoints**

Update `apps/dashboard/src/server.ts` to add:

- `publicationDeliveryStoreFor(config)`
- `POST /api/witness/publication-deliveries`
- `GET /api/witness/publication-deliveries`
- `GET /api/witness/publication-deliveries/:id`

Use this route behavior:

```ts
if (url.pathname === "/api/witness/publication-deliveries" && req.method === "POST") {
  const body = (await readJsonBody(req)) as { packageId?: unknown; backend?: unknown };
  const packageId = typeof body.packageId === "string" ? body.packageId.trim() : "";
  const backendName = typeof body.backend === "string" ? body.backend.trim() : "azure-blob";

  if (!packageId) {
    sendJson(res, 400, { error: "packageId is required" });
    return;
  }
  if (!isValidUuid(packageId)) {
    sendJson(res, 400, { error: "Malformed publication package id" });
    return;
  }
  if (backendName !== "azure-blob") {
    sendJson(res, 400, { error: "Unknown publication delivery backend" });
    return;
  }

  try {
    const created = await deliverWitnessPublicationPackage({
      publicationBundleRoot: WITNESS_CONFIG.publicationBundleRoot!,
      packageId,
      packageStore: publicationPackageStoreFor(WITNESS_CONFIG),
      deliveryStore: publicationDeliveryStoreFor(WITNESS_CONFIG),
      backend: publicationObjectDeliveryBackendOverride ?? getPublicationObjectDeliveryBackend("azure-blob"),
    });

    sendJson(res, created.status === "succeeded" ? 201 : 502, created);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status =
      /Unknown publication package/.test(message) ? 404 :
      /Publication package path/.test(message) ? 500 :
      500;
    sendJson(res, status, { error: message });
  }
  return;
}
```

List/detail routes should:

- support filters by `packageId`, `bundleId`, `witnessId`, `testimonyId`
- return `400` for malformed ids
- return `404` for unknown delivery ids

- [ ] **Step 4: Add failed-upload API coverage**

Add a server test that injects a throwing backend override and asserts:

- response status is `502`
- response body status is `failed`
- the failed delivery record is still persisted

- [ ] **Step 5: Run the focused server tests to verify they pass**

Run:

```bash
pnpm --filter @g52/dashboard exec tsx --test src/server.test.ts
```

Expected: PASS with publication-delivery create/list/detail coverage green.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/server.ts apps/dashboard/src/server.test.ts
git commit -m "feat: add witness publication delivery api"
```

## Task 5: Add Delivery UI And Final Verification

**Files:**
- Modify: `apps/dashboard/public/inquiry.html`
- Modify: `scripts/smoke-tests.ts`
- Modify: `README.md`
- Modify: `docs/operator-handbook.md`

- [ ] **Step 1: Extend the Witness package UI**

Update `apps/dashboard/public/inquiry.html` so the selected package can:

- show latest delivery status/history
- trigger `Deliver Package`

Add minimal state:

```js
deliveriesByPackageId:{},
witnessPublicationDeliveryLoading:false,
```

Add a loader helper:

```js
async function loadWitnessPublicationDeliveries(){
  const witnessId=state.selectedWitnessId;
  const testimonyId=state.selectedWitnessTestimonyId;
  if(!witnessId||!testimonyId){
    state.deliveriesByPackageId={};
    return;
  }
  state.witnessPublicationDeliveryLoading=true;
  render();
  try{
    const res=await fetch(`/api/witness/publication-deliveries?witnessId=${encodeURIComponent(witnessId)}&testimonyId=${encodeURIComponent(testimonyId)}`);
    const items=res.ok?await res.json():[];
    const grouped={};
    for(const item of items){
      (grouped[item.packageId] ||= []).push(item);
    }
    state.deliveriesByPackageId=grouped;
  }finally{
    state.witnessPublicationDeliveryLoading=false;
    render();
  }
}
```

Render per package:

```js
const deliveries=(state.deliveriesByPackageId[publicationPackage.id]||[]);
const latestDelivery=deliveries.at(-1);
```

UI actions:

- `Deliver Package`
- show latest backend/status/remoteKey or error

- [ ] **Step 2: Extend the Witness smoke path**

Update `scripts/smoke-tests.ts` to add a fake backend and delivery assertion to the Witness path:

```ts
const fakeRemoteRoot = path.join(root, "remote");
const deliveryStore = new FileWitnessPublicationDeliveryStore(
  witnessPublicationBundleRoot
);

const delivered = await deliverWitnessPublicationPackage({
  publicationBundleRoot: witnessPublicationBundleRoot,
  packageId: packageRecord.id,
  packageStore: publicationPackageStore,
  deliveryStore,
  backend: {
    name: "azure-blob",
    async putObject(input) {
      const target = path.join(fakeRemoteRoot, input.key.replaceAll("/", path.sep));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, await readFile(input.filePath));
      return {
        remoteKey: input.key,
        remoteUrl: `file://${target.replaceAll("\\\\", "/")}`,
      };
    },
  },
});

assert.equal(delivered.status, "succeeded");
assert.equal(delivered.packageId, packageRecord.id);
assert.deepEqual(
  await readFile(path.join(fakeRemoteRoot, delivered.remoteKey.replaceAll("/", path.sep))),
  await readFile(packageRecord.packagePath)
);
```

- [ ] **Step 3: Update docs**

Update `README.md` with one short note:

```md
Witness publication packages can now be delivered remotely through the first object-storage adapter layer. Delivery uploads the existing `.zip` unchanged and records each attempt separately from package metadata.
```

Update `docs/operator-handbook.md` with a new subsection under the Witness publication/package flow:

```md
### 3.8 Create Witness publication deliveries

Publication deliveries are synchronous, operator-triggered upload attempts over an existing Witness publication package.

APIs:
- `POST /api/witness/publication-deliveries`
- `GET /api/witness/publication-deliveries?packageId=...&bundleId=...&witnessId=...&testimonyId=...`
- `GET /api/witness/publication-deliveries/:id`

Operational rules:
- delivery consumes the existing package unchanged
- each upload attempt writes a delivery record
- Azure Blob is the first backend, behind a generic object-delivery contract
- failed remote uploads persist `failed` delivery records; they do not mutate package records
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
git add apps/dashboard/public/inquiry.html scripts/smoke-tests.ts README.md docs/operator-handbook.md
git commit -m "feat: add witness remote package delivery ui"
```

## Self-Review

- Spec coverage:
  - generic object-delivery contract: covered in Task 2
  - Azure Blob first backend: covered in Task 2
  - synchronous operator-triggered upload: covered in Tasks 3, 4, and 5
  - `PublicationDeliveryRecord` and local auditability: covered in Tasks 1, 3, 4, and 5
  - package consumed unchanged: covered in Tasks 3 and 5
  - failure records on remote upload failure: covered in Tasks 3 and 4
- Placeholder scan:
  - no `TODO`/`TBD`
  - all code steps include concrete snippets or route logic
  - all verification steps include exact commands and expected outcomes
- Type consistency:
  - `PublicationDeliveryRecord`, `PublicationDeliveryStore`, and object-delivery backend types are introduced before runtime/server/UI use them
  - `packageId`, `bundleId`, `backend`, `status`, `remoteKey`, and `remoteUrl` are used consistently across store, runtime, server, UI, smoke, and docs

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-19-witness-remote-package-delivery.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
