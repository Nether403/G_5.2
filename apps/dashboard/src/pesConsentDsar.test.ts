/**
 * Integration tests for the P-E-S consent and DSAR endpoints (task 9.4).
 *
 * Exercises the actual HTTP endpoints in `server.ts` end to end:
 *   - record   → POST /api/pes/consent (granted) → { consentRef, status }
 *   - access   → GET    /api/pes/research/:ref
 *   - erasure  → DELETE /api/pes/research/:ref
 *   - withdraw → POST   /api/pes/consent/withdraw (deletes prior research records)
 *
 * Covers the record → access → erasure and withdraw → delete flows.
 * _Requirements: 4.5, 4.6, 4.7, 4.8, 9.4, 9.6_
 *
 * ponytail: research records are normally written by the turn handler (task 13.1).
 * For the access/erasure flows here we seed `FilePesResearchStore` directly under the
 * configured `researchRecordsRoot` (a valid record), then exercise the GET/DELETE
 * endpoints. These tests run against the real `pes` product roots (the endpoints read
 * the module-level product registry; there is no per-server root override) and isolate
 * via unique UUID session references plus `finally` cleanup — the same real-roots +
 * cleanup pattern the Witness endpoint tests in `server.test.ts` use.
 */

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { createProductRegistry } from "../../../packages/orchestration/src/products";
import { FilePesResearchStore } from "../../../packages/orchestration/src/pes/researchStore";
import { FilePesConsentStore } from "../../../packages/orchestration/src/pes/consentStore";
import {
  PES_RESEARCH_DATASET_ID,
  type PesResearchRecord,
} from "../../../packages/orchestration/src/pes/types";
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

/** Seed a valid, de-identified research record directly into the store. */
async function seedResearchRecord(
  sessionRef: string,
  content = "A de-identified reflection from [REDACTED_NAME]."
): Promise<PesResearchRecord> {
  return researchStore.write({
    id: `pesr-${randomUUID()}`,
    datasetId: PES_RESEARCH_DATASET_ID,
    sessionRef,
    consentDecisionRef: `consent-${randomUUID()}`,
    consentVersion: CONSENT_VERSION,
    collectedAt: new Date().toISOString(),
    content,
  });
}

/** Remove every record/consent artifact created for the given session refs. */
async function cleanup(sessionRefs: string[], consentRefs: string[]) {
  for (const ref of sessionRefs) {
    await researchStore.deleteBySessionRef(ref).catch(() => 0);
  }
  for (const ref of consentRefs) {
    await consentStore.delete(ref).catch(() => false);
  }
}

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
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("record → access → erasure flow over the consent and DSAR endpoints", async () => {
  const sessionRef = `pes-sess-${randomUUID()}`;
  const consentRefs: string[] = [];

  try {
    // record: POST /api/pes/consent (granted) → consentRef + status (Req 9.2)
    const consent = await requestJson(
      "/api/pes/consent",
      jsonPost({
        product: "pes",
        choice: "granted",
        sessionId: sessionRef,
        consentVersion: CONSENT_VERSION,
      })
    );
    assert.equal(consent.response.status, 201);
    assert.equal(typeof consent.json?.consentRef, "string");
    assert.equal(consent.json?.status, "granted");
    consentRefs.push(consent.json.consentRef);

    // seed a research record for the session (normally written by the turn handler)
    const seeded = await seedResearchRecord(sessionRef);

    // access: GET /api/pes/research/:ref returns the stored record(s) (Req 4.5)
    const access = await requestJson(
      `/api/pes/research/${encodeURIComponent(sessionRef)}`
    );
    assert.equal(access.response.status, 200);
    assert.equal(access.json?.exists, true);
    assert.equal(access.json?.records.length, 1);
    assert.equal(access.json.records[0].id, seeded.id);
    assert.equal(access.json.records[0].content, seeded.content);

    // erasure: DELETE /api/pes/research/:ref deletes and reports success (Req 4.7)
    const erasure = await requestJson(
      `/api/pes/research/${encodeURIComponent(sessionRef)}`,
      { method: "DELETE" }
    );
    assert.equal(erasure.response.status, 200);
    assert.equal(erasure.json?.deleted, 1);

    // access after erasure: indicates no record exists (Req 4.6)
    const afterErasure = await requestJson(
      `/api/pes/research/${encodeURIComponent(sessionRef)}`
    );
    assert.equal(afterErasure.response.status, 404);
    assert.equal(afterErasure.json?.exists, false);
    assert.deepEqual(afterErasure.json?.records, []);
  } finally {
    await cleanup([sessionRef], consentRefs);
  }
});

test("access and erasure for a session with no record indicate none exist", async () => {
  const sessionRef = `pes-sess-${randomUUID()}`;

  // access for an absent reference → no record exists (Req 4.6)
  const access = await requestJson(
    `/api/pes/research/${encodeURIComponent(sessionRef)}`
  );
  assert.equal(access.response.status, 404);
  assert.equal(access.json?.exists, false);

  // erasure for an absent reference → none exist, nothing deleted (Req 4.8)
  const erasure = await requestJson(
    `/api/pes/research/${encodeURIComponent(sessionRef)}`,
    { method: "DELETE" }
  );
  assert.equal(erasure.response.status, 404);
  assert.equal(erasure.json?.exists, false);
  assert.equal(erasure.json?.deleted, 0);
});

test("withdraw → delete flow erases the session's research records and is idempotent", async () => {
  const sessionRef = `pes-sess-${randomUUID()}`;
  const otherSessionRef = `pes-sess-${randomUUID()}`;
  const consentRefs: string[] = [];

  try {
    // record granted consent linked to the session (Req 9.2)
    const consent = await requestJson(
      "/api/pes/consent",
      jsonPost({
        product: "pes",
        choice: "granted",
        sessionId: sessionRef,
        consentVersion: CONSENT_VERSION,
      })
    );
    assert.equal(consent.response.status, 201);
    const consentRef = consent.json.consentRef as string;
    consentRefs.push(consentRef);

    // seed two records for the consented session, and one unrelated record
    await seedResearchRecord(sessionRef);
    await seedResearchRecord(sessionRef);
    const unrelated = await seedResearchRecord(otherSessionRef);

    // withdraw: transitions to withdrawn and deletes prior records (Req 9.4/9.6)
    const withdraw = await requestJson(
      "/api/pes/consent/withdraw",
      jsonPost({ product: "pes", consentRef })
    );
    assert.equal(withdraw.response.status, 200);
    assert.equal(withdraw.json?.status, "withdrawn");
    assert.equal(withdraw.json?.deleted, 2);
    assert.equal(withdraw.json?.deletionComplete, true);
    assert.equal(typeof withdraw.json?.withdrawnAt, "string");

    // the session's research records are gone (Req 9.4)
    const afterWithdraw = await requestJson(
      `/api/pes/research/${encodeURIComponent(sessionRef)}`
    );
    assert.equal(afterWithdraw.response.status, 404);
    assert.equal(afterWithdraw.json?.exists, false);

    // the unrelated session's record is untouched (Req 4.8 — only the target erased)
    const otherAccess = await requestJson(
      `/api/pes/research/${encodeURIComponent(otherSessionRef)}`
    );
    assert.equal(otherAccess.response.status, 200);
    assert.equal(otherAccess.json?.records.length, 1);
    assert.equal(otherAccess.json.records[0].id, unrelated.id);

    // withdrawing again is a no-op: "already withdrawn", no further deletion (Req 9.7)
    const withdrawAgain = await requestJson(
      "/api/pes/consent/withdraw",
      jsonPost({ product: "pes", consentRef })
    );
    assert.equal(withdrawAgain.response.status, 200);
    assert.equal(withdrawAgain.json?.status, "withdrawn");
    assert.equal(withdrawAgain.json?.alreadyWithdrawn, true);
    assert.equal(withdrawAgain.json?.deleted, 0);
  } finally {
    await cleanup([sessionRef, otherSessionRef], consentRefs);
  }
});

test("withdraw for an unknown consent reference reports no record", async () => {
  const withdraw = await requestJson(
    "/api/pes/consent/withdraw",
    jsonPost({ product: "pes", consentRef: `consent-${randomUUID()}` })
  );
  assert.equal(withdraw.response.status, 404);
  assert.equal(withdraw.json?.error, "No consent record for that reference");
});
