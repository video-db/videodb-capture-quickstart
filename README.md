# VideoDB Capture

**Real-time perception for AI agents.**

Give your AI agent eyes and ears. Capture screen, mic, and system audio from any desktop — and receive structured, AI-ready events in under 2 seconds.

## What You Get

Your backend receives events like these in real-time:

```json
{"type": "transcript", "text": "Let's schedule the meeting for Thursday", "is_final": true}
{"type": "index", "index_type": "visual", "text": "User is viewing a Slack conversation..."}
{"type": "index", "index_type": "audio", "text": "Discussion about scheduling a team meeting"}
```

Build screen-aware agents, live meeting copilots, and in-call assistants.

## Installation

```bash
# Node.js
npm install videodb

# Python
pip install "videodb[capture]"
```

## Prerequisites

1.  **Get an API Key**: Sign up at [console.videodb.io](https://console.videodb.io).
2.  **Set Environment Variable**: `export VIDEO_DB_API_KEY=your_api_key`

## Core Concepts

- **Backend**: Creating sessions & Minting tokens (Secure).
- **Desktop Client**: Capturing & Streaming media (Client-side).
- **Control Plane**: Webhooks for durable session lifecycle events.
- **Realtime Plane**: WebSockets for live transcripts & UI.

## Quickstart

The SDK works in a 3-step loop:
1.  **Backend**: Auth & Session Management.
2.  **Desktop**: Media Capture (Client).
3.  **Backend**: Intelligence (Webhook/Event).

### Backend: Create Session

#### Node.js
```javascript
import { connect } from 'videodb';
const conn = connect();

// 1. Create session (receive webhooks here)
const cap = await conn.createCaptureSession({
  endUserId: "user_abc",
  callbackUrl: "https://your-backend.com/webhooks/videodb"
});

// 2. Generate token for desktop client
const token = await conn.generateClientToken(600);
console.log({ sessionId: cap.id, token });
```

#### Python
```python
import videodb
conn = videodb.connect()

# 1. Create session (receive webhooks here)
cap = conn.create_capture_session(
    end_user_id="user_abc",
    callback_url="https://your-backend.com/webhooks/videodb"
)

# 2. Generate token for desktop client
token = conn.generate_client_token(expires_in=600)
print(f"Session: {cap.id}, Token: {token}")
```

### 2. Desktop: Start Capture

The desktop client uses the token to stream media. It never sees your API key.

#### Node.js
```javascript
import { CaptureClient } from 'videodb/capture';

const client = new CaptureClient({ sessionToken: "<TOKEN>" });

await client.requestPermission('microphone');
await client.requestPermission('screen-capture');

// Discover default channels
const channels = await client.listChannels();
const mic = channels.find(c => c.channelId === 'mic:default');
const display = channels.find(c => c.type === 'video');

// Start capture
await client.startCaptureSession({
  sessionId: "<SESSION_ID>",
  channels: [mic, display]
});
```

#### Python
```python
import asyncio
from videodb.capture import CaptureClient

async def main():
    client = CaptureClient(client_token="<TOKEN>")
    
    await client.request_permission("microphone")
    await client.request_permission("screen_capture")
    
    # Discover available sources
    channels = await client.channels()
    
    # Start capture (using default mic and primary display)
    await client.start_capture_session(
        capture_session_id="<SESSION_ID>",
        channels=[channels.mics.default, channels.displays.primary],
        primary_video_channel_id=channels.displays.primary.name
    )
    
asyncio.run(main())
```

### 3. Backend: Process & Consume

#### A. Trigger AI (Webhook)
VideoDB sends webhooks when the session is active. Use this to start AI pipelines.

#### Node.js
```javascript
// Webhook: Start AI on active streams
if (payload.event === "capture_session.active") {
  const cap = await conn.getCaptureSession(payload.capture_session_id);
  
  // Start transcription on mic
  const mic = cap.getRtstream("mics")[0];
  await mic.startTranscript();
  await mic.indexAudio({ prompt: "Extract action items" });
  
  // Start visual indexing on screen
  const screen = cap.getRtstream("displays")[0];
  await screen.indexVisuals({ prompt: "Describe screen activity" });
}
```

#### Python
```python
# Webhook: Start AI on active streams
if payload["event"] == "capture_session.active":
    cap = conn.get_capture_session(payload["capture_session_id"])
    
    # Start transcription on mic
    if mics := cap.get_rtstream("mics"):
        mics[0].start_transcript()
        mics[0].index_audio(prompt="Extract action items")
        
    # Start visual indexing on screen
    if displays := cap.get_rtstream("displays"):
        displays[0].index_visuals(prompt="Describe screen activity")
```

#### B. Stream Results (WebSocket)
Connect via WebSocket to receive real-time transcripts and insights.

#### Node.js
```javascript
const ws = await conn.connectWebsocket();
await ws.connect();

// Receive live events
for await (const ev of ws.receive()) {
  if (ev.channel === "transcript") {
    console.log(`Live info: ${ev.data.text}`);
  }
}
```

#### Python
```python
ws = conn.connect_websocket()
await ws.connect()

# Receive live events
async for ev in ws.stream():
    if ev["channel"] == "transcript":
        print(f"Live info: {ev['data']['text']}")
```

### 4. Access Assets

When capture stops, VideoDB automatically exports a playable video.

#### Node.js
```javascript
// Webhook: Receive the final asset
if (payload.event === "capture_session.exported") {
  const videoId = payload.data.exported_video_id;
  console.log(`Recording ready: ${videoId}`);
  
  // Generate a playback stream or download URL
  const stream = await conn.generateStream(videoId);
  console.log(`Watch here: ${stream}`);
}
```

#### Python
```python
# Webhook: Receive the final asset
if payload["event"] == "capture_session.exported":
    video_id = payload["data"]["exported_video_id"]
    print(f"Recording ready: {video_id}")
    
    # Generate a playback stream or download URL
    stream = conn.generate_stream(video_id)
    print(f"Watch here: {stream}")
```

## Community

- **Support**: [VideoDB Docs](https://docs.videodb.io)
- **Issues**: [GitHub Issues](https://github.com/video-db/videodb-capture-quickstart/issues)
- **Discord**: [Join our community](https://discord.gg/videodb)



Full example applications (Electron, React, Python) are coming soon to the `apps/` directory.
