export type Span = {
  text: string
  color?: string
  bg?: string
  bold?: boolean
  italic?: boolean
  dim?: boolean
}

export function padEnd(text: string, width: number): string {
  if (text.length >= width) return text
  return text + ' '.repeat(width - text.length)
}

export function padStart(text: string, width: number): string {
  if (text.length >= width) return text
  return ' '.repeat(width - text.length) + text
}

export function centerText(text: string, width: number): string {
  if (text.length >= width) return text
  const left = Math.floor((width - text.length) / 2)
  return ' '.repeat(left) + text + ' '.repeat(width - text.length - left)
}

export function spanWidth(spans: Span[]): number {
  let n = 0
  for (const span of spans) n += span.text.length
  return n
}

export function wrapText(text: string, width: number): string[] {
  const limit = Math.max(8, width)
  const out: string[] = []
  for (const raw of text.split('\n')) {
    let rest = raw
    if (rest.length === 0) {
      out.push('')
      continue
    }
    while (rest.length > limit) {
      let cut = rest.lastIndexOf(' ', limit)
      if (cut <= 0) cut = limit
      out.push(rest.slice(0, cut).trimEnd())
      rest = rest.slice(cut).trimStart()
    }
    out.push(rest)
  }
  return out.length ? out : ['']
}

export function wrapSpans(spans: Span[], width: number): Span[][] {
  const limit = Math.max(8, width)
  const chunks: Span[][] = [[]]
  for (const span of spans) {
    const parts = span.text.split('\n')
    parts.forEach((part, index) => {
      if (index > 0) chunks.push([])
      if (part) chunks[chunks.length - 1].push({ ...span, text: part })
    })
  }
  const lines: Span[][] = []
  for (const chunk of chunks) {
    if (chunk.length === 0) {
      lines.push([{ text: '' }])
      continue
    }
    let line: Span[] = []
    let col = 0
    const push = () => {
      lines.push(line.length ? line : [{ text: '' }])
      line = []
      col = 0
    }
    for (const span of chunk) {
      let rest = span.text
      while (rest.length) {
        const room = limit - col
        if (room <= 0) {
          push()
          continue
        }
        if (rest.length <= room) {
          line.push({ ...span, text: rest })
          col += rest.length
          rest = ''
          break
        }
        let cut = rest.lastIndexOf(' ', room)
        if (cut <= 0) {
          if (col > 0) {
            push()
            continue
          }
          cut = room
        }
        const part = rest.slice(0, cut)
        if (part) line.push({ ...span, text: part })
        rest = rest.slice(cut).replace(/^ /, '')
        push()
      }
    }
    if (line.length) lines.push(line)
  }
  return lines.length ? lines : [[{ text: '' }]]
}

export function sliceSpans(spans: Span[], start: number, width: number): Span[] {
  const from = Math.max(0, start)
  const out: Span[] = []
  let index = 0
  for (const span of spans) {
    const end = index + span.text.length
    if (end > from && index < from + width) {
      const a = Math.max(0, from - index)
      const b = Math.min(span.text.length, from + width - index)
      const text = span.text.slice(a, b)
      if (text) out.push({ ...span, text })
    }
    index = end
    if (index >= from + width) break
  }
  return out.length ? out : [{ text: '' }]
}

function rgb(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = m[1]
  return `${parseInt(n.slice(0, 2), 16)};${parseInt(n.slice(2, 4), 16)};${parseInt(n.slice(4, 6), 16)}`
}

export function linesToAnsi(lines: Span[][]): string {
  return lines
    .map((line) =>
      line
        .map((span) => {
          const codes: string[] = []
          if (span.bold) codes.push('1')
          if (span.dim) codes.push('2')
          if (span.italic) codes.push('3')
          const fg = span.color ? rgb(span.color) : null
          const bg = span.bg ? rgb(span.bg) : null
          if (fg) codes.push(`38;2;${fg}`)
          if (bg) codes.push(`48;2;${bg}`)
          if (!codes.length) return span.text
          return `\u001b[${codes.join(';')}m${span.text}\u001b[0m`
        })
        .join(''),
    )
    .join('\n')
}

export function linesToPlain(lines: Span[][]): string {
  return lines.map((line) => line.map((span) => span.text).join('')).join('\n')
}
