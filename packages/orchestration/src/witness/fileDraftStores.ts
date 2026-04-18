import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AnnotationRecord,
  AnnotationStore,
} from "../../../witness-types/src/annotation";
import type {
  SynthesisRecord,
  SynthesisStore,
} from "../../../witness-types/src/synthesis";

interface DraftStoreRecord {
  id: string;
  createdAt: string;
}

abstract class JsonDraftStore<T extends DraftStoreRecord> {
  constructor(protected readonly rootDir: string) {}

  protected filePath(recordId: string): string {
    return path.join(this.rootDir, `${recordId}.json`);
  }

  async load(recordId: string): Promise<T | null> {
    try {
      const raw = await readFile(this.filePath(recordId), "utf8");
      return JSON.parse(raw) as T;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async list(): Promise<T[]> {
    try {
      const files = await readdir(this.rootDir);
      const records = await Promise.all(
        files
          .filter((file) => file.endsWith(".json"))
          .map(async (file) => {
            const raw = await readFile(path.join(this.rootDir, file), "utf8");
            return JSON.parse(raw) as T;
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

  async save(record: T): Promise<T> {
    await mkdir(this.rootDir, { recursive: true });
    await writeFile(
      this.filePath(record.id),
      `${JSON.stringify(record, null, 2)}\n`,
      "utf8"
    );
    return record;
  }

  async delete(recordId: string): Promise<boolean> {
    try {
      await rm(this.filePath(recordId));
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }
}

export interface CreateSynthesisRecordInput {
  witnessId: string;
  testimonyId: string;
  createdAt: string;
  text: string;
}

export class FileWitnessSynthesisStore
  extends JsonDraftStore<SynthesisRecord>
  implements SynthesisStore
{
  async create(input: CreateSynthesisRecordInput): Promise<SynthesisRecord> {
    return this.save({
      id: randomUUID(),
      witnessId: input.witnessId,
      testimonyId: input.testimonyId,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      status: "draft",
      source: "model",
      text: input.text,
    });
  }
}

export interface CreateAnnotationRecordInput {
  witnessId: string;
  testimonyId: string;
  createdAt: string;
  entries: AnnotationRecord["entries"];
}

export class FileWitnessAnnotationStore
  extends JsonDraftStore<AnnotationRecord>
  implements AnnotationStore
{
  async create(input: CreateAnnotationRecordInput): Promise<AnnotationRecord> {
    return this.save({
      id: randomUUID(),
      witnessId: input.witnessId,
      testimonyId: input.testimonyId,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      status: "draft",
      source: "model",
      entries: input.entries,
    });
  }
}

export { FileWitnessArchiveCandidateStore } from "./fileArchiveCandidateStore";
export { FileWitnessPublicationBundleStore } from "./filePublicationBundleStore";
