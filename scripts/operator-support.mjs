import path from "node:path";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DEFAULT_RC_NOTE = "docs/release-notes/v1-rc-2026-04-20.md";
const RELEASE_GATE = "packages/canon/changelog/0004-v1-release-gate.md";
const RELEASE_NOTE_RE = /`(docs\/release-notes\/[^`]+\.md)`/;
const COMMIT_SHA_RE = /- Commit SHA:\s*`([0-9a-f]{40})`/i;

export function parseDotEnvContent(content) {
  const result = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = line.slice(0, equalsIndex).trim();
    if (!ENV_KEY_RE.test(key)) continue;

    result[key] = line.slice(equalsIndex + 1);
  }

  return result;
}

async function readFirstExisting(paths) {
  for (const candidate of paths) {
    try {
      return await readFile(candidate, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }

  return null;
}

export async function readDeclaredV1ReleaseSha(repoRoot) {
  const gatePath = path.join(repoRoot, RELEASE_GATE);
  const gateText = await readFirstExisting([gatePath]);

  if (gateText === null) {
    const releaseNoteText = await readFirstExisting([path.join(repoRoot, DEFAULT_RC_NOTE)]);
    if (!releaseNoteText) return null;

    const shaMatch = releaseNoteText.match(COMMIT_SHA_RE);
    return shaMatch ? shaMatch[1] : null;
  }

  const noteMatch = gateText.match(RELEASE_NOTE_RE);
  if (!noteMatch) {
    throw new Error(`Release gate file is missing a release note reference: ${gatePath}`);
  }

  const releaseNotePath = path.join(repoRoot, ...noteMatch[1].split("/"));
  const releaseNoteText = await readFile(releaseNotePath, "utf8");

  const shaMatch = releaseNoteText.match(COMMIT_SHA_RE);
  return shaMatch ? shaMatch[1] : null;
}

export function summarizeReleaseIdentity({ headSha, declaredV1Sha, localTagSha }) {
  const base = {
    headSha,
    declaredV1Sha,
    localTagSha,
  };

  if (localTagSha) {
    if (declaredV1Sha && localTagSha === headSha && declaredV1Sha !== headSha) {
      return {
        ...base,
        state: "local_tag_conflicts_declared_release",
        message:
          "Local v1 tag matches this checkout, but conflicts with the declared v1 release commit.",
      };
    }

    if (localTagSha === headSha) {
      return {
        ...base,
        state: "local_tag_matches",
        message: "This checkout matches local v1 tag.",
      };
    }

    return {
      ...base,
      state: "local_tag_mismatch",
      message: "Local v1 tag exists but does not match this checkout.",
    };
  }

  if (declaredV1Sha && declaredV1Sha === headSha) {
    return {
      ...base,
      state: "no_local_tag_declared_match",
      message:
        "Local v1 tag is not present; this checkout matches the declared v1 release commit.",
    };
  }

  if (!declaredV1Sha) {
    return {
      ...base,
      state: "no_local_tag_no_declared_release",
      message:
        "Local v1 tag is not present, and no declared v1 release commit is available for comparison.",
    };
  }

  return {
    ...base,
    state: "no_local_tag_declared_mismatch",
    message:
      "Local v1 tag is not present; comparing against the declared v1 release commit instead.",
  };
}

export function gitSha(cwd, ref) {
  try {
    return execFileSync("git", ["rev-parse", "--verify", ref], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}
