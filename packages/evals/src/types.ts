export type EvalMode =
  | "analytic"
  | "reflective"
  | "dialogic"
  | "editorial"
  | "speculative"
  | "archive"
  | "meta";

export interface EvalRecentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface EvalAssertions {
  /**
   * Each inner array is an OR-group.
   * At least one string in each group must appear in the output.
   */
  mustContainAny?: string[][];

  /**
   * Every string in this array must appear in the output.
   */
  mustContainAll?: string[];

  /**
   * No string in this array may appear in the output.
   */
  mustNotContain?: string[];
}

export interface EvalCase {
  id: string;
  description: string;
  mode: EvalMode;
  userMessage: string;
  recentMessages: EvalRecentMessage[];
  assertions: EvalAssertions;
}

export interface EvalFailure {
  type: "mustContainAny" | "mustContainAll" | "mustNotContain";
  message: string;
}

export interface EvalResult {
  id: string;
  description: string;
  passed: boolean;
  failures: EvalFailure[];
  output: string;
  provider: string;
  model: string;
}
