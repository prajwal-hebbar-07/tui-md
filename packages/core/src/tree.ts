import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { ReadResult, TreeNode, TreeResult } from './model.js'

export type { ReadResult, TreeNode, TreeResult }

const IGNORE = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
])

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz',
  '.wasm', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3', '.mov', '.exe',
  '.dmg', '.bin',
])

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.css': 'text/css',
  '.html': 'text/html',
}

export function contentType(file: string): string {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
}

export function safePath(root: string, rel: string): string | null {
  if (!rel || rel.includes('\0') || path.isAbsolute(rel)) return null
  let rootReal: string
  try {
    rootReal = fs.realpathSync(root)
  } catch {
    return null
  }
  const normalized = rel.split('\\').join('/')
  const abs = path.resolve(rootReal, normalized)
  const check = (candidate: string) => {
    const relOut = path.relative(rootReal, candidate)
    return relOut.startsWith('..') || path.isAbsolute(relOut)
  }
  if (check(abs)) return null
  if (fs.existsSync(abs)) {
    try {
      const real = fs.realpathSync(abs)
      if (check(real)) return null
      return real
    } catch {
      return null
    }
  }
  return abs
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })
}

export function listTree(root: string): TreeResult {
  const rootReal = fs.realpathSync(root)
  const budget = { left: 4000, truncated: false }

  const walk = (dir: string, rel: string, depth: number): TreeNode[] => {
    if (depth > 12 || budget.left <= 0) {
      budget.truncated = true
      return []
    }
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return []
    }
    const nodes: TreeNode[] = []
    for (const entry of entries) {
      if (budget.left <= 0) {
        budget.truncated = true
        break
      }
      if (IGNORE.has(entry.name)) continue
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      const abs = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        budget.left -= 1
        nodes.push({
          name: entry.name,
          path: childRel,
          kind: 'dir',
          children: walk(abs, childRel, depth + 1),
        })
      } else if (entry.isFile()) {
        budget.left -= 1
        nodes.push({ name: entry.name, path: childRel, kind: 'file' })
      }
    }
    return sortNodes(nodes)
  }

  return {
    name: path.basename(rootReal) || rootReal,
    nodes: walk(rootReal, '', 0),
    truncated: budget.truncated,
  }
}

export function readTextFile(root: string, rel: string): ReadResult {
  const abs = safePath(root, rel)
  if (!abs) return { ok: false, error: 'That path is outside the open folder.' }
  let stat: fs.Stats
  try {
    stat = fs.statSync(abs)
  } catch {
    return { ok: false, error: 'File not found.' }
  }
  if (!stat.isFile()) return { ok: false, error: 'Not a file.' }
  if (BINARY_EXT.has(path.extname(abs).toLowerCase())) {
    return { ok: true, text: '', truncated: false, binary: true, eol: 'LF' }
  }
  const fd = fs.openSync(abs, 'r')
  try {
    const size = Math.min(stat.size, 400_000)
    const buf = Buffer.alloc(size)
    fs.readSync(fd, buf, 0, size, 0)
    if (buf.subarray(0, Math.min(buf.length, 8000)).includes(0)) {
      return { ok: true, text: '', truncated: false, binary: true, eol: 'LF' }
    }
    const raw = buf.toString('utf8')
    const eol = raw.includes('\r\n') ? 'CRLF' : 'LF'
    const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    return { ok: true, text, truncated: stat.size > 400_000, binary: false, eol }
  } finally {
    fs.closeSync(fd)
  }
}

function gitPrefix(root: string): string {
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const rel = path.relative(fs.realpathSync(top), fs.realpathSync(root))
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return ''
    return `${rel.split(path.sep).join('/')}/`
  } catch {
    return ''
  }
}

export function gitChanges(root: string): Record<string, string> {
  let out = ''
  const prefix = gitPrefix(root)
  try {
    out = execFileSync('git', ['status', '--porcelain', '-uall', '--', '.'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return {}
  }
  const changes: Record<string, string> = {}
  for (const line of out.split('\n')) {
    if (line.length < 4) continue
    const code = line.slice(0, 2)
    let file = line.slice(3).trim()
    if (file.includes(' -> ')) file = file.split(' -> ').pop() || file
    file = file.replace(/^"|"$/g, '').replace(/^\.\//, '').split('\\').join('/')
    if (prefix && file.startsWith(prefix)) file = file.slice(prefix.length)
    const badge = code.includes('?') ? 'U' : code.includes('D') ? 'D' : code.includes('A') ? 'A' : 'M'
    changes[file] = badge
  }
  return changes
}
