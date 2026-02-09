# Meeting Copilot - Comprehensive Codebase Context

## Executive Summary

Meeting Copilot is an Electron-based desktop application for recording meetings with real-time transcription and AI-powered insights. Built on VideoDB's capture infrastructure, it provides screen/audio recording, live transcription, and post-call AI summaries.

---

## 1. Architecture Overview

### Application Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron App                              │
├────────────────────────┬────────────────────────────────────────┤
│     Main Process       │           Renderer Process              │
│     (Node.js)          │           (React + Vite)                │
├────────────────────────┼────────────────────────────────────────┤
│ • Window Management    │ • UI Components (React 19)             │
│ • IPC Handlers         │ • State Management (Zustand)           │
│ • HTTP Server (Hono)   │ • tRPC Client                          │
│ • tRPC Router          │ • Tailwind CSS Styling                 │
│ • SQLite DB (Drizzle)  │                                        │
│ • VideoDB SDK          │                                        │
│ • Cloudflare Tunnel    │                                        │
└────────────────────────┴────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │    VideoDB      │
                    │    Cloud API    │
                    └─────────────────┘
```

### Process Separation

| Main Process | Renderer Process |
|--------------|------------------|
| Native OS access | React UI |
| Recording orchestration | User interactions |
| Database operations | tRPC queries |
| HTTP/webhook server | IPC calls via preload |
| Tunnel management | State management |

---

## 2. Technology Stack

### Core Framework
- **Electron 34.3.0** - Desktop runtime
- **React 19.1.0** - UI framework
- **Vite 6.3.5** - Build tooling
- **TypeScript 5.8.3** - Type safety

### Backend (Main Process)
- **Hono + @hono/node-server** - HTTP server
- **tRPC 11.1.2** - Type-safe RPC
- **better-sqlite3 11.6.0** - Local database
- **Drizzle ORM 0.44.1** - Database queries
- **Pino** - Structured logging
- **Cloudflared** - Tunnel for webhooks

### Frontend (Renderer)
- **@trpc/react-query** - tRPC React bindings
- **@tanstack/react-query** - Data fetching
- **Zustand 5.0.4** - State management
- **Tailwind CSS 3.4.17** - Styling
- **Lucide React** - Icons

### External Integration
- **VideoDB SDK** - Recording, transcription, AI insights
- **Zod** - Runtime schema validation

---

## 3. Directory Structure

```
src/
├── main/                              # Main process (Node.js)
│   ├── index.ts                       # App entry, window creation, lifecycle
│   ├── db/
│   │   ├── index.ts                   # DB initialization & queries
│   │   └── schema.ts                  # Drizzle schema (users, recordings)
│   ├── ipc/
│   │   ├── index.ts                   # IPC handler registration
│   │   ├── capture.ts                 # Recording IPC (start/stop/pause/resume)
│   │   ├── permissions.ts             # macOS permission handlers
│   │   └── app.ts                     # Settings, notifications
│   ├── server/
│   │   ├── index.ts                   # HTTP server setup
│   │   ├── routes/webhook.ts          # VideoDB webhook handler
│   │   └── trpc/
│   │       ├── router.ts              # Main tRPC router
│   │       ├── trpc.ts                # tRPC instance
│   │       ├── context.ts             # Auth context
│   │       └── procedures/
│   │           ├── auth.ts            # User registration
│   │           ├── capture.ts         # Capture session creation
│   │           ├── recordings.ts      # Recording CRUD
│   │           ├── transcription.ts   # Real-time transcription
│   │           ├── token.ts           # Session token generation
│   │           └── config.ts          # Server config
│   ├── services/
│   │   ├── videodb.service.ts         # VideoDB API wrapper
│   │   ├── insights.service.ts        # AI insight generation
│   │   └── tunnel.service.ts          # Cloudflare tunnel
│   └── lib/
│       ├── config.ts                  # Configuration management
│       ├── logger.ts                  # Pino logger
│       ├── paths.ts                   # File path utilities
│       └── videodb-patch.ts           # Binary path patching
│
├── renderer/                          # Renderer process (React)
│   ├── App.tsx                        # Root component with tabs
│   ├── main.tsx                       # React entry
│   ├── api/
│   │   ├── trpc.ts                    # tRPC client config
│   │   └── ipc.ts                     # IPC API access
│   ├── components/
│   │   ├── auth/AuthModal.tsx         # Login/registration
│   │   ├── recording/
│   │   │   ├── SessionControls.tsx    # Record/Stop, timer
│   │   │   └── StreamToggles.tsx      # Mic/Screen/Audio toggles
│   │   ├── transcription/
│   │   │   └── TranscriptionPanel.tsx # Live transcript
│   │   ├── history/
│   │   │   ├── HistoryView.tsx        # Recording list
│   │   │   ├── RecordingCard.tsx      # Recording item
│   │   │   └── RecordingDetailsModal.tsx
│   │   └── layout/
│   │       ├── Sidebar.tsx            # Navigation
│   │       └── MainContent.tsx        # Layout wrapper
│   ├── hooks/
│   │   ├── useSession.ts              # Recording session logic
│   │   ├── usePermissions.ts          # Permission checking
│   │   └── useGlobalRecorderEvents.ts # Global recorder events
│   ├── stores/
│   │   ├── session.store.ts           # Zustand session state
│   │   ├── config.store.ts            # Auth config (persisted)
│   │   └── transcription.store.ts     # Transcript state
│   └── lib/utils.ts
│
├── shared/                            # Shared types
│   ├── types/
│   │   ├── ipc.types.ts
│   │   ├── api.types.ts
│   │   └── index.ts
│   └── schemas/
│       ├── auth.schema.ts
│       ├── capture.schema.ts
│       ├── recording.schema.ts
│       ├── config.schema.ts
│       ├── webhook.schema.ts
│       └── index.ts
│
└── types/                             # Global type declarations
    ├── global.d.ts
    └── videodb.d.ts
```

---

## 4. Current Features (Implemented)

### Recording Control
- Start/stop recording via VideoDB CaptureClient
- Pause/resume individual tracks (mic, system audio, screen)
- Progress tracking with elapsed time
- Upload progress monitoring

### Real-Time Transcription
- Dual-channel transcription (microphone + system audio)
- WebSocket-based live transcript delivery
- Pending text (interim) → finalized text display
- Enable/disable toggle

### AI Insights (Post-Call)
- Video indexing for spoken words
- AI-powered meeting summary generation
- Markdown-formatted output with sections:
  - Meeting Summary
  - Key Discussion Points
  - Key Decisions
- Retry capability on failure

### Recording History
- List past recordings with status
- View recording details
- Open video player in external window

### Authentication
- VideoDB API key validation
- Token management with 24hr expiry (5-min refresh buffer)
- Auto-registration from `auth_config.json`

### Permissions (macOS)
- Microphone permission check/request
- Screen recording permission check/request

### Infrastructure
- Cloudflare tunnel for webhook callbacks
- SQLite database with Drizzle ORM
- Structured logging with Pino

---

## 5. Service Interaction Flow

### Recording Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   React UI  │────▶│   Preload   │────▶│ Main Process│────▶│   VideoDB   │
│             │     │   (IPC)     │     │             │     │   Cloud     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
      │                                        │                    │
      │ 1. Click "Record"                      │                    │
      │────────────────────────────────────────▶                    │
      │                                        │                    │
      │ 2. Generate session token              │                    │
      │                                        │───────────────────▶│
      │                                        │◀───────────────────│
      │                                        │                    │
      │ 3. Create capture session              │                    │
      │                                        │───────────────────▶│
      │                                        │◀── (webhook URL)───│
      │                                        │                    │
      │ 4. Start CaptureClient                 │                    │
      │                                        │═══════════════════▶│
      │                                        │    (media stream)  │
      │ 5. Real-time transcripts               │                    │
      │◀═══════════════════════════════════════│◀══════════════════│
      │         (WebSocket events)             │   (WebSocket)      │
```

### Webhook Flow (Recording Complete)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   VideoDB   │────▶│   Tunnel    │────▶│ Main Process│
│   Cloud     │     │ (Cloudflare)│     │ (Webhook)   │
└─────────────┘     └─────────────┘     └─────────────┘
      │                    │                    │
      │ capture_session.exported               │
      │────────────────────────────────────────▶
      │                                        │
      │                           Update DB with video_id,
      │                           stream_url, player_url
      │                                        │
      │                           Trigger background
      │                           insights processing
      │                                        │
      │◀───────────────────────────────────────│
      │              200 OK                    │
```

### IPC Communication

```typescript
// Main Process handles:
'recorder-start-recording'     → Start capture session
'recorder-stop-recording'      → Stop capture, trigger processing
'recorder-pause-tracks'        → Pause specific channels
'recorder-resume-tracks'       → Resume specific channels
'recorder-list-channels'       → Get available audio/video sources
'check-mic-permission'         → Check microphone access
'check-screen-permission'      → Check screen recording access
'request-mic-permission'       → Request microphone access
'request-screen-permission'    → Open system preferences

// Events sent to Renderer:
'recorder-event'               → Recording state changes, transcripts, errors
'auth-required'                → Signal to show auth modal
```

### tRPC Procedures

```typescript
// Authentication
auth.register          // Register with API key → returns access token

// Token Management
token.generate         // Generate session token (24hr expiry)

// Capture Sessions
capture.createSession  // Create VideoDB capture session with webhook

// Recording Database
recordings.list        // List all recordings
recordings.get         // Get specific recording
recordings.start       // Create recording entry
recordings.stop        // Mark recording as processing

// Transcription
transcription.start    // Setup real-time transcription WebSockets

// Configuration
config.get             // Get server configuration
tunnel.status          // Get tunnel status
```

---

## 6. Database Schema

```sql
-- Users table
users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  api_key TEXT NOT NULL,
  access_token TEXT NOT NULL UNIQUE
)

-- Recordings table
recordings (
  id INTEGER PRIMARY KEY,
  video_id TEXT,                    -- VideoDB video ID
  stream_url TEXT,                  -- HLS stream URL
  player_url TEXT,                  -- Player URL
  session_id TEXT NOT NULL,         -- Capture session ID
  duration INTEGER,
  created_at TEXT DEFAULT now(),
  status TEXT,                      -- recording|processing|available|failed
  insights TEXT,                    -- JSON AI insights
  insights_status TEXT              -- pending|processing|ready|failed
)
```

---

## 7. State Management (Zustand)

### Session Store
```typescript
{
  status: 'idle' | 'starting' | 'recording' | 'stopping' | 'processing',
  sessionId: string | null,
  sessionToken: string | null,
  streams: {
    microphone: boolean,
    systemAudio: boolean,
    screen: boolean
  },
  elapsedTime: number,
  error: string | null
}
```

### Config Store (Persisted)
```typescript
{
  accessToken: string | null,
  userName: string | null,
  apiKey: string | null,     // Masked in UI
  apiUrl: string | null      // Custom API URL
}
```

### Transcription Store
```typescript
{
  items: TranscriptItem[],   // Finalized transcripts
  enabled: boolean,          // Toggle
  pendingMic: string,        // Interim mic text
  pendingSystemAudio: string // Interim system audio text
}
```

---

## 8. PRD Vision vs Current State

The PRD (`PRD.md`) outlines a comprehensive Sales Co-Pilot with these features:

| Feature | PRD Status | Current Implementation |
|---------|------------|------------------------|
| Real-time transcription (Me/Them) | Must Have | ✅ Implemented |
| Post-call AI summary | Must Have | ✅ Implemented |
| Live objection handling & cue cards | Must Have | ❌ Not implemented |
| Sentiment analysis | Must Have | ❌ Not implemented |
| Live playbook adherence (MEDDIC) | Must Have | ❌ Not implemented |
| Conversation metrics (talk ratio, pace) | Must Have | ❌ Not implemented |
| Live nudges | Nice to Have | ❌ Not implemented |
| Draft follow-up email | Nice to Have | ❌ Not implemented |
| Bookmarks (important moments) | Nice to Have | ❌ Not implemented |

### PLAN.md Contains Implementation Code

The `PLAN.md` file contains **detailed TypeScript implementation code** for all missing features:

1. **Enhanced Transcript Storage** - DB schema with timestamps, channels, triggers
2. **Context Compression** - 5-minute chunk summaries for context management
3. **Conversation Metrics** - Talk ratio, WPM, questions asked, monologue detection
4. **Sentiment Analysis** - Pattern-based + LLM sentiment tracking
5. **Live Nudge Engine** - Rate-limited coaching suggestions
6. **Objection Detection & Cue Cards** - Keyword + LLM classification
7. **Playbook Tracker** - MEDDIC coverage with evidence linking
8. **Post-Call Summary Generator** - Parallel extraction of bullets, pain, objections, commitments, next steps
9. **Main Agent Orchestrator** - Central coordinator for all processing
10. **IPC Integration** - Connect agent to Electron IPC layer

---

## 9. Key Configuration Files

| File | Purpose |
|------|---------|
| `runtime.json` | API port (51731), VideoDB API URL |
| `config.json` | User credentials, access token |
| `auth_config.json` | Auto-registration on startup |
| `drizzle.config.ts` | Database migration config |
| `electron-builder.config.js` | macOS packaging config |
| `vite.config.ts` | Renderer build config |
| `tsconfig.json` | Renderer TypeScript config |
| `tsconfig.node.json` | Main process TypeScript config |

---

## 10. Build & Development

```bash
# Development
npm run dev              # Start with hot-reload

# Production build
npm run build            # Build renderer + main
npm run dist:mac         # Create .dmg installer

# Database
npm run db:generate      # Generate Drizzle migrations
npm run db:migrate       # Apply migrations

# Type checking
npm run typecheck        # Check both configs
```

---

## 11. Feature Completion Guidelines

### Adding New Features

1. **Database Changes**: Add schema in `src/main/db/schema.ts`, run migrations
2. **Main Process Service**: Create service in `src/main/services/`
3. **IPC Handler**: Add handler in `src/main/ipc/`
4. **tRPC Procedure** (if needed): Add in `src/main/server/trpc/procedures/`
5. **Preload Bridge**: Update `src/preload/index.ts` with new API
6. **Zustand Store**: Add/update store in `src/renderer/stores/`
7. **React Component**: Create UI in `src/renderer/components/`
8. **Hook** (if complex): Extract logic to `src/renderer/hooks/`

### Code Patterns to Follow

**IPC Pattern:**
```typescript
// Main process handler
ipcMain.handle('feature-action', async (event, params) => {
  try {
    const result = await service.action(params)
    return { success: true, data: result }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// Preload bridge
electronAPI.feature = {
  action: (params) => ipcRenderer.invoke('feature-action', params),
  onEvent: (callback) => ipcRenderer.on('feature-event', callback)
}
```

**tRPC Pattern:**
```typescript
// Procedure definition
export const featureProcedure = publicProcedure
  .input(z.object({ /* schema */ }))
  .mutation(async ({ input, ctx }) => {
    // Implementation
  })
```

**Zustand Pattern:**
```typescript
interface FeatureState {
  data: DataType
  actions: {
    setData: (data: DataType) => void
    reset: () => void
  }
}

export const useFeatureStore = create<FeatureState>((set) => ({
  data: initialData,
  actions: {
    setData: (data) => set({ data }),
    reset: () => set({ data: initialData })
  }
}))
```

### Integration Points for Sales Co-Pilot Features

The existing infrastructure provides these hooks for adding PRD features:

1. **Transcript Ingestion**: `useGlobalRecorderEvents.ts` receives `transcript:mic` and `transcript:system_audio` events
2. **Recording Lifecycle**: `useSession.ts` hooks control `startRecording()` and `stopRecording()`
3. **Insights Pipeline**: `insights.service.ts` already calls VideoDB's `generateText()` API
4. **Database Layer**: Drizzle ORM with full TypeScript support
5. **Real-time Updates**: IPC events can push data from main to renderer

### Next Steps for Feature Completion

1. **Add transcript storage** - Store segments with timestamps and channel info
2. **Implement conversation metrics** - Calculate talk ratio, pace, questions in real-time
3. **Add sentiment tracking** - Analyze customer ("them") statements
4. **Build cue card system** - Detect objections, retrieve/generate cue cards
5. **Add playbook tracker** - MEDDIC coverage with evidence linking
6. **Enhance summary generation** - Parallel extraction with citations
7. **Add UI components** - Metrics panel, cue cards overlay, playbook checklist

All implementation code is provided in `PLAN.md` - follow that as a reference blueprint.

---

## 12. External Dependencies

### VideoDB SDK
- **CaptureClient**: Native binary for screen/audio capture
- **Session Tokens**: 24-hour expiry with refresh
- **WebSockets**: Real-time transcript delivery
- **generateText()**: AI text generation from video content
- **Webhooks**: `capture_session.exported` event

### Cloudflare Tunnel
- Exposes local HTTP server to internet
- Required for VideoDB webhook callbacks
- URL format: `https://{random}.trycloudflare.com/api/webhook`

---

## 13. Error Handling

| Scenario | Handling |
|----------|----------|
| Permission denied | Show permission request UI |
| Recording binary error | Check architecture compatibility |
| Tunnel timeout | Fallback to localhost (webhooks fail) |
| Token expiry | Auto-refresh with 5-min buffer |
| Webhook failure | Background retry in insights service |
| Database init fail | Create tables if missing |

---

## Summary

This is a well-architected Electron application with:
- Clear separation between main and renderer processes
- Type-safe communication via tRPC and IPC
- Local SQLite storage with Drizzle ORM
- VideoDB integration for recording/transcription/AI
- Zustand state management in the renderer

The current implementation covers basic recording, transcription, and post-call insights. The PRD vision includes extensive real-time sales coaching features (cue cards, sentiment, playbook tracking, nudges) which are fully specified in `PLAN.md` with implementation code ready to integrate.
