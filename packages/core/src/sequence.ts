import { decode, wrapWords } from './flowchart.js'
import { fit, Grid, type LineStyle } from './grid.js'
import { centerText } from './text.js'

type Participant = { id: string; label: string[]; actor: boolean; w: number; x: number }
type Head = 'arrow' | 'cross' | 'open' | 'none'
type Step =
  | { type: 'msg'; from: number; to: number; label: string; text: string[]; style: LineStyle; head: Head; both: boolean }
  | { type: 'note'; from: number; to: number; side: 'over' | 'left' | 'right'; text: string[] }
  | { type: 'open'; label: string; depth: number }
  | { type: 'else'; label: string; depth: number }
  | { type: 'close'; depth: number }

const ARROW = /^([^\-+>:<,;]+?)\s*(<<-->>|<<->>|-->>|->>|-->|->|--x|-x|--\)|-\))\s*[+-]?\s*([^:+\-<>]+?)\s*:\s*(.*)$/
const BLOCK = /^(loop|alt|opt|par|critical|break)\b\s*(.*)$/i
const SKIP = /^(sequenceDiagram|autonumber|title|accTitle|accDescr|activate|deactivate|create|destroy|links?|properties|details)\b/i

function text(raw: string): string {
  return decode(raw.replace(/<br\s*\/?>/gi, '\n')).trim()
}

export function renderSequence(src: string, width: number): string[] | null {
  const participants: Participant[] = []
  const known = new Map<string, number>()
  const ensure = (id: string, label?: string, actor = false) => {
    const key = id.trim()
    if (!known.has(key)) {
      known.set(key, participants.length)
      participants.push({ id: key, label: [key], actor, w: 0, x: 0 })
    }
    const item = participants[known.get(key)!]
    if (label) item.label = text(label).split('\n')
    if (actor) item.actor = true
    return known.get(key)!
  }
  const wrapW = Math.max(24, Math.floor(width * 0.45))
  const steps: Step[] = []
  const stack: boolean[] = []
  let numbered = false
  let count = 0
  for (const raw of src.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('%%')) continue
    if (/^autonumber\b/i.test(line)) {
      numbered = !/\boff\b/i.test(line)
      continue
    }
    if (SKIP.test(line)) continue
    const actor = /^(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/i.exec(line)
    if (actor) {
      ensure(actor[2], actor[3], actor[1].toLowerCase() === 'actor')
      continue
    }
    if (/^(box|rect)\b/i.test(line)) {
      stack.push(false)
      continue
    }
    const block = BLOCK.exec(line)
    if (block) {
      steps.push({ type: 'open', label: `${block[1]}${block[2] ? ` [${text(block[2])}]` : ''}`, depth: stack.filter(Boolean).length })
      stack.push(true)
      continue
    }
    const branch = /^(else|and|option)\b\s*(.*)$/i.exec(line)
    if (branch) {
      steps.push({ type: 'else', label: branch[2] ? `[${text(branch[2])}]` : '', depth: stack.filter(Boolean).length - 1 })
      continue
    }
    if (/^end$/i.test(line)) {
      if (stack.pop()) steps.push({ type: 'close', depth: stack.filter(Boolean).length })
      continue
    }
    const note = /^note\s+(over|left of|right of)\s+([^:]+):\s*(.*)$/i.exec(line)
    if (note) {
      const ids = note[2].split(',').map((id) => ensure(id))
      const side = note[1].toLowerCase().startsWith('left') ? 'left' : note[1].toLowerCase().startsWith('right') ? 'right' : 'over'
      steps.push({ type: 'note', from: Math.min(...ids), to: Math.max(...ids), side, text: wrapWords(text(note[3]), 32) })
      continue
    }
    const msg = ARROW.exec(line)
    if (msg) {
      const arrow = msg[2]
      const label = numbered ? `${++count}. ${text(msg[4])}` : text(msg[4])
      steps.push({
        type: 'msg',
        from: ensure(msg[1]),
        to: ensure(msg[3]),
        label,
        text: wrapWords(label, wrapW),
        style: arrow.includes('--') ? 'dotted' : 'solid',
        head: arrow.endsWith('x') ? 'cross' : arrow.endsWith(')') ? 'open' : arrow.endsWith('>>') ? 'arrow' : 'none',
        both: arrow.startsWith('<<'),
      })
    }
  }
  if (!participants.length) return null

  const n = participants.length
  for (const item of participants) item.w = Math.max(...item.label.map((line) => line.length)) + 4
  const half = (w: number) => Math.ceil(w / 2)
  const textW = (lines: string[]) => Math.max(0, ...lines.map((line) => line.length))
  const gaps = participants.slice(1).map((item, i) => half(participants[i].w) + half(item.w) + 2)
  const needs: { a: number; b: number; need: number }[] = []
  let leftNeed = 0
  for (const step of steps) {
    if (step.type === 'msg') {
      const w = textW(step.text)
      if (step.from === step.to) {
        if (step.from < n - 1) needs.push({ a: step.from, b: step.from + 1, need: w + 5 })
      } else needs.push({ a: Math.min(step.from, step.to), b: Math.max(step.from, step.to), need: w + 4 })
    } else if (step.type === 'note') {
      const w = textW(step.text) + 4
      if (step.side === 'right' && step.from < n - 1) needs.push({ a: step.from, b: step.from + 1, need: w + 3 })
      if (step.side === 'left') {
        if (step.from > 0) needs.push({ a: step.from - 1, b: step.from, need: w + 3 })
        else leftNeed = Math.max(leftNeed, w + 2)
      }
      if (step.side === 'over' && step.from === step.to) {
        if (step.from > 0) needs.push({ a: step.from - 1, b: step.from, need: half(w) + 2 })
        if (step.from < n - 1) needs.push({ a: step.from, b: step.from + 1, need: half(w) + 2 })
        if (step.from === 0) leftNeed = Math.max(leftNeed, half(w))
      }
      if (step.side === 'over' && step.from !== step.to) needs.push({ a: step.from, b: step.to, need: w - 4 })
    }
  }
  needs.sort((p, q) => p.b - p.a - (q.b - q.a))
  for (const { a, b, need } of needs) {
    const have = gaps.slice(a, b).reduce((sum, gap) => sum + gap, 0)
    if (have >= need) continue
    const extra = need - have
    const span = b - a
    for (let k = a; k < b; k++) gaps[k] += Math.floor(extra / span) + (k - a < extra % span ? 1 : 0)
  }
  const blockDepth = Math.max(0, ...steps.map((step) => (step.type === 'open' ? step.depth + 1 : 0)))
  participants[0].x = Math.max(half(participants[0].w), blockDepth + 2 + leftNeed)
  for (let i = 1; i < n; i++) participants[i].x = participants[i - 1].x + gaps[i - 1]

  let right = participants[n - 1].x + half(participants[n - 1].w)
  for (const step of steps) {
    if (step.type === 'msg' && step.from === step.to) right = Math.max(right, participants[step.from].x + 2 + textW(step.text))
    if (step.type === 'note' && step.side === 'right') right = Math.max(right, participants[step.from].x + 2 + textW(step.text) + 4)
    if (step.type === 'note' && step.side === 'over') right = Math.max(right, participants[step.to].x + half(textW(step.text) + 4))
  }
  right += 2 + blockDepth

  const grid = new Grid()
  const headH = Math.max(...participants.map((item) => item.label.length)) + 2
  const drawHeads = (y: number, top: boolean) => {
    for (const item of participants) {
      const [tl, tr, bl, br] = item.actor ? ['╭', '╮', '╰', '╯'] : ['┌', '┐', '└', '┘']
      const left = item.x - Math.floor((item.w - 1) / 2)
      const h = item.label.length + 2
      const y0 = top ? y + headH - h : y
      grid.text(left, y0, tl + '─'.repeat(item.w - 2) + tr)
      item.label.forEach((line, i) => grid.text(left, y0 + 1 + i, `│${centerText(line, item.w - 2)}│`))
      grid.text(left, y0 + h - 1, bl + '─'.repeat(item.w - 2) + br)
      grid.text(item.x, top ? y0 + h - 1 : y0, top ? '┬' : '┴')
    }
  }
  drawHeads(0, true)

  let y = headH + 1
  const open: { y: number; depth: number; label: string; splits: { y: number; label: string }[] }[] = []
  for (const step of steps) {
    if (step.type === 'open') {
      open.push({ y, depth: step.depth, label: step.label, splits: [] })
      y += 1
    } else if (step.type === 'else') {
      open[open.length - 1]?.splits.push({ y, label: step.label })
      y += 1
    } else if (step.type === 'close') {
      const block = open.pop()
      if (!block) continue
      const left = block.depth
      const r = right - block.depth
      grid.frameBox(left, block.y, r - left + 1, y - block.y + 1)
      grid.text(left + 2, block.y, ` ${block.label} `)
      for (const split of block.splits) {
        grid.frame(left, split.y, `├${'┄'.repeat(r - left - 1)}┤`)
        if (split.label) grid.text(left + 2, split.y, ` ${split.label} `)
      }
      y += 2
    } else if (step.type === 'note') {
      const w = textW(step.text) + 4
      const a = participants[step.from].x
      const b = participants[step.to].x
      let left: number
      let boxW = w
      if (step.side === 'right') left = a + 2
      else if (step.side === 'left') left = a - 1 - w
      else if (step.from === step.to) left = a - Math.floor((w - 1) / 2)
      else {
        boxW = Math.max(w, b - a + 5)
        left = a - 2 - Math.floor((boxW - (b - a + 5)) / 2)
      }
      grid.text(left, y, `┌${'─'.repeat(boxW - 2)}┐`)
      step.text.forEach((line, i) => grid.text(left, y + 1 + i, `│${centerText(line, boxW - 2)}│`))
      grid.text(left, y + step.text.length + 1, `└${'─'.repeat(boxW - 2)}┘`)
      y += step.text.length + 3
    } else {
      const a = participants[step.from].x
      const b = participants[step.to].x
      if (a === b) {
        step.text.forEach((line, i) => grid.text(a + 2, y + i, line))
        const row = y + step.text.length
        grid.path([[a, row], [a + 3, row], [a + 3, row + 1], [a + 1, row + 1]], step.style)
        grid.text(a + 1, row + 1, '◄')
        y = row + 3
        continue
      }
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      const lines = wrapWords(step.label, Math.max(wrapW, hi - lo - 3))
      lines.forEach((line, i) => grid.text(lo + 1, y + i, centerText(line, hi - lo - 1).trimEnd()))
      const row = y + lines.length
      const dir = Math.sign(b - a)
      const end = step.head === 'none' ? b : b - dir
      const start = step.both ? a + dir : a
      grid.path([[a, row], [end, row]], step.style)
      const glyph = (toward: number) =>
        step.head === 'cross' ? '×' : step.head === 'open' ? (toward > 0 ? '>' : '<') : toward > 0 ? '►' : '◄'
      if (step.head !== 'none') grid.text(end, row, glyph(dir))
      if (step.both) grid.text(start, row, glyph(-dir))
      y = row + 2
    }
  }
  for (const item of participants) grid.path([[item.x, headH], [item.x, y]], 'solid')
  drawHeads(y + 1, false)
  return fit(grid.toLines(), width)
}
