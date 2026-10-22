import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { bubbleGit } from '../../packages/core/src/model.ts'
import { contentType, createEntry, gitChanges, listTree, readTextFile, removeEntry, renameEntry, safePath } from '../../packages/core/src/tree.ts'

const here = path.dirname(fileURLToPath(import.meta.url))

function findExamples() {
  let dir = process.cwd()
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'examples')
    if (fs.existsSync(path.join(candidate, 'README.md'))) return candidate
    dir = path.dirname(dir)
  }
  return path.resolve(here, '../../examples')
}

function fileApi(): Plugin {
  const root = findExamples()
  return {
    name: 'tui-md-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1')
        const send = (body: unknown, status = 200) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (url.pathname === '/api/root') {
          send({ name: path.basename(root), path: root })
          return
        }
        if (url.pathname === '/api/tree') {
          send(listTree(root, { keepEmpty: true }))
          return
        }
        if (url.pathname === '/api/git') {
          const listed = listTree(root, { keepEmpty: true })
          send(bubbleGit(listed.nodes, gitChanges(root)))
          return
        }
        if (url.pathname === '/api/file') {
          send(readTextFile(root, url.searchParams.get('path') || ''))
          return
        }
        if (req.method === 'POST' && url.pathname === '/api/create') {
          send(createEntry(root, url.searchParams.get('path') || '', url.searchParams.get('kind') === 'dir' ? 'dir' : 'file'))
          return
        }
        if (req.method === 'POST' && url.pathname === '/api/rename') {
          send(renameEntry(root, url.searchParams.get('from') || '', url.searchParams.get('to') || ''))
          return
        }
        if (req.method === 'POST' && url.pathname === '/api/remove') {
          send(removeEntry(root, url.searchParams.get('path') || ''))
          return
        }
        if (url.pathname === '/api/asset') {
          const abs = safePath(root, url.searchParams.get('path') || '')
          if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
            res.statusCode = 404
            res.end('Not found')
            return
          }
          res.statusCode = 200
          res.setHeader('Content-Type', contentType(abs))
          fs.createReadStream(abs).pipe(res)
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), fileApi()],
  resolve: {
    alias: {
      '@tui-md/core': path.resolve(here, '../../packages/core/src/browser.ts'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    fs: { allow: [path.resolve(here, '../..')] },
  },
})
