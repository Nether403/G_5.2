import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  TestimonyRecord,
  TestimonySegment,
  TestimonyStore,
} from "../../../witness-types/src/testimony";

export interface CreateTestimonyInput {
  witnessId: string;
  sessionId: string;
  capturedAt: string;
  title?: string;
}

export interface AppendTurnInput {
  testimonyId: string;
  witnessText: string;
  assistantText: string;
  createdAt: string;
}

export class FileWitnessTestimonyStore implements TestimonyStore {
  constructor(private readonly rootDir: string) {}

  private filePath(recordId: string): string {
    return path.join(this.rootDir, `${recordId}.json`);
  }

  async load(testimonyId: string): Promise<TestimonyRecord | null> {
    try {
      const raw = await readFile(this.filePath(testimonyId), "utf8");
      return JSON.parse(raw) as TestimonyRecord;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async list(): Promise<TestimonyRecord[]> {
    try {
      const files = await readdir(this.rootDir);
      const items = await Promise.all(
        files
          .filter((file) => file.endsWith(".json"))
          .map(async (file) => {
            const raw = await readFile(path.join(this.rootDir, file), "utf8");
            return JSON.parse(raw) as TestimonyRecord;
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

  async save(record: TestimonyRecord): Promise<TestimonyRecord> {
    await mkdir(this.rootDir, { recursive: true });
    await writeFile(
      this.filePath(record.id),
      `${JSON.stringify(record, null, 2)}\n`,
      "utf8"
    );
    return record;
  }

  async delete(testimonyId: string): Promise<boolean> {
    try {
      await rm(this.filePath(testimonyId));
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }

  async create(input: CreateTestimonyInput): Promise<TestimonyRecord> {
    const record: TestimonyRecord = {
      id: randomUUID(),
      witnessId: input.witnessId,
      sessionId: input.sessionId,
      state: "retained",
      createdAt: input.capturedAt,
      updatedAt: input.capturedAt,
      ...(input.title ? { title: input.title } : {}),
      segments: [],
    };

    return this.save(record);
  }
}

function buildSegment(
  role: TestimonySegment["role"],
  text: string,
  createdAt: string
): TestimonySegment {
  return {
    id: randomUUID(),
    role,
    text,
    createdAt,
  };
}

export async function appendTurnToTestimony(
  store: FileWitnessTestimonyStore,
  input: AppendTurnInput
): Promise<TestimonyRecord> {
  const record = await store.load(input.testimonyId);
  if (!record) {
    throw new Error(`Unknown testimony record: ${input.testimonyId}`);
  }

  const updated: TestimonyRecord = {
    ...record,
    updatedAt: input.createdAt,
    segments: [
      ...record.segments,
      buildSegment("witness", input.witnessText, input.createdAt),
      buildSegment("inquisitor", input.assistantText, input.createdAt),
    ],
  };

  return store.save(updated);
}
