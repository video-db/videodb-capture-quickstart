<h1 align="center">OpenClaw Monitoring</h1>

<p align="center">
  CCTV for OpenClaw Agents — record every agent session, watch runs live, replay with a shareable link, and get alerts when something looks suspicious.
</p>

<p align="center">
  <a href="https://github.com/video-db/openclaw-monitoring">
    <img src="https://img.shields.io/badge/View%20Repository-OpenClaw%20Monitoring-blue?style=for-the-badge&logo=github" alt="View Repository">
  </a>
</p>

<p align="center">
  🚀 Head over to the repository to explore the complete code and get started!
</p>

---

## Demo

https://github.com/user-attachments/assets/ecd6c161-7cbd-4629-af7d-a8014e0b82f8

---

## The Problem

Right now, most people running AI agents are doing this:

```
Send task → Wait → Get "Success" in Slack → Hope for the best
```

That's not monitoring. That's faith.

When your agent runs on a remote server for hours, you have no idea what it's actually doing. Did it complete the task? Did it get stuck on a captcha? Did it wander somewhere it shouldn't?

You'd never know.

## The Solution

**VideoDB Monitoring** turns your OpenClaw agent into an observable, auditable worker.

Every run becomes:
- **A live stream** — watch your agent work in real-time
- **A replayable recording** — shareable URL, not a dead video file
- **Searchable moments** — find "when did it open the spreadsheet?"
- **Webhook alerts** — get notified when something looks off

Think: dashcam for your AI agent. Black box recorder for browser automation. CCTV for computer-use agents.

---

## What You Can Do

### The Fun Stuff

Ask your agent to do something, then watch it back:

- "Play chess on chess.com and send me the recording"
- "Create a Twitter account and show me how you did it"
- "Check all the GitHub repos and give me a video report"
- "Order food from Swiggy — I want to see the whole process"

Every session becomes a clip you can share.

### The Serious Stuff

- **Security** — catch agents going off-script or accessing unexpected domains
- **QA** — review agent workflows before pushing to production
- **Debugging** — replay failures to see exactly where things went wrong
- **Compliance** — full visual audit trail of agent actions
- **Dataset prep** — build computer-use training data from real sessions

### The Meta Stuff

Your agent can even use its own recordings:

- "Summarize what you did in the last 2 hours"
- "Make a highlight video of today's work and post it to YouTube"
- "Find the moment when you encountered the error"

The agent becomes a content creator with receipts.

---

## Quick Start

### Option 1: OpenClaw Skill (Recommended)

Add on-demand screen recording to your existing OpenClaw agent.

**1. Install the skill:**

Point your OpenClaw agent at this repo and ask it to install the skill:

```text
please install https://github.com/video-db/openclaw-monitoring/ skill and set it up
```

Or install it manually:

```bash
git clone https://github.com/video-db/openclaw-monitoring.git
mkdir -p ~/.openclaw/workspace/skills/videodb-monitoring
cp -r openclaw-monitoring/videodb-monitoring-skill/* ~/.openclaw/workspace/skills/videodb-monitoring/
cd ~/.openclaw/workspace/skills/videodb-monitoring
npm install
```

**2. Set your VideoDB API key:**

```bash
openclaw config set skills.entries.videodb-monitoring.env.VIDEODB_API_KEY 'sk-xxx'
```

Get your API key at [console.videodb.io](https://console.videodb.io).

**3. Start the monitor and restart OpenClaw:**

```bash
cd ~/.openclaw/workspace/skills/videodb-monitoring
nohup npx tsx monitor.ts > ~/.videodb/logs/monitor.log 2>&1 & disown
openclaw gateway restart
```

The monitor writes process information and capture IDs into `~/.openclaw/openclaw.json`.

This starts the monitor as a background process and restarts OpenClaw so the skill is available to the agent. When the agent uses the skill, it starts the VideoDB capture process. Ingestion is billed at `$0.084 / hour`. See the [Capture SDK overview](https://docs.videodb.io/pages/ingest/capture-sdks/overview) for more documentation.

**4. Use it:**

- "Do X on the browser and send me the recording"
- "What did I do in the last hour?"
- "Find when I opened the spreadsheet"

See [`videodb-monitoring-skill/README.md`](videodb-monitoring-skill/README.md) for details.

### Option 2: Indexing with VideoDB

After recording starts, OpenClaw can use VideoDB to index sessions, create alerts, and search important moments.

Example prompts:

```text
start visual indexing for the current session with the prompt: "Describe what is on screen, the active app, and what the agent is doing."
```

```text
set up a summary cron for this session that sends me a summary every 30 minutes
```

```text
search this session for when the agent opened the spreadsheet and share the results with timestamps
```

See the [Advanced Setup Guide](ADVANCE_SETUP_GUIDE.md) for setup details and SDK/code examples.

### Need to set up OpenClaw from scratch?

See the [Full Setup Guide](SETUP_GUIDE.md) for EC2 Mac provisioning and OpenClaw installation.

---

## Try It Without Any Setup

Skip the installation and try indexing against our hosted real-time OpenClaw session at [matrix.videodb.io](https://matrix.videodb.io):

```bash
echo "VIDEO_DB_API_KEY=your_api_key_here" > .env
uv run try_without_setup.py
```

This connects to the public agent's live streams, starts indexing, and prints events to your terminal. Press `Ctrl+C` to stop and search the indexed content.

---

See the [Advanced Setup Guide](ADVANCE_SETUP_GUIDE.md) for working with recordings, search, alerts, indexing, and SDK examples.
