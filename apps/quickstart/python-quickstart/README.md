# Python Capture Quickstart

A complete example showing real-time media capture, indexing, and transcription.

## Overview
This app consists of two parts running locally:
1.  **Backend (`backend.py`)**: Creates capture sessions, receives webhooks, and runs AI pipelines.
2.  **Client (`client.py`)**: Captures screen and audio, streaming it to VideoDB.

## Prerequisites

1.  **Python 3.8+**
2.  **uv** (Optional but recommended): For fast package management. [Install uv](https://docs.astral.sh/uv/getting-started/installation/).
3.  **VideoDB API Key**: Get one from [console.videodb.io](https://console.videodb.io).

## Setup

1.  **Create and Activate Virtual Environment**:
    ```bash
    # Using uv (Recommended)
    uv venv
    source .venv/bin/activate

    # OR using standard venv
    python -m venv .venv
    source .venv/bin/activate  # On Windows: .venv\Scripts\activate
    ```

2.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt

    # OR using uv
    uv pip install -r requirements.txt
    ```

3.  **Configure Environment**:
    Copy `.env.example` to `.env` and add your API key:
    ```bash
    cp .env.example .env
    # Edit .env and set VIDEO_DB_API_KEY
    ```

## Running the App

### Step 1: Start the Backend
The backend connects to VideoDB and starts a **Cloudflare Tunnel** for webhooks.

```bash
python backend.py
```
*Wait for the "Cloudflare Tunnel Started" message. The `cloudflared` binary will be downloaded automatically on the first run.*

### Step 2: Start the Client
Open a new terminal and run the client.

```bash
python client.py
```

### Step 3: Watch the Magic
1.  The client will ask for permissions (Screen/Mic).
2.  It will start streaming media.
3.  Switch to the **Backend Terminal** to see real-time transcripts and indexing events flowing in!

## What's Happening?

- `client.py` captures media and sends it to VideoDB.
- VideoDB processes the stream and sends webhooks to your `backend.py`.
- `backend.py` receives the `capture_session.active` webhook and starts **transcription** and **audio indexing** on both audio streams (mic + system audio), and **visual indexing** on the display stream.
- Real-time results are printed to the console via WebSocket.

## Expected Output

### Backend Terminal
```
Connecting to VideoDB...
Starting Cloudflare Tunnel on port 5002...
Cloudflare Tunnel Started: https://xxx.trycloudflare.com

[WEBHOOK] Event: capture_session.active
Capture Session Active! Starting AI pipelines...
Retrieved Session: session_id
  Mics: 1 | System Audio: 1 | Displays: 1
  Indexing system audio: stream_id
  System Audio indexing started (socket: ws_id)
  Indexing mic: stream_id
  Mic indexing started (socket: ws_id)
  Indexing display: stream_id
  Visual indexing started (socket: ws_id)

[SystemAudioWatcher] real-time transcription streams live...
[MicWatcher] real-time transcription streams live...

**************************************************
[SystemAudioWatcher] Audio Index: Summary of what is being discussed
**************************************************

**************************************************
[MicWatcher] Audio Index: Summary of what is being discussed
**************************************************

**************************************************
[VisualWatcher] Visual Index: One-sentence description of screen content
**************************************************
```

### Client Terminal
```
============================================================
VideoDB Capture Client - Python Quickstart
============================================================
Connecting to backend at http://localhost:5002...
Session created successfully
  Token: xxxxxxxxxx...
  Session ID: session_id

--- Starting Capture Client ---
Requesting Permissions...
Discovering Channels...

Starting Recording with 3 channel(s):
  - mic: channel_id
  - screen: channel_id
  - system_audio: channel_id

Recording... Press Enter to stop (or Ctrl+C to force quit).
```

## Stopping the Recording

Press **Enter** in the client terminal to stop recording gracefully. The client will send a stop signal and shut down cleanly.

Check the **backend terminal** for these webhook events:
- `capture_session.stopping` - Shutdown initiated
- `capture_session.stopped` - Session finalized
- `capture_session.exported` - Video ready (includes Video ID)

You can also press **Ctrl+C** to force quit. The server will detect the disconnect and clean up automatically.

## Troubleshooting

### Backend won't start
- **Error: `VIDEO_DB_API_KEY environment variable not set`**
  - Make sure you've created a `.env` file and set your API key

- **Cloudflare tunnel issues**
  - The `cloudflared` binary downloads automatically on first run
  - If it fails, check your internet connection and firewall settings

### Client won't connect
- **Error: `Cannot connect to backend`**
  - Make sure the backend is running first (`python backend.py`)
  - Check that both are using the same port (default: 5002)

### No AI results appearing
- Make sure you're generating audio or visual activity to be indexed
- Check that the WebSocket connections show "Connected!" messages
- Verify your VideoDB API key has the necessary permissions
