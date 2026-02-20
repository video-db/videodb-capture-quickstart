<h1 align="center">Async Recorder</h1>

<p align="center">
  A Loom-style screen recording app built with Electron and the VideoDB Capture SDK.
</p>

<p align="center">
  <strong>Platform Support:</strong> macOS and Windows
</p>

<p align="center">
  <a href="https://github.com/video-db/async-recorder">
    <img src="https://img.shields.io/badge/View%20Repository-Async%20Recorder-blue?style=for-the-badge&logo=github" alt="View Repository">
  </a>
</p>

<p align="center">
  🚀 Head over to the repository to explore the complete code and get started!
</p>

---

## Features

- Screen + microphone + system audio capture
- Draggable camera bubble overlay
- In-app video playback
- Recording history with search
- Auto-indexing for searchable recordings

## Screenshots

| Main Window | Recording |
|-------------|-----------|
| ![Main](../../assets/async-recorder-main.png) | ![Recording](../../assets/async-recorder-recording.png) |

| Camera Bubble | History |
|---------------|---------|
| ![Camera](../../assets/async-recorder-camera.png) | ![History](../../assets/async-recorder-history.png) |

## Prerequisites

- Node.js 16+
- Python 3.10+ ([download](https://python.org/downloads/))
- VideoDB API Key ([console.videodb.io](https://console.videodb.io))

## Quick Start

```bash
npm install
npm run setup    # Enter your VideoDB API key
npm start
```

> **Note**: On first run, close the app and run `npm start` again after setup completes.

## Usage

1. **Connect**: Enter your name and API key on first launch
2. **Record**: Click "Start Recording" - grant permissions when prompted
3. **Camera**: Toggle the camera bubble from the sidebar
4. **Review**: Click the history icon to view past recordings

## Troubleshooting

### Permissions denied
- **macOS**: System Settings → Privacy & Security → enable Screen Recording/Microphone/Camera
- **Windows**: Settings → Privacy → enable Microphone/Camera access

### Backend won't start
- Delete `server/venv` and run `npm start` again
- Make sure Python is installed and in PATH

### Camera not showing
- Toggle camera off/on in the sidebar
- Check Camera permission in system settings

### Reset
```bash
# macOS/Linux
rm -rf server/venv server/users.db runtime.json

# Windows
rmdir /s /q server\venv
del server\users.db runtime.json
```
Then run `npm run setup && npm start`

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

## Community & Support

- **Docs**: [docs.videodb.io](https://docs.videodb.io)
- **Issues**: [GitHub Issues](https://github.com/video-db/async-recorder/issues)
- **Discord**: [Join community](https://discord.gg/py9P639jGz)
- **Console**: [Get API key](https://console.videodb.io)

---

<p align="center">Made with ❤️ by the <a href="https://videodb.io">VideoDB</a> team</p>

