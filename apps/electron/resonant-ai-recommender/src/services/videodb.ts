import { EventEmitter } from 'events';
import { connect, type ChannelConfig, type WebSocketMessage } from 'videodb';
import type { SceneEvent, VideoDBConfig } from '../types';

// Increase default max listeners to prevent warnings from SDK internals
EventEmitter.defaultMaxListeners = 50;

// Workaround for package exports restriction
const recorderPath = require.resolve('videodb/capture');
const { CaptureClient } = require(recorderPath);

export class VideoDBService extends EventEmitter {
  private config: VideoDBConfig;
  private conn: ReturnType<typeof connect> | null = null;
  private ws: Awaited<ReturnType<ReturnType<typeof connect>['connectWebsocket']>> | null = null;
  private client: InstanceType<typeof CaptureClient> | null = null;
  private session: Awaited<ReturnType<Awaited<ReturnType<ReturnType<typeof connect>['getCollection']>>['createCaptureSession']>> | null = null;
  private isCapturing = false;
  private sceneEvents: SceneEvent[] = [];
  private wsListenerAbort: AbortController | null = null;
  private clientEventHandlers: { event: string; handler: (...args: unknown[]) => void }[] = [];

  constructor(config: VideoDBConfig) {
    super();
    this.config = config;
  }

  private coll: Awaited<ReturnType<ReturnType<typeof connect>['getCollection']>> | null = null;
  private userId: string = 'electron-user';

  async initialize(): Promise<void> {
    console.log('[VideoDB] Connecting...');
    this.conn = connect({
      apiKey: this.config.apiKey,
      baseUrl: this.config.baseUrl,
    });

    const usage = await this.conn.checkUsage();
    this.userId = (usage.userId as string) || 'electron-user';
    console.log(`[VideoDB] Connected as: ${this.userId}`);

    this.coll = await this.conn.getCollection(this.config.collectionId);
    console.log(`[VideoDB] Using collection: ${this.coll.id}`);
    console.log('[VideoDB] Ready. Click Start Capture to begin.');
  }

  async startCapture(): Promise<void> {
    if (this.isCapturing || !this.conn || !this.coll) {
      return;
    }

    // Create fresh WebSocket connection
    console.log('[VideoDB] Connecting WebSocket...');
    this.ws = await this.conn.connectWebsocket(this.config.collectionId);
    await this.ws.connect();
    // Increase max listeners to prevent warning from SDK internals
    if (this.ws && typeof (this.ws as any).setMaxListeners === 'function') {
      (this.ws as any).setMaxListeners(50);
    }
    // Also try on the underlying socket if accessible
    if ((this.ws as any)._ws && typeof (this.ws as any)._ws.setMaxListeners === 'function') {
      (this.ws as any)._ws.setMaxListeners(50);
    }
    if ((this.ws as any).socket && typeof (this.ws as any).socket.setMaxListeners === 'function') {
      (this.ws as any).socket.setMaxListeners(50);
    }
    console.log(`[VideoDB] WebSocket connected: ${this.ws.connectionId}`);

    // Create fresh session
    console.log('[VideoDB] Creating capture session...');
    this.session = await this.coll.createCaptureSession({
      endUserId: this.userId,
      wsConnectionId: this.ws.connectionId,
      metadata: { app: 'electron-screen-advisor', startedAt: Date.now() },
    });
    console.log(`[VideoDB] Session created: ${this.session.id}`);

    // Generate fresh token and create client
    const token = await this.conn.generateClientToken(3600);
    this.client = new CaptureClient({ sessionToken: token });

    // Store handlers so we can remove them later
    this.clientEventHandlers = [];

    const startedHandler = () => {
      console.log('[VideoDB] Recording started');
      this.emit('recording:started');
    };
    const stoppedHandler = () => {
      console.log('[VideoDB] Recording stopped');
      this.emit('recording:stopped');
    };
    const errorHandler = (err: unknown) => {
      console.error('[VideoDB] Recording error:', err);
      this.emit('recording:error', err);
    };

    this.client.on('recording:started', startedHandler);
    this.client.on('recording:stopped', stoppedHandler);
    this.client.on('recording:error', errorHandler);

    this.clientEventHandlers.push(
      { event: 'recording:started', handler: startedHandler },
      { event: 'recording:stopped', handler: stoppedHandler },
      { event: 'recording:error', handler: errorHandler }
    );

    console.log('[VideoDB] Requesting screen capture permission...');
    try {
      await this.client.requestPermission('screen-capture');
    } catch (e) {
      console.warn('[VideoDB] Permission request failed (binary may not be running)');
    }

    console.log('[VideoDB] Listing channels...');
    let channels: Array<{ channelId: string; type: 'audio' | 'video'; name: string }> = [];
    try {
      channels = await this.client.listChannels();
      console.log('[VideoDB] Available channels:', channels.map(c => c.channelId).join(', '));
    } catch (e) {
      console.warn('[VideoDB] Could not list channels');
      return;
    }

    const displayChannel = channels.find(ch => ch.type === 'video');
    if (!displayChannel) {
      console.error('[VideoDB] No video channel available');
      return;
    }

    const captureChannels: ChannelConfig[] = [{
      channelId: displayChannel.channelId,
      type: 'video',
      record: true,
    }];

    console.log(`[VideoDB] Starting capture on: ${displayChannel.channelId}`);
    await this.client.startCaptureSession({
      sessionId: this.session.id,
      channels: captureChannels,
    });

    this.isCapturing = true;

    console.log('[VideoDB] Waiting for session to become active...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    await this.session.refresh();
    console.log(`[VideoDB] Session status: ${this.session.status}`);
    console.log(`[VideoDB] RTStreams available: ${this.session.rtstreams.length}`);

    const videoStream = this.session.rtstreams.find(rts =>
      rts.mediaTypes?.includes('video') || rts.channelId?.includes('display')
    );

    if (videoStream) {
      console.log(`[VideoDB] Setting up visual indexing for: ${videoStream.id}`);
      try {
        const sceneIndex = await videoStream.indexVisuals({
          batchConfig: { type: 'time', value: 3, frameCount: 3 },
          prompt: `Analyze the screen and provide a summary. Always identify:
- Application in use (VSCode, Terminal, Browser, Slack, etc.)
- What the user is doing (coding, browsing, chatting, etc.)
- Key visible content (file names, URLs, code snippets, etc.)
Format: "[APP_NAME] - [ACTION] - [DETAILS]"`,
          socketId: this.ws.connectionId,
        });
        if (sceneIndex) {
          console.log(`[VideoDB] Visual indexing started: ${sceneIndex.rtstreamIndexId}`);
        }
      } catch (e) {
        console.error('[VideoDB] Failed to start visual indexing:', e);
      }
    }

    // Start WebSocket listener AFTER everything is set up
    this.startWebSocketListener();
  }

  private async startWebSocketListener(): Promise<void> {
    if (!this.ws) return;

    this.wsListenerAbort = new AbortController();
    console.log('[VideoDB] Starting WebSocket listener...');

    try {
      console.log('[VideoDB] Entering WebSocket receive loop...');
      for await (const msg of this.ws.receive()) {
        if (this.wsListenerAbort?.signal.aborted) {
          console.log('[VideoDB] WebSocket listener aborted');
          break;
        }

        const channel = (msg.channel || msg.type || msg.event_type) as string;
        console.log(`[VideoDB] WS Event: ${channel}`, JSON.stringify(msg).slice(0, 200));

        if (channel === 'scene_index' || channel === 'visual_index') {
          const data = msg.data as Record<string, unknown>;
          const text = (data?.text as string) || '';
          const summary = (msg.summary || data?.summary) as string | undefined;

          const sceneEvent: SceneEvent = {
            text,
            summary,
            timestamp: Date.now(),
          };

          this.sceneEvents.push(sceneEvent);
          console.log(`[VideoDB] Scene added (total: ${this.sceneEvents.length}): ${text.slice(0, 100)}...`);
          this.emit('scene', sceneEvent);
        }
      }
      console.log('[VideoDB] WebSocket receive loop ended');
    } catch (e) {
      if (!this.wsListenerAbort?.signal.aborted) {
        console.error('[VideoDB] WebSocket error:', e);
      }
    }
  }

  async stopCapture(): Promise<void> {
    if (!this.isCapturing) return;

    console.log('[VideoDB] Stopping capture...');
    this.wsListenerAbort?.abort();

    try {
      await this.client?.stopCaptureSession();
    } catch (e) {}

    // Remove event listeners from client to prevent memory leak
    if (this.client) {
      for (const { event, handler } of this.clientEventHandlers) {
        this.client.off(event, handler);
      }
      this.clientEventHandlers = [];
    }

    // Close WebSocket connection
    try {
      await this.ws?.close();
    } catch (e) {}
    this.ws = null;

    // Clean up client
    try {
      await this.client?.shutdown();
    } catch (e) {}
    this.client = null;
    this.session = null;

    this.isCapturing = false;
    console.log('[VideoDB] Capture stopped');
  }

  getRecentSceneEvents(sinceMs: number = 120000): SceneEvent[] {
    const cutoff = Date.now() - sinceMs;
    return this.sceneEvents.filter(e => e.timestamp >= cutoff);
  }

  getTotalSceneEventCount(): number {
    return this.sceneEvents.length;
  }

  clearSceneEvents(): void {
    this.sceneEvents = [];
  }

  async shutdown(): Promise<void> {
    console.log('[VideoDB] Shutting down...');
    await this.stopCapture();
    this.conn = null;
    console.log('[VideoDB] Shutdown complete');
  }

  get capturing(): boolean {
    return this.isCapturing;
  }
}
