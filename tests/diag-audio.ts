/**
 * Diagnostic script to test different audio players on Linux.
 * Helps identify why the first part of the audio was cut off.
 */

import { join } from "path"
import { tmpdir } from "os"

async function testPlayers() {
  const httpUrl = "http://localhost:8880"
  const text = "Hello! This is a test of the Pulse Audio player versus the FF-play player. We are checking for cut-offs."
  
  console.log(`--- Audio Player Diagnostic ---`)
  console.log(`Requesting synthesis for: "${text}"`)

  try {
    const response = await fetch(`${httpUrl}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "kokoro",
        voice: "af_heart",
        input: text,
        speed: 1.0,
        response_format: "wav",
      }),
    })

    if (!response.ok) {
      console.error("Failed to synthesize audio")
      return
    }

    const buffer = await response.arrayBuffer()
    const filePath = join(tmpdir(), `diag-test.wav`)
    await Bun.write(filePath, new Uint8Array(buffer))
    console.log(`Audio saved to ${filePath}`)

    const players = [
      { name: "paplay", cmd: ["paplay", filePath] },
      { name: "mpv", cmd: ["mpv", "--no-video", "--no-terminal", filePath] },
      { name: "ffplay", cmd: ["ffplay", "-autoexit", "-nodisp", "-loglevel", "quiet", filePath] },
    ]

    for (const player of players) {
      console.log(`\nTesting ${player.name}...`)
      try {
        const proc = Bun.spawn(player.cmd)
        const code = await proc.exited
        console.log(`${player.name} exited with code ${code}`)
        await new Promise(r => setTimeout(r, 1000)) // Gap between tests
      } catch (e: any) {
        console.log(`${player.name} failed to start: ${e.message}`)
      }
    }
  } catch (e: any) {
    console.error("Diagnostic error:", e.message)
  }

  console.log("\nDiagnostic complete. Which player sounded best and had no cut-offs?")
}

testPlayers()
