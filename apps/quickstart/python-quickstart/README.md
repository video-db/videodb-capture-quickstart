# Python Capture Quickstart

A complete example showing real-time media capture, indexing, and transcription.

## Overview
This app consists of two parts running locally:
1.  **Backend (`backend.py`)**: Creates capture sessions, acts as a webhook receiver, and runs AI pipelines.
2.  **Desktop Client (`client.py`)**: Captures screen and audio, streaming it to VideoDB.

## Prerequisites

1.  **Python 3.8+**
2.  **ngrok**: Installed and authenticated (for public webhook URL).
3.  **VideoDB API Key**: Get one from [console.videodb.io](https://console.videodb.io).

## Setup

1.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

2.  **Configure Environment**:
    Copy `.env.example` to `.env` and add your API key:
    ```bash
    cp .env.example .env
    # Edit .env and set VIDEO_DB_API_KEY
    ```

## Running the App

### Step 1: Start the Backend
The backend initializes the session and starts an `ngrok` tunnel for webhooks.

```bash
python backend.py
```
*Wait for the "✅ Ngrok Tunnel Started" message.*

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
- `backend.py` receives the `capture_session.active` webhook and starts **transcription** and **visual indexing** on the streams.
- Real-time results are printed to the console via WebSocket!
