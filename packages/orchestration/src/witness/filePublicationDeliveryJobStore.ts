import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PublicationDeliveryBackend } from "../../../witness-types/src/publicationDelivery";
import type {
  PublicationDeliveryJobRecord,
  PublicationDeliveryJobStatus,
  PublicationDeliveryJobStore,
} from "../../../witness-types/src/publicationDeliveryJob";

export interface CreatePublicationDeliveryJobInput {
  id?: string;
  packageId: string;
  bundleId: string;
  witnessId: string;
  testimonyId: string;
  backend: PublicationDeliveryBackend;
  createdAt: string;
}

export class FileWitnessPublicationDeliveryJobStore
  implements PublicationDeliveryJobStore
{
  constructor(private readonly rootDir: string) {}

  private compareRecords(
    a: PublicationDeliveryJobRecord,
    b: PublicationDeliveryJobRecord
  ): number {
    return (
      a.createdAt.localeCompare(b.createdAt) ||
      a.updatedAt.localeCompare(b.updatedAt) ||
      a.id.localeCompare(b.id)
    );
  }

  private recordsDir(): string {
    return path.join(this.rootDir, "delivery-jobs");
  }

  private filePath(jobId: string): string {
    return path.join(this.recordsDir(), `${jobId}.json`);
  }

  async load(jobId: string): Promise<PublicationDeliveryJobRecord | null> {
    try {
      const raw = await readFile(this.filePath(jobId), "utf8");
      return JSON.parse(raw) as PublicationDeliveryJobRecord;
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
    status?: PublicationDeliveryJobStatus;
  }): Promise<PublicationDeliveryJobRecord[]> {
    try {
      const files = await readdir(this.recordsDir());
      const records = await Promise.all(
        files
          .filter((file) => file.endsWith(".json"))
          .map(async (file) => {
            const raw = await readFile(path.join(this.recordsDir(), file), "utf8");
            return JSON.parse(raw) as PublicationDeliveryJobRecord;
          })
      );

      return records
        .filter(
          (record) =>
            (!filters?.packageId || record.packageId === filters.packageId) &&
            (!filters?.bundleId || record.bundleId === filters.bundleId) &&
            (!filters?.witnessId || record.witnessId === filters.witnessId) &&
            (!filters?.testimonyId ||
              record.testimonyId === filters.testimonyId) &&
            (!filters?.status || record.status === filters.status)
        )
        .sort((a, b) => this.compareRecords(a, b));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async save(
    record: PublicationDeliveryJobRecord
  ): Promise<PublicationDeliveryJobRecord> {
    await mkdir(this.recordsDir(), { recursive: true });
    await writeFile(
      this.filePath(record.id),
      `${JSON.stringify(record, null, 2)}\n`,
      "utf8"
    );
    return record;
  }

  async delete(jobId: string): Promise<boolean> {
    try {
      await rm(this.filePath(jobId));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }

  async create(
    input: CreatePublicationDeliveryJobInput
  ): Promise<PublicationDeliveryJobRecord> {
    return this.save({
      id: input.id ?? randomUUID(),
      packageId: input.packageId,
      bundleId: input.bundleId,
      witnessId: input.witnessId,
      testimonyId: input.testimonyId,
      backend: input.backend,
      status: "queued",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    });
  }

  async findOldestQueued(): Promise<PublicationDeliveryJobRecord | null> {
    const queued = await this.list({ status: "queued" });
    return queued[0] ?? null;
  }
}
