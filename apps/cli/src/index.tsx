import fs from 'node:fs'
import path from 'node:path'
import { render } from 'ink'
import React from 'react'
import { isMermaidFile, linesToAnsi, linesToPlain, readHistory, renderDocument, renderMermaid } from '@tui-md/core'
import pkg from '../package.json' with { type: 'json' }
import { App } from './App.js'

const VERSION = pkg.version

function help() {
  console.log(`tui-md ${VERSION}

Read markdown in the terminal. A folder opens the file picker. A file opens that file.

  tui-md [path]
  tui-md --picker [dir]
  tui-md --history
  tui-md --last
  tui-md --watch file.md
  tui-md --inline [plain|ansi|N] file.md

Keys
  j k        scroll the file
  t          show or hide the outline
  J K        next and previous heading
  1-9        jump to a heading
  ctrl+p     file picker
  P          folder browser
  H          recent files
  /          find          n N  next and previous match
  w          watch the file for saves
  ctrl+e     open the file in $EDITOR
  s          preview or source
  q          quit
`)
}

type Screen = 'read' | 'fuzzy' | 'browser' | 'history'

const args = process.argv.slice(2)
let dump = false
let inline: string | undefined
let width = process.stdout.columns || 100
let watch = false
let picker = false
let history = false
let last = false
let fuzzy = ''
let editor: string | undefined
const positionals: string[] = []

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--help' || arg === '-h') {
    help()
    process.exit(0)
  } else if (arg === '--version' || arg === '-v' || arg === '-V') {
    console.log(VERSION)
    process.exit(0)
  } else if (arg === '--dump' || arg === '--inline') {
    dump = true
    const next = args[i + 1]
    if (arg === '--inline' && next && !next.startsWith('-')) inline = args[++i]
  } else if (arg === '--width') width = Number(args[++i] || width)
  else if (arg === '--watch' || arg === '-w') watch = true
  else if (arg === '--picker') picker = true
  else if (arg === '--history' || arg === '-H') history = true
  else if (arg === '--last' || arg === '-l') last = true
  else if (arg === '--fuzzy') fuzzy = args[++i] || ''
  else if (arg === '--editor' || arg === '-e') editor = args[++i] || editor
  else if (arg === '--') {
    positionals.push(...args.slice(i + 1))
    break
  } else if (arg.startsWith('-')) {
    console.error(`Unknown option ${arg}`)
    process.exit(1)
  } else positionals.push(arg)
}

const stdinText = await readStdin()

if (last && !positionals.length && stdinText == null) {
  const recent = readHistory().find((item) => {
    try {
      return fs.statSync(item).isFile()
    } catch {
      return false
    }
  })
  if (!recent) {
    console.error('No recent file')
    process.exit(1)
  }
  positionals.push(recent)
}

if (!process.stdout.isTTY || dump) {
  const fromStdin = stdinText != null && !positionals.length
  if (!fromStdin) {
    const target = path.resolve(positionals[0] || '')
    if (!positionals[0] || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      console.error(dump ? '--inline needs a file' : 'tui-md needs a terminal, or a file to print')
      process.exit(1)
    }
    writeOut(fs.readFileSync(target, 'utf8'), target, inline, width)
  } else writeOut(stdinText || '', 'stdin.md', inline, width)
  process.exit(0)
}

if (stdinText != null && !positionals.length) {
  await launch(process.cwd(), undefined, 'read', stdinText)
} else {
  const target = path.resolve(positionals[0] || process.cwd())
  if (!fs.existsSync(target)) {
    console.error(`No such file or folder: ${target}`)
    process.exit(1)
  }
  const stat = fs.statSync(target)
  if (!stat.isDirectory() && !stat.isFile()) {
    console.error(`Not a file or folder: ${target}`)
    process.exit(1)
  }
  const root = stat.isDirectory() ? target : path.dirname(target)
  const initialFile = stat.isDirectory() ? undefined : path.relative(root, target).split(path.sep).join('/')
  let screen: Screen = initialFile ? 'read' : 'fuzzy'
  if (!initialFile && picker) screen = 'browser'
  if (!initialFile && history) screen = 'history'
  await launch(root, initialFile, screen, undefined)
}

async function launch(root: string, initialFile: string | undefined, initialScreen: Screen, piped: string | undefined) {
  process.stdout.write('\u001b[?1049h')
  try {
    await render(
      <App
        root={root}
        initialFile={initialFile}
        initialScreen={initialScreen}
        fuzzyQuery={fuzzy}
        watch={watch}
        editor={editor}
        stdinText={piped}
      />,
    ).waitUntilExit()
  } finally {
    process.stdout.write('\u001b[?1049l')
  }
  console.log('tui-md closed')
}

function writeOut(text: string, file: string, spec: string | undefined, fallback: number) {
  const { mode, columns } = inlineSpec(spec, fallback)
  const lines = isMermaidFile(file) ? renderMermaid(text, columns).map((line) => [{ text: line }]) : renderDocument(text, columns)
  process.stdout.write(`${mode === 'plain' ? linesToPlain(lines) : linesToAnsi(lines)}\n`)
}

function inlineSpec(spec: string | undefined, fallback: number): { mode: 'plain' | 'ansi'; columns: number } {
  let mode: 'plain' | 'ansi' = process.stdout.isTTY ? 'ansi' : 'plain'
  let columns = Number.isFinite(fallback) && fallback >= 20 ? fallback : 80
  if (!spec) return { mode, columns }
  const [kind, size] = spec.split(':')
  if (kind === 'plain' || kind === 'ansi') mode = kind
  else if (Number(kind) >= 20) columns = Number(kind)
  if (Number(size) >= 20) columns = Number(size)
  return { mode, columns }
}

async function readStdin(): Promise<string | null> {
  if (process.stdin.isTTY) return null
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of process.stdin) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.length
    if (total > 8 * 1024 * 1024) {
      console.error('stdin is larger than 8 MB')
      process.exit(1)
    }
    chunks.push(buf)
  }
  return Buffer.concat(chunks).toString('utf8')
}
