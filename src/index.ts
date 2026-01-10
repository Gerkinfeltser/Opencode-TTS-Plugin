/**
 * TTS Reader Plugin for OpenCode.
 * Reads assistant messages aloud using Kokoro TTS.
 *
 * Features:
 * - Dual backend: local CPU (kokoro-js) or HTTP GPU (Kokoro-FastAPI)
 * - Two speak modes: "message" (each response) or "idle" (only final message on idle)
 * - Automatic model download for local backend (~87MB q8 quantized)
 * - Cross-platform audio playback
 */

import type { Plugin } from "@opencode-ai/plugin"
import * as path from "path"
import * as url from "url"
import { cancelTts, speak, initTts, isReady } from "./engine"
import { DEFAULT_CONFIG, type TtsConfig } from "./types"

export const TtsReaderPlugin: Plugin = async ({ client, $ }) => {
  const config: TtsConfig = { ...DEFAULT_CONFIG }
  const pluginRoot = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "..")
  const logFilePath = path.join(pluginRoot, `tts-reader-${Date.now()}.log`)
  const initPayload = [
    `${new Date().toISOString()} plugin initialized`,
    `backend=${config.backend}`,
    `speakOn=${config.speakOn}`,
    `voice=${config.voice}`,
    `speed=${config.speed}`,
    `maxWorkers=${config.maxWorkers}`,
  ].join("\n")

  await Bun.write(logFilePath, `${initPayload}\n`).catch(() => {})

  const appendLog = async (message: string): Promise<void> => {
    const existing = await Bun.file(logFilePath)
      .text()
      .catch(() => "")
    const payload = `${existing}${new Date().toISOString()} ${message}\n`
    await Bun.write(logFilePath, payload).catch(() => {})
  }

  const logger = { append: appendLog }
  const globalLogger = globalThis as { __ttsReaderLogger?: typeof logger }
  globalLogger.__ttsReaderLogger = logger

  appendLog("init: starting background TTS init").catch(() => {})

  const promptState = {
    buffer: "",
    skipCommandExecuted: false,
    lastToggleSource: "",
    lastToggleTime: 0,
  }

  const extractNotice = (raw: string): string => {
    if (!raw) return ""
    if (raw.startsWith("---")) {
      const end = raw.indexOf("\n---", 3)
      if (end !== -1) {
        return raw.slice(end + 4).trim()
      }
    }
    return raw.trim()
  }

  const commandRoot = path.join(pluginRoot, "..", "..", "command")
  const ttsOnPath = path.join(commandRoot, "tts:on.md")
  const ttsModeNotice = extractNotice(
    await Bun.file(ttsOnPath)
      .text()
      .catch(() => ""),
  )

  // Track the latest message's text (overwritten on each new message)
  let latestMessageID: string | null = null
  let latestMessageText: string | null = null
  // Track which message we last spoke (prevents re-speaking same message)
  let lastSpokenMessageID: string | null = null

  // Initialize TTS in background after delay
  setTimeout(async () => {
    const success = await initTts(config)
    const backendLabel = config.backend === "http" ? "HTTP (GPU)" : "Local (CPU)"
    const modeLabel = config.speakOn === "message" ? "per-message" : "on-idle"

    if (success) {
      appendLog(`tts ready (${backendLabel}, ${modeLabel})`).catch(() => {})
      try {
        await client.tui.showToast({
          body: {
            title: "TTS Reader",
            message: `${backendLabel} backend ready (${modeLabel})`,
            variant: "success",
            duration: 3000,
          },
        })
      } catch {}
    } else {
      appendLog(`tts init failed (${backendLabel})`).catch(() => {})
      const helpMsg =
        config.backend === "http"
          ? `Cannot reach ${config.httpUrl}. Start server: docker run -d --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest`
          : "Failed to load TTS. Run: cd .opencode/plugin/tts-reader && bun install"

      try {
        await client.tui.showToast({
          body: {
            title: "TTS Reader",
            message: helpMsg,
            variant: "warning",
            duration: 7000,
          },
        })
      } catch {}
    }
  }, 5000)

  const extractTextPart = (parts: Array<{ type: string; text?: string }>): string => {
    for (const part of parts) {
      if (part.type === "text" && part.text) {
        return part.text
      }
    }
    return ""
  }

  const parseTtsCommand = (text: string): string | null => {
    const trimmed = text.trim()
    if (!trimmed.startsWith("/tts")) return null
    const tail = trimmed.slice(4).trim()
    if (tail.startsWith(":")) {
      return tail.slice(1).trim()
    }
    return tail
  }

  const applyTtsCommand = async (args: string): Promise<void> => {
    const wantsOn = args.includes("on") || args.includes("enable")
    const wantsOff = args.includes("off") || args.includes("disable")

    if (wantsOn) {
      config.enabled = true
    } else if (wantsOff) {
      config.enabled = false
    } else {
      config.enabled = !config.enabled
    }

    if (!config.enabled) {
      cancelTts(config)
    }

    const status = config.enabled ? "enabled" : "disabled"
    appendLog(`command: tts ${status} (${args || "toggle"}) from ${promptState.lastToggleSource}`).catch(() => {})

    if (config.enabled) {
      const ready = await initTts(config)
      appendLog(`command: tts init ${ready ? "ready" : "failed"}`).catch(() => {})
    }

    if (config.enabled && latestMessageID && latestMessageText && lastSpokenMessageID !== latestMessageID) {
      appendLog(`command: tts speak latest ${latestMessageID}`).catch(() => {})
      void speakText(latestMessageID, latestMessageText)
    }

    try {
      await client.tui.showToast({
        body: {
          title: "TTS Reader",
          message: `TTS ${status}`,
          variant: config.enabled ? "success" : "warning",
          duration: 2000,
        },
      })
    } catch {}
  }

  // Helper to clean and speak text
  async function speakText(messageID: string, text: string): Promise<void> {
    if (lastSpokenMessageID === messageID) {
      appendLog(`speak: skip duplicate message ${messageID}`).catch(() => {})
      return
    }
    if (!config.enabled) {
      appendLog(`speak: disabled at message ${messageID} (last toggle ${promptState.lastToggleSource})`).catch(() => {})
      cancelTts(config)
      return
    }
    if (!isReady(config)) {
      appendLog(`speak: backend not ready for ${messageID}`).catch(() => {})
      return
    }

    lastSpokenMessageID = messageID

    const cleanText = text
      .replace(/```[\s\S]*?```/g, " code block ")
      .replace(/[#*_`]/g, "")
      .trim()

    if (cleanText.length === 0) {
      appendLog(`speak: empty text for ${messageID}`).catch(() => {})
      return
    }

    appendLog(`speak: start ${messageID} (${cleanText.length} chars)`).catch(() => {})
    try {
      await speak(cleanText, config, $)
      appendLog(`speak: done ${messageID}`).catch(() => {})
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error"
      const stack = error instanceof Error && error.stack ? `\n${error.stack}` : ""
      appendLog(`speak: error ${messageID}: ${message}${stack}`).catch(() => {})
    }
  }

  return {
    "experimental.chat.system.transform": async (_, output) => {
      if (!config.enabled) return
      if (!ttsModeNotice) return
      output.system.push(ttsModeNotice)
      appendLog("system: appended tts notice").catch(() => {})
    },
    event: async ({ event }) => {
      // Track latest assistant message text (streaming updates)
      if (event.type === "message.part.updated") {
        const part = event.properties.part
        if (part.type === "text" && !part.synthetic && !part.ignored) {
          latestMessageID = part.messageID
          latestMessageText = part.text
          appendLog(`event: part updated ${part.messageID} (${part.text.length} chars)`).catch(() => {})
        }
      }

      if (event.type === "tui.prompt.append") {
        promptState.buffer = `${promptState.buffer}${event.properties.text}`
        appendLog(`tui: prompt.append (${event.properties.text.length})`).catch(() => {})
      }

      if (event.type === "tui.command.execute") {
        const command = event.properties.command.trim()
        appendLog(`tui: command.execute ${command}`).catch(() => {})
        if (command === "prompt.clear") {
          promptState.buffer = ""
        }
        if (command === "prompt.submit") {
          const args = parseTtsCommand(promptState.buffer)
          promptState.buffer = ""
          if (args !== null) {
            promptState.lastToggleSource = "tui.prompt.submit"
            promptState.lastToggleTime = Date.now()
            await applyTtsCommand(args)
            return
          }
        }
        if (command.startsWith("tts")) {
          const rawArgs = command.slice(3).trim().toLowerCase()
          const args = rawArgs.startsWith(":") ? rawArgs.slice(1).trim() : rawArgs
          promptState.skipCommandExecuted = true
          promptState.lastToggleSource = "tui.command.execute"
          promptState.lastToggleTime = Date.now()
          await applyTtsCommand(args)
        }
      }

      // "message" mode: speak when each assistant message completes
      if (config.speakOn === "message" && event.type === "message.updated") {
        const msg = event.properties.info
        if (msg.role === "assistant" && msg.time.completed) {
          if (latestMessageID === msg.id && latestMessageText) {
            appendLog(`event: message completed ${msg.id}`).catch(() => {})
            await speakText(msg.id, latestMessageText)
          }
        }
      }

      // "idle" mode: speak only the latest message when session goes idle
      if (config.speakOn === "idle" && event.type === "session.idle") {
        if (latestMessageID && latestMessageText) {
          appendLog(`event: session idle ${latestMessageID}`).catch(() => {})
          await speakText(latestMessageID, latestMessageText)
        }
      }

      if (event.type === "command.executed" && event.properties.name.startsWith("tts")) {
        if (promptState.skipCommandExecuted) {
          promptState.skipCommandExecuted = false
          appendLog("command: skipped duplicate tts toggle").catch(() => {})
          return
        }
        const name = event.properties.name.trim().toLowerCase()
        const argsFromName = name.startsWith("tts:") ? name.slice(4).trim() : ""
        const args = argsFromName || event.properties.arguments.trim().toLowerCase()
        promptState.lastToggleSource = "command.executed"
        promptState.lastToggleTime = Date.now()
        await applyTtsCommand(args)
      }
    },
  }
}
