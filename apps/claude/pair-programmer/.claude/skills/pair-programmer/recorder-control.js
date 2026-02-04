#!/usr/bin/env node
/**
 * VideoDB Pair Programmer
 *
 * Two modes:
 * - Normal: Electron app for screen recording
 * - MCP mode (--mcp flag): stdio MCP server for Claude Code
 *
 * Usage:
 *   node recorder-app.js        # Run Electron app
 *   node recorder-app.js --mcp  # Run as MCP server (stdio)
 */

const path = require("path");
const fs = require("fs");

// =============================================================================
// MCP MODE - When run with --mcp flag, act as stdio MCP server
// =============================================================================

if (process.argv.includes("--mcp")) {
  const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
  const {
    StdioServerTransport,
  } = require("@modelcontextprotocol/sdk/server/stdio.js");

  // Context file written by Electron app
  const PROJECT_ROOT = path.join(__dirname, "..", "..", "..");
  const CONTEXT_FILE = path.join(PROJECT_ROOT, ".context.json");

  function getContext() {
    try {
      if (fs.existsSync(CONTEXT_FILE)) {
        return JSON.parse(fs.readFileSync(CONTEXT_FILE, "utf8"));
      }
    } catch (e) {}
    return {
      screen: [],
      mic: [],
      system_audio: [],
      recording: { active: false },
    };
  }

  const server = new McpServer({ name: "pair-programmer", version: "1.0.0" });

  // Resources
  server.resource(
    "Recent screen descriptions",
    "context://screen/recent",
    async () => {
      const ctx = getContext();
      return {
        contents: [
          {
            uri: "context://screen/recent",
            mimeType: "application/json",
            text: JSON.stringify(
              {
                type: "screen",
                count: ctx.screen.length,
                records: ctx.screen.slice(-20),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.resource(
    "Recent mic transcriptions",
    "context://mic/recent",
    async () => {
      const ctx = getContext();
      return {
        contents: [
          {
            uri: "context://mic/recent",
            mimeType: "application/json",
            text: JSON.stringify(
              {
                type: "mic",
                count: ctx.mic.length,
                records: ctx.mic.slice(-20),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.resource(
    "Recent system audio",
    "context://system_audio/recent",
    async () => {
      const ctx = getContext();
      return {
        contents: [
          {
            uri: "context://system_audio/recent",
            mimeType: "application/json",
            text: JSON.stringify(
              {
                type: "system_audio",
                count: ctx.system_audio.length,
                records: ctx.system_audio.slice(-20),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.resource("All context combined", "context://all/recent", async () => {
    const ctx = getContext();
    return {
      contents: [
        {
          uri: "context://all/recent",
          mimeType: "application/json",
          text: JSON.stringify(
            {
              type: "all",
              counts: {
                screen: ctx.screen.length,
                mic: ctx.mic.length,
                system_audio: ctx.system_audio.length,
              },
              records: {
                screen: ctx.screen.slice(-10),
                mic: ctx.mic.slice(-10),
                system_audio: ctx.system_audio.slice(-10),
              },
            },
            null,
            2
          ),
        },
      ],
    };
  });

  server.resource("Recording status", "context://status", async () => {
    const ctx = getContext();
    return {
      contents: [
        {
          uri: "context://status",
          mimeType: "application/json",
          text: JSON.stringify(
            {
              recording: ctx.recording,
              counts: {
                screen: ctx.screen.length,
                mic: ctx.mic.length,
                system_audio: ctx.system_audio.length,
              },
              lastUpdated: ctx.lastUpdated,
            },
            null,
            2
          ),
        },
      ],
    };
  });

  // Tools
  server.tool(
    "get_screen_context",
    "Get recent screen descriptions",
    {
      limit: { type: "number", description: "Number of records (default: 10)" },
    },
    async ({ limit = 10 }) => {
      const ctx = getContext();
      const records = ctx.screen.slice(-limit);
      return {
        content: [
          {
            type: "text",
            text:
              records.length > 0
                ? records.map((r) => `[${r.timestamp}] ${r.text}`).join("\n\n")
                : "No screen context. Is recorder running?",
          },
        ],
      };
    }
  );

  server.tool(
    "get_audio_context",
    "Get recent audio transcriptions",
    {
      source: { type: "string", description: "mic, system_audio, or all" },
      limit: { type: "number", description: "Number of records" },
    },
    async ({ source = "all", limit = 10 }) => {
      const ctx = getContext();
      let records = [];
      if (source === "mic" || source === "all")
        records = records.concat(
          ctx.mic.slice(-limit).map((r) => ({ ...r, source: "mic" }))
        );
      if (source === "system_audio" || source === "all")
        records = records.concat(
          ctx.system_audio
            .slice(-limit)
            .map((r) => ({ ...r, source: "system_audio" }))
        );
      if (source === "all") {
        records.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        records = records.slice(-limit);
      }
      return {
        content: [
          {
            type: "text",
            text:
              records.length > 0
                ? records
                    .map((r) => `[${r.source}] [${r.timestamp}] ${r.text}`)
                    .join("\n\n")
                : "No audio context.",
          },
        ],
      };
    }
  );

  server.tool(
    "get_recording_status",
    "Check recording status",
    {},
    async () => {
      const ctx = getContext();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                recording: ctx.recording?.active || false,
                sessionId: ctx.recording?.sessionId,
                bufferCounts: {
                  screen: ctx.screen.length,
                  mic: ctx.mic.length,
                  system_audio: ctx.system_audio.length,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "summarize_recent_activity",
    "Summarize recent activity",
    { minutes: { type: "number", description: "Look back N minutes" } },
    async ({ minutes = 5 }) => {
      const ctx = getContext();
      const cutoff = new Date(Date.now() - minutes * 60 * 1000);
      const recentScreen = ctx.screen.filter(
        (r) => new Date(r.timestamp) > cutoff
      );
      const recentMic = ctx.mic.filter((r) => new Date(r.timestamp) > cutoff);
      const recentAudio = ctx.system_audio.filter(
        (r) => new Date(r.timestamp) > cutoff
      );
      const summary = [];
      if (recentScreen.length > 0) {
        summary.push(`## Screen (${recentScreen.length})`);
        summary.push(recentScreen.map((r) => `- ${r.text}`).join("\n"));
      }
      if (recentMic.length > 0) {
        summary.push(`\n## Mic (${recentMic.length})`);
        summary.push(recentMic.map((r) => `- ${r.text}`).join("\n"));
      }
      if (recentAudio.length > 0) {
        summary.push(`\n## System Audio (${recentAudio.length})`);
        summary.push(recentAudio.map((r) => `- ${r.text}`).join("\n"));
      }
      return {
        content: [
          {
            type: "text",
            text:
              summary.length > 0
                ? summary.join("\n")
                : `No activity in last ${minutes} minutes.`,
          },
        ],
      };
    }
  );

  // Run MCP server
  (async () => {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("VideoDB Pair Programmer MCP Server running");
  })().catch((e) => {
    console.error("MCP Error:", e);
    process.exit(1);
  });

  return; // Don't run Electron code below
}

// =============================================================================
// ELECTRON MODE - Normal app mode
// =============================================================================

const {
  app,
  Notification,
  Tray,
  Menu,
  screen,
  BrowserWindow,
  ipcMain,
  systemPreferences,
  globalShortcut,
} = require("electron");
const http = require("http");
const { spawn, execSync } = require("child_process");
const { connect } = require("videodb");
const { CaptureClient } = require("videodb/capture");

// Suppress verbose [Recorder Binary] logs from SDK, keep our own error logs
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = (...args) => {
  if (args[0] && typeof args[0] === "string" && args[0].includes("[Recorder Binary")) {
    return; // Suppress SDK binary verbose logs
  }
  originalConsoleLog.apply(console, args);
};

console.error = (...args) => {
  if (args[0] && typeof args[0] === "string" && args[0].includes("[Recorder Binary")) {
    return; // Suppress SDK binary verbose logs
  }
  originalConsoleError.apply(console, args);
};

// =============================================================================
// Cloudflare Tunnel Manager (inline)
// =============================================================================

const TunnelManager = {
  process: null,
  cloudflaredPath: null,

  getCloudflaredPath() {
    if (this.cloudflaredPath && fs.existsSync(this.cloudflaredPath)) {
      return this.cloudflaredPath;
    }

    // Check if cloudflared is in PATH
    try {
      const result = execSync("which cloudflared", { encoding: "utf8" }).trim();
      if (result) {
        this.cloudflaredPath = result;
        return this.cloudflaredPath;
      }
    } catch (e) {}

    // Download cloudflared
    const binDir = path.join(__dirname, "bin");
    if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

    const system = process.platform;
    const arch = process.arch === "arm64" ? "arm64" : "amd64";
    const binaryPath = path.join(binDir, "cloudflared");

    if (!fs.existsSync(binaryPath)) {
      console.log("Downloading cloudflared...");
      const https = require("https");

      let url;
      if (system === "darwin") {
        url = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-${arch}.tgz`;
      } else {
        url = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}`;
      }

      // Sync download for simplicity
      try {
        if (system === "darwin") {
          execSync(
            `curl -L "${url}" -o "${binDir}/cloudflared.tgz" && tar -xzf "${binDir}/cloudflared.tgz" -C "${binDir}" && rm "${binDir}/cloudflared.tgz"`,
            { stdio: "inherit" }
          );
        } else {
          execSync(`curl -L "${url}" -o "${binaryPath}"`, { stdio: "inherit" });
        }
        fs.chmodSync(binaryPath, 0o755);
        console.log("✓ cloudflared downloaded");
      } catch (e) {
        console.error("Failed to download cloudflared:", e.message);
        return null;
      }
    }

    this.cloudflaredPath = binaryPath;
    return this.cloudflaredPath;
  },

  async start(port) {
    await this.stop();

    const cloudflared = this.getCloudflaredPath();
    if (!cloudflared) return null;

    return new Promise((resolve) => {
      this.process = spawn(
        cloudflared,
        ["tunnel", "--url", `http://localhost:${port}`, "--no-autoupdate"],
        {
          stdio: ["ignore", "pipe", "pipe"],
        }
      );

      const urlPattern = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;
      let resolved = false;

      const handleData = (data) => {
        const line = data.toString();
        const match = line.match(urlPattern);
        if (match && !resolved) {
          resolved = true;
          resolve(match[0]);
        }
      };

      this.process.stdout.on("data", handleData);
      this.process.stderr.on("data", handleData);

      this.process.on("error", (e) => {
        console.error("Tunnel error:", e.message);
        if (!resolved) resolve(null);
      });

      // Timeout after 30s
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      }, 30000);
    });
  },

  async stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  },
};

// =============================================================================
// Configuration
// =============================================================================

function loadConfig() {
  const configPath =
    process.env.CONFIG_PATH || path.join(__dirname, "config.json");
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (e) {
    console.warn("No config.json found, using defaults");
    return {};
  }
}

const config = loadConfig();
const API_KEY = config.videodb_api_key || process.env.VIDEO_DB_API_KEY;
const BASE_URL = config.videodb_backend_url || "https://api.videodb.io";
const CONFIGURED_WEBHOOK_URL = config.webhook_url || "";
const API_PORT = config.recorder_port || process.env.RECORDER_PORT || 8899;

// Indexing configuration with defaults
const INDEXING_CONFIG = {
  visual: {
    enabled: config.visual_index?.enabled !== false,
    prompt: config.visual_index?.prompt || "Describe what is visible on the screen. Focus on code, text, UI elements, and any relevant technical details.",
    batch_time: config.visual_index?.batch_time || 10,
    frame_count: config.visual_index?.frame_count || 2,
  },
  system_audio: {
    enabled: config.system_audio_index?.enabled !== false,
    prompt: config.system_audio_index?.prompt || "Summarize what is being said. Focus on technical discussions, instructions, and key points.",
    batch_type: config.system_audio_index?.batch_type || "sentence",
    batch_value: config.system_audio_index?.batch_value || 3,
  },
  mic: {
    enabled: config.mic_index?.enabled !== false,
    prompt: config.mic_index?.prompt || "Transcribe and summarize what the user is saying.",
    batch_type: config.mic_index?.batch_type || "sentence",
    batch_value: config.mic_index?.batch_value || 3,
  },
};

// =============================================================================
// State
// =============================================================================

let tray = null;
let pickerWindow = null;
let overlayWindow = null;
let webhookUrl = null; // Will be set from config or cloudflare tunnel
let mcpServerProcess = null; // MCP server child process

// VideoDB SDK instances
let conn = null; // Connection to VideoDB
let captureSession = null; // CaptureSession object
let captureClient = null; // CaptureClient for recording
let wsConnection = null; // WebSocket for real-time events

// Recording state
let recording = {
  active: false,
  sessionId: null,
  startTime: null,
};

// Runtime indexing config (overrides defaults from INDEXING_CONFIG)
let runtimeIndexingConfig = null;

// Get effective indexing config (runtime overrides defaults)
function getIndexingConfig() {
  const defaults = INDEXING_CONFIG;
  const runtime = runtimeIndexingConfig || {};
  
  return {
    visual: { ...defaults.visual, ...runtime.visual },
    system_audio: { ...defaults.system_audio, ...runtime.system_audio },
    mic: { ...defaults.mic, ...runtime.mic },
  };
}

// Shared context file for MCP server
// Project root is 3 levels up from .claude/skills/pair-programmer/
const PROJECT_ROOT = path.join(__dirname, "..", "..", "..");
const CONTEXT_FILE = path.join(PROJECT_ROOT, ".context.json");

// Context buffer (in-memory + shared file)
const contextBuffer = {
  screen: [],
  system_audio: [],
  mic: [],
  maxSize: config.context_buffer_size || 50,

  add(type, record) {
    if (!this[type]) return;
    this[type].push({ ...record, timestamp: new Date().toISOString() });
    if (this[type].length > this.maxSize) {
      this[type].shift();
    }
    // Write to shared file for MCP server
    this._writeToFile();
  },

  getRecent(type, limit = 10) {
    return (this[type] || []).slice(-limit);
  },

  getAll() {
    return {
      screen: this.screen,
      system_audio: this.system_audio,
      mic: this.mic,
    };
  },

  // Write context to shared file for MCP server
  _writeToFile() {
    try {
      const data = {
        screen: this.screen,
        system_audio: this.system_audio,
        mic: this.mic,
        recording: {
          active: recording.active,
          sessionId: recording.sessionId,
          startTime: recording.startTime,
        },
        lastUpdated: new Date().toISOString(),
      };
      fs.writeFileSync(CONTEXT_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
      // Ignore write errors
    }
  },
};

// Hide dock icon (menu bar app)
if (process.platform === "darwin") {
  app.dock.hide();
}

// =============================================================================
// VideoDB SDK Integration
// =============================================================================

async function initializeVideoDB() {
  if (!API_KEY) {
    console.error("No API key configured. Set videodb_api_key in config.json");
    return false;
  }

  try {
    conn = connect({ apiKey: API_KEY, baseUrl: BASE_URL });
    console.log("✓ Connected to VideoDB");
    return true;
  } catch (e) {
    console.error("Failed to connect to VideoDB:", e.message);
    return false;
  }
}

async function createSession() {
  if (!conn) {
    throw new Error("Not connected to VideoDB");
  }

  // Build session config
  const sessionConfig = {
    endUserId: "electron_user",
    metadata: { app: "vdb-recorder-demo" },
  };

  // Add callbackUrl if webhook is configured
  if (webhookUrl) {
    sessionConfig.callbackUrl = webhookUrl;
  }

  console.log("Creating capture session with config:", JSON.stringify(sessionConfig, null, 2));

  // Create capture session
  captureSession = await conn.createCaptureSession(sessionConfig);

  console.log("Session response:", {
    id: captureSession.id,
    callbackUrl: captureSession.callbackUrl,
    status: captureSession.status,
  });

  // Generate client token
  const token = await conn.generateClientToken(3600); // 1 hour

  // Create capture client with token and base URL
  captureClient = new CaptureClient({ sessionToken: token, apiUrl: BASE_URL });

  // Setup event handlers
  setupCaptureClientEvents();

  console.log(`✓ Session created: ${captureSession.id}`);
  return { sessionId: captureSession.id, token };
}

function setupCaptureClientEvents() {
  captureClient.on("recording:started", async (data) => {
    console.log("Recording started:", data);
    recording.active = true;
    recording.sessionId = captureSession.id;
    recording.startTime = Date.now();
    updateTray();
    
    // NOTE: Don't start indexing here!
    // Wait for webhook `capture_session.active` event, then start indexing
    console.log("Waiting for session to become active via webhook...");
  });

  captureClient.on("recording:stopped", (data) => {
    console.log("Recording stopped:", data);
    recording.active = false;
    recording.startTime = null;
    updateTray();

    // Close WebSocket
    if (wsConnection) {
      wsConnection.close();
      wsConnection = null;
    }
  });

  captureClient.on("recording:error", (data) => {
    console.error("Recording error:", data);
    recording.active = false;
    updateTray();
  });

  captureClient.on("transcript", (data) => {
    console.log("Transcript:", data.text?.substring(0, 50));
    contextBuffer.add("mic", { text: data.text, isFinal: data.isFinal });
  });

  captureClient.on("error", (data) => {
    console.error("[Binary Error]", JSON.stringify(data, null, 2));
  });

  captureClient.on("shutdown", (data) => {
    console.error("[Binary Shutdown]", JSON.stringify(data, null, 2));
    if (data.code !== 0) {
      console.error("[Binary] Unexpected exit with code:", data.code);
    }
  });

  captureClient.on("upload:progress", (data) => {
    console.log("[Upload Progress]", data.percent || data);
  });

  captureClient.on("upload:complete", (data) => {
    console.log("[Upload Complete]", data);
  });
}

async function startIndexingForRTStreams(rtstreams) {
  try {
    console.log("[Indexing] Starting indexing for RTStreams:", JSON.stringify(rtstreams, null, 2));
    
    if (!rtstreams || rtstreams.length === 0) {
      console.error("[Indexing] No RTStreams provided!");
      return;
    }

    // Connect WebSocket for receiving indexing results
    wsConnection = await conn.connectWebsocket();
    await wsConnection.connect();
    console.log(`✓ WebSocket connected: ${wsConnection.connectionId}`);

    // Get collection to fetch RTStream objects (await is required!)
    const coll = await conn.getCollection();

    // Get effective indexing config (defaults + runtime overrides)
    const indexingConfig = getIndexingConfig();
    console.log("[Indexing] Using config:", JSON.stringify(indexingConfig, null, 2));

    for (const stream of rtstreams) {
      const rtstream_id = stream.rtstream_id || stream.id;
      const name = stream.name || stream.channel_id || "";
      const mediaTypes = stream.media_types || [];

      if (!rtstream_id) {
        console.log("[Indexing] Skipping stream with no ID:", stream);
        continue;
      }

      console.log(`[Indexing] Processing RTStream: ${rtstream_id} (${name}) - media_types: ${mediaTypes}`);

      try {
        // Get RTStream object from collection
        const rtstream = await coll.getRTStream(rtstream_id);

        if (mediaTypes.includes("video")) {
          // Visual indexing for video/display streams
          if (!indexingConfig.visual.enabled) {
            console.log(`[Indexing] Visual indexing disabled, skipping ${name}`);
            continue;
          }
          
          const visualOpts = {
            prompt: indexingConfig.visual.prompt,
            batchConfig: { 
              type: "time", 
              value: indexingConfig.visual.batch_time, 
              frameCount: indexingConfig.visual.frame_count 
            },
            socketId: wsConnection.connectionId,
          };
          console.log(`[Indexing] Starting visual indexing for ${name}:`, JSON.stringify(visualOpts, null, 2));
          
          const sceneIndex = await rtstream.indexVisuals(visualOpts);
          if (sceneIndex) {
            await sceneIndex.start();
            console.log(`✓ Visual indexing started for ${name} (index: ${sceneIndex.rtstreamIndexId})`);
          }
        } else if (mediaTypes.includes("audio")) {
          // Determine if this is mic or system_audio based on stream name
          const isMic = name.toLowerCase().includes("mic");
          const streamConfig = isMic ? indexingConfig.mic : indexingConfig.system_audio;
          const indexType = isMic ? "mic" : "system_audio";
          
          if (!streamConfig.enabled) {
            console.log(`[Indexing] ${indexType} indexing disabled, skipping ${name}`);
            continue;
          }
          
          const audioOpts = {
            prompt: streamConfig.prompt,
            batchConfig: { 
              type: streamConfig.batch_type, 
              value: streamConfig.batch_value 
            },
            socketId: wsConnection.connectionId,
          };
          console.log(`[Indexing] Starting ${indexType} indexing for ${name}:`, JSON.stringify(audioOpts, null, 2));
          
          const audioIndex = await rtstream.indexAudio(audioOpts);
          if (audioIndex) {
            await audioIndex.start();
            console.log(`✓ ${indexType} indexing started for ${name} (index: ${audioIndex.rtstreamIndexId})`);
          }
        } else {
          console.log(`[Indexing] Unknown media types for ${name}:`, mediaTypes);
        }
      } catch (e) {
        console.error(`[Indexing] Failed to start indexing for ${rtstream_id}:`, e.message);
      }
    }

    // Listen to WebSocket events for indexing results
    listenToWebSocketEvents();
    
  } catch (e) {
    console.error("[Indexing] Failed to start indexing:", e.message, e.stack);
  }
}

async function listenToWebSocketEvents() {
  if (!wsConnection) {
    console.log("[WS] No WebSocket connection");
    return;
  }

  console.log("[WS] Listening for WebSocket events...");

  try {
    for await (const ev of wsConnection.receive()) {
      const channel = ev.channel || ev.type;
      console.log(`[WS] Received event: ${channel}`);

      if (channel === "transcript") {
        const text = ev.data?.text;
        console.log(`[WS] Transcript: ${text?.substring(0, 50)}...`);
        contextBuffer.add("mic", {
          text: text,
          isFinal: ev.data?.is_final,
        });
      } else if (channel === "visual_index") {
        const text = ev.data?.text;
        console.log(`[WS] Scene: ${text?.substring(0, 50)}...`);
        contextBuffer.add("screen", {
          text: text,
          start: ev.data?.start,
        });
      } else if (channel === "audio_index") {
        const text = ev.data?.text;
        const type = (ev.rtstream_name || "").includes("system")
          ? "system_audio"
          : "mic";
        console.log(`[WS] Audio (${type}): ${text?.substring(0, 50)}...`);
        contextBuffer.add(type, { text: text, start: ev.data?.start });
      } else if (channel === "capture_session") {
        console.log("[WS] Session status:", ev.data?.status);
      } else {
        console.log("[WS] Unknown event:", channel, ev);
      }
    }
  } catch (e) {
    if (e.message !== "WebSocket is not connected. Call connect() first.") {
      console.error("[WS] WebSocket error:", e.message);
    }
  }
}

// =============================================================================
// Recording Control
// =============================================================================

async function startRecording(selectedChannels, indexingConfigOverride = null) {
  if (recording.active) {
    return { status: "error", error: "Already recording" };
  }

  // Store runtime indexing config override
  runtimeIndexingConfig = indexingConfigOverride;
  if (runtimeIndexingConfig) {
    console.log("[Recording] Using runtime indexing config:", JSON.stringify(runtimeIndexingConfig, null, 2));
  }

  try {
    // Create session if not exists
    if (!captureSession || !captureClient) {
      await createSession();
    }

    // Request permissions
    await captureClient.requestPermission("microphone");
    await captureClient.requestPermission("screen-capture");

    // List available channels
    const availableChannels = await captureClient.listChannels();
    console.log(
      "Available channels:",
      availableChannels.map((c) => c.channelId)
    );

    // Use selected or default channels
    let channels = selectedChannels;
    if (!channels) {
      const mic = availableChannels.find((c) => c.channelId === "mic:default");
      const systemAudio = availableChannels.find(
        (c) => c.channelId === "system_audio:default"
      );
      const display = availableChannels.find((c) => c.type === "video");

      channels = [mic, systemAudio, display].filter(Boolean).map((c) => ({
        channelId: c.channelId,
        type: c.type,
        record: true,
        store: true,
      }));
    }

    // Start capture
    const capturePayload = {
      sessionId: captureSession.id,
      channels,
    };
    console.log("Starting capture with payload:", JSON.stringify(capturePayload, null, 2));
    
    await captureClient.startCaptureSession(capturePayload);

    return { status: "ok", sessionId: captureSession.id };
  } catch (e) {
    console.error("Start recording error:", e);
    return { status: "error", error: e.message };
  }
}

async function stopRecording() {
  if (!recording.active || !captureClient) {
    return { status: "error", error: "Not recording" };
  }

  try {
    await captureClient.stopCaptureSession();

    const duration = recording.startTime
      ? Math.round((Date.now() - recording.startTime) / 1000)
      : 0;

    // Clear runtime indexing config
    runtimeIndexingConfig = null;

    return { status: "ok", duration };
  } catch (e) {
    console.error("Stop recording error:", e);
    return { status: "error", error: e.message };
  }
}

// =============================================================================
// Screen Picker
// =============================================================================

function showRecordingPicker() {
  console.log("[Picker] showRecordingPicker called");
  
  return new Promise((resolve) => {
    if (pickerWindow) {
      console.log("[Picker] Window already exists, focusing");
      pickerWindow.focus();
      return resolve(null);
    }

    const displays = screen.getAllDisplays().map((d) => ({
      width: d.size.width,
      height: d.size.height,
      id: d.id,
    }));
    console.log("[Picker] Found displays:", displays);

    const pickerPath = path.join(__dirname, "ui", "picker.html");
    console.log("[Picker] Loading picker from:", pickerPath);
    console.log("[Picker] File exists:", fs.existsSync(pickerPath));

    pickerWindow = new BrowserWindow({
      width: 420,
      height: 520,
      resizable: false,
      minimizable: false,
      maximizable: false,
      alwaysOnTop: true,
      frame: false,
      transparent: false,
      backgroundColor: "#1a1a1a",
      show: false,
      skipTaskbar: false, // Show in taskbar/dock temporarily
      focusable: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    pickerWindow.loadFile(pickerPath);

    pickerWindow.webContents.on("did-finish-load", () => {
      console.log("[Picker] HTML loaded, sending displays data");
      pickerWindow.webContents.send("displays", displays);
      pickerWindow.show();
      pickerWindow.focus();
      // For menu bar apps, need to activate the app to bring window to front
      if (process.platform === "darwin") {
        app.focus({ steal: true });
      }
      console.log("[Picker] Window shown and focused");
    });

    pickerWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
      console.error("[Picker] Failed to load:", errorCode, errorDescription);
    });

    pickerWindow.on("ready-to-show", () => {
      console.log("[Picker] Window ready to show");
    });

    ipcMain.once("picker-result", (event, result) => {
      console.log("[Picker] Received result:", result);
      if (pickerWindow) {
        pickerWindow.close();
        pickerWindow = null;
      }
      resolve(result);
    });

    pickerWindow.on("closed", () => {
      console.log("[Picker] Window closed");
      pickerWindow = null;
      resolve(null);
    });
  });
}

// =============================================================================
// Overlay Window
// =============================================================================

function createOverlayWindow() {
  if (overlayWindow) {
    overlayWindow.focus();
    return overlayWindow;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;

  overlayWindow = new BrowserWindow({
    width: 340,
    height: 400,
    x: screenWidth - 360,
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  overlayWindow.loadFile(path.join(__dirname, "ui", "overlay.html"));
  overlayWindow.setIgnoreMouseEvents(false);

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

function showOverlay(text) {
  const win = createOverlayWindow();
  if (text) {
    win.webContents.on("did-finish-load", () => {
      win.webContents.send("overlay-content", { text });
    });
    if (!win.webContents.isLoading()) {
      win.webContents.send("overlay-content", { text });
    }
  }
  return { status: "ok" };
}

function hideOverlay() {
  if (overlayWindow) {
    overlayWindow.close();
    overlayWindow = null;
  }
  return { status: "ok" };
}

ipcMain.on("overlay-close", () => hideOverlay());

// =============================================================================
// Tray
// =============================================================================

function createTrayIcon(isRecording) {
  const size = 22;
  const canvas = require("electron").nativeImage.createEmpty();

  // Simple colored circle
  const color = isRecording ? "#ff3b30" : "#8e8e93";
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size / 2}" cy="${size / 2}" r="${
    size / 2 - 2
  }" fill="${color}"/>
    </svg>
  `;

  return require("electron").nativeImage.createFromBuffer(Buffer.from(svg), {
    width: size,
    height: size,
  });
}

function getRecordingDuration() {
  if (!recording.active || !recording.startTime) return null;
  const seconds = Math.round((Date.now() - recording.startTime) / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function buildTrayMenu() {
  const duration = getRecordingDuration();
  const menu = [];

  if (recording.active) {
    menu.push({ label: `🔴 Recording ${duration || ""}`, enabled: false });
    menu.push({ type: "separator" });
    menu.push({
      label: "Stop Recording",
      click: async () => {
        await stopRecording();
        updateTray();
      },
    });
    menu.push({ type: "separator" });
    menu.push({
      label: "Show Context",
      click: () => {
        const ctx = contextBuffer.getAll();
        const text = [
          `Screen: ${ctx.screen.length} records`,
          `Mic: ${ctx.mic.length} records`,
          `System Audio: ${ctx.system_audio.length} records`,
          "",
          "Recent screen:",
          ...ctx.screen
            .slice(-3)
            .map((r) => `  • ${(r.text || "").substring(0, 50)}...`),
        ].join("\n");
        showOverlay(text);
      },
    });
  } else {
    menu.push({ label: "Ready to Record", enabled: false });
    menu.push({ type: "separator" });
    menu.push({
      label: "Start Recording",
      click: async () => {
        console.log("[Tray] Start Recording clicked");
        const pickerResult = await showRecordingPicker();
        console.log("[Tray] Picker returned:", pickerResult);
        if (!pickerResult) {
          console.log("[Tray] No picker result, cancelled");
          return;
        }

        // Build channels from picker result
        const channels = [];
        if (pickerResult.mic) {
          channels.push({
            channelId: "mic:default",
            type: "audio",
            record: true,
            store: true,
          });
        }
        if (pickerResult.systemAudio) {
          channels.push({
            channelId: "system_audio:default",
            type: "audio",
            record: true,
            store: true,
          });
        }
        channels.push({
          channelId: `display:${pickerResult.display}`,
          type: "video",
          record: true,
          store: true,
        });

        await startRecording(channels);
        updateTray();
      },
    });
  }

  menu.push({ type: "separator" });
  menu.push({
    label: "Show Overlay",
    click: () => showOverlay("VideoDB Recorder Ready"),
  });
  menu.push({
    label: "Hide Overlay",
    click: () => hideOverlay(),
  });
  menu.push({ type: "separator" });
  menu.push({ label: "Quit", click: () => app.quit() });

  return Menu.buildFromTemplate(menu);
}

function updateTray() {
  if (!tray) return;

  // For now, use a simple approach without custom icons
  tray.setToolTip(
    recording.active ? `Recording ${getRecordingDuration() || ""}` : "Ready"
  );
  tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  // Use a simple built-in approach
  const iconPath = path.join(__dirname, "icon.png");
  let icon;

  if (fs.existsSync(iconPath)) {
    icon = require("electron").nativeImage.createFromPath(iconPath);
  } else {
    // Create a simple 16x16 icon
    icon = require("electron").nativeImage.createEmpty();
  }

  tray = new Tray(
    icon.isEmpty()
      ? require("electron").nativeImage.createFromBuffer(
          Buffer.from([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
            0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00,
            0x00, 0x10, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff, 0x61,
            0x00, 0x00, 0x00, 0x01, 0x73, 0x52, 0x47, 0x42, 0x00, 0xae, 0xce,
            0x1c, 0xe9, 0x00, 0x00, 0x00, 0x44, 0x49, 0x44, 0x41, 0x54, 0x38,
            0x4f, 0x63, 0x64, 0x60, 0x60, 0xf8, 0xcf, 0xc0, 0xc0, 0xc0, 0xc4,
            0x40, 0x24, 0x60, 0x62, 0xa0, 0x00, 0x30, 0x31, 0x90, 0x09, 0x18,
            0x19, 0x18, 0x18, 0x20, 0x00, 0x00, 0x00, 0xff, 0xff, 0x03, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
          ])
        )
      : icon
  );

  tray.setToolTip("VideoDB Recorder");
  tray.setContextMenu(buildTrayMenu());
  tray.on("click", () => tray.popUpContextMenu());

  // Update tray every second when recording
  setInterval(() => {
    if (recording.active) updateTray();
  }, 1000);
}

// =============================================================================
// HTTP API Server (for CLI control + MCP SSE)
// =============================================================================

function startAPIServer() {
  const server = http.createServer(async (req, res) => {
    const url = req.url.split("?")[0];
    
    // Log all incoming requests
    console.log(`[API] ${req.method} ${url}`);
    
    res.setHeader("Content-Type", "application/json");

    // Parse body for POST requests
    let body = "";
    if (req.method === "POST") {
      for await (const chunk of req) body += chunk;
      try {
        body = JSON.parse(body || "{}");
      } catch {
        body = {};
      }
    }

    let result = { status: "error", error: "Unknown endpoint" };

    try {
      // Root endpoint - show available routes
      if ((url === "/" || url === "/api") && req.method === "GET") {
        result = {
          status: "ok",
          name: "VideoDB Recorder API",
          endpoints: {
            "GET /api/status": "Get recording status",
            "POST /api/record/start": "Start recording",
            "POST /api/record/stop": "Stop recording",
            "POST /api/overlay/show": "Show overlay { text: string }",
            "POST /api/overlay/hide": "Hide overlay",
            "GET /api/context/:type": "Get context (screen/mic/system_audio/all)",
            "POST /webhook": "VideoDB webhook endpoint",
          },
          recording: recording.active,
        };
      } else if (url === "/api/status" && req.method === "GET") {
        result = {
          status: "ok",
          recording: recording.active,
          sessionId: recording.sessionId,
          duration: recording.startTime
            ? Math.round((Date.now() - recording.startTime) / 1000)
            : 0,
          bufferCounts: {
            screen: contextBuffer.screen.length,
            mic: contextBuffer.mic.length,
            system_audio: contextBuffer.system_audio.length,
          },
        };
      } else if (url === "/api/record/start" && req.method === "POST") {
        // If no channels specified, show picker to let user select
        if (!body.channels) {
          console.log("[API] No channels specified, showing picker");
          const pickerResult = await showRecordingPicker();
          console.log("[API] Picker returned:", pickerResult);
          if (!pickerResult) {
            result = { status: "cancelled", error: "User cancelled picker" };
          } else {
            // Build channels from picker result
            const channels = [];
            if (pickerResult.mic) {
              channels.push({
                channelId: "mic:default",
                type: "audio",
                record: true,
                store: true,
              });
            }
            if (pickerResult.systemAudio) {
              channels.push({
                channelId: "system_audio:default",
                type: "audio",
                record: true,
                store: true,
              });
            }
            channels.push({
              channelId: `display:${pickerResult.display}`,
              type: "video",
              record: true,
              store: true,
            });
            result = await startRecording(channels, body.indexing_config);
          }
        } else {
          console.log("[API] Channels provided, starting recording directly:", body.channels);
          result = await startRecording(body.channels, body.indexing_config);
        }
      } else if (url === "/api/record/stop" && req.method === "POST") {
        result = await stopRecording();
      } else if (url === "/api/overlay/show" && req.method === "POST") {
        result = showOverlay(body.text);
      } else if (url === "/api/overlay/hide" && req.method === "POST") {
        result = hideOverlay();
      } else if (url.startsWith("/api/context/")) {
        const type = url.split("/").pop();
        if (type === "all") {
          result = { status: "ok", ...contextBuffer.getAll() };
        } else {
          result = { status: "ok", [type]: contextBuffer.getRecent(type, 20) };
        }
      } else if (url === "/webhook" && req.method === "POST") {
        // Handle webhook events from VideoDB
        // IMPORTANT: Respond immediately, process async (server has 5s timeout)
        console.log("[Webhook] Received event:", body.event);
        result = { status: "ok" };
        
        // Process webhook asynchronously (don't await)
        handleWebhookEvent(body).catch(e => {
          console.error("[Webhook] Error processing event:", e.message);
        });
      }
    } catch (e) {
      result = { status: "error", error: e.message };
    }

    res.end(JSON.stringify(result));
  });

  server.listen(API_PORT, "127.0.0.1", () => {
    console.log(`✓ API server running on http://localhost:${API_PORT}`);
    console.log(`✓ MCP SSE endpoint: http://localhost:${API_PORT}/sse`);
  });

  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      console.warn(`Port ${API_PORT} in use, API server disabled`);
    }
  });
}

// Handle incoming webhook events
async function handleWebhookEvent(body) {
  const eventType = body.event;
  const sessionId = body.capture_session_id;
  
  console.log(`[Webhook] Event: ${eventType} for session: ${sessionId}`);

  if (eventType === "capture_session.active") {
    console.log("[Webhook] Session is ACTIVE!");
    
    const data = body.data || {};
    const rtstreams = data.rtstreams || [];
    
    console.log(`[Webhook] Found ${rtstreams.length} RTStreams in payload`);
    
    // Check if this is our session (captureSession exists = we initiated recording)
    const isOurSession = captureSession && captureSession.id === sessionId;
    
    // Start indexing if we have a session and haven't started already
    if (isOurSession && !wsConnection) {
      // Mark recording as active (webhook arrived before local event)
      recording.active = true;
      recording.sessionId = sessionId;
      recording.startTime = recording.startTime || Date.now();
      updateTray();
      
      await startIndexingForRTStreams(rtstreams);
    } else if (!isOurSession) {
      console.log(`[Webhook] Not our session (expected: ${captureSession?.id}, got: ${sessionId}), skipping`);
    } else if (wsConnection) {
      console.log("[Webhook] Indexing already started, skipping");
    }
  } else if (eventType === "capture_session.stopped" || eventType === "recorder.session.stopped") {
    console.log("[Webhook] Session stopped");
    recording.active = false;
    recording.sessionId = null;
    updateTray();
    
    if (wsConnection) {
      await wsConnection.close();
      wsConnection = null;
    }
  } else if (eventType === "capture_session.created") {
    console.log("[Webhook] Session created");
  } else {
    console.log(`[Webhook] Unhandled event type: ${eventType}`);
  }
}

// =============================================================================
// Assistant Shortcut
// =============================================================================

function registerAssistantShortcut() {
  const shortcut = config.assistant_shortcut;
  if (!shortcut) {
    console.log("No assistant_shortcut configured, skipping");
    return;
  }

  const registered = globalShortcut.register(shortcut, () => {
    console.log(`[Assistant] Shortcut ${shortcut} triggered`);
    
    // Run claude -c -p to trigger the /trigger command
    console.log("[Assistant] Running claude -c -p '/trigger' ...");
    const child = spawn("claude", ["-c", "-p", "/trigger"], {
      stdio: "inherit",
      shell: false,
    });

    child.on("error", (err) => {
      console.error("[Assistant] Failed to run claude:", err.message);
      new Notification({
        title: "Assistant Error",
        body: "Failed to run claude command",
      }).show();
    });

    child.on("close", (code) => {
      console.log(`[Assistant] claude exited with code ${code}`);
    });
  });

  if (registered) {
    console.log(`✓ Assistant shortcut registered: ${shortcut}`);
  } else {
    console.error(`✗ Failed to register shortcut: ${shortcut}`);
  }
}

// =============================================================================
// App Lifecycle
// =============================================================================

app.whenReady().then(async () => {
  try {
    console.log("Starting VideoDB Recorder...");
    console.log("Config:", {
      apiKey: API_KEY ? `${API_KEY.substring(0, 10)}...` : "NOT SET",
      baseUrl: BASE_URL,
      configuredWebhookUrl: CONFIGURED_WEBHOOK_URL || "(not set, will use tunnel or websocket)",
      apiPort: API_PORT,
    });

    // Initialize VideoDB connection
    const connected = await initializeVideoDB();
    if (!connected) {
      new Notification({
        title: "VideoDB Recorder",
        body: "Failed to connect. Check your API key in config.json",
      }).show();
    }

    // Start HTTP API server for CLI control
    startAPIServer();

    // Setup webhook URL (from config or cloudflare tunnel)
    if (CONFIGURED_WEBHOOK_URL) {
      // User provides root URL, we append /webhook route
      const baseUrl = CONFIGURED_WEBHOOK_URL.replace(/\/+$/, ""); // strip trailing slashes
      webhookUrl = `${baseUrl}/webhook`;
      console.log(`✓ Using configured webhook URL: ${webhookUrl}`);
    } else {
      console.log("No webhook_url configured, starting Cloudflare tunnel...");
      webhookUrl = await TunnelManager.start(API_PORT);
      if (webhookUrl) {
        webhookUrl = `${webhookUrl}/webhook`;
        console.log(`✓ Cloudflare tunnel ready: ${webhookUrl}`);
      } else {
        console.log("⚠ Tunnel failed, will use WebSocket for events");
        webhookUrl = null;
      }
    }

    createTray();

    // Register global shortcut for assistant
    registerAssistantShortcut();

    new Notification({
      title: "VideoDB Recorder",
      body: webhookUrl
        ? `Ready with webhook: ${webhookUrl.substring(0, 40)}...`
        : "Ready (using WebSocket for events)",
    }).show();
  } catch (error) {
    console.error("Startup error:", error);
    new Notification({
      title: "VideoDB Recorder Error",
      body: error.message,
    }).show();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  // Unregister shortcuts
  globalShortcut.unregisterAll();
  
  if (captureClient) {
    try {
      await captureClient.stopCaptureSession();
      await captureClient.shutdown();
    } catch (e) {
      // Ignore shutdown errors
    }
  }
  if (wsConnection) {
    await wsConnection.close();
  }
  // Stop cloudflare tunnel
  await TunnelManager.stop();
  // Clean up context file
  try {
    if (fs.existsSync(CONTEXT_FILE)) {
      fs.unlinkSync(CONTEXT_FILE);
    }
  } catch (e) {
    // Ignore cleanup errors
  }
});

// =============================================================================
// Export context buffer for external access (e.g., MCP)
// =============================================================================

module.exports = {
  contextBuffer,
  startRecording,
  stopRecording,
  showOverlay,
  hideOverlay,
};
