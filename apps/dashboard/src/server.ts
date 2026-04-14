/**
 * Operator dashboard server.
 *
 * Serves a single-page HTML dashboard + a JSON API for eval reports.
 * Zero external dependencies — uses Node's built-in http module.
 *
 * API:
 *   GET /                    → HTML dashboard
 *   GET /api/reports         → list of report filenames (newest first)
 *   GET /api/reports/:name   → full report JSON
 *
 * Usage:
 *   pnpm --filter @g52/dashboard dev
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
