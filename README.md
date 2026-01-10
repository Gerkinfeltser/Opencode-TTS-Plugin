# OpenCode TTS Reader

Read assistant messages aloud when OpenCode sessions go idle using [Kokoro TTS](https://huggingface.co/hexgrad/Kokoro-82M) - a lightweight, high-quality neural text-to-speech model.

## Features

- 🔊 **Automatic TTS** - Speaks assistant responses when sessions complete
- 🧠 **Dual Backend** - Local CPU (kokoro-js) or HTTP GPU (Kokoro-FastAPI)
- 🚀 **GPU Acceleration** - Optional GPU support via Docker container
- 🖥️ **Cross-platform** - Works on Linux, macOS, and Windows
- 🎙️ **Multiple Voices** - 11 natural-sounding voices available

## Quick Start

### Local CPU Mode (Default)

Add to your `opencode.json`:

```json
{
  "plugin": ["opencode-tts-reader"]
}
```

On first use, the plugin downloads the Kokoro TTS model (~87MB). You'll see a toast notification when ready.

### GPU Mode (Faster)

1. Start the Kokoro-FastAPI server with GPU:

```bash
# NVIDIA GPU (CUDA)
docker run -d --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest

# CPU fallback (no GPU)
docker run -d -p 8880:8880 ghcr.io/remsky/kokoro-fastapi:latest
```

2. Configure the plugin to use HTTP backend by editing `src/types.ts`:

```typescript
export const DEFAULT_CONFIG: TtsConfig = {
  backend: "http", // Use GPU server
  httpUrl: "http://localhost:8880",
  // ... rest of config
}
```

## Requirements

### Audio Player

The plugin needs an audio player to play the generated speech:

- **Linux**: `paplay` (PulseAudio), `aplay` (ALSA), or `mpv`
- **macOS**: `afplay` (built-in)
- **Windows**: PowerShell (built-in)

### For HTTP/GPU Mode

- Docker with NVIDIA GPU support (nvidia-docker2)
- Or any machine running Kokoro-FastAPI (can be remote)

## Configuration

Edit `src/types.ts` to customize:

```typescript
export const DEFAULT_CONFIG: TtsConfig = {
  // Backend selection
  backend: "local", // "local" (CPU) or "http" (GPU server)
  httpUrl: "http://localhost:8880", // Kokoro-FastAPI server URL
  httpFormat: "wav", // Response format: "wav", "mp3", or "pcm"

  // When to speak
  speakOn: "message", // "message" (each response) or "idle" (only on session idle)

  // Voice settings
  voice: "af_heart", // Voice to use (see table below)
  speed: 1.0, // Playback speed (0.5 - 2.0)

  // General
  enabled: true, // Enable/disable TTS
  maxWorkers: 0, // Max local CPU workers (0 disables workers)
}
```

## Available Voices

| Voice         | Description            |
| ------------- | ---------------------- |
| `af_heart`    | Female, warm (default) |
| `af_bella`    | Female, clear          |
| `af_nicole`   | Female, professional   |
| `af_sarah`    | Female, friendly       |
| `af_sky`      | Female, bright         |
| `am_adam`     | Male, neutral          |
| `am_michael`  | Male, deep             |
| `bf_emma`     | British female         |
| `bf_isabella` | British female         |
| `bm_george`   | British male           |
| `bm_lewis`    | British male           |

## Speak Modes

| Mode      | Behavior                                                    |
| --------- | ----------------------------------------------------------- |
| `message` | Speaks each assistant message as it completes (default)     |
| `idle`    | Speaks only the final message when the session becomes idle |

**Use `message`** for real-time feedback on every response.
**Use `idle`** for less frequent speech, only after the assistant finishes all work.

## Backend Comparison

| Feature         | Local (CPU)     | HTTP (GPU)              |
| --------------- | --------------- | ----------------------- |
| Setup           | Auto-download   | Docker container        |
| Speed           | ~2-3x realtime  | ~10-20x realtime        |
| Memory          | ~500MB RAM      | GPU VRAM                |
| Dependencies    | None (bundled)  | Docker + NVIDIA drivers |
| Network         | Offline capable | Requires HTTP access    |
| First-run delay | ~30s download   | Container startup       |

## How It Works

1. Plugin tracks the latest assistant message text via `message.part.updated` events
2. Depending on `speakOn` mode:
   - **message**: Speaks when `message.updated` fires with a completed assistant message
   - **idle**: Speaks when `session.idle` fires
3. Audio is played through your system's audio player
4. Text is cleaned (code blocks replaced with "code block", markdown stripped)

## Troubleshooting

### HTTP backend not connecting

```bash
# Check if server is running
curl http://localhost:8880/v1/models

# View container logs
docker logs $(docker ps -q --filter ancestor=ghcr.io/remsky/kokoro-fastapi-gpu)
```

### No audio playback on Linux

```bash
# Install PulseAudio player
sudo apt install pulseaudio-utils

# Or ALSA
sudo apt install alsa-utils

# Or mpv
sudo apt install mpv
```

### Local backend fails to load

```bash
# Reinstall dependencies
cd .opencode/plugin/tts-reader
bun install
```

## License

MIT
