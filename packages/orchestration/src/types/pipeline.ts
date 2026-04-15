import type {
  CanonDocument,
  ContinuityFact,
  GlossaryTerm,
  LoadedRecoveredArtifact,
} from "./canon";
import type { Message } from "./messages";
import type { Mode } from "./modes";

export interface BuildContextInput {
  userMessage: string;
  recentMessages: Message[];
  sessionSummary?: string;
  mode: Mode;
  canonRoot: string;
}

export interface BuiltContext {
  mode: Mode;
  selectedDocuments: CanonDocument[];
  selectedFacts: ContinuityFact[];
  selectedGlossaryTerms: GlossaryTerm[];
  selectedRecoveredArtifacts: LoadedRecoveredArtifact[];
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
  memoryDecision: {
    shouldStore: boolean;
    reason: string;
    candidates: string[];
  };
}
