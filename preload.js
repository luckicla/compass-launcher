const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('api', {
  call: (n, ...a) => ipcRenderer.invoke('call', n, ...a),
  on: (ch, cb) => { const f = (_, d) => cb(d); ipcRenderer.on(ch, f); return () => ipcRenderer.removeListener(ch, f); },
  pathOf: f => { try { return webUtils.getPathForFile(f); } catch { return ''; } },
});
