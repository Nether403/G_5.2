export interface DashboardTrace {
  selectedDocuments: Array<{ slug: string; title: string }>;
  selectedFacts: Array<{ id: string; statement: string }>;
  selectedGlossaryTerms: Array<{ term: string; definition: string }>;
  selectedRecoveredArtifacts: Array<{ slug: string; title: string }>;
  selectedMemoryItems: Array<{
    id: string;
    type: string;
    scope: string;
    statement: string;
  }>;
  systemPrompt: string;
  userPrompt: string;
  draft: string;
  critique: string;
  revision: string;
  final: string;
}

export interface DashboardEvalResult {
  id: string;
  category: string;
  subsystem?: string;
  critical?: boolean;
  passed: boolean;
  failures: Array<{ message: string }>;
  output: string;
  trace?: DashboardTrace;
}

export interface DashboardSubsystemScorecard {
  subsystem: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  failedIds: string[];
  criticalFailedIds: string[];
}

export interface DashboardReportMetadata {
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

export interface JsonReport {
  generatedAt: string;
  provider: string;
  model: string;
  metadata: DashboardReportMetadata;
  score: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    criticalFailedIds?: string[];
    subsystems?: DashboardSubsystemScorecard[];
  };
  results: DashboardEvalResult[];
}

function joinValues(values: string[]): string | null {
  const joined = values.sort().join(",");
  return joined.length > 0 ? joined : null;
}

export function computeDiff(a: JsonReport, b: JsonReport) {
  const aById = new Map(a.results.map((r) => [r.id, r]));
  const bById = new Map(b.results.map((r) => [r.id, r]));

  const allIds = [...new Set([...aById.keys(), ...bById.keys()])].sort();

  const scoreDelta = {
    passed: b.score.passed - a.score.passed,
    failed: b.score.failed - a.score.failed,
    passRate: Math.round((b.score.passRate - a.score.passRate) * 100),
  };

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
  const allCats = [...new Set([...Object.keys(catA), ...Object.keys(catB)])].sort();
  const categoryDelta = allCats.map((cat) => ({
    category: cat,
    a: catA[cat] ?? null,
    b: catB[cat] ?? null,
    delta:
      catA[cat] && catB[cat]
        ? catB[cat].passed - catA[cat].passed
        : null,
  }));

  const cases = allIds.map((id) => {
    const ra = aById.get(id);
    const rb = bById.get(id);

    const statusChanged = ra && rb ? ra.passed !== rb.passed : false;
    const newlyFailing = ra?.passed === true && rb?.passed === false;
    const newlyPassing = ra?.passed === false && rb?.passed === true;

    const traceDiff: Record<string, { a: string | null; b: string | null }> =
      {};

    if (ra?.trace && rb?.trace) {
      const textFields = [
        "systemPrompt",
        "userPrompt",
        "draft",
        "critique",
        "revision",
        "final",
      ] as const;
      for (const field of textFields) {
        if (ra.trace[field] !== rb.trace[field]) {
          traceDiff[field] = {
            a: ra.trace[field] ?? null,
            b: rb.trace[field] ?? null,
          };
        }
      }

      const aDocSlugs = joinValues(
        (ra.trace.selectedDocuments ?? []).map((d) => d.slug)
      );
      const bDocSlugs = joinValues(
        (rb.trace.selectedDocuments ?? []).map((d) => d.slug)
      );
      if (aDocSlugs !== bDocSlugs) {
        traceDiff.selectedDocuments = { a: aDocSlugs, b: bDocSlugs };
      }

      const aFactIds = joinValues(
        (ra.trace.selectedFacts ?? []).map((f) => f.id)
      );
      const bFactIds = joinValues(
        (rb.trace.selectedFacts ?? []).map((f) => f.id)
      );
      if (aFactIds !== bFactIds) {
        traceDiff.selectedFacts = { a: aFactIds, b: bFactIds };
      }

      const aGlossaryTerms = joinValues(
        (ra.trace.selectedGlossaryTerms ?? []).map((term) => term.term)
      );
      const bGlossaryTerms = joinValues(
        (rb.trace.selectedGlossaryTerms ?? []).map((term) => term.term)
      );
      if (aGlossaryTerms !== bGlossaryTerms) {
        traceDiff.selectedGlossaryTerms = {
          a: aGlossaryTerms,
          b: bGlossaryTerms,
        };
      }

      const aRecoveredArtifacts = joinValues(
        (ra.trace.selectedRecoveredArtifacts ?? []).map((artifact) => artifact.slug)
      );
      const bRecoveredArtifacts = joinValues(
        (rb.trace.selectedRecoveredArtifacts ?? []).map((artifact) => artifact.slug)
      );
      if (aRecoveredArtifacts !== bRecoveredArtifacts) {
        traceDiff.selectedRecoveredArtifacts = {
          a: aRecoveredArtifacts,
          b: bRecoveredArtifacts,
        };
      }

      const aMemoryStatements = joinValues(
        (ra.trace.selectedMemoryItems ?? []).map((item) => item.statement)
      );
      const bMemoryStatements = joinValues(
        (rb.trace.selectedMemoryItems ?? []).map((item) => item.statement)
      );
      if (aMemoryStatements !== bMemoryStatements) {
        traceDiff.selectedMemoryItems = {
          a: aMemoryStatements,
          b: bMemoryStatements,
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
      traceA: ra?.trace ?? null,
      traceB: rb?.trace ?? null,
      outputA: ra?.output ?? null,
      outputB: rb?.output ?? null,
    };
  });

  // Subsystem delta — fall back to per-result subsystem field, with
  // category-derived defaults when the field is absent (older reports).
  const subA: Record<string, { passed: number; total: number }> = {};
  const subB: Record<string, { passed: number; total: number }> = {};
  function bucketSubsystem(r: DashboardEvalResult): string {
    return r.subsystem ?? `category:${r.category ?? "unknown"}`;
  }
  for (const r of a.results) {
    const k = bucketSubsystem(r);
    subA[k] = subA[k] ?? { passed: 0, total: 0 };
    subA[k].total++;
    if (r.passed) subA[k].passed++;
  }
  for (const r of b.results) {
    const k = bucketSubsystem(r);
    subB[k] = subB[k] ?? { passed: 0, total: 0 };
    subB[k].total++;
    if (r.passed) subB[k].passed++;
  }
  const allSubs = [...new Set([...Object.keys(subA), ...Object.keys(subB)])].sort();
  const subsystemDelta = allSubs.map((sub) => ({
    subsystem: sub,
    a: subA[sub] ?? null,
    b: subB[sub] ?? null,
    delta:
      subA[sub] && subB[sub] ? subB[sub].passed - subA[sub].passed : null,
  }));

  // Critical-failure delta — set semantics so an unchanged-failing
  // critical case shows as held over rather than "newly failing".
  const aCritFailed = new Set(a.score.criticalFailedIds ?? []);
  const bCritFailed = new Set(b.score.criticalFailedIds ?? []);
  const criticalDelta = {
    newlyFailingCritical: [...bCritFailed].filter((id) => !aCritFailed.has(id)),
    newlyPassingCritical: [...aCritFailed].filter((id) => !bCritFailed.has(id)),
    stillFailingCritical: [...bCritFailed].filter((id) => aCritFailed.has(id)),
  };

  return {
    a: {
      name: "",
      provider: a.provider,
      model: a.model,
      score: a.score,
      metadata: a.metadata,
    },
    b: {
      name: "",
      provider: b.provider,
      model: b.model,
      score: b.score,
      metadata: b.metadata,
    },
    scoreDelta,
    categoryDelta,
    subsystemDelta,
    criticalDelta,
    cases,
    newlyFailing: cases.filter((c) => c.newlyFailing).map((c) => c.id),
    newlyPassing: cases.filter((c) => c.newlyPassing).map((c) => c.id),
    changed: cases.filter((c) => c.statusChanged).map((c) => c.id),
  };
}
