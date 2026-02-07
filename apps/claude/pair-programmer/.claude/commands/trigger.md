---
description: Shortcut-triggered: analyze context and show result in overlay
---

The user triggered the assistant shortcut; show a loading overlay, then respond via the overlay.

**You must show every result to the user via the overlay.** Call the server to show your message; otherwise the user sees nothing.

**Port:** From `.claude/skills/pair-programmer/config.json` → `recorder_port` (default 8899). Base: `http://127.0.0.1:PORT`.

1. **Get context** (Bash or HTTP):
   - Screen: `curl -s http://127.0.0.1:PORT/api/context/screen`
   - Mic: `curl -s http://127.0.0.1:PORT/api/context/mic`
   - System audio: `curl -s http://127.0.0.1:PORT/api/context/system_audio`
   - Or all: `curl -s http://127.0.0.1:PORT/api/context/all`

2. **Search past content (optional):** Get `rtstream_id` from `curl -s http://127.0.0.1:PORT/api/status` (field `rtstreams`). Then:
   `curl -s -X POST http://127.0.0.1:PORT/api/rtstream/search -H "Content-Type: application/json" -d '{"rtstream_id":"<id>","query":"keyword1 keyword2"}'`
   Use keyword-rich queries for better results.

3. **Show your reply in the overlay:**
   `curl -s -X POST http://127.0.0.1:PORT/api/overlay/show -H "Content-Type: application/json" -d '{"text":"Your message here"}'`

Be concise and actionable. If the user asked a question or seems stuck, address it and always call the overlay API with your final (or interim) message.
