import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { FileWitnessPublicationDeliveryJobStore } from "./filePublicationDeliveryJobStore";
import { FileWitnessPublicationDeliveryStore } from "./filePublicationDeliveryStore";
import { FileWitnessPublicationPackageStore } from "./filePublicationPackageStore";
import {
  enqueueWitnessPublicationDeliveryJob,
  processNextWitnessPublicationDeliveryJob,
  reconcileInProgressWitnessDeliveryJobs,
  retryWitnessPublicationDeliveryJob,
} from "./publicationDeliveryQueue";

class FakeObjectDeliveryBackend {
  readonly name = "azure-blob" as const;

  constructor(private readonly remoteRoot: string) {}

  async putObject(input: {
    key: string;
    filePath: string;
    contentType: string;
    metadata?: Record<string, string>;
  }) {
    const targetPath = path.join(
      this.remoteRoot,
      input.key.replaceAll("/", path.sep)
    );
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, await readFile(input.filePath));

    return {
      remoteKey: input.key,
      remoteUrl: `file://${targetPath.replaceAll("\\", "/")}`,
    };
  }
}

class ThrowingObjectDeliveryBackend {
  readonly name = "azure-blob" as const;

  async putObject(): Promise<never> {
    throw new Error("simulated queued upload failure");
  }
}

test("queued delivery processing claims one queued job and marks it succeeded", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-delivery-queue-")
  );

  try {
    const publicationBundleRoot = path.join(root, "publication-bundles");
    const packagesRoot = path.join(publicationBundleRoot, "packages");
    const remoteRoot = path.join(root, "remote");
    await mkdir(packagesRoot, { recursive: true });

    const packagePath = path.join(packagesRoot, "bundle-1.zip");
    await writeFile(packagePath, Buffer.from("package-bytes"));

    const packageStore = new FileWitnessPublicationPackageStore(
      publicationBundleRoot
    );
    const jobStore = new FileWitnessPublicationDeliveryJobStore(
      publicationBundleRoot
    );
    const deliveryStore = new FileWitnessPublicationDeliveryStore(
      publicationBundleRoot
    );

    const packageRecord = await packageStore.create({
      id: "bundle-1",
      bundleId: "bundle-1",
      witnessId: "wit-1",
      testimonyId: "testimony-1",
      archiveCandidateId: "candidate-1",
      createdAt: "2026-04-20T09:00:00.000Z",
      packagePath,
      packageFilename: "bundle-1.zip",
      packageSha256: "1".repeat(64),
      packageByteSize: 13,
      sourceBundleJsonPath: "bundle.json",
      sourceBundleMarkdownPath: "bundle.md",
      sourceBundleManifestPath: "manifest.json",
    });

    const queued = await enqueueWitnessPublicationDeliveryJob({
      packageId: packageRecord.id,
      packageStore,
      jobStore,
      backend: "azure-blob",
    });

    const processed = await processNextWitnessPublicationDeliveryJob({
      publicationBundleRoot,
      packageStore,
      jobStore,
      deliveryStore,
      backend: new FakeObjectDeliveryBackend(remoteRoot),
    });

    assert.equal(processed?.id, queued.id);
    assert.equal(processed?.status, "succeeded");
    assert.ok(processed?.lastAttemptId);
    assert.equal(
      (await deliveryStore.list({ packageId: packageRecord.id })).length,
      1
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("startup reconciliation converts stale in-progress jobs to failed", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-delivery-reconcile-")
  );

  try {
    const store = new FileWitnessPublicationDeliveryJobStore(root);
    const job = await store.create({
      packageId: "bundle-1",
      bundleId: "bundle-1",
      witnessId: "wit-1",
      testimonyId: "testimony-1",
      backend: "azure-blob",
      createdAt: "2026-04-20T09:10:00.000Z",
    });
    await store.save({
      ...job,
      status: "in_progress",
      updatedAt: "2026-04-20T09:11:00.000Z",
    });

    await reconcileInProgressWitnessDeliveryJobs(store);

    const updated = await store.load(job.id);
    assert.equal(updated?.status, "failed");
    assert.match(
      updated?.error ?? "",
      /Recovered from interrupted in-progress delivery/
    );
    assert.ok(updated?.recoveredFromRestartAt);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("queued delivery processing marks the job failed when upload fails", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-delivery-queue-failure-")
  );

  try {
    const publicationBundleRoot = path.join(root, "publication-bundles");
    const packagesRoot = path.join(publicationBundleRoot, "packages");
    await mkdir(packagesRoot, { recursive: true });

    const packagePath = path.join(packagesRoot, "bundle-fail.zip");
    await writeFile(packagePath, Buffer.from("package-bytes"));

    const packageStore = new FileWitnessPublicationPackageStore(
      publicationBundleRoot
    );
    const jobStore = new FileWitnessPublicationDeliveryJobStore(
      publicationBundleRoot
    );
    const deliveryStore = new FileWitnessPublicationDeliveryStore(
      publicationBundleRoot
    );

    const packageRecord = await packageStore.create({
      id: "bundle-fail",
      bundleId: "bundle-fail",
      witnessId: "wit-fail",
      testimonyId: "testimony-fail",
      archiveCandidateId: "candidate-fail",
      createdAt: "2026-04-20T09:20:00.000Z",
      packagePath,
      packageFilename: "bundle-fail.zip",
      packageSha256: "f".repeat(64),
      packageByteSize: 13,
      sourceBundleJsonPath: "bundle.json",
      sourceBundleMarkdownPath: "bundle.md",
      sourceBundleManifestPath: "manifest.json",
    });

    const queued = await enqueueWitnessPublicationDeliveryJob({
      packageId: packageRecord.id,
      packageStore,
      jobStore,
      backend: "azure-blob",
    });

    const processed = await processNextWitnessPublicationDeliveryJob({
      publicationBundleRoot,
      packageStore,
      jobStore,
      deliveryStore,
      backend: new ThrowingObjectDeliveryBackend(),
    });

    assert.equal(processed?.id, queued.id);
    assert.equal(processed?.status, "failed");
    assert.match(processed?.error ?? "", /simulated queued upload failure/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retryWitnessPublicationDeliveryJob creates a new queued job from a failed job", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-delivery-retry-")
  );

  try {
    const store = new FileWitnessPublicationDeliveryJobStore(root);
    const failed = await store.create({
      packageId: "bundle-1",
      bundleId: "bundle-1",
      witnessId: "wit-1",
      testimonyId: "testimony-1",
      backend: "azure-blob",
      createdAt: "2026-04-20T09:30:00.000Z",
    });
    await store.save({
      ...failed,
      status: "failed",
      updatedAt: "2026-04-20T09:31:00.000Z",
      error: "previous failure",
    });

    const retried = await retryWitnessPublicationDeliveryJob({
      jobId: failed.id,
      jobStore: store,
    });

    assert.notEqual(retried.id, failed.id);
    assert.equal(retried.status, "queued");
    assert.equal(retried.packageId, failed.packageId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
