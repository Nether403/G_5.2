// pes/deidentify.ts — the Deidentifier.
//
// Mirrors (does NOT import) `TWP-platform/src/lib/ai/pii.ts`. The two repos are
// separate npm projects, so the logic and the `[REDACTED_*]` replacement scheme
// are reproduced here in the G_5.2 namespace (a conscious alpha tradeoff per
// project steering; a shared contract package is the eventual upgrade path).
//
// Two-pass pipeline, designed so FULL turn text never leaves the server for PII
// detection:
//   1. Pure regex pass for obvious patterns (email, phone, URL, government id,
//      IP, specific/numeric dates).
//   2. Heuristic candidate isolation, then ONLY the isolated candidate tokens
//      (never the full turn text) are sent for name/institution/location/id
//      classification; results are applied back to the text locally.
//
// Fail-closed contract (Requirement 5.5), STRICTER than the TWP module: any
// detector error, timeout, or unhandled content returns `ok:false`, so the
// caller stores nothing. The regex pass alone counts as a *complete* scrub only
// when no candidate tokens were found (matching pii.ts's "regex-only" path).

import type { ModelProvider } from "../types/providers";
import { providerFromEnv } from "../providers/fromEnv";

/**
 * Result of de-identifying a single turn.
 *
 * `detections` carries category + replacement marker ONLY — never the original
 * value (Requirement 5.6; the stored research record must not leak raw PII).
 */
export interface DeidentifyResult {
  /** false ⇒ scrubbing did not complete; caller MUST store nothing. */
  ok: boolean;
  /** Valid only when `ok === true`. */
  deIdentifiedText: string;
  /** Categories only; never original values. */
  detections: { type: string; replacement: string }[];
  model: string;
}

/** One classified candidate token. */
export interface PiiClassification {
  text: string;
  /** "name" | "institution" | "location" | "id" | "not_pii" */
  type: string;
}

/**
 * Classifies isolated candidate tokens. MUST reject (throw) on any failure so
 * the de-identifier can fail closed. Receives ONLY the candidate tokens.
 */
export type CandidateClassifier = (
  candidates: string[],
) => Promise<{ classifications: PiiClassification[]; model: string }>;

// ─── Pass 1: Regex-based PII stripping ─────────────────────

const PII_PATTERNS: { type: string; regex: RegExp; replacement: string }[] = [
  {
    type: "email",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: "[REDACTED_EMAIL]",
  },
  // ssn and ip_address MUST precede phone: the phone separator class `[-.\s]`
  // includes `.` and `-`, so an earlier phone pass would mis-claim dot-quad IPs
  // (e.g. 255.255.255.0) and dashed SSNs as [REDACTED_PHONE]. Matching the more
  // specific shapes first keeps each category's labeled marker correct
  // (Requirements 5.2, 5.6). Phone inputs like 555-123-4567 are not IP/SSN-shaped.
  {
    type: "ssn",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: "[REDACTED_SSN]",
  },
  {
    type: "ip_address",
    regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    replacement: "[REDACTED_IP]",
  },
  {
    type: "phone",
    regex: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,
    replacement: "[REDACTED_PHONE]",
  },
  {
    type: "url",
    regex: /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g,
    replacement: "[REDACTED_URL]",
  },
  {
    type: "date_specific",
    regex: /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
    replacement: "[REDACTED_DATE]",
  },
  {
    type: "date_numeric",
    regex: /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g,
    replacement: "[REDACTED_DATE]",
  },
];

/**
 * Fast local PII strip using regex patterns only. Pure and dependency-free.
 * Returns category + replacement detections (no original values).
 */
export function regexStrip(
  text: string,
): { text: string; detections: { type: string; replacement: string }[] } {
  const detections: { type: string; replacement: string }[] = [];
  let result = text;

  for (const pattern of PII_PATTERNS) {
    // matchAll on the running result mirrors pii.ts (so counts reflect what is
    // actually replaced, after earlier patterns have already redacted).
    for (const _match of result.matchAll(pattern.regex)) {
      detections.push({ type: pattern.type, replacement: pattern.replacement });
    }
    result = result.replaceAll(pattern.regex, pattern.replacement);
  }

  return { text: result, detections };
}

// ─── Pass 2: Candidate Isolation ──────────────────────────

/** Common title-case phrases that are NOT PII. */
const COMMON_PHRASES = new Set([
  "The Gate", "The Inquisitor", "The Witness", "The Protocol",
  "The Foundation", "The Archive", "Human Curation", "Curation Council",
  "United States", "United Kingdom", "United Nations",
  "New York", "New Zealand", "South Africa", "North America",
  "South America", "East Asia", "West Africa",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
  "World War", "Civil War", "Cold War",
  "Dear Sir", "Dear Madam",
]);

function isCommonPhrase(phrase: string): boolean {
  return COMMON_PHRASES.has(phrase);
}

/** Common capitalized words that appear mid-sentence but are not names. */
const COMMON_WORDS = new Set([
  "I", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
  "Saturday", "Sunday", "God", "Christian", "Muslim", "Jewish",
  "Buddhist", "Hindu", "Catholic", "Protestant", "American",
  "European", "Asian", "African", "English", "Spanish", "French",
  "German", "Dutch", "Chinese", "Japanese", "Arabic", "Russian",
  "However", "Moreover", "Furthermore", "Therefore", "Nevertheless",
  "Perhaps", "Although", "Because", "Despite", "During",
]);

function isCommonWord(word: string): boolean {
  return COMMON_WORDS.has(word);
}

/**
 * Heuristically extract candidate PII tokens, returned deduplicated and WITHOUT
 * surrounding context. The redaction markers produced by pass 1 are all-caps and
 * never match these title-case heuristics, which keeps the pipeline idempotent.
 */
export function extractCandidates(text: string): string[] {
  const candidates = new Set<string>();

  // Title-case sequences of 2-4 words (likely person names, places, institutions)
  const titleCaseRegex = /\b(?:[A-Z][a-z]+(?:\s+(?:of|the|and|de|van|von|el|al|la)\s+)?){2,4}\b/g;
  for (const match of text.matchAll(titleCaseRegex)) {
    const candidate = match[0].trim();
    if (!isCommonPhrase(candidate) && candidate.length > 3) {
      candidates.add(candidate);
    }
  }

  // Contextual extraction: words after location/institution indicators
  const contextualRegex = /\b(?:at|for|from|in|near|called|named|works?\s+at|lives?\s+in|visited|attended)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})/g;
  for (const match of text.matchAll(contextualRegex)) {
    const candidate = match[1]?.trim();
    if (candidate && !isCommonPhrase(candidate) && candidate.length > 2) {
      candidates.add(candidate);
    }
  }

  // Single capitalized words mid-sentence (potential first names)
  const midSentenceCapRegex = /(?<=[a-z.,;:]\s+)([A-Z][a-z]{2,})\b/g;
  for (const match of text.matchAll(midSentenceCapRegex)) {
    const candidate = match[1]?.trim();
    if (candidate && !isCommonWord(candidate) && candidate.length > 2) {
      candidates.add(candidate);
    }
  }

  return Array.from(candidates);
}

// ─── Pass 2: Classification ───────────────────────────────

const CLASSIFY_PROMPT = `You are a PII classifier. You will receive a JSON array of text fragments extracted from a document. For each fragment, classify whether it is personally identifiable information (PII) or not.

Classify each as one of:
- "name" — a person's name (first, last, or full)
- "institution" — a specific named company, university, hospital, etc.
- "location" — a specific street, small town, neighborhood, or address
- "id" — a unique identifier (employee number, case number, etc.)
- "not_pii" — not personally identifying (generic, well-known, or common)

IMPORTANT: Large cities (New York, London, Tokyo), countries, and well-known historical institutions are NOT PII. Only flag specific, identifying references.

Respond ONLY with valid JSON:
{
  "classifications": [
    { "text": "John Smith", "type": "name" },
    { "text": "Goldman Sachs", "type": "institution" },
    { "text": "Main Street", "type": "not_pii" }
  ]
}`;

const TYPE_TO_REPLACEMENT: Record<string, string> = {
  name: "[REDACTED_NAME]",
  institution: "[REDACTED_INSTITUTION]",
  location: "[REDACTED_LOCATION]",
  id: "[REDACTED_ID]",
};

/** ponytail: deidentifier classification timeout. Upgrade path: make configurable per call/env. */
const CLASSIFY_TIMEOUT_MS = 30_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Default classifier: sends ONLY the isolated candidate tokens to a model and
 * parses strict JSON. Throws on empty/unparseable output or timeout so the
 * de-identifier fails closed. Never transmits the full turn text.
 */
function defaultClassifier(provider: ModelProvider): CandidateClassifier {
  return async (candidates) => {
    const out = await withTimeout(
      provider.generateText({
        system: CLASSIFY_PROMPT,
        user: JSON.stringify(candidates),
        temperature: 0,
      }),
      CLASSIFY_TIMEOUT_MS,
      "PII classification",
    );

    const content = out.text?.trim();
    if (!content) {
      throw new Error("PII classifier returned empty content");
    }

    // Strip markdown fences if present, then parse strictly.
    const cleaned = content
      .replace(/^```(?:json)?\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as { classifications?: PiiClassification[] };
    if (!parsed || !Array.isArray(parsed.classifications)) {
      throw new Error("PII classifier returned malformed JSON");
    }

    return {
      classifications: parsed.classifications,
      model: `candidate-isolation:${out.model}`,
    };
  };
}

/**
 * De-identify a single turn. Fail-closed: returns `ok:false` (and the caller
 * stores nothing) on any detector error, timeout, or unhandled content. The
 * regex pass alone is a complete scrub only when no candidate tokens are found.
 *
 * @param text       the raw turn content
 * @param classifier optional injected classifier (defaults to a provider built
 *                   from the environment); injectable for testing without network.
 */
export async function deidentifyTurn(
  text: string,
  classifier?: CandidateClassifier,
): Promise<DeidentifyResult> {
  // Pass 1: regex (pure, always runs).
  let regexStripped: string;
  let regexDetections: { type: string; replacement: string }[];
  try {
    const r = regexStrip(text);
    regexStripped = r.text;
    regexDetections = r.detections;
  } catch {
    // Unhandled content broke the pure pass ⇒ fail closed.
    return { ok: false, deIdentifiedText: "", detections: [], model: "regex-failed" };
  }

  // Pass 2: candidate isolation.
  let candidates: string[];
  try {
    candidates = extractCandidates(regexStripped);
  } catch {
    return { ok: false, deIdentifiedText: "", detections: [], model: "extract-failed" };
  }

  // No candidates ⇒ regex-only is a COMPLETE scrub (matches pii.ts).
  if (candidates.length === 0) {
    return {
      ok: true,
      deIdentifiedText: regexStripped,
      detections: regexDetections,
      model: "regex-only",
    };
  }

  // Candidates exist ⇒ classification MUST complete, or we fail closed.
  const classify = classifier ?? defaultClassifier(providerFromEnv());
  let classifications: PiiClassification[];
  let model: string;
  try {
    const c = await classify(candidates);
    classifications = c.classifications;
    model = c.model;
  } catch {
    // Detector error / timeout ⇒ fail closed (stricter than pii.ts fallback).
    return { ok: false, deIdentifiedText: "", detections: [], model: "classify-failed" };
  }

  // Apply classifications back to the text locally.
  let finalText = regexStripped;
  const llmDetections: { type: string; replacement: string }[] = [];
  for (const cls of classifications) {
    if (!cls || cls.type === "not_pii") continue;
    const replacement = TYPE_TO_REPLACEMENT[cls.type];
    if (!replacement || typeof cls.text !== "string") continue;
    if (finalText.includes(cls.text)) {
      finalText = finalText.replaceAll(cls.text, replacement);
      llmDetections.push({ type: cls.type, replacement });
    }
  }

  return {
    ok: true,
    deIdentifiedText: finalText,
    detections: [...regexDetections, ...llmDetections],
    model,
  };
}
