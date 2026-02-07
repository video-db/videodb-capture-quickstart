---
description: Check recording status via the recorder HTTP API
---

Get current recording status from the server.

**Port:** Read `recorder_port` from `.claude/skills/pair-programmer/config.json` (default 8899).

```bash
curl -s http://127.0.0.1:PORT/api/status
```

Response (JSON): `recording` (bool), `sessionId`, `duration`, `bufferCounts` (screen, mic, system_audio), **rtstreams** (array of `{ rtstream_id, name, channel_id }`). Use `rtstream_id` with `POST /api/rtstream/search` to search indexed content.

If the request fails (e.g. connection refused), report that the recorder is not running and suggest running `/record-config` or `bash .claude/hooks/start-recorder.sh`.

Report concisely: e.g. "Recording active for Xs with Y context items" or "Not recording. X items in buffer from last session." Mention available rtstream IDs when present so the assistant can search the past if the user asks.
