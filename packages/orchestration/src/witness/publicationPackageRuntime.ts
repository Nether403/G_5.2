import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import type { PublicationBundleRecord } from "../../../witness-types/src/publicationBundle";
import type { PublicationPackageRecord } from "../../../witness-types/src/publicationPackage";
import type { FileWitnessPublicationBundleStore } from "./fileDraftStores";
import type { FileWitnessPublicationPackageStore } from "./filePublicationPackageStore";
import {
  publicationExportsRoot,
  publicationPackagesRoot,
  resolvePublicationPathWithinRoot,
} from "./publicationPaths";

interface YazlZipFileLike {
  addBuffer(
    buffer: Buffer,
    metadataPath: string,
    options?: {
      compress?: boolean;
      mode?: number;
      mtime?: Date;
    }
  ): void;
  end(options?: { forceZip64Format?: boolean }): void;
  outputStream: NodeJS.ReadableStream;
}

type YazlModuleLike = {
  ZipFile: new () => YazlZipFileLike;
};

const require = createRequire(import.meta.url);
const yazl = require("yazl") as YazlModuleLike;

const ZIP_ENTRY_MTIME = new Date("2000-01-01T00:00:00.000Z");
const ZIP_ENTRY_MODE = 0o100644;

export interface CreateWitnessPublicationPackageInput {
  publicationBundleRoot: string;
  bundleId: string;
  publicationBundleStore: FileWitnessPublicationBundleStore;
  publicationPackageStore: FileWitnessPublicationPackageStore;
}

function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function sanitizeFilenameComponent(input: string): string {
  return input.replace(/[^A-Za-z0-9_-]/g, "-");
}

function deterministicPackageFilename(bundle: PublicationBundleRecord): string {
  return `${sanitizeFilenameComponent(bundle.id)}--${sanitizeFilenameComponent(bundle.createdAt)}.zip`;
}

async function loadPublicationBundleOrThrow(
  publicationBundleStore: FileWitnessPublicationBundleStore,
  bundleId: string
): Promise<PublicationBundleRecord> {
  const bundle = await publicationBundleStore.load(bundleId);
  if (!bundle) {
    throw new Error(`Unknown publication bundle: ${bundleId}`);
  }
  return bundle;
}

async function validateSourceBundlePaths(
  publicationBundleRoot: string,
  bundle: PublicationBundleRecord
): Promise<{
  bundleJsonPath: string;
  bundleMarkdownPath: string;
  bundleManifestPath: string;
}> {
  if (!bundle.bundleMarkdownPath) {
    throw new Error(
      "Witness publication package creation requires a source bundle markdown path."
    );
  }

  const exportsRoot = publicationExportsRoot(publicationBundleRoot);
  return {
    bundleJsonPath: await resolvePublicationPathWithinRoot(
      exportsRoot,
      bundle.bundleJsonPath,
      "Publication bundle JSON path"
    ),
    bundleMarkdownPath: await resolvePublicationPathWithinRoot(
      exportsRoot,
      bundle.bundleMarkdownPath,
      "Publication bundle Markdown path"
    ),
    bundleManifestPath: await resolvePublicationPathWithinRoot(
      exportsRoot,
      bundle.bundleManifestPath,
      "Publication bundle manifest path"
    ),
  };
}

async function writeDeterministicZip(
  packagePath: string,
  entries: Array<{ name: string; bytes: Buffer }>
): Promise<void> {
  const zipFile = new yazl.ZipFile();

  for (const entry of entries) {
    zipFile.addBuffer(entry.bytes, entry.name, {
      compress: false,
      mode: ZIP_ENTRY_MODE,
      mtime: ZIP_ENTRY_MTIME,
    });
  }

  await new Promise<void>((resolve, reject) => {
    const output = zipFile.outputStream.pipe(
      require("node:fs").createWriteStream(packagePath)
    );

    output.once("close", resolve);
    output.once("error", reject);
    zipFile.outputStream.once("error", reject);
    zipFile.end();
  });
}

function buildReadme(bundle: PublicationBundleRecord): string {
  return [
    "Witness publication package",
    "",
    `Bundle ID: ${bundle.id}`,
    `Witness ID: ${bundle.witnessId}`,
    `Testimony ID: ${bundle.testimonyId}`,
    `Archive Candidate ID: ${bundle.archiveCandidateId}`,
    `Bundle Created At: ${bundle.createdAt}`,
    "",
    "Files:",
    "- bundle.json",
    "- bundle.md",
    "- manifest.json",
    "",
  ].join("\n");
}

async function reuseExistingPackageIfPresent(
  publicationBundleRoot: string,
  publicationPackageStore: FileWitnessPublicationPackageStore,
  bundleId: string
): Promise<PublicationPackageRecord | null> {
  const existingPackage = await publicationPackageStore.findByBundleId(bundleId);
  if (!existingPackage) {
    return null;
  }

  await resolvePublicationPathWithinRoot(
    publicationPackagesRoot(publicationBundleRoot),
    existingPackage.packagePath,
    "Publication package path"
  );
  return existingPackage;
}

export async function createWitnessPublicationPackage(
  input: CreateWitnessPublicationPackageInput
): Promise<PublicationPackageRecord> {
  const existingPackage = await reuseExistingPackageIfPresent(
    input.publicationBundleRoot,
    input.publicationPackageStore,
    input.bundleId
  );
  if (existingPackage) {
    return existingPackage;
  }

  const bundle = await loadPublicationBundleOrThrow(
    input.publicationBundleStore,
    input.bundleId
  );
  const validatedPaths = await validateSourceBundlePaths(
    input.publicationBundleRoot,
    bundle
  );

  const [bundleJsonBody, bundleMarkdownBody, bundleManifestBody] =
    await Promise.all([
      readFile(validatedPaths.bundleJsonPath),
      readFile(validatedPaths.bundleMarkdownPath),
      readFile(validatedPaths.bundleManifestPath),
    ]);

  const packagesRoot = publicationPackagesRoot(input.publicationBundleRoot);
  await mkdir(packagesRoot, { recursive: true });

  const packageFilename = deterministicPackageFilename(bundle);
  const packagePath = path.join(packagesRoot, packageFilename);

  try {
    await writeDeterministicZip(packagePath, [
      { name: "README.txt", bytes: Buffer.from(buildReadme(bundle), "utf8") },
      { name: "bundle.json", bytes: bundleJsonBody },
      { name: "bundle.md", bytes: bundleMarkdownBody },
      { name: "manifest.json", bytes: bundleManifestBody },
    ]);

    const packageBytes = await readFile(packagePath);
    await resolvePublicationPathWithinRoot(
      packagesRoot,
      packagePath,
      "Publication package path"
    );

    return await input.publicationPackageStore.create({
      bundleId: bundle.id,
      witnessId: bundle.witnessId,
      testimonyId: bundle.testimonyId,
      archiveCandidateId: bundle.archiveCandidateId,
      createdAt: new Date().toISOString(),
      packagePath,
      packageFilename,
      packageSha256: sha256(packageBytes),
      packageByteSize: packageBytes.byteLength,
      sourceBundleJsonPath: validatedPaths.bundleJsonPath,
      sourceBundleMarkdownPath: validatedPaths.bundleMarkdownPath,
      sourceBundleManifestPath: validatedPaths.bundleManifestPath,
    });
  } catch (error) {
    await Promise.allSettled([rm(packagePath, { force: true })]);
    throw error;
  }
}
