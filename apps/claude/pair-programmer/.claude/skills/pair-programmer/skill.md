# VideoDB Pair Programmer – HTTP API

AI pair programming with real-time screen and audio context. Control everything via the **recorder HTTP API** (no MCP). Port is in `.claude/skills/pair-programmer/config.json` as `recorder_port` (default **8899**).

**Base URL:** `http://127.0.0.1:PORT` (replace PORT with config value).

---

## On Session Start

When a new session starts and the user hasn’t requested anything specific, run `/record-config` to verify setup and start the recorder if needed.

---

## Lifecycle

- **Session Start:** If config is complete, starts the recorder; if deps missing, prompts to run `/record-config` (npm install runs on demand there).
- **Session End:** Stops the recorder app.
- **After `/record-config`:** Installs deps if needed, runs `start-recorder.sh` to start the app.

---

## HTTP API Reference

All requests: `Content-Type: application/json` for POST. Port from config (`recorder_port`, default 8899).

| Method | Path | Description | Params / Body |
|--------|------|-------------|---------------|
| GET | `/` or `/api` | List endpoints and curl examples | — |
| GET | `/api/status` | Recording status, sessionId, duration, bufferCounts, **rtstreams** | — |
| POST | `/api/record/start` | Start recording (opens picker if no channels) | Optional: `{ "indexing_config": { "visual": { "prompt": "..." }, "mic": { "enabled": true }, "system_audio": { ... } } }` |
| POST | `/api/record/stop` | Stop recording | — |
| GET | `/api/context/:type` | Recent context (screen / mic / system_audio / all) | type = `screen` \| `mic` \| `system_audio` \| `all` |
| POST | `/api/overlay/show` | Show overlay (text or loading) | `{ "text": "Message" }` or `{ "loading": true }` |
| POST | `/api/overlay/hide` | Hide overlay | — |
| POST | `/api/rtstream/search` | Search indexed content in a stream | `{ "rtstream_id": "<id from status>", "query": "keywords" }` |

**Status response** includes `rtstreams`: array of `{ rtstream_id, name, channel_id }`. Use `rtstream_id` in `POST /api/rtstream/search` for semantic search. Use keyword-rich queries.

**Context** is the last N items (screen, mic, system_audio). `/api/context/all` returns all three combined.

---

## Commands (slash commands)

| Command | Description |
|---------|-------------|
| `/record` | Start or stop recording (uses API) |
| `/record-status` | Recording status (GET /api/status) |
| `/refresh-context` | Get all context (GET /api/context/all) |
| `/what-happened` | Summarize recent activity from context |
| `/record-config` | Configure API key and settings |
| `/trigger` | Shortcut: analyze context and show result in overlay (POST overlay/show with message) |

See `.claude/commands/<name>.md` for how each command calls the server (params and curl examples).

---

## First-time setup

Run `/record-config`: set VideoDB API key, then start recorder via `bash .claude/hooks/start-recorder.sh`.

---

## Files

```
<project root>/
├── package.json
└── .claude/
    ├── hooks/
    │   ├── ensure-recorder.sh   # SessionStart: deps + start recorder
    │   ├── start-recorder.sh    # Manual start after /record-config
    │   └── cleanup-recorder.sh  # SessionEnd: stop recorder
    ├── settings.json
    ├── commands/                # Slash command definitions (use API)
    └── skills/pair-programmer/
        ├── config.json         # recorder_port, API key, indexing
        ├── recorder-app.js     # Electron app + HTTP API server
        └── ui/
```

Config: `.claude/skills/pair-programmer/config.json` — `recorder_port` (default 8899), `videodb_api_key`, and optional indexing/context settings.
