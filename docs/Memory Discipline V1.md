# Memory Discipline V1

## Summary
- Status: implemented in the current repo state.
- Durable memory now exists as the lowest-precedence retrievable context in G_5.2.
- V1 uses a hybrid scope: `global` memory for `user_preference` and `project_decision`, plus `session` memory for `open_thread`.
- Memory writes are automatic only when a dedicated structured post-revision memory pass returns a high-confidence candidate with explicit justification.
- Operators can inspect and hard-delete memory in the inquiry surface; there is still no manual create/edit flow in V1.

## Implemented Surface
- Runtime memory types now exist: `MemoryItem`, `MemoryCandidate`, `MemoryType`, `MemoryScope`, and structured `MemoryDecision` results.
- The old regex-only memory decision path was replaced by a dedicated structured memory pass after revision.
- Allowed candidate types are `user_preference`, `project_decision`, and `open_thread`, with default scopes `global`, `global`, and `session` respectively.
- Only `confidence === "high"` candidates are persisted. Lower-confidence candidates remain visible as skipped proposals on the stored turn.
- Deduplication is confirmation-based on normalized `{type, scope, sessionId?, statement}` keys.
- The store is file-backed in `data/memory-items/` behind a `MemoryStore` abstraction.
- Retrieval trace and prompt construction now include `selectedMemoryItems`.
- Prompt rendering places memory after session summary and recent context under `Durable memory (lowest-priority, non-canonical):`.
- Persisted turn records now retain stored and skipped memory details for operator inspection.
- The dashboard exposes memory listing and delete operations through `GET /api/memory` and `DELETE /api/memory/:id`.
- The inquiry surface includes a live memory inspector, session/memory search, and a stored-memory section in the turn drawer.
- Eval trace and assertions now support `selectedMemoryItems`, with fixture-backed memory retrieval tests.
- Docs and glossary were updated to reflect the implemented file-backed V1 design.

## Verified Coverage
- Unit coverage exists for clear preference writes, duplicate confirmation, ephemeral rejection, session/global retrieval rules, and delete behavior with historical turn preservation.
- Integration coverage exists for `runSessionTurn` writing memory, retrieving it later, and storing structured memory decisions on persisted turns.
- Eval coverage exists for relevant memory retrieval, irrelevant-memory gating, and canon-over-memory precedence.
- UI smoke was completed against the inquiry surface for memory visibility, turn inspection, and delete behavior.

## Assumptions And Defaults
- File-backed storage is the V1 default and should stay aligned with the current zero-external-dependency operator stack.
- V1 supports inspect and delete only; no manual create/edit and no approval queue.
- `open_thread` resolution is manual delete in V1; there is no auto-resolution, TTL, or archival state yet.
- Memory retrieval applies to normal live inquiry turns across the current mode set without mode-specific branching in V1.
- The memory pass uses the active provider but with a minimal dedicated prompt so it stays much lighter than the full turn pipeline.
