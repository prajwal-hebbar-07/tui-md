import { layoutFlow, redirectGroupEdges, renderFlowchart, type Flow, type FlowEdge, type FlowNode } from './flowchart.js'
import { fit } from './grid.js'
import { renderSequence } from './sequence.js'
import { wrapText } from './text.js'

function kindOf(src: string): string {
  const line = src
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item && !item.startsWith('%%'))
  if (!line) return ''
  return line.split(/[\s{]/)[0].toLowerCase()
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
