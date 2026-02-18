# OpenClaw Monitoring with VideoDB Capture

This guide walks you through deploying a macOS EC2 instance on AWS, installing [OpenClaw](https://openclaw.ai) on it, and using [VideoDB Capture](https://videodb.io) to continuously monitor and record the agent's screen activity.

> Windows and Linux guides coming soon.

---

## Try It Without Any Setup

Want to skip the EC2 and OpenClaw installation? VideoDB hosts a live OpenClaw agent at `[matrix.videodb.io](https://matrix.videodb.io)` that you can monitor right away. Just add your `VIDEO_DB_API_KEY` to a `.env` file and run:

```bash
uv run try_without_setup.py
```

This connects directly to the hosted agent's RTSP streams (audio + screen), starts real-time transcription, audio/visual indexing, and alerts, and prints all events to your terminal. Press `Ctrl+C` to stop and interactively search the indexed content.

If you want to set up your own OpenClaw instance and monitor it 24/7, continue with the full guide below.

---

## Table of Contents

1. [EC2 Mac Setup](#1-ec2-mac-setup) — Provision and connect to a macOS instance on AWS
2. [OpenClaw Setup](#2-openclaw-setup) — Install and configure the OpenClaw agent
3. [VideoDB Monitoring](#3-videodb-monitoring) — Stream and record the agent's screen 24/7
4. [Working with Sessions and Streams](#4-working-with-sessions-and-streams) — Retrieve sessions, inspect streams, and start indexing

---

# 1. EC2 Mac Setup

## Allocate Dedicated Host

1. Set region to **us-east-1** (best Mac availability)
2. Go to `EC2 → Dedicated Hosts → Allocate Dedicated Host`
3. Set: Instance family **Mac**, Instance type **mac1**, AZ **us-east-1c**, Auto-placement **Off**
4. Click **Allocate** and wait for `State = available`

> Mac hosts have **24-hour minimum billing**.

## Launch Instance

Go to `EC2 → Instances → Launch Instance`:

* **Name**: e.g. `openclaw`
* **AMI**: macOS Sequoia (Intel / x86_64) — architecture must be `x86_64`, do NOT select `arm64` or `Apple Silicon`
* **Instance type**: `mac1.metal`
* **Key pair**: Create or select an RSA `.pem` key pair
* **Security group**: Allow TCP 22 from your IP only. Do NOT open port 5900 publicly.
* **Storage**: Default 100GB is fine
* **Tenancy**: Dedicated host → select your mac1 host ID → set affinity to **Host**

Click **Launch** and wait a few minutes.

## Assign Elastic IP

Go to `EC2 → Elastic IPs → Allocate Elastic IP address`, then associate it with your instance. This keeps the IP stable across stop/start cycles.

## Connect via SSH

```bash
chmod 400 key.pem
ssh -i key.pem ec2-user@<public-ip>
```

## Enable GUI and VNC

Set a password and enable remote desktop:

```bash
sudo passwd ec2-user
sudo /System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart \
  -activate -configure -access -on \
  -users ec2-user -privs -all \
  -restart -agent
```

Create an SSH tunnel from your laptop and connect:

```bash
ssh -i key.pem -L 5901:localhost:5900 ec2-user@<public-ip>
vncviewer -AlwaysCursor=1 localhost:5901
```

Login as `ec2-user` with the password you set.

## Disable Lock Screen and Password Requirement

To prevent the Mac from locking during unattended operation:

1. Open **System Settings → Lock Screen**
2. Set **"Start Screen Saver when inactive"** to **Never**
3. Set **"Turn display off when inactive"** to **Never**
4. Set **"Require password after screen saver begins or display is turned off"** to **Off**

---

# 2. OpenClaw Setup

Inside the macOS session (via VNC or SSH), install OpenClaw:

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

Alternatively, install via npm (requires Node 22+):

```bash
npm i -g openclaw
openclaw onboard
```

### Follow the Interactive Setup

1. Confirm and select **QuickStart** onboarding mode
2. Choose a model provider (Anthropic, OpenAI, local models, etc.) and enter your API key
3. Select a default model

### Connect a Communication Channel

OpenClaw supports 50+ channels including WhatsApp, Telegram, Discord, Slack, Signal, iMessage, and more. Choose whichever you prefer.

For example, to set up **Telegram**:

1. Open Telegram, message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`, follow the prompts, copy the bot token
3. Paste it into the OpenClaw setup when prompted

### Complete Installation

- Skip skills and hooks for now
- Gateway service is installed as a LaunchAgent at `~/Library/LaunchAgents/ai.openclaw.gateway.plist`
- Logs at `~/.openclaw/logs/gateway.log`

### Access the Control UI

Create an SSH tunnel from your laptop:

```bash
ssh -i key.pem -N -L 18789:127.0.0.1:18789 ec2-user@<public-ip>
```

Then open `http://localhost:18789/` in your browser. Retrieve the gateway token with:

```bash
openclaw config get gateway.auth.token
```

---

# 3. VideoDB Monitoring

## Start the Backend (on your local machine)

The backend runs on your local machine (or any server). It is responsible for:

- **Session management** — creates VideoDB capture sessions and generates client tokens
- **Webhook handling** — receives lifecycle events from VideoDB (session active, stopping, stopped, exported)
- **AI pipelines** — when a session becomes active, automatically starts audio indexing, visual indexing, and transcription on the captured streams
- **Alerts** — sets up OpenClaw-specific alerts (e.g. agent errors, agent idle) that trigger when matching conditions are detected on screen
- **Cloudflare tunnel** — exposes the backend via a public URL so the remote Mac client and VideoDB webhooks can reach it

### Setup

1. Clone the quickstart repo and go to the `openclaw-monitoring` directory
2. Create a `.env` file with your VideoDB API key:

```bash
echo "VIDEO_DB_API_KEY=your_api_key_here" > .env
```

3. Start the backend:

```bash
uv run backend.py
```

The backend will start a Cloudflare tunnel and print the public URL. Copy this URL — you'll need it for the client.

### Customizing Alerts

The backend comes with two default alerts defined in the `ALERTS` list in `backend.py`:

- **`agent-error`** — triggers when the screen shows an error dialog, crash report, or exception traceback
- **`browser-open`** — triggers when a web browser window is visible on screen

You can add your own alerts by appending to the `ALERTS` list:

```python
ALERTS = [
    # ... existing alerts ...
    {
        "label": "browser-open",
        "prompt": "A web browser window is open and visible on screen.",
    },
]
```

Each alert needs a `label` (identifier) and a `prompt` (natural language description of the condition to detect). Alerts are attached to the visual index and fire in real-time via WebSocket when the condition is detected.

## Start the Client (on the Mac EC2 instance)

**This must be run from the VNC session** (not SSH), as macOS requires a GUI context to grant screen capture permission.

1. Install dependencies on the Mac instance:

```bash
brew install uv
```

2. Clone the quickstart repo and go to the `openclaw-monitoring` directory

3. Start the client:

```bash
uv run start_monitoring.py
```

4. When prompted, enter the backend URL (the Cloudflare tunnel URL from the backend). Press Enter to use the default (`http://localhost:5002`) if the backend is running on the same machine.

5. Grant screen capture permission when the macOS dialog appears.

The client will stream screen + system audio 24/7 to VideoDB with `caffeinate` keeping the Mac awake. Press `Ctrl+C` to stop.

---

# 4. Working with Sessions and Streams

Once a capture session is running, you can retrieve it by ID and interact with its streams using the VideoDB Python SDK.

## Get a Capture Session

```python
import videodb

conn = videodb.connect(api_key="your_api_key")
session = conn.get_capture_session("your_capture_session_id")
print(f"Session: {session.id}")
```

The `capture_session_id` is printed by the client when it starts, and also available in the backend logs.

## Get RTStreams from a Session

```python
displays = session.get_rtstream("screen")
system_audios = session.get_rtstream("system_audio")

print(f"Displays: {len(displays)} | System Audio: {len(system_audios)}")

if displays:
    print(f"  Screen stream: {displays[0].id} (status={displays[0].status})")
if system_audios:
    print(f"  Audio stream: {system_audios[0].id} (status={system_audios[0].status})")
```

## Start Indexing on Streams

You can start AI indexing on any active stream at any time. First, set up a WebSocket connection to receive real-time results:

```python
ws = conn.connect_websocket()
ws = await ws.connect()
```

### Audio Indexing

```python
sys_audio = system_audios[0]

# Start live transcription
sys_audio.start_transcript(ws_connection_id=ws.connection_id)

# Start audio indexing with a custom prompt
sys_audio.index_audio(
    prompt="Summarize the audio content.",
    batch_config={"type": "time", "value": 30},
    ws_connection_id=ws.connection_id,
)
```

### Visual Indexing

```python
display = displays[0]

visual_index = display.index_visuals(
    prompt="In one sentence, describe the active application and what the agent is doing on screen.",
    batch_config={"type": "time", "value": 5, "frame_count": 1},
    ws_connection_id=ws.connection_id,
)
```

## Create Alerts

Alerts let you detect specific conditions on screen in real-time. First, create an event that describes what to watch for, then attach it to a visual index:

```python
# Create an event (reuse if one with the same label already exists)
event_id = conn.create_event(
    event_prompt="The agent is displaying an error or crash dialog on screen.",
    label="agent-error",
)

# Attach the alert to a visual index
visual_index = display.index_visuals(
    prompt="Describe what is on screen.",
    ws_connection_id=ws.connection_id,
)
alert_id = visual_index.create_alert(
    event_id=event_id,
    callback_url="https://your-webhook-url/webhook",
    ws_connection_id=ws.connection_id,
)
```

When the condition is detected, you'll receive an alert event on the WebSocket with the label, confidence score, and context.

## Search Indexed Content

Once indexing is running, you can search across what has been indexed using natural language:

```python
results = display.search(query="agent encountered an error", result_threshold=5)
shots = results.get_shots()

for shot in shots:
    print(f"[{shot.start:.0f}s - {shot.end:.0f}s] {shot.text}")
```

## Listen for Real-Time Events

```python
async for msg in ws.receive():
    channel = msg.get("channel")
    data = msg.get("data", {})

    if channel == "transcript":
        print(f"Transcript: {data.get('text')}")
    elif channel == "audio_index":
        print(f"Audio Index: {data.get('text')}")
    elif channel in ("scene_index", "visual_index"):
        print(f"Visual Index: {data.get('text')}")
    elif channel == "alert":
        print(f"Alert [{data.get('label')}]: confidence={data.get('confidence')} {data.get('text')}")
```

