# VideoDB Pair Programmer

Screen + audio recording with real-time indexing for Claude Code. You start a session and say **record**; we handle the rest.

## Getting started

1. Open a Claude Code session in this project.
2. Type **record** (or use `/record`).  
   First time you’ll be asked for your VideoDB API key; after that everything is automatic.
3. Use `/record` to start/stop, `/refresh-context` for screen + audio context, `/record-status` for status. Recorder starts with the session and stops when the session ends.

## How it works

- **Session start**: A hook runs in this project. If dependencies or config are missing, Claude prompts you to run `/record-config` (API key, then done). If setup is complete, the recorder app is started in the background.
- **Recorder**: Electron app captures screen, mic, and system audio; sends frames/audio to VideoDB for indexing; keeps a small buffer of recent context (screen descriptions, transcriptions) and exposes it over a local HTTP API and via a shared context file.
- **Claude**: Commands like `/record` and `/refresh-context` talk to the recorder over the local API. MCP resources read the same context so Claude can use “what’s on screen” and “what was said” in the conversation. On session end, a cleanup hook stops the recorder.

## Configuration

Config file: `.claude/skills/pair-programmer/config.json` (gitignored).

| Field | Required | Description |
|-------|----------|-------------|
| `setup` | yes | Set to `true` after first-time setup |
| `videodb_api_key` | yes | VideoDB API key (starts with `sk-`) |
| `videodb_backend_url` | no | API base URL (default: `https://api.videodb.io`) |
| `webhook_url` | no | Webhook URL; leave `""` for auto-tunnel |
| `recorder_port` | no | HTTP API port (default: `8899`) |
| `context_buffer_size` | no | Max context items kept (default: `50`) |
| `assistant_shortcut` | no | Global shortcut, e.g. `CommandOrControl+Shift+A` |

**Indexing (advanced):** `visual_index`, `system_audio_index`, `mic_index` — each can set `enabled`, `prompt`, and batching (`batch_time`/`batch_type`, `batch_value`). Defaults are applied if omitted; you can override at runtime via `/record --config '...'`.

**Env overrides:** `CONFIG_PATH`, `VIDEO_DB_API_KEY`, `RECORDER_PORT` override config file values.
