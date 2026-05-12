import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");

// Regression guard against dashboard operator surfaces shipping HTML whose inline
// <script> is not parseable by the browser.
//
// Background: a previous version of inquiry.html shipped with template-literal
// nesting deep enough to trip V8's parser ("Missing } in template expression").
// The inline script failed to parse at page load, which silently disabled every
// interactive handler on the page (including "Send Turn"). The server-side tests
// passed because nothing in the dashboard test suite actually parses the inline
// HTML script. This test closes that gap: for each dashboard-served HTML file,
// we locate every inline <script> and ask V8 to parse it via vm.Script. A parse
// failure here is a "this page is broken in every browser" failure.
//
// vm.Script uses the same V8 parser as browsers, so a parse failure here
// reflects a real page-load failure, not a tooling artifact.
const INLINE_SCRIPT_REGEX = /<script(?:\s[^>]*?)?>([\s\S]*?)<\/script>/g;

function extractInlineScripts(html: string): Array<{ index: number; source: string }> {
  const scripts: Array<{ index: number; source: string }> = [];
  let match: RegExpExecArray | null;
  let scriptIndex = 0;
  while ((match = INLINE_SCRIPT_REGEX.exec(html)) !== null) {
    scriptIndex++;
    const openTag = match[0].slice(0, match[0].indexOf(">") + 1);
    // Skip external <script src="..."> tags; we only want to verify inline JS.
    if (/\ssrc\s*=/.test(openTag)) continue;
    const source = match[1];
    if (source.trim()) {
      scripts.push({ index: scriptIndex, source });
    }
  }
  return scripts;
}

const htmlFiles = fs
  .readdirSync(publicDir)
  .filter((name) => name.endsWith(".html"))
  .sort();

for (const fileName of htmlFiles) {
  test(`${fileName} inline <script> blocks parse under V8`, () => {
    const html = fs.readFileSync(path.join(publicDir, fileName), "utf8");
    const scripts = extractInlineScripts(html);
    for (const script of scripts) {
      assert.doesNotThrow(
        () => new vm.Script(script.source, { filename: `${fileName}#${script.index}` }),
        `${fileName} inline <script> block #${script.index} failed to parse under V8`
      );
    }
  });
}
