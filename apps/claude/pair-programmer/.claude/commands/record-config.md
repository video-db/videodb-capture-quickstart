---
description: Configure VideoDB Pair Programmer API key and settings
---

Configure the VideoDB Pair Programmer settings.

## Steps

### 1. Check Current Configuration

Read the config file at `.claude/skills/pair-programmer/config.json` using the file read tool.

**Decision based on file contents:**

- **File doesn't exist** → Continue to step 2 (collect API key)
- **File exists but `setup: false` or no `videodb_api_key`** → Continue to step 2
- **File exists with `setup: true` and has API key** → Skip to step 4 (just start recorder)

### 2. Collect API Key

**IMPORTANT: Ask directly in chat, NOT via multiple-choice questions.**

Say: "Please paste your VideoDB API key (starts with sk-):"

**Wait for the user to respond with their API key before proceeding.**

### 3. Save Configuration

Create or update `.claude/skills/pair-programmer/config.json` with:
- Set `setup: true`
- Set `videodb_api_key` to the provided key
- Use defaults for other fields (see schema below)

### 4. Start Recorder

Run the start script:
```bash
bash .claude/hooks/start-recorder.sh
```

### 5. Confirm

Say: "Configuration complete. Recorder is running."

If it failed, show the error from the script output.

---

## Configuration Schema

Location: `.claude/skills/pair-programmer/config.json`

```json
{
  "setup": true,
  "videodb_api_key": "sk-xxx",
  "videodb_backend_url": "https://api.videodb.io",
  "webhook_url": "",
  "recorder_port": 8899,
  "context_buffer_size": 50,
  "assistant_shortcut": "CommandOrControl+Shift+A",

  "visual_index": {
    "enabled": true,
    "prompt": "Describe what is visible on the screen...",
    "batch_time": 10,
    "frame_count": 2
  },

  "system_audio_index": {
    "enabled": true,
    "prompt": "Summarize what is being said...",
    "batch_type": "sentence",
    "batch_value": 3
  },

  "mic_index": {
    "enabled": true,
    "prompt": "Transcribe the user's speech...",
    "batch_type": "sentence",
    "batch_value": 3
  }
}
```

### Required Settings

| Field | Description |
|-------|-------------|
| `setup` | Set to `true` after initial configuration |
| `videodb_api_key` | Your VideoDB API key |

### Optional Settings

| Field | Description | Default |
|-------|-------------|---------|
| `videodb_backend_url` | API endpoint | https://api.videodb.io |
| `webhook_url` | Webhook URL (empty = auto-tunnel) | "" |
| `recorder_port` | HTTP API port | 8899 |
| `context_buffer_size` | Max context items | 50 |
| `assistant_shortcut` | Global shortcut to trigger `/trigger` command | CommandOrControl+Shift+A |

### Indexing Settings (Advanced)

These can be customized but have sensible defaults. Override at runtime via `/record --config`.

---

## Important

- Never expose full API key - always mask it like `sk-***xyz`
- The recorder app starts/stops automatically with the session
- These are DEFAULT settings - can be overridden at runtime via `/record`
