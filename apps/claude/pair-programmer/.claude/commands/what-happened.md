---
description: Summarize recent activity from recorder context API
---

Use the recorder HTTP API to get context and summarize recent activity.

**Port:** From `.claude/skills/pair-programmer/config.json` → `recorder_port` (default 8899).

```bash
curl -s http://127.0.0.1:PORT/api/context/all
```

Response includes `screen`, `mic`, `system_audio` (arrays of `{ timestamp, text }`). Analyze and provide:

1. **Timeline** — What happened in order
2. **Key actions** — Important things the user did
3. **Current state** — What’s happening now
4. **Notable items** — Errors, decisions, or important details

Keep the summary concise and actionable.
