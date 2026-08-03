const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startCapture: (url, apiKey) => ipcRenderer.send('start-capture', url, apiKey),
  openFolder: (path) => ipcRenderer.send('open-folder', path),
  onStatus: (callback) => ipcRenderer.on('capture-status', (event, data) => callback(data)),
  onComplete: (callback) => ipcRenderer.on('capture-complete', (event, path) => callback(path)),
  onError: (callback) => ipcRenderer.on('capture-error', (event, error) => callback(error))
});
