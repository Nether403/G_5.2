import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { validateCanonBoundary } from "../../../orchestration/src/canon/validateCanon";
import {
  PIPELINE_REVISION,
  PROMPT_REVISION,
} from "../../../orchestration/src/pipeline/revision";

const execFileAsync = promisify(execFile);

async function getGitCommit(repoRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function isGitDirty(repoRoot: string): Promise<boolean | null> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
      cwd: repoRoot,
    });
    return stdout.trim().length > 0;
  } catch {
    return null;
  }
}

export interface JsonReportMetadata {
  gitCommit: string | null;
  canonVersion: string;
  canonLastUpdated: string | null;
  promptRevision: string;
  filter: string[];
  captureTrace: boolean;
  git: {
    commit: string | null;
    shortCommit: string | null;
    dirty: boolean | null;
  };
  canon: {
    version: string;
    lastUpdated: string | null;
  };
  revisions: {
    pipeline: string;
    prompt: string;
  };
  runContext: {
    entrypoint: string;
    captureTrace: boolean;
    filter: string[];
    caseCount: number;
    nodeVersion: string;
    evalProviderPreference: string | null;
  };
}

export interface BuildReportMetadataInput {
  canonRoot: string;
  entrypoint: string;
  captureTrace: boolean;
  filter: string[];
  caseCount: number;
}

export async function buildReportMetadata(
  input: BuildReportMetadataInput
): Promise<JsonReportMetadata> {
  const repoRoot = path.resolve(input.canonRoot, "..", "..");
  const canon = await validateCanonBoundary(input.canonRoot);
  const commit = await getGitCommit(repoRoot);
  const dirty = await isGitDirty(repoRoot);

  return {
    gitCommit: commit,
    canonVersion: String(canon.manifest.version),
    canonLastUpdated: canon.manifest.last_updated ?? null,
    promptRevision: PROMPT_REVISION,
    filter: input.filter,
    captureTrace: input.captureTrace,
    git: {
      commit,
      shortCommit: commit ? commit.slice(0, 7) : null,
      dirty,
    },
    canon: {
      version: String(canon.manifest.version),
      lastUpdated: canon.manifest.last_updated ?? null,
    },
    revisions: {
      pipeline: PIPELINE_REVISION,
      prompt: PROMPT_REVISION,
    },
    runContext: {
      entrypoint: input.entrypoint,
      captureTrace: input.captureTrace,
      filter: input.filter,
      caseCount: input.caseCount,
      nodeVersion: process.version,
      evalProviderPreference: process.env.EVAL_PROVIDER ?? null,
    },
  };
}
