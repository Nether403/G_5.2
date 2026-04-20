import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";

import {
  parseDotEnvContent,
  gitSha,
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

test("summarizeReleaseIdentity flags conflicting local tag and declared release SHAs", () => {
  const summary = summarizeReleaseIdentity({
    headSha: "aaa111",
    declaredV1Sha: "bbb222",
    localTagSha: "aaa111",
  });

  assert.equal(summary.state, "local_tag_conflicts_declared_release");
  assert.equal(summary.headSha, "aaa111");
  assert.equal(summary.declaredV1Sha, "bbb222");
  assert.equal(summary.localTagSha, "aaa111");
});

test("summarizeReleaseIdentity returns install display data with SHAs and a plain statement", () => {
  const summary = summarizeReleaseIdentity({
    headSha: "b044c7b512ae61154c8b840ba4740fd68db137f4",
    declaredV1Sha: "b044c7b512ae61154c8b840ba4740fd68db137f4",
    localTagSha: null,
  });

  assert.equal(summary.headSha, "b044c7b512ae61154c8b840ba4740fd68db137f4");
  assert.equal(summary.declaredV1Sha, "b044c7b512ae61154c8b840ba4740fd68db137f4");
  assert.equal(
    summary.message,
    "Local v1 tag is not present; this checkout matches the declared v1 release commit."
  );
});

test("readDeclaredV1ReleaseSha surfaces malformed gate files instead of falling back", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-operator-support-"));

  await mkdir(path.join(root, "packages", "canon", "changelog"), {
    recursive: true,
  });
  await mkdir(path.join(root, "docs", "release-notes"), { recursive: true });
  await writeFile(
    path.join(root, "docs", "release-notes", "v1-rc-2026-04-20.md"),
    "- Commit SHA: `b044c7b512ae61154c8b840ba4740fd68db137f4`\n",
    "utf8"
  );
  await writeFile(
    path.join(root, "packages", "canon", "changelog", "0004-v1-release-gate.md"),
    [
      "# 0004 — V1 Release Gate",
      "",
      "Grounded in:",
      "- docs/release-notes/v1-rc-2026-04-20.md",
    ].join("\n"),
    "utf8"
  );

  await assert.rejects(readDeclaredV1ReleaseSha(root), /release gate/i);
});

test("readDeclaredV1ReleaseSha surfaces non-ENOENT read errors", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-operator-support-"));

  await mkdir(path.join(root, "docs", "release-notes", "v1-rc-2026-04-20.md"), {
    recursive: true,
  });

  await assert.rejects(readDeclaredV1ReleaseSha(root), (error) => {
    assert.notEqual(error.code, "ENOENT");
    return true;
  });
});

test("gitSha returns null for a non-git location and invalid ref", () => {
  assert.equal(gitSha(path.join(os.tmpdir(), "g52-no-git"), "HEAD"), null);
  assert.equal(gitSha(process.cwd(), "refs/heads/definitely-not-a-real-ref"), null);
});
