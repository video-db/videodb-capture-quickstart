---
description: Get all context (screen + audio) from the recorder HTTP API
---

Use the recorder API to get combined context (screen, mic, system_audio).

**Port:** From `.claude/skills/pair-programmer/config.json` → `recorder_port` (default 8899).

```bash
curl -s http://127.0.0.1:PORT/api/context/all
```

Response: JSON with `screen`, `mic`, `system_audio` arrays (each item has `timestamp`, `text`).

## Flow

1. **Get context** — Call the API above (or use Bash/Read to run curl).
2. **Summarize** — Condense screen, mic, and system audio into a short summary.
3. **Timeline** — Build a timestamped timeline and store in memory as the updated view of what happened.

## Timeline format

Output a **timestamped timeline** (e.g. `11:00 - 11:05  Activity description`). Keep entries connected and avoid repeating the same details. Use moderate time ranges (not very short or overly long).
