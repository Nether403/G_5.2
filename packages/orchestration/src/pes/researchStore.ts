/**
 * FilePesResearchStore — the PES_Research_Store, file-backed (task 4.1).
 *
 * Holds consented, de-identified P-E-S conversation turns as a dataset DISTINCT
 * from `PES_Session_Store`: it shares no storage location, namespace, or record
 * identifiers with it (Requirement 7.1). Record ids are research-record ids, never
 * session ids. This realises the project invariant "same engine, different
 * identity": the store mirrors the file-per-record shape of `FileWitnessConsentStore`
 * / `FilePesConsentStore` but is its own P-E-S namespace and never reuses Witness
 * stores.
 *
 * Responsibilities:
 *  - `write` validates every required field, routes the write through the
 *    Boundary_Guard (`guardResearchWrite`, payload-type × target check), and rejects
 *    partial/invalid writes whole — naming the offending field and persisting nothing
 *    (Requirements 7.2, 7.3, 8.4).
 *  - `getBySessionRef` / `deleteBySessionRef` back DSAR access and erasure/withdrawal
 *    (Requirements 4.5, 4.6, 4.7, 4.8, 9.4).
 *  - `list` / `delete` support the Retention_Manager sweep (Requirement 6).
 */

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { guardResearchWrite } from "./boundaryGuard";
import { WITNESS_DATASET_ID, type PesResearchRecord } from "./types";

/** ISO 8601 UTC instant, e.g. `2026-01-01T00:00:00.000Z` (Requirements 6.1, 7.2). */
const ISO_8601_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

/**
 * Thrown when a write is rejected whole: either a required field is missing/invalid
 * (Requirement 7.3) or the Boundary_Guard blocks the write (Requirements 8.1–8.5).
 * No partial record is ever persisted before this is thrown.
 */
export class PesResearchWriteError extends Error {
  constructor(
    message: string,
    /** The offending field, or the guard rejection reason. */
    readonly field: string
  ) {
    super(message);
    this.name = "PesResearchWriteError";
  }
}

/** Validate every required field, naming the first offender. Returns null when valid. */
function findInvalidField(record: PesResearchRecord): { field: string; message: string } | null {
  const nonEmpty: ReadonlyArray<keyof PesResearchRecord> = [
    "id",
    "sessionRef",
    "consentDecisionRef",
    "consentVersion",
    "content",
  ];
  for (const field of nonEmpty) {
    const value = record[field];
    if (typeof value !== "string" || value.length === 0) {
      return { field, message: `missing or empty required field: ${field}` };
    }
  }
  // datasetId: non-empty AND not the Witness identity (Requirement 8.4).
  if (typeof record.datasetId !== "string" || record.datasetId.length === 0) {
    return { field: "datasetId", message: "missing or empty required field: datasetId" };
  }
  if (record.datasetId === WITNESS_DATASET_ID) {
    return {
      field: "datasetId",
      message: `datasetId must not equal the Witness dataset id: ${WITNESS_DATASET_ID}`,
    };
  }
  // collectedAt: ISO 8601 UTC (Requirements 6.1, 7.2).
  if (typeof record.collectedAt !== "string" || !ISO_8601_UTC.test(record.collectedAt)) {
    return { field: "collectedAt", message: "collectedAt must be an ISO 8601 UTC timestamp" };
  }
  return null;
}

export class FilePesResearchStore {
  constructor(private readonly rootDir: string) {}

  private filePath(recordId: string): string {
    return path.join(this.rootDir, `${recordId}.json`);
  }

  /**
   * Validate, guard, then persist a single research record. Rejects partial/invalid
   * writes whole (no partial persistence): validation runs before any byte is
   * written, and the Boundary_Guard is consulted before the file is created.
   */
  async write(record: PesResearchRecord): Promise<PesResearchRecord> {
    const invalid = findInvalidField(record);
    if (invalid !== null) {
      throw new PesResearchWriteError(invalid.message, invalid.field);
    }

    // Route through the Boundary_Guard (payload-type × target). `await Promise.resolve`
    // tolerates either a sync or async guard implementation.
    const guard = await Promise.resolve(guardResearchWrite(record, "pes_research"));
    if (!guard.allowed) {
      const reason = guard.rejection?.reason ?? "boundary_guard_rejected";
      throw new PesResearchWriteError(
        `Boundary_Guard rejected the write: ${reason}`,
        reason
      );
    }

    await mkdir(this.rootDir, { recursive: true });
    await writeFile(
      this.filePath(record.id),
      `${JSON.stringify(record, null, 2)}\n`,
      "utf8"
    );
    return record;
  }

  /** All persisted research records, oldest collection first. Empty when none exist. */
  async list(): Promise<PesResearchRecord[]> {
    try {
      const files = await readdir(this.rootDir);
      const items = await Promise.all(
        files
          .filter((file) => file.endsWith(".json"))
          .map(async (file) => {
            const raw = await readFile(path.join(this.rootDir, file), "utf8");
            return JSON.parse(raw) as PesResearchRecord;
          })
      );
      return items.sort((a, b) => a.collectedAt.localeCompare(b.collectedAt));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  /** DSAR access: every record collected under a session reference (Requirement 4.5). */
  async getBySessionRef(sessionRef: string): Promise<PesResearchRecord[]> {
    const records = await this.list();
    return records.filter((record) => record.sessionRef === sessionRef);
  }

  /**
   * Erasure / withdrawal: delete every record for a session reference, returning the
   * count deleted (Requirements 4.7, 4.8, 9.4). Other records are left unchanged; a
   * reference with no records deletes nothing and returns 0.
   */
  async deleteBySessionRef(sessionRef: string): Promise<number> {
    const records = await this.getBySessionRef(sessionRef);
    let deleted = 0;
    for (const record of records) {
      if (await this.delete(record.id)) {
        deleted += 1;
      }
    }
    return deleted;
  }

  /** Delete a single record by id. Returns false when no such record exists. */
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
