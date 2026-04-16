import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  APPROVAL_REQUIRED_TYPES,
  type MemoryCandidate,
  type MemoryItem,
  type MemoryOrigin,
  type MemorySourceRef,
  type MemoryState,
  type MemoryStoredItemSnapshot,
  type MemoryType,
  type MemoryScope,
  typeRequiresApproval,
} from "../schemas/memory";
import { MemoryItemSchema } from "../schemas/memory";
import { migrateMemoryItem } from "../persistence/migrations";
import { SCHEMA_VERSIONS } from "../persistence/schemaVersions";
import type { MemoryStore } from "../types/memory";

function memoryPath(rootDir: string, memoryId: string): string {
  return path.join(rootDir, `${memoryId}.json`);
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeStatement(value: string): string {
  return normalizeWhitespace(value)
    .replace(/[.?!]+$/g, "")
    .trim();
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    const value = normalizeWhitespace(tag).toLowerCase();
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

function dedupeKey(
  candidate: Pick<MemoryCandidate, "type" | "scope" | "statement"> & {
    sessionId?: string;
  }
): string {
  return [
    candidate.type,
    candidate.scope,
    candidate.scope === "session" ? candidate.sessionId ?? "" : "",
    normalizeStatement(candidate.statement).toLowerCase(),
  ].join("::");
}

async function parseMemoryFile(filePath: string): Promise<MemoryItem> {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return migrateMemoryItem(parsed);
}

function withSchemaVersion(item: MemoryItem): MemoryItem {
  return { schemaVersion: SCHEMA_VERSIONS.memoryItem, ...item };
}

// ─────────────────── Conflict detection ───────────────────

const NEGATION_TOKENS = new Set([
  "never",
  "avoid",
  "don't",
  "dont",
  "not",
  "no",
  "stop",
  "refuse",
  "disallow",
]);

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter(Boolean);
}

function polarity(tokens: string[]): "positive" | "negative" {
  return tokens.some((t) => NEGATION_TOKENS.has(t)) ? "negative" : "positive";
}

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }
  let inter = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      inter += 1;
    }
  }
  return inter / (setA.size + setB.size - inter);
}

export interface MemoryConflict {
  kind: "duplicate" | "contradiction";
  existing: MemoryItem;
}

export interface ConflictCheckInput {
  type: MemoryType;
  scope: MemoryScope;
  statement: string;
  sessionId?: string;
}

/**
 * Detect conflicts against currently retrievable (`accepted`) items of the
 * same type+scope (+session). Returns duplicates (dedupe-key match) and
 * likely contradictions (same type, high token overlap but opposite
 * polarity). Heuristic, not semantic — contradictions are surfaced to the
 * operator, never silently resolved.
 */
export function detectConflicts(
  candidate: ConflictCheckInput,
  existingItems: MemoryItem[]
): MemoryConflict[] {
  const conflicts: MemoryConflict[] = [];
  const candidateKey = dedupeKey(candidate);
  const candidateTokens = tokenize(candidate.statement).filter(
    (t) => !NEGATION_TOKENS.has(t) && t.length > 2
  );
  const candidatePolarity = polarity(tokenize(candidate.statement));

  for (const item of existingItems) {
    if (item.state !== "accepted") {
      continue;
    }
    if (item.type !== candidate.type || item.scope !== candidate.scope) {
      continue;
    }
    if (
      candidate.scope === "session" &&
      item.sessionId !== candidate.sessionId
    ) {
      continue;
    }

    if (dedupeKey(item) === candidateKey) {
      conflicts.push({ kind: "duplicate", existing: item });
      continue;
    }

    const itemTokens = tokenize(item.statement).filter(
      (t) => !NEGATION_TOKENS.has(t) && t.length > 2
    );
    const overlap = jaccard(candidateTokens, itemTokens);
    const itemPolarity = polarity(tokenize(item.statement));
    if (overlap >= 0.5 && candidatePolarity !== itemPolarity) {
      conflicts.push({ kind: "contradiction", existing: item });
    }
  }

  return conflicts;
}

// ─────────────────── Store API ───────────────────

export interface CreateMemoryInput {
  type: MemoryType;
  scope: MemoryScope;
  statement: string;
  justification: string;
  confidence?: MemoryItem["confidence"];
  tags?: string[];
  sessionId?: string;
  origin?: MemoryOrigin;
  state?: MemoryState;
  supersedes?: string;
  approvedBy?: string;
}

export interface PatchMemoryInput {
  statement?: string;
  justification?: string;
  tags?: string[];
  confidence?: MemoryItem["confidence"];
}

export type MemoryTransitionAction =
  | "approve"
  | "reject"
  | "resolve"
  | "archive"
  | "supersede";

export interface TransitionInput {
  action: MemoryTransitionAction;
  reason?: string;
  actor?: string;
  supersededById?: string;
  at?: string;
}

export class MemoryTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryTransitionError";
  }
}

/**
 * Allowed state transitions for the memory state machine.
 * Terminal states: rejected, archived.
 */
const ALLOWED_TRANSITIONS: Record<MemoryState, readonly MemoryState[]> = {
  proposed: ["accepted", "rejected", "archived"],
  accepted: ["superseded", "resolved", "archived", "rejected"],
  superseded: ["archived"],
  resolved: ["archived"],
  rejected: ["archived"],
  archived: [],
};

function canTransition(from: MemoryState, to: MemoryState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export class FileMemoryStore implements MemoryStore {
  constructor(private readonly rootDir: string) {}

  async load(memoryId: string): Promise<MemoryItem | null> {
    try {
      return await parseMemoryFile(memoryPath(this.rootDir, memoryId));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async list(): Promise<MemoryItem[]> {
    if (!existsSync(this.rootDir)) {
      return [];
    }

    const files = await readdir(this.rootDir);
    const items = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map((file) => parseMemoryFile(path.join(this.rootDir, file)))
    );

    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /**
   * Turn-generated upsert path. Items written here are recorded as
   * `accepted` (the pipeline memory-pass already enforced gating). If an
   * accepted item already exists with a matching dedupe key, it is
   * confirmed (confirmation count incremented) rather than duplicated.
   */
  async upsert(
    candidate: MemoryCandidate,
    source: MemorySourceRef
  ): Promise<MemoryStoredItemSnapshot> {
    await mkdir(this.rootDir, { recursive: true });

    const normalizedCandidate = {
      ...candidate,
      statement: normalizeStatement(candidate.statement),
      justification: normalizeWhitespace(candidate.justification),
      tags: normalizeTags(candidate.tags),
      sessionId: candidate.scope === "session" ? source.sessionId : undefined,
    };

    const targetKey = dedupeKey({
      type: normalizedCandidate.type,
      scope: normalizedCandidate.scope,
      statement: normalizedCandidate.statement,
      sessionId: normalizedCandidate.sessionId,
    });

    const existingAccepted = (await this.list()).find(
      (item) => item.state === "accepted" && dedupeKey(item) === targetKey
    );

    if (existingAccepted) {
      const updated: MemoryItem = withSchemaVersion({
        ...existingAccepted,
        updatedAt: source.createdAt,
        lastConfirmedFrom: source,
        confirmationCount: existingAccepted.confirmationCount + 1,
        tags: normalizeTags([
          ...existingAccepted.tags,
          ...normalizedCandidate.tags,
        ]),
      });

      await this.writeItem(updated);
      return { ...updated, action: "confirmed" };
    }

    const created = await this.create({
      type: normalizedCandidate.type,
      scope: normalizedCandidate.scope,
      statement: normalizedCandidate.statement,
      justification: normalizedCandidate.justification,
      confidence: normalizedCandidate.confidence,
      tags: normalizedCandidate.tags,
      sessionId: normalizedCandidate.sessionId,
      origin: "turn",
      state: "accepted",
    }, source);

    return { ...created, action: "created" };
  }

  /**
   * Manual/operator create path. Items default to `proposed` for classes
   * that require approval; other classes land in `accepted` directly.
   */
  async create(
    input: CreateMemoryInput,
    source?: MemorySourceRef
  ): Promise<MemoryItem> {
    await mkdir(this.rootDir, { recursive: true });

    const now = new Date().toISOString();
    const origin: MemoryOrigin = input.origin ?? "operator";
    const defaultState: MemoryState =
      origin === "operator" && typeRequiresApproval(input.type)
        ? "proposed"
        : "accepted";
    const state: MemoryState = input.state ?? defaultState;

    const effectiveSource: MemorySourceRef = source ?? {
      turnId: `operator-${randomUUID()}`,
      createdAt: now,
      ...(input.scope === "session" && input.sessionId
        ? { sessionId: input.sessionId }
        : {}),
    };

    const item: MemoryItem = withSchemaVersion({
      id: randomUUID(),
      type: input.type,
      scope: input.scope,
      state,
      origin,
      statement: normalizeStatement(input.statement),
      justification: normalizeWhitespace(input.justification),
      confidence: input.confidence ?? "high",
      tags: normalizeTags(input.tags ?? []),
      ...(input.scope === "session" && input.sessionId
        ? { sessionId: input.sessionId }
        : {}),
      createdAt: effectiveSource.createdAt,
      updatedAt: effectiveSource.createdAt,
      createdFrom: effectiveSource,
      lastConfirmedFrom: effectiveSource,
      confirmationCount: 1,
      ...(state === "accepted" && origin === "operator"
        ? { approvedAt: effectiveSource.createdAt }
        : {}),
      ...(input.approvedBy ? { approvedBy: input.approvedBy } : {}),
      ...(input.supersedes ? { supersedes: input.supersedes } : {}),
    });

    MemoryItemSchema.parse(item);
    await this.writeItem(item);
    return item;
  }

  async patch(memoryId: string, patch: PatchMemoryInput): Promise<MemoryItem> {
    const existing = await this.load(memoryId);
    if (!existing) {
      throw new MemoryTransitionError(`Memory item not found: ${memoryId}`);
    }
    if (existing.state !== "proposed" && existing.state !== "accepted") {
      throw new MemoryTransitionError(
        `Memory item in state "${existing.state}" cannot be edited; archive and create a new item instead.`
      );
    }

    const updated: MemoryItem = withSchemaVersion({
      ...existing,
      statement:
        patch.statement !== undefined
          ? normalizeStatement(patch.statement)
          : existing.statement,
      justification:
        patch.justification !== undefined
          ? normalizeWhitespace(patch.justification)
          : existing.justification,
      tags: patch.tags !== undefined ? normalizeTags(patch.tags) : existing.tags,
      confidence: patch.confidence ?? existing.confidence,
      updatedAt: new Date().toISOString(),
    });

    MemoryItemSchema.parse(updated);
    await this.writeItem(updated);
    return updated;
  }

  async transition(
    memoryId: string,
    input: TransitionInput
  ): Promise<MemoryItem> {
    const existing = await this.load(memoryId);
    if (!existing) {
      throw new MemoryTransitionError(`Memory item not found: ${memoryId}`);
    }

    const at = input.at ?? new Date().toISOString();
    const nextState = this.resolveNextState(existing, input);
    if (!canTransition(existing.state, nextState)) {
      throw new MemoryTransitionError(
        `Illegal transition ${existing.state} → ${nextState} for memory ${memoryId}.`
      );
    }

    const updated: MemoryItem = withSchemaVersion({
      ...existing,
      state: nextState,
      updatedAt: at,
      ...(nextState === "accepted"
        ? { approvedAt: at, ...(input.actor ? { approvedBy: input.actor } : {}) }
        : {}),
      ...(nextState === "rejected"
        ? {
            rejectedAt: at,
            rejectionReason: input.reason ?? existing.rejectionReason ?? "rejected by operator",
          }
        : {}),
      ...(nextState === "resolved"
        ? {
            resolvedAt: at,
            resolvedReason:
              input.reason ?? existing.resolvedReason ?? "resolved by operator",
          }
        : {}),
      ...(nextState === "superseded"
        ? {
            ...(input.supersededById ? { supersededBy: input.supersededById } : {}),
          }
        : {}),
      ...(nextState === "archived"
        ? {
            archivedAt: at,
            ...(input.reason ? { archivedReason: input.reason } : {}),
          }
        : {}),
    });

    MemoryItemSchema.parse(updated);
    await this.writeItem(updated);
    return updated;
  }

  private resolveNextState(
    existing: MemoryItem,
    input: TransitionInput
  ): MemoryState {
    switch (input.action) {
      case "approve":
        return "accepted";
      case "reject":
        return "rejected";
      case "resolve":
        if (existing.type !== "open_thread") {
          throw new MemoryTransitionError(
            `Only open_thread items support "resolve"; got type "${existing.type}".`
          );
        }
        return "resolved";
      case "archive":
        return "archived";
      case "supersede":
        return "superseded";
      default:
        throw new MemoryTransitionError(
          `Unknown transition action: ${String(input.action)}`
        );
    }
  }

  async delete(memoryId: string): Promise<boolean> {
    try {
      await rm(memoryPath(this.rootDir, memoryId));
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return false;
      }

      throw error;
    }
  }

  async findConflicts(candidate: ConflictCheckInput): Promise<MemoryConflict[]> {
    const items = await this.list();
    return detectConflicts(candidate, items);
  }

  private async writeItem(item: MemoryItem): Promise<void> {
    await writeFile(
      memoryPath(this.rootDir, item.id),
      `${JSON.stringify(item, null, 2)}\n`,
      "utf8"
    );
  }
}

export function normalizeMemoryStatement(value: string): string {
  return normalizeStatement(value);
}

export const MEMORY_APPROVAL_REQUIRED_TYPES = APPROVAL_REQUIRED_TYPES;
