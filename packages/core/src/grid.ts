export type LineStyle = 'solid' | 'dotted' | 'thick'

const UP = 1
const RIGHT = 2
const DOWN = 4
const LEFT = 8

const GLYPHS: Record<LineStyle, string> = {
  solid: ' │─╰││╭├─╯─┴╮┤┬┼',
  dotted: ' ┆┄╰┆┆╭├┄╯┄┴╮┤┬┼',
  thick: ' ┃━┗┃┃┏┣━┛━┻┓┫┳╋',
}
const RANK: Record<LineStyle, number> = { dotted: 1, solid: 2, thick: 3 }

type Cell = { frame: string; mask: number; style: LineStyle; text: string }

export type Point = [x: number, y: number]

// Three layers: frames under lines under text, so a line crossing a frame stays whole
// and a box or label always wins over the lines behind it.
export class Grid {
  private rows: Cell[][] = []

  private cell(x: number, y: number): Cell | null {
    if (x < 0 || y < 0) return null
    while (this.rows.length <= y) this.rows.push([])
    const row = this.rows[y]
    while (row.length <= x) row.push({ frame: '', mask: 0, style: 'dotted', text: '' })
    return row[x]
  }

  textAt(x: number, y: number): string {
    return this.rows[y]?.[x]?.text ?? ''
  }

  text(x: number, y: number, value: string) {
    for (let i = 0; i < value.length; i++) {
      const cell = this.cell(x + i, y)
      if (cell) cell.text = value[i]
    }
  }

  frame(x: number, y: number, value: string) {
    for (let i = 0; i < value.length; i++) {
      const cell = this.cell(x + i, y)
      if (cell) cell.frame = value[i]
    }
  }

  frameBox(x: number, y: number, w: number, h: number) {
    if (w < 2 || h < 2) return
    this.frame(x, y, `┌${'─'.repeat(w - 2)}┐`)
    this.frame(x, y + h - 1, `└${'─'.repeat(w - 2)}┘`)
    for (let row = y + 1; row < y + h - 1; row++) {
      this.frame(x, row, '│')
      this.frame(x + w - 1, row, '│')
    }
  }

  private link(x: number, y: number, mask: number, style: LineStyle) {
    const cell = this.cell(x, y)
    if (!cell) return
    cell.mask |= mask
    if (RANK[style] > RANK[cell.style] || cell.mask === mask) cell.style = style
  }

  path(points: Point[], style: LineStyle) {
    for (let i = 1; i < points.length; i++) {
      let [x, y] = points[i - 1]
      const [tx, ty] = points[i]
      const dx = Math.sign(tx - x)
      const dy = Math.sign(ty - y)
      if (dx && dy) throw new Error('paths must be orthogonal')
      const out = dx > 0 ? RIGHT : dx < 0 ? LEFT : dy > 0 ? DOWN : UP
      const back = dx > 0 ? LEFT : dx < 0 ? RIGHT : dy > 0 ? UP : DOWN
      while (x !== tx || y !== ty) {
        this.link(x, y, out, style)
        x += dx
        y += dy
        this.link(x, y, back, style)
      }
    }
  }

  toLines(): string[] {
    const lines = this.rows.map((row) =>
      row
        .map((cell) => cell.text || (cell.mask ? GLYPHS[cell.style][cell.mask] : cell.frame) || ' ')
        .join('')
        .replace(/\s+$/, ''),
    )
    while (lines.length && !lines[0]) lines.shift()
    while (lines.length && !lines[lines.length - 1]) lines.pop()
    const indent = Math.min(...lines.filter(Boolean).map((line) => line.length - line.trimStart().length))
    return lines.map((line) => line.slice(indent))
  }
}

export function fit(lines: string[], width: number): string[] {
  if (!lines.length) return ['(empty diagram)']
  const max = Math.max(...lines.map((line) => line.length))
  const pad = Math.floor((width - max) / 2)
  if (pad <= 0) return lines
  return lines.map((line) => (line ? ' '.repeat(pad) + line : line))
}

export function arrowHead(dx: number, dy: number): string {
  if (dx > 0) return '►'
  if (dx < 0) return '◄'
  if (dy > 0) return '▼'
  return '▲'
}
