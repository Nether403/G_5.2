import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";

import { FileMemoryStore } from "../../../packages/orchestration/src/memory/fileMemoryStore";
import { defaultContextSnapshotRoot } from "../../../packages/orchestration/src/persistence/fileContextSnapshotStore";
import { createProductRegistry } from "../../../packages/orchestration/src/products";
import { FileSessionStore } from "../../../packages/orchestration/src/sessions/fileSessionStore";
import { FileWitnessConsentStore } from "../../../packages/orchestration/src/witness/fileConsentStore";
import {
  FileWitnessAnnotationStore,
  FileWitnessArchiveCandidateStore,
  FileWitnessPublicationBundleStore,
  FileWitnessSynthesisStore,
} from "../../../packages/orchestration/src/witness/fileDraftStores";
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

async function requestText(pathname: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const text = await response.text();
  return { response, text };
}

async function cleanupWitnessArtifacts(
  witnessId: string,
  sessionId?: string,
  turnId?: string
) {
  const consentStore = new FileWitnessConsentStore(registry.witness.consentRoot!);
  const testimonyStore = new FileWitnessTestimonyStore(registry.witness.testimonyRoot!);
  const synthesisStore = new FileWitnessSynthesisStore(registry.witness.synthesisRoot!);
  const annotationStore = new FileWitnessAnnotationStore(registry.witness.annotationRoot!);
  const archiveCandidateStore = new FileWitnessArchiveCandidateStore(
    registry.witness.archiveCandidateRoot!
  );
  const publicationBundleStore = new FileWitnessPublicationBundleStore(
    registry.witness.publicationBundleRoot!
  );
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

  const synthesisRecords = await synthesisStore.list();
  await Promise.all(
    synthesisRecords
      .filter((record) => record.witnessId === witnessId)
      .map((record) => synthesisStore.delete(record.id))
  );

  const annotationRecords = await annotationStore.list();
  await Promise.all(
    annotationRecords
      .filter((record) => record.witnessId === witnessId)
      .map((record) => annotationStore.delete(record.id))
  );

  const archiveCandidates = await archiveCandidateStore.list();
  await Promise.all(
    archiveCandidates
      .filter((record) => record.witnessId === witnessId)
      .map((record) => archiveCandidateStore.delete(record.id))
  );

  const publicationBundles = (await publicationBundleStore.list()).filter(
    (record) => record.witnessId === witnessId
  );
  await Promise.all(
    publicationBundles
      .flatMap((record) => {
        const tasks: Array<Promise<unknown>> = [
          publicationBundleStore.delete(record!.id),
        ];
        if (record?.bundleJsonPath) {
          tasks.push(rm(record.bundleJsonPath, { force: true }));
        }
        if (record?.bundleMarkdownPath) {
          tasks.push(rm(record.bundleMarkdownPath, { force: true }));
        }
        return tasks;
      })
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

async function createPublicationReadyArchiveCandidate(witnessId: string) {
  for (const scope of [
    "conversational",
    "retention",
    "synthesis",
    "annotation",
    "archive_review",
    "publication",
  ]) {
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
  }

  const turn = await requestJson("/api/inquiry/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      product: "witness",
      provider: "mock",
      witnessId,
      mode: "dialogic",
      userMessage: "Prepare this testimony for publication bundling.",
    }),
  });
  assert.equal(turn.response.status, 200);

  const testimonyId = turn.json.testimonyId as string;
  const sessionId = turn.json.session.id as string;
  const turnId = turn.json.persistedTurn.id as string;

  const seal = await requestJson(
    `/api/witness/testimony/${encodeURIComponent(testimonyId)}/seal`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "seal it" }),
    }
  );
  assert.equal(seal.response.status, 200);

  const synthesis = await requestJson("/api/witness/synthesis/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ testimonyId, provider: "mock" }),
  });
  assert.equal(synthesis.response.status, 201);

  const approvedSynthesis = await requestJson(
    `/api/witness/synthesis/${encodeURIComponent(synthesis.json.id)}/approve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "approve synthesis" }),
    }
  );
  assert.equal(approvedSynthesis.response.status, 200);

  const testimony = await requestJson(
    `/api/witness/testimony/${encodeURIComponent(testimonyId)}`
  );
  assert.equal(testimony.response.status, 200);
  const witnessSegmentIds = testimony.json.segments
    .filter((segment: { role: string }) => segment.role === "witness")
    .map((segment: { id: string }) => segment.id);

  const annotation = await requestJson("/api/witness/annotations/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      testimonyId,
      provider: "mock",
      segmentIds: witnessSegmentIds,
    }),
  });
  assert.equal(annotation.response.status, 201);

  const approvedAnnotation = await requestJson(
    `/api/witness/annotations/${encodeURIComponent(annotation.json.id)}/approve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "approve annotation" }),
    }
  );
  assert.equal(approvedAnnotation.response.status, 200);

  const candidate = await requestJson("/api/witness/archive-candidates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ testimonyId }),
  });
  assert.equal(candidate.response.status, 201);

  const archiveApproved = await requestJson(
    `/api/witness/archive-candidates/${encodeURIComponent(candidate.json.id)}/approve-archive-review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "archive approve" }),
    }
  );
  assert.equal(archiveApproved.response.status, 200);

  const publicationReady = await requestJson(
    `/api/witness/archive-candidates/${encodeURIComponent(candidate.json.id)}/mark-publication-ready`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "ready" }),
    }
  );
  assert.equal(publicationReady.response.status, 200);

  return {
    witnessId,
    testimonyId,
    sessionId,
    turnId,
    archiveCandidateId: candidate.json.id as string,
  };
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
        provider: "mock",
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

test("witness synthesis draft returns 409 until retention and synthesis consent are effective", async () => {
  const witnessId = `wit-${randomUUID()}`;
  let testimonyId: string | undefined;
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
    }

    const turn = await requestJson("/api/inquiry/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: "witness",
        provider: "mock",
        witnessId,
        mode: "dialogic",
        userMessage: "I need a testimony before synthesis.",
      }),
    });

    assert.equal(turn.response.status, 200);
    testimonyId = turn.json.testimonyId;
    sessionId = turn.json.session.id;
    turnId = turn.json.persistedTurn.id;

    const draft = await requestJson("/api/witness/synthesis/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        testimonyId,
        provider: "mock",
      }),
    });

    assert.equal(draft.response.status, 409);
    assert.deepEqual(draft.json?.missingScopes, ["synthesis"]);
  } finally {
    await cleanupWitnessArtifacts(witnessId, sessionId, turnId);
  }
});

test("witness synthesis and annotation endpoints persist drafts, approvals, and superseding within witness roots only", async () => {
  const witnessId = `wit-${randomUUID()}`;
  let testimonyId: string | undefined;
  let sessionId: string | undefined;
  let turnId: string | undefined;

  try {
    for (const scope of ["conversational", "retention", "synthesis", "annotation"]) {
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
    }

    const turn = await requestJson("/api/inquiry/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: "witness",
        provider: "mock",
        witnessId,
        mode: "dialogic",
        userMessage: "First I hesitated, and I am not sure why.",
      }),
    });

    assert.equal(turn.response.status, 200);
    testimonyId = turn.json.testimonyId;
    sessionId = turn.json.session.id;
    turnId = turn.json.persistedTurn.id;

    const testimony = await requestJson(
      `/api/witness/testimony/${encodeURIComponent(testimonyId!)}`
    );
    assert.equal(testimony.response.status, 200);
    const witnessSegmentIds = testimony.json.segments
      .filter((segment: { role: string }) => segment.role === "witness")
      .map((segment: { id: string }) => segment.id);

    const firstSynthesis = await requestJson("/api/witness/synthesis/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        testimonyId,
        provider: "mock",
      }),
    });
    assert.equal(firstSynthesis.response.status, 201);

    const firstApproved = await requestJson(
      `/api/witness/synthesis/${encodeURIComponent(firstSynthesis.json.id)}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "approve first" }),
      }
    );
    assert.equal(firstApproved.response.status, 200);
    assert.equal(firstApproved.json?.status, "approved");

    const secondSynthesis = await requestJson("/api/witness/synthesis/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        testimonyId,
        provider: "mock",
      }),
    });
    assert.equal(secondSynthesis.response.status, 201);

    const secondApproved = await requestJson(
      `/api/witness/synthesis/${encodeURIComponent(secondSynthesis.json.id)}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "approve second" }),
      }
    );
    assert.equal(secondApproved.response.status, 200);
    assert.equal(secondApproved.json?.status, "approved");

    const synthesisList = await requestJson(
      `/api/witness/synthesis?witnessId=${encodeURIComponent(witnessId)}&testimonyId=${encodeURIComponent(testimonyId!)}`
    );
    assert.equal(synthesisList.response.status, 200);
    assert.ok(
      synthesisList.json.some(
        (record: { id: string; status: string }) =>
          record.id === firstSynthesis.json.id && record.status === "superseded"
      )
    );

    const annotationDraft = await requestJson("/api/witness/annotations/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        testimonyId,
        provider: "mock",
        segmentIds: witnessSegmentIds,
      }),
    });
    assert.equal(annotationDraft.response.status, 201);
    assert.ok(annotationDraft.json?.entries?.length >= 1);

    const annotationApproved = await requestJson(
      `/api/witness/annotations/${encodeURIComponent(annotationDraft.json.id)}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "approve annotations" }),
      }
    );
    assert.equal(annotationApproved.response.status, 200);
    assert.equal(annotationApproved.json?.status, "approved");

    const annotationList = await requestJson(
      `/api/witness/annotations?witnessId=${encodeURIComponent(witnessId)}&testimonyId=${encodeURIComponent(testimonyId!)}`
    );
    assert.equal(annotationList.response.status, 200);
    assert.equal(annotationList.json.length, 1);

    const updatedTestimony = await requestJson(
      `/api/witness/testimony/${encodeURIComponent(testimonyId!)}`
    );
    assert.equal(updatedTestimony.response.status, 200);
    assert.equal(updatedTestimony.json?.state, "synthesized");

    const pesSessions = await requestJson("/api/inquiry/sessions?product=pes");
    assert.equal(pesSessions.response.status, 200);
    assert.ok(!pesSessions.json.some((session: { id: string }) => session.id === sessionId));
  } finally {
    await cleanupWitnessArtifacts(witnessId, sessionId, turnId);
  }
});

test("sealed testimony blocks further witness-turn appends and archive candidate creation requires sealed testimony plus approvals", async () => {
  const witnessId = `wit-${randomUUID()}`;
  let testimonyId: string | undefined;
  let sessionId: string | undefined;
  let turnId: string | undefined;

  try {
    for (const scope of [
      "conversational",
      "retention",
      "synthesis",
      "annotation",
      "archive_review",
    ]) {
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
    }

    const turn = await requestJson("/api/inquiry/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: "witness",
        provider: "mock",
        witnessId,
        mode: "dialogic",
        userMessage: "This testimony will be sealed.",
      }),
    });
    assert.equal(turn.response.status, 200);
    testimonyId = turn.json.testimonyId;
    sessionId = turn.json.session.id;
    turnId = turn.json.persistedTurn.id;

    const unsealedCandidate = await requestJson("/api/witness/archive-candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testimonyId }),
    });
    assert.equal(unsealedCandidate.response.status, 409);

    const seal = await requestJson(
      `/api/witness/testimony/${encodeURIComponent(testimonyId!)}/seal`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "seal it" }),
      }
    );
    assert.equal(seal.response.status, 200);
    assert.equal(seal.json?.state, "sealed");

    const secondTurn = await requestJson("/api/inquiry/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: "witness",
        provider: "mock",
        witnessId,
        sessionId,
        mode: "dialogic",
        userMessage: "This should create a new testimony record.",
      }),
    });
    assert.equal(secondTurn.response.status, 200);
    assert.notEqual(secondTurn.json?.testimonyId, testimonyId);

    const firstSynthesis = await requestJson("/api/witness/synthesis/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testimonyId, provider: "mock" }),
    });
    assert.equal(firstSynthesis.response.status, 201);
    const approvedSynthesis = await requestJson(
      `/api/witness/synthesis/${encodeURIComponent(firstSynthesis.json.id)}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "approve" }),
      }
    );
    assert.equal(approvedSynthesis.response.status, 200);

    const testimony = await requestJson(
      `/api/witness/testimony/${encodeURIComponent(testimonyId!)}`
    );
    const witnessSegmentIds = testimony.json.segments
      .filter((segment: { role: string }) => segment.role === "witness")
      .map((segment: { id: string }) => segment.id);

    const annotationDraft = await requestJson("/api/witness/annotations/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        testimonyId,
        provider: "mock",
        segmentIds: witnessSegmentIds,
      }),
    });
    assert.equal(annotationDraft.response.status, 201);
    const approvedAnnotation = await requestJson(
      `/api/witness/annotations/${encodeURIComponent(annotationDraft.json.id)}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "approve" }),
      }
    );
    assert.equal(approvedAnnotation.response.status, 200);

    const candidate = await requestJson("/api/witness/archive-candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testimonyId }),
    });
    assert.equal(candidate.response.status, 201);
    assert.equal(candidate.json?.status, "draft");
    assert.equal(candidate.json?.testimonyUpdatedAt, seal.json?.updatedAt);
  } finally {
    await cleanupWitnessArtifacts(witnessId, sessionId, turnId);
  }
});

test("archive review and publication endpoints persist witness candidate state without touching P-E-S roots", async () => {
  const witnessId = `wit-${randomUUID()}`;
  let testimonyId: string | undefined;
  let sessionId: string | undefined;
  let turnId: string | undefined;

  try {
    for (const scope of [
      "conversational",
      "retention",
      "synthesis",
      "annotation",
      "archive_review",
      "publication",
    ]) {
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
    }

    const turn = await requestJson("/api/inquiry/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: "witness",
        provider: "mock",
        witnessId,
        mode: "dialogic",
        userMessage: "This testimony will reach publication ready.",
      }),
    });
    assert.equal(turn.response.status, 200);
    testimonyId = turn.json.testimonyId;
    sessionId = turn.json.session.id;
    turnId = turn.json.persistedTurn.id;

    await requestJson(`/api/witness/testimony/${encodeURIComponent(testimonyId!)}/seal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "seal it" }),
    });
    const synthesis = await requestJson("/api/witness/synthesis/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testimonyId, provider: "mock" }),
    });
    await requestJson(`/api/witness/synthesis/${encodeURIComponent(synthesis.json.id)}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "approve" }),
    });

    const testimony = await requestJson(
      `/api/witness/testimony/${encodeURIComponent(testimonyId!)}`
    );
    const witnessSegmentIds = testimony.json.segments
      .filter((segment: { role: string }) => segment.role === "witness")
      .map((segment: { id: string }) => segment.id);

    const annotation = await requestJson("/api/witness/annotations/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        testimonyId,
        provider: "mock",
        segmentIds: witnessSegmentIds,
      }),
    });
    await requestJson(`/api/witness/annotations/${encodeURIComponent(annotation.json.id)}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "approve" }),
    });

    const candidate = await requestJson("/api/witness/archive-candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testimonyId }),
    });
    assert.equal(candidate.response.status, 201);

    const archiveApproved = await requestJson(
      `/api/witness/archive-candidates/${encodeURIComponent(candidate.json.id)}/approve-archive-review`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "archive approve" }),
      }
    );
    assert.equal(archiveApproved.response.status, 200);
    assert.equal(archiveApproved.json?.status, "archive_review_approved");

    const publicationReady = await requestJson(
      `/api/witness/archive-candidates/${encodeURIComponent(candidate.json.id)}/mark-publication-ready`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "ready" }),
      }
    );
    assert.equal(publicationReady.response.status, 200);
    assert.equal(publicationReady.json?.status, "publication_ready");

    const list = await requestJson(
      `/api/witness/archive-candidates?witnessId=${encodeURIComponent(witnessId)}&testimonyId=${encodeURIComponent(testimonyId!)}`
    );
    assert.equal(list.response.status, 200);
    assert.equal(list.json.length, 1);

    const pesSessions = await requestJson("/api/inquiry/sessions?product=pes");
    assert.equal(pesSessions.response.status, 200);
    assert.ok(!pesSessions.json.some((session: { id: string }) => session.id === sessionId));
  } finally {
    await cleanupWitnessArtifacts(witnessId, sessionId, turnId);
  }
});

test("publication bundle endpoints create and list witness export bundles", async () => {
  const witnessId = `wit-${randomUUID()}`;
  let testimonyId: string | undefined;
  let sessionId: string | undefined;
  let turnId: string | undefined;

  try {
    const setup = await createPublicationReadyArchiveCandidate(witnessId);
    testimonyId = setup.testimonyId;
    sessionId = setup.sessionId;
    turnId = setup.turnId;

    const created = await requestJson("/api/witness/publication-bundles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        archiveCandidateId: setup.archiveCandidateId,
      }),
    });

    assert.equal(created.response.status, 201);
    assert.equal(created.json?.witnessId, witnessId);
    assert.equal(created.json?.testimonyId, testimonyId);
    assert.equal(created.json?.archiveCandidateId, setup.archiveCandidateId);
    assert.match(
      created.json?.bundleJsonPath ?? "",
      new RegExp(
        `${path.join(registry.witness.publicationBundleRoot!, "exports").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*\\.json$`
      )
    );
    assert.match(
      created.json?.bundleMarkdownPath ?? "",
      new RegExp(
        `${path.join(registry.witness.publicationBundleRoot!, "exports").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*\\.md$`
      )
    );
    assert.ok((created.json?.bundleJsonPath ?? "").endsWith(".json"));
    assert.ok((created.json?.bundleMarkdownPath ?? "").endsWith(".md"));

    const listed = await requestJson(
      `/api/witness/publication-bundles?witnessId=${encodeURIComponent(witnessId)}&testimonyId=${encodeURIComponent(testimonyId)}`
    );
    assert.equal(listed.response.status, 200);
    assert.equal(listed.json.length, 1);
    assert.equal(listed.json[0].id, created.json.id);
    assert.equal(listed.json[0].bundleJsonPath, created.json.bundleJsonPath);
    assert.equal(
      listed.json[0].bundleMarkdownPath,
      created.json.bundleMarkdownPath
    );

    const fetched = await requestJson(
      `/api/witness/publication-bundles/${encodeURIComponent(created.json.id)}`
    );
    assert.equal(fetched.response.status, 200);
    assert.equal(fetched.json?.id, created.json.id);
    assert.equal(fetched.json?.bundleJsonPath, created.json.bundleJsonPath);
    assert.equal(
      fetched.json?.bundleMarkdownPath,
      created.json.bundleMarkdownPath
    );

    const fetchedJson = await requestText(
      `/api/witness/publication-bundles/${encodeURIComponent(created.json.id)}/json`
    );
    assert.equal(fetchedJson.response.status, 200);
    assert.match(
      fetchedJson.response.headers.get("content-type") ?? "",
      /^application\/json\b/i
    );
    assert.match(fetchedJson.text, /"schemaVersion": "0\.2\.0"/);

    const fetchedMarkdown = await requestText(
      `/api/witness/publication-bundles/${encodeURIComponent(created.json.id)}/markdown`
    );
    assert.equal(fetchedMarkdown.response.status, 200);
    assert.match(
      fetchedMarkdown.response.headers.get("content-type") ?? "",
      /^text\/markdown\b/i
    );
    assert.match(fetchedMarkdown.text, /Publication Bundle/);
  } finally {
    await cleanupWitnessArtifacts(witnessId, sessionId, turnId);
  }
});

test("publication bundle listing returns 200 with an empty list when the bundle root is missing", async () => {
  const publicationBundleRoot = registry.witness.publicationBundleRoot!;
  const backupRoot = `${publicationBundleRoot}.bak-${randomUUID()}`;
  let renamed = false;

  try {
    await rename(publicationBundleRoot, backupRoot);
    renamed = true;

    const listed = await requestJson(
      `/api/witness/publication-bundles?witnessId=${encodeURIComponent(`wit-${randomUUID()}`)}&testimonyId=${encodeURIComponent(`test-${randomUUID()}`)}`
    );

    assert.equal(listed.response.status, 200);
    assert.deepEqual(listed.json, []);
  } finally {
    if (renamed) {
      await rm(publicationBundleRoot, { recursive: true, force: true });
      await rename(backupRoot, publicationBundleRoot);
    }
  }
});

test("publication bundle creation returns 409 until archive candidate is publication ready", async () => {
  const witnessId = `wit-${randomUUID()}`;
  let sessionId: string | undefined;
  let turnId: string | undefined;

  try {
    const setup = await createPublicationReadyArchiveCandidate(witnessId);
    sessionId = setup.sessionId;
    turnId = setup.turnId;

    const revert = await requestJson(
      `/api/witness/archive-candidates/${encodeURIComponent(setup.archiveCandidateId)}/reject-publication`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "not ready anymore" }),
      }
    );
    assert.equal(revert.response.status, 200);
    assert.equal(revert.json?.status, "publication_rejected");

    const created = await requestJson("/api/witness/publication-bundles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        archiveCandidateId: setup.archiveCandidateId,
      }),
    });

    assert.equal(created.response.status, 409);
    assert.match(
      created.json?.error ?? "",
      /publication_ready archive candidate/i
    );
  } finally {
    await cleanupWitnessArtifacts(witnessId, sessionId, turnId);
  }
});

test("publication bundle endpoints return 400 and 404 for missing or unknown identifiers", async () => {
  const listMissing = await requestJson("/api/witness/publication-bundles");
  assert.equal(listMissing.response.status, 400);

  const createMissing = await requestJson("/api/witness/publication-bundles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(createMissing.response.status, 400);

  const unknownId = `bundle-${randomUUID()}`;
  const fetched = await requestJson(
    `/api/witness/publication-bundles/${encodeURIComponent(unknownId)}`
  );
  assert.equal(fetched.response.status, 404);

  const created = await requestJson("/api/witness/publication-bundles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      archiveCandidateId: `cand-${randomUUID()}`,
    }),
  });
  assert.equal(created.response.status, 404);
});

test("publication bundle creation returns 400 for non-string archiveCandidateId bodies", async () => {
  const created = await requestJson("/api/witness/publication-bundles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      archiveCandidateId: 123,
    }),
  });

  assert.equal(created.response.status, 400);
  assert.equal(created.json?.error, "archiveCandidateId is required");
});

test("publication bundle creation returns 500 when a required source artifact is missing", async () => {
  const witnessId = `wit-${randomUUID()}`;
  let sessionId: string | undefined;
  let turnId: string | undefined;

  try {
    const setup = await createPublicationReadyArchiveCandidate(witnessId);
    sessionId = setup.sessionId;
    turnId = setup.turnId;

    const archiveCandidateStore = new FileWitnessArchiveCandidateStore(
      registry.witness.archiveCandidateRoot!
    );
    const synthesisStore = new FileWitnessSynthesisStore(
      registry.witness.synthesisRoot!
    );
    const candidate = await archiveCandidateStore.load(setup.archiveCandidateId);
    assert.ok(candidate);

    await synthesisStore.delete(candidate!.approvedSynthesisId);

    const created = await requestJson("/api/witness/publication-bundles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        archiveCandidateId: setup.archiveCandidateId,
      }),
    });

    assert.equal(created.response.status, 500);
    assert.match(created.json?.error ?? "", /Unknown synthesis record/i);
  } finally {
    await cleanupWitnessArtifacts(witnessId, sessionId, turnId);
  }
});

test("publication bundle artifact endpoints return 404 for unknown bundle ids", async () => {
  const unknownId = `bundle-${randomUUID()}`;

  const json = await requestText(
    `/api/witness/publication-bundles/${encodeURIComponent(unknownId)}/json`
  );
  assert.equal(json.response.status, 404);

  const markdown = await requestText(
    `/api/witness/publication-bundles/${encodeURIComponent(unknownId)}/markdown`
  );
  assert.equal(markdown.response.status, 404);
});

test("publication bundle artifact endpoints return 500 for broken markdown state and escaped paths", async () => {
  const bundleId = `bundle-${randomUUID()}`;
  const exportsRoot = path.join(registry.witness.publicationBundleRoot!, "exports");
  await mkdir(exportsRoot, { recursive: true });

  const jsonPath = path.join(exportsRoot, `${bundleId}.json`);
  await writeFile(jsonPath, '{ "schemaVersion": "0.2.0" }\n', "utf8");

  const publicationBundleStore = new FileWitnessPublicationBundleStore(
    registry.witness.publicationBundleRoot!
  );

  try {
    await publicationBundleStore.save({
      id: bundleId,
      witnessId: `wit-${randomUUID()}`,
      testimonyId: `testimony-${randomUUID()}`,
      archiveCandidateId: `candidate-${randomUUID()}`,
      sourceTestimonyUpdatedAt: "2026-04-19T16:00:00.000Z",
      sourceSynthesisId: `synthesis-${randomUUID()}`,
      sourceAnnotationId: `annotation-${randomUUID()}`,
      createdAt: "2026-04-19T16:01:00.000Z",
      updatedAt: "2026-04-19T16:01:00.000Z",
      status: "created",
      bundleJsonPath: jsonPath,
    });

    const markdownMissing = await requestText(
      `/api/witness/publication-bundles/${encodeURIComponent(bundleId)}/markdown`
    );
    assert.equal(markdownMissing.response.status, 500);

    await publicationBundleStore.save({
      id: bundleId,
      witnessId: `wit-${randomUUID()}`,
      testimonyId: `testimony-${randomUUID()}`,
      archiveCandidateId: `candidate-${randomUUID()}`,
      sourceTestimonyUpdatedAt: "2026-04-19T16:02:00.000Z",
      sourceSynthesisId: `synthesis-${randomUUID()}`,
      sourceAnnotationId: `annotation-${randomUUID()}`,
      createdAt: "2026-04-19T16:03:00.000Z",
      updatedAt: "2026-04-19T16:03:00.000Z",
      status: "created",
      bundleJsonPath: path.join(repoRoot, "README.md"),
      bundleMarkdownPath: path.join(repoRoot, "README.md"),
    });

    const escapedJson = await requestText(
      `/api/witness/publication-bundles/${encodeURIComponent(bundleId)}/json`
    );
    assert.equal(escapedJson.response.status, 500);

    const escapedMarkdown = await requestText(
      `/api/witness/publication-bundles/${encodeURIComponent(bundleId)}/markdown`
    );
    assert.equal(escapedMarkdown.response.status, 500);
  } finally {
    await publicationBundleStore.delete(bundleId);
    await rm(jsonPath, { force: true });
  }
});

test("publication bundle json endpoint serves legacy 0.1.0 artifacts unchanged", async () => {
  const bundleId = `bundle-${randomUUID()}`;
  const exportsRoot = path.join(registry.witness.publicationBundleRoot!, "exports");
  await mkdir(exportsRoot, { recursive: true });
  const jsonPath = path.join(exportsRoot, `${bundleId}.json`);
  const legacyPayload = {
    schemaVersion: "0.1.0",
    witnessId: `wit-${randomUUID()}`,
    testimony: { id: `testimony-${randomUUID()}` },
    synthesis: { id: `synthesis-${randomUUID()}` },
    annotations: [],
    archiveCandidate: {
      id: `candidate-${randomUUID()}`,
      testimonyId: `testimony-${randomUUID()}`,
      testimonyUpdatedAt: "2026-04-19T17:00:00.000Z",
      status: "publication_ready",
      approvedSynthesisId: `synthesis-${randomUUID()}`,
      approvedAnnotationId: `annotation-${randomUUID()}`,
      createdAt: "2026-04-19T17:00:00.000Z",
      updatedAt: "2026-04-19T17:00:00.000Z",
    },
  };
  await writeFile(jsonPath, `${JSON.stringify(legacyPayload, null, 2)}\n`, "utf8");

  const publicationBundleStore = new FileWitnessPublicationBundleStore(
    registry.witness.publicationBundleRoot!
  );

  try {
    await publicationBundleStore.save({
      id: bundleId,
      witnessId: legacyPayload.witnessId,
      testimonyId: legacyPayload.testimony.id,
      archiveCandidateId: legacyPayload.archiveCandidate.id,
      sourceTestimonyUpdatedAt: legacyPayload.archiveCandidate.testimonyUpdatedAt,
      sourceSynthesisId: legacyPayload.archiveCandidate.approvedSynthesisId,
      sourceAnnotationId: legacyPayload.archiveCandidate.approvedAnnotationId,
      createdAt: "2026-04-19T17:01:00.000Z",
      updatedAt: "2026-04-19T17:01:00.000Z",
      status: "created",
      bundleJsonPath: jsonPath,
    });

    const response = await requestText(
      `/api/witness/publication-bundles/${encodeURIComponent(bundleId)}/json`
    );
    assert.equal(response.response.status, 200);
    assert.match(response.text, /"schemaVersion": "0\.1\.0"/);
  } finally {
    await publicationBundleStore.delete(bundleId);
    await rm(jsonPath, { force: true });
  }
});

test("inquiry publication preview uses raw artifact endpoints and textContent rendering", async () => {
  const html = await readFile(
    path.join(repoRoot, "apps", "dashboard", "public", "inquiry.html"),
    "utf8"
  );

  assert.match(
    html,
    /\/api\/witness\/publication-bundles\/\$\{encodeURIComponent\(id\)\}\/json/
  );
  assert.match(
    html,
    /\/api\/witness\/publication-bundles\/\$\{encodeURIComponent\(id\)\}\/markdown/
  );
  assert.match(html, /textContent\s*=/);
});
