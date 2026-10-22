import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import { renderMermaid } from './mermaid.js'
import { padEnd, type Span, wrapSpans, wrapText } from './text.js'

const md = new MarkdownIt({ html: false, linkify: true, breaks: false })

const TEXT = '#cccccc'
const HEAD = '#ffffff'
const MUTED = '#858585'
const CODE = '#ce9178'
const CODE_BG = '#2d2d2d'
const LINK = '#4daafc'
const QUOTE = '#b4b4b4'

function inlineSpans(token: Token | null): Span[] {
  if (!token?.children) return []
  const out: Span[] = []
  const stack: Span[] = [{ text: '', color: TEXT }]
  const current = () => stack[stack.length - 1]
  for (const child of token.children) {
    if (child.type === 'strong_open') stack.push({ ...current(), bold: true, text: '' })
    else if (child.type === 'strong_close' || child.type === 'em_close' || child.type === 's_close' || child.type === 'link_close') {
      if (stack.length > 1) stack.pop()
    } else if (child.type === 'em_open') stack.push({ ...current(), italic: true, text: '' })
    else if (child.type === 's_open') stack.push({ ...current(), dim: true, text: '' })
    else if (child.type === 'link_open') stack.push({ ...current(), color: LINK, text: '' })
    else if (child.type === 'code_inline') {
      out.push({ text: ` ${child.content} `, color: CODE, bg: CODE_BG })
    } else if (child.type === 'text' || child.type === 'softbreak') {
      const style = current()
      out.push({ ...style, text: child.type === 'softbreak' ? ' ' : child.content })
    } else if (child.type === 'hardbreak') out.push({ text: '\n', color: TEXT })
    else if (child.type === 'image') {
      const src = child.attrGet('src') || ''
      out.push({ text: `[image: ${child.content || src}]`, color: LINK })
    }
  }
  return out
}

function prefixLines(lines: Span[][], first: string, rest: string, color = MUTED): Span[][] {
  return lines.map((line, index) => [{ text: index === 0 ? first : rest, color }, ...line])
}

function paragraph(token: Token, width: number): Span[][] {
  return wrapSpans(inlineSpans(token), width)
}

function codeBlock(text: string, lang: string, width: number): Span[][] {
  const lines: Span[][] = []
  if (lang) lines.push([{ text: lang, color: MUTED, dim: true }])
  const body = text.replace(/\n$/, '').split('\n')
  for (const line of body) {
    for (const wrapped of wrapText(line || ' ', Math.max(8, width - 2))) {
      lines.push([{ text: ` ${padEnd(wrapped, Math.max(8, width - 2))} `, color: '#d4d4d4', bg: CODE_BG }])
    }
  }
  return lines
}

function tableLines(tokens: Token[], index: number, width: number): { lines: Span[][]; next: number } {
  const rows: string[][] = []
  let row: string[] = []
  let i = index + 1
  for (; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.type === 'table_close') {
      i++
      break
    }
    if (token.type === 'tr_open') row = []
    else if (token.type === 'tr_close') rows.push(row)
    else if (token.type === 'inline') row.push(token.content.replace(/\s+/g, ' ').trim())
  }
  if (!rows.length) return { lines: [], next: i }
  const cols = Math.max(...rows.map((item) => item.length))
  const widths = Array.from({ length: cols }, (_, col) => {
    let size = 3
    for (const item of rows) size = Math.max(size, (item[col] || '').length)
    return Math.min(size, 40)
  })
  const rule = (left: string, mid: string, right: string, fill: string) =>
    left + widths.map((col) => fill.repeat(col + 2)).join(mid) + right
  const format = (cells: string[]) =>
    '│' +
    widths
      .map((col, cell) => ` ${padEnd((cells[cell] || '').slice(0, col), col)} `)
      .join('│') +
    '│'
  const lines: Span[][] = [
    [{ text: rule('┌', '┬', '┐', '─'), color: MUTED }],
    [{ text: format(rows[0]), color: HEAD, bold: true }],
    [{ text: rule('├', '┼', '┤', '─'), color: MUTED }],
  ]
  for (const item of rows.slice(1)) lines.push([{ text: format(item), color: TEXT }])
  lines.push([{ text: rule('└', '┴', '┘', '─'), color: MUTED }])
  void width
  return { lines, next: i }
}

function stripFrontMatter(src: string): string {
  if (!src.startsWith('---\n') && !src.startsWith('---\r\n')) return src
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(src)
  return match ? src.slice(match[0].length) : src
}

export type PlacedHeading = { id: string; depth: number; text: string; line: number }

export function renderDocument(src: string, width: number): Span[][] {
  return layoutDocument(src, width).lines
}

export function layoutDocument(src: string, width: number): { lines: Span[][]; headings: PlacedHeading[] } {
  const tokens = md.parse(stripFrontMatter(src), {})
  const limit = Math.max(20, width)
  const lines: Span[][] = []
  const headings: PlacedHeading[] = []
  const blank = () => {
    if (lines.length && lines[lines.length - 1].some((span) => span.text.trim())) lines.push([{ text: '' }])
  }
  const listStack: { ordered: boolean; index: number }[] = []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.type === 'heading_open') {
      const inline = tokens[i + 1]
      const depth = Number(token.tag.slice(1)) || 1
      blank()
      const content = paragraph(inline, limit)
      headings.push({ id: `h-${headings.length}`, depth, text: inline?.content || '', line: lines.length })
      lines.push(
        ...content.map((line) => line.map((span) => ({ ...span, bold: true, color: HEAD }))),
      )
      if (depth <= 2) lines.push([{ text: '' }])
      i += 2
      continue
    }
    if (token.type === 'paragraph_open') {
      const inline = tokens[i + 1]
      const depth = listStack.length
      if (depth === 0) {
        blank()
        lines.push(...paragraph(inline, limit))
      }
      i += 2
      continue
    }
    if (token.type === 'bullet_list_open') {
      listStack.push({ ordered: false, index: 1 })
      if (listStack.length === 1) blank()
      continue
    }
    if (token.type === 'ordered_list_open') {
      const start = Number(token.attrGet('start') || '1')
      listStack.push({ ordered: true, index: start })
      if (listStack.length === 1) blank()
      continue
    }
    if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') {
      listStack.pop()
      continue
    }
    if (token.type === 'list_item_open') {
      const list = listStack[listStack.length - 1]
      const inline = tokens.slice(i, i + 8).find((item) => item.type === 'inline')
      let spans = inline ? inlineSpans(inline) : [{ text: '', color: TEXT }]
      let marker = '• '
      if (list?.ordered) {
        marker = `${list.index}. `
        list.index += 1
      }
      const first = spans[0]?.text ?? ''
      const task = /^\[( |x|X)\]\s*/.exec(first)
      if (task) {
        marker = task[1] === ' ' ? '☐ ' : '☑ '
        spans = [{ ...spans[0], text: first.slice(task[0].length) }, ...spans.slice(1)]
      }
      const indent = '  '.repeat(Math.max(0, listStack.length - 1))
      const wrapped = wrapSpans(spans, Math.max(8, limit - indent.length - marker.length))
      lines.push(...prefixLines(wrapped, indent + marker, indent + ' '.repeat(marker.length)))
      continue
    }
    if (token.type === 'fence' || token.type === 'code_block') {
      const lang = (token.info || '').trim().split(/\s+/)[0]
      blank()
      if (lang === 'mermaid') {
        const diagram = renderMermaid(token.content, limit)
        for (const line of diagram) lines.push([{ text: line, color: '#d4d4d4' }])
      } else {
        lines.push(...codeBlock(token.content, lang, limit))
      }
      continue
    }
    if (token.type === 'blockquote_open') {
      const inner: Token[] = []
      let depth = 1
      i += 1
      for (; i < tokens.length; i++) {
        if (tokens[i].type === 'blockquote_open') depth++
        if (tokens[i].type === 'blockquote_close') {
          depth--
          if (depth === 0) break
        }
        inner.push(tokens[i])
      }
      const text = inner
        .filter((item) => item.type === 'inline')
        .flatMap((item) => inlineSpans(item))
      blank()
      lines.push(...prefixLines(wrapSpans(text, Math.max(8, limit - 2)), '│ ', '│ ', '#4a4a4a').map((line) =>
        line.map((span, index) => (index === 0 ? span : { ...span, color: QUOTE })),
      ))
      continue
    }
    if (token.type === 'hr') {
      blank()
      lines.push([{ text: '─'.repeat(Math.min(limit, 48)), color: '#3c3c3c' }])
      continue
    }
    if (token.type === 'table_open') {
      blank()
      const table = tableLines(tokens, i, limit)
      lines.push(...table.lines)
      i = table.next - 1
      continue
    }
    if (token.type === 'html_block') {
      blank()
      for (const line of token.content.trim().split('\n')) {
        lines.push([{ text: line, color: MUTED, dim: true }])
      }
    }
  }
  let dropped = 0
  while (lines.length && !lines[0].some((span) => span.text.trim())) {
    lines.shift()
    dropped += 1
  }
  if (dropped) for (const heading of headings) heading.line -= dropped
  while (lines.length && !lines[lines.length - 1].some((span) => span.text.trim())) lines.pop()
  return { lines: lines.length ? lines : [[{ text: '' }]], headings }
}

export function renderSource(src: string, width: number): Span[][] {
  const rows = src.replace(/\n$/, '').split('\n')
  const gutter = String(rows.length).length
  const lines: Span[][] = []
  rows.forEach((row, index) => {
    const n = String(index + 1).padStart(gutter)
    const room = Math.max(8, width - gutter - 2)
    const wrapped = wrapText(row || ' ', room)
    wrapped.forEach((part, partIndex) => {
      lines.push([
        { text: partIndex === 0 ? n : ' '.repeat(gutter), color: '#6e6e6e' },
        { text: ' ' },
        { text: part, color: '#d4d4d4' },
      ])
    })
  })
  return lines.length ? lines : [[{ text: '' }]]
}

export type Heading = { id: string; depth: number; text: string }

export function markdownOutline(src: string): Heading[] {
  const tokens = md.parse(stripFrontMatter(src), {})
  const out: Heading[] = []
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'heading_open') continue
    const inline = tokens[i + 1]
    out.push({
      id: `h-${out.length}`,
      depth: Number(tokens[i].tag.slice(1)) || 1,
      text: inline?.content || '',
    })
  }
  return out
}
