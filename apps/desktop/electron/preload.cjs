const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('tuiMd', {
  platform: process.platform,
  getRoot: () => ipcRenderer.invoke('root'),
  list: () => ipcRenderer.invoke('tree'),
  git: () => ipcRenderer.invoke('git'),
  read: (rel) => ipcRenderer.invoke('read', rel),
  openFolder: () => ipcRenderer.invoke('open-folder'),
})
