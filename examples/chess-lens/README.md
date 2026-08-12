<!-- PROJECT SHIELDS -->
[![Electron][electron-shield]][electron-url]
[![TypeScript][typescript-shield]][typescript-url]
[![React][react-shield]][react-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![Website][website-shield]][website-url]

<h1 align="center">Chess Lens</h1>

<p align="center">
  Real-time chess coaching, directly on your screen.
</p>

<p align="center">
  <a href="https://github.com/video-db/chess-lens">
    <img src="https://img.shields.io/badge/View%20Repository-Chess%20Lens-blue?style=for-the-badge&logo=github" alt="View Repository">
  </a>
</p>

<p align="center">
  <a href="#installation">Install</a>
  ·
  <a href="https://docs.videodb.io"><strong>Docs</strong></a>
  ·
  <a href="https://github.com/video-db/chess-lens/issues">Report Bug</a>
</p>

---

## What is Chess Lens?

Chess Lens watches your chess game through screen capture, extracts the board position using a vision model, and delivers coaching tips to a floating overlay within seconds of each move.

- **Works anywhere**: chess.com, lichess, ChessBase, or any client on screen
- **Instant engine tips**: best move and evaluation appear as soon as the engine responds
- **AI coaching**: a plain-language explanation and drill question follow in the background
- **Session history**: every game saved locally; browse past sessions and replay the analysis

---

## Installation

**macOS**
```bash
curl -fsSL https://raw.githubusercontent.com/video-db/chess-lens/main/scripts/install.sh | bash
```

**Windows (PowerShell)**
```powershell
irm https://raw.githubusercontent.com/video-db/chess-lens/main/scripts/install.ps1 | iex
```

Then start the app from Applications, Spotlight, or the Start Menu.

<details>
<summary>Manual install</summary>

```bash
git clone https://github.com/video-db/chess-lens.git
cd chess-lens
npm install
npm run dev
```

On first launch, enter your VideoDB API key. Get a free key at [console.videodb.io](https://console.videodb.io).

</details>

---

## Features

| Feature | Description |
|---------|-------------|
| **Automatic board detection** | Reads any visible chess board from screen capture, white or black perspective |
| **RTStream visual indexing** | Uses VideoDB screen RTStreams for live visual analysis when recording |
| **Screenshot fallback** | Keeps a local screenshot-to-FEN pipeline running during RTStream warmup or outages |
| **Two-stage coaching** | Engine tip shown instantly; LLM explanation upgrades it in the background |
| **Floating HUD** | Transparent always-on-top overlay with board, tip, drill question, chat, and no-board state. Draggable. |
| **Session history** | Browse past games and review recordings, transcripts, and coaching tips |
| **Post-session summary** | AI-generated recap after each game |
| **Local-first** | Data is stored locally; VideoDB and model API calls leave the device. |

---

## How It Works

```
VideoDB capture session starts
    ↓
Screen RTStream visual indexing + local screenshot fallback
    ↓
Vision model -> board position (FEN)
    ↓
Chess engine -> best move + evaluation
    ↓
Instant tip shown in overlay
    ↓
LLM coaching explanation (background) -> overlay upgrades
```

A new tip fires when the board position changes. If the vision model reports `NO_BOARD` repeatedly, the widget asks you to bring the chess board back into focus.

---

## Getting Started

### Prerequisites

- Node.js 18+
- VideoDB API key: [console.videodb.io](https://console.videodb.io)
- macOS 12+: grant Screen Recording in System Settings > Privacy & Security
- Microphone permission if you enable audio recording or transcription

### Run

```bash
npm run dev
```

### Build

```bash
npm run dist:mac    # macOS DMG
npm run dist        # all platforms
```

---

## Repository Layout

- `src/`: application source for Electron main, preload, renderer, shared types, and widget code
- `test/`: unit tests, mirroring the source tree without the `src/` prefix
- `tools/`: validation, diagnostics, maintenance, and asset-generation scripts
- `scripts/`: install and local launch helper scripts
- `assets/`: runtime model files packaged with the app
- `resources/`: app icons and packaged resources

---

## Troubleshooting

<details>
<summary><strong>No coaching tips appearing</strong></summary>

- Confirm Screen Recording permission is granted in System Settings > Privacy & Security
- Make sure the chess board is fully visible and not covered by other windows
- RTStream visual indexing may take a moment to warm up; the screenshot fallback should continue scanning
- The first tip takes 5-10 seconds on a new position
- Check logs in the app's Electron user data directory

</details>

<details>
<summary><strong>Widget says NO BOARD DETECTED</strong></summary>

- The vision model reported `<raw_board>NO_BOARD</raw_board>` for several consecutive frames
- Bring the chess tab or board window back into focus
- Close modals, popups, or overlays that cover the board
- The warning clears after a fresh valid board position is detected

</details>

<details>
<summary><strong>FEN extraction always null</strong></summary>

- The board must be clearly visible and large enough to read
- No overlays or modals should cover the board during capture
- Run `npm run tools:check-model` to verify the vision model is reachable

</details>

<details>
<summary><strong>Native module errors after install</strong></summary>

```bash
npm run rebuild
```

</details>

<details>
<summary><strong>App won't start</strong></summary>

- Ensure Node.js 18+ is installed
- Delete `dist/` and re-run `npm run dev`
- Check that port 5174 is not already in use

</details>

---

## Community & Support

- **Issues:** [GitHub Issues](https://github.com/video-db/chess-lens/issues)
- **Discord:** [Join the VideoDB community](https://discord.gg/py9P639jGz)
- **API Key:** [console.videodb.io](https://console.videodb.io)
- **Docs:** [docs.videodb.io](https://docs.videodb.io)

---

<p align="center">Made with ❤️ by the <a href="https://videodb.io">VideoDB</a> team</p>

<!-- MARKDOWN LINKS & IMAGES -->
[electron-shield]: https://img.shields.io/badge/Electron-39-47848F?style=for-the-badge&logo=electron&logoColor=white
[electron-url]: https://www.electronjs.org/
[typescript-shield]: https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[typescript-url]: https://www.typescriptlang.org/
[react-shield]: https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black
[react-url]: https://react.dev/
[stars-shield]: https://img.shields.io/github/stars/video-db/chess-lens.svg?style=for-the-badge
[stars-url]: https://github.com/video-db/chess-lens/stargazers
[issues-shield]: https://img.shields.io/github/issues/video-db/chess-lens.svg?style=for-the-badge
[issues-url]: https://github.com/video-db/chess-lens/issues
[website-shield]: https://img.shields.io/website?url=https%3A%2F%2Fvideodb.io%2F&style=for-the-badge&label=videodb.io
[website-url]: https://videodb.io/
