/**
 * subsystems.ts — subsystem-level grouping for eval cases.
 *
 * Each case can declare an explicit `subsystem`. Legacy cases that
 * predate the field fall back to a derivation from `category`. This
 * keeps the existing eval suite stable while allowing M6 cases
 * (memory v2, editorial workflow, reflection workflow, artifact /
 * canon boundary, provider drift, long-horizon coherence) to report
 * regressions against the subsystem they actually exercise.
 */

import type {
  EvalCase,
  EvalCategory,
  EvalResult,
  EvalSubsystem,
} from "./types";

const CATEGORY_TO_SUBSYSTEM: Record<EvalCategory, EvalSubsystem> = {
  governance: "canon-governance",
  epistemics: "epistemics-and-meta",
  context: "retrieval-and-context",
  style: "style-and-voice",
  meta: "epistemics-and-meta",
  memory: "memory-discipline",
  editorial: "editorial-workflow",
  reflection: "reflection-discipline",
  "long-horizon": "long-horizon-coherence",
};

export function resolveSubsystem(
  caseOrResult: Pick<EvalCase, "category"> & {
    subsystem?: EvalSubsystem;
  }
): EvalSubsystem {
  return caseOrResult.subsystem ?? CATEGORY_TO_SUBSYSTEM[caseOrResult.category];
}

export interface SubsystemScorecard {
  subsystem: EvalSubsystem;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  failedIds: string[];
  /** Failed ids that are flagged critical (merge-blocking). */
  criticalFailedIds: string[];
}

export function buildSubsystemScorecards(
  results: EvalResult[]
): SubsystemScorecard[] {
  const byKey = new Map<EvalSubsystem, SubsystemScorecard>();

  for (const r of results) {
    const key = r.subsystem;
    if (!byKey.has(key)) {
      byKey.set(key, {
        subsystem: key,
        total: 0,
        passed: 0,
        failed: 0,
        passRate: 0,
        failedIds: [],
        criticalFailedIds: [],
      });
    }
    const card = byKey.get(key)!;
    card.total++;
    if (r.passed) {
      card.passed++;
    } else {
      card.failed++;
      card.failedIds.push(r.id);
      if (r.critical) {
        card.criticalFailedIds.push(r.id);
      }
    }
  }

  for (const card of byKey.values()) {
    card.passRate = card.total === 0 ? 0 : card.passed / card.total;
  }

  return [...byKey.values()].sort((a, b) =>
    a.subsystem.localeCompare(b.subsystem)
  );
}
