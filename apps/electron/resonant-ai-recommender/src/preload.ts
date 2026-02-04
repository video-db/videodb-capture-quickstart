import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('resonant', {
  onRecommendations: (callback: (recommendations: any[]) => void) => {
    ipcRenderer.on('recommendations', (_event, data) => callback(data));
  },
  onCapturingStatus: (callback: (capturing: boolean) => void) => {
    ipcRenderer.on('capturing-status', (_event, status) => callback(status));
  },
  startCapture: () => ipcRenderer.send('start-capture'),
  stopCapture: () => ipcRenderer.send('stop-capture'),
  openUrl: (url: string) => ipcRenderer.send('open-url', url),
  hideWindow: () => ipcRenderer.send('hide-window'),
});
