/**
 * FilePesConsentStore — P-E-S consent decisions, file-backed (task 5.1).
 *
 * Mirrors the file-per-record shape of `FileWitnessConsentStore`, but lives in
 * the P-E-S dataset namespace and is rooted at `researchRoot/consent/`
 * (`researchConsentRoot`), disjoint from the Witness consent root
 * (`data/witness/consent`). This realises the project invariant "same engine,
 * different identity": no shared store, namespace, or record identifiers with
 * Witness consent.
 *
 * A `PesConsentRecord` carries NO account identifier — it is keyed by its own
 * id (= the `consentRef` returned to the client) and references the operational
 * session it governs (Requirement 1).
 *
 * Responsibilities (Requirements 4.1, 4.9, 9.2, 9.7):
 *  - Record/update a consent decision (`granted` / `declined`) tagged with the
 *    consent text version under which it was collected.
 *  - Transition a decision to `withdrawn`, stamping `withdrawnAt`; withdrawing
 *    an already-`withdrawn` record is a no-op (Requirement 9.7).
 */

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { PesConsentRecord } from "./types";

/** Input to record (or update) a `granted`/`declined` consent decision. */
export interface RecordPesConsentInput {
  /** Operational session this decision governs. */
  sessionRef: string;
  /** The visitor's explicit choice. Withdrawal is a separate transition. */
  status: "granted" | "declined";
  /** Version of the consent text the visitor saw. */
  consentVersion: string;
  /**
   * Existing record id to update. When omitted, a fresh id is generated and a
   * new record is created (the new-decision path).
   */
  id?: string;
  /** Decision timestamp (ISO 8601 UTC). Defaults to now. */
  decidedAt?: string;
}

export class FilePesConsentStore {
  constructor(private readonly rootDir: string) {}

  private filePath(recordId: string): string {
    return path.join(this.rootDir, `${recordId}.json`);
  }

  async load(recordId: string): Promise<PesConsentRecord | null> {
    try {
      const raw = await readFile(this.filePath(recordId), "utf8");
      return JSON.parse(raw) as PesConsentRecord;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async list(): Promise<PesConsentRecord[]> {
    try {
      const files = await readdir(this.rootDir);
      const items = await Promise.all(
        files
          .filter((file) => file.endsWith(".json"))
          .map(async (file) => {
            const raw = await readFile(path.join(this.rootDir, file), "utf8");
            return JSON.parse(raw) as PesConsentRecord;
          })
      );
      return items.sort((a, b) => a.decidedAt.localeCompare(b.decidedAt));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async save(record: PesConsentRecord): Promise<PesConsentRecord> {
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

  /**
   * Record a new consent decision, or update an existing one when `id` is
   * supplied (e.g. a previously `declined` session later opts in). The consent
   * text version is captured on every decision (Requirements 4.1, 4.9). Any
   * prior `withdrawnAt` is cleared on a fresh `granted`/`declined` decision.
   */
  async record(input: RecordPesConsentInput): Promise<PesConsentRecord> {
    const decidedAt = input.decidedAt ?? new Date().toISOString();
    const record: PesConsentRecord = {
      id: input.id ?? randomUUID(),
      sessionRef: input.sessionRef,
      status: input.status,
      consentVersion: input.consentVersion,
      decidedAt,
    };
    return this.save(record);
  }

  /**
   * Transition a decision to `withdrawn`, stamping `withdrawnAt` (Requirement
   * 9.2). Withdrawing an already-`withdrawn` record is a no-op: the record is
   * returned unchanged with its original `withdrawnAt` preserved (Requirement
   * 9.7). Returns `null` when no record exists for `recordId`.
   */
  async withdraw(
    recordId: string,
    withdrawnAt?: string
  ): Promise<PesConsentRecord | null> {
    const existing = await this.load(recordId);
    if (existing === null) {
      return null;
    }
    if (existing.status === "withdrawn") {
      // ponytail: already withdrawn — no state change, keep original withdrawnAt.
      return existing;
    }
    return this.save({
      ...existing,
      status: "withdrawn",
      withdrawnAt: withdrawnAt ?? new Date().toISOString(),
    });
  }
}
