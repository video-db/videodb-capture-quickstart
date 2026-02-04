# Sales Copilot

An Electron app demonstrating **VideoDB Capture SDK** integration for meeting recording with real-time transcription.

## Features

- **Screen & Audio Recording** - Captures screen, microphone, and system audio
- **Real-time Transcription** - Live transcription via WebSocket connections
- **Recording History** - Browse past recordings with AI-generated insights
- **Live Preview** - Low-latency video preview using RTSP relay

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Frontend                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   UI/UX     │  │  Capture    │  │  WebSocket Client   │  │
│  │  (HTML/JS)  │  │  Client SDK │  │  (Transcription)    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   FastAPI Backend                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Auth &    │  │  Cloudflare │  │  Webhook Handler    │  │
│  │   Tokens    │  │   Tunnel    │  │  (capture_session)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      VideoDB Cloud                           │
│         Storage • Streaming • Transcription • AI            │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Setup

```bash
cd apps/electron/sales-copilot
./scripts/setup.sh --api-key YOUR_VIDEODB_API_KEY
```

### 2. Run

```bash
npm start
```

This starts both the Python backend (with Cloudflare tunnel) and the Electron app.

## Project Structure

```
sales-copilot/
├── frontend/           # Electron app
│   ├── main.js         # Main process (IPC, Capture SDK)
│   ├── renderer.js     # Renderer process (UI logic)
│   ├── preload.js      # Context bridge APIs
│   └── src/
│       ├── ui/         # UI modules (sidebar, wizard, history)
│       └── styles/     # CSS modules
├── server/             # FastAPI backend
│   └── app/
│       ├── api/        # Routes & webhook handler
│       ├── core/       # Config & tunnel manager
│       ├── db/         # SQLite models
│       └── services/   # VideoDB integration
└── scripts/
    ├── setup.sh        # One-time setup
    └── start-server.sh # Start backend
```

## How It Works

1. **Setup**: `setup.sh` saves your API key and installs dependencies
2. **Start**: `npm start` launches the backend, starts Cloudflare tunnel, writes `runtime.json`
3. **Connect**: Electron reads `runtime.json` to discover the backend URL
4. **Record**: Capture SDK streams media to VideoDB
5. **Webhook**: `capture_session.exported` event triggers recording save
6. **Insights**: Background task indexes video and generates AI insights

## Environment Variables

Copy `.env.example` to `.env` to customize:

| Variable | Default | Description |
|----------|---------|-------------|
| `API_PORT` | `8000` | Backend server port |
| `WEBHOOK_URL` | Auto | Override tunnel URL (for production) |

## Permissions (macOS)

The app requires:
- **Microphone** - For audio capture
- **Screen Recording** - For screen capture

Grant these in **System Settings > Privacy & Security**.

## License

MIT
