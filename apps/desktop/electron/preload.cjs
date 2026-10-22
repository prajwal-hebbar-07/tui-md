const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('tuiMd', {
  platform: process.platform,
  getRoot: () => ipcRenderer.invoke('root'),
  list: () => ipcRenderer.invoke('tree'),
  git: () => ipcRenderer.invoke('git'),
  read: (rel) => ipcRenderer.invoke('read', rel),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  create: (rel, kind) => ipcRenderer.invoke('create', rel, kind),
  rename: (from, to) => ipcRenderer.invoke('rename', from, to),
  remove: (rel) => ipcRenderer.invoke('remove', rel),
  openDiagram: (source) => ipcRenderer.invoke('open-diagram', source),
  diagramSource: (id) => ipcRenderer.invoke('diagram-source', id),
})
