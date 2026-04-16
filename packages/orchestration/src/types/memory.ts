export type {
  MemoryCandidate,
  MemoryConfidence,
  MemoryDecision,
  MemoryItem,
  MemoryModelCandidate,
  MemoryModelResponse,
  MemoryOrigin,
  MemoryScope,
  MemorySourceRef,
  MemoryState,
  MemoryStoredItemSnapshot,
  MemoryType,
} from "../schemas/memory";

export interface MemoryStore {
  load(memoryId: string): Promise<import("../schemas/memory").MemoryItem | null>;
  list(): Promise<import("../schemas/memory").MemoryItem[]>;
  upsert(
    candidate: import("../schemas/memory").MemoryCandidate,
    source: import("../schemas/memory").MemorySourceRef
  ): Promise<import("../schemas/memory").MemoryStoredItemSnapshot>;
  delete(memoryId: string): Promise<boolean>;
}
