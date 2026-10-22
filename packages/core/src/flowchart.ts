import { arrowHead, fit, Grid, type LineStyle, type Point } from './grid.js'
import { centerText } from './text.js'

export type Shape = 'rect' | 'round' | 'stadium' | 'diamond' | 'sub' | 'cylinder' | 'circle' | 'hex' | 'odd'
export type Head = 'arrow' | 'circle' | 'cross' | 'none'

export type FlowNode = { id: string; label: string; shape: Shape; group: string | null }
export type FlowEdge = {
  from: string
  to: string
  label: string
  style: LineStyle | 'hidden'
  head: Head
  tail: Head
}
export type FlowGroup = { id: string; title: string; parent: string | null }
export type Flow = {
  dir: string
  nodes: Map<string, FlowNode>
  edges: FlowEdge[]
  groups: Map<string, FlowGroup>
}

const DIRS = new Set(['TD', 'TB', 'BT', 'LR', 'RL'])
const TAGS = /<\/?(?:b|i|u|em|strong|small|big|sub|sup|span|code|font|p|div|a|s|del|mark)\b[^>]*>/gi

export function decode(text: string): string {
  return text
    .replace(/#quot;|&quot;/g, '"')
    .replace(/#39;|&apos;|&#39;/g, "'")
    .replace(/#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export function cleanLabel(text: string): string {
  let value = text.trim()
  if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
  if (value.length > 1 && value.startsWith('`') && value.endsWith('`')) value = value.slice(1, -1)
  return decode(value.replace(/<br\s*\/?>/gi, '\n').replace(TAGS, ''))
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/fa:fa-[\w-]+\s*/g, '')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
}

function findClose(s: string, i: number, close: string): number {
  let quote = ''
  for (let p = i; p < s.length; p++) {
    const ch = s[p]
    if (quote) {
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"') {
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
  { open: '(((', close: ')))', shape: 'circle' },
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

type Parse = { nodes: Map<string, FlowNode>; edges: FlowEdge[]; group: string | null }

function skip(s: string, i: number): number {
  while (s[i] === ' ' || s[i] === '\t') i++
  return i
}

function parseNode(s: string, i: number, state: Parse): { id: string; next: number } | null {
  i = skip(s, i)
  const match = /^[A-Za-z0-9_]+/.exec(s.slice(i))
  if (!match) return null
  const id = match[0]
  i += id.length
  const node = state.nodes.get(id) ?? { id, label: id, shape: 'rect' as Shape, group: state.group }
  const rest = s.slice(i)
  for (const opener of OPENERS) {
    if (!rest.startsWith(opener.open)) continue
    const start = i + opener.open.length
    const end = findClose(s, start, opener.close)
    if (end === -1) continue
    node.label = cleanLabel(s.slice(start, end)) || id
    node.shape = opener.shape
    i = end + opener.close.length
    break
  }
  const cls = /^:::[\w-]+/.exec(s.slice(i))
  if (cls) i += cls[0].length
  state.nodes.set(id, node)
  return { id, next: i }
}

const LINK = /^(<|o(?=[-=])|x(?=[-=]))?(-{2,}>|-{3,}|={2,}>|={3,}|-\.+->|-\.+-|~{3,}|-\.+-[ox]|--[ox]|==[ox])/
const INLINE = /^(<)?(--|==|-\.)\s*([^\s>\-=.][^]*?)\s*(-{2,}>|-{3,}|={2,}>|={3,}|\.-+>|\.-+|--[ox]|==[ox])(?=\s|[A-Za-z0-9_]|$)/

function headOf(ch: string | undefined): Head {
  if (ch === '>' || ch === '<') return 'arrow'
  if (ch === 'o') return 'circle'
  if (ch === 'x') return 'cross'
  return 'none'
}

function parseEdge(s: string, i: number): { edge: Omit<FlowEdge, 'from' | 'to'>; next: number } | null {
  i = skip(s, i)
  const rest = s.slice(i)
  let body = ''
  let start: string | undefined
  let label = ''
  const link = LINK.exec(rest)
  const inline = link ? null : INLINE.exec(rest)
  if (link) {
    start = link[1]
    body = link[2]
    i += link[0].length
  } else if (inline) {
    start = inline[1]
    body = inline[2] + inline[4]
    label = inline[3]
    i += inline[0].length
  } else return null
  if (s[i] === '|') {
    const end = s.indexOf('|', i + 1)
    if (end !== -1) {
      label = label || s.slice(i + 1, end)
      i = end + 1
    }
  }
  const style: FlowEdge['style'] = body.includes('~')
    ? 'hidden'
    : body.includes('=')
      ? 'thick'
      : body.includes('.')
        ? 'dotted'
        : 'solid'
  const last = body[body.length - 1]
  return {
    edge: { label: cleanLabel(label), style, head: headOf(last), tail: headOf(start) },
    next: i,
  }
}

function parseGroup(s: string, i: number, state: Parse): { ids: string[]; next: number } | null {
  const first = parseNode(s, i, state)
  if (!first) return null
  const ids = [first.id]
  i = first.next
  for (;;) {
    const j = skip(s, i)
    if (s[j] !== '&') break
    const more = parseNode(s, j + 1, state)
    if (!more) break
    ids.push(more.id)
    i = more.next
  }
  return { ids, next: i }
}

function parseStatement(line: string, state: Parse) {
  let left = parseGroup(line, 0, state)
  if (!left) return
  let i = left.next
  while (i < line.length) {
    const parsed = parseEdge(line, i)
    if (!parsed) break
    const right = parseGroup(line, parsed.next, state)
    if (!right) break
    for (const from of left.ids) for (const to of right.ids) state.edges.push({ ...parsed.edge, from, to })
    left = right
    i = right.next
  }
}

function splitStatements(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let depth = 0
  let quote = false
  for (const ch of line) {
    if (ch === '"') quote = !quote
    else if (!quote && '[({'.includes(ch)) depth++
    else if (!quote && '])}'.includes(ch)) depth = Math.max(0, depth - 1)
    if (ch === ';' && depth === 0 && !quote) {
      if (cur.trim()) out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out
}

function parseSubgraph(rest: string, count: number): { id: string; title: string } {
  const titled = /^([A-Za-z0-9_]+)\s*\[(.*)\]$/.exec(rest)
  if (titled) return { id: titled[1], title: cleanLabel(titled[2]) }
  if (/^".*"$/.test(rest)) return { id: `subgraph-${count}`, title: cleanLabel(rest) }
  return { id: rest, title: cleanLabel(rest) }
}

export function parseFlow(src: string): Flow | null {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const header = lines.map((line) => line.trim()).find((line) => line && !line.startsWith('%%')) || ''
  const head = /^(flowchart|graph)(?:\s+(TD|TB|BT|LR|RL))?/i.exec(header)
  if (!head) return null
  let dir = (head[2] || 'TD').toUpperCase()
  const groups = new Map<string, FlowGroup>()
  const stack: string[] = []
  const state: Parse = { nodes: new Map(), edges: [], group: null }
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
    const sub = /^subgraph\s+(.+)$/i.exec(trim)
    if (sub) {
      const { id, title } = parseSubgraph(sub[1].trim(), groups.size)
      if (!groups.has(id)) groups.set(id, { id, title, parent: stack[stack.length - 1] ?? null })
      stack.push(id)
      state.group = id
      continue
    }
    if (/^end$/i.test(trim)) {
      stack.pop()
      state.group = stack[stack.length - 1] ?? null
      continue
    }
    const direction = /^direction\s+(TD|TB|BT|LR|RL)\b/i.exec(trim)
    if (direction) {
      if (!stack.length) dir = direction[1].toUpperCase()
      continue
    }
    if (/^(style|classDef|click|linkStyle|accTitle|accDescr)\b/i.test(trim)) continue
    if (/^class\s/i.test(trim)) continue
    for (const statement of splitStatements(trim)) parseStatement(statement.trim(), state)
  }
  if (!DIRS.has(dir)) dir = 'TD'
  const flow: Flow = { dir, nodes: state.nodes, edges: state.edges, groups }
  redirectGroupEdges(flow)
  return flow
}

export function redirectGroupEdges(flow: Flow) {
  const member = (group: string): string | null => {
    for (const node of flow.nodes.values()) if (node.group === group && !flow.groups.has(node.id)) return node.id
    for (const child of flow.groups.values()) {
      if (child.parent !== group) continue
      const hit = member(child.id)
      if (hit) return hit
    }
    return null
  }
  for (const id of flow.groups.keys()) {
    if (!flow.nodes.has(id)) continue
    const target = member(id)
    if (!target) continue
    flow.nodes.delete(id)
    for (const edge of flow.edges) {
      if (edge.from === id) edge.from = target
      if (edge.to === id) edge.to = target
    }
  }
}

function frame(
  lines: string[],
  chars: { tl: string; tr: string; bl: string; br: string; h: string; v: string },
  minW: number,
): string[] {
  const textW = Math.max(1, minW, ...lines.map((line) => line.length))
  const top = chars.tl + chars.h.repeat(textW + 2) + chars.tr
  const body = lines.map((line) => `${chars.v} ${centerText(line, textW)} ${chars.v}`)
  const bot = chars.bl + chars.h.repeat(textW + 2) + chars.br
  return [top, ...body, bot]
}

function equalize(lines: string[]): string[] {
  const width = Math.max(...lines.map((line) => line.length))
  return lines.map((line) => line.padEnd(width))
}

function diamond(lines: string[], minW: number): string[] {
  const textW = Math.max(4, minW, ...lines.map((line) => line.length))
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

export function wrapWords(text: string, width: number): string[] {
  const out: string[] = []
  for (const raw of text.split('\n')) {
    let line = ''
    for (const word of raw.split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + word.length > width && /[\p{L}\p{N}]/u.test(word)) {
        out.push(line)
        line = word
      } else line = line ? `${line} ${word}` : word
    }
    out.push(line)
  }
  return out
}

export function nodeArt(node: Pick<FlowNode, 'label' | 'shape'>, maxInner: number, minW = 0): string[] {
  if (node.shape === 'circle' && (node.label === '●' || node.label === '◉')) return [node.label]
  const wrapped = wrapWords(node.label, Math.max(8, maxInner))
  if (node.shape === 'diamond') return diamond(wrapped, minW)
  if (node.shape === 'round' || node.shape === 'stadium' || node.shape === 'cylinder' || node.shape === 'circle') {
    return frame(wrapped, { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' }, minW)
  }
  if (node.shape === 'sub') return frame(wrapped, { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' }, minW)
  if (node.shape === 'hex') {
    const textW = Math.max(1, minW, ...wrapped.map((line) => line.length))
    const top = `╱${'‾'.repeat(textW + 2)}╲`
    const body = wrapped.map((line) => `│ ${centerText(line, textW)} │`)
    const bot = `╲${'_'.repeat(textW + 2)}╱`
    return equalize([top, ...body, bot])
  }
  return frame(wrapped, { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' }, minW)
}

type LNode = {
  id: string
  dummy: boolean
  rank: number
  seq: number
  group: string | null
  art: string[]
  main: number
  cross: number
  pos: number
}
type Seg = { from: LNode; to: LNode; chain: number; p: number; q: number; track: number }
type Chain = { edge: FlowEdge; reversed: boolean; segs: Seg[]; labelSeg: number; label: string[] }
type Spot = { row: number; a: number; w: number; align: 'left' | 'right' | 'center' }

function isotonic(target: number[]): number[] {
  const blocks: { sum: number; n: number }[] = []
  for (const value of target) {
    blocks.push({ sum: value, n: 1 })
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1]
      const a = blocks[blocks.length - 2]
      if (a.sum / a.n <= b.sum / b.n) break
      a.sum += b.sum
      a.n += b.n
      blocks.pop()
    }
  }
  return blocks.flatMap((block) => Array<number>(block.n).fill(block.sum / block.n))
}

function ranksOf(ids: string[], edges: { a: string; b: string }[]): Map<string, number> {
  const indeg = new Map(ids.map((id) => [id, 0]))
  const out = new Map(ids.map((id) => [id, [] as string[]]))
  for (const { a, b } of edges) {
    out.get(a)!.push(b)
    indeg.set(b, indeg.get(b)! + 1)
  }
  const queue = ids.filter((id) => indeg.get(id) === 0)
  const topo: string[] = []
  const rank = new Map(ids.map((id) => [id, 0]))
  while (queue.length) {
    const id = queue.shift()!
    topo.push(id)
    for (const next of out.get(id)!) {
      rank.set(next, Math.max(rank.get(next)!, rank.get(id)! + 1))
      indeg.set(next, indeg.get(next)! - 1)
      if (indeg.get(next) === 0) queue.push(next)
    }
  }
  const hasIn = new Set(edges.map((edge) => edge.b))
  for (const id of [...topo].reverse()) {
    const succ = out.get(id)!
    if (hasIn.has(id) || !succ.length) continue
    rank.set(id, Math.min(...succ.map((next) => rank.get(next)!)) - 1)
  }
  const min = Math.min(...rank.values())
  for (const id of ids) rank.set(id, rank.get(id)! - min)
  return rank
}

function backEdges(ids: string[], edges: FlowEdge[]): Set<number> {
  const adj = new Map(ids.map((id) => [id, [] as number[]]))
  edges.forEach((edge, index) => adj.get(edge.from)!.push(index))
  const color = new Map<string, number>()
  const back = new Set<number>()
  const visit = (id: string) => {
    color.set(id, 1)
    for (const index of adj.get(id)!) {
      const next = edges[index].to
      const state = color.get(next) ?? 0
      if (state === 1) back.add(index)
      else if (state === 0) visit(next)
    }
    color.set(id, 2)
  }
  for (const id of ids) if (!color.get(id)) visit(id)
  return back
}

export function layoutFlow(flow: Flow, width: number): string[] {
  const { nodes, groups } = flow
  for (const edge of flow.edges) {
    for (const id of [edge.from, edge.to]) {
      if (!nodes.has(id)) nodes.set(id, { id, label: id, shape: 'rect', group: null })
    }
  }
  if (nodes.size === 0) return ['(empty diagram)']
  const horizontal = flow.dir === 'LR' || flow.dir === 'RL'
  const flip = flow.dir === 'BT' || flow.dir === 'RL'
  const ids = [...nodes.keys()]
  const loops = flow.edges.filter((edge) => edge.from === edge.to)
  const edges = flow.edges.filter((edge) => edge.from !== edge.to)
  const back = backEdges(ids, edges)
  const pairs = edges.map((edge, index) => (back.has(index) ? { a: edge.to, b: edge.from } : { a: edge.from, b: edge.to }))
  const rank = ranksOf(ids, pairs)
  const maxRank = Math.max(...rank.values())

  const chainOf = (group: string | null): string[] => {
    const out: string[] = []
    for (let g = group; g; g = groups.get(g)?.parent ?? null) out.unshift(g)
    return out
  }
  const common = (a: string | null, b: string | null): string | null => {
    const ca = chainOf(a)
    const cb = chainOf(b)
    let shared: string | null = null
    for (let i = 0; i < Math.min(ca.length, cb.length) && ca[i] === cb[i]; i++) shared = ca[i]
    return shared
  }

  const perRank = new Map<number, number>()
  for (const id of ids) perRank.set(rank.get(id)!, (perRank.get(rank.get(id)!) ?? 0) + 1)
  const widest = Math.max(...perRank.values())
  const maxInner = horizontal
    ? Math.max(16, Math.min(28, Math.floor(width / (maxRank + 1)) - 12))
    : Math.max(12, Math.min(32, Math.floor(width / widest) - 8))

  const layers: LNode[][] = Array.from({ length: maxRank + 1 }, () => [])
  const byId = new Map<string, LNode>()
  ids.forEach((id, seq) => {
    const node = nodes.get(id)!
    const art = nodeArt(node, maxInner)
    const w = Math.max(...art.map((line) => line.length))
    const l: LNode = {
      id,
      dummy: false,
      rank: rank.get(id)!,
      seq,
      group: node.group && groups.has(node.group) ? node.group : null,
      art,
      main: horizontal ? w : art.length,
      cross: horizontal ? art.length : w,
      pos: 0,
    }
    byId.set(id, l)
    layers[l.rank].push(l)
  })

  const chains: Chain[] = []
  const segs: Seg[] = []
  edges.forEach((edge, index) => {
    if (edge.style === 'hidden') return
    const reversed = back.has(index)
    const a = byId.get(pairs[index].a)!
    const b = byId.get(pairs[index].b)!
    const chain: Chain = { edge, reversed, segs: [], labelSeg: 0, label: [] }
    let prev = a
    for (let r = a.rank + 1; r <= b.rank; r++) {
      const next: LNode =
        r === b.rank
          ? b
          : {
              id: `${edge.from}>${edge.to}#${index}@${r}`,
              dummy: true,
              rank: r,
              seq: a.seq + 0.5,
              group: common(a.group, b.group),
              art: [],
              main: 0,
              cross: 1,
              pos: 0,
            }
      if (next.dummy) layers[r].push(next)
      const seg: Seg = { from: prev, to: next, chain: chains.length, p: 0, q: 0, track: -1 }
      chain.segs.push(seg)
      segs.push(seg)
      prev = next
    }
    chain.labelSeg = reversed ? chain.segs.length - 1 : 0
    if (edge.label) {
      chain.label = horizontal
        ? [truncate(edge.label.replace(/\n/g, ' '), 28)]
        : wrapWords(edge.label, 20)
    }
    chains.push(chain)
  })

  const labelWidth = (seg: Seg) => {
    const chain = chains[seg.chain]
    return chain.label.length && chain.segs[chain.labelSeg] === seg ? Math.max(...chain.label.map((line) => line.length)) : 0
  }
  for (const node of byId.values()) {
    if (node.dummy) continue
    const source = nodes.get(node.id)!
    const outs = segs.filter((seg) => seg.from === node)
    if (horizontal) {
      const need = Math.max(outs.length, segs.filter((seg) => seg.to === node).length)
      const slots = Math.min(allowed(node, 'left').length, allowed(node, 'right').length)
      if (need <= slots) continue
      const extra = need - slots
      const label = '\n'.repeat(Math.floor(extra / 2)) + source.label + '\n'.repeat(Math.ceil(extra / 2))
      node.art = nodeArt({ label, shape: source.shape }, maxInner)
    } else {
      if (outs.length < 2 || !outs.some(labelWidth)) continue
      const need = outs.reduce((sum, seg) => sum + (labelWidth(seg) ? labelWidth(seg) + 3 : 2), 0)
      const side = flip ? 'top' : 'bottom'
      for (let minW = need - 2, tries = 0; allowed(node, side).length < need && tries < 4; tries++) {
        node.art = nodeArt(source, maxInner, minW)
        minW += need - allowed(node, side).length
      }
    }
    const w = Math.max(...node.art.map((line) => line.length))
    node.main = horizontal ? w : node.art.length
    node.cross = horizontal ? node.art.length : w
  }

  const up = new Map<LNode, LNode[]>()
  const down = new Map<LNode, LNode[]>()
  for (const seg of segs) {
    if (!down.has(seg.from)) down.set(seg.from, [])
    if (!up.has(seg.to)) up.set(seg.to, [])
    down.get(seg.from)!.push(seg.to)
    up.get(seg.to)!.push(seg.from)
  }

  orderLayers(layers, up, down, segs, chainOf)

  const boundaries = (a: LNode, b: LNode): number => {
    const ca = chainOf(a.group)
    const cb = chainOf(b.group)
    let shared = 0
    while (shared < Math.min(ca.length, cb.length) && ca[shared] === cb[shared]) shared++
    return ca.length - shared + (cb.length - shared)
  }
  const separation = (a: LNode, b: LNode): number => {
    const base = a.dummy || b.dummy ? 1 : horizontal ? 1 : 4
    const crossings = boundaries(a, b)
    return Math.max(base, crossings ? 2 * crossings + 1 : 0)
  }
  placeCross(layers, up, down, separation)

  const depthOf = (group: string) => chainOf(group).length
  const members = new Map<string, LNode[]>()
  for (const node of byId.values()) {
    for (const group of chainOf(node.group)) {
      if (!members.has(group)) members.set(group, [])
      members.get(group)!.push(node)
    }
  }
  const spanOf = (group: string) => {
    const list = members.get(group) ?? []
    return { r1: Math.min(...list.map((node) => node.rank)), r2: Math.max(...list.map((node) => node.rank)) }
  }
  const framedIds = [...members.keys()].sort((a, b) => depthOf(b) - depthOf(a))
  const crossRange = (group: string): { c1: number; c2: number } => {
    let c1 = Infinity
    let c2 = -Infinity
    for (const node of members.get(group)!) {
      if (node.group !== group) continue
      c1 = Math.min(c1, node.pos - 2)
      c2 = Math.max(c2, node.pos + node.cross + 1)
    }
    for (const child of framedIds) {
      if (groups.get(child)?.parent !== group) continue
      const inner = crossRange(child)
      c1 = Math.min(c1, inner.c1 - 2)
      c2 = Math.max(c2, inner.c2 + 2)
    }
    const short = horizontal ? 0 : groups.get(group)!.title.length + 6 - (c2 - c1 + 1)
    if (short > 0) {
      c1 -= Math.floor(short / 2)
      c2 += Math.ceil(short / 2)
    }
    return { c1, c2 }
  }
  const inside = (node: LNode, group: string) => chainOf(node.group).includes(group)
  for (let pass = 0; pass < 3; pass++) {
    for (const group of framedIds) {
      const { c1, c2 } = crossRange(group)
      const { r1, r2 } = spanOf(group)
      for (let r = r1; r <= r2; r++) {
        const layer = layers[r]
        const firstIn = layer.findIndex((node) => inside(node, group))
        layer.forEach((node, i) => {
          if (inside(node, group) || node.pos > c2 + 1 || node.pos + node.cross - 1 < c1 - 1) return
          const before = firstIn >= 0 ? i < firstIn : node.pos + node.cross / 2 < (c1 + c2) / 2
          if (before) {
            node.pos = c1 - 1 - node.cross
            for (let j = i - 1; j >= 0; j--) {
              layer[j].pos = Math.min(layer[j].pos, layer[j + 1].pos - separation(layer[j], layer[j + 1]) - layer[j].cross)
            }
          } else {
            node.pos = c2 + 2
            for (let j = i + 1; j < layer.length; j++) {
              layer[j].pos = Math.max(layer[j].pos, layer[j - 1].pos + layer[j - 1].cross + separation(layer[j - 1], layer[j]))
            }
          }
        })
      }
    }
  }
  const lowest = Math.min(...layers.flat().map((node) => node.pos))
  for (const node of layers.flat()) node.pos -= lowest

  assignPorts(layers, segs, horizontal, flip, labelWidth)
  const startLevel = new Map<string, number>()
  const endLevel = new Map<string, number>()
  const framed = framedIds
  for (const group of framed) {
    const span = spanOf(group)
    let start = 0
    let end = 0
    for (const child of framed) {
      if (groups.get(child)?.parent !== group) continue
      const inner = spanOf(child)
      if (inner.r1 === span.r1) start = Math.max(start, (startLevel.get(child) ?? 0) + 1)
      if (inner.r2 === span.r2) end = Math.max(end, (endLevel.get(child) ?? 0) + 1)
    }
    startLevel.set(group, start)
    endLevel.set(group, end)
  }
  const startRows = Array<number>(maxRank + 1).fill(0)
  const endRows = Array<number>(maxRank + 1).fill(0)
  for (const group of framed) {
    const span = spanOf(group)
    startRows[span.r1] = Math.max(startRows[span.r1], startLevel.get(group)! + 1)
    endRows[span.r2] = Math.max(endRows[span.r2], endLevel.get(group)! + 1)
  }

  const size = layers.map((layer) => Math.max(1, ...layer.filter((node) => !node.dummy).map((node) => node.main)))
  const labelBand: number[] = []
  const labelSpot = new Map<Chain, Spot>()
  const trackCount: number[] = []
  for (let r = 0; r < maxRank; r++) {
    const gapSegs = segs.filter((seg) => seg.from.rank === r)
    trackCount.push(assignTracks(gapSegs))
    const labeled = chains.filter((chain) => chain.label.length && chain.segs[chain.labelSeg].from.rank === r)
    if (horizontal) {
      labelBand.push(labeled.length ? Math.max(...labeled.map((chain) => chain.label[0].length)) + 3 : 0)
      continue
    }
    const lines = gapSegs.map((seg) => seg.p)
    const placed: { row: number; h: number; a: number; b: number }[] = []
    let band = 0
    for (const chain of labeled.sort((x, y) => x.segs[x.labelSeg].p - y.segs[y.labelSeg].p)) {
      const w = Math.max(...chain.label.map((line) => line.length))
      const h = chain.label.length
      const own = chain.segs[chain.labelSeg].p
      const options: { a: number; align: Spot['align'] }[] = [
        { a: own + 2, align: 'left' },
        { a: own - 1 - w, align: 'right' },
      ]
      const free = (a: number) => lines.every((c) => c === own || c < a - 1 || c > a + w)
      const pick = options.find((option) => free(option.a)) ?? { a: own - Math.floor(w / 2), align: 'center' as const }
      const a = pick.a
      const b = a + w - 1
      let row = 0
      while (placed.some((spot) => spot.a <= b + 1 && a <= spot.b + 1 && spot.row < row + h && row < spot.row + spot.h)) row++
      placed.push({ row, h, a, b })
      labelSpot.set(chain, { row, a, w, align: pick.align })
      band = Math.max(band, row + h)
    }
    labelBand.push(band)
  }

  const minGap = horizontal ? 4 : 3
  const bandStart: number[] = []
  let cursor = startRows[0] + 2
  for (let r = 0; r <= maxRank; r++) {
    bandStart.push(cursor)
    if (r === maxRank) break
    const need = 1 + endRows[r] + labelBand[r] + trackCount[r] + startRows[r + 1] + 1
    cursor += size[r] + Math.max(minGap, need)
  }
  const extent = bandStart[maxRank] + size[maxRank] + endRows[maxRank] + 2
  const mainOf = (node: LNode) => bandStart[node.rank] + Math.floor((size[node.rank] - node.main) / 2)
  const afterBand = (r: number) => bandStart[r] + size[r]

  const crossPad =
    2 * Math.max(0, ...[...groups.keys()].map(depthOf)) +
    Math.max(0, ...chains.flatMap((chain) => chain.label.map((line) => line.length))) +
    2
  const toXY = (m: number, c: number, mSize = 1, cSize = 1): Point => {
    const mm = flip ? extent - (m + mSize - 1) : m
    const cc = c + crossPad
    return horizontal ? [mm, cc] : [cc, mm]
  }

  const grid = new Grid()

  for (const group of framed) {
    const list = members.get(group)!
    const span = spanOf(group)
    const { c1, c2 } = crossRange(group)
    const m1 = bandStart[span.r1] - 2 - startLevel.get(group)!
    const m2 = afterBand(span.r2) + 1 + endLevel.get(group)!
    const [x, y] = toXY(m1, c1, m2 - m1 + 1, c2 - c1 + 1)
    const w = horizontal ? m2 - m1 + 1 : c2 - c1 + 1
    const h = horizontal ? c2 - c1 + 1 : m2 - m1 + 1
    const intrudes = [...byId.values()].some((node) => {
      if (list.includes(node)) return false
      const [nx, ny] = toXY(mainOf(node), node.pos, node.main, node.cross)
      const nw = horizontal ? node.main : node.cross
      const nh = horizontal ? node.cross : node.main
      return nx < x + w && x < nx + nw && ny < y + h && y < ny + nh
    })
    if (intrudes) continue
    grid.frameBox(x, y, w, h)
    const title = truncate(groups.get(group)!.title, w - 6)
    if (title) grid.text(x + 2, y, ` ${title} `)
  }

  const labels: { x: number; y: number; text: string }[] = []
  const heads: { x: number; y: number; ch: string }[] = []
  const tees: { x: number; y: number; dx: number; dy: number }[] = []
  for (const chain of chains) {
    const pts: [number, number][] = []
    chain.segs.forEach((seg, index) => {
      const r = seg.from.rank
      const start = seg.from.dummy ? afterBand(r) : mainOf(seg.from) + seg.from.main
      const end = seg.to.dummy ? afterBand(r + 1) - 1 : mainOf(seg.to) - 1
      const track = afterBand(r) + 1 + endRows[r] + labelBand[r] + seg.track
      pts.push([start, seg.p])
      if (seg.p !== seg.q) pts.push([track, seg.p], [track, seg.q])
      pts.push([end, seg.q])
      if (index === chain.labelSeg && chain.label.length) {
        const base = afterBand(r) + 1 + endRows[r]
        if (horizontal) {
          const text = ` ${chain.label[0]} `
          const [x, y] = toXY(base, seg.p, text.length, 1)
          labels.push({ x, y, text })
        } else {
          const spot = labelSpot.get(chain)!
          chain.label.forEach((line, i) => {
            const shift = spot.align === 'left' ? 0 : spot.align === 'right' ? spot.w - line.length : Math.floor((spot.w - line.length) / 2)
            const [x, y] = toXY(base + spot.row + i, spot.a + shift, 1, line.length)
            labels.push({ x, y, text: line })
          })
        }
      }
    })
    const physical = pts.map(([m, c]) => toXY(m, c)).filter((pt, i, all) => i === 0 || pt[0] !== all[i - 1][0] || pt[1] !== all[i - 1][1])
    const style = chain.edge.style === 'hidden' ? 'solid' : chain.edge.style
    grid.path(physical, style)
    const endHead = chain.reversed ? chain.edge.tail : chain.edge.head
    const startHead = chain.reversed ? chain.edge.head : chain.edge.tail
    const mark = (at: Point, from: Point | undefined, head: Head) => {
      const dx = from ? Math.sign(at[0] - from[0]) : 0
      const dy = from ? Math.sign(at[1] - from[1]) : 0
      if (head === 'none') tees.push({ x: at[0] + dx, y: at[1] + dy, dx, dy })
      else heads.push({ x: at[0], y: at[1], ch: head === 'circle' ? '●' : head === 'cross' ? '×' : arrowHead(dx, dy) })
    }
    const last = physical[physical.length - 1]
    mark(last, physical[physical.length - 2] ?? toXY(0, 0), endHead)
    mark(physical[0], physical[1], startHead)
  }

  for (const label of labels) grid.text(label.x, label.y, label.text)
  for (const head of heads) grid.text(head.x, head.y, head.ch)
  for (const node of byId.values()) {
    const [x, y] = toXY(mainOf(node), node.pos, node.main, node.cross)
    node.art.forEach((line, i) => {
      for (let j = 0; j < line.length; j++) if (line[j] !== ' ') grid.text(x + j, y + i, line[j])
    })
  }
  for (const tee of tees) {
    const ch = grid.textAt(tee.x, tee.y)
    if (ch === '─') grid.text(tee.x, tee.y, tee.dy > 0 ? '┴' : '┬')
    else if (ch === '│') grid.text(tee.x, tee.y, tee.dx > 0 ? '┤' : '├')
  }
  for (const edge of loops) {
    const node = byId.get(edge.from)
    if (!node || node.art.length < 3) continue
    const [x, y] = toXY(mainOf(node), node.pos, node.main, node.cross)
    const w = Math.max(...node.art.map((line) => line.length))
    const row = y + Math.max(1, Math.floor((node.art.length - 2) / 2))
    grid.path([[x + w, row], [x + w + 1, row], [x + w + 1, row + 1], [x + w, row + 1]], edge.style === 'hidden' ? 'solid' : edge.style)
    grid.text(x + w - 1, row, '├')
    grid.text(x + w, row + 1, '◄')
    if (edge.label) grid.text(x + w + 3, row, edge.label.replace(/\n/g, ' '))
  }
  return fit(grid.toLines(), width)
}

function truncate(text: string, max: number): string {
  if (max <= 0) return ''
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text
}

function orderLayers(
  layers: LNode[][],
  up: Map<LNode, LNode[]>,
  down: Map<LNode, LNode[]>,
  segs: Seg[],
  chainOf: (group: string | null) => string[],
) {
  for (const layer of layers) layer.sort((a, b) => a.seq - b.seq)
  const index = new Map<LNode, number>()
  const reindex = () => layers.forEach((layer) => layer.forEach((node, i) => index.set(node, i)))
  reindex()
  const groupIds = new Map<string, number>()
  const sortLayer = (layer: LNode[], neighbors: Map<LNode, LNode[]>) => {
    const own = new Map<LNode, number>()
    for (const node of layer) {
      const list = neighbors.get(node) ?? []
      own.set(node, list.length ? list.reduce((sum, n) => sum + index.get(n)!, 0) / list.length : index.get(node)!)
    }
    const groupKey = new Map<string, number>()
    const groupKeyOf = (group: string) => {
      if (!groupKey.has(group)) {
        const inside = layer.filter((node) => chainOf(node.group).includes(group))
        if (!groupIds.has(group)) groupIds.set(group, groupIds.size)
        groupKey.set(group, inside.reduce((sum, node) => sum + own.get(node)!, 0) / inside.length + groupIds.get(group)! * 1e-6)
      }
      return groupKey.get(group)!
    }
    const keys = new Map(layer.map((node) => [node, [...chainOf(node.group).map(groupKeyOf), own.get(node)!]]))
    layer.sort((a, b) => {
      const ka = keys.get(a)!
      const kb = keys.get(b)!
      for (let i = 0; i < Math.min(ka.length, kb.length); i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]
      return index.get(a)! - index.get(b)!
    })
    layer.forEach((node, i) => index.set(node, i))
  }
  const crossings = () => {
    let count = 0
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const a = segs[i]
        const b = segs[j]
        if (a.from.rank !== b.from.rank) continue
        if ((index.get(a.from)! - index.get(b.from)!) * (index.get(a.to)! - index.get(b.to)!) < 0) count++
      }
    }
    return count
  }
  let best = layers.map((layer) => [...layer])
  let bestCount = Infinity
  for (let iter = 0; iter < 8; iter++) {
    if (iter % 2 === 0) for (let r = 1; r < layers.length; r++) sortLayer(layers[r], up)
    else for (let r = layers.length - 2; r >= 0; r--) sortLayer(layers[r], down)
    const count = crossings()
    if (count < bestCount) {
      bestCount = count
      best = layers.map((layer) => [...layer])
    }
  }
  best.forEach((layer, r) => {
    layers[r].splice(0, layers[r].length, ...layer)
  })
}

function placeCross(
  layers: LNode[][],
  up: Map<LNode, LNode[]>,
  down: Map<LNode, LNode[]>,
  separation: (a: LNode, b: LNode) => number,
) {
  const center = (node: LNode) => node.pos + (node.cross - 1) / 2
  const place = (layer: LNode[], desired: number[]) => {
    const offsets: number[] = []
    let offset = 0
    layer.forEach((node, i) => {
      offsets.push(offset)
      if (i < layer.length - 1) offset += node.cross + separation(node, layer[i + 1])
    })
    const fitted = isotonic(desired.map((d, i) => d - offsets[i]))
    layer.forEach((node, i) => {
      node.pos = fitted[i] + offsets[i]
    })
  }
  for (const layer of layers) place(layer, layer.map(() => 0))
  for (let iter = 0; iter < 8; iter++) {
    const downward = iter % 2 === 0
    const order = downward ? layers : [...layers].reverse()
    for (const layer of order) {
      const neighbors = downward ? up : down
      place(
        layer,
        layer.map((node) => {
          const list = neighbors.get(node) ?? []
          const target = list.length ? list.reduce((sum, n) => sum + center(n), 0) / list.length : center(node)
          return target - (node.cross - 1) / 2
        }),
      )
    }
  }
  for (const layer of layers) {
    let prev: LNode | null = null
    for (const node of layer) {
      node.pos = Math.round(node.pos)
      if (prev) node.pos = Math.max(node.pos, prev.pos + prev.cross + separation(prev, node))
      prev = node
    }
  }
  const min = Math.min(...layers.flat().map((node) => node.pos))
  for (const node of layers.flat()) node.pos -= min
}

function allowed(node: LNode, side: 'top' | 'bottom' | 'left' | 'right'): number[] {
  if (node.dummy) return [0]
  const art = node.art
  const w = Math.max(...art.map((line) => line.length))
  if (side === 'top' || side === 'bottom') {
    const line = side === 'top' ? art[0] : art[art.length - 1]
    const f = line.search(/\S/)
    const l = line.trimEnd().length - 1
    const out: number[] = []
    for (let c = f + 1; c <= l - 1; c++) out.push(c)
    if (!out.length) for (let c = f; c <= l; c++) out.push(c)
    return out
  }
  let rows = art
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => (side === 'right' ? line.trimEnd().length === w : line.search(/\S/) === 0))
    .map(({ i }) => i)
  if (rows.length >= 3 && rows[0] === 0 && rows[rows.length - 1] === art.length - 1) rows = rows.slice(1, -1)
  return rows.length ? rows : [Math.floor((art.length - 1) / 2)]
}

function assignPorts(
  layers: LNode[][],
  segs: Seg[],
  horizontal: boolean,
  flip: boolean,
  labelWidth: (seg: Seg) => number,
) {
  const outSide = horizontal ? (flip ? 'left' : 'right') : flip ? 'top' : 'bottom'
  const inSide = horizontal ? (flip ? 'right' : 'left') : flip ? 'bottom' : 'top'
  const center = (node: LNode) => node.pos + (node.cross - 1) / 2
  const sides = new Map<LNode, { out: Seg[]; in: Seg[] }>()
  for (const node of layers.flat()) sides.set(node, { out: [], in: [] })
  for (const seg of segs) {
    sides.get(seg.from)!.out.push(seg)
    sides.get(seg.to)!.in.push(seg)
  }
  const done = new Set<string>()
  const setPort = (seg: Seg, end: 'p' | 'q', value: number) => {
    seg[end] = value
    done.add(`${end}:${segs.indexOf(seg)}`)
  }
  const spread = (node: LNode, list: Seg[], end: 'p' | 'q', side: 'top' | 'bottom' | 'left' | 'right') => {
    const slots = allowed(node, side).map((c) => node.pos + c)
    const other = (seg: Seg) => center(end === 'p' ? seg.to : seg.from)
    const sorted = [...list].sort((a, b) => other(a) - other(b))
    if (!horizontal && end === 'p' && sorted.some(labelWidth)) {
      const offsets = [0]
      sorted.slice(0, -1).forEach((seg, i) => offsets.push(offsets[i] + (labelWidth(seg) ? labelWidth(seg) + 3 : 2)))
      const start = Math.max(0, Math.floor((slots.length - 1 - offsets[offsets.length - 1]) / 2))
      sorted.forEach((seg, i) => setPort(seg, end, slots[Math.min(slots.length - 1, start + offsets[i])]))
      return
    }
    sorted.forEach((seg, i) => {
      const at = Math.round(((i + 1) * (slots.length + 1)) / (sorted.length + 1)) - 1
      setPort(seg, end, slots[Math.max(0, Math.min(slots.length - 1, at))])
    })
  }
  for (const node of layers.flat()) {
    const { out, in: inc } = sides.get(node)!
    if (node.dummy) {
      for (const seg of out) setPort(seg, 'p', node.pos)
      for (const seg of inc) setPort(seg, 'q', node.pos)
      continue
    }
    if (out.length > 1) spread(node, out, 'p', outSide)
    if (inc.length > 1) spread(node, inc, 'q', inSide)
  }
  const closest = (slots: number[], target: number) =>
    slots.reduce((best, c) => (Math.abs(c - target) < Math.abs(best - target) ? c : best), slots[0])
  for (const seg of segs) {
    const pDone = done.has(`p:${segs.indexOf(seg)}`)
    const qDone = done.has(`q:${segs.indexOf(seg)}`)
    if (pDone && qDone) continue
    const taken = new Set(
      segs
        .filter((other) => other !== seg && other.from.rank === seg.from.rank)
        .flatMap((other) => [done.has(`p:${segs.indexOf(other)}`) ? other.p : NaN, done.has(`q:${segs.indexOf(other)}`) ? other.q : NaN]),
    )
    const avoid = (slots: number[]) => (slots.some((c) => !taken.has(c)) ? slots.filter((c) => !taken.has(c)) : slots)
    const pSlots = avoid(allowed(seg.from, outSide).map((c) => seg.from.pos + c))
    const qSlots = avoid(allowed(seg.to, inSide).map((c) => seg.to.pos + c))
    if (pDone) setPort(seg, 'q', closest(qSlots, seg.p))
    else if (qDone) setPort(seg, 'p', closest(pSlots, seg.q))
    else {
      const shared = pSlots.filter((c) => qSlots.includes(c))
      const mid = (center(seg.from) + center(seg.to)) / 2
      const straight = shared.length ? closest(shared, mid) : null
      setPort(seg, 'p', straight ?? closest(pSlots, center(seg.to)))
      setPort(seg, 'q', straight ?? closest(qSlots, center(seg.from)))
    }
  }
}

function assignTracks(gapSegs: Seg[]): number {
  const bent = gapSegs.filter((seg) => seg.p !== seg.q)
  const rightward = bent.filter((seg) => seg.q > seg.p).sort((a, b) => b.p - a.p)
  const leftward = bent.filter((seg) => seg.q < seg.p).sort((a, b) => a.p - b.p)
  const placed: Seg[] = []
  let count = 0
  const overlaps = (a: Seg, b: Seg) => Math.min(a.p, a.q) <= Math.max(b.p, b.q) && Math.min(b.p, b.q) <= Math.max(a.p, a.q)
  for (const seg of [...rightward, ...leftward]) {
    const sameWay = placed.filter((other) => other.q > other.p === seg.q > seg.p && overlaps(seg, other))
    const floor = Math.max(0, ...sameWay.map((other) => other.track + 1))
    let chosen = -1
    for (let t = floor; t <= floor + placed.length; t++) {
      const ok = placed.every((other) => {
        if (other.track === t && overlaps(seg, other)) return false
        if (seg.p === other.q && !(t < other.track)) return false
        if (seg.q === other.p && !(t > other.track)) return false
        return true
      })
      if (ok) {
        chosen = t
        break
      }
    }
    seg.track = chosen === -1 ? floor + placed.length : chosen
    placed.push(seg)
    count = Math.max(count, seg.track + 1)
  }
  for (const seg of gapSegs) if (seg.track < 0) seg.track = 0
  return count
}

export function renderFlowchart(src: string, width: number): string[] | null {
  const flow = parseFlow(src)
  return flow ? layoutFlow(flow, width) : null
}
