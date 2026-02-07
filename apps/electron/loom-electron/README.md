# Async Recorder

A Loom-style screen recording app built with Electron and the VideoDB Capture SDK.

## Features

- Screen + microphone + system audio capture
- Draggable camera bubble overlay
- In-app video playback
- Recording history with search
- Auto-indexing for searchable recordings

## Screenshots

| Main Window | Recording |
|-------------|-----------|
| ![Main](screenshots/main.png) | ![Recording](screenshots/recording.png) |

| Camera Bubble | History |
|---------------|---------|
| ![Camera](screenshots/camera.png) | ![History](screenshots/history.png) |

## Prerequisites

- Node.js 16+
- Python 3.10+ ([download](https://python.org/downloads/))

## Quick Start

```bash
npm install
npm run setup    # Enter your VideoDB API key
npm start
```

> **Note**: On first run, close the app and run `npm start` again after setup completes.

Get your API key from [console.videodb.io](https://console.videodb.io).

## Usage

1. **Connect**: Enter your name and API key on first launch
2. **Record**: Click "Start Recording" - grant permissions when prompted
3. **Camera**: Toggle the camera bubble from the sidebar
4. **Review**: Click the history icon to view past recordings

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Permissions denied | System Settings > Privacy & Security > enable Screen Recording/Microphone/Camera |
| Camera not showing | Toggle camera off/on, check Camera permission |
| Backend won't start | Delete `server/venv` and run `npm start` again |

### Reset

```bash
rm -rf server/venv server/users.db runtime.json
npm run setup && npm start
```

## Project Structure

```
├── frontend/        # Electron app (UI)
│   ├── main.js      # Main process
│   ├── renderer.js  # UI logic
│   ├── index.html   # Main window
│   ├── camera.*     # Camera bubble
│   └── history.*    # Recording history
├── server/          # Python backend (FastAPI)
└── scripts/         # Setup and startup scripts
```

## License

MIT
