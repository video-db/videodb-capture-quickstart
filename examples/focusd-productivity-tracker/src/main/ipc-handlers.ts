import { ipcMain, BrowserWindow, desktopCapturer, systemPreferences, shell } from 'electron';
import * as db from './services/database';
import { getConfig } from './services/config';
import { CaptureService } from './services/capture';
import {
  startIngestion,
  stopIngestion,
  ingestEvent,
  flushToSegments,
} from './services/event-ingestion';
import {
  initSummarizer,
  startPeriodicSummaries,
  stopPeriodicSummaries,
  generateDailySummary,
  generateDeepDive,
  generateOnDemandSummary,
} from './services/summarizer';
import {
  startIdleDetection,
  stopIdleDetection,
} from './services/idle-detector';
import { hasApiKey, storeApiKey, loadApiKey, clearApiKey, isOnboardingComplete, markOnboardingComplete } from './services/keystore';
import { setRecordingState } from './tray';
import { log, warn, error, getLogDir } from './services/logger';
import type { RecordingState, Settings, PermissionStatus } from '../shared/types';

const TAG = 'IPC';

const capture = new CaptureService();
let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win;
}

function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

export async function initServices(): Promise<void> {
  // Priority: stored key (onboarding) > .env (dev fallback)
  const apiKey = loadApiKey() || process.env.VIDEODB_API_KEY;
  const baseUrl = process.env.VIDEODB_BASE_URL || 'https://api.videodb.io';

  if (!apiKey) {
    warn(TAG, 'No API key found — waiting for onboarding');
    return;
  }

  log(TAG, 'Initializing services', {
    apiKeyPrefix: apiKey.slice(0, 8) + '...',
    source: loadApiKey() ? 'keystore' : '.env',
    baseUrl,
  });

  try {
    await capture.initialize(apiKey);
    log(TAG, 'CaptureService initialized');
  } catch (e) {
    error(TAG, 'Failed to initialize CaptureService', e);
  }

  try {
    initSummarizer(apiKey, baseUrl);
    log(TAG, 'Summarizer initialized');
  } catch (e) {
    error(TAG, 'Failed to initialize Summarizer', e);
  }

  const settings = db.getSettings();
  const cfg = getConfig();
  log(TAG, 'Active settings (from DB — these override config.yaml after first run)', settings);
  log(TAG, 'Config.yaml pipeline values (used for segment_flush only if not overridden)', {
    segment_flush_mins: cfg.pipeline.segment_flush_mins,
    micro_summary_mins: cfg.pipeline.micro_summary_mins,
    session_summary_mins: cfg.pipeline.session_summary_mins,
    idle_threshold_mins: cfg.pipeline.idle_threshold_mins,
  });
}

export function registerIPCHandlers(): void {
  log(TAG, 'Registering IPC handlers');

  // ── App Info ──

  ipcMain.handle('app:info', () => {
    const cfg = getConfig();
    return {
      name: cfg.app.name,
      shortName: cfg.app.short_name,
      author: cfg.app.author,
      model: cfg.llm.model,
    };
  });

  ipcMain.handle('app:logDir', () => getLogDir());

  // ── Onboarding ──

  ipcMain.handle('onboarding:state', () => {
    const hasKey = hasApiKey() || !!process.env.VIDEODB_API_KEY;
    const completed = isOnboardingComplete();
    return { hasApiKey: hasKey, needsOnboarding: !hasKey || !completed };
  });

  ipcMain.handle('onboarding:validateKey', async (_e, apiKey: string) => {
    log(TAG, 'Validating API key...');
    try {
      const { connect } = await import('videodb');
      const conn = connect({ apiKey });
      await conn.getCollection('default');
      log(TAG, 'API key validated successfully');
      return { valid: true };
    } catch (e: any) {
      const msg = e?.message || 'Invalid API key';
      warn(TAG, `API key validation failed: ${msg}`);
      return { valid: false, error: msg };
    }
  });

  ipcMain.handle('onboarding:saveKey', async (_e, apiKey: string) => {
    log(TAG, 'Saving API key...');
    storeApiKey(apiKey);
    // Re-initialize services with the new key
    await initServices();
    log(TAG, 'Services re-initialized with new API key');
  });

  ipcMain.handle('onboarding:clearKey', () => {
    clearApiKey();
    log(TAG, 'API key cleared');
  });

  ipcMain.handle('onboarding:complete', () => {
    markOnboardingComplete();
  });

  ipcMain.handle('onboarding:getKeyInfo', () => {
    const storedKey = loadApiKey();
    if (storedKey) {
      return { preview: storedKey.slice(0, 12) + '...', source: 'keystore' };
    }
    const envKey = process.env.VIDEODB_API_KEY;
    if (envKey) {
      return { preview: envKey.slice(0, 12) + '...', source: 'env' };
    }
    return { preview: '', source: 'none' };
  });

  ipcMain.handle('onboarding:getPermissions', () => {
    const screen = systemPreferences.getMediaAccessStatus('screen') as PermissionStatus;
    const microphone = systemPreferences.getMediaAccessStatus('microphone') as PermissionStatus;
    log(TAG, `Permissions: screen=${screen}, microphone=${microphone}`);
    return { screen, microphone };
  });

  ipcMain.handle('onboarding:requestMicPermission', async () => {
    const granted = await systemPreferences.askForMediaAccess('microphone');
    log(TAG, `Microphone permission ${granted ? 'granted' : 'denied'}`);
    return granted;
  });

  ipcMain.handle('onboarding:openScreenPermissions', () => {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  });

  ipcMain.handle('onboarding:openMicPermissions', () => {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
  });

  // ── Capture ──

  ipcMain.handle('capture:listScreens', async () => {
    log(TAG, 'Listing available screens...');
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 640, height: 360 },
      fetchWindowIcons: false,
    });
    log(TAG, `Found ${sources.length} screen(s)`, sources.map(s => ({
      id: s.id,
      name: s.name,
      display_id: s.display_id,
      thumbnailEmpty: s.thumbnail.isEmpty(),
      thumbnailSize: s.thumbnail.getSize(),
    })));
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.isEmpty() ? '' : s.thumbnail.toDataURL(),
      display_id: s.display_id,
    }));
  });

  ipcMain.handle('capture:start', async (_e, screenId?: string) => {
    const settings = db.getSettings();
    const cfg = getConfig();
    sendToRenderer('recording-state', 'starting' as RecordingState);

    log(TAG, 'capture:start invoked', {
      screenId: screenId || 'default',
      recordMic: settings.recordMic,
      recordScreen: settings.recordScreen,
      segmentFlush: `${settings.segmentFlushMins}m`,
      microSummaryInterval: `${settings.microSummaryIntervalMins}m`,
      sessionSummaryInterval: `${settings.sessionSummaryIntervalMins}m`,
    });

    try {
      const sessionId = await capture.startCapture(settings, {
        onEvent: (msg) => ingestEvent(msg),
        onError: (err) => error(TAG, 'Capture stream error', err),
        onSessionActive: () => {
          log(TAG, 'Capture session activated by server');
        },
        onSessionStopped: () => {
          warn(TAG, 'Capture session stopped by server');
        },
        onExported: (videoId) => {
          log(TAG, `Video exported: ${videoId}`);
          const sid = capture.getSessionId();
          if (sid) {
            db.updateCaptureSession(sid, { videoId, status: 'exported' });
          }
        },
      }, screenId);

      db.insertCaptureSession({
        id: sessionId,
        startedAt: Math.floor(Date.now() / 1000),
        status: 'active',
      });

      startIngestion(sessionId, settings.segmentFlushMins);
      startIdleDetection(sessionId, settings.idleThresholdMins, (idle) => {
        log(TAG, `Idle state changed: ${idle ? 'IDLE' : 'ACTIVE'}`);
        sendToRenderer('idle-state', idle);
      });
      startPeriodicSummaries(
        sessionId,
        settings.microSummaryIntervalMins,
        settings.sessionSummaryIntervalMins,
      );
      setRecordingState(true);
      sendToRenderer('recording-state', 'recording' as RecordingState);

      log(TAG, `Recording started successfully (session: ${sessionId})`);
      return { sessionId };
    } catch (e) {
      error(TAG, 'capture:start failed', e);
      sendToRenderer('recording-state', 'idle' as RecordingState);
      setRecordingState(false);
      throw e;
    }
  });

  ipcMain.handle('capture:stop', async () => {
    log(TAG, 'capture:stop invoked');
    sendToRenderer('recording-state', 'stopping' as RecordingState);

    try {
      // 1. Stop idle detection and flush remaining events into segments FIRST
      stopIdleDetection();
      await flushToSegments();

      // 2. Now generate final summaries (activeSessionId is still set)
      await stopPeriodicSummaries();

      // 3. Stop ingestion and capture
      await stopIngestion();
      await capture.stopCapture();

      const sessionId = capture.getSessionId();
      if (sessionId) {
        db.updateCaptureSession(sessionId, {
          endedAt: Math.floor(Date.now() / 1000),
          status: 'stopped',
        });
      }

      log(TAG, 'Recording stopped');
    } catch (e) {
      error(TAG, 'capture:stop failed', e);
    } finally {
      setRecordingState(false);
      sendToRenderer('recording-state', 'idle' as RecordingState);
    }
  });

  ipcMain.handle('capture:status', () => {
    const session = db.getActiveCaptureSession();
    return {
      recording: capture.isRecording(),
      sessionId: session?.id,
      startedAt: session?.startedAt,
    };
  });

  // ── Summaries ──

  ipcMain.handle('summary:generateNow', async () => {
    log(TAG, 'summary:generateNow invoked');
    try {
      const result = await generateOnDemandSummary();
      log(TAG, `summary:generateNow result: "${result.slice(0, 80)}..."`);
      return result;
    } catch (e) {
      error(TAG, 'summary:generateNow failed', e);
      return 'Failed to generate summary. Check logs for details.';
    }
  });

  ipcMain.handle('summary:daily', async (_e, date: string) => {
    log(TAG, `summary:daily requested for ${date}`);
    let daily = db.getDailySummary(date);
    if (!daily) {
      log(TAG, 'No cached daily summary, generating...');
      daily = await generateDailySummary(date);
    }
    log(TAG, `summary:daily result: ${daily ? 'found' : 'null'}`);
    return daily;
  });

  ipcMain.handle('summary:session-list', (_e, date: string) => {
    const sessions = db.getSessionSummaries(date);
    log(TAG, `summary:session-list for ${date}: ${sessions.length} session(s)`);
    return sessions;
  });

  ipcMain.handle(
    'summary:micro-list',
    (_e, start: number, end: number) => {
      const micros = db.getMicroSummaries(start, end);
      log(TAG, `summary:micro-list [${start}-${end}]: ${micros.length} micro(s)`);
      return micros;
    },
  );

  ipcMain.handle(
    'summary:segments',
    (_e, start: number, end: number) => {
      const segments = db.getActivitySegments(start, end);
      log(TAG, `summary:segments [${start}-${end}]: ${segments.length} segment(s)`);
      return segments;
    },
  );

  ipcMain.handle(
    'summary:deep-dive',
    async (_e, start: number, end: number) => {
      log(TAG, `summary:deep-dive [${start}-${end}]`);
      return await generateDeepDive(start, end);
    },
  );

  // ── Dashboard ──

  ipcMain.handle('dashboard:today', () => {
    const date = db.todayDateString();
    const totalTracked = db.getTotalTrackedForDate(date);
    const totalIdle = Math.min(db.getIdleSecsForDate(date), totalTracked);
    const raw = db.getProductiveSecsForDate(date);
    // Cap productive + distracted to never exceed tracked time
    const activeTime = Math.max(0, totalTracked - totalIdle);
    const productive = Math.min(raw.productive, activeTime);
    const distracted = Math.min(raw.distracted, Math.max(0, activeTime - productive));
    const segments = db.getSegmentsForDate(date);
    const appUsage = db.getAppUsageForDate(date);
    const topProjects = db.getProjectsForDate(date);
    const session = db.getActiveCaptureSession();

    let latestSummary: string | undefined;
    if (session) {
      const latest = db.getLatestMicroSummary(session.id);
      if (latest) latestSummary = latest.summary;
    }

    return {
      date,
      totalTrackedSecs: totalTracked,
      totalIdleSecs: totalIdle,
      totalProductiveSecs: productive,
      totalDistractedSecs: distracted,
      isRecording: capture.isRecording(),
      currentSessionId: session?.id,
      latestSummary,
      segments,
      appUsage,
      topProjects,
    };
  });

  ipcMain.handle('dashboard:app-usage', (_e, date: string) => {
    return db.getAppUsageForDate(date);
  });

  // ── Settings ──

  ipcMain.handle('settings:get', () => {
    return db.getSettings();
  });

  ipcMain.handle('settings:update', (_e, partial: Partial<Settings>) => {
    log(TAG, 'settings:update', partial);
    db.updateSettings(partial);
  });

  log(TAG, 'All IPC handlers registered');
}
