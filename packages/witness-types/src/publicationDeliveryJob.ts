import type { PublicationDeliveryBackend } from "./publicationDelivery";

export type PublicationDeliveryJobStatus =
  | "queued"
  | "in_progress"
  | "succeeded"
  | "failed";

export interface PublicationDeliveryJobRecord {
  id: string;
  packageId: string;
  bundleId: string;
  witnessId: string;
  testimonyId: string;
  backend: PublicationDeliveryBackend;
  status: PublicationDeliveryJobStatus;
  createdAt: string;
  updatedAt: string;
  queueOrder?: string;
  lastAttemptId?: string;
  error?: string;
  recoveredFromRestartAt?: string;
}

export class PublicationDeliveryJobAlreadyExistsError extends Error {
  constructor(jobId: string) {
    super(`Publication delivery job "${jobId}" already exists.`);
    this.name = "PublicationDeliveryJobAlreadyExistsError";
  }
}

export interface PublicationDeliveryJobStore {
  load(jobId: string): Promise<PublicationDeliveryJobRecord | null>;
  list(filters?: {
    packageId?: string;
    bundleId?: string;
    witnessId?: string;
    testimonyId?: string;
    status?: PublicationDeliveryJobStatus;
  }): Promise<PublicationDeliveryJobRecord[]>;
  save(
    record: PublicationDeliveryJobRecord
  ): Promise<PublicationDeliveryJobRecord>;
  delete(jobId: string): Promise<boolean>;
}
