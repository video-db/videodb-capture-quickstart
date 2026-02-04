import 'dotenv/config';
import { app, BrowserWindow, shell, ipcMain, screen } from 'electron';
import * as path from 'path';
import { TrayManager } from './tray';
import { VideoDBService } from './services/videodb';
import { AnthropicService } from './services/anthropic';
import type { AppConfig, ArticleRecommendation } from './types';

// Load configuration
const config: AppConfig = {
  videodb: {
    apiKey: process.env.VIDEODB_API_KEY || '',
    collectionId: process.env.VIDEODB_COLLECTION_ID || 'default',
    baseUrl: process.env.VIDEODB_BASE_URL || 'https://api.videodb.io',
  },
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  recommendationInterval: parseInt(process.env.RECOMMENDATION_INTERVAL || '120000', 10),
};

// Validate required config
if (!config.videodb.apiKey) {
  console.error('VIDEODB_API_KEY is required. Set it in your .env file.');
  process.exit(1);
}
if (!config.anthropicApiKey) {
  console.error('ANTHROPIC_API_KEY is required. Set it in your .env file.');
  process.exit(1);
}

let trayManager: TrayManager | null = null;
let videodbService: VideoDBService | null = null;
let anthropicService: AnthropicService | null = null;
let recommendationTimer: NodeJS.Timeout | null = null;
let popupWindow: BrowserWindow | null = null;
let currentRecommendations: ArticleRecommendation[] = [];
let capturingStatus: boolean | 'loading' = false;

function createPopupWindow(): BrowserWindow {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width: 420,
    height: 500,
    x: screenWidth - 440,
    y: 40,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Keep window on all workspaces so it doesn't switch spaces
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Hide window when it loses focus
  win.on('blur', () => {
    win.hide();
  });

  return win;
}

function showPopup(): void {
  if (!popupWindow) {
    popupWindow = createPopupWindow();
  }

  if (popupWindow.isVisible()) {
    popupWindow.hide();
  } else {
    // Get the display where the cursor is
    const cursorPoint = screen.getCursorScreenPoint();
    const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
    const { width: displayWidth, x: displayX } = currentDisplay.workArea;

    // Position near tray (top right of current display)
    popupWindow.setPosition(displayX + displayWidth - 440, 40);
    popupWindow.showInactive(); // Show without stealing focus from other apps
    popupWindow.focus();

    // Send current state to renderer
    popupWindow.webContents.send('capturing-status', capturingStatus);
    popupWindow.webContents.send('recommendations', currentRecommendations);
  }
}

function showRecommendations(recommendations: ArticleRecommendation[]): void {
  if (recommendations.length === 0) return;

  currentRecommendations = recommendations;
  console.log('[Main] Updating with recommendations');
  trayManager?.setRecommendations(recommendations);

  // Send to popup if it exists
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.webContents.send('recommendations', recommendations);
  }
}

async function triggerRecommendations(): Promise<void> {
  if (!videodbService || !anthropicService) {
    console.log('[Main] Services not ready, skipping recommendations');
    return;
  }

  if (!videodbService.capturing) {
    console.log('[Main] Not capturing, skipping recommendations');
    return;
  }

  const totalEvents = videodbService.getTotalSceneEventCount();
  const recentEvents = videodbService.getRecentSceneEvents(config.recommendationInterval);

  console.log(`[Main] Recommendation check: ${recentEvents.length} recent events (${totalEvents} total)`);

  if (recentEvents.length === 0) {
    console.log('[Main] No recent screen activity, skipping recommendations');
    return;
  }

  try {
    console.log(`[Main] Getting recommendations based on ${recentEvents.length} scene events`);
    const recommendations = await anthropicService.getArticleRecommendations(recentEvents);

    if (recommendations.length > 0) {
      console.log('[Main] Showing recommendations:', recommendations.map(r => r.title).join(', '));
      showRecommendations(recommendations);
    } else {
      console.log('[Main] No recommendations returned from API');
    }
  } catch (e) {
    console.error('[Main] Error getting recommendations:', e);
  }
}

let recommendationCount = 0;

async function startCapture(): Promise<void> {
  if (!videodbService) return;

  // Show loading state immediately
  capturingStatus = 'loading';
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.webContents.send('capturing-status', 'loading');
  }

  try {
    await videodbService.startCapture();
    trayManager?.setCapturing(true);
    recommendationCount = 0;
    capturingStatus = true;

    // Notify popup - recording started
    if (popupWindow && !popupWindow.isDestroyed()) {
      popupWindow.webContents.send('capturing-status', true);
    }

    // Start periodic recommendations
    recommendationTimer = setInterval(async () => {
      recommendationCount++;
      console.log(`[Main] --- Recommendation cycle #${recommendationCount} ---`);
      await triggerRecommendations();
    }, config.recommendationInterval);

    console.log(`[Main] Recommendations will appear every ${config.recommendationInterval / 1000} seconds`);
  } catch (e) {
    console.error('[Main] Failed to start capture:', e);
  }
}

async function stopCapture(): Promise<void> {
  if (recommendationTimer) {
    clearInterval(recommendationTimer);
    recommendationTimer = null;
  }

  await videodbService?.stopCapture();
  trayManager?.setCapturing(false);
  capturingStatus = false;

  // Notify popup
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.webContents.send('capturing-status', false);
  }
}

async function quitApp(): Promise<void> {
  console.log('[Main] Quitting application...');
  await stopCapture();
  await videodbService?.shutdown();
  trayManager?.destroy();
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.destroy();
  }
  app.quit();
}

async function initialize(): Promise<void> {
  console.log('\n========================================');
  console.log('  Resonant - Starting');
  console.log('========================================\n');

  // Initialize services
  videodbService = new VideoDBService(config.videodb);
  anthropicService = new AnthropicService(config.anthropicApiKey);

  await videodbService.initialize();

  // Set up IPC handlers
  ipcMain.on('start-capture', () => startCapture());
  ipcMain.on('stop-capture', () => stopCapture());
  ipcMain.on('open-url', (_event, url: string) => shell.openExternal(url));
  ipcMain.on('hide-window', () => popupWindow?.hide());

  // Set up tray
  trayManager = new TrayManager({
    onStart: startCapture,
    onStop: stopCapture,
    onQuit: quitApp,
    onTogglePopup: showPopup,
  });
  trayManager.create();

  console.log('[Main] Application ready. Click tray icon to open Resonant.');
}

// Electron app lifecycle
app.whenReady().then(initialize).catch((e) => {
  console.error('[Main] Initialization failed:', e);
  process.exit(1);
});

app.on('window-all-closed', () => {
  // Prevent app from quitting when no windows (we're tray-only)
  // On macOS, apps typically stay active until explicitly quit
});

// Handle shutdown signals
process.on('SIGINT', () => quitApp());
process.on('SIGTERM', () => quitApp());
