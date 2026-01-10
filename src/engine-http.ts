/**
 * HTTP backend for TTS using Kokoro-FastAPI (OpenAI-compatible API).
 * Enables GPU acceleration via external server.
 *
 * Server: https://github.com/remsky/Kokoro-FastAPI
 * Docker: docker run -d --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest
 */

import { tmpdir } from "os"
import { join } from "path"
import type { TtsConfig } from "./types"

let serverAvailable = false
let serverChecked = false

export async function checkHttpServer(config: TtsConfig): Promise<boolean> {
  if (serverChecked) return serverAvailable

  try {
    const response = await fetch(`${config.httpUrl}/v1/models`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    })
    serverAvailable = response.ok
  } catch {
    serverAvailable = false
  }

  serverChecked = true
  return serverAvailable
}

export async function speakHttp(text: string, config: TtsConfig, $: any): Promise<void> {
  if (!config.enabled || !text || text.trim().length === 0) return

  try {
    const response = await fetch(`${config.httpUrl}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "kokoro",
        voice: config.voice,
        input: text,
        speed: config.speed,
        response_format: config.httpFormat,
      }),
    })

    if (!response.ok) return

    const audioBuffer = await response.arrayBuffer()
    const ext = config.httpFormat === "mp3" ? "mp3" : "wav"
    const audioPath = join(tmpdir(), `opencode-tts-${Date.now()}.${ext}`)

    await Bun.write(audioPath, audioBuffer)
    await playAudio(audioPath, $)
  } catch {}
}

async function playAudio(filePath: string, $: any): Promise<void> {
  const platform = process.platform

  try {
    if (platform === "darwin") {
      await $`afplay ${filePath}`.quiet()
    } else if (platform === "win32") {
      await $`powershell -c "(New-Object Media.SoundPlayer '${filePath}').PlaySync()"`.quiet()
    } else {
      // Linux - try common players
      try {
        await $`paplay ${filePath}`.quiet()
      } catch {
        try {
          await $`aplay ${filePath}`.quiet()
        } catch {
          await $`mpv --no-video ${filePath}`.quiet()
        }
      }
    }
  } catch {}
}

export function isHttpReady(): boolean {
  return serverAvailable
}

export function resetHttpCheck(): void {
  serverChecked = false
  serverAvailable = false
}
