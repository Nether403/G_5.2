/**
 * researchVoiceTurn — wire the optional voice path into the research write (task 14.2).
 *
 * The voice slice does NOT add a second de-identify → guard → store path. It
 * transcribes consented audio (task 14.1's `transcribeForResearch`) and then hands
 * the resulting TEXT to the very same `researchTurn` orchestrator that text turns use.
 * So a voice transcript inherits, for free:
 *  - the consent gate (only a resolved `granted` decision permits a write),
 *  - fail-closed de-identification (an unscrubbed transcript is never written —
 *    Requirements 10.2, 10.3), and
 *  - the guarded, namespaced store (dataset separation).
 *
 * Fail-closed contract realised here:
 *  - Consent is gated BEFORE transcription. While a decision is `declined`, absent,
 *    `withdrawn`, or unrecorded, transcription does not run and nothing is persisted
 *    (Requirements 10.4, 10.7). This also avoids sending audio to Deepgram without a
 *    `granted` decision.
 *  - A Deepgram error / 30s timeout (`transcribeForResearch` → `ok:false`) aborts with
 *    NO write and surfaces the error (Requirement 10.6). The raw transcript, if any
 *    partial existed, is discarded — only `researchTurn`'s scrubbed output is ever
 *    written (Requirement 10.3).
 *  - The authoritative gate is `researchTurn` itself: it re-resolves consent at write
 *    time, so a transition to `declined` DURING the transcription window still results
 *    in zero persistence (Requirement 10.7).
 *
 * Like `researchTurn`, this is a post-response side-effect: it returns a structured
 * result and never throws.
 */

import { researchTurn, type ResearchTurnInput, type ResearchTurnResult } from "./researchTurn";
import {
  transcribeForResearch,
  type AudioRef,
  type TranscribeOptions,
} from "./transcribe";

export type ResearchVoiceTurnResult =
  | ResearchTurnResult
  | { stored: false; reason: "transcription_failed"; error: string };

export interface ResearchVoiceTurnInput extends Omit<ResearchTurnInput, "content"> {
  /** Consented audio to transcribe. Held in memory only; never persisted. */
  audio: AudioRef;
  /** Transcription deadline etc. Defaults to `transcribeForResearch`'s 30s. */
  transcribeOpts?: TranscribeOptions;
  /** Injectable transcriber (testing). Defaults to {@link transcribeForResearch}. */
  transcribe?: typeof transcribeForResearch;
}

/**
 * Transcribe consented audio and route the transcript through `researchTurn`.
 * Returns a structured result; never throws.
 */
export async function researchVoiceTurn(
  input: ResearchVoiceTurnInput
): Promise<ResearchVoiceTurnResult> {
  const { audio, transcribeOpts, transcribe = transcribeForResearch, ...turn } = input;

  // ── Gate on consent BEFORE transcribing. While declined / absent / withdrawn /
  //    unrecorded, do not transcribe and persist nothing (Requirements 10.4, 10.7).
  const consent = turn.consentRef ? await turn.consentStore.load(turn.consentRef) : null;
  if (consent === null || consent.status !== "granted") {
    return {
      stored: false,
      reason: "not_granted",
      consentStatus: consent?.status ?? "not_recorded",
    };
  }

  // ── Transcribe (fail-closed). On error/timeout/no-transcript, write nothing and
  //    surface the error; the unscrubbed transcript is discarded (Requirements 10.3, 10.6).
  const stt = await transcribe(audio, transcribeOpts);
  if (!stt.ok || !stt.transcript) {
    return {
      stored: false,
      reason: "transcription_failed",
      error: stt.error ?? "Transcription produced no transcript.",
    };
  }

  // ── Route the transcript text through the SAME gated path as text turns.
  //    researchTurn re-resolves consent (catches a mid-session transition to
  //    `declined`) and fails closed on scrub, so an unscrubbed transcript is never
  //    written (Requirements 10.2, 10.3, 10.5, 10.7).
  return researchTurn({ ...turn, content: stt.transcript });
}
