#!/usr/bin/env node
/**
 * Recorder Control CLI
 * Controls the VideoDB Recorder Electron app via HTTP API.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

// Load config to get port
function loadConfig() {
  const configPath = path.join(__dirname, "config.json");
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

const config = loadConfig();
const API_PORT = config.recorder_port || process.env.RECORDER_PORT || 8899;
const BASE_URL = `http://localhost:${API_PORT}`;

function request(path, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: { "Content-Type": "application/json" },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data });
        }
      });
    });

    req.on("error", (e) => {
      if (e.code === "ECONNREFUSED") {
        reject(new Error("Recorder app not running. Start it with: npm start"));
      } else {
        reject(e);
      }
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Parse JSON argument from args
function parseJsonArg(args, flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) {
    try {
      return JSON.parse(args[idx + 1]);
    } catch (e) {
      console.error(`Invalid JSON in ${flag}:`, e.message);
      return null;
    }
  }
  return null;
}

// Parse indexing config from args
// Supports: --config '{"visual": {...}}' or --config-file path/to/config.json
function parseIndexingConfig(args) {
  const config = parseJsonArg(args, "--config");
  if (config) return config;
  
  const fileIdx = args.indexOf("--config-file");
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    try {
      const filePath = args[fileIdx + 1];
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (e) {
      console.error("Failed to read config file:", e.message);
      return null;
    }
  }
  
  return null;
}


async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case "start": {
        const indexingConfig = parseIndexingConfig(args);
        const body = {};
        
        if (indexingConfig) {
          body.indexing_config = indexingConfig;
          console.log("Starting recording with custom indexing config...");
        } else {
          console.log("Starting recording (picker will open)...");
        }
        
        const result = await request("/api/record/start", "POST", body);
        if (result.status === "ok") {
          console.log(`✓ Recording started (session: ${result.sessionId})`);
        } else if (result.status === "cancelled") {
          console.log("Recording cancelled by user");
        } else {
          console.log(`✗ Error: ${result.error}`);
        }
        break;
      }

      case "stop": {
        console.log("Stopping recording...");
        const result = await request("/api/record/stop", "POST");
        if (result.status === "ok") {
          console.log(`✓ Recording stopped (duration: ${result.duration}s)`);
        } else {
          console.log(`✗ Error: ${result.error}`);
        }
        break;
      }

      case "status": {
        const status = await request("/api/status");
        if (status.recording) {
          console.log(`✓ Recording active`);
          console.log(`  Session: ${status.sessionId}`);
          console.log(`  Duration: ${status.duration}s`);
          console.log(`  Buffers: screen=${status.bufferCounts?.screen || 0}, mic=${status.bufferCounts?.mic || 0}, system_audio=${status.bufferCounts?.system_audio || 0}`);
        } else {
          console.log("○ Not recording");
          console.log(`  Buffers: screen=${status.bufferCounts?.screen || 0}, mic=${status.bufferCounts?.mic || 0}, system_audio=${status.bufferCounts?.system_audio || 0}`);
        }
        break;
      }

      case "context": {
        const type = args[1] || "all";
        const ctx = await request(`/api/context/${type}`);
        
        if (type === "all") {
          const screenCount = ctx.screen?.length || 0;
          const micCount = ctx.mic?.length || 0;
          const audioCount = ctx.system_audio?.length || 0;
          
          console.log(`Context (${screenCount} screen, ${micCount} mic, ${audioCount} system_audio):\n`);
          
          if (ctx.screen?.length > 0) {
            console.log("=== Screen ===");
            ctx.screen.slice(-5).forEach(r => {
              console.log(`[${r.timestamp}] ${r.text?.substring(0, 100)}...`);
            });
            console.log();
          }
          
          if (ctx.mic?.length > 0) {
            console.log("=== Mic ===");
            ctx.mic.slice(-5).forEach(r => {
              console.log(`[${r.timestamp}] ${r.text?.substring(0, 100)}...`);
            });
            console.log();
          }
          
          if (ctx.system_audio?.length > 0) {
            console.log("=== System Audio ===");
            ctx.system_audio.slice(-5).forEach(r => {
              console.log(`[${r.timestamp}] ${r.text?.substring(0, 100)}...`);
            });
          }
        } else {
          const records = ctx[type] || [];
          console.log(`${type} context (${records.length} records):\n`);
          records.slice(-10).forEach(r => {
            console.log(`[${r.timestamp}] ${r.text}`);
          });
        }
        break;
      }

      case "overlay-show": {
        const loading = args.includes("--loading");
        const textIdx = args.indexOf("--text");
        const text = textIdx !== -1 ? args.slice(textIdx + 1).join(" ") : (loading ? "" : "VideoDB Recorder");
        await request("/api/overlay/show", "POST", { text, loading });
        console.log("✓ Overlay shown");
        break;
      }

      case "overlay-hide": {
        await request("/api/overlay/hide", "POST");
        console.log("✓ Overlay hidden");
        break;
      }

      case "config": {
        console.log("Current config:");
        console.log(JSON.stringify(config, null, 2));
        break;
      }

      default:
        console.log(`
VideoDB Recorder Control

Usage:
  node recorder-control.js <command> [options]

Commands:
  start [options]
      Start recording. Opens picker to select screen/audio sources.
      --config JSON       Custom indexing config (optional)
      --config-file PATH  Load indexing config from file (optional)
      
  stop
      Stop recording.
      
  status
      Get recording status and buffer counts.
      
  context [type]
      Get context records. Type: screen, mic, system_audio, all (default)
      
  overlay-show [--loading] [--text <text>]
      Show overlay. Use --loading for loading state; --text for content (clears loading).
      
  overlay-hide
      Hide overlay.
      
  config
      Show current configuration.

Examples:
  # Start recording (opens picker)
  node recorder-control.js start
  
  # Start with custom indexing config
  node recorder-control.js start --config '{"visual":{"prompt":"Focus on code"}}'
  
  # Check status
  node recorder-control.js status
  
  # Get screen context
  node recorder-control.js context screen
`);
    }
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
}

main();
