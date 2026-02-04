# Resonant

An intelligent desktop app that analyzes your screen activity and recommends relevant online articles. Powered by [VideoDB](https://videodb.io) for screen capture/analysis and [Claude AI](https://anthropic.com) for smart recommendations.

## Features

- **Ambient Intelligence**: Runs quietly in your system tray while you work
- **Real-time Analysis**: VideoDB's AI analyzes your screen every 10 seconds
- **Smart Recommendations**: Claude curates 2-3 relevant articles every 2 minutes
- **Non-intrusive**: Click-to-view notifications with article suggestions
- **Privacy-focused**: All analysis happens via secure API calls

## Prerequisites

- Node.js 18+
- macOS (screen capture uses native binaries)
- [VideoDB API Key](https://console.videodb.io)
- [Anthropic API Key](https://console.anthropic.com)

## Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file and add your API keys:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
VIDEODB_API_KEY=your-videodb-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VIDEODB_API_KEY` | Yes | - | Your VideoDB API key |
| `ANTHROPIC_API_KEY` | Yes | - | Your Anthropic API key |
| `VIDEODB_COLLECTION_ID` | No | `default` | VideoDB collection ID |
| `VIDEODB_BASE_URL` | No | `https://api.videodb.io` | VideoDB API endpoint |
| `RECOMMENDATION_INTERVAL` | No | `120000` | Milliseconds between recommendations (2 min) |

### 3. Run the App

**Development mode:**
```bash
npm run dev
```

**Production build:**
```bash
npm start
```

## Usage

1. Launch the app - it appears as a blue circle in your system tray
2. Click the tray icon to open the popup window
3. Click **Start Capture** to begin screen analysis
4. Grant screen capture permission when prompted (macOS)
5. Work normally - recommendations appear every 2 minutes
6. Click any recommendation to open it in your browser
7. Use **Stop Capture** or right-click tray → **Quit** to exit

## How It Works

```
Your Screen Activity
       ↓
VideoDB Native Capture (continuous)
       ↓
AI Visual Analysis (every 10 sec)
  → Detects: apps, content, actions
       ↓
Context Aggregation (2 min window)
       ↓
Claude AI Processing
  → Curates relevant articles from:
    Medium, Dev.to, Hacker News,
    freeCodeCamp, YouTube, tech blogs
       ↓
Notification with 2-3 Recommendations
```

## Project Structure

```
src/
├── main.ts           # Electron main process
├── preload.ts        # Secure IPC bridge
├── tray.ts           # System tray management
├── types.ts          # TypeScript interfaces
├── services/
│   ├── videodb.ts    # Screen capture & analysis
│   └── anthropic.ts  # AI recommendations
└── renderer/
    └── index.html    # Popup UI
```

## Tech Stack

- **Electron** - Desktop framework
- **TypeScript** - Type-safe development
- **VideoDB SDK** - Screen capture and visual AI
- **Anthropic SDK** - Claude AI integration

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Build and run in development mode |
| `npm start` | Production build and run |
| `npm run build` | Compile TypeScript only |

## License

ISC
