import { connect, type ChannelConfig } from 'videodb';
import { CaptureClient } from 'videodb/capture';
import type { Settings } from '../../shared/types';
import { getConfig, getIndexingPrompt } from './config';
import { log, warn, error } from './logger';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const TAG = 'CAPTURE';

const LOCK_FILE = 'videodb-recorder';

function getBinDir(): string {
  return path.join(app.getPath('userData'), 'bin');
}

/**
 * Kill any orphaned recorder processes from a previous session and remove
 * the instance lock file. Safe to call multiple times.
 */
function cleanupStaleRecorder(): void {
  const binDir = getBinDir();
  const recorderPath = path.join(binDir, 'recorder');

  // 1. Remove lock file
  const lockPath = path.join(binDir, LOCK_FILE);
  if (fs.existsSync(lockPath)) {
    try {
      fs.unlinkSync(lockPath);
      log(TAG, 'Removed stale lock file');
    } catch (e) {
      warn(TAG, 'Could not remove lock file', e);
    }
  }

  // 2. Kill orphaned recorder processes spawned from our bin directory
  if (process.platform === 'win32') return;
  try {
    const out = execSync(`ps -eo pid,comm | grep -F "${recorderPath}"`, {
      encoding: 'utf8',
      timeout: 3000,
    }).trim();
    for (const line of out.split('\n')) {
      const pid = parseInt(line.trim(), 10);
      if (!pid || pid === process.pid) continue;
      try {
        process.kill(pid, 'SIGTERM');
        log(TAG, `Killed orphaned recorder (pid ${pid})`);
      } catch { /* process already terminated */ }
    }
  } catch {
    // grep returns exit 1 when no matches — expected when no stale processes
  }
}

/**
 * The VideoDB recorder binary creates an instance lock file in its own directory.
 * In a packaged .app bundle, that directory is read-only. We copy the binaries
 * to userData/bin/ (writable) and intercept child_process.spawn to redirect
 * the recorder binary to the writable copy.
 */
let spawnPatched = false;

function ensureWritableBinaries(): void {
  try {
    const srcDir = path
      .join(__dirname, '..', '..', 'node_modules', 'videodb', 'bin')
      .replace('app.asar', 'app.asar.unpacked');

    const destDir = getBinDir();
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    if (fs.existsSync(srcDir)) {
      for (const file of fs.readdirSync(srcDir)) {
        const src = path.join(srcDir, file);
        const dest = path.join(destDir, file);
        const srcStat = fs.statSync(src);
        if (!srcStat.isFile()) continue;
        if (!fs.existsSync(dest) || fs.statSync(dest).size !== srcStat.size) {
          fs.copyFileSync(src, dest);
          fs.chmodSync(dest, 0o755);
          log(TAG, `Copied binary: ${file} → ${dest}`);
        }
      }
    } else {
      log(TAG, `No bundled binaries at ${srcDir} (dev mode — skipping copy)`);
    }

    // Intercept child_process.spawn to redirect recorder binary to writable copy
    if (!spawnPatched) {
      const cp = require('child_process');
      const origSpawn = cp.spawn;
      const binName = process.platform === 'win32' ? 'recorder.exe' : 'recorder';
      const writableBin = path.join(destDir, binName);

      cp.spawn = function (cmd: string, args: any[], opts: any) {
        if (
          typeof cmd === 'string' &&
          cmd.includes('recorder') &&
          !cmd.startsWith(destDir) &&
          fs.existsSync(writableBin)
        ) {
          const patchedOpts = { ...opts, cwd: destDir };
          log(TAG, `spawn intercepted: ${cmd} → ${writableBin} (cwd: ${destDir})`);
          return origSpawn.call(this, writableBin, args, patchedOpts);
        }
        return origSpawn.call(this, cmd, args, opts);
      };

      spawnPatched = true;
      log(TAG, `spawn patched — recorder will use ${writableBin}`);
    }

    // Clean up any stale recorder from a previous crash
    cleanupStaleRecorder();
  } catch (e) {
    error(TAG, 'Failed to prepare writable binaries', e);
  }
}

export { cleanupStaleRecorder };

export interface CaptureEvents {
  onEvent: (msg: Record<string, unknown>) => void;
  onError: (err: Error) => void;
  onSessionActive: () => void;
  onSessionStopped: () => void;
  onExported: (videoId: string) => void;
}

export class CaptureService {
  private conn: ReturnType<typeof connect> | null = null;
  private client: CaptureClient | null = null;
  private ws: Awaited<ReturnType<ReturnType<typeof connect>['connectWebsocket']>> | null = null;
  private sessionId: string | null = null;
  private wsConnectionId: string | null = null;
  private recording = false;
  private listeners: CaptureEvents | null = null;
  private eventCount = 0;

  async initialize(apiKey: string): Promise<void> {
    log(TAG, `Initializing VideoDB connection (key: ${apiKey.slice(0, 8)}...)`);
    ensureWritableBinaries();
    this.conn = connect({ apiKey });
    log(TAG, 'VideoDB connection established');
  }

  async startCapture(
    settings: Settings,
    listeners: CaptureEvents,
    screenId?: string,
  ): Promise<string> {
    if (!this.conn) throw new Error('CaptureService not initialized');
    if (this.recording) throw new Error('Already recording');
    this.listeners = listeners;
    this.eventCount = 0;

    const cfg = getConfig();

    log(TAG, 'Starting capture session...');
    log(TAG, 'Settings', {
      recordMic: settings.recordMic,
      recordScreen: settings.recordScreen,
      recordSystemAudio: settings.recordSystemAudio,
    });

    // 1. WebSocket
    log(TAG, 'Connecting WebSocket...');
    this.ws = await this.conn.connectWebsocket('default');
    await (this.ws as any).connect();
    this.wsConnectionId = (this.ws as any).connectionId;
    log(TAG, `WebSocket connected (id: ${this.wsConnectionId})`);

    // 2. Capture session
    log(TAG, 'Creating capture session on default collection...');
    const coll = await this.conn.getCollection('default');
    const session = await (coll as any).createCaptureSession({
      endUserId: `${cfg.app.short_name.toLowerCase()}-user`,
      wsConnectionId: this.wsConnectionId,
      metadata: { app: cfg.app.name, startedAt: Date.now() },
    });
    this.sessionId = session.id;
    log(TAG, `Capture session created (id: ${this.sessionId})`);

    // 3. Client token + CaptureClient
    log(TAG, 'Generating client token...');
    const token = await this.conn.generateClientToken(7200);
    this.client = new CaptureClient({ sessionToken: token });
    log(TAG, 'CaptureClient initialized');

    // Handle binary crash / max_restarts errors to prevent ERR_UNHANDLED_ERROR
    this.client.on('error', (err: any) => {
      error(TAG, 'CaptureClient binary error', err);
      this.listeners?.onError(err instanceof Error ? err : new Error(err?.message || String(err)));
    });
    this.client.on('shutdown', (payload: any) => {
      warn(TAG, 'CaptureClient binary shutdown', payload);
    });
    this.client.on('recording:error', (payload: any) => {
      error(TAG, 'CaptureClient recording error', payload);
    });

    // 4. Permissions
    log(TAG, 'Requesting permissions (this triggers binary start)...');
    try {
      await this.client.requestPermission('microphone');
      log(TAG, 'Microphone permission granted');
    } catch (e) {
      warn(TAG, 'Microphone permission unavailable', e);
    }
    try {
      await this.client.requestPermission('screen-capture');
      log(TAG, 'Screen capture permission granted');
    } catch (e) {
      warn(TAG, 'Screen capture permission unavailable', e);
    }
    log(TAG, 'Permissions complete, binary should be running');

    // 5. Discover channels
    const channels = await this.client.listChannels();
    const allMics = [...channels.mics];
    const allDisplays = [...channels.displays];
    log(TAG, `Discovered channels: ${allMics.length} mic(s), ${allDisplays.length} display(s)`, {
      mics: allMics.map((ch: any) => ch.id),
      displays: allDisplays.map((ch: any) => ch.id),
    });

    const captureChannels: ChannelConfig[] = [];

    if (settings.recordMic) {
      const mic = channels.mics.default;
      if (mic) {
        captureChannels.push({
          channelId: (mic as any).id,
          type: 'audio',
          record: true,
          transcript: true,
        });
        log(TAG, `Added mic channel: ${(mic as any).id}`);
      } else {
        warn(TAG, 'No microphone channel found in available channels');
      }
    }

    if (settings.recordScreen) {
      log(TAG, `Found ${allDisplays.length} video channel(s)`, allDisplays.map((ch: any) => ch.id));

      let display: any = null;
      if (screenId && allDisplays.length > 1) {
        // Try to match the selected screen: Electron display_id "2" → VideoDB "display:2"
        display = allDisplays.find((ch: any) =>
          (ch.id as string)?.includes(`display:${screenId}`),
        );
        if (display) {
          log(TAG, `Matched selected screen ${screenId} → channel ${display.id}`);
        } else {
          warn(TAG, `No channel matched display_id "${screenId}", falling back to first video channel`);
        }
      }
      if (!display) {
        display = channels.displays.default || null;
      }

      if (display) {
        captureChannels.push({
          channelId: (display as any).id,
          type: 'video',
          record: true,
        });
        log(TAG, `Added display channel: ${(display as any).id}`);
      } else {
        warn(TAG, 'No display/video channel found in available channels');
      }
    }

    if (captureChannels.length === 0) {
      error(TAG, 'No capture channels available after discovery');
      throw new Error('No capture channels available');
    }

    log(TAG, `Starting capture with ${captureChannels.length} channel(s)...`);
    await (this.client as any).startSession({
      sessionId: this.sessionId,
      channels: captureChannels,
    });
    log(TAG, 'Capture session started, waiting for activation + indexing...');

    // 7. Indexing
    await this.waitAndStartIndexing(session);

    this.recording = true;
    log(TAG, 'Recording active — starting event loop');

    // 8. Non-blocking event loop
    this.eventLoop();

    return this.sessionId;
  }

  private async waitAndStartIndexing(session: any): Promise<void> {
    const cfg = getConfig();
    log(TAG, 'Waiting 3s for session activation...');
    await new Promise((r) => setTimeout(r, 3000));
    await session.refresh();

    const audioStream = session.rtstreams?.find(
      (rts: any) =>
        rts.mediaTypes?.includes('audio') || rts.channelId?.includes('mic'),
    );
    const videoStream = session.rtstreams?.find(
      (rts: any) =>
        rts.mediaTypes?.includes('video') || rts.channelId?.includes('display'),
    );

    log(TAG, 'RT streams found', {
      audio: audioStream ? `${audioStream.channelId || 'yes'}` : 'none',
      video: videoStream ? `${videoStream.channelId || 'yes'}` : 'none',
    });

    if (audioStream) {
      try {
        const audioPrompt = getIndexingPrompt('audio_indexing');
        log(TAG, 'Starting audio indexing', {
          model: cfg.indexing.model_name || 'default',
          batchType: cfg.indexing.audio.batch_type,
          batchValue: cfg.indexing.audio.batch_value,
          promptPreview: audioPrompt.slice(0, 80) + '...',
        });
        await audioStream.indexAudio({
          batchConfig: {
            type: cfg.indexing.audio.batch_type,
            value: cfg.indexing.audio.batch_value,
          },
          prompt: audioPrompt,
          socketId: this.wsConnectionId,
          ...(cfg.indexing.model_name ? { modelName: cfg.indexing.model_name } : {}),
        });
        log(TAG, 'Audio indexing started successfully');
      } catch (e) {
        error(TAG, 'Failed to start audio indexing', e);
      }
    } else {
      warn(TAG, 'No audio RT stream found — audio indexing skipped');
    }

    if (videoStream) {
      try {
        const visualPrompt = getIndexingPrompt('visual_indexing');
        log(TAG, 'Starting visual indexing', {
          model: cfg.indexing.model_name || 'default',
          batchType: cfg.indexing.visual.batch_type,
          batchValue: cfg.indexing.visual.batch_value,
          frameCount: cfg.indexing.visual.frame_count,
          promptPreview: visualPrompt.slice(0, 80) + '...',
        });
        await videoStream.indexVisuals({
          batchConfig: {
            type: cfg.indexing.visual.batch_type,
            value: cfg.indexing.visual.batch_value,
            frameCount: cfg.indexing.visual.frame_count,
          },
          prompt: visualPrompt,
          socketId: this.wsConnectionId,
          ...(cfg.indexing.model_name ? { modelName: cfg.indexing.model_name } : {}),
        });
        log(TAG, 'Visual indexing started successfully');
      } catch (e) {
        error(TAG, 'Failed to start visual indexing', e);
      }
    } else {
      warn(TAG, 'No video RT stream found — visual indexing skipped');
    }
  }

  private async eventLoop(): Promise<void> {
    if (!this.ws) return;
    log(TAG, 'Event loop started — listening for WebSocket messages');
    try {
      for await (const msg of (this.ws as any).receive()) {
        if (!this.recording) break;

        const channel = (msg as any).channel || (msg as any).type || (msg as any).event_type;

        if (channel === 'capture_session') {
          const event = (msg as any).event || (msg as any).data?.event;
          log(TAG, `Session event: ${event}`);
          if (event === 'capture_session.stopped') {
            this.listeners?.onSessionStopped();
          } else if (event === 'capture_session.exported') {
            const videoId = (msg as any).data?.exported_video_id;
            log(TAG, `Export complete, videoId: ${videoId}`);
            if (videoId) this.listeners?.onExported(videoId);
          } else if (event === 'capture_session.active') {
            this.listeners?.onSessionActive();
          }
          continue;
        }

        this.eventCount++;
        // Log every event for the first 10, then every 10th, then every 50th
        if (this.eventCount <= 10 || (this.eventCount <= 100 && this.eventCount % 10 === 0) || this.eventCount % 50 === 0) {
          log(TAG, `WS event #${this.eventCount}`, {
            channel,
            keys: Object.keys(msg as object),
            dataPreview: truncateObj(msg as Record<string, unknown>, 150),
          });
        }

        this.listeners?.onEvent(msg as Record<string, unknown>);
      }
    } catch (e) {
      if (this.recording) {
        error(TAG, 'Event loop error', e);
        this.listeners?.onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
    log(TAG, `Event loop ended (total events received: ${this.eventCount})`);
  }

  async stopCapture(): Promise<void> {
    log(TAG, 'Stopping capture...');
    this.recording = false;
    try {
      if (this.client) {
        await (this.client as any).stopSession();
        await (this.client as any).shutdown();
        log(TAG, 'Capture client shutdown complete');
      }
    } catch (e) {
      warn(TAG, 'Error stopping capture client', e);
    }
    try {
      if (this.ws) await (this.ws as any).close();
      log(TAG, 'WebSocket closed');
    } catch (e) {
      warn(TAG, 'Error closing WebSocket', e);
    }
    this.client = null;
    this.ws = null;
    this.wsConnectionId = null;
    cleanupStaleRecorder();
    log(TAG, `Capture stopped (total events: ${this.eventCount})`);
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  isRecording(): boolean {
    return this.recording;
  }
}

function truncateObj(obj: Record<string, unknown>, maxLen: number): string {
  const str = JSON.stringify(obj);
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}
