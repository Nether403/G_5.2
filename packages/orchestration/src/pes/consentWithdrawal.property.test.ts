// Property 15: Withdrawal stops and erases research collection.
//
// For any session whose Consent_Decision is in the `granted` state, activating
// withdrawal transitions the record to `withdrawn` (recording the withdrawal
// timestamp) and deletes all research records previously collected for that
// session, so that a subsequent access for that session returns none; activating
// withdrawal again on an already-`withdrawn` decision makes no change to the
// Consent_Record.
//
// Validates: Requirements 9.2, 9.4, 9.7
//
// The endpoint logic (POST /api/pes/consent/withdraw) is a thin orchestration of
// two store operations, so the property is exercised at the store level — the
// layer that actually carries the behaviour:
//   - FilePesConsentStore.withdraw       → transition + withdrawnAt + already-withdrawn no-op
//   - FilePesResearchStore.deleteBySessionRef → erase prior records for the session
// A granted decision plus N research records for its session (and some records for
// OTHER sessions) are written to real temp-dir stores. The withdrawal cascade is
// then performed and we assert: status becomes `withdrawn` with a withdrawnAt; the
// session's research records are all deleted (getBySessionRef returns []); other
// sessions' records remain byte-for-byte unchanged; and a second withdraw is a
// no-op that returns the unchanged Consent_Record.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import fc from "fast-check";

import { FilePesConsentStore } from "./consentStore";
import { FilePesResearchStore } from "./researchStore";
import { type PesResearchRecord } from "./types";

/** Filesystem-safe id charset (ids double as on-disk filenames). */
const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789".split("");

/** A filesystem-safe, non-empty identifier. */
const safeId: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...ID_CHARS), { minLength: 1, maxLength: 12 })
  .map((chars) => chars.join(""));

/**
 * A scenario: a `granted` decision governing one session, N research records for
 * THAT session, plus M research records spread across other ("foreign") sessions.
 * The withdrawn session ref is kept distinct from the foreign refs so the erasure
 * target is unambiguous.
 */
const scenarioArb = fc
  .record({
    withdrawnSessionRef: safeId,
    foreignRefs: fc.uniqueArray(safeId, { minLength: 0, maxLength: 3 }),
    ownContents: fc.array(fc.string({ minLength: 1 }), { minLength: 0, maxLength: 8 }),
    foreignSeeds: fc.array(
      fc.record({ refIndex: fc.nat(), content: fc.string({ minLength: 1 }) }),
      { minLength: 0, maxLength: 8 }
    ),
    withdrawnAt: fc
      .date({ min: new Date("2020-01-01T00:00:00.000Z"), max: new Date("2030-01-01T00:00:00.000Z") })
      .map((d) => d.toISOString()),
  })
  // The withdrawn session must not collide with a foreign session ref.
  .filter(({ withdrawnSessionRef, foreignRefs }) => !foreignRefs.includes(withdrawnSessionRef))
  .map(({ withdrawnSessionRef, foreignRefs, ownContents, foreignSeeds, withdrawnAt }) => {
    const ownRecords: PesResearchRecord[] = ownContents.map((content, i) => ({
      id: `own-${i}`,
      datasetId: "pes-research",
      sessionRef: withdrawnSessionRef,
      consentDecisionRef: "consent-under-test",
      consentVersion: "pes-consent-v1",
      collectedAt: "2026-01-01T00:00:00.000Z",
      content,
    }));
    // Foreign records only exist when there is at least one foreign ref to attach them to.
    const foreignRecords: PesResearchRecord[] =
      foreignRefs.length === 0
        ? []
        : foreignSeeds.map((seed, i) => ({
            id: `foreign-${i}`,
            datasetId: "pes-research",
            sessionRef: foreignRefs[seed.refIndex % foreignRefs.length],
            consentDecisionRef: `consent-foreign-${i}`,
            consentVersion: "pes-consent-v1",
            collectedAt: "2026-01-01T00:00:00.000Z",
            content: seed.content,
          }));
    return { withdrawnSessionRef, ownRecords, foreignRecords, withdrawnAt };
  });

test("Property 15: withdrawal transitions to withdrawn, erases the session's research, leaves others intact, and is a no-op on repeat", async () => {
  await fc.assert(
    fc.asyncProperty(scenarioArb, async ({ withdrawnSessionRef, ownRecords, foreignRecords, withdrawnAt }) => {
      const root = await mkdtemp(path.join(os.tmpdir(), "pes-withdrawal-"));
      try {
        const consentStore = new FilePesConsentStore(path.join(root, "consent"));
        const researchStore = new FilePesResearchStore(path.join(root, "records"));

        // A granted decision governs the session under test.
        const decision = await consentStore.record({
          sessionRef: withdrawnSessionRef,
          status: "granted",
          consentVersion: "pes-consent-v1",
        });
        assert.equal(decision.status, "granted");

        // Prior research: the session's own records plus some for other sessions.
        for (const rec of [...ownRecords, ...foreignRecords]) {
          await researchStore.write(rec);
        }

        // --- The withdrawal cascade (what the endpoint orchestrates) ---
        const withdrawn = await consentStore.withdraw(decision.id, withdrawnAt);
        const deleted = await researchStore.deleteBySessionRef(withdrawnSessionRef);

        // Consent_Record transitioned to withdrawn, recording the timestamp (Req 9.2).
        assert.equal(withdrawn?.status, "withdrawn");
        assert.equal(withdrawn?.withdrawnAt, withdrawnAt);
        assert.equal(withdrawn?.id, decision.id);
        assert.equal(withdrawn?.sessionRef, withdrawnSessionRef);

        // All of the session's prior research records were deleted (Req 9.4) ...
        assert.equal(deleted, ownRecords.length);
        // ... so a subsequent access for that session returns none.
        assert.deepEqual(await researchStore.getBySessionRef(withdrawnSessionRef), []);

        // Other sessions' records remain byte-for-byte unchanged.
        const remaining = await researchStore.list();
        const survivorsById = new Map(foreignRecords.map((r) => [r.id, r]));
        assert.equal(remaining.length, foreignRecords.length);
        for (const rec of remaining) {
          assert.notEqual(rec.sessionRef, withdrawnSessionRef);
          assert.deepEqual(rec, survivorsById.get(rec.id));
        }

        // Withdrawing again is a no-op: the Consent_Record is returned unchanged (Req 9.7).
        const secondWithdraw = await consentStore.withdraw(decision.id, "2099-12-31T23:59:59.000Z");
        assert.deepEqual(secondWithdraw, withdrawn);

        // And erasure of an already-cleared session deletes nothing further.
        assert.equal(await researchStore.deleteBySessionRef(withdrawnSessionRef), 0);
        assert.equal((await researchStore.list()).length, foreignRecords.length);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }),
    { numRuns: 200 }
  );
});
