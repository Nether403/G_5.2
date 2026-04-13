import type { CanonDocument, ContinuityFact } from "./canon";
import type { Message } from "./messages";
import type { Mode } from "./modes";

export interface BuildContextInput {
  userMessage: string;
  recentMessages: Message[];
  mode: Mode;
  canonRoot: string;
}

export interface BuiltContext {
  mode: Mode;
  selectedDocuments: CanonDocument[];
  selectedFacts: ContinuityFact[];
  systemPrompt: string;
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
