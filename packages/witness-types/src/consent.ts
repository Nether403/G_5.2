export const CONSENT_SCOPES = [
  "conversational",
  "retention",
  "synthesis",
  "annotation",
  "archive_review",
  "publication",
] as const;

export type ConsentScope = (typeof CONSENT_SCOPES)[number];
export type ConsentStatus = "granted" | "denied" | "revoked" | "unknown";
export type ConsentActor = "witness" | "operator" | "system_import";

export interface ConsentDecision {
  scope: ConsentScope;
  status: ConsentStatus;
  actor: ConsentActor;
  decidedAt: string;
  note?: string;
}

export interface ConsentRecord {
  id: string;
  witnessId: string;
  testimonyId?: string;
  createdAt: string;
  updatedAt: string;
  decisions: ConsentDecision[];
}

export interface ConsentStore {
  load(recordId: string): Promise<ConsentRecord | null>;
  list(): Promise<ConsentRecord[]>;
  save(record: ConsentRecord): Promise<ConsentRecord>;
  delete(recordId: string): Promise<boolean>;
}

export function isConsentScope(value: unknown): value is ConsentScope {
  return (
    typeof value === "string" &&
    (CONSENT_SCOPES as readonly string[]).includes(value)
  );
}

export function getLatestConsentDecision(
  records: ConsentRecord[],
  scope: ConsentScope,
  testimonyId?: string
): ConsentDecision | null {
  const filtered = records
    .filter((record) => testimonyId === undefined || record.testimonyId === undefined || record.testimonyId === testimonyId)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

  for (let index = filtered.length - 1; index >= 0; index -= 1) {
    const record = filtered[index];
    for (let decisionIndex = record.decisions.length - 1; decisionIndex >= 0; decisionIndex -= 1) {
      const decision = record.decisions[decisionIndex];
      if (decision.scope === scope) {
        return decision;
      }
    }
  }

  return null;
}

export function hasGrantedConsent(
  records: ConsentRecord[],
  scope: ConsentScope,
  testimonyId?: string
): boolean {
  return getLatestConsentDecision(records, scope, testimonyId)?.status === "granted";
}
