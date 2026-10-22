import fs from 'node:fs'
import path from 'node:path'
import { render } from 'ink'
import React from 'react'
import { isMermaidFile, linesToAnsi, renderDocument, renderMermaid } from '@tui-md/core'
import pkg from '../package.json' with { type: 'json' }
import { App } from './App.js'

const VERSION = pkg.version

function help() {
  console.log(`tui-md ${VERSION}

Open a folder or a markdown file in a terminal viewer.

  tui-md [path]
  tui-md --dump <file.md> [--width 100]

Keys
  ↑↓ j k     move in the file tree, or scroll the preview
  ← →        collapse and expand folders, or pan a wide diagram
  tab        switch between the tree and the preview
  enter      expand a folder, or focus the preview
  s          toggle preview and source for markdown
  / ctrl+f   find in the open file
  n N        next and previous match
  ctrl+p     filter files
  g G        top and bottom of the preview
  q          quit
`)
}

const args = process.argv.slice(2)
let dump = false
let width = process.stdout.columns || 100
const positionals: string[] = []

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--help' || arg === '-h') {
    help()
    process.exit(0)
  } else if (arg === '--version' || arg === '-v') {
    console.log(VERSION)
    process.exit(0)
  } else if (arg === '--dump') dump = true
  else if (arg === '--width') width = Number(args[++i] || width)
  else if (arg.startsWith('-')) {
    console.error(`Unknown option ${arg}`)
    process.exit(1)
  } else positionals.push(arg)
}

const target = path.resolve(positionals[0] || process.cwd())
if (!fs.existsSync(target)) {
  console.error(`No such file or folder: ${target}`)
  process.exit(1)
}

const stat = fs.statSync(target)
if (dump) {
  if (!stat.isFile()) {
    console.error('--dump needs a file')
    process.exit(1)
  }
  const text = fs.readFileSync(target, 'utf8')
  if (isMermaidFile(target)) process.stdout.write(`${renderMermaid(text, width).join('\n')}\n`)
  else process.stdout.write(`${linesToAnsi(renderDocument(text, width))}\n`)
  process.exit(0)
}

if (!process.stdout.isTTY) {
  console.error('tui-md needs a terminal. Use --dump <file.md> to print a file.')
  process.exit(1)
}

const root = stat.isDirectory() ? target : path.dirname(target)
const initialFile = stat.isDirectory() ? undefined : path.relative(root, target).split(path.sep).join('/')

process.stdout.write('\u001b[?1049h')
try {
  await render(<App root={root} initialFile={initialFile} />).waitUntilExit()
} finally {
  process.stdout.write('\u001b[?1049l')
}
console.log('tui-md closed')
