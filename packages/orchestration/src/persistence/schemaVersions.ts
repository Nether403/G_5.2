/**
 * Persistence schema versions.
 *
 * Every persisted object carries a `schemaVersion` field. When a reader
 * encounters an object with an older version, it runs the migration path
 * to bring it to the current version; otherwise it refuses with a clear
 * error.
 */

export const SCHEMA_VERSIONS = {
  session: 2,
  sessionTurn: 1,
  sessionSummary: 1,
  turnTrace: 1,
  contextSnapshot: 1,
  memoryItem: 3,
  report: 2,
  archive: 1,
  reportArchive: 1,
} as const;

export type SchemaKind = keyof typeof SCHEMA_VERSIONS;

export function latestVersion(kind: SchemaKind): number {
  return SCHEMA_VERSIONS[kind];
}

export class SchemaMigrationError extends Error {
  constructor(
    public readonly kind: SchemaKind,
    public readonly found: unknown,
    message: string
  ) {
    super(
      `[${kind}] cannot load persisted object (found schemaVersion=${String(
        found
      )}): ${message}`
    );
    this.name = "SchemaMigrationError";
  }
}
