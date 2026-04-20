import type { PublicationDeliveryBackend } from "../../../witness-types/src/publicationDelivery";
import type { PublicationDeliveryJobRecord } from "../../../witness-types/src/publicationDeliveryJob";
import type { FileWitnessPublicationDeliveryJobStore } from "./filePublicationDeliveryJobStore";
import type { FileWitnessPublicationDeliveryStore } from "./filePublicationDeliveryStore";
import type { FileWitnessPublicationPackageStore } from "./filePublicationPackageStore";
import type { ObjectDeliveryBackend } from "./objectDelivery";
import { deliverWitnessPublicationPackage } from "./publicationDeliveryRuntime";

export async function enqueueWitnessPublicationDeliveryJob(input: {
  packageId: string;
  packageStore: FileWitnessPublicationPackageStore;
  jobStore: FileWitnessPublicationDeliveryJobStore;
  backend: PublicationDeliveryBackend;
}): Promise<PublicationDeliveryJobRecord> {
  const packageRecord = await input.packageStore.load(input.packageId);
  if (!packageRecord) {
    throw new Error(`Unknown publication package: ${input.packageId}`);
  }

  return input.jobStore.create({
    packageId: packageRecord.id,
    bundleId: packageRecord.bundleId,
    witnessId: packageRecord.witnessId,
    testimonyId: packageRecord.testimonyId,
    backend: input.backend,
    createdAt: new Date().toISOString(),
  });
}

export async function reconcileInProgressWitnessDeliveryJobs(
  jobStore: FileWitnessPublicationDeliveryJobStore
): Promise<void> {
  const recoveredAt = new Date().toISOString();
  const inProgressJobs = await jobStore.list({ status: "in_progress" });

  await Promise.all(
    inProgressJobs.map((job) =>
      jobStore.save({
        ...job,
        status: "failed",
        updatedAt: recoveredAt,
        error: "Recovered from interrupted in-progress delivery",
        recoveredFromRestartAt: recoveredAt,
      })
    )
  );
}

export async function processNextWitnessPublicationDeliveryJob(input: {
  publicationBundleRoot: string;
  packageStore: FileWitnessPublicationPackageStore;
  jobStore: FileWitnessPublicationDeliveryJobStore;
  deliveryStore: FileWitnessPublicationDeliveryStore;
  backend: ObjectDeliveryBackend;
}): Promise<PublicationDeliveryJobRecord | null> {
  const next = await input.jobStore.findOldestQueued();
  if (!next) {
    return null;
  }

  const inProgress = await input.jobStore.save({
    ...next,
    status: "in_progress",
    updatedAt: new Date().toISOString(),
    error: undefined,
  });

  try {
    const attempt = await deliverWitnessPublicationPackage({
      publicationBundleRoot: input.publicationBundleRoot,
      packageId: inProgress.packageId,
      packageStore: input.packageStore,
      deliveryStore: input.deliveryStore,
      backend: input.backend,
    });

    return await input.jobStore.save({
      ...inProgress,
      status: attempt.status === "succeeded" ? "succeeded" : "failed",
      updatedAt: new Date().toISOString(),
      lastAttemptId: attempt.id,
      error: attempt.error,
    });
  } catch (error) {
    return await input.jobStore.save({
      ...inProgress,
      status: "failed",
      updatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function retryWitnessPublicationDeliveryJob(input: {
  jobId: string;
  jobStore: FileWitnessPublicationDeliveryJobStore;
}): Promise<PublicationDeliveryJobRecord> {
  const job = await input.jobStore.load(input.jobId);
  if (!job) {
    throw new Error(`Unknown publication delivery job: ${input.jobId}`);
  }
  if (job.status !== "failed") {
    throw new Error("Only failed publication delivery jobs may be retried.");
  }

  return input.jobStore.create({
    packageId: job.packageId,
    bundleId: job.bundleId,
    witnessId: job.witnessId,
    testimonyId: job.testimonyId,
    backend: job.backend,
    createdAt: new Date().toISOString(),
  });
}
