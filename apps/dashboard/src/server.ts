/**
 * Operator dashboard server.
 *
 * Serves a single-page HTML dashboard + a JSON API for eval reports.
 * Zero external dependencies — uses Node's built-in http module.
 *
 * API:
 *   GET /                              → HTML dashboard
 *   GET /api/reports                   → list of report filenames (newest first)
 *   GET /api/reports/:name             → full report JSON
 *   GET /api/diff?a=:name&b=:name      → computed diff between two reports
 *
 * Usage:
 *   pnpm dashboard    (or: pnpm --filter @g52/dashboard dev)
 */

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(
  __dirname,
  "../../..",
  "packages/evals/reports"
);
const STATIC_DIR = path.resolve(__dirname, "../public");
const PORT = parseInt(process.env.DASHBOARD_PORT ?? "4400", 10);

// ─── Types (inline to avoid cross-package import) ────────────────────────────

interface EvalResult {
  id: string;
  category: string;
  passed: boolean;
  failures: Array<{ message: string }>;
  output: string;
  trace?: {
    selectedDocuments: Array<{ slug: string; title: string }>;
    selectedFacts: Array<{ id: string; statement: string }>;
    systemPrompt: string;
    userPrompt: string;
    draft: string;
    critique: string;
    revision: string;
    final: string;
  };
}

interface JsonReport {
  generatedAt: string;
  provider: string;
  model: string;
  score: { total: number; passed: number; failed: number; passRate: number };
  results: EvalResult[];
}

// ─── Diff computation ────────────────────────────────────────────────────────

function computeDiff(a: JsonReport, b: JsonReport) {
  const aById = new Map(a.results.map((r) => [r.id, r]));
  const bById = new Map(b.results.map((r) => [r.id, r]));

  const allIds = [...new Set([...aById.keys(), ...bById.keys()])].sort();

  const scoreDelta = {
    passed: b.score.passed - a.score.passed,
    failed: b.score.failed - a.score.failed,
    passRate: Math.round((b.score.passRate - a.score.passRate) * 100),
  };

  // Category deltas
  const catA: Record<string, { passed: number; total: number }> = {};
  const catB: Record<string, { passed: number; total: number }> = {};
  for (const r of a.results) {
    const c = r.category ?? "unknown";
    catA[c] = catA[c] ?? { passed: 0, total: 0 };
    catA[c].total++;
    if (r.passed) catA[c].passed++;
  }
  for (const r of b.results) {
    const c = r.category ?? "unknown";
    catB[c] = catB[c] ?? { passed: 0, total: 0 };
    catB[c].total++;
    if (r.passed) catB[c].passed++;
  }
  const allCats = [
    ...new Set([...Object.keys(catA), ...Object.keys(catB)]),
  ].sort();
  const categoryDelta = allCats.map((cat) => ({
    category: cat,
    a: catA[cat] ?? null,
    b: catB[cat] ?? null,
    delta:
      catA[cat] && catB[cat]
        ? (catB[cat].passed - catA[cat].passed)
        : null,
  }));

  // Per-case changes
  const cases = allIds.map((id) => {
    const ra = aById.get(id);
    const rb = bById.get(id);

    const statusChanged =
      ra && rb ? ra.passed !== rb.passed : false;
    const newlyFailing = ra?.passed === true && rb?.passed === false;
    const newlyPassing = ra?.passed === false && rb?.passed === true;

    // Trace field diffs (only if both have traces)
    const traceDiff: Record<string, { a: string | null; b: string | null }> =
      {};
    if (ra?.trace && rb?.trace) {
      const fields = [
        "draft",
        "critique",
        "revision",
        "final",
      ] as const;
      for (const field of fields) {
        if (ra.trace[field] !== rb.trace[field]) {
          traceDiff[field] = {
            a: ra.trace[field] ?? null,
            b: rb.trace[field] ?? null,
          };
        }
      }

      // Canon selection changes
      const aDocSlugs = (ra.trace.selectedDocuments ?? [])
        .map((d) => d.slug)
        .sort()
        .join(",");
      const bDocSlugs = (rb.trace.selectedDocuments ?? [])
        .map((d) => d.slug)
        .sort()
        .join(",");
      if (aDocSlugs !== bDocSlugs) {
        traceDiff["selectedDocuments"] = {
          a: aDocSlugs || null,
          b: bDocSlugs || null,
        };
      }

      const aFactIds = (ra.trace.selectedFacts ?? [])
        .map((f) => f.id)
        .sort()
        .join(",");
      const bFactIds = (rb.trace.selectedFacts ?? [])
        .map((f) => f.id)
        .sort()
        .join(",");
      if (aFactIds !== bFactIds) {
        traceDiff["selectedFacts"] = {
          a: aFactIds || null,
          b: bFactIds || null,
        };
      }
    }

    return {
      id,
      category: ra?.category ?? rb?.category ?? "unknown",
      statusA: ra?.passed ?? null,
      statusB: rb?.passed ?? null,
      statusChanged,
      newlyFailing,
      newlyPassing,
      onlyInA: !rb,
      onlyInB: !ra,
      traceDiff,
      // Full trace for both sides (for case drill-down)
      traceA: ra?.trace ?? null,
      traceB: rb?.trace ?? null,
      outputA: ra?.output ?? null,
      outputB: rb?.output ?? null,
    };
  });

  return {
    a: { name: "", provider: a.provider, model: a.model, score: a.score },
    b: { name: "", provider: b.provider, model: b.model, score: b.score },
    scoreDelta,
    categoryDelta,
    cases,
    newlyFailing: cases.filter((c) => c.newlyFailing).map((c) => c.id),
    newlyPassing: cases.filter((c) => c.newlyPassing).map((c) => c.id),
    changed: cases.filter((c) => c.statusChanged).map((c) => c.id),
  };
}

// ─── Request handler ──────────────────────────────────────────────────────────

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // API: list reports
  if (url.pathname === "/api/reports") {
    try {
      const files = await fs.readdir(REPORTS_DIR);
      const reports = files
        .filter((f) => f.endsWith(".json"))
        .sort()
        .reverse();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(reports));
    } catch {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("[]");
    }
    return;
  }

  // API: report diff
  if (url.pathname === "/api/diff") {
    const nameA = url.searchParams.get("a");
    const nameB = url.searchParams.get("b");
    if (!nameA || !nameB) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Both ?a= and ?b= are required" }));
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
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(diff));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }
    return;
  }

  // API: single report
  const reportMatch = url.pathname.match(/^\/api\/reports\/(.+\.json)$/);
  if (reportMatch) {
    const reportPath = path.join(REPORTS_DIR, reportMatch[1]);
    try {
      const data = await fs.readFile(reportPath, "utf8");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(data);
    } catch {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Report not found" }));
    }
    return;
  }

  // Static files
  if (url.pathname === "/" || url.pathname === "/index.html") {
    const html = await fs.readFile(
      path.join(STATIC_DIR, "index.html"),
      "utf8"
    );
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
}

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`\n  G_5.2 Operator Dashboard`);
  console.log(`  http://localhost:${PORT}\n`);
});
