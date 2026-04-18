import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type {
  ArchiveCandidateRecord,
  ArchiveCandidateStore,
} from "../../../witness-types/src/archiveCandidate";

export interface CreateArchiveCandidateInput {
  witnessId: string;
  testimonyId: string;
  testimonyUpdatedAt: string;
  approvedSynthesisId: string;
  approvedAnnotationId: string;
  createdAt: string;
}

export class FileWitnessArchiveCandidateStore implements ArchiveCandidateStore {
  constructor(private readonly rootDir: string) {}

  private filePath(recordId: string): string {
    return path.join(this.rootDir, `${recordId}.json`);
  }

  async load(candidateId: string): Promise<ArchiveCandidateRecord | null> {
    try {
      const raw = await readFile(this.filePath(candidateId), "utf8");
      return JSON.parse(raw) as ArchiveCandidateRecord;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async list(): Promise<ArchiveCandidateRecord[]> {
    try {
      const files = await readdir(this.rootDir);
      const items = await Promise.all(
        files
          .filter((file) => file.endsWith(".json"))
          .map(async (file) => {
            const raw = await readFile(path.join(this.rootDir, file), "utf8");
            return JSON.parse(raw) as ArchiveCandidateRecord;
          })
      );
      return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async save(record: ArchiveCandidateRecord): Promise<ArchiveCandidateRecord> {
    await mkdir(this.rootDir, { recursive: true });
    await writeFile(
      this.filePath(record.id),
      `${JSON.stringify(record, null, 2)}\n`,
      "utf8"
    );
    return record;
  }

  async delete(candidateId: string): Promise<boolean> {
    try {
      await rm(this.filePath(candidateId));
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
    input: CreateArchiveCandidateInput
  ): Promise<ArchiveCandidateRecord> {
    return this.save({
      id: randomUUID(),
      witnessId: input.witnessId,
      testimonyId: input.testimonyId,
      testimonyUpdatedAt: input.testimonyUpdatedAt,
      approvedSynthesisId: input.approvedSynthesisId,
      approvedAnnotationId: input.approvedAnnotationId,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      status: "draft",
    });
  }
}
