# Node.js Capture Quickstart

A complete example showing real-time media capture, indexing, and transcription using the VideoDB Node.js SDK.

## Overview

This app runs as a single script that demonstrates the full VideoDB Capture workflow:
- Creates a capture session with WebSocket for real-time events
- Captures screen, mic, and system audio using the native capture client
- Performs live transcription and audio/visual indexing on all streams
- Prints real-time results to the console

## Prerequisites

1. **Node.js 18+**
2. **VideoDB API Key**: Get one from [console.videodb.io](https://console.videodb.io)

## Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   Copy `.env.example` to `.env` and add your API key:
   ```bash
   cp .env.example .env
   # Edit .env and set VIDEODB_API_KEY
   ```

## Running the App

```bash
npm start
```

The app will:
1. Connect to VideoDB and create a capture session
2. Request permissions for microphone and screen capture
3. Start recording mic, system audio, and screen
4. Start transcription and indexing on all streams
5. Print real-time results via WebSocket

**Press Ctrl+C to stop.**

## What's Happening?

- The script creates a capture session and generates a client token
- The native capture client discovers channels (mic, display, system audio)
- Channels with `record: true` save the recording to VideoDB after capture stops
- Once active, transcription and audio indexing start on both audio streams (mic + system audio)
- Visual indexing starts on the display stream
- Real-time results stream back via WebSocket

## Expected Output

```
============================================================
VideoDB Capture - Node.js Quickstart
============================================================

Connecting to VideoDB...
Using collection: c-xxx
Connecting WebSocket...
WebSocket connected: ws_id
Creating capture session...
Session created: cap-xxx
Client token generated

Requesting permissions...
Discovering channels...
  - mic:default (audio): Default Microphone
  - display:1 (video): Built-in Display
  - system_audio:default (audio): System Audio

Starting capture with 3 channel(s):
  - mic:default
  - display:1
  - system_audio:default
Capture started!

Waiting for session to become active...
Session status: active
  Starting audio indexing on: rts-xxx
  Audio indexing started: rts-xxx
  Starting audio indexing on: rts-yyy
  Audio indexing started: rts-yyy
  Starting visual indexing on: rts-zzz
  Visual indexing started: rts-zzz

============================================================
Recording... Press Ctrl+C to stop
============================================================

[Transcript:mic] real-time transcription streams live...
[Transcript:system_audio] real-time transcription streams live...

**************************************************
[Audio Index:mic] Summary of what is being discussed
**************************************************

**************************************************
[Audio Index:system_audio] Summary of what is being discussed
**************************************************

**************************************************
[Visual Index:screen] One-sentence description of screen content
**************************************************
```

## Stopping the Recording

Press **Enter** to stop recording gracefully, or **Ctrl+C** to force quit. The app will:
1. Stop the capture session
2. Shut down the native binary
3. Close the WebSocket connection

Wait a few seconds for the session to finalize. Once exported, you can view the video in the VideoDB console.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VIDEODB_API_KEY` | Yes | Your VideoDB API key from console.videodb.io |
| `VIDEODB_COLLECTION_ID` | No | Collection ID (defaults to `default`) |

## Troubleshooting

### API Key Issues
- **Error: `VIDEODB_API_KEY is required`**
  - Make sure you've created a `.env` file with your API key
  - Verify the API key is valid at [console.videodb.io](https://console.videodb.io)

### Permission Errors
- **Error: Permission request failed**
  - Grant system permissions for microphone and screen recording when prompted
  - On macOS: Check System Settings > Privacy & Security

### No Channels Available
- The native capture binary may not be running properly
- Try reinstalling: `npm install`

### No AI Results Appearing
- Make sure you're generating audio or visual activity to be indexed
- Verify the capture session status shows as "active"
- Check that the WebSocket connection was established successfully
