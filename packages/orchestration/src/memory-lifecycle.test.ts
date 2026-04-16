import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { FileMemoryStore, MemoryTransitionError } from "./memory/fileMemoryStore";
import { selectMemoryItems } from "./retrieval/selectMemoryItems";

async function createStore() {
  const root = await mkdtemp(path.join(os.tmpdir(), "g52-memory-lifecycle-"));
  return new FileMemoryStore(path.join(root, "memory-items"));
}

test("operator-created preference defaults to proposed and is excluded from retrieval", async () => {
  const store = await createStore();
  const item = await store.create({
    type: "user_preference",
    scope: "global",
    statement: "Prefer concise replies.",
    justification: "Operator proposed this preference awaiting approval.",
  });

  assert.equal(item.state, "proposed");
  assert.equal(item.origin, "operator");

  const selected = selectMemoryItems(await store.list(), "Please keep things concise.");
  assert.equal(selected.length, 0, "proposed items must not surface in retrieval");
});

test("operator-created open_thread auto-accepts without approval", async () => {
  const store = await createStore();
  const item = await store.create({
    type: "open_thread",
    scope: "session",
    sessionId: "session-A",
    statement: "Finalize the memory schema.",
    justification: "Thread opened by operator during review.",
  });

  assert.equal(item.state, "accepted");
  assert.equal(item.origin, "operator");
});

test("approve transitions proposed → accepted and retrieval picks it up", async () => {
  const store = await createStore();
  const item = await store.create({
    type: "user_preference",
    scope: "global",
    statement: "Prefer concise replies.",
    justification: "Operator proposed this preference awaiting approval.",
  });

  const approved = await store.transition(item.id, {
    action: "approve",
    actor: "operator@test",
  });
  assert.equal(approved.state, "accepted");
  assert.ok(approved.approvedAt);
  assert.equal(approved.approvedBy, "operator@test");

  const selected = selectMemoryItems(await store.list(), "Please keep things concise.");
  assert.equal(selected.length, 1);
  assert.match(selected[0].statement, /concise/i);
});

test("reject is terminal with reason and excluded from retrieval", async () => {
  const store = await createStore();
  const item = await store.create({
    type: "user_preference",
    scope: "global",
    statement: "Always answer in cursive.",
    justification: "Style drift proposal under review by operator.",
  });

  const rejected = await store.transition(item.id, {
    action: "reject",
    reason: "Violates voice restraint canon.",
  });
  assert.equal(rejected.state, "rejected");
  assert.equal(rejected.rejectionReason, "Violates voice restraint canon.");
  assert.ok(rejected.rejectedAt);

  await assert.rejects(
    () => store.transition(item.id, { action: "approve" }),
    MemoryTransitionError
  );

  const selected = selectMemoryItems(await store.list(), "Answer in cursive.");
  assert.equal(selected.length, 0);
});

test("resolve is only valid for open_thread items", async () => {
  const store = await createStore();
  const thread = await store.create({
    type: "open_thread",
    scope: "session",
    sessionId: "session-A",
    statement: "Finalize the schema.",
    justification: "Thread under discussion for the schema design.",
  });
  const resolved = await store.transition(thread.id, {
    action: "resolve",
    reason: "Schema finalized.",
  });
  assert.equal(resolved.state, "resolved");
  assert.equal(resolved.resolvedReason, "Schema finalized.");

  const pref = await store.create({
    type: "user_preference",
    scope: "global",
    statement: "Prefer concise replies.",
    justification: "Operator proposed and explicitly accepted this preference.",
    state: "accepted",
    origin: "turn",
  });
  await assert.rejects(
    () => store.transition(pref.id, { action: "resolve" }),
    MemoryTransitionError
  );
});

test("archive excludes item from retrieval and records archivedAt", async () => {
  const store = await createStore();
  const pref = await store.create({
    type: "user_preference",
    scope: "global",
    statement: "Prefer concise replies.",
    justification: "Operator-accepted preference on reply brevity.",
    state: "accepted",
    origin: "turn",
  });

  const archived = await store.transition(pref.id, {
    action: "archive",
    reason: "no longer applicable",
  });
  assert.equal(archived.state, "archived");
  assert.ok(archived.archivedAt);

  const selected = selectMemoryItems(await store.list(), "Keep things concise.");
  assert.equal(selected.length, 0);
});

test("supersede chain links new decision and hides the older one from retrieval", async () => {
  const store = await createStore();
  const older = await store.create({
    type: "project_decision",
    scope: "global",
    statement: "Default to Anthropic for routine operator use.",
    justification: "Earlier project decision on default provider.",
    state: "accepted",
    origin: "turn",
  });

  const newer = await store.create({
    type: "project_decision",
    scope: "global",
    statement: "Default to Gemini for routine operator use.",
    justification: "Replaces the Anthropic default after operator review.",
    state: "accepted",
    origin: "turn",
    supersedes: older.id,
  });

  const superseded = await store.transition(older.id, {
    action: "supersede",
    supersededById: newer.id,
  });
  assert.equal(superseded.state, "superseded");
  assert.equal(superseded.supersededBy, newer.id);

  const selected = selectMemoryItems(
    await store.list(),
    "What is the default provider for routine operator use?"
  );
  const statements = selected.map((s) => s.statement);
  assert.ok(statements.some((s) => /Gemini/.test(s)));
  assert.ok(!statements.some((s) => /Anthropic/.test(s)));
});

test("patch refuses to edit terminal items", async () => {
  const store = await createStore();
  const item = await store.create({
    type: "user_preference",
    scope: "global",
    statement: "Style drift candidate.",
    justification: "Operator proposed this for review and testing.",
  });
  await store.transition(item.id, { action: "reject" });
  await assert.rejects(
    () => store.patch(item.id, { statement: "Something new." }),
    MemoryTransitionError
  );
});

test("findConflicts detects duplicates and polarity contradictions against accepted items", async () => {
  const store = await createStore();
  await store.create({
    type: "user_preference",
    scope: "global",
    statement: "Prefer concise replies.",
    justification: "Existing accepted preference on reply length.",
    state: "accepted",
    origin: "turn",
  });

  const duplicates = await store.findConflicts({
    type: "user_preference",
    scope: "global",
    statement: "Prefer concise replies.",
  });
  assert.ok(duplicates.some((c) => c.kind === "duplicate"));

  const contradictions = await store.findConflicts({
    type: "user_preference",
    scope: "global",
    statement: "Do not prefer concise replies.",
  });
  assert.ok(
    contradictions.some((c) => c.kind === "contradiction"),
    `expected contradiction, got ${JSON.stringify(contradictions)}`
  );
});
