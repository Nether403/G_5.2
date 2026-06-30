/**
 * STT_Transcriber (P-E-S research voice path) — task 14.1.
 *
 * Transcribes a consented voice session to text via Deepgram (the interim
 * provider). This module does ONE thing: transcription with fail-closed
 * timeout/error handling. It does NOT de-identify, route to the research
 * store, or check consent — that wiring is task 14.2 (`researchTurn`).
 *
 * Fail-closed contract (Requirements 10.1, 10.6):
 *  - On any Deepgram error, or no transcript within `timeoutMs` (default 30s),
 *    return `{ ok: false, error }` with NO transcript — the caller writes
 *    nothing partial.
 *  - Raw audio is held only in memory for the request and is NEVER persisted
 *    by this module.
 *
 * No new dependency: uses the same `fetch` pattern as the model providers
 * (see `providers/azure.ts`) rather than pulling in the Deepgram SDK.
 */

/**
 * Minimal reference to the audio to transcribe. The bytes live in memory for
 * the duration of the request only; this module never writes them anywhere.
 */
export interface AudioRef {
  /** Raw audio bytes (held in memory only — never persisted here). */
  data: Uint8Array | ArrayBuffer;
  /** MIME type of the audio, e.g. "audio/webm", "audio/wav", "audio/mpeg". */
  mimeType: string;
}

export interface TranscribeResult {
  ok: boolean;
  transcript?: string;
  error?: string;
}

export interface TranscribeOptions {
  /** Hard deadline for Deepgram to return a transcript. Defaults to 30000ms. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

interface DeepgramConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

function getDeepgramConfig(): DeepgramConfig | undefined {
  const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
  if (!apiKey) {
    return undefined;
  }
  const baseUrl = (
    process.env.DEEPGRAM_BASE_URL?.trim() || "https://api.deepgram.com/v1"
  ).replace(/\/+$/, "");
  const model = process.env.DEEPGRAM_MODEL?.trim() || "nova-2";
  return { apiKey, baseUrl, model };
}

/** Shape of the bits of the Deepgram prerecorded response we read. */
interface DeepgramResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{ transcript?: string }>;
    }>;
  };
  err_code?: string;
  err_msg?: string;
}

function extractTranscript(data: DeepgramResponse): string | undefined {
  const transcript =
    data.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  if (typeof transcript !== "string") {
    return undefined;
  }
  // A whitespace-only transcript is treated as "no transcript" (fail closed).
  return transcript.trim().length > 0 ? transcript : undefined;
}

/**
 * Transcribe consented audio to text via Deepgram. Returns `ok:false` (with no
 * transcript) on any failure path: missing config, provider error, empty
 * transcript, or timeout. Never throws, never persists audio.
 */
export async function transcribeForResearch(
  audio: AudioRef,
  opts: TranscribeOptions = { timeoutMs: DEFAULT_TIMEOUT_MS }
): Promise<TranscribeResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const config = getDeepgramConfig();
  if (!config) {
    // Fail closed: without a provider key we cannot transcribe, so write nothing.
    return { ok: false, error: "Deepgram is not configured (DEEPGRAM_API_KEY missing)." };
  }

  if (!audio.mimeType) {
    return { ok: false, error: "AudioRef.mimeType is required to transcribe." };
  }

  const url = `${config.baseUrl}/listen?model=${encodeURIComponent(config.model)}&smart_format=true`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${config.apiKey}`,
        "Content-Type": audio.mimeType,
      },
      // ponytail: cast to BodyInit — the DOM lib's generic Uint8Array<ArrayBufferLike>
      // doesn't structurally match BufferSource here, but raw bytes are a valid body.
      body: audio.data as BodyInit,
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "(unreadable body)");
      return {
        ok: false,
        error: `Deepgram request failed [${response.status} ${response.statusText}]: ${detail}`,
      };
    }

    const data = (await response.json()) as DeepgramResponse;
    if (data.err_code || data.err_msg) {
      return {
        ok: false,
        error: `Deepgram error [${data.err_code ?? "unknown"}]: ${data.err_msg ?? "unspecified"}`,
      };
    }

    const transcript = extractTranscript(data);
    if (transcript === undefined) {
      return { ok: false, error: "Deepgram returned no transcript." };
    }

    return { ok: true, transcript };
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        error: `Transcription timed out after ${timeoutMs}ms with no transcript.`,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Transcription failed: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}
