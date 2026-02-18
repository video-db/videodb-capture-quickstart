import { contextBridge, ipcRenderer } from 'electron';
import type { FocusdAPI, RecordingState, MicroSummary, Settings } from '../shared/types';

const api: FocusdAPI = {
  app: {
    info: () => ipcRenderer.invoke('app:info'),
  },
  onboarding: {
    state: () => ipcRenderer.invoke('onboarding:state'),
    validateKey: (apiKey) => ipcRenderer.invoke('onboarding:validateKey', apiKey),
    saveKey: (apiKey) => ipcRenderer.invoke('onboarding:saveKey', apiKey),
    clearKey: () => ipcRenderer.invoke('onboarding:clearKey'),
    complete: () => ipcRenderer.invoke('onboarding:complete'),
    getPermissions: () => ipcRenderer.invoke('onboarding:getPermissions'),
    requestMicPermission: () => ipcRenderer.invoke('onboarding:requestMicPermission'),
    openScreenPermissions: () => ipcRenderer.invoke('onboarding:openScreenPermissions'),
    openMicPermissions: () => ipcRenderer.invoke('onboarding:openMicPermissions'),
    getKeyInfo: () => ipcRenderer.invoke('onboarding:getKeyInfo'),
  },
  capture: {
    start: (screenId?: string) => ipcRenderer.invoke('capture:start', screenId),
    stop: () => ipcRenderer.invoke('capture:stop'),
    status: () => ipcRenderer.invoke('capture:status'),
    listScreens: () => ipcRenderer.invoke('capture:listScreens'),
  },
  summary: {
    generateNow: () => ipcRenderer.invoke('summary:generateNow'),
    daily: (date) => ipcRenderer.invoke('summary:daily', date),
    sessionList: (date) => ipcRenderer.invoke('summary:session-list', date),
    microList: (start, end) => ipcRenderer.invoke('summary:micro-list', start, end),
    segments: (start, end) => ipcRenderer.invoke('summary:segments', start, end),
    deepDive: (start, end) => ipcRenderer.invoke('summary:deep-dive', start, end),
  },
  dashboard: {
    today: () => ipcRenderer.invoke('dashboard:today'),
    appUsage: (date) => ipcRenderer.invoke('dashboard:app-usage', date),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (s) => ipcRenderer.invoke('settings:update', s),
  },
  onRecordingStateChange: (cb: (state: RecordingState) => void) => {
    const handler = (_: Electron.IpcRendererEvent, state: RecordingState) => cb(state);
    ipcRenderer.on('recording-state', handler);
    return () => ipcRenderer.removeListener('recording-state', handler);
  },
  onNewSummary: (cb: (summary: MicroSummary) => void) => {
    const handler = (_: Electron.IpcRendererEvent, summary: MicroSummary) => cb(summary);
    ipcRenderer.on('new-summary', handler);
    return () => ipcRenderer.removeListener('new-summary', handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
