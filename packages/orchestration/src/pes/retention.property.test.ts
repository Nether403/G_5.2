// Property 14: Retention purges exactly the expired records.
// Validates: Requirements 6.2, 6.3, 6.5, 6.6
//
// For any set of research records and any evaluation time, a retention sweep
// purges every record whose age from its `collectedAt` timestamp exceeds the
// configured retention period — deleting both the de-identified content and the
// session re-association data — and retains every record still within the
// period; the sweep evaluates every stored record, and a record is never left in
// a partially purged state.
//
// Exercised for real against runRetentionSweep + isExpired over a temp-dir
// FilePesResearchStore. Each record's collectedAt is `now - age`, so its age from
// collectedAt is exactly `age` and the ground-truth expired set is `age >
// retentionMs` (strictly greater — the boundary at exactly the period is NOT
// expired, Req 6.2). Ages cluster near the boundary and spread broadly. After the
// sweep we assert: purged ids == expired set, failed == [] (Req 6.5 evaluates
// every record); every purged record's file is fully gone — content AND sessionRef
// together (Req 6.3); every retained record survives intact (no partial purge,
// Req 6.6).

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import fc from "fast-check";

import { isExpired, runRetentionSweep } from "./retention";
import { FilePesResearchStore } from "./researchStore";
import { type PesResearchRecord } from "./types";

/**
 * A scenario: a retention period, an evaluation time `now`, and a set of records
 * each defined by its age (ms) before `now`. Ages are drawn both near the
 * strictly-greater-than boundary (retentionMs ± a few ms) and across a broad
 * spread, so the property exercises both expired and in-period records — including
 * the exact-period edge that must NOT be purged.
 */
const scenarioArb = fc.integer({ min: 1, max: 10_000_000 }).chain((retentionMs) =>
  fc
    .record({
      retentionMs: fc.constant(retentionMs),
      now: fc.date({
        min: new Date("2001-01-01T00:00:00.000Z"),
        max: new Date("2099-01-01T00:00:00.000Z"),
        noInvalidDate: true,
      }),
      ages: fc.array(
        fc.oneof(
          // Boundary-focused: just below, at, and just above the period.
          fc.integer({ min: -3, max: 3 }).map((d) => Math.max(0, retentionMs + d)),
          // Broad spread from fresh to well past the period.
          fc.integer({ min: 0, max: retentionMs * 3 + 10 })
        ),
        { minLength: 1, maxLength: 12 }
      ),
    })
    .map(({ retentionMs: r, now, ages }) => ({
      retentionMs: r,
      now,
      records: ages.map((age, i) => ({
        id: `rec-${i}`,
        datasetId: "pes-research",
        sessionRef: `sess-${i}`,
        consentDecisionRef: `consent-${i}`,
        consentVersion: "pes-consent-v1",
        // collectedAt = now - age, so age-from-collectedAt is exactly `age`.
        collectedAt: new Date(now.getTime() - age).toISOString(),
        content: `de-identified content ${i}`,
      })) as PesResearchRecord[],
      ages,
    }))
);

test("Property 14: retention sweep purges exactly the expired records, retaining the rest whole", async () => {
  await fc.assert(
    fc.asyncProperty(scenarioArb, async ({ retentionMs, now, records, ages }) => {
      const cfg = { retentionMs };
      const root = await mkdtemp(path.join(os.tmpdir(), "pes-retention-prop-"));
      try {
        const store = new FilePesResearchStore(path.join(root, "records"));
        for (const rec of records) {
          await store.write(rec);
        }

        // Ground-truth expired set per the spec: age strictly greater than the
        // retention period (Req 6.2). Computed from raw ages, not from isExpired,
        // so the test is independent of the implementation under test.
        const expiredIds = records
          .filter((_, i) => ages[i] > retentionMs)
          .map((r) => r.id)
          .sort();
        const retainedIds = records
          .filter((_, i) => ages[i] <= retentionMs)
          .map((r) => r.id)
          .sort();

        // isExpired agrees with the ground-truth strictly-greater-than semantics.
        for (let i = 0; i < records.length; i += 1) {
          assert.equal(
            isExpired(records[i], now, cfg),
            ages[i] > retentionMs,
            `isExpired must be strictly age > retentionMs for ${records[i].id}`
          );
        }

        const result = await runRetentionSweep(store, now, cfg);

        // The sweep purged exactly the expired set and nothing failed (Req 6.5).
        assert.deepEqual([...result.purged].sort(), expiredIds, "purged set must equal expired set");
        assert.deepEqual(result.failed, [], "no purge should fail in a healthy store");

        // Purged records are fully gone — content AND sessionRef together (Req 6.3);
        // retained records survive intact, never partially purged (Req 6.6).
        const remaining = await store.list();
        assert.deepEqual(
          remaining.map((r) => r.id).sort(),
          retainedIds,
          "only in-period records remain"
        );
        for (const survivor of remaining) {
          const original = records.find((r) => r.id === survivor.id);
          assert.deepEqual(survivor, original, "retained records must be byte-for-byte intact");
        }
        // Each purged id no longer resolves by its session reference (re-association gone).
        for (const id of expiredIds) {
          const sessionRef = records.find((r) => r.id === id)!.sessionRef;
          assert.deepEqual(
            await store.getBySessionRef(sessionRef),
            [],
            `purged record ${id} must leave no session re-association data`
          );
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }),
    { numRuns: 200 }
  );
});
