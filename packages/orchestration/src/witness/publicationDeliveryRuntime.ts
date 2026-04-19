import type { PublicationDeliveryRecord } from "../../../witness-types/src/publicationDelivery";
import type { FileWitnessPublicationDeliveryStore } from "./filePublicationDeliveryStore";
import type { FileWitnessPublicationPackageStore } from "./filePublicationPackageStore";
import type { ObjectDeliveryBackend } from "./objectDelivery";
import {
  publicationPackagesRoot,
  resolvePublicationPathWithinRoot,
} from "./publicationPaths";

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

async function loadPackageOrThrow(
  packageStore: FileWitnessPublicationPackageStore,
  packageId: string
) {
  const packageRecord = await packageStore.load(packageId);
  if (!packageRecord) {
    throw new Error(`Unknown publication package: ${packageId}`);
  }
  return packageRecord;
}

async function createDeliveryRecord(
  deliveryStore: FileWitnessPublicationDeliveryStore,
  input: {
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
): Promise<PublicationDeliveryRecord> {
  return await deliveryStore.create(input);
}

export async function deliverWitnessPublicationPackage(
  input: DeliverWitnessPublicationPackageInput
): Promise<PublicationDeliveryRecord> {
  const packageRecord = await loadPackageOrThrow(input.packageStore, input.packageId);
  const packagePath = await resolvePublicationPathWithinRoot(
    publicationPackagesRoot(input.publicationBundleRoot),
    packageRecord.packagePath,
    "Publication package path"
  );

  const createdAt = new Date().toISOString();
  const remoteKey = buildRemoteKey(packageRecord);
  let uploaded:
    | {
        remoteKey: string;
        remoteUrl?: string;
      }
    | undefined;

  try {
    uploaded = await input.backend.putObject({
      key: remoteKey,
      filePath: packagePath,
      contentType: "application/zip",
      metadata: {
        packageId: packageRecord.id,
        bundleId: packageRecord.bundleId,
      },
    });
  } catch (error) {
    return await createDeliveryRecord(input.deliveryStore, {
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

  return await createDeliveryRecord(input.deliveryStore, {
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
}
