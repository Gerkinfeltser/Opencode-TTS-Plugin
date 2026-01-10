/**
 * Type definitions for the TTS Reader plugin.
 * Supports local Kokoro.js (CPU) or HTTP backend (GPU via Kokoro-FastAPI).
 */

export type TtsBackend = "local" | "http"
export type TtsSpeakMode = "idle" | "message"

export interface TtsConfig {
  /** TTS backend: "local" for CPU (kokoro-js), "http" for GPU (Kokoro-FastAPI) */
  backend: TtsBackend
  /** HTTP server URL when backend is "http" (e.g., "http://localhost:8880") */
  httpUrl: string
  /** When to speak: "idle" (session idle) or "message" (each message completes) */
  speakOn: TtsSpeakMode
  /** Voice to use for synthesis */
  voice: string
  /** Speech speed multiplier */
  speed: number
  /** Enable/disable TTS */
  enabled: boolean
  /** Response format for HTTP backend */
  httpFormat: "wav" | "mp3" | "pcm"
  /** Max worker threads for local backend (0 disables workers) */
  maxWorkers: number
}

export const DEFAULT_CONFIG: TtsConfig = {
  backend: "local",
  httpUrl: "http://localhost:8880",
  httpFormat: "wav",
  speakOn: "message",
  voice: "af_heart",
  speed: 1.0,
  enabled: false,
  maxWorkers: 2,
}

export const AVAILABLE_VOICES = [
  "af_heart",
  "af_bella",
  "af_nicole",
  "af_sarah",
  "af_sky",
  "am_adam",
  "am_michael",
  "bf_emma",
  "bf_isabella",
  "bm_george",
  "bm_lewis",
] as const

export type VoiceName = (typeof AVAILABLE_VOICES)[number]
