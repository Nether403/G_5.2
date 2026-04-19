import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type {
  PublicationBundleRecord,
  PublicationBundleStore,
} from "../../../witness-types/src/publicationBundle";

export interface CreatePublicationBundleInput {
  id?: string;
  witnessId: string;
  testimonyId: string;
  archiveCandidateId: string;
  sourceTestimonyUpdatedAt: string;
  sourceSynthesisId: string;
  sourceAnnotationId: string;
  createdAt: string;
  bundleJsonPath: string;
  bundleMarkdownPath?: string;
  bundleManifestPath: string;
}

export class FileWitnessPublicationBundleStore
  implements PublicationBundleStore
{
  constructor(private readonly rootDir: string) {}

  private recordsDir(): string {
    return path.join(this.rootDir, "records");
  }

  private filePath(recordId: string): string {
    return path.join(this.recordsDir(), `${recordId}.json`);
  }

  async load(bundleId: string): Promise<PublicationBundleRecord | null> {
    try {
      const raw = await readFile(this.filePath(bundleId), "utf8");
      return JSON.parse(raw) as PublicationBundleRecord;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async list(): Promise<PublicationBundleRecord[]> {
    try {
      const files = await readdir(this.recordsDir());
      const records = await Promise.all(
        files
          .filter((file) => file.endsWith(".json"))
          .map(async (file) => {
            const raw = await readFile(path.join(this.recordsDir(), file), "utf8");
            return JSON.parse(raw) as PublicationBundleRecord;
          })
      );
      return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async save(
    record: PublicationBundleRecord
  ): Promise<PublicationBundleRecord> {
    await mkdir(this.recordsDir(), { recursive: true });
    await writeFile(
      this.filePath(record.id),
      `${JSON.stringify(record, null, 2)}\n`,
      "utf8"
    );
    return record;
  }

  async delete(bundleId: string): Promise<boolean> {
    try {
      await rm(this.filePath(bundleId));
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }

  async create(
    input: CreatePublicationBundleInput
  ): Promise<PublicationBundleRecord> {
    return this.save({
      id: input.id ?? randomUUID(),
      witnessId: input.witnessId,
      testimonyId: input.testimonyId,
      archiveCandidateId: input.archiveCandidateId,
      sourceTestimonyUpdatedAt: input.sourceTestimonyUpdatedAt,
      sourceSynthesisId: input.sourceSynthesisId,
      sourceAnnotationId: input.sourceAnnotationId,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      status: "created",
      bundleJsonPath: input.bundleJsonPath,
      ...(input.bundleMarkdownPath
        ? { bundleMarkdownPath: input.bundleMarkdownPath }
        : {}),
      bundleManifestPath: input.bundleManifestPath,
    });
  }
}
