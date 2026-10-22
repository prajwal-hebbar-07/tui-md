import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron'
import { bubbleGit, contentType, createEntry, gitChanges, listTree, readTextFile, removeEntry, renameEntry, safePath } from '@tui-md/core'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dev = process.argv.includes('--dev')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'tumd-asset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
])

function findStartRoot() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--dev' && !arg.startsWith('-') && fs.existsSync(arg))
  if (args[0]) return path.resolve(args[0])
  if (app.isPackaged) return null
  let dir = process.cwd()
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'examples')
    if (fs.existsSync(path.join(candidate, 'README.md'))) return candidate
    dir = path.dirname(dir)
  }
  return process.cwd()
}

let root = findStartRoot()
const treeOptions = { keepEmpty: true }

function webPreferences() {
  return {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  }
}

function attach(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http://127.0.0.1:5173') || url.startsWith('file:')) return
    event.preventDefault()
    shell.openExternal(url)
  })
}

function rootInfo() {
  if (!root) return null
  return { name: path.basename(root) || root, path: root }
}

function createWindow() {
  const mac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 860,
    minHeight: 520,
    backgroundColor: '#1e1e1e',
    title: 'tui-md',
    ...(mac ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 12 } } : {}),
    webPreferences: webPreferences(),
  })

  attach(win)

  if (dev) win.loadURL('http://127.0.0.1:5173')
  else win.loadFile(path.join(__dirname, '../dist/index.html'))
}

app.whenReady().then(() => {
  protocol.handle('tumd-asset', (request) => {
    const rel = new URL(request.url).searchParams.get('path') || ''
    const abs = root ? safePath(root, rel) : null
    if (!abs || !fs.existsSync(abs)) return new Response('Not found', { status: 404 })
    const body = fs.readFileSync(abs)
    return new Response(body, { headers: { 'content-type': contentType(abs) } })
  })

  ipcMain.handle('root', () => rootInfo())
  ipcMain.handle('tree', () => (root ? listTree(root, treeOptions) : { name: '', nodes: [], truncated: false }))
  ipcMain.handle('git', () => {
    if (!root) return {}
    const listed = listTree(root, treeOptions)
    return bubbleGit(listed.nodes, gitChanges(root))
  })
  ipcMain.handle('read', (_event, rel) =>
    root ? readTextFile(root, String(rel || '')) : { ok: false, error: 'No folder open' },
  )
  ipcMain.handle('create', (_event, rel, kind) =>
    root ? createEntry(root, String(rel || ''), kind === 'dir' ? 'dir' : 'file') : { ok: false, error: 'No folder open' },
  )
  ipcMain.handle('rename', (_event, from, to) =>
    root ? renameEntry(root, String(from || ''), String(to || '')) : { ok: false, error: 'No folder open' },
  )
  ipcMain.handle('remove', (_event, rel) =>
    root ? removeEntry(root, String(rel || '')) : { ok: false, error: 'No folder open' },
  )
  ipcMain.handle('open-folder', async () => {
    const parent = BrowserWindow.getFocusedWindow() ?? undefined
    const result = await dialog.showOpenDialog(parent, { properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    root = result.filePaths[0]
    return rootInfo()
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
