const { contextBridge, ipcRenderer } = require('electron');

// Expose Capture SDK API to renderer process
contextBridge.exposeInMainWorld('recorderAPI', {
    startSession: (sessionId, config) => ipcRenderer.invoke('recorder-start-recording', sessionId, config),
    stopSession: (sessionId) => ipcRenderer.invoke('recorder-stop-recording', sessionId),
    requestPermission: (type) => ipcRenderer.invoke('recorder-request-permission', type),
    pauseTracks: (sessionId, tracks) => ipcRenderer.invoke('recorder-pause-tracks', sessionId, tracks),
    resumeTracks: (sessionId, tracks) => ipcRenderer.invoke('recorder-resume-tracks', sessionId, tracks),
    onRecorderEvent: (callback) => ipcRenderer.on('recorder-event', (event, data) => callback(data)),
    showMeetingNotification: () => ipcRenderer.invoke('show-meeting-notification'),
    onStartFromNotification: (callback) => ipcRenderer.on('start-session-from-notification', () => callback()),
    getRecordings: () => ipcRenderer.invoke('get-recordings'),

    // Recording Lifecycle
    startRecording: (sessionId) => ipcRenderer.invoke('start-recording', sessionId),
    stopRecording: (sessionId) => ipcRenderer.invoke('stop-recording', sessionId),

    // Electron specific permission checks logic (optional fallback)
    checkMicPermission: () => ipcRenderer.invoke('check-mic-permission'),
    checkScreenPermission: () => ipcRenderer.invoke('check-screen-permission'),
    checkAccessibilityPermission: () => ipcRenderer.invoke('check-accessibility-permission'),
    requestMicPermission: () => ipcRenderer.invoke('request-mic-permission'),
    openPlayerWindow: (streamUrl) => ipcRenderer.invoke('open-player-window', streamUrl),

    // RTSP Relay (Low-Latency Streaming)
    startRtspRelay: (rtspUrl) => ipcRenderer.invoke('start-rtsp-relay', rtspUrl),
    stopRtspRelay: () => ipcRenderer.invoke('stop-rtsp-relay')
});

// Config API
contextBridge.exposeInMainWorld('configAPI', {
    getConfig: () => ipcRenderer.invoke('get-settings'),
    register: (data) => ipcRenderer.invoke('register', data),
    saveConfig: (settings) => ipcRenderer.invoke('save-config', settings),
    // specific update method for legacy support if needed
    updateConfig: (config) => ipcRenderer.invoke('config-update', config),
    logout: () => ipcRenderer.invoke('recorder-logout'),
    openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url),
    checkTunnelStatus: () => ipcRenderer.invoke('check-tunnel-status'),
    verifyConnection: () => ipcRenderer.invoke('verify-connection')
});
