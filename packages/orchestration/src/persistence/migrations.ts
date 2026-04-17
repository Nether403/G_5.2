import { MemoryFixtureSchema, MemoryItemSchema } from "../schemas/memory";
import type { MemoryItem } from "../schemas/memory";
import {
  InquirySessionSchema,
  SessionTurnRecordSchema,
} from "./sessionSchema";
import type {
  PersistedInquirySession,
  PersistedSessionSummary,
  PersistedSessionTurnRecord,
} from "./sessionSchema";
import { SCHEMA_VERSIONS, SchemaMigrationError } from "./schemaVersions";

/**
 * Migration runner for persisted objects.
 *
 * Every persisted artefact carries a `schemaVersion` field in current
 * writes. Older data predates versioning and is upgraded to the current
 * version when possible. Anything that cannot be parsed at all, or that
 * carries a newer-than-current version, is rejected with a clear error
 * so a human can intervene rather than silently corrupting state.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function ensureNumberOrUndefined(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  return undefined;
}

// ────────────────────────────── Sessions ────────────────────────────────

export function migrateSession(raw: unknown): PersistedInquirySession {
  if (!isRecord(raw)) {
    throw new SchemaMigrationError(
      "session",
      raw,
      "persisted session is not an object"
    );
  }

  const version = ensureNumberOrUndefined(raw.schemaVersion);

  if (version !== undefined && version > SCHEMA_VERSIONS.session) {
    throw new SchemaMigrationError(
      "session",
      version,
      `newer than supported (${SCHEMA_VERSIONS.session})`
    );
  }

  // v1 (implicit) → v2: add schemaVersion fields on session, turns,
  // traces, and wrap bare-string summaries into a versioned
  // PersistedSessionSummary object. New fields on turn records remain
  // optional for forward compatibility.
  if (!Array.isArray(raw.turns)) {
    throw new SchemaMigrationError(
      "session",
      version ?? "unversioned",
      "turns field is not an array"
    );
  }
  const turnsRaw = raw.turns;
  const upgradedTurns: PersistedSessionTurnRecord[] = turnsRaw.map((turn) => {
    const stamped = stampTurnSchemaVersions(turn);
    const result = SessionTurnRecordSchema.safeParse(stamped);
    if (!result.success) {
      throw new SchemaMigrationError(
        "session",
        version ?? "unversioned",
        `turn record invalid: ${result.error.message}`
      );
    }
    return result.data;
  });

  const summary = migrateSessionSummary(
    raw.summary ?? null,
    typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString()
  );

  const candidate: Record<string, unknown> = {
    schemaVersion: SCHEMA_VERSIONS.session,
    id: raw.id,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    summary,
    turns: upgradedTurns,
  };

  if (Array.isArray(raw.tags)) {
    candidate.tags = raw.tags.filter((t): t is string => typeof t === "string");
  }
  if (typeof raw.archived === "boolean") {
    candidate.archived = raw.archived;
  }
  if (typeof raw.title === "string") {
    candidate.title = raw.title;
  }
  if (raw.productId === "pes" || raw.productId === "witness") {
    candidate.productId = raw.productId;
  }
  if (typeof raw.witnessId === "string" && raw.witnessId.trim().length > 0) {
    candidate.witnessId = raw.witnessId;
  }

  const parsed = InquirySessionSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new SchemaMigrationError(
      "session",
      version ?? "unversioned",
      parsed.error.message
    );
  }

  return parsed.data;
}

// ─────────────────────────── Memory items ───────────────────────────────

export function migrateMemoryItem(raw: unknown): MemoryItem {
  if (!isRecord(raw)) {
    throw new SchemaMigrationError(
      "memoryItem",
      raw,
      "persisted memory item is not an object"
    );
  }

  const version = ensureNumberOrUndefined(raw.schemaVersion);

  if (version !== undefined && version > SCHEMA_VERSIONS.memoryItem) {
    throw new SchemaMigrationError(
      "memoryItem",
      version,
      `newer than supported (${SCHEMA_VERSIONS.memoryItem})`
    );
  }

  // v2 → v3: add `state` and `origin` fields. Items written before the
  // state machine existed were always auto-accepted, so they migrate in
  // as `accepted` with origin `turn` (unless the raw item already
  // carries an explicit origin/state from a newer writer).
  const upgraded: Record<string, unknown> = {
    ...raw,
    schemaVersion: SCHEMA_VERSIONS.memoryItem,
  };
  if (typeof upgraded.state !== "string") {
    upgraded.state = "accepted";
  }
  if (typeof upgraded.origin !== "string") {
    upgraded.origin = "turn";
  }

  const parsed = MemoryItemSchema.safeParse(upgraded);
  if (!parsed.success) {
    throw new SchemaMigrationError(
      "memoryItem",
      version ?? "unversioned",
      parsed.error.message
    );
  }

  return parsed.data;
}

export function migrateMemoryItems(raw: unknown): MemoryItem[] {
  if (!Array.isArray(raw)) {
    throw new SchemaMigrationError(
      "memoryItem",
      raw,
      "memory fixture is not an array"
    );
  }
  return raw.map(migrateMemoryItem);
}

function stampTurnSchemaVersions(turn: unknown): unknown {
  if (!isRecord(turn)) return turn;
  const stamped: Record<string, unknown> = {
    ...turn,
    schemaVersion:
      ensureNumberOrUndefined(turn.schemaVersion) ??
      SCHEMA_VERSIONS.sessionTurn,
  };
  if (isRecord(turn.trace)) {
    stamped.trace = {
      ...turn.trace,
      schemaVersion:
        ensureNumberOrUndefined(turn.trace.schemaVersion) ??
        SCHEMA_VERSIONS.turnTrace,
    };
  }
  return stamped;
}

function migrateSessionSummary(
  raw: unknown,
  fallbackGeneratedAt: string
): PersistedSessionSummary | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") {
    if (raw.length === 0) return null;
    return {
      schemaVersion: SCHEMA_VERSIONS.sessionSummary,
      text: raw,
      generatedAt: fallbackGeneratedAt,
    };
  }
  if (!isRecord(raw)) {
    throw new SchemaMigrationError(
      "sessionSummary",
      raw,
      "summary is neither null, string, nor object"
    );
  }
  const version = ensureNumberOrUndefined(raw.schemaVersion);
  if (version !== undefined && version > SCHEMA_VERSIONS.sessionSummary) {
    throw new SchemaMigrationError(
      "sessionSummary",
      version,
      `newer than supported (${SCHEMA_VERSIONS.sessionSummary})`
    );
  }
  if (typeof raw.text !== "string") {
    throw new SchemaMigrationError(
      "sessionSummary",
      version ?? "unversioned",
      "summary.text is not a string"
    );
  }
  if (raw.generatedAt !== undefined && typeof raw.generatedAt !== "string") {
    throw new SchemaMigrationError(
      "sessionSummary",
      version ?? "unversioned",
      "summary.generatedAt is not a string"
    );
  }
  return {
    schemaVersion: SCHEMA_VERSIONS.sessionSummary,
    text: raw.text,
    generatedAt:
      typeof raw.generatedAt === "string"
        ? raw.generatedAt
        : fallbackGeneratedAt,
  };
}

export function parseMemoryFixture(raw: unknown): MemoryItem[] {
  // Accepts current (v3) fixtures directly and older/unversioned fixtures
  // via the migration path. Older fixtures predate the state machine and
  // are stamped as `accepted` / origin `turn` on load.
  try {
    return MemoryFixtureSchema.parse(raw);
  } catch {
    return migrateMemoryItems(raw);
  }
}
