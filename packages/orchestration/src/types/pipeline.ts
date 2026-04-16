import type {
  CanonDocument,
  ContinuityFact,
  GlossaryTerm,
  LoadedRecoveredArtifact,
} from "./canon";
import type { MemoryDecision, MemoryItem } from "./memory";
import type { Message } from "./messages";
import type { Mode } from "./modes";

export interface BuildContextInput {
  userMessage: string;
  recentMessages: Message[];
  sessionSummary?: string;
  sessionId?: string;
  memoryRoot?: string;
  memoryItems?: MemoryItem[];
  mode: Mode;
  canonRoot: string;
}

export interface ConsideredButSkippedDocument {
  slug: string;
  title: string;
  reason: string;
}

export interface BuiltContext {
  mode: Mode;
  selectedDocuments: CanonDocument[];
  selectedFacts: ContinuityFact[];
  selectedGlossaryTerms: GlossaryTerm[];
  selectedRecoveredArtifacts: LoadedRecoveredArtifact[];
  selectedMemoryItems: MemoryItem[];
  consideredButSkippedDocuments: ConsideredButSkippedDocument[];
  systemPrompt: string;
  recentMessages: Message[];
  sessionSummary?: string;
  userPrompt: string;
}

export interface TurnArtifacts {
  context: BuiltContext;
  draft: string;
  critique: string;
  revision: string;
  final: string;
  memoryDecision: MemoryDecision;
}
