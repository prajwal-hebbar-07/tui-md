import {
  layoutFlow,
  redirectGroupEdges,
  renderFlowchart,
  type Flow,
  type FlowEdge,
  type FlowNode,
} from './flowchart.js'
import { renderSequence } from './sequence.js'
import { centerText, wrapText } from './text.js'

type Shape = 'rect' | 'round' | 'stadium' | 'diamond' | 'sub' | 'cylinder' | 'circle' | 'hex' | 'odd'
type EdgeKind = 'arrow' | 'line' | 'dotted' | 'thick' | 'both'

type MNode = { id: string; label: string; shape: Shape }
type MEdge = { from: string; to: string; label: string; kind: EdgeKind }

const DIRS = new Set(['TD', 'TB', 'BT', 'LR', 'RL'])

function decode(text: string): string {
  return text
    .replace(/#quot;|&quot;/g, '"')
    .replace(/#39;|&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function cleanLabel(text: string): string {
  return decode(text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')
    .trim()
}

function kindOf(src: string): string {
  const line = src
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item && !item.startsWith('%%'))
  if (!line) return ''
  return line.split(/[\s{]/)[0].toLowerCase()
}

class Canvas {
  private rows: string[][] = []

  get(x: number, y: number): string {
    return this.rows[y]?.[x] ?? ' '
  }

  private grow(x: number, y: number) {
    while (this.rows.length <= y) this.rows.push([])
    const row = this.rows[y]
    while (row.length <= x) row.push(' ')
  }

  set(x: number, y: number, ch: string) {
    if (x < 0 || y < 0 || !ch) return
    this.grow(x, y)
    this.rows[y][x] = ch
  }

  line(x: number, y: number, ch: string) {
    if (x < 0 || y < 0) return
    const prev = this.get(x, y)
    this.set(x, y, merge(prev, ch))
  }

  text(x: number, y: number, value: string) {
    for (let i = 0; i < value.length; i++) this.set(x + i, y, value[i])
  }

  hline(y: number, x1: number, x2: number, ch = '─') {
    const a = Math.min(x1, x2)
    const b = Math.max(x1, x2)
    for (let x = a; x <= b; x++) this.line(x, y, ch)
  }

  vline(x: number, y1: number, y2: number, ch = '│') {
    const a = Math.min(y1, y2)
    const b = Math.max(y1, y2)
    for (let y = a; y <= b; y++) this.line(x, y, ch)
  }

  toLines(): string[] {
    while (this.rows.length && this.rows[0].every((ch) => ch === ' ')) this.rows.shift()
    while (this.rows.length && this.rows[this.rows.length - 1].every((ch) => ch === ' ')) this.rows.pop()
    return this.rows.map((row) => row.join('').replace(/\s+$/g, ''))
  }
}

function merge(prev: string, next: string): string {
  if (!prev || prev === ' ') return next
  if (prev === next) return prev
  const arrows = new Set(['▼', '▲', '◄', '►'])
  if (arrows.has(prev)) return prev
  if (arrows.has(next)) return next
  const vert = prev === '│' || prev === '┼'
  const horz = next === '─' || next === '┼'
  const vert2 = next === '│'
  const horz2 = prev === '─' || prev === '┼'
  if ((vert && horz) || (horz2 && vert2)) return '┼'
  if ((prev === '│' && next === '◄') || (prev === '◄' && next === '│')) return '┤'
  return next
}

function frame(
  lines: string[],
  chars: { tl: string; tr: string; bl: string; br: string; h: string; v: string },
): string[] {
  const textW = Math.max(1, ...lines.map((line) => line.length))
  const inner = textW + 2
  const top = chars.tl + chars.h.repeat(inner) + chars.tr
  const body = lines.map((line) => `${chars.v} ${line.padEnd(textW)} ${chars.v}`)
  const bot = chars.bl + chars.h.repeat(inner) + chars.br
  return [top, ...body, bot]
}

function equalize(lines: string[]): string[] {
  const width = Math.max(...lines.map((line) => line.length))
  return lines.map((line) => line.padEnd(width))
}

function diamond(lines: string[]): string[] {
  const textW = Math.max(4, ...lines.map((line) => line.length))
  const mid = lines.map((line) => {
    const pad = textW - line.length
    const left = Math.floor(pad / 2)
    return `╱${' '.repeat(left + 1)}${line}${' '.repeat(pad - left + 1)}╲`
  })
  const width = textW + 4
  const peak = centerText(`╱${'‾'.repeat(Math.max(2, textW - 2))}╲`, width)
  const top = centerText(`╱${'‾'.repeat(textW)}╲`, width)
  const bot = centerText(`╲${'_'.repeat(textW)}╱`, width)
  const foot = centerText(`╲${'_'.repeat(Math.max(2, textW - 2))}╱`, width)
  return equalize([peak, top, ...mid, bot, foot])
}

function nodeArt(node: MNode, maxInner: number): string[] {
  const wrapped = wrapText(node.label || node.id, Math.max(8, maxInner))
  if (node.shape === 'circle' && wrapped.length === 1 && wrapped[0].trim().length <= 2) {
    return [' ● ']
  }
  if (node.shape === 'diamond') return diamond(wrapped)
  if (node.shape === 'round' || node.shape === 'stadium' || node.shape === 'cylinder') {
    return frame(wrapped, { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' })
  }
  if (node.shape === 'sub') return frame(wrapped, { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' })
  if (node.shape === 'hex') {
    const textW = Math.max(1, ...wrapped.map((line) => line.length))
    const top = `╱${'‾'.repeat(textW + 2)}╲`
    const body = wrapped.map((line) => `│ ${line.padEnd(textW)} │`)
    const bot = `╲${'_'.repeat(textW + 2)}╱`
    return equalize([top, ...body, bot])
  }
  return frame(wrapped, { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' })
}

function findClose(s: string, i: number, close: string): number {
  let quote = ''
  for (let p = i; p < s.length; p++) {
    const ch = s[p]
    if (quote) {
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (s.startsWith(close, p)) return p
  }
  return -1
}

const OPENERS: { open: string; close: string; shape: Shape }[] = [
  { open: '[[', close: ']]', shape: 'sub' },
  { open: '[(', close: ')]', shape: 'cylinder' },
  { open: '([', close: '])', shape: 'stadium' },
  { open: '((', close: '))', shape: 'circle' },
  { open: '{{', close: '}}', shape: 'hex' },
  { open: '[/', close: '/]', shape: 'odd' },
  { open: '[/', close: '\\]', shape: 'odd' },
  { open: '[\\', close: '\\]', shape: 'odd' },
  { open: '[\\', close: '/]', shape: 'odd' },
  { open: '[', close: ']', shape: 'rect' },
  { open: '(', close: ')', shape: 'round' },
  { open: '{', close: '}', shape: 'diamond' },
  { open: '>', close: ']', shape: 'odd' },
]

function parseNode(s: string, i: number, nodes: Map<string, MNode>): { id: string; next: number } | null {
  while (s[i] === ' ' || s[i] === '\t') i++
  const match = /^([A-Za-z0-9_]+)/.exec(s.slice(i))
  if (!match) return null
  const id = match[1]
  i += id.length
  let node = nodes.get(id) ?? { id, label: id, shape: 'rect' as Shape }
  const rest = s.slice(i)
  for (const opener of OPENERS) {
    if (!rest.startsWith(opener.open)) continue
    const start = i + opener.open.length
    const end = findClose(s, start, opener.close)
    if (end === -1) continue
    node = { id, label: cleanLabel(s.slice(start, end)) || id, shape: opener.shape }
    i = end + opener.close.length
    break
  }
  nodes.set(id, node)
  return { id, next: i }
}

function parseEdge(s: string, i: number): { kind: EdgeKind; label: string; next: number } | null {
  while (s[i] === ' ' || s[i] === '\t') i++
  const rest = s.slice(i)
  let kind: EdgeKind | null = null
  let consumed = 0
  let label = ''
  const labeled = /^(--|==|-\.)\s+(.+?)\s+(-->|==>|\.->)/.exec(rest)
  if (labeled && !rest.startsWith('-->') && !rest.startsWith('==>') && !rest.startsWith('-.->')) {
    kind = labeled[1] === '==' ? 'thick' : labeled[1] === '-.' ? 'dotted' : 'arrow'
    label = labeled[2].trim()
    consumed = labeled[0].length
  } else {
    const ops: { re: RegExp; kind: EdgeKind }[] = [
      { re: /^<-->/, kind: 'both' },
      { re: /^-\.->/, kind: 'dotted' },
      { re: /^==>/, kind: 'thick' },
      { re: /^-->/, kind: 'arrow' },
      { re: /^---/, kind: 'line' },
      { re: /^--[ox]/, kind: 'arrow' },
      { re: /^->/, kind: 'arrow' },
    ]
    const hit = ops.find((op) => op.re.test(rest))
    if (!hit) return null
    const match = rest.match(hit.re)
    if (!match) return null
    kind = hit.kind
    consumed = match[0].length
  }
  i += consumed
  if (s[i] === '|') {
    const end = s.indexOf('|', i + 1)
    if (end !== -1) {
      label = label || s.slice(i + 1, end)
      i = end + 1
    }
  }
  return { kind, label: cleanLabel(label), next: i }
}

function parseStatement(line: string, nodes: Map<string, MNode>, edges: MEdge[]) {
  let i = 0
  const first = parseNode(line, i, nodes)
  if (!first) return
  i = first.next
  let prev = first.id
  while (i < line.length) {
    const edge = parseEdge(line, i)
    if (!edge) break
    const next = parseNode(line, edge.next, nodes)
    if (!next) break
    edges.push({ from: prev, to: next.id, label: edge.label, kind: edge.kind })
    prev = next.id
    i = next.next
    while (line[i] === ' ' || line[i] === '\t') i++
    if (line[i] !== '&') continue
    while (line[i] === '&') {
      const extra = parseNode(line, i + 1, nodes)
      if (!extra) break
      edges.push({ from: first.id, to: extra.id, label: edge.label, kind: edge.kind })
      i = extra.next
      while (line[i] === ' ' || line[i] === '\t') i++
    }
  }
}

function splitStatements(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let depth = 0
  for (const ch of line) {
    if ('[({'.includes(ch)) depth++
    else if ('])}'.includes(ch)) depth = Math.max(0, depth - 1)
    if (ch === ';' && depth === 0) {
      if (cur.trim()) out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out
}

function parseFlow(src: string): { dir: string; nodes: Map<string, MNode>; edges: MEdge[] } | null {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const header = lines.map((line) => line.trim()).find((line) => line && !line.startsWith('%%')) || ''
  const head = /^(flowchart|graph)(?:\s+(TD|TB|BT|LR|RL))?/i.exec(header)
  if (!head) return null
  let dir = (head[2] || 'TD').toUpperCase()
  const nodes = new Map<string, MNode>()
  const edges: MEdge[] = []
  let started = false
  for (const raw of lines) {
    const uncommented = raw.includes('%%') ? raw.slice(0, raw.indexOf('%%')) : raw
    const trim = uncommented.trim()
    if (!trim) continue
    if (!started && /^(flowchart|graph)\b/i.test(trim)) {
      started = true
      continue
    }
    started = true
    if (/^subgraph\b/i.test(trim) || /^end$/i.test(trim)) continue
    const direction = /^direction\s+(TD|TB|BT|LR|RL)\b/i.exec(trim)
    if (direction) {
      dir = direction[1].toUpperCase()
      continue
    }
    if (/^(style|classDef|click|linkStyle|accTitle|accDescr)\b/i.test(trim)) continue
    if (/^class\s/i.test(trim)) continue
    for (const statement of splitStatements(trim)) parseStatement(statement.trim(), nodes, edges)
  }
  if (!DIRS.has(dir)) dir = 'TD'
  return { dir, nodes, edges }
}

type Box = { id: string; x: number; y: number; w: number; h: number; lines: string[] }

function ranksOf(nodes: Map<string, MNode>, edges: MEdge[]) {
  const ids = [...nodes.keys()]
  const adj = new Map<string, number[]>()
  for (const id of ids) adj.set(id, [])
  edges.forEach((edge, index) => {
    if (!adj.has(edge.from)) adj.set(edge.from, [])
    adj.get(edge.from)!.push(index)
    if (!nodes.has(edge.to)) nodes.set(edge.to, { id: edge.to, label: edge.to, shape: 'rect' })
  })
  const color = new Map<string, number>()
  const back = new Set<number>()
  const dfs = (id: string) => {
    color.set(id, 1)
    for (const index of adj.get(id) || []) {
      const next = edges[index].to
      const state = color.get(next) ?? 0
      if (state === 1) back.add(index)
      else if (state === 0) dfs(next)
    }
    color.set(id, 2)
  }
  for (const id of nodes.keys()) if ((color.get(id) ?? 0) === 0) dfs(id)
  const rank = new Map<string, number>()
  for (const id of nodes.keys()) rank.set(id, 0)
  let guard = 0
  let changed = true
  const limit = nodes.size * nodes.size + 4
  while (changed && guard++ < limit) {
    changed = false
    edges.forEach((edge, index) => {
      if (back.has(index)) return
      const next = (rank.get(edge.from) ?? 0) + 1
      if (next > (rank.get(edge.to) ?? 0)) {
        rank.set(edge.to, next)
        changed = true
      }
    })
  }
  return { rank, back }
}

function centerX(box: Box): number {
  return box.x + Math.floor((box.w - 1) / 2)
}

function connectVertical(canvas: Canvas, a: Box, b: Box, label: string) {
  const down = b.y >= a.y
  const x1 = centerX(a)
  const x2 = centerX(b)
  const yStart = down ? a.y + a.h : a.y - 1
  const yArrow = down ? b.y - 1 : b.y + b.h
  if (yArrow < 0) return
  const mid = Math.floor((yStart + yArrow) / 2)
  if (x1 === x2) {
    if (down) canvas.vline(x1, yStart, yArrow - 1)
    else canvas.vline(x1, yArrow + 1, yStart)
  } else if (down) {
    canvas.vline(x1, yStart, mid)
    canvas.hline(mid, x1, x2)
    canvas.vline(x2, mid, yArrow - 1)
  } else {
    canvas.vline(x1, mid, yStart)
    canvas.hline(mid, x1, x2)
    canvas.vline(x2, yArrow + 1, mid)
  }
  canvas.set(x2, yArrow, down ? '▼' : '▲')
  if (label) {
    const x = Math.max(x1, x2) + 2
    canvas.text(x, Math.max(0, mid), label)
  }
}

function connectHorizontal(canvas: Canvas, a: Box, b: Box, label: string) {
  const right = b.x >= a.x
  const y1 = a.y + Math.floor((a.h - 1) / 2)
  const y2 = b.y + Math.floor((b.h - 1) / 2)
  const xStart = right ? a.x + a.w : a.x - 1
  const xArrow = right ? b.x - 1 : b.x + b.w
  if (xArrow < 0) return
  if (y1 === y2) {
    if (right) canvas.hline(y1, xStart, xArrow - 1)
    else canvas.hline(y1, xArrow + 1, xStart)
  } else {
    const mid = Math.floor((xStart + xArrow) / 2)
    canvas.hline(y1, Math.min(xStart, mid), Math.max(xStart, mid))
    canvas.vline(mid, y1, y2)
    canvas.hline(y2, Math.min(mid, xArrow), Math.max(mid, xArrow))
  }
  canvas.set(xArrow, y2, right ? '►' : '◄')
  if (label) canvas.text(Math.min(xStart, xArrow), Math.max(0, Math.min(y1, y2) - 1), label)
}

function drawBack(canvas: Canvas, from: Box, to: Box, label: string, rail: number) {
  const yFrom = from.y + Math.floor((from.h - 1) / 2)
  const yTo = to.y + Math.floor((to.h - 1) / 2)
  const xFrom = from.x + from.w
  const xTo = to.x + to.w
  canvas.hline(yFrom, xFrom, rail)
  canvas.vline(rail, Math.min(yFrom, yTo), Math.max(yFrom, yTo))
  canvas.hline(yTo, xTo + 1, rail)
  canvas.set(rail, Math.min(yFrom, yTo), '┐')
  canvas.set(rail, Math.max(yFrom, yTo), '┘')
  canvas.set(xTo, yTo, '◄')
  if (label) canvas.text(rail + 2, yFrom, label)
}

function layoutGraph(dir: string, nodes: Map<string, MNode>, edges: MEdge[], width: number): string[] {
  if (nodes.size === 0) return ['(empty diagram)']
  const { rank, back } = ranksOf(nodes, edges)
  let maxRank = 0
  for (const value of rank.values()) maxRank = Math.max(maxRank, value)
  const byRank: MNode[][] = Array.from({ length: maxRank + 1 }, () => [])
  for (const node of nodes.values()) byRank[rank.get(node.id) ?? 0].push(node)
  const horizontal = dir === 'LR' || dir === 'RL'
  if (dir === 'BT' || dir === 'RL') byRank.reverse()
  const spine = byRank.every((group) => group.length === 1)
  const canvas = new Canvas()
  const boxes: Box[] = []
  const gap = 3

  if (!horizontal) {
    const reserve = edges.some((_, index) => back.has(index)) && spine ? 10 : 2
    const contentW = Math.max(24, width - reserve)
    let y = 0
    for (const group of byRank) {
      const maxInner = Math.max(10, Math.floor(contentW / Math.max(1, group.length)) - 8)
      const arts = group.map((node) => nodeArt(node, maxInner))
      const widths = arts.map((lines) => Math.max(...lines.map((line) => line.length)))
      const total = widths.reduce((sum, item) => sum + item, 0) + Math.max(0, group.length - 1) * 4
      let x = Math.max(0, Math.floor((contentW - total) / 2))
      let rankH = 1
      group.forEach((node, index) => {
        const box: Box = { id: node.id, x, y, w: widths[index], h: arts[index].length, lines: arts[index] }
        boxes.push(box)
        x += widths[index] + 4
        rankH = Math.max(rankH, box.h)
      })
      y += rankH + gap
    }
  } else {
    let x = 0
    const arts = byRank.map((group) => group.map((node) => nodeArt(node, 28)))
    const colW = arts.map((group) => Math.max(1, ...group.map((lines) => Math.max(...lines.map((line) => line.length)))))
    const colH = arts.map((group) => group.reduce((sum, lines) => sum + lines.length + 2, 0))
    const maxH = Math.max(1, ...colH)
    byRank.forEach((group, rankIndex) => {
      let y = Math.max(0, Math.floor((maxH - colH[rankIndex]) / 2))
      group.forEach((node, index) => {
        const lines = arts[rankIndex][index]
        const w = Math.max(...lines.map((line) => line.length))
        const box: Box = {
          id: node.id,
          x: x + Math.floor((colW[rankIndex] - w) / 2),
          y,
          w,
          h: lines.length,
          lines,
        }
        boxes.push(box)
        y += lines.length + 2
      })
      x += colW[rankIndex] + 6
    })
  }

  const boxOf = new Map(boxes.map((box) => [box.id, box]))
  const notes: string[] = []
  let rail = Math.max(0, ...boxes.map((box) => box.x + box.w)) + 3
  edges.forEach((edge, index) => {
    const from = boxOf.get(edge.from)
    const to = boxOf.get(edge.to)
    if (!from || !to) return
    if (back.has(index)) {
      if (!horizontal && spine) {
        drawBack(canvas, from, to, edge.label, rail)
        rail += Math.max(4, edge.label.length + 3)
      } else {
        notes.push(`${edge.label ? `${edge.label} ` : ''}↺ ${fromLabel(nodes, edge.from)} → ${fromLabel(nodes, edge.to)}`)
      }
      return
    }
    if (horizontal) connectHorizontal(canvas, from, to, edge.label)
    else connectVertical(canvas, from, to, edge.label)
  })
  let noteY = Math.max(0, ...boxes.map((box) => box.y + box.h)) + 1
  for (const note of notes) {
    canvas.text(0, noteY, note)
    noteY += 1
  }
  for (const box of boxes) {
    box.lines.forEach((line, index) => canvas.text(box.x, box.y + index, line))
  }
  return fit(canvas.toLines(), width)
}

function fromLabel(nodes: Map<string, MNode>, id: string): string {
  return (nodes.get(id)?.label || id).split('\n')[0]
}

function fit(lines: string[], width: number): string[] {
  if (!lines.length) return ['(empty diagram)']
  const max = Math.max(...lines.map((line) => line.length))
  if (max >= width) return lines
  const pad = Math.floor((width - max) / 2)
  if (pad <= 0) return lines
  return lines.map((line) => ' '.repeat(pad) + line)
}

function fallback(kind: string, src: string, width: number): string[] {
  const title = ` mermaid ${kind || 'diagram'} `
  const bar = '─'.repeat(Math.max(8, Math.min(width, 72)))
  const body = src
    .trim()
    .split('\n')
    .flatMap((line) => wrapText(line, Math.max(20, width - 4)))
  return [
    `┌${title}${bar.slice(title.length)}┐`.slice(0, width),
    ...body.map((line) => `│ ${line}`),
    '│',
    '│ Open the desktop app for the full diagram.',
    `└${'─'.repeat(Math.min(width - 2, Math.max(bar.length, 42)))}┘`,
  ]
}

function block(title: string, rows: string[]): string[] {
  const width = Math.max(title.length, ...rows.map((row) => row.length), 4)
  const line = (left: string, right: string, fill: string) => left + fill.repeat(width + 2) + right
  return [
    line('┌', '┐', '─'),
    `│ ${title.padEnd(width)} │`,
    line('├', '┤', '─'),
    ...(rows.length ? rows : [' ']).map((row) => `│ ${row.padEnd(width)} │`),
    line('└', '┘', '─'),
  ]
}

function renderClass(src: string, width: number): string[] {
  const classes = new Map<string, string[]>()
  const relations: string[] = []
  let current: string | null = null
  for (const raw of src.split('\n')) {
    const line = raw.trim()
    if (!line || /^classDiagram\b/i.test(line) || line.startsWith('%%')) continue
    if (line === '}') {
      current = null
      continue
    }
    const named = /^class\s+(\w+)(?:\s*\{)?\s*$/.exec(line)
    if (named) {
      current = named[1]
      if (!classes.has(current)) classes.set(current, [])
      continue
    }
    if (current && !line.includes('--') && !line.includes('..')) {
      classes.get(current)!.push(line.replace(/[{}]/g, '').trim())
      continue
    }
    const rel = /^(\w+)\s+(.+?)\s+(\w+)(?:\s*:\s*(.*))?$/.exec(line)
    if (rel && /--|<-|\.\./.test(rel[2])) {
      classes.set(rel[1], classes.get(rel[1]) || [])
      classes.set(rel[3], classes.get(rel[3]) || [])
      relations.push(`${rel[1]}  ${rel[2].trim()}  ${rel[3]}${rel[4] ? `  ${rel[4].trim()}` : ''}`)
      continue
    }
    const member = /^(\w+)\s*:\s*(.+)$/.exec(line)
    if (member) {
      if (!classes.has(member[1])) classes.set(member[1], [])
      classes.get(member[1])!.push(member[2].trim())
    }
  }
  const lines: string[] = []
  for (const [name, members] of classes) lines.push(...block(name, members), '')
  for (const relation of relations) lines.push(...wrapText(relation, width))
  return lines.length ? fit(lines, width) : fallback('classDiagram', src, width)
}

function renderState(src: string, width: number): string[] {
  const flow: Flow = { dir: 'TD', nodes: new Map(), edges: [], groups: new Map() }
  const stack: string[] = []
  const ensure = (id: string, label = id, shape: FlowNode['shape'] = 'round') => {
    if (!flow.nodes.has(id)) flow.nodes.set(id, { id, label, shape, group: stack[stack.length - 1] ?? null })
  }
  for (const raw of src.split('\n')) {
    const line = raw.trim()
    if (!line || /^stateDiagram/.test(line) || line.startsWith('%%')) continue
    const direction = /^direction\s+(TB|TD|BT|LR|RL)\b/i.exec(line)
    if (direction) {
      if (!stack.length) flow.dir = direction[1].toUpperCase()
      continue
    }
    const alias = /^state\s+"([^"]+)"\s+as\s+(\w+)/.exec(line)
    const composite = /^state\s+(?:"([^"]+)"\s+as\s+)?(\w+)\s*\{/.exec(line)
    if (composite) {
      flow.groups.set(composite[2], { id: composite[2], title: composite[1] || composite[2], parent: stack[stack.length - 1] ?? null })
      stack.push(composite[2])
      continue
    }
    if (alias) {
      ensure(alias[2], alias[1])
      continue
    }
    if (line === '}') {
      stack.pop()
      continue
    }
    const trans = /^(.*?)\s*-->\s*(.*?)(?:\s*:\s*(.*))?$/.exec(line)
    if (!trans) continue
    const side = (token: string, target: boolean) => {
      const value = token.trim().replace(/^"|"$/g, '')
      if (value === '[*]') {
        const id = `${target ? '__end' : '__start'}${stack.length ? `_${stack[stack.length - 1]}` : ''}`
        ensure(id, target ? '◉' : '●', 'circle')
        return id
      }
      ensure(value)
      return value
    }
    const from = side(trans[1], false)
    const to = side(trans[2], true)
    const edge: FlowEdge = { from, to, label: (trans[3] || '').trim(), style: 'solid', head: 'arrow', tail: 'none' }
    flow.edges.push(edge)
  }
  if (!flow.nodes.size) return fallback('stateDiagram', src, width)
  redirectGroupEdges(flow)
  return layoutFlow(flow, width)
}

function renderEr(src: string, width: number): string[] {
  const entities = new Map<string, string[]>()
  const rels: string[] = []
  let current: string | null = null
  for (const raw of src.split('\n')) {
    const line = raw.trim()
    if (!line || /^erDiagram\b/i.test(line) || line.startsWith('%%')) continue
    if (line === '}') {
      current = null
      continue
    }
    const open = /^(\w+)\s*\{$/.exec(line)
    if (open) {
      current = open[1]
      if (!entities.has(current)) entities.set(current, [])
      continue
    }
    if (current) {
      entities.get(current)!.push(line)
      continue
    }
    const rel = /^(\w+)\s+(\S+)\s+(\w+)\s*:\s*(.*)$/.exec(line)
    if (rel) {
      entities.set(rel[1], entities.get(rel[1]) || [])
      entities.set(rel[3], entities.get(rel[3]) || [])
      rels.push(`${rel[1]}  ${rel[2]}  ${rel[3]}   ${rel[4]}`)
    }
  }
  const lines: string[] = []
  for (const [name, fields] of entities) lines.push(...block(name, fields), '')
  for (const rel of rels) lines.push(...wrapText(rel, width), '')
  return lines.length ? fit(lines, width) : fallback('erDiagram', src, width)
}

function renderPie(src: string, width: number): string[] {
  let title = 'pie'
  const rows: { label: string; value: number }[] = []
  for (const raw of src.split('\n')) {
    const line = raw.trim()
    if (!line || /^pie\b/i.test(line) || line.startsWith('%%')) continue
    const titled = /^title\s+(.+)$/i.exec(line)
    if (titled) {
      title = titled[1].replace(/^"|"$/g, '')
      continue
    }
    const item = /^(?:"([^"]+)"|(.+?))\s*:\s*([0-9.]+)/.exec(line)
    if (item) rows.push({ label: item[1] || item[2], value: Number(item[3]) })
  }
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1
  const lines = [title, '']
  for (const row of rows) {
    const pct = Math.round((row.value / total) * 100)
    const filled = Math.round((pct / 100) * 24)
    const bar = '█'.repeat(filled) + '░'.repeat(24 - filled)
    lines.push(`${row.label.padEnd(16).slice(0, 16)} ${bar} ${String(pct).padStart(3)}%`)
  }
  return fit(lines, width)
}

function renderGantt(src: string, width: number): string[] {
  let title = 'gantt'
  let section = ''
  const lines = [title]
  for (const raw of src.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('%%') || /^(gantt|dateFormat|axisFormat|excludes|includes|todayMarker)\b/i.test(line)) continue
    const titled = /^title\s+(.+)$/i.exec(line)
    if (titled) {
      title = titled[1]
      lines[0] = title
      continue
    }
    const sec = /^section\s+(.+)$/i.exec(line)
    if (sec) {
      section = sec[1]
      lines.push('', section)
      continue
    }
    const task = /^(.+?)\s*:\s*(.+)$/.exec(line)
    if (task) lines.push(`  ${task[1].trim()}   ${task[2].trim()}`)
  }
  return fit(lines.flatMap((line) => wrapText(line, width)), width)
}

function renderJourney(src: string, width: number): string[] {
  let title = 'journey'
  const lines: string[] = []
  for (const raw of src.split('\n')) {
    const line = raw.trim()
    if (!line || /^journey\b/i.test(line) || line.startsWith('%%')) continue
    const titled = /^title\s+(.+)$/i.exec(line)
    if (titled) {
      title = titled[1]
      continue
    }
    const section = /^section\s+(.+)$/i.exec(line)
    if (section) {
      lines.push('', section[1])
      continue
    }
    const task = /^(.+?):\s*([0-9]+)\s*:\s*(.*)$/.exec(line)
    if (task) {
      const score = Math.max(0, Math.min(5, Number(task[2])))
      lines.push(`  ${task[1].trim()}  ${'●'.repeat(score)}${'○'.repeat(5 - score)}  ${task[3]}`)
    }
  }
  return fit([title, ...lines], width)
}

function renderMindmap(src: string, width: number): string[] {
  const rows = src.split('\n').filter((line) => line.trim() && !/^mindmap\b/i.test(line.trim()) && !line.trim().startsWith('%%'))
  const parsed = rows.map((line) => {
    const indent = line.match(/^\s*/)?.[0].length ?? 0
    const label = line.trim().replace(/^[([{}]+|[)\]}]+$/g, '')
    return { indent, label }
  })
  const min = Math.min(...parsed.map((row) => row.indent))
  const lines = parsed.map((row, index) => {
    const depth = Math.round((row.indent - min) / 2)
    const last = index === parsed.length - 1 || parsed[index + 1].indent <= row.indent
    const prefix = depth === 0 ? '' : `${'  '.repeat(depth - 1)}${last ? '└─ ' : '├─ '}`
    return prefix + row.label
  })
  return fit(lines, width)
}

function renderTimeline(src: string, width: number): string[] {
  let title = 'timeline'
  const lines: string[] = []
  for (const raw of src.split('\n')) {
    const line = raw.trim()
    if (!line || /^timeline\b/i.test(line) || line.startsWith('%%')) continue
    const titled = /^title\s+(.+)$/i.exec(line)
    if (titled) {
      title = titled[1]
      continue
    }
    const section = /^section\s+(.+)$/i.exec(line)
    if (section) {
      lines.push('', `● ${section[1]}`)
      continue
    }
    lines.push(`  ${line.replace(/\s*:\s*/g, ' — ')}`)
  }
  return fit([title, ...lines], width)
}

function renderGit(src: string, width: number): string[] {
  const branches = ['main']
  let current = 0
  const lines: string[] = []
  const paint = (mark: string) => {
    const cols = branches.map((_, index) => (index === current ? mark : '│'))
    return cols.map((col) => `${col}   `).join('').trimEnd()
  }
  for (const raw of src.split('\n')) {
    const line = raw.trim()
    if (!line || /^gitGraph\b/i.test(line) || line.startsWith('%%')) continue
    const commit = /^commit(?:\s+id:\s*"?([^"]+)"?)?/i.exec(line)
    if (commit) {
      lines.push(`${paint('*')}  ${commit[1] || 'commit'} (${branches[current]})`)
      continue
    }
    const branch = /^branch\s+(\S+)/i.exec(line)
    if (branch) {
      branches.push(branch[1])
      lines.push(`${paint('│')}  branch ${branch[1]}`)
      continue
    }
    const checkout = /^checkout\s+(\S+)/i.exec(line)
    if (checkout) {
      const index = branches.indexOf(checkout[1])
      if (index === -1) branches.push(checkout[1])
      current = branches.indexOf(checkout[1])
      lines.push(`${paint('│')}  checkout ${checkout[1]}`)
      continue
    }
    const merge = /^merge\s+(\S+)/i.exec(line)
    if (merge) {
      lines.push(`${paint('*')}  merge ${merge[1]} into ${branches[current]}`)
    }
  }
  return fit(lines.length ? lines : ['(empty git graph)'], width)
}

function renderXy(src: string, width: number): string[] {
  let title = 'chart'
  let labels: string[] = []
  let values: number[] = []
  for (const raw of src.split('\n')) {
    const line = raw.trim()
    const titled = /^title\s+"?([^"]+)"?/i.exec(line)
    if (titled) title = titled[1]
    const axis = /^x-axis\s+\[([^\]]+)\]/i.exec(line)
    if (axis) labels = axis[1].split(',').map((item) => item.trim().replace(/^"|"$/g, ''))
    const bar = /^(?:bar|line)\s+\[([^\]]+)\]/i.exec(line)
    if (bar && values.length === 0) values = bar[1].split(',').map((item) => Number(item.trim()))
  }
  const max = Math.max(1, ...values)
  const lines = [title, '']
  values.forEach((value, index) => {
    const label = labels[index] || String(index + 1)
    const filled = Math.max(1, Math.round((value / max) * 24))
    lines.push(`${label.padEnd(10).slice(0, 10)} ${'█'.repeat(filled)} ${value}`)
  })
  return fit(lines, width)
}

function renderQuadrant(src: string, width: number): string[] {
  let title = 'quadrant'
  const cells: string[][] = [[], [], [], []]
  for (const raw of src.split('\n')) {
    const line = raw.trim()
    const titled = /^title\s+(.+)$/i.exec(line)
    if (titled) title = titled[1].replace(/^"|"$/g, '')
    const point = /^(.+?):\s*\[\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]/.exec(line)
    if (point) {
      const x = Number(point[2]) >= 0.5 ? 1 : 0
      const y = Number(point[3]) >= 0.5 ? 0 : 1
      cells[y * 2 + x].push(point[1].trim())
    }
  }
  const box = (items: string[]) => items.join(', ') || '·'
  return fit(
    [
      title,
      '',
      `┌ ${box(cells[0]).padEnd(28)} ┬ ${box(cells[1]).padEnd(28)} ┐`,
      '│ high / low                    │ high / high                   │',
      `├ ${box(cells[2]).padEnd(28)} ┼ ${box(cells[3]).padEnd(28)} ┤`,
      '│ low / low                     │ low / high                    │',
      '└───────────────────────────────┴───────────────────────────────┘',
    ],
    width,
  )
}

export function renderMermaid(src: string, width: number): string[] {
  const body = src.replace(/\r\n/g, '\n').trim()
  const kind = kindOf(body)
  const limit = Math.max(40, width)
  try {
    switch (kind) {
      case 'flowchart':
      case 'graph':
        return renderFlowchart(body, limit) ?? fallback(kind, body, limit)
      case 'sequencediagram':
        return renderSequence(body, limit) ?? fallback(kind, body, limit)
      case 'classdiagram':
        return renderClass(body, limit)
      case 'statediagram':
      case 'statediagram-v2':
        return renderState(body, limit)
      case 'erdiagram':
        return renderEr(body, limit)
      case 'pie':
        return renderPie(body, limit)
      case 'gantt':
        return renderGantt(body, limit)
      case 'journey':
        return renderJourney(body, limit)
      case 'mindmap':
        return renderMindmap(body, limit)
      case 'timeline':
        return renderTimeline(body, limit)
      case 'gitgraph':
        return renderGit(body, limit)
      case 'xychart-beta':
      case 'xychart':
        return renderXy(body, limit)
      case 'quadrantchart':
        return renderQuadrant(body, limit)
      default:
        return fallback(kind, body, limit)
    }
  } catch {
    return fallback(kind, body, limit)
  }
}
