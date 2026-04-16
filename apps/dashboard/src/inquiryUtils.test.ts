import test from "node:test";
import assert from "node:assert/strict";
import {
  collectTagCounts,
  computeSessionSummaryHealth,
  filterSessionSummaries,
  filterSessionsByArchive,
  filterSessionsByTag,
  sortSessionSummaries,
  sortSessionSummariesBy,
  toSessionSummary,
} from "./inquiryUtils";
import type { InquirySession } from "../../../packages/orchestration/src/types/session";
import type { MemoryDecision } from "../../../packages/orchestration/src/types/memory";

function buildMemoryDecision(
  overrides: Partial<MemoryDecision> = {}
): MemoryDecision {
  return {
    shouldStore: false,
    reason: "No durable memory candidate.",
    candidates: [],
    skippedCandidates: [],
    storedItems: [],
    ...overrides,
  };
}

function buildSession(overrides: Partial<InquirySession>): InquirySession {
  return {
    id: "session-1",
    createdAt: "2026-04-15T10:00:00.000Z",
    updatedAt: "2026-04-15T10:10:00.000Z",
    summary: null,
    turns: [],
    ...overrides,
  };
}

test("toSessionSummary prefers stored summary over raw turn text", () => {
  const summary = toSessionSummary(
    buildSession({
      summary: {
        schemaVersion: 1,
        text: "Reviewed canon boundaries and session carryover.",
        generatedAt: "2026-04-15T10:05:00.000Z",
      },
      turns: [
        {
          id: "turn-1",
          createdAt: "2026-04-15T10:05:00.000Z",
          mode: "dialogic",
          userMessage: "Tell me about the canon boundary.",
          assistantMessage: "The canon boundary is explicit.",
          memoryDecision: buildMemoryDecision(),
        },
      ],
    })
  );

  assert.equal(summary.turnCount, 1);
  assert.equal(summary.preview, "Reviewed canon boundaries and session carryover.");
  assert.match(summary.searchableText, /canon boundary/);
});

test("sortSessionSummaries orders newest sessions first", () => {
  const sorted = sortSessionSummaries([
    { id: "older", updatedAt: "2026-04-15T09:00:00.000Z" },
    { id: "newer", updatedAt: "2026-04-15T11:00:00.000Z" },
    { id: "middle", updatedAt: "2026-04-15T10:00:00.000Z" },
  ]);

  assert.deepEqual(
    sorted.map((item) => item.id),
    ["newer", "middle", "older"]
  );
});

test("filterSessionSummaries matches summary and turn content", () => {
  const sessions = [
    toSessionSummary(
      buildSession({
        id: "session-alpha",
        summary: {
          schemaVersion: 1,
          text: "Focused on canon retrieval.",
          generatedAt: "2026-04-15T10:00:00.000Z",
        },
      })
    ),
    toSessionSummary(
      buildSession({
        id: "session-beta",
        turns: [
          {
            id: "turn-1",
            createdAt: "2026-04-15T10:05:00.000Z",
            mode: "dialogic",
            userMessage: "Why does the glossary matter?",
            assistantMessage: "It keeps project terms stable.",
            memoryDecision: buildMemoryDecision({
              storedItems: [
                {
                  action: "created",
                  id: "memory-1",
                  type: "project_decision",
                  scope: "global",
                  state: "accepted",
                  origin: "turn",
                  statement: "Keep project terms stable.",
                  justification: "The assistant captured a durable project decision.",
                  confidence: "high",
                  tags: ["glossary"],
                  createdAt: "2026-04-15T10:05:00.000Z",
                  updatedAt: "2026-04-15T10:05:00.000Z",
                  createdFrom: {
                    sessionId: "session-beta",
                    turnId: "turn-1",
                    createdAt: "2026-04-15T10:05:00.000Z",
                  },
                  lastConfirmedFrom: {
                    sessionId: "session-beta",
                    turnId: "turn-1",
                    createdAt: "2026-04-15T10:05:00.000Z",
                  },
                  confirmationCount: 1,
                },
              ],
            }),
          },
        ],
      })
    ),
  ];

  assert.deepEqual(
    filterSessionSummaries(sessions, "glossary").map((session) => session.id),
    ["session-beta"]
  );
  assert.deepEqual(
    filterSessionSummaries(sessions, "stable").map((session) => session.id),
    ["session-beta"]
  );
  assert.deepEqual(
    filterSessionSummaries(sessions, "canon").map((session) => session.id),
    ["session-alpha"]
  );
});

test("toSessionSummary surfaces tags, archived state, and title", () => {
  const summary = toSessionSummary(
    buildSession({
      id: "tagged",
      title: "Canon Drift Review",
      tags: ["canon", "review"],
      archived: true,
    })
  );

  assert.equal(summary.title, "Canon Drift Review");
  assert.equal(summary.preview, "Canon Drift Review");
  assert.deepEqual(summary.tags, ["canon", "review"]);
  assert.equal(summary.archived, true);
});

test("sortSessionSummariesBy sorts by turnCount and title", () => {
  const base: Partial<InquirySession>[] = [
    { id: "a", summary: { schemaVersion: 1, text: "alpha", generatedAt: "2026-04-15T09:00:00.000Z" }, updatedAt: "2026-04-15T09:00:00.000Z", title: "Zeta" },
    { id: "b", summary: { schemaVersion: 1, text: "beta", generatedAt: "2026-04-15T09:00:00.000Z" }, updatedAt: "2026-04-15T09:00:00.000Z", title: "Alpha" },
  ];
  const summaries = base.map((o) =>
    toSessionSummary(
      buildSession({
        ...o,
        turns: o.id === "a" ? [
          { id: "t1", createdAt: "x", mode: "dialogic", userMessage: "u", assistantMessage: "a", memoryDecision: buildMemoryDecision() },
          { id: "t2", createdAt: "y", mode: "dialogic", userMessage: "u", assistantMessage: "a", memoryDecision: buildMemoryDecision() },
        ] : [],
      })
    )
  );

  assert.deepEqual(
    sortSessionSummariesBy(summaries, "turnCount", "desc").map((s) => s.id),
    ["a", "b"]
  );

  assert.deepEqual(
    sortSessionSummariesBy(summaries, "title", "asc").map((s) => s.id),
    ["b", "a"]
  );
});

test("tag and archive filters narrow sessions correctly", () => {
  const sessions = [
    toSessionSummary(
      buildSession({ id: "s1", tags: ["canon", "review"], archived: false })
    ),
    toSessionSummary(
      buildSession({ id: "s2", tags: ["memory"], archived: true })
    ),
    toSessionSummary(buildSession({ id: "s3", archived: false })),
  ];

  assert.deepEqual(
    filterSessionsByTag(sessions, "canon").map((s) => s.id),
    ["s1"]
  );
  assert.deepEqual(
    filterSessionsByTag(sessions, null).map((s) => s.id),
    ["s1", "s2", "s3"]
  );
  assert.deepEqual(
    filterSessionsByArchive(sessions, "active").map((s) => s.id),
    ["s1", "s3"]
  );
  assert.deepEqual(
    filterSessionsByArchive(sessions, "archived").map((s) => s.id),
    ["s2"]
  );
  assert.deepEqual(
    collectTagCounts(sessions).map((t) => t.tag),
    ["canon", "memory", "review"]
  );
});

test("computeSessionSummaryHealth reports summary and window state", () => {
  const now = new Date("2026-04-15T10:30:00.000Z");
  const session = buildSession({
    summary: { schemaVersion: 1, text: "Turn 1 covered X. Turn 2 covered Y. Turn 3 covered Z.", generatedAt: "2026-04-15T10:00:00.000Z" },
    updatedAt: "2026-04-15T10:00:00.000Z",
    turns: Array.from({ length: 6 }, (_, idx) => ({
      id: `t${idx}`,
      createdAt: "2026-04-15T10:00:00.000Z",
      mode: "dialogic" as const,
      userMessage: "u",
      assistantMessage: "a",
      memoryDecision: buildMemoryDecision(),
    })),
  });

  const health = computeSessionSummaryHealth(session, 4, now);
  assert.equal(health.hasSummary, true);
  assert.equal(health.turnsInRecentWindow, 4);
  assert.equal(health.turnsInSummary, 2);
  assert.equal(health.recentWindowLimit, 4);
  assert.ok(health.summaryCharCount > 0);
  assert.ok(health.summaryTokensApprox > 0);
  assert.match(health.stalenessLabel, /minute/);
});
