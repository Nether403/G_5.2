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
 *   POST /api/inquiry/turn                             → run and persist a new inquiry turn
 *   GET /api/memory                                    → list durable memory items
 *   DELETE /api/memory/:id                             → hard-delete a durable memory item
 *
 * Usage:
 *   pnpm dashboard    (or: pnpm --filter @g52/dashboard dev)
 */

import http from "node:http";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileMemoryStore } from "../../../packages/orchestration/src/memory/fileMemoryStore";
import { MODES, type Mode } from "../../../packages/orchestration/src/types/modes";
import type { MemoryScope } from "../../../packages/orchestration/src/types/memory";
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
import { runCompareTurn } from "../../../packages/orchestration/src/sessions/runCompareTurn";
import { FileSessionStore } from "../../../packages/orchestration/src/sessions/fileSessionStore";
import { validateReport } from "../../../packages/evals/src/reporters/reportSchema";
import { computeDiff, type JsonReport } from "./reportUtils";
import {
  sortSessionSummaries,
  toSessionSummary,
} from "./inquiryUtils";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const REPORTS_DIR = path.join(REPO_ROOT, "packages", "evals", "reports");
const CANON_ROOT = path.join(REPO_ROOT, "packages", "canon");
const SESSIONS_DIR = path.join(REPO_ROOT, "data", "inquiry-sessions");
const MEMORY_DIR = path.join(REPO_ROOT, "data", "memory-items");
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

const sessionStore = new FileSessionStore(SESSIONS_DIR);

async function readSession(sessionId: string): Promise<InquirySession | null> {
  // Route through FileSessionStore so legacy data is migrated and
  // newer-than-supported data is rejected consistently.
  return sessionStore.load(sessionId);
}

async function listSessionSummaries() {
  try {
    const files = await fs.readdir(SESSIONS_DIR);
    const ids = files
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.slice(0, -".json".length));
    const sessions = await Promise.all(ids.map((id) => sessionStore.load(id)));
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

async function writeSession(session: InquirySession) {
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
  await fs.writeFile(
    path.join(SESSIONS_DIR, `${session.id}.json`),
    `${JSON.stringify(session, null, 2)}\n`,
    "utf8"
  );
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

async function serveStaticHtml(res: http.ServerResponse, filename: string) {
  const html = await fs.readFile(path.join(STATIC_DIR, filename), "utf8");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

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
        ? ["openai", "anthropic", "gemini"]
        : ["mock"],
    });
    return;
  }

  if (url.pathname === "/api/inquiry/sessions") {
    try {
      sendJson(res, 200, await listSessionSummaries());
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (url.pathname === "/api/memory") {
    try {
      const store = new FileMemoryStore(MEMORY_DIR);
      let items = await store.list();
      const sessionId = url.searchParams.get("sessionId");
      const scope = url.searchParams.get("scope");

      if (sessionId) {
        items = items.filter((item) => item.sessionId === sessionId);
      }

      if (isMemoryScope(scope)) {
        items = items.filter((item) => item.scope === scope);
      }

      sendJson(res, 200, items);
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  const memoryDeleteMatch = url.pathname.match(/^\/api\/memory\/([^/]+)$/);
  if (memoryDeleteMatch && req.method === "DELETE") {
    try {
      const deleted = await new FileMemoryStore(MEMORY_DIR).delete(
        memoryDeleteMatch[1]
      );
      sendJson(res, 200, { deleted });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  const inquirySessionMatch = url.pathname.match(/^\/api\/inquiry\/sessions\/([^/]+)$/);
  if (inquirySessionMatch && req.method === "GET") {
    try {
      const session = await readSession(inquirySessionMatch[1]);
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
    try {
      const session = await readSession(inquirySessionMatch[1]);
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
        await writeSession(session);
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
    try {
      const filePath = path.join(SESSIONS_DIR, `${inquirySessionMatch[1]}.json`);
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
    try {
      const session = await readSession(inquiryRerunMatch[1]);
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
        canonRoot: CANON_ROOT,
        memoryRoot: MEMORY_DIR,
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
        await writeSession(session);
      }

      sendJson(res, 200, { rerun, session });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (url.pathname === "/api/inquiry/turn" && req.method === "POST") {
    let body: {
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
      const result = await ensureSessionSnapshot(
        SESSIONS_DIR,
        await runSessionTurn(provider, {
          canonRoot: CANON_ROOT,
          sessionsRoot: SESSIONS_DIR,
          memoryRoot: MEMORY_DIR,
          sessionId: body.sessionId,
          mode,
          userMessage: body.userMessage.trim(),
        })
      );

      sendJson(res, 200, {
        session: result.session,
        persistedTurn: result.persistedTurn,
        memoryDecision: result.memoryDecision,
        provider: providerLabel,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 502, {
        error: message,
        retryable: true,
        provider: providerLabel,
        failedAt: new Date().toISOString(),
        userMessage: body.userMessage.trim(),
        mode,
        sessionId: body.sessionId ?? null,
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

  if (url.pathname === "/" || url.pathname === "/index.html") {
    await serveStaticHtml(res, "index.html");
    return;
  }

  if (url.pathname === "/inquiry.html") {
    await serveStaticHtml(res, "inquiry.html");
    return;
  }

  res.writeHead(404);
  res.end("Not found");
}

const server = http.createServer(handleRequest);
server.listen(PORT, HOST, () => {
  console.log(`\n  G_5.2 Operator Dashboard`);
  console.log(`  http://${HOST}:${PORT}`);
  console.log(`  http://${HOST}:${PORT}/inquiry.html\n`);
});


