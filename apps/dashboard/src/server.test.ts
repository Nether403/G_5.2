import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { readdir, rm } from "node:fs/promises";

import { FileMemoryStore } from "../../../packages/orchestration/src/memory/fileMemoryStore";
import { defaultContextSnapshotRoot } from "../../../packages/orchestration/src/persistence/fileContextSnapshotStore";
import { createProductRegistry } from "../../../packages/orchestration/src/products";
import { FileSessionStore } from "../../../packages/orchestration/src/sessions/fileSessionStore";
import { FileWitnessConsentStore } from "../../../packages/orchestration/src/witness/fileConsentStore";
import { FileWitnessTestimonyStore } from "../../../packages/orchestration/src/witness/fileTestimonyStore";
import { createDashboardServer } from "./server";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const registry = createProductRegistry(repoRoot);

let server: http.Server;
let baseUrl = "";

async function requestJson(pathname: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const json = await response.json().catch(() => null);
  return { response, json };
}

async function cleanupWitnessArtifacts(
  witnessId: string,
  sessionId?: string,
  turnId?: string
) {
  const consentStore = new FileWitnessConsentStore(registry.witness.consentRoot!);
  const testimonyStore = new FileWitnessTestimonyStore(registry.witness.testimonyRoot!);
  const memoryStore = new FileMemoryStore(registry.witness.memoryRoot);
  const sessionStore = new FileSessionStore(registry.witness.sessionsRoot);

  const consentRecords = await consentStore.list();
  await Promise.all(
    consentRecords
      .filter((record) => record.witnessId === witnessId)
      .map((record) => consentStore.delete(record.id))
  );

  const testimonyRecords = await testimonyStore.list();
  await Promise.all(
    testimonyRecords
      .filter((record) => record.witnessId === witnessId)
      .map((record) => testimonyStore.delete(record.id))
  );

  const memoryItems = await memoryStore.list();
  await Promise.all(
    memoryItems
      .filter(
        (item) =>
          (sessionId && item.sessionId === sessionId) ||
          (turnId && item.createdFrom?.turnId === turnId) ||
          (turnId && item.lastConfirmedFrom?.turnId === turnId)
      )
      .map((item) => memoryStore.delete(item.id))
  );

  if (sessionId) {
    const session = await sessionStore.load(sessionId);
    const snapshotRoot = defaultContextSnapshotRoot(registry.witness.sessionsRoot);
    const snapshotIds = (session?.turns ?? [])
      .map((item) => item.contextSnapshotId)
      .filter((value): value is string => Boolean(value));
    await Promise.all(
      snapshotIds.map((snapshotId) =>
        rm(path.join(snapshotRoot, `${snapshotId}.json`), { force: true })
      )
    );
    await rm(path.join(registry.witness.sessionsRoot, `${sessionId}.json`), {
      force: true,
    });
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

test("POST /api/inquiry/turn blocks witness turns without consent", async () => {
  const witnessId = `wit-${randomUUID()}`;
  const sessionFilesBefore = await readdir(registry.witness.sessionsRoot).catch(
    () => []
  );

  try {
    const { response, json } = await requestJson("/api/inquiry/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: "witness",
        witnessId,
        mode: "dialogic",
        userMessage: "Tell me what changed.",
      }),
    });

    assert.equal(response.status, 409);
    assert.equal(json?.error, "Witness consent requirements not met.");
    assert.deepEqual(json?.missingScopes, ["conversational", "retention"]);

    const sessionFilesAfter = await readdir(registry.witness.sessionsRoot).catch(
      () => []
    );
    assert.deepEqual(sessionFilesAfter.sort(), sessionFilesBefore.sort());

    const testimony = await requestJson(
      `/api/witness/testimony?witnessId=${encodeURIComponent(witnessId)}`
    );
    assert.equal(testimony.response.status, 200);
    assert.deepEqual(testimony.json, []);
  } finally {
    await cleanupWitnessArtifacts(witnessId);
  }
});

test("witness endpoints persist consent, sessions, and testimony without touching P-E-S sessions", async () => {
  const witnessId = `wit-${randomUUID()}`;
  let sessionId: string | undefined;
  let turnId: string | undefined;

  try {
    for (const scope of ["conversational", "retention"]) {
      const consent = await requestJson("/api/witness/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          witnessId,
          scope,
          status: "granted",
          actor: "witness",
        }),
      });
      assert.equal(consent.response.status, 201);
      assert.equal(consent.json?.witnessId, witnessId);
    }

    const turn = await requestJson("/api/inquiry/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: "witness",
        witnessId,
        mode: "dialogic",
        userMessage: "I need to start the inquiry.",
      }),
    });

    assert.equal(turn.response.status, 200);
    assert.equal(turn.json?.product, "witness");
    assert.equal(turn.json?.session?.productId, "witness");
    assert.equal(turn.json?.session?.witnessId, witnessId);
    assert.ok(turn.json?.testimonyId);

    sessionId = turn.json.session.id;
    turnId = turn.json.persistedTurn.id;

    const consentList = await requestJson(
      `/api/witness/consent?witnessId=${encodeURIComponent(witnessId)}`
    );
    assert.equal(consentList.response.status, 200);
    assert.equal(consentList.json.length, 2);

    const testimonyList = await requestJson(
      `/api/witness/testimony?witnessId=${encodeURIComponent(witnessId)}`
    );
    assert.equal(testimonyList.response.status, 200);
    assert.equal(testimonyList.json.length, 1);
    assert.equal(testimonyList.json[0].sessionId, sessionId);
    assert.equal(testimonyList.json[0].segments.length, 2);

    const testimony = await requestJson(
      `/api/witness/testimony/${encodeURIComponent(turn.json.testimonyId)}`
    );
    assert.equal(testimony.response.status, 200);
    assert.equal(testimony.json?.id, turn.json.testimonyId);

    const witnessSessions = await requestJson("/api/inquiry/sessions?product=witness");
    assert.equal(witnessSessions.response.status, 200);
    assert.ok(witnessSessions.json.some((session: { id: string }) => session.id === sessionId));

    const pesSessions = await requestJson("/api/inquiry/sessions?product=pes");
    assert.equal(pesSessions.response.status, 200);
    assert.ok(!pesSessions.json.some((session: { id: string }) => session.id === sessionId));
  } finally {
    await cleanupWitnessArtifacts(witnessId, sessionId, turnId);
  }
});
