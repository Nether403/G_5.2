import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { FileWitnessPublicationDeliveryStore } from "./filePublicationDeliveryStore";
import { FileWitnessPublicationPackageStore } from "./filePublicationPackageStore";
import { deliverWitnessPublicationPackage } from "./publicationDeliveryRuntime";

class FakeObjectDeliveryBackend {
  readonly name = "azure-blob" as const;

  readonly calls: Array<{
    key: string;
    filePath: string;
    contentType: string;
    metadata?: Record<string, string>;
  }> = [];

  constructor(private readonly remoteRoot: string) {}

  async putObject(input: {
    key: string;
    filePath: string;
    contentType: string;
    metadata?: Record<string, string>;
  }) {
    this.calls.push(input);

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
    throw new Error("simulated remote upload failure");
  }
}

async function seedPublicationPackageFixture(
  root: string,
  input: {
    packageId: string;
    bundleId?: string;
    witnessId?: string;
    testimonyId?: string;
    packageFilename: string;
    packageBytes?: Buffer;
    packagePath?: string;
    createdAt: string;
  }
) {
  const publicationBundleRoot = path.join(root, "publication-bundles");
  const packagesRoot = path.join(publicationBundleRoot, "packages");
  await mkdir(packagesRoot, { recursive: true });

  const packagePath =
    input.packagePath ?? path.join(packagesRoot, input.packageFilename);
  const packageBytes = input.packageBytes ?? Buffer.from("package-bytes");
  await mkdir(path.dirname(packagePath), { recursive: true });
  await writeFile(packagePath, packageBytes);

  const packageStore = new FileWitnessPublicationPackageStore(
    publicationBundleRoot
  );
  const deliveryStore = new FileWitnessPublicationDeliveryStore(
    publicationBundleRoot
  );
  const packageRecord = await packageStore.create({
    id: input.packageId,
    bundleId: input.bundleId ?? input.packageId,
    witnessId: input.witnessId ?? "wit-1",
    testimonyId: input.testimonyId ?? "testimony-1",
    archiveCandidateId: "candidate-1",
    createdAt: input.createdAt,
    packagePath,
    packageFilename: input.packageFilename,
    packageSha256: "1".repeat(64),
    packageByteSize: packageBytes.byteLength,
    sourceBundleJsonPath: "bundle.json",
    sourceBundleMarkdownPath: "bundle.md",
    sourceBundleManifestPath: "manifest.json",
  });

  return {
    publicationBundleRoot,
    packagesRoot,
    packageStore,
    deliveryStore,
    packageRecord,
    packageBytes,
  };
}

test("PublicationDelivery deliverWitnessPublicationPackage uploads the existing package unchanged and persists a succeeded delivery record", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-delivery-runtime-")
  );

  try {
    const remoteRoot = path.join(root, "remote");
    const fixture = await seedPublicationPackageFixture(root, {
      packageId: "bundle-1",
      packageFilename: "bundle-1--2026-04-19T22-00-00-000Z.zip",
      createdAt: "2026-04-19T22:00:00.000Z",
    });
    const backend = new FakeObjectDeliveryBackend(remoteRoot);

    const result = await deliverWitnessPublicationPackage({
      publicationBundleRoot: fixture.publicationBundleRoot,
      packageId: fixture.packageRecord.id,
      packageStore: fixture.packageStore,
      deliveryStore: fixture.deliveryStore,
      backend,
    });

    assert.equal(result.status, "succeeded");
    assert.equal(result.packageId, fixture.packageRecord.id);
    assert.equal(result.backend, "azure-blob");
    assert.equal(
      result.remoteKey,
      "witness/wit-1/testimony/testimony-1/packages/bundle-1--2026-04-19T22-00-00-000Z.zip"
    );
    assert.match(result.remoteUrl ?? "", /^file:\/\//);
    assert.equal(backend.calls.length, 1);
    assert.deepEqual(backend.calls[0], {
      key: result.remoteKey,
      filePath: fixture.packageRecord.packagePath,
      contentType: "application/zip",
      metadata: {
        packageId: fixture.packageRecord.id,
        bundleId: fixture.packageRecord.bundleId,
      },
    });

    const uploadedBytes = await readFile(
      path.join(remoteRoot, result.remoteKey.replaceAll("/", path.sep))
    );
    const packageBytesAfterDelivery = await readFile(fixture.packageRecord.packagePath);
    assert.deepEqual(uploadedBytes, fixture.packageBytes);
    assert.deepEqual(packageBytesAfterDelivery, fixture.packageBytes);

    const persisted = await fixture.deliveryStore.list({
      packageId: fixture.packageRecord.id,
    });
    assert.equal(persisted.length, 1);
    assert.deepEqual(persisted[0], result);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PublicationDelivery deliverWitnessPublicationPackage persists a failed delivery record when remote upload fails after the attempt starts", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-delivery-failure-")
  );

  try {
    const fixture = await seedPublicationPackageFixture(root, {
      packageId: "bundle-2",
      packageFilename: "bundle-2--2026-04-19T22-05-00-000Z.zip",
      createdAt: "2026-04-19T22:05:00.000Z",
    });

    const result = await deliverWitnessPublicationPackage({
      publicationBundleRoot: fixture.publicationBundleRoot,
      packageId: fixture.packageRecord.id,
      packageStore: fixture.packageStore,
      deliveryStore: fixture.deliveryStore,
      backend: new ThrowingObjectDeliveryBackend(),
    });

    assert.equal(result.status, "failed");
    assert.equal(result.packageId, fixture.packageRecord.id);
    assert.equal(
      result.remoteKey,
      "witness/wit-1/testimony/testimony-1/packages/bundle-2--2026-04-19T22-05-00-000Z.zip"
    );
    assert.match(result.error ?? "", /simulated remote upload failure/i);
    assert.equal(result.remoteUrl, undefined);
    assert.deepEqual(
      await readFile(fixture.packageRecord.packagePath),
      fixture.packageBytes
    );

    const persisted = await fixture.deliveryStore.list({
      packageId: fixture.packageRecord.id,
    });
    assert.equal(persisted.length, 1);
    assert.deepEqual(persisted[0], result);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PublicationDelivery deliverWitnessPublicationPackage rejects package paths outside the canonical packages root without persisting a delivery record", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-delivery-path-escape-")
  );
  const outsideRoot = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-delivery-path-escape-outside-")
  );

  try {
    const outsidePackagePath = path.join(
      outsideRoot,
      "bundle-escape--2026-04-19T22-10-00-000Z.zip"
    );
    const fixture = await seedPublicationPackageFixture(root, {
      packageId: "bundle-escape",
      packageFilename: "bundle-escape--2026-04-19T22-10-00-000Z.zip",
      packagePath: outsidePackagePath,
      createdAt: "2026-04-19T22:10:00.000Z",
    });

    await assert.rejects(
      () =>
        deliverWitnessPublicationPackage({
          publicationBundleRoot: fixture.publicationBundleRoot,
          packageId: fixture.packageRecord.id,
          packageStore: fixture.packageStore,
          deliveryStore: fixture.deliveryStore,
          backend: new ThrowingObjectDeliveryBackend(),
        }),
      /Publication package path must resolve within/i
    );

    assert.deepEqual(await fixture.deliveryStore.list(), []);
  } finally {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(outsideRoot, { recursive: true, force: true }),
    ]);
  }
});
