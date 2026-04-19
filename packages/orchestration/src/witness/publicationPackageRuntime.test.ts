import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire, syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile, readdir } from "node:fs/promises";

import { FileWitnessPublicationBundleStore } from "./fileDraftStores";
import { FileWitnessPublicationPackageStore } from "./filePublicationPackageStore";
import { createWitnessPublicationPackage } from "./publicationPackageRuntime";
import { resolvePublicationPathWithinRoot } from "./publicationPaths";

interface YauzlEntryLike {
  fileName: string;
}

interface YauzlZipFileLike {
  readEntry(): void;
  openReadStream(
    entry: YauzlEntryLike,
    callback: (
      error: Error | null,
      stream: NodeJS.ReadableStream | null
    ) => void
  ): void;
  close(): void;
  on(event: "entry", listener: (entry: YauzlEntryLike) => void): this;
  once(event: "end" | "error", listener: (error?: Error) => void): this;
}

type YauzlModuleLike = {
  open(
    path: string,
    options: { lazyEntries: boolean },
    callback: (error: Error | null, zipFile: YauzlZipFileLike | undefined) => void
  ): void;
};

const require = createRequire(import.meta.url);
const yauzl = require("yauzl") as YauzlModuleLike;

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function openZip(zipPath: string): Promise<YauzlZipFileLike> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zipFile) => {
      if (error) {
        reject(error);
        return;
      }
      if (!zipFile) {
        reject(new Error(`Unable to open zip archive: ${zipPath}`));
        return;
      }
      resolve(zipFile);
    });
  });
}

async function readZipEntries(zipPath: string): Promise<
  Array<{ fileName: string; bytes: Buffer }>
> {
  const zipFile = await openZip(zipPath);

  return new Promise((resolve, reject) => {
    const entries: Array<{ fileName: string; bytes: Buffer }> = [];

    zipFile.on("entry", (entry) => {
      zipFile.openReadStream(entry, (streamError, stream) => {
        if (streamError) {
          zipFile.close();
          reject(streamError);
          return;
        }
        if (!stream) {
          zipFile.close();
          reject(new Error(`Missing read stream for zip entry ${entry.fileName}`));
          return;
        }

        const chunks: Buffer[] = [];
        stream.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        stream.on("error", (error) => {
          zipFile.close();
          reject(error);
        });
        stream.on("end", () => {
          entries.push({
            fileName: entry.fileName,
            bytes: Buffer.concat(chunks),
          });
          zipFile.readEntry();
        });
      });
    });

    zipFile.once("end", () => {
      zipFile.close();
      resolve(entries);
    });
    zipFile.once("error", (error) => {
      zipFile.close();
      reject(error);
    });

    zipFile.readEntry();
  });
}

class ThrowingPublicationPackageStore extends FileWitnessPublicationPackageStore {
  override async create(
    _input: Parameters<FileWitnessPublicationPackageStore["create"]>[0]
  ): Promise<never> {
    throw new Error("simulated publication package store failure");
  }
}

async function seedPublicationBundleFixture(
  root: string,
  input: {
    bundleId: string;
    witnessId?: string;
    testimonyId?: string;
    archiveCandidateId?: string;
    createdAt: string;
    jsonBody?: string;
    markdownBody?: string;
    manifestBody?: string;
  }
) {
  const publicationBundleRoot = path.join(root, "publication-bundles");
  const exportsRoot = path.join(publicationBundleRoot, "exports");
  const publicationBundleStore = new FileWitnessPublicationBundleStore(
    publicationBundleRoot
  );
  const publicationPackageStore = new FileWitnessPublicationPackageStore(
    publicationBundleRoot
  );
  await mkdir(exportsRoot, { recursive: true });

  const bundleJsonPath = path.join(exportsRoot, `${input.bundleId}.json`);
  const bundleMarkdownPath = path.join(exportsRoot, `${input.bundleId}.md`);
  const bundleManifestPath = path.join(
    exportsRoot,
    `${input.bundleId}-manifest.json`
  );

  await writeFile(
    bundleJsonPath,
    input.jsonBody ??
      `${JSON.stringify({ bundleId: input.bundleId, ok: true }, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    bundleMarkdownPath,
    input.markdownBody ?? "# Bundle 1\n\nDeterministic markdown body.\n",
    "utf8"
  );
  await writeFile(
    bundleManifestPath,
    input.manifestBody ??
      `${JSON.stringify(
        {
          schemaVersion: "0.1.0",
          bundleId: input.bundleId,
          createdAt: input.createdAt,
        },
        null,
        2
      )}\n`,
    "utf8"
  );

  const bundle = await publicationBundleStore.create({
    id: input.bundleId,
    witnessId: input.witnessId ?? "witness-1",
    testimonyId: input.testimonyId ?? "testimony-1",
    archiveCandidateId: input.archiveCandidateId ?? "candidate-1",
    sourceTestimonyUpdatedAt: "2026-04-19T16:00:30.000Z",
    sourceSynthesisId: "synthesis-1",
    sourceAnnotationId: "annotation-1",
    createdAt: input.createdAt,
    bundleJsonPath,
    bundleMarkdownPath,
    bundleManifestPath,
  });

  return {
    publicationBundleRoot,
    publicationBundleStore,
    publicationPackageStore,
    bundle,
  };
}

test("PublicationPackage createWitnessPublicationPackage creates byte-identical fresh archives for equivalent bundles", async () => {
  const rootA = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-package-deterministic-a-")
  );
  const rootB = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-package-deterministic-b-")
  );

  try {
    const fixtureA = await seedPublicationBundleFixture(rootA, {
      bundleId: "bundle-1",
      createdAt: "2026-04-19T16:01:00.000Z",
    });
    const fixtureB = await seedPublicationBundleFixture(rootB, {
      bundleId: "bundle-1",
      createdAt: "2026-04-19T16:01:00.000Z",
    });

    const packageA = await createWitnessPublicationPackage({
      publicationBundleRoot: fixtureA.publicationBundleRoot,
      bundleId: fixtureA.bundle.id,
      publicationBundleStore: fixtureA.publicationBundleStore,
      publicationPackageStore: fixtureA.publicationPackageStore,
    });
    const packageB = await createWitnessPublicationPackage({
      publicationBundleRoot: fixtureB.publicationBundleRoot,
      bundleId: fixtureB.bundle.id,
      publicationBundleStore: fixtureB.publicationBundleStore,
      publicationPackageStore: fixtureB.publicationPackageStore,
    });

    const packageBytesA = await readFile(packageA.packagePath);
    const packageBytesB = await readFile(packageB.packagePath);

    assert.equal(packageA.packageSha256, packageB.packageSha256);
    assert.equal(packageA.packageByteSize, packageB.packageByteSize);
    assert.deepEqual(packageBytesA, packageBytesB);
  } finally {
    await Promise.all([
      rm(rootA, { recursive: true, force: true }),
      rm(rootB, { recursive: true, force: true }),
    ]);
  }
});

test("PublicationPackage createWitnessPublicationPackage creates a deterministic zip and reuses it for the same bundle", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-package-runtime-")
  );

  try {
    const fixture = await seedPublicationBundleFixture(root, {
      bundleId: "bundle-1",
      createdAt: "2026-04-19T16:01:00.000Z",
    });

    const firstPackage = await createWitnessPublicationPackage({
      publicationBundleRoot: fixture.publicationBundleRoot,
      bundleId: fixture.bundle.id,
      publicationBundleStore: fixture.publicationBundleStore,
      publicationPackageStore: fixture.publicationPackageStore,
    });
    const secondPackage = await createWitnessPublicationPackage({
      publicationBundleRoot: fixture.publicationBundleRoot,
      bundleId: fixture.bundle.id,
      publicationBundleStore: fixture.publicationBundleStore,
      publicationPackageStore: fixture.publicationPackageStore,
    });

    assert.equal(
      firstPackage.packageFilename,
      "bundle-1--2026-04-19T16-01-00-000Z.zip"
    );
    assert.equal(secondPackage.id, firstPackage.id);
    assert.equal(secondPackage.packageSha256, firstPackage.packageSha256);
    assert.equal(secondPackage.packageByteSize, firstPackage.packageByteSize);
    assert.equal(secondPackage.packagePath, firstPackage.packagePath);

    const packageBytes = await readFile(firstPackage.packagePath);
    const zipEntries = await readZipEntries(firstPackage.packagePath);

    assert.deepEqual(
      zipEntries.map((entry) => entry.fileName),
      ["README.txt", "bundle.json", "bundle.md", "manifest.json"]
    );
    assert.equal(firstPackage.packageSha256, sha256(packageBytes));
    assert.equal(firstPackage.packageByteSize, packageBytes.byteLength);

    const [readmeEntry, bundleJsonEntry, bundleMarkdownEntry, manifestEntry] =
      zipEntries;
    assert.match(readmeEntry.bytes.toString("utf8"), /bundle-1/);
    assert.equal(
      bundleJsonEntry.bytes.toString("utf8"),
      await readFile(fixture.bundle.bundleJsonPath, "utf8")
    );
    assert.equal(
      bundleMarkdownEntry.bytes.toString("utf8"),
      await readFile(fixture.bundle.bundleMarkdownPath as string, "utf8")
    );
    assert.equal(
      manifestEntry.bytes.toString("utf8"),
      await readFile(fixture.bundle.bundleManifestPath, "utf8")
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PublicationPaths resolvePublicationPathWithinRoot returns canonical paths inside the root", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-paths-inside-")
  );

  try {
    const nestedPath = path.join(root, "exports", "bundle.json");
    await mkdir(path.dirname(nestedPath), { recursive: true });
    await writeFile(nestedPath, "{}\n", "utf8");

    assert.equal(
      await resolvePublicationPathWithinRoot(root, nestedPath, "Nested path"),
      nestedPath
    );
    assert.equal(
      await resolvePublicationPathWithinRoot(root, root, "Root path"),
      root
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PublicationPaths resolvePublicationPathWithinRoot rejects paths that escape the root", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-paths-escape-root-")
  );
  const outsideRoot = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-paths-escape-outside-")
  );

  try {
    const outsidePath = path.join(outsideRoot, "outside.json");
    await writeFile(outsidePath, "{}\n", "utf8");

    await assert.rejects(
      () =>
        resolvePublicationPathWithinRoot(root, outsidePath, "Outside path"),
      /Outside path must resolve within/i
    );
  } finally {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(outsideRoot, { recursive: true, force: true }),
    ]);
  }
});

test("PublicationPaths resolvePublicationPathWithinRoot surfaces missing targets", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-paths-missing-")
  );

  try {
    await assert.rejects(
      () =>
        resolvePublicationPathWithinRoot(
          root,
          path.join(root, "missing.json"),
          "Missing path"
        ),
      /ENOENT/i
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PublicationPackage createWitnessPublicationPackage rolls back a partial zip when package store persistence fails", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-package-rollback-")
  );

  try {
    const publicationBundleRoot = path.join(root, "publication-bundles");
    const exportsRoot = path.join(publicationBundleRoot, "exports");
    const publicationBundleStore = new FileWitnessPublicationBundleStore(
      publicationBundleRoot
    );
    const publicationPackageStore = new ThrowingPublicationPackageStore(
      publicationBundleRoot
    );
    await mkdir(exportsRoot, { recursive: true });

    await writeFile(
      path.join(exportsRoot, "bundle-rollback.json"),
      "{}\n",
      "utf8"
    );
    await writeFile(
      path.join(exportsRoot, "bundle-rollback.md"),
      "# Rollback\n",
      "utf8"
    );
    await writeFile(
      path.join(exportsRoot, "bundle-rollback-manifest.json"),
      "{}\n",
      "utf8"
    );

    await publicationBundleStore.create({
      id: "bundle-rollback",
      witnessId: "witness-rollback",
      testimonyId: "testimony-rollback",
      archiveCandidateId: "candidate-rollback",
      sourceTestimonyUpdatedAt: "2026-04-19T16:10:00.000Z",
      sourceSynthesisId: "synthesis-rollback",
      sourceAnnotationId: "annotation-rollback",
      createdAt: "2026-04-19T16:11:00.000Z",
      bundleJsonPath: path.join(exportsRoot, "bundle-rollback.json"),
      bundleMarkdownPath: path.join(exportsRoot, "bundle-rollback.md"),
      bundleManifestPath: path.join(
        exportsRoot,
        "bundle-rollback-manifest.json"
      ),
    });

    await assert.rejects(
      () =>
        createWitnessPublicationPackage({
          publicationBundleRoot,
          bundleId: "bundle-rollback",
          publicationBundleStore,
          publicationPackageStore,
        }),
      /simulated publication package store failure/i
    );

    const packagesRoot = path.join(publicationBundleRoot, "packages");
    assert.deepEqual(await readdir(packagesRoot), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PublicationPackage createWitnessPublicationPackage preserves the original error when rollback cleanup fails", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-witness-publication-package-cleanup-error-")
  );
  const fsPromises = require("node:fs/promises") as {
    rm: typeof rm;
  };
  const originalRm = fsPromises.rm;

  try {
    const fixture = await seedPublicationBundleFixture(root, {
      bundleId: "bundle-cleanup-error",
      createdAt: "2026-04-19T16:21:00.000Z",
    });
    const publicationPackageStore = new ThrowingPublicationPackageStore(
      fixture.publicationBundleRoot
    );

    fsPromises.rm = (async () => {
      throw new Error("simulated cleanup failure");
    }) as typeof rm;
    syncBuiltinESMExports();

    await assert.rejects(
      () =>
        createWitnessPublicationPackage({
          publicationBundleRoot: fixture.publicationBundleRoot,
          bundleId: fixture.bundle.id,
          publicationBundleStore: fixture.publicationBundleStore,
          publicationPackageStore,
        }),
      /simulated publication package store failure/i
    );
  } finally {
    fsPromises.rm = originalRm;
    syncBuiltinESMExports();
    await rm(root, { recursive: true, force: true });
  }
});
