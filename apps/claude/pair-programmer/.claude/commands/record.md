---
description: Start or stop screen/audio recording with optional runtime config
---

Control recording via the recorder HTTP API.

## Step 1: Check if Ready

Read `.claude/skills/pair-programmer/config.json` using the file read tool. Check:
- `setup` is `true`
- `videodb_api_key` exists
- `recorder_port` (default: 8899)

Then check if the recorder is running on that port:

```bash
lsof -i :$PORT >/dev/null 2>&1 && echo "RUNNING" || echo "NOT_RUNNING"
```

**Decision:**
- **Config exists with `setup: true` AND recorder is RUNNING** → Skip to Step 2 immediately
- **Config missing or `setup: false`** → Run `/record-config`, then continue to Step 2
- **Config OK but recorder NOT_RUNNING** → Run `bash .claude/hooks/start-recorder.sh`, then continue to Step 2

## Step 2: Start or Stop Recording

Use the recorder HTTP API (base URL `http://127.0.0.1:PORT`, PORT from config).

- **Start:** `curl -s -X POST http://127.0.0.1:PORT/api/record/start -H "Content-Type: application/json" -d '{}'`  
  Optional body for runtime indexing override: `{ "indexing_config": { "visual": { "prompt": "..." }, ... } }`
- **Stop:** `curl -s -X POST http://127.0.0.1:PORT/api/record/stop -H "Content-Type: application/json"`

---

## Runtime Config Override

For start only, you can pass `indexing_config` in the JSON body to override indexing for this session. Only include fields you want to override; others use config defaults. See skill.md for full API reference.

---

## User Intent → API

| User says | Action |
|-----------|--------|
| "start recording" | POST /api/record/start with `{}` |
| "record with focus on code" | POST /api/record/start with `{"indexing_config":{"visual":{"prompt":"Focus on code"}}}` |
| "stop recording" | POST /api/record/stop |

---

## Response

- **Start success:** Confirm recording started, mention what's being captured
- **Stop success:** Report duration from response
- **Error:** Show error from the API JSON response
