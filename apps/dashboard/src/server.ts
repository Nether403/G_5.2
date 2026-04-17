/**
 * Operator dashboard server.
 *
 * Serves a report dashboard, diff viewer, and minimal inquiry surface.
 * Zero external dependencies — uses Node's built-in http module.
 *
 * API:
 *   GET /                                              → eval dashboard HTML
 *   GET /inquiry.html                                  → inquiry UI HTML
 *   GET /api/reports                                   → list of report filenames (newest first)
 *   GET /api/reports/:name                             → full report JSON
 *   GET /api/diff?a=:name&b=:name                      → computed diff between two reports
 *   GET /api/providers                                 → default provider + available providers
 *   GET /api/inquiry/sessions                          → list of inquiry sessions
 *   GET /api/inquiry/sessions/:id                      → full inquiry session JSON
 *   PATCH /api/inquiry/sessions/:id                    → update tags / archived / title
 *   DELETE /api/inquiry/sessions/:id                   → delete a persisted session
 *   POST /api/inquiry/sessions/:id/turns/:turnId/rerun → rerun a turn (compare by provider)
 *   POST /api/inquiry/preview                          → preview retrieval set for a candidate turn (no provider call)
 *   POST /api/inquiry/turn                             → run and persist a new inquiry turn
 *   GET /api/memory                                    → list durable memory items (?state=, ?type=, ?scope=, ?sessionId=)
 *   POST /api/memory                                   → manually create a memory item
 *   PATCH /api/memory/:id                              → edit a proposed/accepted memory item
 *   POST /api/memory/:id/:action                       → approve | reject | resolve | archive | supersede
 *   GET /api/memory/conflicts                          → detect duplicate/contradiction conflicts for a candidate
 *   DELETE /api/memory/:id                             → hard-delete a durable memory item
 *   GET    /api/reflection/topics                      → list reflection topics
 *   POST   /api/reflection/topics                      → create reflection topic
 *   GET    /api/reflection/topics/:id                  → topic + its runs
 *   PATCH  /api/reflection/topics/:id                  → edit topic (only while not archived)
 *   DELETE /api/reflection/topics/:id                  → hard-delete topic
 *   POST   /api/reflection/topics/:id/archive          → archive topic
 *   POST   /api/reflection/topics/:id/run              → run reflection: draft → critique → revise → store artifact
 *   GET    /api/reflection/runs/:id                    → full reflection run
 *   GET    /api/artifacts                              → list authored artifacts (?topicId=, ?status=)
 *   GET    /api/artifacts/:id                          → full artifact
 *   PATCH  /api/artifacts/:id                          → edit draft body/title
 *   DELETE /api/artifacts/:id                          → hard-delete artifact
 *   POST   /api/artifacts/:id/approve                  → draft → approved
 *   POST   /api/artifacts/:id/publishing-ready         → approved → publishing_ready
 *   POST   /api/artifacts/:id/archive                  → → archived
 *   POST   /api/artifacts/:id/propose-to-canon         → write canon proposal (M4 review path)
 *
 * Usage:
 *   pnpm dashboard    (or: pnpm --filter @g52/dashboard dev)
 */

import http from "node:http";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FileMemoryStore,
  MemoryTransitionError,
  type MemoryTransitionAction,
} from "../../../packages/orchestration/src/memory/fileMemoryStore";
import { MODES, type Mode } from "../../../packages/orchestration/src/types/modes";
import type {
  MemoryScope,
  MemoryState,
  MemoryType,
} from "../../../packages/orchestration/src/types/memory";
import {
  MemoryScopeSchema,
  MemoryStateSchema,
  MemoryTypeSchema,
} from "../../../packages/orchestration/src/schemas/memory";
import type { BuiltContext } from "../../../packages/orchestration/src/types/pipeline";
import type {
  InquirySession,
  SessionTurnRerun,
} from "../../../packages/orchestration/src/types/session";
import { providerFromEnv } from "../../../packages/orchestration/src/providers/fromEnv";
import {
  isKnownProviderName,
  providerByName,
} from "../../../packages/orchestration/src/providers/byName";
import { runSessionTurn } from "../../../packages/orchestration/src/sessions/runSessionTurn";
import { buildContext } from "../../../packages/orchestration/src/pipeline/buildContext";
import { runCompareTurn } from "../../../packages/orchestration/src/sessions/runCompareTurn";
import { FileSessionStore } from "../../../packages/orchestration/src/sessions/fileSessionStore";
import { randomUUID } from "node:crypto";
import {
  createProductRegistry,
  getProductConfig,
  type ProductConfig,
} from "../../../packages/orchestration/src/products";
import { FileWitnessConsentStore, listConsentForWitness } from "../../../packages/orchestration/src/witness/fileConsentStore";
import { FileWitnessTestimonyStore } from "../../../packages/orchestration/src/witness/fileTestimonyStore";
import {
  FileProposalStore,
  PROPOSAL_SCHEMA_VERSION,
  PROPOSAL_SOURCES,
  PROPOSAL_STATUSES,
  PROPOSAL_CHANGE_KINDS,
  CanonProposalSchema,
  type CanonProposal,
  type ProposalReviewEntry,
  type ProposalSource,
  type ProposalStatus,
  type ProposalChangeKind,
  EDITABLE_CANON_FILES,
  isEditableCanonFile,
  canonFileLabel,
  resolveCanonPath,
  computeLineDiff,
  applyProposal,
  scaffoldChangelogEntry,
  parseContinuityFacts,
  nextContinuityFactId,
  appendContinuityFact,
} from "../../../packages/orchestration/src/canon-proposals";
import {
  FileReflectionStore,
  ReflectionStoreError,
} from "../../../packages/orchestration/src/reflection/fileReflectionStore";
import {
  AuthoredArtifactStoreError,
  FileAuthoredArtifactStore,
} from "../../../packages/orchestration/src/reflection/fileAuthoredArtifactStore";
import { runReflection } from "../../../packages/orchestration/src/reflection/runReflection";
import { promoteArtifactToProposal } from "../../../packages/orchestration/src/reflection/promoteArtifact";
import type { AuthoredArtifactStatus } from "../../../packages/orchestration/src/schemas/reflection";
import { validateReport } from "../../../packages/evals/src/reporters/reportSchema";
import { isConsentScope } from "../../../packages/witness-types/src/consent";
import { computeDiff, type JsonReport } from "./reportUtils";
import {
  sortSessionSummaries,
  toSessionSummary,
} from "./inquiryUtils";
import {
  getWitnessConsentGate,
  persistWitnessTurnArtifacts,
} from "./witnessRuntime";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const REPORTS_DIR = path.join(REPO_ROOT, "packages", "evals", "reports");
const PRODUCT_REGISTRY = createProductRegistry(REPO_ROOT);
const PES_CONFIG = PRODUCT_REGISTRY.pes;
const WITNESS_CONFIG = PRODUCT_REGISTRY.witness;
const CANON_ROOT = PES_CONFIG.policyRoot;
const SESSIONS_DIR = PES_CONFIG.sessionsRoot;
const MEMORY_DIR = PES_CONFIG.memoryRoot;
const PROPOSALS_DIR = path.join(REPO_ROOT, "data", "canon-proposals");
const REFLECTION_DIR = path.join(REPO_ROOT, "data", "reflection");
const ARTIFACT_DIR = path.join(REPO_ROOT, "data", "authored-artifacts");
const STATIC_DIR = path.resolve(__dirname, "../public");
const PORT = parseInt(process.env.DASHBOARD_PORT ?? "5000", 10);
const HOST = process.env.DASHBOARD_HOST ?? "0.0.0.0";

function loadLocalEnv() {
  const envPath = path.join(REPO_ROOT, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const parts = trimmed.split("=", 2);
    if (parts.length !== 2) {
      continue;
    }

    const key = parts[0].trim();
    if (!key || process.env[key]) {
      continue;
    }

    let value = parts[1].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadLocalEnv();

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function resolveProductConfig(
  value: unknown
): ProductConfig | null {
  if (value === undefined || value === null || value === "") {
    return PES_CONFIG;
  }

  if (typeof value !== "string") {
    return null;
  }

  try {
    return getProductConfig(PRODUCT_REGISTRY, value);
  } catch {
    return null;
  }
}

function sessionStoreFor(product: ProductConfig): FileSessionStore {
  return new FileSessionStore(product.sessionsRoot);
}

function memoryStoreFor(product: ProductConfig): FileMemoryStore {
  return new FileMemoryStore(product.memoryRoot);
}

function consentStoreFor(product: ProductConfig): FileWitnessConsentStore {
  if (!product.consentRoot) {
    throw new Error(`Product ${product.id} does not define a consent root.`);
  }

  return new FileWitnessConsentStore(product.consentRoot);
}

function testimonyStoreFor(product: ProductConfig): FileWitnessTestimonyStore {
  if (!product.testimonyRoot) {
    throw new Error(`Product ${product.id} does not define a testimony root.`);
  }

  return new FileWitnessTestimonyStore(product.testimonyRoot);
}

async function readSession(
  product: ProductConfig,
  sessionId: string
): Promise<InquirySession | null> {
  // Route through FileSessionStore so legacy data is migrated and
  // newer-than-supported data is rejected consistently.
  return sessionStoreFor(product).load(sessionId);
}

async function listSessionSummaries(product: ProductConfig) {
  try {
    const files = await fs.readdir(product.sessionsRoot);
    const ids = files
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.slice(0, -".json".length));
    const store = sessionStoreFor(product);
    const sessions = await Promise.all(ids.map((id) => store.load(id)));
    const loaded = sessions.filter(
      (session): session is InquirySession => session !== null
    );
    return sortSessionSummaries(loaded.map(toSessionSummary));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function isMode(value: unknown): value is Mode {
  return typeof value === "string" && MODES.includes(value as Mode);
}

function isMemoryScope(value: unknown): value is MemoryScope {
  return value === "global" || value === "session";
}

function parseEnumParam<T>(
  value: string | null,
  schema: { safeParse(v: unknown): { success: boolean; data?: T } }
): T | undefined {
  if (!value) return undefined;
  const result = schema.safeParse(value);
  return result.success ? (result.data as T) : undefined;
}

const MEMORY_ACTIONS: readonly MemoryTransitionAction[] = [
  "approve",
  "reject",
  "resolve",
  "archive",
  "supersede",
];

function isMemoryAction(value: string): value is MemoryTransitionAction {
  return (MEMORY_ACTIONS as readonly string[]).includes(value);
}

function buildContextSnapshot(context: BuiltContext) {
  return {
    selectedDocuments: context.selectedDocuments.map((doc) => ({
      slug: doc.slug,
      title: doc.title,
    })),
    selectedFacts: context.selectedFacts.map((fact) => ({
      id: fact.id,
      statement: fact.statement,
    })),
    selectedGlossaryTerms: context.selectedGlossaryTerms.map((term) => ({
      term: term.term,
      definition: term.definition,
    })),
    selectedRecoveredArtifacts: context.selectedRecoveredArtifacts.map(
      (artifact) => ({
        slug: artifact.slug,
        title: artifact.title,
      })
    ),
    selectedMemoryItems: context.selectedMemoryItems.map((item) => ({
      id: item.id,
      type: item.type,
      scope: item.scope,
      statement: item.statement,
      ...(item.sessionId ? { sessionId: item.sessionId } : {}),
    })),
    consideredButSkippedDocuments: (
      context.consideredButSkippedDocuments ?? []
    ).map((doc) => ({
      slug: doc.slug,
      title: doc.title,
      reason: doc.reason,
    })),
    hadSessionSummary: Boolean(context.sessionSummary),
    recentMessageCount: context.recentMessages.length,
  };
}

function sanitizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 48);
}

function sanitizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of input) {
    if (typeof value !== "string") {
      continue;
    }

    const clean = sanitizeTag(value);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push(clean);
    if (out.length >= 12) {
      break;
    }
  }

  return out;
}

async function writeSession(
  product: ProductConfig,
  session: InquirySession
) {
  await sessionStoreFor(product).save(session);
}

async function ensureSessionSnapshot(
  sessionRoot: string,
  result: Awaited<ReturnType<typeof runSessionTurn>>
) {
  if (result.persistedTurn.contextSnapshot) {
    return result;
  }

  const contextSnapshot = buildContextSnapshot(result.context);
  result.persistedTurn.contextSnapshot = contextSnapshot;

  const lastTurn = result.session.turns.at(-1);
  if (lastTurn) {
    lastTurn.contextSnapshot = contextSnapshot;
  }

  await fs.mkdir(sessionRoot, { recursive: true });
  await fs.writeFile(
    path.join(sessionRoot, `${result.session.id}.json`),
    `${JSON.stringify(result.session, null, 2)}\n`,
    "utf8"
  );

  return result;
}

// ── Canon editorial helpers ───────────────────────────────────────────────

const proposalStore = new FileProposalStore(PROPOSALS_DIR);

function isProposalSource(value: unknown): value is ProposalSource {
  return (
    typeof value === "string" &&
    (PROPOSAL_SOURCES as readonly string[]).includes(value)
  );
}

function isProposalStatus(value: unknown): value is ProposalStatus {
  return (
    typeof value === "string" &&
    (PROPOSAL_STATUSES as readonly string[]).includes(value)
  );
}

function isProposalChangeKind(value: unknown): value is ProposalChangeKind {
  return (
    typeof value === "string" &&
    (PROPOSAL_CHANGE_KINDS as readonly string[]).includes(value)
  );
}

function sanitizeProposalString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

const WITNESS_CONSENT_STATUSES = [
  "granted",
  "denied",
  "revoked",
  "unknown",
] as const;
const WITNESS_CONSENT_ACTORS = [
  "witness",
  "operator",
  "system_import",
] as const;

function isWitnessConsentStatus(
  value: unknown
): value is (typeof WITNESS_CONSENT_STATUSES)[number] {
  return (
    typeof value === "string" &&
    (WITNESS_CONSENT_STATUSES as readonly string[]).includes(value)
  );
}

function isWitnessConsentActor(
  value: unknown
): value is (typeof WITNESS_CONSENT_ACTORS)[number] {
  return (
    typeof value === "string" &&
    (WITNESS_CONSENT_ACTORS as readonly string[]).includes(value)
  );
}

async function readCanonFileSafely(relPath: string): Promise<string | null> {
  if (!isEditableCanonFile(relPath)) {
    return null;
  }

  try {
    return await fs.readFile(resolveCanonPath(CANON_ROOT, relPath), "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function reviewActionForStatus(
  status: ProposalStatus
): ProposalReviewEntry["action"] {
  switch (status) {
    case "accepted":
      return "accepted";
    case "rejected":
      return "rejected";
    case "needs_revision":
      return "marked_needs_revision";
    case "pending":
      return "marked_pending";
  }
}

async function serveStaticHtml(res: http.ServerResponse, filename: string) {
  const html = await fs.readFile(path.join(STATIC_DIR, filename), "utf8");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

export async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  let url: URL;
  try {
    url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  if (url.pathname === "/api/reports") {
    try {
      const files = await fs.readdir(REPORTS_DIR);
      const reports = files
        .filter((f) => f.endsWith(".json"))
        .sort()
        .reverse();
      sendJson(res, 200, reports);
    } catch {
      sendJson(res, 200, []);
    }
    return;
  }

  if (url.pathname === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === "/api/diff") {
    const nameA = url.searchParams.get("a");
    const nameB = url.searchParams.get("b");
    if (!nameA || !nameB) {
      sendJson(res, 400, { error: "Both ?a= and ?b= are required" });
      return;
    }
    try {
      const [rawA, rawB] = await Promise.all([
        fs.readFile(path.join(REPORTS_DIR, nameA), "utf8"),
        fs.readFile(path.join(REPORTS_DIR, nameB), "utf8"),
      ]);
      const reportA = validateReport(JSON.parse(rawA)) as JsonReport;
      const reportB = validateReport(JSON.parse(rawB)) as JsonReport;
      const diff = computeDiff(reportA, reportB);
      diff.a.name = nameA;
      diff.b.name = nameB;
      sendJson(res, 200, diff);
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (url.pathname === "/api/providers") {
    const hasKey = Boolean(process.env.OPENROUTER_API_KEY);
    const envDefault = providerFromEnv();
    sendJson(res, 200, {
      hasApiKey: hasKey,
      defaultProvider: {
        name: envDefault.name,
        model: (envDefault as { model?: string }).model ?? "unknown",
      },
      available: hasKey
        ? ["openai", "openai-secondary", "anthropic", "gemini"]
        : ["mock"],
    });
    return;
  }

  if (url.pathname === "/api/inquiry/sessions") {
    const product = resolveProductConfig(url.searchParams.get("product"));
    if (!product) {
      sendJson(res, 400, { error: "Unknown product" });
      return;
    }
    try {
      sendJson(res, 200, await listSessionSummaries(product));
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (url.pathname === "/api/memory/conflicts") {
    const product = resolveProductConfig(url.searchParams.get("product"));
    if (!product) {
      sendJson(res, 400, { error: "Unknown product" });
      return;
    }
    try {
      const type = parseEnumParam<MemoryType>(
        url.searchParams.get("type"),
        MemoryTypeSchema
      );
      const scope = parseEnumParam<MemoryScope>(
        url.searchParams.get("scope"),
        MemoryScopeSchema
      );
      const statement = url.searchParams.get("statement");
      const sessionId = url.searchParams.get("sessionId") ?? undefined;
      if (!type || !scope || !statement) {
        sendJson(res, 400, {
          error: "type, scope, and statement query params are required",
        });
        return;
      }
      const conflicts = await memoryStoreFor(product).findConflicts({
        type,
        scope,
        statement,
        sessionId: scope === "session" ? sessionId : undefined,
      });
      sendJson(res, 200, { conflicts });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (url.pathname === "/api/memory") {
    if (req.method === "POST") {
      try {
        const body = (await readJsonBody(req)) as {
          product?: string;
          type?: string;
          scope?: string;
          statement?: string;
          justification?: string;
          confidence?: string;
          tags?: string[];
          sessionId?: string;
          state?: string;
          approvedBy?: string;
        };

        const typeParse = MemoryTypeSchema.safeParse(body.type);
        const scopeParse = MemoryScopeSchema.safeParse(body.scope);
        const product = resolveProductConfig(body.product);
        if (!product) {
          sendJson(res, 400, { error: "Unknown product" });
          return;
        }
        if (!typeParse.success || !scopeParse.success) {
          sendJson(res, 400, { error: "Invalid type or scope" });
          return;
        }
        if (!body.statement?.trim() || !body.justification?.trim()) {
          sendJson(res, 400, {
            error: "statement and justification are required",
          });
          return;
        }
        const stateParse = body.state
          ? MemoryStateSchema.safeParse(body.state)
          : null;
        const requestedState: MemoryState | undefined =
          stateParse?.success ? stateParse.data : undefined;
        if (requestedState && requestedState !== "proposed" && requestedState !== "accepted") {
          sendJson(res, 400, {
            error: "Manual create only supports state 'proposed' or 'accepted'",
          });
          return;
        }

        const item = await memoryStoreFor(product).create({
          type: typeParse.data,
          scope: scopeParse.data,
          statement: body.statement,
          justification: body.justification,
          confidence:
            body.confidence === "low" || body.confidence === "medium"
              ? body.confidence
              : "high",
          tags: Array.isArray(body.tags) ? body.tags : [],
          sessionId:
            scopeParse.data === "session" ? body.sessionId : undefined,
          origin: "operator",
          state: requestedState,
          approvedBy: body.approvedBy,
        });
        sendJson(res, 201, item);
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    const product = resolveProductConfig(url.searchParams.get("product"));
    if (!product) {
      sendJson(res, 400, { error: "Unknown product" });
      return;
    }
    try {
      const store = memoryStoreFor(product);
      let items = await store.list();
      const sessionId = url.searchParams.get("sessionId");
      const scope = url.searchParams.get("scope");
      const state = url.searchParams.get("state");
      const type = url.searchParams.get("type");

      if (sessionId) {
        items = items.filter((item) => item.sessionId === sessionId);
      }

      const turnId = url.searchParams.get("turnId");
      if (turnId) {
        items = items.filter(
          (item) =>
            item.createdFrom?.turnId === turnId ||
            item.lastConfirmedFrom?.turnId === turnId
        );
      }

      if (isMemoryScope(scope)) {
        items = items.filter((item) => item.scope === scope);
      }

      const stateFilter = parseEnumParam<MemoryState>(state, MemoryStateSchema);
      if (stateFilter) {
        items = items.filter((item) => item.state === stateFilter);
      }

      const typeFilter = parseEnumParam<MemoryType>(type, MemoryTypeSchema);
      if (typeFilter) {
        items = items.filter((item) => item.type === typeFilter);
      }

      sendJson(res, 200, items);
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  const memoryActionMatch = url.pathname.match(
    /^\/api\/memory\/([^/]+)\/([a-z]+)$/
  );
  if (memoryActionMatch && req.method === "POST") {
    const [, memoryId, actionRaw] = memoryActionMatch;
    if (!isMemoryAction(actionRaw)) {
      sendJson(res, 400, { error: `Unknown memory action: ${actionRaw}` });
      return;
    }
    const product = resolveProductConfig(url.searchParams.get("product"));
    if (!product) {
      sendJson(res, 400, { error: "Unknown product" });
      return;
    }
    try {
      const body = (await readJsonBody(req)) as {
        reason?: string;
        actor?: string;
        supersededById?: string;
      };
      const updated = await memoryStoreFor(product).transition(
        memoryId,
        {
          action: actionRaw,
          reason: body.reason,
          actor: body.actor,
          supersededById: body.supersededById,
        }
      );
      sendJson(res, 200, updated);
    } catch (err) {
      if (err instanceof MemoryTransitionError) {
        sendJson(res, 400, { error: err.message });
        return;
      }
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  const memoryItemMatch = url.pathname.match(/^\/api\/memory\/([^/]+)$/);
  if (memoryItemMatch) {
    const memoryId = memoryItemMatch[1];
    const product = resolveProductConfig(url.searchParams.get("product"));
    if (!product) {
      sendJson(res, 400, { error: "Unknown product" });
      return;
    }
    if (req.method === "DELETE") {
      try {
        const deleted = await memoryStoreFor(product).delete(memoryId);
        sendJson(res, 200, { deleted });
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }
    if (req.method === "PATCH") {
      try {
        const body = (await readJsonBody(req)) as {
          statement?: string;
          justification?: string;
          tags?: string[];
          confidence?: "high" | "medium" | "low";
        };
        const updated = await memoryStoreFor(product).patch(
          memoryId,
          body
        );
        sendJson(res, 200, updated);
      } catch (err) {
        if (err instanceof MemoryTransitionError) {
          sendJson(res, 400, { error: err.message });
          return;
        }
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }
    if (req.method === "GET") {
      try {
        const item = await memoryStoreFor(product).load(memoryId);
        if (!item) {
          sendJson(res, 404, { error: "Memory item not found" });
          return;
        }
        sendJson(res, 200, item);
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }
  }

  const inquirySessionMatch = url.pathname.match(/^\/api\/inquiry\/sessions\/([^/]+)$/);
  if (inquirySessionMatch && req.method === "GET") {
    const product = resolveProductConfig(url.searchParams.get("product"));
    if (!product) {
      sendJson(res, 400, { error: "Unknown product" });
      return;
    }
    try {
      const session = await readSession(product, inquirySessionMatch[1]);
      if (!session) {
        sendJson(res, 404, { error: "Session not found" });
        return;
      }

      sendJson(res, 200, session);
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (inquirySessionMatch && req.method === "PATCH") {
    const product = resolveProductConfig(url.searchParams.get("product"));
    if (!product) {
      sendJson(res, 400, { error: "Unknown product" });
      return;
    }
    try {
      const session = await readSession(product, inquirySessionMatch[1]);
      if (!session) {
        sendJson(res, 404, { error: "Session not found" });
        return;
      }

      const body = (await readJsonBody(req)) as {
        tags?: unknown;
        archived?: unknown;
        title?: unknown;
      };

      let changed = false;
      if (body.tags !== undefined) {
        session.tags = sanitizeTags(body.tags);
        changed = true;
      }

      if (body.archived !== undefined) {
        session.archived = Boolean(body.archived);
        changed = true;
      }

      if (body.title !== undefined) {
        if (body.title === null || body.title === "") {
          delete session.title;
        } else if (typeof body.title === "string") {
          session.title = body.title.trim().slice(0, 200) || undefined;
        }
        changed = true;
      }

      if (changed) {
        session.updatedAt = new Date().toISOString();
        await writeSession(product, session);
      }

      sendJson(res, 200, session);
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (inquirySessionMatch && req.method === "DELETE") {
    const product = resolveProductConfig(url.searchParams.get("product"));
    if (!product) {
      sendJson(res, 400, { error: "Unknown product" });
      return;
    }
    try {
      const filePath = path.join(product.sessionsRoot, `${inquirySessionMatch[1]}.json`);
      try {
        await fs.unlink(filePath);
        sendJson(res, 200, { deleted: true });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          sendJson(res, 404, { error: "Session not found" });
          return;
        }

        throw error;
      }
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  const inquiryRerunMatch = url.pathname.match(
    /^\/api\/inquiry\/sessions\/([^/]+)\/turns\/([^/]+)\/rerun$/
  );
  if (inquiryRerunMatch && req.method === "POST") {
    const product = resolveProductConfig(url.searchParams.get("product"));
    if (!product) {
      sendJson(res, 400, { error: "Unknown product" });
      return;
    }
    try {
      const session = await readSession(product, inquiryRerunMatch[1]);
      if (!session) {
        sendJson(res, 404, { error: "Session not found" });
        return;
      }

      const body = (await readJsonBody(req)) as {
        provider?: string;
        mode?: string;
        userMessageOverride?: string;
      };

      const providerName = isKnownProviderName(body.provider)
        ? body.provider
        : undefined;
      const provider = providerByName(providerName);

      const rerun = await runCompareTurn({
        session,
        turnId: inquiryRerunMatch[2],
        canonRoot: product.policyRoot,
        memoryRoot: product.memoryRoot,
        provider,
        mode: isMode(body.mode) ? body.mode : undefined,
        userMessageOverride:
          typeof body.userMessageOverride === "string" &&
          body.userMessageOverride.trim()
            ? body.userMessageOverride.trim()
            : undefined,
      });

      const targetIndex = session.turns.findIndex(
        (turn) => turn.id === inquiryRerunMatch[2]
      );
      if (targetIndex !== -1) {
        const target = session.turns[targetIndex];
        const reruns: SessionTurnRerun[] = Array.isArray(target.reruns)
          ? [...target.reruns, rerun]
          : [rerun];
        session.turns[targetIndex] = { ...target, reruns };
        session.updatedAt = new Date().toISOString();
        await writeSession(product, session);
      }

      sendJson(res, 200, { rerun, session });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (url.pathname === "/api/inquiry/preview" && req.method === "POST") {
    let body: {
      product?: string;
      witnessId?: string;
      sessionId?: string;
      mode?: string;
      userMessage?: string;
    } = {};
    try {
      body = (await readJsonBody(req)) as typeof body;
    } catch {
      sendJson(res, 400, { error: "Request body must be valid JSON." });
      return;
    }

    if (!body.userMessage || !body.userMessage.trim()) {
      sendJson(res, 400, { error: "userMessage is required" });
      return;
    }

    const product = resolveProductConfig(body.product);
    if (!product) {
      sendJson(res, 400, { error: "Unknown product" });
      return;
    }
    if (product.id === "witness" && !body.witnessId?.trim()) {
      sendJson(res, 400, { error: "witnessId is required for Witness inquiry." });
      return;
    }

    const previewMode = isMode(body.mode) ? body.mode : "dialogic";
    try {
      const sessionStore = sessionStoreFor(product);
      const existing = body.sessionId
        ? await sessionStore.load(body.sessionId)
        : null;
      const context = await buildContext({
        canonRoot: product.policyRoot,
        mode: previewMode,
        userMessage: body.userMessage.trim(),
        recentMessages: [],
        sessionSummary: existing?.summary?.text ?? undefined,
        sessionId: existing?.id,
        memoryRoot: product.memoryRoot,
      });
      sendJson(res, 200, {
        product: product.id,
        mode: previewMode,
        sessionId: existing?.id ?? null,
        snapshot: buildContextSnapshot(context),
      });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (url.pathname === "/api/inquiry/turn" && req.method === "POST") {
    let body: {
      product?: string;
      witnessId?: string;
      sessionId?: string;
      mode?: string;
      userMessage?: string;
      provider?: string;
    } = {};
    try {
      body = (await readJsonBody(req)) as typeof body;
    } catch {
      sendJson(res, 400, { error: "Request body must be valid JSON." });
      return;
    }

    if (!body.userMessage || !body.userMessage.trim()) {
      sendJson(res, 400, { error: "userMessage is required" });
      return;
    }

    const product = resolveProductConfig(body.product);
    if (!product) {
      sendJson(res, 400, { error: "Unknown product" });
      return;
    }
    if (product.id === "witness" && !body.witnessId?.trim()) {
      sendJson(res, 400, { error: "witnessId is required for Witness inquiry." });
      return;
    }

    const mode = isMode(body.mode) ? body.mode : "dialogic";
    const providerName = isKnownProviderName(body.provider)
      ? body.provider
      : undefined;
    const provider = providerName
      ? providerByName(providerName)
      : providerFromEnv();
    const providerLabel = {
      name: provider.name,
      model: (provider as { model?: string }).model ?? "unknown",
    };

    try {
      if (product.id === "witness") {
        const gate = await getWitnessConsentGate(
          consentStoreFor(product),
          body.witnessId!.trim()
        );
        if (!gate.allowed) {
          sendJson(res, 409, {
            error: "Witness consent requirements not met.",
            product: product.id,
            witnessId: body.witnessId!.trim(),
            missingScopes: gate.missingScopes,
          });
          return;
        }
      }

      const result = await ensureSessionSnapshot(
        product.sessionsRoot,
        await runSessionTurn(provider, {
          canonRoot: product.policyRoot,
          sessionsRoot: product.sessionsRoot,
          memoryRoot: product.memoryRoot,
          sessionId: body.sessionId,
          mode,
          userMessage: body.userMessage.trim(),
        })
      );

      let testimonyId: string | null = null;
      if (product.id === "witness") {
        const persisted = await persistWitnessTurnArtifacts({
          sessionRoot: product.sessionsRoot,
          testimonyStore: testimonyStoreFor(product),
          witnessId: body.witnessId!.trim(),
          session: result.session,
          persistedTurn: result.persistedTurn,
        });
        result.session = persisted.session;
        testimonyId = persisted.testimonyId;
      }

      sendJson(res, 200, {
        product: product.id,
        session: result.session,
        persistedTurn: result.persistedTurn,
        memoryDecision: result.memoryDecision,
        provider: providerLabel,
        ...(testimonyId ? { testimonyId } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isLocalFailure = /manifest|glossary|continuity|recovered|policy|canon|ENOENT/i.test(
        message
      );
      sendJson(res, isLocalFailure ? 500 : 502, {
        error: message,
        retryable: !isLocalFailure,
        product: product.id,
        provider: providerLabel,
        failedAt: new Date().toISOString(),
        userMessage: body.userMessage.trim(),
        mode,
        sessionId: body.sessionId ?? null,
      });
    }
    return;
  }

  if (url.pathname === "/api/witness/consent") {
    const store = consentStoreFor(WITNESS_CONFIG);
    if (req.method === "GET") {
      const witnessId = url.searchParams.get("witnessId")?.trim();
      if (!witnessId) {
        sendJson(res, 400, { error: "witnessId is required" });
        return;
      }
      try {
        sendJson(res, 200, await listConsentForWitness(store, witnessId));
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    if (req.method === "POST") {
      try {
        const body = (await readJsonBody(req)) as {
          witnessId?: string;
          testimonyId?: string;
          scope?: string;
          status?: string;
          actor?: string;
          decidedAt?: string;
          note?: string;
        };
        if (!body.witnessId?.trim()) {
          sendJson(res, 400, { error: "witnessId is required" });
          return;
        }
        if (!isConsentScope(body.scope)) {
          sendJson(res, 400, { error: "Invalid consent scope" });
          return;
        }
        if (!isWitnessConsentStatus(body.status)) {
          sendJson(res, 400, { error: "Invalid consent status" });
          return;
        }
        if (!isWitnessConsentActor(body.actor)) {
          sendJson(res, 400, { error: "Invalid consent actor" });
          return;
        }

        const created = await store.appendDecision({
          witnessId: body.witnessId.trim(),
          testimonyId: body.testimonyId?.trim() || undefined,
          scope: body.scope,
          status: body.status,
          actor: body.actor,
          decidedAt: body.decidedAt?.trim() || new Date().toISOString(),
          note: typeof body.note === "string" ? body.note.trim() || undefined : undefined,
        });
        sendJson(res, 201, created);
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }
  }

  if (url.pathname === "/api/witness/testimony" && req.method === "GET") {
    const witnessId = url.searchParams.get("witnessId")?.trim();
    if (!witnessId) {
      sendJson(res, 400, { error: "witnessId is required" });
      return;
    }
    try {
      const items = (await testimonyStoreFor(WITNESS_CONFIG).list()).filter(
        (record) => record.witnessId === witnessId
      );
      sendJson(res, 200, items);
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  const witnessTestimonyMatch = url.pathname.match(/^\/api\/witness\/testimony\/([^/]+)$/);
  if (witnessTestimonyMatch && req.method === "GET") {
    try {
      const item = await testimonyStoreFor(WITNESS_CONFIG).load(
        witnessTestimonyMatch[1]
      );
      if (!item) {
        sendJson(res, 404, { error: "Testimony not found" });
        return;
      }
      sendJson(res, 200, item);
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  // ── Canon editorial API ─────────────────────────────────────────────────

  if (url.pathname === "/api/canon/files" && req.method === "GET") {
    sendJson(
      res,
      200,
      EDITABLE_CANON_FILES.map((file) => ({
        path: file,
        label: canonFileLabel(file),
      }))
    );
    return;
  }

  const canonFileMatch = url.pathname.match(/^\/api\/canon\/files\/(.+)$/);
  if (canonFileMatch && req.method === "GET") {
    const relPath = decodeURIComponent(canonFileMatch[1]);
    if (!isEditableCanonFile(relPath)) {
      sendJson(res, 404, { error: "Canon file not editable or unknown" });
      return;
    }

    try {
      const content = await readCanonFileSafely(relPath);
      sendJson(res, 200, {
        path: relPath,
        label: canonFileLabel(relPath),
        content: content ?? "",
        exists: content !== null,
      });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (url.pathname === "/api/canon/proposals" && req.method === "GET") {
    try {
      let proposals = await proposalStore.list();
      const status = url.searchParams.get("status");
      const source = url.searchParams.get("source");
      const targetPath = url.searchParams.get("path");
      if (isProposalStatus(status)) {
        proposals = proposals.filter((p) => p.status === status);
      }
      if (isProposalSource(source)) {
        proposals = proposals.filter((p) => p.provenance.source === source);
      }
      if (targetPath) {
        proposals = proposals.filter((p) => p.target.path === targetPath);
      }
      sendJson(res, 200, proposals);
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (url.pathname === "/api/canon/proposals" && req.method === "POST") {
    try {
      const body = (await readJsonBody(req)) as {
        title?: unknown;
        targetPath?: unknown;
        changeKind?: unknown;
        afterContent?: unknown;
        rationale?: unknown;
        provenance?: {
          source?: unknown;
          sessionId?: unknown;
          turnId?: unknown;
          memoryId?: unknown;
          reflectionId?: unknown;
          note?: unknown;
        };
        createdBy?: unknown;
      };

      const title = sanitizeProposalString(body.title, 200);
      const rationale = sanitizeProposalString(body.rationale, 4000);
      const targetPath = sanitizeProposalString(body.targetPath, 200);
      const changeKind = body.changeKind;
      const provenanceSource = body.provenance?.source;

      if (!title) {
        sendJson(res, 400, { error: "title is required" });
        return;
      }

      if (!rationale) {
        sendJson(res, 400, { error: "rationale is required" });
        return;
      }

      if (!isEditableCanonFile(targetPath)) {
        sendJson(res, 400, {
          error: `targetPath must be one of: ${EDITABLE_CANON_FILES.join(", ")}`,
        });
        return;
      }

      if (!isProposalChangeKind(changeKind)) {
        sendJson(res, 400, {
          error: `changeKind must be one of: ${PROPOSAL_CHANGE_KINDS.join(", ")}`,
        });
        return;
      }

      if (!isProposalSource(provenanceSource)) {
        sendJson(res, 400, {
          error: `provenance.source must be one of: ${PROPOSAL_SOURCES.join(", ")}`,
        });
        return;
      }

      const beforeContent = await readCanonFileSafely(targetPath);

      let afterContent: string | null = null;
      if (changeKind === "delete") {
        afterContent = null;
        if (beforeContent === null) {
          sendJson(res, 400, {
            error: `Cannot propose deletion of ${targetPath}: file does not exist`,
          });
          return;
        }
      } else {
        if (typeof body.afterContent !== "string") {
          sendJson(res, 400, {
            error: "afterContent must be a string for create/modify proposals",
          });
          return;
        }
        afterContent = body.afterContent;

        if (changeKind === "create" && beforeContent !== null) {
          sendJson(res, 400, {
            error: `Cannot propose creation of ${targetPath}: file already exists`,
          });
          return;
        }
        if (changeKind === "modify" && beforeContent === null) {
          sendJson(res, 400, {
            error: `Cannot propose modification of ${targetPath}: file does not exist`,
          });
          return;
        }
      }

      const now = new Date().toISOString();
      const provenance = {
        source: provenanceSource,
        sessionId: sanitizeProposalString(body.provenance?.sessionId, 200) || undefined,
        turnId: sanitizeProposalString(body.provenance?.turnId, 200) || undefined,
        memoryId: sanitizeProposalString(body.provenance?.memoryId, 200) || undefined,
        reflectionId:
          sanitizeProposalString(body.provenance?.reflectionId, 200) || undefined,
        note: sanitizeProposalString(body.provenance?.note, 1000) || undefined,
      };

      const proposal: CanonProposal = CanonProposalSchema.parse({
        schemaVersion: PROPOSAL_SCHEMA_VERSION,
        id: randomUUID(),
        title,
        status: "pending",
        changeKind,
        target: {
          path: targetPath,
          label: canonFileLabel(targetPath),
          kind: targetPath.endsWith(".yaml")
            ? targetPath === "manifest.yaml"
              ? "manifest"
              : targetPath === "glossary.yaml"
                ? "glossary_term"
                : targetPath === "continuity-facts.yaml"
                  ? "continuity_fact"
                  : "canon_document"
            : "canon_document",
        },
        beforeContent,
        afterContent,
        rationale,
        provenance,
        createdAt: now,
        updatedAt: now,
        reviewHistory: [
          {
            at: now,
            action: "created",
            status: "pending",
            note: provenance.note,
          },
        ],
        createdBy: sanitizeProposalString(body.createdBy, 100) || undefined,
      });

      const saved = await proposalStore.save(proposal);
      sendJson(res, 201, saved);
    } catch (err) {
      sendJson(res, 400, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (
    url.pathname === "/api/canon/proposals/draft-continuity-fact" &&
    req.method === "POST"
  ) {
    try {
      const body = (await readJsonBody(req)) as {
        statement?: unknown;
        category?: unknown;
        status?: unknown;
        source?: unknown;
        rationale?: unknown;
        provenance?: {
          source?: unknown;
          sessionId?: unknown;
          turnId?: unknown;
          memoryId?: unknown;
          reflectionId?: unknown;
          note?: unknown;
        };
        title?: unknown;
        factId?: unknown;
      };

      const statement = sanitizeProposalString(body.statement, 1000);
      const category = sanitizeProposalString(body.category, 80);
      const status = sanitizeProposalString(body.status, 40) || "active";
      const source = sanitizeProposalString(body.source, 200) || undefined;
      const rationale = sanitizeProposalString(body.rationale, 4000);
      const provenanceSource = body.provenance?.source ?? "manual";

      if (!statement) {
        sendJson(res, 400, { error: "statement is required" });
        return;
      }
      if (!category) {
        sendJson(res, 400, { error: "category is required" });
        return;
      }
      if (!rationale) {
        sendJson(res, 400, { error: "rationale is required" });
        return;
      }
      if (!isProposalSource(provenanceSource)) {
        sendJson(res, 400, {
          error: `provenance.source must be one of: ${PROPOSAL_SOURCES.join(", ")}`,
        });
        return;
      }

      const beforeContent = await readCanonFileSafely("continuity-facts.yaml");
      if (beforeContent === null) {
        sendJson(res, 500, { error: "continuity-facts.yaml is missing" });
        return;
      }

      const facts = parseContinuityFacts(beforeContent);
      const requestedId = sanitizeProposalString(body.factId, 20);
      const factId = requestedId || nextContinuityFactId(facts);

      if (!/^CF-\d{3,}$/.test(factId)) {
        sendJson(res, 400, {
          error: `factId must match CF-NNN; got ${factId}`,
        });
        return;
      }

      if (facts.some((fact) => fact.id === factId)) {
        sendJson(res, 400, {
          error: `Continuity fact ${factId} already exists; use a modify proposal instead`,
        });
        return;
      }

      const afterContent = appendContinuityFact(beforeContent, {
        id: factId,
        statement,
        category,
        status,
        source,
      });

      const now = new Date().toISOString();
      const provenance = {
        source: provenanceSource,
        sessionId:
          sanitizeProposalString(body.provenance?.sessionId, 200) || undefined,
        turnId: sanitizeProposalString(body.provenance?.turnId, 200) || undefined,
        memoryId: sanitizeProposalString(body.provenance?.memoryId, 200) || undefined,
        reflectionId:
          sanitizeProposalString(body.provenance?.reflectionId, 200) || undefined,
        note: sanitizeProposalString(body.provenance?.note, 1000) || undefined,
      };

      const title =
        sanitizeProposalString(body.title, 200) ||
        `Add continuity fact ${factId}`;

      const proposal = CanonProposalSchema.parse({
        schemaVersion: PROPOSAL_SCHEMA_VERSION,
        id: randomUUID(),
        title,
        status: "pending",
        changeKind: "modify",
        target: {
          path: "continuity-facts.yaml",
          label: canonFileLabel("continuity-facts.yaml"),
          kind: "continuity_fact",
          factId,
        },
        beforeContent,
        afterContent,
        rationale,
        provenance,
        createdAt: now,
        updatedAt: now,
        reviewHistory: [
          {
            at: now,
            action: "created",
            status: "pending",
            note: `Drafted continuity fact ${factId} in category ${category}`,
          },
        ],
      });

      const saved = await proposalStore.save(proposal);
      sendJson(res, 201, saved);
    } catch (err) {
      sendJson(res, 400, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  const proposalIdMatch = url.pathname.match(
    /^\/api\/canon\/proposals\/([0-9a-f-]{36})$/i
  );
  if (proposalIdMatch && req.method === "GET") {
    try {
      const proposal = await proposalStore.load(proposalIdMatch[1]);
      if (!proposal) {
        sendJson(res, 404, { error: "Proposal not found" });
        return;
      }
      sendJson(res, 200, proposal);
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (proposalIdMatch && req.method === "PATCH") {
    try {
      const proposal = await proposalStore.load(proposalIdMatch[1]);
      if (!proposal) {
        sendJson(res, 404, { error: "Proposal not found" });
        return;
      }

      const body = (await readJsonBody(req)) as {
        status?: unknown;
        note?: unknown;
        reviewer?: unknown;
        rationale?: unknown;
        afterContent?: unknown;
        title?: unknown;
      };

      const note = sanitizeProposalString(body.note, 2000) || undefined;
      const reviewer = sanitizeProposalString(body.reviewer, 100) || undefined;
      const now = new Date().toISOString();
      const reviewHistory = [...proposal.reviewHistory];
      let updated: CanonProposal = { ...proposal, updatedAt: now };

      if (typeof body.title === "string") {
        const newTitle = sanitizeProposalString(body.title, 200);
        if (newTitle && newTitle !== proposal.title) {
          updated.title = newTitle;
          reviewHistory.push({
            at: now,
            action: "edited",
            note: `title → ${newTitle}`,
            reviewer,
          });
        }
      }

      if (typeof body.rationale === "string") {
        const newRationale = sanitizeProposalString(body.rationale, 4000);
        if (newRationale && newRationale !== proposal.rationale) {
          updated.rationale = newRationale;
          reviewHistory.push({
            at: now,
            action: "edited",
            note: "rationale updated",
            reviewer,
          });
        }
      }

      if (typeof body.afterContent === "string") {
        if (proposal.status === "accepted" || proposal.status === "rejected") {
          sendJson(res, 400, {
            error: `Cannot edit afterContent of a ${proposal.status} proposal`,
          });
          return;
        }
        if (updated.changeKind === "delete") {
          sendJson(res, 400, {
            error: "Cannot set afterContent on a delete proposal",
          });
          return;
        }
        if (body.afterContent !== proposal.afterContent) {
          updated.afterContent = body.afterContent;
          reviewHistory.push({
            at: now,
            action: "edited",
            note: "afterContent updated",
            reviewer,
          });
        }
      }

      if (body.status !== undefined) {
        if (!isProposalStatus(body.status)) {
          sendJson(res, 400, {
            error: `status must be one of: ${PROPOSAL_STATUSES.join(", ")}`,
          });
          return;
        }

        const target = body.status;
        const current = proposal.status;
        // State machine: terminal states cannot transition further.
        if (
          (current === "accepted" || current === "rejected") &&
          target !== current
        ) {
          sendJson(res, 400, {
            error: `Proposal in terminal state '${current}' cannot transition`,
          });
          return;
        }

        if (current !== target || note !== undefined) {
          updated.status = target;
          reviewHistory.push({
            at: now,
            action: reviewActionForStatus(target),
            status: target,
            note,
            reviewer,
          });

          if (target === "accepted") {
            updated.acceptedAt = now;
            const apply = await applyProposal(CANON_ROOT, updated, { now });
            updated.appliedAt = apply.appliedAt;
            reviewHistory.push({
              at: apply.appliedAt,
              action: "applied",
              note: `Wrote ${apply.relPath}`,
              reviewer,
            });

            const scaffold = await scaffoldChangelogEntry(
              CANON_ROOT,
              { ...updated, reviewHistory },
              { now }
            );
            updated.changelogPath = scaffold.relPath;
            reviewHistory.push({
              at: now,
              action: "changelog_scaffolded",
              note: scaffold.relPath,
              reviewer,
            });
          } else if (target === "rejected") {
            updated.rejectedAt = now;
          }
        }
      } else if (note !== undefined) {
        reviewHistory.push({
          at: now,
          action: "edited",
          status: proposal.status,
          note,
          reviewer,
        });
      }

      updated.reviewHistory = reviewHistory;
      const saved = await proposalStore.save(updated);
      sendJson(res, 200, saved);
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (proposalIdMatch && req.method === "DELETE") {
    try {
      const existing = await proposalStore.load(proposalIdMatch[1]);
      if (!existing) {
        sendJson(res, 404, { error: "Proposal not found" });
        return;
      }
      if (existing.status === "accepted") {
        sendJson(res, 400, {
          error:
            "Cannot delete an accepted proposal; it is already part of canon history",
        });
        return;
      }
      const deleted = await proposalStore.delete(proposalIdMatch[1]);
      sendJson(res, 200, { deleted });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  const proposalDiffMatch = url.pathname.match(
    /^\/api\/canon\/proposals\/([0-9a-f-]{36})\/diff$/i
  );
  if (proposalDiffMatch && req.method === "GET") {
    try {
      const proposal = await proposalStore.load(proposalDiffMatch[1]);
      if (!proposal) {
        sendJson(res, 404, { error: "Proposal not found" });
        return;
      }
      const diff = computeLineDiff(proposal.beforeContent, proposal.afterContent);
      sendJson(res, 200, {
        proposalId: proposal.id,
        target: proposal.target,
        changeKind: proposal.changeKind,
        ...diff,
      });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (
    url.pathname === "/api/canon/continuity-facts/next-id" &&
    req.method === "GET"
  ) {
    try {
      const content = await readCanonFileSafely("continuity-facts.yaml");
      if (content === null) {
        sendJson(res, 500, { error: "continuity-facts.yaml is missing" });
        return;
      }
      const facts = parseContinuityFacts(content);
      sendJson(res, 200, {
        nextId: nextContinuityFactId(facts),
        existingCount: facts.length,
      });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  const reportMatch = url.pathname.match(/^\/api\/reports\/(.+\.json)$/);
  if (reportMatch) {
    const reportPath = path.join(REPORTS_DIR, reportMatch[1]);
    try {
      const data = await fs.readFile(reportPath, "utf8");
      const validated = validateReport(JSON.parse(data));
      sendJson(res, 200, validated);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        sendJson(res, 404, { error: "Report not found" });
      } else {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : "Report invalid",
        });
      }
    }
    return;
  }

  // ── Reflection topics ──────────────────────────────────
  if (url.pathname === "/api/reflection/topics") {
    const store = new FileReflectionStore(REFLECTION_DIR);
    if (req.method === "GET") {
      try {
        sendJson(res, 200, await store.listTopics());
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }
    if (req.method === "POST") {
      try {
        const body = (await readJsonBody(req)) as {
          title?: string;
          prompt?: string;
          notes?: string;
          linkedSessionIds?: string[];
          tags?: string[];
        };
        if (!body.title?.trim() || !body.prompt?.trim()) {
          sendJson(res, 400, { error: "title and prompt are required" });
          return;
        }
        const topic = await store.createTopic({
          title: body.title,
          prompt: body.prompt,
          notes: body.notes,
          linkedSessionIds: Array.isArray(body.linkedSessionIds)
            ? body.linkedSessionIds
            : [],
          tags: Array.isArray(body.tags) ? body.tags : [],
        });
        sendJson(res, 201, topic);
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }
  }

  const topicMatch = url.pathname.match(/^\/api\/reflection\/topics\/([^/]+)$/);
  if (topicMatch) {
    const store = new FileReflectionStore(REFLECTION_DIR);
    const id = topicMatch[1];
    if (req.method === "GET") {
      try {
        const topic = await store.loadTopic(id);
        if (!topic) {
          sendJson(res, 404, { error: "Topic not found" });
          return;
        }
        const runs = (await store.listRuns()).filter((r) => r.topicId === id);
        sendJson(res, 200, { topic, runs });
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }
    if (req.method === "PATCH") {
      try {
        const body = (await readJsonBody(req)) as {
          title?: string;
          prompt?: string;
          notes?: string | null;
          linkedSessionIds?: string[];
          tags?: string[];
        };
        const updated = await store.patchTopic(id, body);
        sendJson(res, 200, updated);
      } catch (err) {
        if (err instanceof ReflectionStoreError) {
          sendJson(res, 400, { error: err.message });
          return;
        }
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }
    if (req.method === "DELETE") {
      try {
        const deleted = await store.deleteTopic(id);
        sendJson(res, deleted ? 200 : 404, { deleted });
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }
  }

  const topicArchiveMatch = url.pathname.match(
    /^\/api\/reflection\/topics\/([^/]+)\/archive$/
  );
  if (topicArchiveMatch && req.method === "POST") {
    const store = new FileReflectionStore(REFLECTION_DIR);
    try {
      const body = (await readJsonBody(req)) as { reason?: string };
      const updated = await store.transitionTopic(
        topicArchiveMatch[1],
        "archived",
        { archivedReason: body.reason }
      );
      sendJson(res, 200, updated);
    } catch (err) {
      if (err instanceof ReflectionStoreError) {
        sendJson(res, 400, { error: err.message });
        return;
      }
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  // ── Reflection run ─────────────────────────────────────
  const topicRunMatch = url.pathname.match(
    /^\/api\/reflection\/topics\/([^/]+)\/run$/
  );
  if (topicRunMatch && req.method === "POST") {
    const store = new FileReflectionStore(REFLECTION_DIR);
    const artifactStore = new FileAuthoredArtifactStore(ARTIFACT_DIR);
    try {
      const body = (await readJsonBody(req)) as {
        provider?: string;
        linkedSessionContext?: string;
      };
      const topic = await store.loadTopic(topicRunMatch[1]);
      if (!topic) {
        sendJson(res, 404, { error: "Topic not found" });
        return;
      }
      if (topic.state === "archived") {
        sendJson(res, 400, { error: "Cannot run an archived topic" });
        return;
      }
      const providerName = isKnownProviderName(body.provider)
        ? body.provider
        : undefined;
      const provider = providerName
        ? providerByName(providerName)
        : providerFromEnv();

      const { run } = await runReflection(provider, {
        topic,
        canonRoot: CANON_ROOT,
        linkedSessionContext: body.linkedSessionContext,
      });
      const persistedRun = await store.saveRun(run);
      const updatedTopic = await store.transitionTopic(topic.id, "drafted", {
        lastRunId: persistedRun.id,
      });
      const artifact = await artifactStore.create({
        topicId: topic.id,
        runId: persistedRun.id,
        title: topic.title,
        body: persistedRun.final,
        linkedSessionIds: topic.linkedSessionIds,
        provider: persistedRun.provider,
        canonVersion: persistedRun.canonVersion,
      });

      sendJson(res, 200, {
        topic: updatedTopic,
        run: persistedRun,
        artifact,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 502, { error: message, retryable: true });
    }
    return;
  }

  const runMatch = url.pathname.match(/^\/api\/reflection\/runs\/([^/]+)$/);
  if (runMatch && req.method === "GET") {
    try {
      const run = await new FileReflectionStore(REFLECTION_DIR).loadRun(
        runMatch[1]
      );
      if (!run) {
        sendJson(res, 404, { error: "Run not found" });
        return;
      }
      sendJson(res, 200, run);
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  // ── Authored artifacts ─────────────────────────────────
  if (url.pathname === "/api/artifacts" && req.method === "GET") {
    try {
      const store = new FileAuthoredArtifactStore(ARTIFACT_DIR);
      let items = await store.list();
      const topicId = url.searchParams.get("topicId");
      const status = url.searchParams.get("status");
      if (topicId) items = items.filter((i) => i.topicId === topicId);
      if (
        status === "draft" ||
        status === "approved" ||
        status === "publishing_ready" ||
        status === "archived"
      ) {
        items = items.filter((i) => i.status === status);
      }
      sendJson(res, 200, items);
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  const artifactItemMatch = url.pathname.match(/^\/api\/artifacts\/([^/]+)$/);
  if (artifactItemMatch) {
    const store = new FileAuthoredArtifactStore(ARTIFACT_DIR);
    const id = artifactItemMatch[1];
    if (req.method === "GET") {
      try {
        const a = await store.load(id);
        if (!a) {
          sendJson(res, 404, { error: "Artifact not found" });
          return;
        }
        sendJson(res, 200, a);
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }
    if (req.method === "PATCH") {
      try {
        const body = (await readJsonBody(req)) as {
          title?: string;
          body?: string;
        };
        const updated = await store.patch(id, body);
        sendJson(res, 200, updated);
      } catch (err) {
        if (err instanceof AuthoredArtifactStoreError) {
          sendJson(res, 400, { error: err.message });
          return;
        }
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }
    if (req.method === "DELETE") {
      try {
        const deleted = await store.delete(id);
        sendJson(res, deleted ? 200 : 404, { deleted });
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }
  }

  const artifactActionMatch = url.pathname.match(
    /^\/api\/artifacts\/([^/]+)\/(approve|archive|publishing-ready|propose-to-canon)$/
  );
  if (artifactActionMatch && req.method === "POST") {
    const store = new FileAuthoredArtifactStore(ARTIFACT_DIR);
    const [, id, action] = artifactActionMatch;
    try {
      const body = (await readJsonBody(req)) as {
        approvedBy?: string;
        reason?: string;
        proposedChange?: string;
        proposedBy?: string;
      };
      if (action === "propose-to-canon") {
        const artifact = await store.load(id);
        if (!artifact) {
          sendJson(res, 404, { error: "Artifact not found" });
          return;
        }
        const proposal = await promoteArtifactToProposal({
          artifact,
          canonRoot: CANON_ROOT,
          proposedChange: body.proposedChange,
          proposedBy: body.proposedBy,
        });
        const updated = await store.attachProposalRef(id, {
          proposalId: proposal.proposalId,
          proposalPath: path.relative(REPO_ROOT, proposal.proposalPath),
          createdAt: proposal.createdAt,
        });
        sendJson(res, 200, { artifact: updated, proposal });
        return;
      }

      const nextStatus: AuthoredArtifactStatus =
        action === "approve"
          ? "approved"
          : action === "publishing-ready"
            ? "publishing_ready"
            : "archived";
      const updated = await store.transition(id, nextStatus, {
        approvedBy: body.approvedBy,
        reason: body.reason,
      });
      sendJson(res, 200, updated);
    } catch (err) {
      if (err instanceof AuthoredArtifactStoreError) {
        sendJson(res, 400, { error: err.message });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      const status = /must be approved|already has/.test(message) ? 400 : 500;
      sendJson(res, status, { error: message });
    }
    return;
  }

  if (url.pathname === "/api/canon/changelog" && req.method === "GET") {
    try {
      const dir = path.join(CANON_ROOT, "changelog");
      let files: string[] = [];
      try {
        files = (await fs.readdir(dir))
          .filter((f) => f.endsWith(".md"))
          .sort();
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") throw err;
      }
      const entries = await Promise.all(
        files.map(async (file) => {
          const raw = await fs.readFile(path.join(dir, file), "utf8");
          const firstLine = raw.split(/\r?\n/).find((l) => l.startsWith("# "));
          return {
            file,
            path: `packages/canon/changelog/${file}`,
            title: firstLine ? firstLine.replace(/^#\s+/, "") : file,
            body: raw,
          };
        })
      );
      sendJson(res, 200, entries);
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (url.pathname === "/api/search" && req.method === "GET") {
    const qRaw = (url.searchParams.get("q") ?? "").trim();
    const product = resolveProductConfig(url.searchParams.get("product"));
    if (!product) {
      sendJson(res, 400, { error: "Unknown product" });
      return;
    }
    if (!qRaw) {
      sendJson(res, 200, { query: "", results: [] });
      return;
    }
    const q = qRaw.toLowerCase();
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") ?? "40", 10) || 40,
      200
    );
    type SearchHit = {
      type:
        | "session"
        | "turn"
        | "memory"
        | "proposal"
        | "artifact"
        | "report"
        | "case";
      id: string;
      label: string;
      sublabel?: string;
      href: string;
      sessionId?: string;
    };
    const results: SearchHit[] = [];
    const inquiryBaseParams = new URLSearchParams();
    inquiryBaseParams.set("product", product.id);

    // Sessions + turns
    try {
      const sessionStore = sessionStoreFor(product);
      const sessionFiles = await fs
        .readdir(product.sessionsRoot)
        .catch((err) =>
          (err as NodeJS.ErrnoException).code === "ENOENT" ? [] : Promise.reject(err)
        );
      for (const file of sessionFiles) {
        if (!file.endsWith(".json")) continue;
        const id = file.slice(0, -5);
        const session = await sessionStore.load(id).catch(() => null);
        if (!session) continue;
        const sessionParams = new URLSearchParams(inquiryBaseParams);
        sessionParams.set("sessionId", session.id);
        if (session.witnessId) {
          sessionParams.set("witnessId", session.witnessId);
        }
        const title =
          session.title || session.summary?.text?.slice(0, 60) || `Session ${id.slice(0, 8)}`;
        const haystack = [
          session.title ?? "",
          session.summary?.text ?? "",
          ...(session.tags ?? []),
        ]
          .join(" ")
          .toLowerCase();
        if (haystack.includes(q)) {
          results.push({
            type: "session",
            id: session.id,
            label: title,
            sublabel: `${session.turns.length} turn${session.turns.length === 1 ? "" : "s"}`,
            href: `/inquiry.html?${sessionParams.toString()}`,
            sessionId: session.id,
          });
        }
        for (const turn of session.turns) {
          const turnHay = `${turn.userMessage}\n${turn.assistantMessage}`.toLowerCase();
          if (turnHay.includes(q)) {
            const turnParams = new URLSearchParams(sessionParams);
            turnParams.set("turnId", turn.id);
            results.push({
              type: "turn",
              id: turn.id,
              label: turn.userMessage.slice(0, 80),
              sublabel: `${title} · ${turn.mode}`,
              href: `/inquiry.html?${turnParams.toString()}`,
              sessionId: session.id,
            });
          }
        }
      }
    } catch {
      /* ignore */
    }

    // Memory
    try {
      const items = await memoryStoreFor(product).list();
      for (const item of items) {
        const hay = [item.statement, item.justification, ...(item.tags ?? [])]
          .join(" ")
          .toLowerCase();
        if (hay.includes(q)) {
          const memoryParams = new URLSearchParams(inquiryBaseParams);
          memoryParams.set("focus", "memory");
          memoryParams.set("memoryId", item.id);
          if (item.sessionId) {
            memoryParams.set("sessionId", item.sessionId);
          }
          results.push({
            type: "memory",
            id: item.id,
            label: item.statement.slice(0, 80),
            sublabel: `${item.type} · ${item.state}${item.sessionId ? ` · ${item.sessionId.slice(0, 8)}` : ""}`,
            href: `/inquiry.html?${memoryParams.toString()}`,
            sessionId: item.sessionId,
          });
        }
      }
    } catch {
      /* ignore */
    }

    // Proposals
    if (product.capabilities.editorial || product.capabilities.authoring) {
      try {
        const proposals = await proposalStore.list();
        for (const p of proposals) {
          const hay = [p.title, p.rationale, p.target.path, p.target.label]
            .join(" ")
            .toLowerCase();
          if (hay.includes(q)) {
            results.push({
              type: "proposal",
              id: p.id,
              label: p.title,
              sublabel: `${p.status} · ${p.target.path}`,
              href: `/editorial.html?proposal=${encodeURIComponent(p.id)}`,
            });
          }
        }
      } catch {
        /* ignore */
      }

      // Artifacts
      try {
        const artifactStore = new FileAuthoredArtifactStore(ARTIFACT_DIR);
        const artifacts = await artifactStore.list();
        for (const a of artifacts) {
          const hay = [a.title, a.body].join(" ").toLowerCase();
          if (hay.includes(q)) {
            results.push({
              type: "artifact",
              id: a.id,
              label: a.title,
              sublabel: `${a.status} · topic ${a.topicId.slice(0, 8)}`,
              href: `/authoring.html?topic=${encodeURIComponent(a.topicId)}&artifact=${encodeURIComponent(a.id)}`,
            });
          }
        }
      } catch {
        /* ignore */
      }
    }

    // Reports + cases
    try {
      const reportFiles = (await fs.readdir(REPORTS_DIR).catch(() => []))
        .filter((f) => f.endsWith(".json"))
        .sort()
        .reverse()
        .slice(0, 6);
      for (const file of reportFiles) {
        try {
          const raw = await fs.readFile(path.join(REPORTS_DIR, file), "utf8");
          const report = JSON.parse(raw) as {
            results?: Array<{
              id: string;
              description?: string;
              category?: string;
              passed?: boolean;
            }>;
          };
          if (file.toLowerCase().includes(q)) {
            results.push({
              type: "report",
              id: file,
              label: file,
              sublabel: "report",
              href: `/#report-page&report=${encodeURIComponent(file)}`,
            });
          }
          for (const c of report.results ?? []) {
            const hay = `${c.id} ${c.description ?? ""} ${c.category ?? ""}`.toLowerCase();
            if (hay.includes(q)) {
              results.push({
                type: "case",
                id: c.id,
                label: c.id,
                sublabel: `${c.category ?? "case"} · ${c.passed ? "PASS" : "FAIL"} · ${file}`,
                href: `/#report-page&report=${encodeURIComponent(file)}&case=${encodeURIComponent(c.id)}`,
              });
            }
          }
        } catch {
          /* ignore individual report failures */
        }
      }
    } catch {
      /* ignore */
    }

    sendJson(res, 200, {
      query: qRaw,
      results: results.slice(0, limit),
      truncated: results.length > limit,
      total: results.length,
    });
    return;
  }

  if (url.pathname.endsWith(".js") && !url.pathname.includes("..")) {
    try {
      const filePath = path.join(STATIC_DIR, url.pathname.replace(/^\//, ""));
      const js = await fs.readFile(filePath, "utf8");
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end(js);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    await serveStaticHtml(res, "index.html");
    return;
  }

  if (url.pathname === "/inquiry.html") {
    await serveStaticHtml(res, "inquiry.html");
    return;
  }

  if (url.pathname === "/editorial.html") {
    await serveStaticHtml(res, "editorial.html");
    return;
  }

  if (url.pathname === "/authoring.html") {
    await serveStaticHtml(res, "authoring.html");
    return;
  }

  res.writeHead(404);
  res.end("Not found");
}

export function createDashboardServer() {
  return http.createServer(handleRequest);
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  const server = createDashboardServer();
  server.listen(PORT, HOST, () => {
    console.log(`\n  G_5.2 Operator Dashboard`);
    console.log(`  http://${HOST}:${PORT}`);
    console.log(`  http://${HOST}:${PORT}/inquiry.html\n`);
  });
}
