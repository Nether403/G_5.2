/**
 * Property/integration test for chat parity (task 13.2).
 *
 * **Property 2: Chat parity — responses are independent of consent.**
 * For any turn sequence and any provider seed, the assistant responses, the set of
 * available conversational capabilities, and the multi-turn flow are identical whether
 * the consent state is `granted`, `declined`, `withdrawn`, or not-yet-recorded —
 * including when recording the Consent_Decision fails. No feature is disabled, omitted,
 * truncated, or altered by the consent value.
 *
 * **Validates: Requirements 1.1, 1.3, 3.1, 3.2, 3.4, 3.5, 9.5**
 *
 * How parity is exercised end to end through the real HTTP handler:
 *   - Task 13.1 wired `researchTurn` as a POST-RESPONSE side-effect in the `pes` branch
 *     of `POST /api/inquiry/turn` (`void researchTurn(...).catch(...)` AFTER `sendJson`),
 *     so the response cannot structurally depend on consent.
 *   - This test drives the SAME generated turn sequence through that endpoint once per
 *     consent state, each in its own fresh session, and asserts the responses are
 *     identical after masking the unavoidable per-run nondeterminism (ids/timestamps).
 *   - Each turn pins `provider:"mock"` (the deterministic `MockProvider`), so replies
 *     are a pure function of canon + message sequence — making "identical reply" a
 *     checkable equality independent of any live provider configured in the env.
 *
 * ponytail: reuses the established `createDashboardServer` + `requestJson` harness from
 * `pesConsentDsar.test.ts` and runs against the real `pes` product roots (the endpoints
 * read the module-level product registry; there is no per-server root override). The
 * generators emit innocuous messages that avoid the mock memory-extraction triggers
 * (see `decideMemory.buildDeterministicMockDecision`), so no global durable memory is
 * written and the four consent runs see identical retrieval state. Consent records and
 * any granted-run research records are cleaned up in `finally` / `after`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import fc from "fast-check";

import { createProductRegistry } from "../../../packages/orchestration/src/products";
import { FilePesResearchStore } from "../../../packages/orchestration/src/pes/researchStore";
import { FilePesConsentStore } from "../../../packages/orchestration/src/pes/consentStore";
import { createDashboardServer } from "./server";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const registry = createProductRegistry(repoRoot);

const CONSENT_VERSION = "pes-consent-v1";

const researchStore = new FilePesResearchStore(registry.pes.researchRecordsRoot!);
const consentStore = new FilePesConsentStore(registry.pes.researchConsentRoot!);

let server: http.Server;
let baseUrl = "";

/** Session refs we touched, so granted-run research records can be cleaned up. */
const touchedSessionRefs = new Set<string>();
/** Consent refs we created, cleaned up at the end. */
const createdConsentRefs: string[] = [];

async function requestJson(pathname: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const json = await response.json().catch(() => null);
  return { response, json };
}

function jsonPost(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

/** Record a consent decision and return its server consentRef. */
async function recordConsent(choice: "granted" | "declined"): Promise<string> {
  const { response, json } = await requestJson(
    "/api/pes/consent",
    jsonPost({
      product: "pes",
      choice,
      sessionId: `pes-consent-sess-${randomUUID()}`,
      consentVersion: CONSENT_VERSION,
    })
  );
  assert.equal(response.status, 201);
  assert.equal(typeof json?.consentRef, "string");
  createdConsentRefs.push(json.consentRef);
  return json.consentRef as string;
}

/** Transition a granted consent to withdrawn. */
async function withdrawConsent(consentRef: string): Promise<void> {
  const { response } = await requestJson(
    "/api/pes/consent/withdraw",
    jsonPost({ product: "pes", consentRef })
  );
  assert.equal(response.status, 200);
}

/**
 * Volatile keys whose values are inevitably unique per request (random ids, wall-clock
 * timestamps, content-snapshot ids, captured commit metadata). They are masked to a
 * constant before comparison so structural/semantic parity is what's actually tested.
 * Consent never touches `runSessionTurn`, so none of these could legitimately carry a
 * consent-dependent difference — masking can only hide nondeterminism, never a real
 * consent effect on the reply (`assistantMessage` is intentionally NOT masked).
 */
const VOLATILE_KEYS = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "contextSnapshotId",
  "capturedAt",
  "commitSha",
]);

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = VOLATILE_KEYS.has(key) ? "<volatile>" : normalize(val);
    }
    return out;
  }
  return value;
}

interface SequenceOutcome {
  statuses: number[];
  replies: string[];
  normalizedBodies: unknown[];
  turnCount: number;
}

/**
 * Run a full message sequence through `POST /api/inquiry/turn` in a single fresh
 * session, under the given consent ref. Returns the per-turn replies and masked
 * response bodies for parity comparison.
 */
async function runSequence(
  messages: string[],
  consentRef: string | undefined
): Promise<SequenceOutcome> {
  let sessionId: string | undefined;
  const statuses: number[] = [];
  const replies: string[] = [];
  const normalizedBodies: unknown[] = [];

  for (const message of messages) {
    const { response, json } = await requestJson(
      "/api/inquiry/turn",
      jsonPost({
        product: "pes",
        mode: "dialogic",
        userMessage: message,
        // Pin the deterministic MockProvider (the "provider seed" of Property 2) so
        // replies are a pure function of canon + message sequence and comparable
        // across consent states, independent of any live provider configured in env.
        provider: "mock",
        ...(sessionId ? { sessionId } : {}),
        ...(consentRef ? { consentRef } : {}),
      })
    );
    assert.equal(response.status, 200, `turn failed: ${JSON.stringify(json)}`);
    sessionId = json.session.id as string;
    touchedSessionRefs.add(sessionId);
    statuses.push(response.status);
    replies.push(json.persistedTurn.assistantMessage as string);
    normalizedBodies.push(normalize(json));
  }

  return { statuses, replies, normalizedBodies, turnCount: messages.length };
}

// Innocuous vocabulary that avoids the mock memory-extraction triggers ("prefer",
// "decided", "default to", "still need to", "revisit", "please use", "never use") and
// contains no PII-shaped tokens, keeping the mock pipeline fully deterministic.
const SAFE_WORDS = [
  "reflection",
  "quiet",
  "river",
  "memory",
  "thought",
  "silence",
  "question",
  "meaning",
  "pattern",
  "light",
  "shadow",
  "echo",
  "mind",
  "time",
  "stillness",
  "wonder",
];

const messageArb = fc
  .array(fc.constantFrom(...SAFE_WORDS), { minLength: 2, maxLength: 8 })
  .map((words) => words.join(" "));

const sequenceArb = fc.array(messageArb, { minLength: 1, maxLength: 3 });

test.before(async () => {
  server = createDashboardServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve dashboard server address");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  // Best-effort cleanup: granted runs write de-identified research records as a
  // post-response side-effect; give in-flight writes a moment, then erase them.
  await new Promise((resolve) => setTimeout(resolve, 200));
  for (const ref of touchedSessionRefs) {
    await researchStore.deleteBySessionRef(ref).catch(() => 0);
  }
  for (const ref of createdConsentRefs) {
    await consentStore.delete(ref).catch(() => false);
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("Property 2: chat responses are identical across every consent state", async () => {
  // One fixed consentRef per consent state, reused across all generated sequences —
  // consent gating depends only on the decision's status, not on the turn's session.
  const grantedRef = await recordConsent("granted");
  const declinedRef = await recordConsent("declined");
  const withdrawnRef = await recordConsent("granted");
  await withdrawConsent(withdrawnRef);

  // The five resolved consent states the property must hold across. `record_failed`
  // is modeled as a consentRef that resolves to no record (Requirement 3.5: a failed
  // recording is treated as `declined` / store-nothing, and never alters the reply).
  const states: { name: string; consentRef: string | undefined }[] = [
    { name: "not_recorded", consentRef: undefined },
    { name: "granted", consentRef: grantedRef },
    { name: "declined", consentRef: declinedRef },
    { name: "withdrawn", consentRef: withdrawnRef },
    { name: "record_failed", consentRef: `consent-${randomUUID()}` },
  ];

  await fc.assert(
    fc.asyncProperty(sequenceArb, async (messages) => {
      const outcomes: { state: { name: string; consentRef: string | undefined }; outcome: SequenceOutcome }[] = [];
      for (const state of states) {
        outcomes.push({ state, outcome: await runSequence(messages, state.consentRef) });
      }

      const baseline = outcomes[0];
      for (let i = 1; i < outcomes.length; i++) {
        const current = outcomes[i];
        const label = `${current.state.name} vs ${baseline.state.name}`;

        // Multi-turn flow: same number of turns accepted.
        assert.equal(
          current.outcome.turnCount,
          baseline.outcome.turnCount,
          `turn count differs (${label})`
        );
        // Response status (capability availability / no failure) identical.
        assert.deepEqual(
          current.outcome.statuses,
          baseline.outcome.statuses,
          `statuses differ (${label})`
        );
        // The assistant replies themselves are byte-identical, turn by turn.
        assert.deepEqual(
          current.outcome.replies,
          baseline.outcome.replies,
          `assistant replies differ (${label})`
        );
        // The full response bodies match once per-run nondeterminism is masked —
        // nothing is disabled, omitted, truncated, or altered by consent.
        assert.deepEqual(
          current.outcome.normalizedBodies,
          baseline.outcome.normalizedBodies,
          `response bodies differ (${label})`
        );
      }
    }),
    { numRuns: 8 }
  );
});
