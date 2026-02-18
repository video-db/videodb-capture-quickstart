import { app, BrowserWindow, shell, nativeImage } from 'electron';
import path from 'path';
import 'dotenv/config';
import { loadConfig, getConfig } from './services/config';
import { initDatabase } from './services/database';
import { registerIPCHandlers, initServices, setMainWindow } from './ipc-handlers';
import { createTray, destroyTray, setRecordingState } from './tray';
import { cleanupStaleRecorder } from './services/capture';
import { log, error } from './services/logger';

const TAG = 'MAIN';
let mainWindow: BrowserWindow | null = null;

process.on('unhandledRejection', (reason) => {
  error(TAG, 'Unhandled promise rejection', reason);
});

process.on('uncaughtException', (err) => {
  error(TAG, 'Uncaught exception', err);
});

// Set app name BEFORE ready event so macOS dock shows the correct name
try {
  const earlyCfg = loadConfig();
  app.name = earlyCfg.app.name;
} catch {
  app.name = 'VideoDB Focusd';
}

function createWindow(): BrowserWindow {
  const cfg = getConfig();
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: cfg.app.name,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#F8F6F3',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.on('ready-to-show', () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
}

app.whenReady().then(async () => {
  log(TAG, '========================================');
  log(TAG, `Electron ${process.versions.electron}, Node ${process.versions.node}`);
  log(TAG, `userData: ${app.getPath('userData')}`);
  log(TAG, '========================================');

  let cfg;
  try {
    cfg = getConfig(); // already loaded early for app.name
    log(TAG, `Config loaded: ${cfg.app.name} v${app.getVersion()} by ${cfg.app.author}`);
    log(TAG, `LLM model: ${cfg.llm.model}`);
  } catch (e) {
    error(TAG, 'Failed to load config.yaml', e);
  }

  try {
    initDatabase();
    log(TAG, 'Database initialized');
  } catch (e) {
    error(TAG, 'Failed to initialize database', e);
  }

  // Set macOS dock icon (dev mode uses Electron's default icon otherwise)
  if (process.platform === 'darwin') {
    const iconPath = path.join(__dirname, '../../assets/icon.png');
    try {
      const dockIcon = nativeImage.createFromPath(iconPath);
      if (!dockIcon.isEmpty()) {
        app.dock.setIcon(dockIcon);
        log(TAG, `Dock icon set from ${iconPath}`);
      } else {
        log(TAG, `Dock icon file empty or not found: ${iconPath}`);
      }
    } catch (e) {
      error(TAG, 'Failed to set dock icon', e);
    }
  }

  registerIPCHandlers();
  await initServices();

  mainWindow = createWindow();
  setMainWindow(mainWindow);

  createTray({
    onStartRecording: () => {
      mainWindow?.webContents.send('tray-action', 'start');
    },
    onStopRecording: () => {
      mainWindow?.webContents.send('tray-action', 'stop');
    },
    onOpenDashboard: () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      } else {
        mainWindow = createWindow();
        setMainWindow(mainWindow);
      }
    },
    onQuit: () => {
      destroyTray();
      app.quit();
    },
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      setMainWindow(mainWindow);
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS, keep running in tray
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  cleanupStaleRecorder();
  destroyTray();
});
