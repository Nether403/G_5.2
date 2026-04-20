import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";

import {
  parseDotEnvContent,
  readDeclaredV1ReleaseSha,
  summarizeReleaseIdentity,
} from "./operator-support.mjs";

test("parseDotEnvContent accepts only plain KEY=VALUE lines", () => {
  const parsed = parseDotEnvContent(`
# comment
OPENROUTER_API_KEY=abc123
AZURE_OPENAI_ENDPOINT=https://example.openai.azure.com/
 BAD LINE
QUOTED=value=with=equals
`);

  assert.deepEqual(parsed, {
    OPENROUTER_API_KEY: "abc123",
    AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com/",
    QUOTED: "value=with=equals",
  });
});

test("readDeclaredV1ReleaseSha falls back from release gate to release note commit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-operator-support-"));

  await mkdir(path.join(root, "packages", "canon", "changelog"), {
    recursive: true,
  });
  await mkdir(path.join(root, "docs", "release-notes"), { recursive: true });

  await writeFile(
    path.join(root, "packages", "canon", "changelog", "0004-v1-release-gate.md"),
    [
      "# 0004 — V1 Release Gate",
      "",
      "Grounded in:",
      "- `docs/release-notes/v1-rc-2026-04-20.md`",
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    path.join(root, "docs", "release-notes", "v1-rc-2026-04-20.md"),
    "- Commit SHA: `b044c7b512ae61154c8b840ba4740fd68db137f4`\n",
    "utf8"
  );

  const sha = await readDeclaredV1ReleaseSha(root);
  assert.equal(sha, "b044c7b512ae61154c8b840ba4740fd68db137f4");
});

test("summarizeReleaseIdentity distinguishes local tag states", () => {
  assert.equal(
    summarizeReleaseIdentity({
      headSha: "aaa111",
      declaredV1Sha: "aaa111",
      localTagSha: "aaa111",
    }).state,
    "local_tag_matches"
  );

  assert.equal(
    summarizeReleaseIdentity({
      headSha: "bbb222",
      declaredV1Sha: "aaa111",
      localTagSha: "aaa111",
    }).state,
    "local_tag_mismatch"
  );

  assert.equal(
    summarizeReleaseIdentity({
      headSha: "aaa111",
      declaredV1Sha: "aaa111",
      localTagSha: null,
    }).state,
    "no_local_tag_declared_match"
  );
});
