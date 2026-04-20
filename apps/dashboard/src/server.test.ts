import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";

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
import { FileWitnessPublicationDeliveryJobStore } from "../../../packages/orchestration/src/witness/filePublicationDeliveryJobStore";
import { FileWitnessPublicationDeliveryStore } from "../../../packages/orchestration/src/witness/filePublicationDeliveryStore";
import { FileWitnessPublicationPackageStore } from "../../../packages/orchestration/src/witness/filePublicationPackageStore";
import { FileWitnessTestimonyStore } from "../../../packages/orchestration/src/witness/fileTestimonyStore";
import type { PublicationBundleRecord } from "../../../packages/witness-types/src/publicationBundle";
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
  const publicationPackageStore = new FileWitnessPublicationPackageStore(
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
        const publicationBundleRecord = record as PublicationBundleRecord & {
          bundleManifestPath?: string;
        };
        const tasks: Array<Promise<unknown>> = [
          publicationBundleStore.delete(record!.id),
        ];
        if (record?.bundleJsonPath) {
          tasks.push(rm(record.bundleJsonPath, { force: true }));
        }
        if (record?.bundleMarkdownPath) {
          tasks.push(rm(record.bundleMarkdownPath, { force: true }));
        }
        if (publicationBundleRecord.bundleManifestPath) {
          tasks.push(
            rm(publicationBundleRecord.bundleManifestPath, { force: true })
          );
        }
        return tasks;
      })
  );

  const publicationPackages = (await publicationPackageStore.list()).filter(
    (record) => record.witnessId === witnessId
  );
  await Promise.all(
    publicationPackages.flatMap((record) => [
      publicationPackageStore.delete(record.id),
      rm(record.packagePath, { force: true }),
    ])
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

async function createPublicationBundleFixture(witnessId: string) {
  const setup = await createPublicationReadyArchiveCandidate(witnessId);
  const created = await requestJson("/api/witness/publication-bundles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      archiveCandidateId: setup.archiveCandidateId,
    }),
  });
  assert.equal(created.response.status, 201);

  return {
    ...setup,
    bundleId: created.json.id as string,
  };
}

async function requestServerJson(
  targetBaseUrl: string,
  pathname: string,
  init?: RequestInit
) {
  const response = await fetch(`${targetBaseUrl}${pathname}`, init);
  const json = await response.json().catch(() => null);
  return { response, json };
}

async function withDashboardServer(
  options: Parameters<typeof createDashboardServer>[0],
  run: (targetBaseUrl: string) => Promise<void>
) {
  const localServer = createDashboardServer(options);
  await new Promise<void>((resolve) => {
    localServer.listen(0, "127.0.0.1", () => resolve());
  });

  const address = localServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve dashboard server address");
  }

  const targetBaseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(targetBaseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      localServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function seedPublicationPackageFixture(root: string) {
  const publicationBundleRoot = path.join(root, "publication-bundles");
  const packagesRoot = path.join(publicationBundleRoot, "packages");
  await mkdir(packagesRoot, { recursive: true });

  const packageRecord = {
    id: randomUUID(),
    bundleId: randomUUID(),
    witnessId: `wit-${randomUUID()}`,
    testimonyId: `testimony-${randomUUID()}`,
    archiveCandidateId: randomUUID(),
    createdAt: "2026-04-19T22:10:00.000Z",
  };
  const packageFilename = `${packageRecord.id}--2026-04-19T22-10-00-000Z.zip`;
  const packagePath = path.join(packagesRoot, packageFilename);
  const packageBytes = Buffer.from("package-bytes");
  await writeFile(packagePath, packageBytes);

  const packageStore = new FileWitnessPublicationPackageStore(
    publicationBundleRoot
  );
  const savedRecord = await packageStore.create({
    ...packageRecord,
    packagePath,
    packageFilename,
    packageSha256: "1".repeat(64),
    packageByteSize: packageBytes.byteLength,
    sourceBundleJsonPath: "bundle.json",
    sourceBundleMarkdownPath: "bundle.md",
    sourceBundleManifestPath: "manifest.json",
  });

  return {
    publicationBundleRoot,
    packageBytes,
    packageRecord: savedRecord,
  };
}

async function seedBrokenPublicationPackageFixture(
  root: string,
  packagePath: string
) {
  const publicationBundleRoot = path.join(root, "publication-bundles");
  await mkdir(path.join(publicationBundleRoot, "packages"), { recursive: true });
  const packageStore = new FileWitnessPublicationPackageStore(
    publicationBundleRoot
  );
  const packageRecord = await packageStore.create({
    id: randomUUID(),
    bundleId: randomUUID(),
    witnessId: `wit-${randomUUID()}`,
    testimonyId: `testimony-${randomUUID()}`,
    archiveCandidateId: randomUUID(),
    createdAt: "2026-04-19T22:10:00.000Z",
    packagePath,
    packageFilename: path.basename(packagePath),
    packageSha256: "1".repeat(64),
    packageByteSize: 13,
    sourceBundleJsonPath: "bundle.json",
    sourceBundleMarkdownPath: "bundle.md",
    sourceBundleManifestPath: "manifest.json",
  });

  return {
    publicationBundleRoot,
    packageRecord,
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
    if (created.json?.bundleManifestPath) {
      assert.match(
        created.json.bundleManifestPath,
        new RegExp(
          `${path.join(registry.witness.publicationBundleRoot!, "exports").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*-manifest\\.json$`
        )
      );
    }

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

test("publication bundle artifact endpoints serve manifest output and download attachments", async () => {
  const bundleId = `bundle-${randomUUID()}`;
  const exportsRoot = path.join(registry.witness.publicationBundleRoot!, "exports");
  await mkdir(exportsRoot, { recursive: true });

  const jsonPath = path.join(exportsRoot, `${bundleId}.json`);
  const markdownPath = path.join(exportsRoot, `${bundleId}.md`);
  const manifestPath = path.join(exportsRoot, `${bundleId}-manifest.json`);

  await writeFile(jsonPath, '{ "schemaVersion": "0.2.0" }\n', "utf8");
  await writeFile(markdownPath, `# Publication Bundle\n\n${bundleId}\n`, "utf8");
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: "0.1.0",
        bundleId,
        exports: {
          json: {
            filename: path.basename(jsonPath),
            sha256: randomUUID().replace(/-/g, ""),
            contentType: "application/json",
          },
          markdown: {
            filename: path.basename(markdownPath),
            sha256: randomUUID().replace(/-/g, ""),
            contentType: "text/markdown",
          },
        },
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const publicationBundleStore = new FileWitnessPublicationBundleStore(
    registry.witness.publicationBundleRoot!
  );

  try {
    await publicationBundleStore.save({
      id: bundleId,
      witnessId: `wit-${randomUUID()}`,
      testimonyId: `testimony-${randomUUID()}`,
      archiveCandidateId: `candidate-${randomUUID()}`,
      sourceTestimonyUpdatedAt: "2026-04-19T18:00:00.000Z",
      sourceSynthesisId: `synthesis-${randomUUID()}`,
      sourceAnnotationId: `annotation-${randomUUID()}`,
      createdAt: "2026-04-19T18:01:00.000Z",
      updatedAt: "2026-04-19T18:01:00.000Z",
      status: "created",
      bundleJsonPath: jsonPath,
      bundleMarkdownPath: markdownPath,
      bundleManifestPath: manifestPath,
    });

    const manifest = await requestText(
      `/api/witness/publication-bundles/${encodeURIComponent(bundleId)}/manifest`
    );
    assert.equal(manifest.response.status, 200);
    assert.match(
      manifest.response.headers.get("content-type") ?? "",
      /^application\/json\b/i
    );
    const manifestJson = JSON.parse(manifest.text) as {
      schemaVersion: string;
      bundleId: string;
      exports: {
        json: { filename: string; sha256: string; contentType: string };
        markdown: { filename: string; sha256: string; contentType: string };
      };
    };
    assert.equal(manifestJson.schemaVersion, "0.1.0");
    assert.equal(manifestJson.bundleId, bundleId);
    assert.ok(manifestJson.exports.json.sha256);
    assert.ok(manifestJson.exports.markdown.sha256);

    for (const format of ["json", "markdown", "manifest"] as const) {
      const downloaded = await requestText(
        `/api/witness/publication-bundles/${encodeURIComponent(bundleId)}/${format}?download=1`
      );
      assert.equal(downloaded.response.status, 200);
      assert.match(
        downloaded.response.headers.get("content-disposition") ?? "",
        /^attachment;/i
      );
      assert.match(
        downloaded.response.headers.get("content-type") ?? "",
        /^(application\/json|text\/markdown)\b/i
      );
    }
  } finally {
    await publicationBundleStore.delete(bundleId);
    await rm(jsonPath, { force: true });
    await rm(markdownPath, { force: true });
    await rm(manifestPath, { force: true });
  }
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

  const manifest = await requestText(
    `/api/witness/publication-bundles/${encodeURIComponent(unknownId)}/manifest`
  );
  assert.equal(manifest.response.status, 404);
});

test("publication bundle artifact endpoints return 500 for broken manifest or markdown state and escaped paths", async () => {
  const bundleId = `bundle-${randomUUID()}`;
  const exportsRoot = path.join(registry.witness.publicationBundleRoot!, "exports");
  await mkdir(exportsRoot, { recursive: true });

  const jsonPath = path.join(exportsRoot, `${bundleId}.json`);
  const manifestPath = path.join(exportsRoot, `${bundleId}-manifest.json`);
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
      bundleManifestPath: manifestPath,
    } as PublicationBundleRecord);

    const markdownMissing = await requestText(
      `/api/witness/publication-bundles/${encodeURIComponent(bundleId)}/markdown`
    );
    assert.equal(markdownMissing.response.status, 500);

    const manifestMissing = await requestText(
      `/api/witness/publication-bundles/${encodeURIComponent(bundleId)}/manifest`
    );
    assert.equal(manifestMissing.response.status, 500);

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
      bundleManifestPath: path.join(repoRoot, "README.md"),
    } as PublicationBundleRecord & { bundleManifestPath: string });

    const escapedJson = await requestText(
      `/api/witness/publication-bundles/${encodeURIComponent(bundleId)}/json`
    );
    assert.equal(escapedJson.response.status, 500);

    const escapedMarkdown = await requestText(
      `/api/witness/publication-bundles/${encodeURIComponent(bundleId)}/markdown`
    );
    assert.equal(escapedMarkdown.response.status, 500);

    const escapedManifest = await requestText(
      `/api/witness/publication-bundles/${encodeURIComponent(bundleId)}/manifest`
    );
    assert.equal(escapedManifest.response.status, 500);
  } finally {
    await publicationBundleStore.delete(bundleId);
    await rm(jsonPath, { force: true });
    await rm(manifestPath, { force: true });
  }
});

test("publication package endpoints create idempotently, list by bundleId, and serve downloadable zip files", async () => {
  const witnessId = `wit-${randomUUID()}`;
  let sessionId: string | undefined;
  let turnId: string | undefined;

  try {
    const setup = await createPublicationBundleFixture(witnessId);
    sessionId = setup.sessionId;
    turnId = setup.turnId;

    const firstCreate = await requestJson("/api/witness/publication-packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bundleId: setup.bundleId,
      }),
    });
    assert.equal(firstCreate.response.status, 201);
    assert.equal(firstCreate.json?.bundleId, setup.bundleId);
    assert.ok((firstCreate.json?.packagePath ?? "").endsWith(".zip"));

    const secondCreate = await requestJson("/api/witness/publication-packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bundleId: setup.bundleId,
      }),
    });
    assert.equal(secondCreate.response.status, 200);
    assert.equal(secondCreate.json?.id, firstCreate.json?.id);

    const listed = await requestJson(
      `/api/witness/publication-packages?bundleId=${encodeURIComponent(setup.bundleId)}`
    );
    assert.equal(listed.response.status, 200);
    assert.equal(listed.json.length, 1);
    assert.equal(listed.json[0].id, firstCreate.json.id);

    const fetched = await requestJson(
      `/api/witness/publication-packages/${encodeURIComponent(firstCreate.json.id)}`
    );
    assert.equal(fetched.response.status, 200);
    assert.equal(fetched.json?.id, firstCreate.json.id);
    assert.equal(fetched.json?.bundleId, setup.bundleId);

    const downloaded = await fetch(
      `${baseUrl}/api/witness/publication-packages/${encodeURIComponent(firstCreate.json.id)}/file?download=1`
    );
    assert.equal(downloaded.status, 200);
    assert.match(
      downloaded.headers.get("content-type") ?? "",
      /^application\/zip\b/i
    );
    assert.match(
      downloaded.headers.get("content-disposition") ?? "",
      /^attachment;/i
    );
    const bytes = new Uint8Array(await downloaded.arrayBuffer());
    assert.ok(bytes.byteLength > 0);
  } finally {
    await cleanupWitnessArtifacts(witnessId, sessionId, turnId);
  }
});

test("publication package endpoints return 500 for escaped package paths", async () => {
  const packageId = randomUUID();
  const publicationPackageStore = new FileWitnessPublicationPackageStore(
    registry.witness.publicationBundleRoot!
  );

  try {
    await publicationPackageStore.save({
      id: packageId,
      bundleId: `bundle-${randomUUID()}`,
      witnessId: `wit-${randomUUID()}`,
      testimonyId: `testimony-${randomUUID()}`,
      archiveCandidateId: `candidate-${randomUUID()}`,
      createdAt: "2026-04-19T19:00:00.000Z",
      updatedAt: "2026-04-19T19:00:00.000Z",
      status: "created",
      packagePath: path.join(repoRoot, "README.md"),
      packageFilename: "README.md",
      packageSha256: randomUUID().replace(/-/g, ""),
      packageByteSize: 123,
      sourceBundleJsonPath: "bundle.json",
      sourceBundleMarkdownPath: "bundle.md",
      sourceBundleManifestPath: "manifest.json",
    });

    const response = await fetch(
      `${baseUrl}/api/witness/publication-packages/${encodeURIComponent(packageId)}/file`
    );
    assert.equal(response.status, 500);
  } finally {
    await publicationPackageStore.delete(packageId);
  }
});

test("publication package endpoints return 400 for malformed package ids", async () => {
  const malformedId = "not-a-valid-package-id";

  const detailResponse = await fetch(
    `${baseUrl}/api/witness/publication-packages/${encodeURIComponent(malformedId)}`
  );
  assert.equal(detailResponse.status, 400);

  const fileResponse = await fetch(
    `${baseUrl}/api/witness/publication-packages/${encodeURIComponent(malformedId)}/file`
  );
  assert.equal(fileResponse.status, 400);
});

test("publication package endpoints return 400 for malformed filter ids and create bundle ids", async () => {
  const malformedBundleId = "not-a-valid-bundle-id";
  const malformedWitnessId = "wit bad";
  const malformedTestimonyId = "testimony bad";

  const malformedBundleList = await requestJson(
    `/api/witness/publication-packages?bundleId=${encodeURIComponent(malformedBundleId)}`
  );
  assert.equal(malformedBundleList.response.status, 400);

  const malformedWitnessList = await requestJson(
    `/api/witness/publication-packages?witnessId=${encodeURIComponent(malformedWitnessId)}`
  );
  assert.equal(malformedWitnessList.response.status, 400);

  const malformedTestimonyList = await requestJson(
    `/api/witness/publication-packages?testimonyId=${encodeURIComponent(malformedTestimonyId)}`
  );
  assert.equal(malformedTestimonyList.response.status, 400);

  const malformedCreate = await requestJson("/api/witness/publication-packages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bundleId: malformedBundleId,
    }),
  });
  assert.equal(malformedCreate.response.status, 400);
});

test("publication package list endpoint returns 400 for blank and whitespace filter ids", async () => {
  const blankBundle = await requestJson("/api/witness/publication-packages?bundleId=");
  assert.equal(blankBundle.response.status, 400);

  const whitespaceBundle = await requestJson(
    `/api/witness/publication-packages?bundleId=${encodeURIComponent(" ")}`
  );
  assert.equal(whitespaceBundle.response.status, 400);

  const blankWitness = await requestJson(
    "/api/witness/publication-packages?witnessId="
  );
  assert.equal(blankWitness.response.status, 400);

  const whitespaceWitness = await requestJson(
    `/api/witness/publication-packages?witnessId=${encodeURIComponent(" ")}`
  );
  assert.equal(whitespaceWitness.response.status, 400);

  const blankTestimony = await requestJson(
    "/api/witness/publication-packages?testimonyId="
  );
  assert.equal(blankTestimony.response.status, 400);

  const whitespaceTestimony = await requestJson(
    `/api/witness/publication-packages?testimonyId=${encodeURIComponent(" ")}`
  );
  assert.equal(whitespaceTestimony.response.status, 400);
});

test("publication delivery endpoints create, list, and fetch delivery records", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-dashboard-publication-deliveries-")
  );

  try {
    const fixture = await seedPublicationPackageFixture(root);

    await withDashboardServer(
      {
        witnessConfig: {
          ...registry.witness,
          publicationBundleRoot: fixture.publicationBundleRoot,
        },
        publicationObjectDeliveryBackendOverride: {
          name: "azure-blob",
          async putObject(input: { key: string }) {
            return {
              remoteKey: input.key,
              remoteUrl: `https://example.invalid/${input.key}`,
            };
          },
        },
      },
      async (targetBaseUrl) => {
        const createRes = await requestServerJson(
          targetBaseUrl,
          "/api/witness/publication-deliveries",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              packageId: fixture.packageRecord.id,
              backend: "azure-blob",
            }),
          }
        );
        assert.equal(createRes.response.status, 201);
        assert.equal(createRes.json?.packageId, fixture.packageRecord.id);
        assert.equal(createRes.json?.status, "succeeded");

        const listRes = await requestServerJson(
          targetBaseUrl,
          `/api/witness/publication-deliveries?packageId=${encodeURIComponent(
            fixture.packageRecord.id
          )}&bundleId=${encodeURIComponent(
            fixture.packageRecord.bundleId
          )}&witnessId=${encodeURIComponent(
            fixture.packageRecord.witnessId
          )}&testimonyId=${encodeURIComponent(
            fixture.packageRecord.testimonyId
          )}`
        );
        assert.equal(listRes.response.status, 200);
        assert.equal(listRes.json?.length, 1);
        assert.equal(listRes.json?.[0]?.id, createRes.json?.id);

        const detailRes = await requestServerJson(
          targetBaseUrl,
          `/api/witness/publication-deliveries/${encodeURIComponent(
            createRes.json.id
          )}`
        );
        assert.equal(detailRes.response.status, 200);
        assert.equal(detailRes.json?.id, createRes.json?.id);
      }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publication delivery endpoints return 400 for malformed ids or backend and 404 for unknown ids", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-dashboard-publication-deliveries-errors-")
  );

  try {
    const fixture = await seedPublicationPackageFixture(root);
    const unknownId = randomUUID();

    await withDashboardServer(
      {
        witnessConfig: {
          ...registry.witness,
          publicationBundleRoot: fixture.publicationBundleRoot,
        },
      },
      async (targetBaseUrl) => {
        const missingPackageId = await requestServerJson(
          targetBaseUrl,
          "/api/witness/publication-deliveries",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ backend: "azure-blob" }),
          }
        );
        assert.equal(missingPackageId.response.status, 400);

        const malformedPackageId = await requestServerJson(
          targetBaseUrl,
          "/api/witness/publication-deliveries",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              packageId: "not-a-valid-package-id",
              backend: "azure-blob",
            }),
          }
        );
        assert.equal(malformedPackageId.response.status, 400);

        const unknownBackend = await requestServerJson(
          targetBaseUrl,
          "/api/witness/publication-deliveries",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              packageId: fixture.packageRecord.id,
              backend: "not-real",
            }),
          }
        );
        assert.equal(unknownBackend.response.status, 400);

        const unknownPackage = await requestServerJson(
          targetBaseUrl,
          "/api/witness/publication-deliveries",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              packageId: unknownId,
              backend: "azure-blob",
            }),
          }
        );
        assert.equal(unknownPackage.response.status, 404);

        const malformedPackageFilter = await requestServerJson(
          targetBaseUrl,
          "/api/witness/publication-deliveries?packageId=not-a-valid-package-id"
        );
        assert.equal(malformedPackageFilter.response.status, 400);

        const malformedBundleFilter = await requestServerJson(
          targetBaseUrl,
          "/api/witness/publication-deliveries?bundleId=not-a-valid-bundle-id"
        );
        assert.equal(malformedBundleFilter.response.status, 400);

        const malformedWitnessFilter = await requestServerJson(
          targetBaseUrl,
          `/api/witness/publication-deliveries?witnessId=${encodeURIComponent("wit bad")}`
        );
        assert.equal(malformedWitnessFilter.response.status, 400);

        const malformedTestimonyFilter = await requestServerJson(
          targetBaseUrl,
          `/api/witness/publication-deliveries?testimonyId=${encodeURIComponent("testimony bad")}`
        );
        assert.equal(malformedTestimonyFilter.response.status, 400);

        const malformedDetail = await requestServerJson(
          targetBaseUrl,
          "/api/witness/publication-deliveries/not-a-valid-delivery-id"
        );
        assert.equal(malformedDetail.response.status, 400);

        const unknownDetail = await requestServerJson(
          targetBaseUrl,
          `/api/witness/publication-deliveries/${encodeURIComponent(unknownId)}`
        );
        assert.equal(unknownDetail.response.status, 404);
      }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publication delivery create returns 502 for remote upload failures and persists the failed delivery record", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-dashboard-publication-deliveries-failure-")
  );

  try {
    const fixture = await seedPublicationPackageFixture(root);

    await withDashboardServer(
      {
        witnessConfig: {
          ...registry.witness,
          publicationBundleRoot: fixture.publicationBundleRoot,
        },
        publicationObjectDeliveryBackendOverride: {
          name: "azure-blob",
          async putObject(): Promise<never> {
            throw new Error("simulated remote upload failure");
          },
        },
      },
      async (targetBaseUrl) => {
        const createRes = await requestServerJson(
          targetBaseUrl,
          "/api/witness/publication-deliveries",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              packageId: fixture.packageRecord.id,
              backend: "azure-blob",
            }),
          }
        );
        assert.equal(createRes.response.status, 502);
        assert.equal(createRes.json?.status, "failed");
        assert.match(
          createRes.json?.error ?? "",
          /simulated remote upload failure/i
        );

        const deliveryStore = new FileWitnessPublicationDeliveryStore(
          fixture.publicationBundleRoot
        );
        const persisted = await deliveryStore.list({
          packageId: fixture.packageRecord.id,
        });
        assert.equal(persisted.length, 1);
        assert.equal(persisted[0]?.status, "failed");
      }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publication delivery create returns 500 for backend config failures while still persisting the failed record", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-dashboard-publication-deliveries-config-")
  );

  try {
    const fixture = await seedPublicationPackageFixture(root);

    await withDashboardServer(
      {
        witnessConfig: {
          ...registry.witness,
          publicationBundleRoot: fixture.publicationBundleRoot,
        },
        publicationObjectDeliveryBackendOverride: {
          name: "azure-blob",
          async putObject(): Promise<never> {
            throw new Error(
              "Missing Azure Blob delivery config: AZURE_BLOB_CONNECTION_STRING"
            );
          },
        },
      },
      async (targetBaseUrl) => {
        const createRes = await requestServerJson(
          targetBaseUrl,
          "/api/witness/publication-deliveries",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              packageId: fixture.packageRecord.id,
              backend: "azure-blob",
            }),
          }
        );
        assert.equal(createRes.response.status, 500);
        assert.equal(createRes.json?.status, "failed");
        assert.match(
          createRes.json?.error ?? "",
          /Missing Azure Blob delivery config/i
        );

        const deliveryStore = new FileWitnessPublicationDeliveryStore(
          fixture.publicationBundleRoot
        );
        const persisted = await deliveryStore.list({
          packageId: fixture.packageRecord.id,
        });
        assert.equal(persisted.length, 1);
        assert.equal(persisted[0]?.status, "failed");
      }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publication delivery create returns 500 for broken local package state", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-dashboard-publication-deliveries-broken-local-")
  );
  const outsideRoot = await mkdtemp(
    path.join(os.tmpdir(), "g52-dashboard-publication-deliveries-outside-")
  );

  try {
    const outsidePackagePath = path.join(
      outsideRoot,
      `${randomUUID()}--2026-04-19T22-10-00-000Z.zip`
    );
    await writeFile(outsidePackagePath, Buffer.from("package-bytes"));
    const fixture = await seedBrokenPublicationPackageFixture(
      root,
      outsidePackagePath
    );

    await withDashboardServer(
      {
        witnessConfig: {
          ...registry.witness,
          publicationBundleRoot: fixture.publicationBundleRoot,
        },
        publicationObjectDeliveryBackendOverride: {
          name: "azure-blob",
          async putObject() {
            throw new Error("backend should not be called");
          },
        },
      },
      async (targetBaseUrl) => {
        const createRes = await requestServerJson(
          targetBaseUrl,
          "/api/witness/publication-deliveries",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              packageId: fixture.packageRecord.id,
              backend: "azure-blob",
            }),
          }
        );
        assert.equal(createRes.response.status, 500);
        assert.match(
          createRes.json?.error ?? "",
          /Publication package path must resolve within/i
        );
      }
    );
  } finally {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(outsideRoot, { recursive: true, force: true }),
    ]);
  }
});

test("publication delivery create returns 400 for malformed JSON bodies", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-dashboard-publication-deliveries-bad-json-")
  );

  try {
    const fixture = await seedPublicationPackageFixture(root);

    await withDashboardServer(
      {
        witnessConfig: {
          ...registry.witness,
          publicationBundleRoot: fixture.publicationBundleRoot,
        },
      },
      async (targetBaseUrl) => {
        const response = await fetch(
          `${targetBaseUrl}/api/witness/publication-deliveries`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: '{"packageId":',
          }
        );
        const json = await response.json();
        assert.equal(response.status, 400);
        assert.equal(json?.error, "Malformed request body");
      }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publication delivery create keeps non-SyntaxError body-read failures within controlled HTTP handling", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-dashboard-publication-deliveries-body-read-")
  );

  try {
    const fixture = await seedPublicationPackageFixture(root);

    await withDashboardServer(
      {
        witnessConfig: {
          ...registry.witness,
          publicationBundleRoot: fixture.publicationBundleRoot,
        },
        readJsonBodyOverride: async () => {
          throw new Error("simulated body read failure");
        },
      } as Parameters<typeof createDashboardServer>[0],
      async (targetBaseUrl) => {
        const createRes = await requestServerJson(
          targetBaseUrl,
          "/api/witness/publication-deliveries",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              packageId: fixture.packageRecord.id,
              backend: "azure-blob",
            }),
          }
        );
        assert.equal(createRes.response.status, 500);
        assert.match(
          createRes.json?.error ?? "",
          /simulated body read failure/i
        );
      }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publication delivery job endpoints enqueue, list, fetch, and reject retry for non-failed jobs", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-dashboard-publication-delivery-jobs-")
  );

  try {
    const fixture = await seedPublicationPackageFixture(root);

    await withDashboardServer(
      {
        witnessConfig: {
          ...registry.witness,
          publicationBundleRoot: fixture.publicationBundleRoot,
        },
      },
      async (targetBaseUrl) => {
        const enqueued = await requestServerJson(
          targetBaseUrl,
          "/api/witness/publication-delivery-jobs",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              packageId: fixture.packageRecord.id,
              backend: "azure-blob",
            }),
          }
        );
        assert.equal(enqueued.response.status, 201);
        assert.equal(enqueued.json?.status, "queued");

        const listed = await requestServerJson(
          targetBaseUrl,
          `/api/witness/publication-delivery-jobs?packageId=${encodeURIComponent(
            fixture.packageRecord.id
          )}&bundleId=${encodeURIComponent(
            fixture.packageRecord.bundleId
          )}&witnessId=${encodeURIComponent(
            fixture.packageRecord.witnessId
          )}&testimonyId=${encodeURIComponent(
            fixture.packageRecord.testimonyId
          )}&status=queued`
        );
        assert.equal(listed.response.status, 200);
        assert.equal(listed.json?.length, 1);
        assert.equal(listed.json?.[0]?.id, enqueued.json?.id);

        const fetched = await requestServerJson(
          targetBaseUrl,
          `/api/witness/publication-delivery-jobs/${encodeURIComponent(
            enqueued.json.id
          )}`
        );
        assert.equal(fetched.response.status, 200);
        assert.equal(fetched.json?.id, enqueued.json?.id);

        const retry = await requestServerJson(
          targetBaseUrl,
          `/api/witness/publication-delivery-jobs/${encodeURIComponent(
            enqueued.json.id
          )}/retry`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }
        );
        assert.equal(retry.response.status, 409);
      }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publication delivery job retry returns 201 for failed jobs and enqueues a fresh job", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "g52-dashboard-publication-delivery-job-retry-")
  );

  try {
    const fixture = await seedPublicationPackageFixture(root);
    const jobStore = new FileWitnessPublicationDeliveryJobStore(
      fixture.publicationBundleRoot
    );

    const failed = await jobStore.create({
      packageId: fixture.packageRecord.id,
      bundleId: fixture.packageRecord.bundleId,
      witnessId: fixture.packageRecord.witnessId,
      testimonyId: fixture.packageRecord.testimonyId,
      backend: "azure-blob",
      createdAt: "2026-04-20T10:01:00.000Z",
    });
    await jobStore.save({
      ...failed,
      status: "failed",
      updatedAt: "2026-04-20T10:02:00.000Z",
      error: "simulated queue failure",
    });

    await withDashboardServer(
      {
        witnessConfig: {
          ...registry.witness,
          publicationBundleRoot: fixture.publicationBundleRoot,
        },
      },
      async (targetBaseUrl) => {
        const retried = await requestServerJson(
          targetBaseUrl,
          `/api/witness/publication-delivery-jobs/${encodeURIComponent(
            failed.id
          )}/retry`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }
        );
        assert.equal(retried.response.status, 201);
        assert.equal(retried.json?.status, "queued");
        assert.notEqual(retried.json?.id, failed.id);

        const jobs = await jobStore.list({
          packageId: fixture.packageRecord.id,
        });
        assert.equal(jobs.length, 2);
        assert.equal(
          jobs.filter((record) => record.status === "failed").length,
          1
        );
        assert.equal(
          jobs.filter((record) => record.status === "queued").length,
          1
        );
      }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publication bundle json endpoint serves legacy 0.1.0 artifacts unchanged", async () => {
  const bundleId = `bundle-${randomUUID()}`;
  const exportsRoot = path.join(registry.witness.publicationBundleRoot!, "exports");
  await mkdir(exportsRoot, { recursive: true });
  const jsonPath = path.join(exportsRoot, `${bundleId}.json`);
  const manifestPath = path.join(exportsRoot, `${bundleId}-manifest.json`);
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
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: "0.1.0",
        bundleId,
        exports: {
          json: {
            filename: path.basename(jsonPath),
            sha256: randomUUID().replace(/-/g, ""),
            contentType: "application/json",
          },
          markdown: {
            filename: `${bundleId}.md`,
            sha256: randomUUID().replace(/-/g, ""),
            contentType: "text/markdown",
          },
        },
      },
      null,
      2
    )}\n`,
    "utf8"
  );

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
      bundleManifestPath: manifestPath,
    });

    const response = await requestText(
      `/api/witness/publication-bundles/${encodeURIComponent(bundleId)}/json`
    );
    assert.equal(response.response.status, 200);
    assert.match(response.text, /"schemaVersion": "0\.1\.0"/);
  } finally {
    await publicationBundleStore.delete(bundleId);
    await rm(jsonPath, { force: true });
    await rm(manifestPath, { force: true });
  }
});

test("inquiry publication preview uses raw artifact endpoints and textContent rendering", async () => {
  const html = await readFile(
    path.join(repoRoot, "apps", "dashboard", "public", "inquiry.html"),
    "utf8"
  );

  assert.match(
    html,
    /publicationBundleArtifactUrl\(id,format\)/
  );
  assert.match(
    html,
    /data-witness-publication-view-manifest/
  );
  assert.match(
    html,
    /item\.bundleManifestPath\?`<button class="btn quiet" data-witness-publication-view-manifest/
  );
  assert.match(
    html,
    /searchParams\.set\("download","1"\)/
  );
  assert.match(html, /textContent\s*=/);
  assert.match(html, /data-witness-publication-package-create/);
  assert.match(html, /data-witness-publication-package-download/);
  assert.match(
    html,
    /function witnessPublicationPackagesUrl\(witnessId,testimonyId\)/
  );
  assert.match(
    html,
    /\/api\/witness\/publication-packages\?witnessId=\$\{encodeURIComponent\(witnessId\)\}&testimonyId=\$\{encodeURIComponent\(testimonyId\)\}/
  );
  assert.match(
    html,
    /async function loadWitnessPublicationPackages\(\)/
  );
  assert.match(
    html,
    /function witnessPublicationDeliveryJobsUrl\(witnessId,testimonyId\)/
  );
  assert.match(
    html,
    /async function loadWitnessPublicationDeliveryJobs\(\)/
  );
  assert.match(
    html,
    /data-witness-publication-package-queue/
  );
  assert.match(
    html,
    /data-witness-publication-job-retry/
  );
  assert.match(
    html,
    /const testimonyId=state\.selectedWitnessTestimonyId;/
  );
  assert.match(
    html,
    /fetch\(witnessPublicationPackagesUrl\(witnessId,testimonyId\)\)/
  );
  assert.match(
    html,
    /if\(state\.selectedWitnessTestimonyId!==testimonyId\|\|activeWitnessId\(\)!==witnessId\)return;/
  );
  assert.match(
    html,
    /\$\$\("\[data-select-witness-testimony\]"\)\.forEach\(node=>node\.addEventListener\("click",async\(\)=>\{[\s\S]*await loadWitnessPublicationPackages\(\);[\s\S]*renderWitnessCard\(\);/
  );
  assert.doesNotMatch(
    html,
    /\/api\/witness\/publication-packages\?bundleId=/
  );
});
