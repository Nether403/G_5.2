/**
 * Operator dashboard server.
 *
 * Serves a report dashboard, diff viewer, and minimal inquiry surface.
 * Zero external dependencies — uses Node's built-in http module.
 *
 * API:
 *   GET /                              → eval dashboard HTML
 *   GET /inquiry.html                  → inquiry UI HTML
 *   GET /api/reports                   → list of report filenames (newest first)
 *   GET /api/reports/:name             → full report JSON
 *   GET /api/diff?a=:name&b=:name      → computed diff between two reports
 *   GET /api/inquiry/sessions          → list of inquiry sessions
 *   GET /api/inquiry/sessions/:id      → full inquiry session JSON
 *   POST /api/inquiry/turn             → run and persist a new inquiry turn
 *
 * Usage:
 *   pnpm dashboard    (or: pnpm --filter @g52/dashboard dev)
 */

import http from "node:http";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODES, type Mode } from "../../../packages/orchestration/src/types/modes";
import type { BuiltContext } from "../../../packages/orchestration/src/types/pipeline";
import type { InquirySession } from "../../../packages/orchestration/src/types/session";
import { providerFromEnv } from "../../../packages/orchestration/src/providers/fromEnv";
import { runSessionTurn } from "../../../packages/orchestration/src/sessions/runSessionTurn";
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
const STATIC_DIR = path.resolve(__dirname, "../public");
const PORT = parseInt(process.env.DASHBOARD_PORT ?? "4400", 10);

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

async function readSession(sessionId: string): Promise<InquirySession | null> {
  try {
    const raw = await fs.readFile(path.join(SESSIONS_DIR, `${sessionId}.json`), "utf8");
    return JSON.parse(raw) as InquirySession;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function listSessionSummaries() {
  try {
    const files = await fs.readdir(SESSIONS_DIR);
    const sessions = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) => {
          const raw = await fs.readFile(path.join(SESSIONS_DIR, file), "utf8");
          return JSON.parse(raw) as InquirySession;
        })
    );

    return sortSessionSummaries(sessions.map(toSessionSummary));
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
    hadSessionSummary: Boolean(context.sessionSummary),
    recentMessageCount: context.recentMessages.length,
  };
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
      const reportA: JsonReport = JSON.parse(rawA);
      const reportB: JsonReport = JSON.parse(rawB);
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

  const inquirySessionMatch = url.pathname.match(/^\/api\/inquiry\/sessions\/([^/]+)$/);
  if (inquirySessionMatch) {
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

  if (url.pathname === "/api/inquiry/turn" && req.method === "POST") {
    try {
      const body = (await readJsonBody(req)) as {
        sessionId?: string;
        mode?: string;
        userMessage?: string;
      };

      if (!body.userMessage || !body.userMessage.trim()) {
        sendJson(res, 400, { error: "userMessage is required" });
        return;
      }

      const mode = isMode(body.mode) ? body.mode : "dialogic";
      const provider = providerFromEnv();
      const result = await ensureSessionSnapshot(
        SESSIONS_DIR,
        await runSessionTurn(provider, {
        canonRoot: CANON_ROOT,
        sessionsRoot: SESSIONS_DIR,
        sessionId: body.sessionId,
        mode,
        userMessage: body.userMessage.trim(),
        })
      );

      sendJson(res, 200, {
        session: result.session,
        persistedTurn: result.persistedTurn,
        memoryDecision: result.memoryDecision,
        provider: {
          name: provider.name,
          model: (provider as { model?: string }).model ?? "unknown",
        },
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
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(data);
    } catch {
      sendJson(res, 404, { error: "Report not found" });
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
server.listen(PORT, () => {
  console.log(`\n  G_5.2 Operator Dashboard`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  http://localhost:${PORT}/inquiry.html\n`);
});


