import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ConsentActor,
  ConsentDecision,
  ConsentRecord,
  ConsentScope,
  ConsentStatus,
  ConsentStore,
} from "../../../witness-types/src/consent";

export interface AppendConsentDecisionInput {
  witnessId: string;
  testimonyId?: string;
  scope: ConsentScope;
  status: ConsentStatus;
  actor: ConsentActor;
  decidedAt: string;
  note?: string;
}

export class FileWitnessConsentStore implements ConsentStore {
  constructor(private readonly rootDir: string) {}

  private filePath(recordId: string): string {
    return path.join(this.rootDir, `${recordId}.json`);
  }

  async load(recordId: string): Promise<ConsentRecord | null> {
    try {
      const raw = await readFile(this.filePath(recordId), "utf8");
      return JSON.parse(raw) as ConsentRecord;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async list(): Promise<ConsentRecord[]> {
    try {
      const files = await readdir(this.rootDir);
      const items = await Promise.all(
        files
          .filter((file) => file.endsWith(".json"))
          .map(async (file) => {
            const raw = await readFile(path.join(this.rootDir, file), "utf8");
            return JSON.parse(raw) as ConsentRecord;
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

  async save(record: ConsentRecord): Promise<ConsentRecord> {
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

  async appendDecision(
    input: AppendConsentDecisionInput
  ): Promise<ConsentRecord> {
    const now = input.decidedAt;
    const decision: ConsentDecision = {
      scope: input.scope,
      status: input.status,
      actor: input.actor,
      decidedAt: input.decidedAt,
      ...(input.note ? { note: input.note } : {}),
    };

    return this.save({
      id: randomUUID(),
      witnessId: input.witnessId,
      ...(input.testimonyId ? { testimonyId: input.testimonyId } : {}),
      createdAt: now,
      updatedAt: now,
      decisions: [decision],
    });
  }
}

export async function listConsentForWitness(
  store: FileWitnessConsentStore,
  witnessId: string
): Promise<ConsentRecord[]> {
  const records = await store.list();
  return records.filter((record) => record.witnessId === witnessId);
}
