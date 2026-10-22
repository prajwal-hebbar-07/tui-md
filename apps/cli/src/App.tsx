import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  flattenFiles,
  fuzzyPaths,
  isMarkdown,
  isMermaidFile,
  layoutDocument,
  listTree,
  readHistory,
  readTextFile,
  rememberFile,
  renderMermaid,
  renderSource,
  sliceSpans,
  spanWidth,
  type PlacedHeading,
  type Span,
} from '@tui-md/core'
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import { useEffect, useMemo, useState } from 'react'

const SIDE = '#181818'
const EDITOR = '#1e1e1e'
const TEXT = '#cccccc'
const MUTED = '#858585'
const SELECT = '#094771'
const STATUS = '#007acc'
const MATCH = '#613214'
const CURRENT_MATCH = '#9e6a03'

type Hit = { line: number; col: number }
type Screen = 'read' | 'fuzzy' | 'history'

function openInEditor(command: string | undefined, file: string, line: number) {
  const cmd = command || process.env.VISUAL || process.env.EDITOR || 'nano'
  if (cmd.includes('{$path}') || cmd.includes('{$line}')) {
    const rendered = cmd.replaceAll('{$path}', file).replaceAll('{$line}', String(line))
    spawn(rendered, { shell: true, detached: true, stdio: 'ignore' }).unref()
    return
  }
  const parts = cmd.split(/\s+/).filter(Boolean)
  spawn(parts[0] || 'nano', [...parts.slice(1), file], { detached: true, stdio: 'ignore' }).unref()
}

function counted(lead: string, fallback: number): number {
  const n = lead ? Number(lead) : fallback
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function clamp(value: number, max: number): number {
  return Math.min(max, Math.max(0, value))
}

export function App({
  root: initialRoot,
  initialFile,
  initialScreen,
  fuzzyQuery = '',
  watch: watchStart = false,
  editor,
  stdinText,
}: {
  root: string
  initialFile?: string
  initialScreen: Screen
  fuzzyQuery?: string
  watch?: boolean
  editor?: string
  stdinText?: string
}) {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [size, setSize] = useState({ cols: stdout.columns || 100, rows: stdout.rows || 32 })
  const [root, setRoot] = useState(initialRoot)
  const [reload, setReload] = useState(0)
  const [treeTick, setTreeTick] = useState(0)
  const tree = useMemo(() => listTree(root), [root, treeTick])
  const files = useMemo(() => flattenFiles(tree.nodes).map((file) => file.path), [tree.nodes])
  const [opened, setOpened] = useState(initialFile || '')
  const [screen, setScreen] = useState<Screen>(initialScreen)
  const [watch, setWatch] = useState(watchStart)
  const [query, setQuery] = useState(fuzzyQuery)
  const [pickIndex, setPickIndex] = useState(0)
  const [history, setHistory] = useState(() => readHistory())
  const [find, setFind] = useState('')
  const [findInput, setFindInput] = useState(false)
  const [hit, setHit] = useState(0)
  const [source, setSource] = useState(false)
  const [help, setHelp] = useState(false)
  const [command, setCommand] = useState<string | null>(null)
  const [lead, setLead] = useState('')
  const [chord, setChord] = useState('')
  const [scroll, setScroll] = useState(0)
  const [pan, setPan] = useState(0)
  const [piped, setPiped] = useState<string | null>(stdinText ?? null)

  useEffect(() => {
    const onResize = () => setSize({ cols: stdout.columns || 100, rows: stdout.rows || 32 })
    stdout.on('resize', onResize)
    return () => {
      stdout.off('resize', onResize)
    }
  }, [stdout])

  useEffect(() => {
    if (!opened || piped != null) return
    const abs = path.resolve(root, opened)
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return
    rememberFile(abs)
    setHistory(readHistory())
  }, [root, opened, piped])

  useEffect(() => {
    if (!watch || !opened || piped != null) return
    const abs = path.resolve(root, opened)
    let timer: ReturnType<typeof setTimeout> | undefined
    let watcher: fs.FSWatcher
    try {
      watcher = fs.watch(abs, () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => setReload((value) => value + 1), 80)
      })
    } catch {
      return
    }
    return () => {
      if (timer) clearTimeout(timer)
      watcher.close()
    }
  }, [watch, opened, root, piped])

  const cols = size.cols
  const rows = size.rows
  const picking = screen === 'fuzzy' || screen === 'history'
  const editorW = Math.max(20, cols)
  const bodyH = Math.max(6, rows - 1)
  const previewH = Math.max(3, bodyH - 2)

  const usingPipe = piped != null && !opened
  const doc = useMemo(() => {
    if (usingPipe) return { ok: true as const, text: piped || '', truncated: false, binary: false, eol: 'LF' as const }
    if (!opened) return null
    return readTextFile(root, opened)
  }, [usingPipe, piped, opened, root, reload])

  const markdown = Boolean((usingPipe || opened) && (usingPipe || isMarkdown(opened)))
  const mermaidFile = Boolean(opened && isMermaidFile(opened))
  const laid = useMemo(() => {
    if (!doc || !doc.ok || doc.binary) return { lines: [] as Span[][], headings: [] as PlacedHeading[] }
    if (mermaidFile) return { lines: renderMermaid(doc.text, editorW - 2).map((line) => [{ text: line, color: '#d4d4d4' }]), headings: [] }
    if (markdown && !source) return layoutDocument(doc.text, editorW - 2)
    return { lines: renderSource(doc.text, editorW - 2), headings: [] }
  }, [doc, editorW, markdown, mermaidFile, source])

  const notice = doc && doc.ok && doc.truncated ? 2 : 0
  const lines = useMemo(() => {
    if (!doc) return [[{ text: 'No file open', color: MUTED, dim: true }]]
    if (!doc.ok) return [[{ text: doc.error, color: MUTED, dim: true }]]
    if (doc.binary) return [[{ text: 'Binary file', color: MUTED, dim: true }]]
    const banner = notice ? [[{ text: 'Showing the first 400 KB', color: MUTED, dim: true }], [{ text: '' }]] : []
    return [...banner, ...laid.lines]
  }, [doc, laid.lines, notice])
  const headings = useMemo(
    () => laid.headings.map((heading) => ({ ...heading, line: heading.line + notice })),
    [laid.headings, notice],
  )

  const [lastFile, setLastFile] = useState(opened)
  if (lastFile !== opened) {
    setLastFile(opened)
    setScroll(0)
    setPan(0)
  }

  const maxScroll = Math.max(0, lines.length - previewH)
  if (lastFile === opened && scroll > maxScroll) setScroll(maxScroll)
  const viewW = editorW
  const contentW = lines.reduce((widest, line) => Math.max(widest, spanWidth(line)), 0)
  const wide = contentW > viewW
  const activeHeading = headings.reduce((at, heading, index) => (heading.line <= scroll ? index : at), 0)

  const hits = useMemo(() => {
    if (!find) return []
    const caseSensitive = find !== find.toLowerCase()
    const needle = caseSensitive ? find : find.toLowerCase()
    const out: Hit[] = []
    lines.forEach((line, index) => {
      const raw = line.map((span) => span.text).join('')
      const text = caseSensitive ? raw : raw.toLowerCase()
      for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + needle.length)) {
        out.push({ line: index, col: at })
      }
    })
    return out
  }, [find, lines])
  const currentHit = hits.length ? Math.min(hit, hits.length - 1) : -1

  const reveal = (index: number) => {
    const target = hits[index]
    if (!target) return
    setHit(index)
    setScroll(clamp(target.line - Math.floor(previewH / 3), maxScroll))
    if (target.col < pan || target.col + find.length > pan + viewW) setPan(Math.max(0, target.col - 4))
  }

  useEffect(() => {
    if (!hits.length) return
    const next = hits.findIndex((target) => target.line >= scroll)
    reveal(next < 0 ? 0 : next)
  }, [hits])

  const pickRows = picking ? fuzzyPaths(screen === 'history' ? history : files, query) : []
  const shownPick = Math.min(pickIndex, Math.max(0, pickRows.length - 1))
  const listH = Math.max(1, bodyH - 2)
  const listStart = Math.min(Math.max(0, pickRows.length - listH), Math.max(0, shownPick - Math.floor(listH / 2)))
  const pickSlice = pickRows.slice(listStart, listStart + listH)

  const slice = lines.slice(scroll, scroll + previewH).map((line, offset) => {
    const marks = hits.flatMap((target, index) =>
      target.line === scroll + offset ? [{ col: target.col, current: index === currentHit }] : [],
    )
    return sliceSpans(highlight(line, marks, find.length), pan, viewW)
  })
  const fileName = usingPipe ? 'stdin' : opened ? opened.split('/').pop() || opened : 'Welcome'
  const crumb = usingPipe ? 'stdin' : opened ? opened.split('/').join('  ›  ') : tree.name

  const clearCount = () => {
    setLead('')
    setChord('')
  }

  const scrollBy = (delta: number) => {
    clearCount()
    setScroll((value) => clamp(value + delta, maxScroll))
  }

  const openRel = (rel: string) => {
    setPiped(null)
    setOpened(rel)
    setScreen('read')
    setQuery('')
    setPickIndex(0)
    setHelp(false)
    setFindInput(false)
    setCommand(null)
    clearCount()
  }

  const openAbs = (abs: string) => {
    const rel = path.relative(root, abs)
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      openRel(rel.split(path.sep).join('/'))
      return
    }
    setRoot(path.dirname(abs))
    openRel(path.basename(abs))
  }

  const showFuzzy = () => {
    setScreen('fuzzy')
    setQuery('')
    setPickIndex(0)
    setHelp(false)
    setFindInput(false)
    setCommand(null)
    clearCount()
  }

  const showHistory = () => {
    setHistory(readHistory())
    setScreen('history')
    setQuery('')
    setPickIndex(0)
    setHelp(false)
    setFindInput(false)
    setCommand(null)
    clearCount()
  }

  const jumpHeading = (index: number) => {
    const heading = headings[index]
    if (!heading) return
    clearCount()
    setScroll(clamp(heading.line, maxScroll))
  }

  const half = Math.max(1, Math.floor(previewH / 2))

  useInput((input, key) => {
    if (help) {
      if (input === '?' || key.escape || input === 'q') setHelp(false)
      return
    }
    if (command != null) {
      if (key.escape) setCommand(null)
      else if (key.return) {
        const cmd = command.trim()
        setCommand(null)
        if (cmd === 'q' || cmd === 'quit' || cmd === 'q!') exit()
        else if (/^\d+$/.test(cmd)) setScroll(clamp(Number(cmd) - 1, maxScroll))
      } else if (key.backspace || key.delete) setCommand((value) => (value ?? '').slice(0, -1))
      else if (input && !key.ctrl && !key.meta && input.length === 1) setCommand((value) => (value ?? '') + input)
      return
    }
    if (findInput) {
      if (key.escape) {
        setFind('')
        setFindInput(false)
      } else if (key.return) setFindInput(false)
      else if (key.backspace || key.delete) setFind((value) => value.slice(0, -1))
      else if (key.downArrow && hits.length) reveal((currentHit + 1) % hits.length)
      else if (key.upArrow && hits.length) reveal((currentHit - 1 + hits.length) % hits.length)
      else if (input && !key.ctrl && !key.meta) setFind((value) => value + input)
      return
    }
    if (picking) {
      const last = Math.max(0, pickRows.length - 1)
      const move = (delta: number) => setPickIndex((value) => clamp(value + delta, last))
      if (key.escape) {
        if (query) setQuery('')
        else if (opened || piped != null) setScreen('read')
        else exit()
        return
      }
      if (key.return && pickRows[shownPick]) {
        if (screen === 'history') openAbs(pickRows[shownPick])
        else openRel(pickRows[shownPick])
        return
      }
      const listHalf = Math.max(1, Math.floor(listH / 2))
      if (key.downArrow || (key.ctrl && (input === 'j' || input === 'n'))) move(1)
      else if (key.upArrow || (key.ctrl && (input === 'k' || input === 'p'))) move(-1)
      else if (key.ctrl && input === 'd') move(listHalf)
      else if (key.ctrl && input === 'u') move(-listHalf)
      else if (key.ctrl && input === 'f') move(listH)
      else if (key.ctrl && input === 'b') move(-listH)
      else if (key.pageDown) move(listH)
      else if (key.pageUp) move(-listH)
      else if (key.backspace || key.delete) setQuery((value) => value.slice(0, -1))
      else if (input && !key.ctrl && !key.meta && input.length === 1) {
        setQuery((value) => value + input)
        setPickIndex(0)
      }
      return
    }
    if (key.escape) {
      setFind('')
      setHelp(false)
      clearCount()
      return
    }
    if (input === 'q' && !key.ctrl) {
      exit()
      return
    }
    if (input === '?') {
      clearCount()
      setHelp(true)
      return
    }
    if (key.ctrl && input === 'p') {
      showFuzzy()
      return
    }
    if (input === 'H' || (key.ctrl && input === 'h')) {
      showHistory()
      return
    }
    if (input === ':') {
      clearCount()
      setCommand('')
      return
    }
    if (input === '/') {
      clearCount()
      setFind('')
      setFindInput(true)
      return
    }
    if (hits.length && !key.ctrl && (input === 'n' || input === 'N')) {
      const step = counted(lead, 1) % hits.length
      clearCount()
      const dir = input === 'n' ? step : (hits.length - step) % hits.length
      reveal((currentHit + dir) % hits.length)
      return
    }
    if (input === 's' && !key.ctrl && markdown) {
      clearCount()
      setSource((value) => !value)
      setScroll(0)
      return
    }
    if (input === 'w' && !key.ctrl && !usingPipe) {
      clearCount()
      setWatch((value) => !value)
      return
    }
    if (input === 'r' && !key.ctrl) {
      clearCount()
      setReload((value) => value + 1)
      setTreeTick((value) => value + 1)
      return
    }
    if (key.ctrl && input === 'e' && opened && !usingPipe) {
      openInEditor(editor, path.resolve(root, opened), scroll + 1)
      return
    }
    if (chord && input !== 'g') setChord('')
    if (input === 'g' && !key.ctrl) {
      if (chord === 'g') {
        const line = lead ? Number(lead) : 1
        clearCount()
        setScroll(clamp(line - 1, maxScroll))
      } else setChord('g')
      return
    }
    if (input === 'G') {
      const line = lead ? Number(lead) : maxScroll + 1
      clearCount()
      setScroll(clamp(line - 1, maxScroll))
      return
    }
    if (!key.ctrl && input.length === 1 && input >= '0' && input <= '9') {
      if (input === '0' && !lead) {
        setPan(0)
        return
      }
      setLead((value) => value + input)
      return
    }
    if (input === 'J' || input === 'K') {
      const step = counted(lead, 1)
      const dir = input === 'J' ? 1 : -1
      clearCount()
      jumpHeading(clamp(activeHeading + dir * step, Math.max(0, headings.length - 1)))
      return
    }
    if (key.ctrl && (input === 'd' || input === 'f')) {
      scrollBy((input === 'd' ? half : previewH) * counted(lead, 1))
      return
    }
    if (key.ctrl && (input === 'u' || input === 'b')) {
      scrollBy(-(input === 'u' ? half : previewH) * counted(lead, 1))
      return
    }
    if (!key.ctrl && (input === 'd' || key.pageDown)) {
      scrollBy(previewH * counted(lead, 1))
      return
    }
    if (!key.ctrl && (input === 'u' || key.pageUp)) {
      scrollBy(-previewH * counted(lead, 1))
      return
    }
    if (!key.ctrl && (key.downArrow || input === 'j')) {
      scrollBy(counted(lead, 1))
      return
    }
    if (!key.ctrl && (key.upArrow || input === 'k')) {
      scrollBy(-counted(lead, 1))
      return
    }
    if (!key.ctrl && (key.leftArrow || input === 'h')) {
      const step = counted(lead, 1)
      clearCount()
      setPan((value) => Math.max(0, value - step))
      return
    }
    if (!key.ctrl && (key.rightArrow || input === 'l')) {
      const step = counted(lead, 1)
      clearCount()
      setPan((value) => value + step)
      return
    }
    if (input === '$') {
      clearCount()
      setPan(Math.max(0, contentW - viewW))
      return
    }
    if (input === '^') {
      clearCount()
      setPan(0)
      return
    }
    if (input === '|' ) {
      const col = counted(lead, 1)
      clearCount()
      setPan(Math.max(0, col - 1))
      return
    }
    if (input === '}' || input === '{') {
      const step = counted(lead, 1)
      clearCount()
      let at = scroll
      const blank = (index: number) => !lines[index]?.some((span) => span.text.trim())
      for (let n = 0; n < step; n++) {
        if (input === '}') {
          while (at < lines.length - 1 && blank(at)) at++
          while (at < lines.length - 1 && !blank(at)) at++
        } else {
          if (at > 0) at--
          while (at > 0 && blank(at)) at--
          while (at > 0 && !blank(at)) at--
        }
      }
      setScroll(clamp(at, maxScroll))
    }
  })

  const mode = !markdown && !mermaidFile ? 'TEXT' : source ? 'SOURCE' : 'PREVIEW'
  const percent = lines.length <= previewH ? 100 : Math.round((scroll / Math.max(1, maxScroll)) * 100)
  const count = hits.length ? `${currentHit + 1}/${hits.length}` : find ? 'no match' : ''
  const status = command != null
    ? ` :${command}▏ `
    : findInput
      ? ` /${find}▏   ${count}   ↑↓ match   enter keep   esc cancel `
      : picking
        ? ` ${screen === 'history' ? 'Recent' : 'Files'}   ${pickRows.length ? `${shownPick + 1}/${pickRows.length}` : 'no matches'}   type to filter   enter open   esc ${opened || piped != null ? 'back' : 'quit'} `
        : ` ${tree.name}   ${mode}${watch ? '  watch' : ''}   ${usingPipe ? 'stdin' : opened || 'no file'}   ${percent}%${
            wide ? '   ↔' : ''
          }${find ? `   /${find} ${count}` : ''}   j k  gg G  ^d ^u  /  ^p  q `

  const helpLines = [
    ' tui-md',
    '',
    ' j k       scroll          5j  count',
    ' h l       pan             0 $  start / end',
    ' ctrl-d u  half page       ctrl-f b  full page',
    ' d u       full page',
    ' gg G      top / bottom    12G  line 12',
    ' { }       paragraph',
    ' J K       heading',
    ' / n N     find',
    ' ctrl-p    markdown files',
    ' H         recent files',
    ' :q        quit            :12  go to line',
    ' w         watch           r reload',
    ' ctrl-e    open in $EDITOR',
    ' s         preview / source',
    ' q         quit',
  ]
  const tabLabel = ` ${fileName} `
  const tabShown = tabLabel.length >= editorW ? tabLabel.slice(0, editorW) : tabLabel
  const modeLabel = markdown || mermaidFile ? (source ? 'Source' : 'Markdown Preview') : ''

  return (
    <Box width={cols} height={rows} flexDirection="column">
      {picking ? (
        <Box width={cols} height={bodyH} flexDirection="column">
          <Text backgroundColor={SIDE} color={MUTED} bold wrap="truncate">
            {pad(screen === 'history' ? ' RECENT' : ' OPEN FILE', cols)}
          </Text>
          <Text backgroundColor="#252526" color="#ffffff" wrap="truncate">
            {pad(` /${query}`, cols)}
          </Text>
          {pickSlice.map((item, index) => {
            const absolute = listStart + index
            const active = absolute === shownPick
            const bg = active ? SELECT : EDITOR
            return (
              <Text key={item} backgroundColor={bg} color={active ? '#ffffff' : TEXT} wrap="truncate">
                {pad(` ${item}`, cols)}
              </Text>
            )
          })}
          {pickRows.length === 0 ? (
            <Text backgroundColor={EDITOR} color={MUTED} wrap="truncate">
              {pad(' No matches', cols)}
            </Text>
          ) : null}
          <Fill count={listH - pickSlice.length - (pickRows.length === 0 ? 1 : 0)} width={cols} bg={EDITOR} />
        </Box>
      ) : (
        <Box width={editorW} height={bodyH} flexDirection="column">
          <Text wrap="truncate">
            <Text backgroundColor={EDITOR} color="#ffffff">
              {tabShown}
            </Text>
            <Text backgroundColor={SIDE} color={MUTED}>
              {padRight(modeLabel, editorW - tabShown.length)}
            </Text>
          </Text>
          <Text backgroundColor={EDITOR} color={MUTED} wrap="truncate">
            {pad(` ${crumb}`, editorW)}
          </Text>
          {help
            ? helpLines.slice(0, previewH).map((line, index) => (
                <Text key={index} backgroundColor={EDITOR} color={TEXT} wrap="truncate">
                  {pad(line, editorW)}
                </Text>
              ))
            : slice.map((line, index) => <Spans key={index} spans={line} width={editorW} />)}
          <Fill count={previewH - (help ? Math.min(helpLines.length, previewH) : slice.length)} width={editorW} bg={EDITOR} />
        </Box>
      )}
      <Text backgroundColor={STATUS} color="#ffffff" wrap="truncate">
        {status.slice(0, cols).padEnd(cols)}
      </Text>
    </Box>
  )
}

function Spans({ spans, width }: { spans: Span[]; width: number }) {
  const used = spanWidth(spans)
  const padded = (used >= width ? spans : [...spans, { text: ' '.repeat(Math.max(0, width - used)), bg: EDITOR }]).filter(
    (span) => span.text.length > 0,
  )
  return (
    <Text wrap="truncate">
      {padded.map((span, index) => (
        <Text
          key={index}
          color={span.color}
          backgroundColor={span.bg || EDITOR}
          bold={span.bold}
          dimColor={span.dim}
          italic={span.italic}
          wrap="truncate"
        >
          {span.text}
        </Text>
      ))}
    </Text>
  )
}

function highlight(spans: Span[], marks: { col: number; current: boolean }[], length: number): Span[] {
  if (!marks.length || !length) return spans
  const out: Span[] = []
  let start = 0
  for (const span of spans) {
    const end = start + span.text.length
    const cuts = new Set([0, span.text.length])
    for (const mark of marks) {
      for (const at of [mark.col, mark.col + length]) if (at > start && at < end) cuts.add(at - start)
    }
    const points = [...cuts].sort((a, b) => a - b)
    for (let i = 0; i < points.length - 1; i++) {
      const at = start + points[i]
      const mark = marks.find((candidate) => at >= candidate.col && at < candidate.col + length)
      const text = span.text.slice(points[i], points[i + 1])
      out.push(mark ? { ...span, text, color: '#ffffff', bg: mark.current ? CURRENT_MATCH : MATCH } : { ...span, text })
    }
    start = end
  }
  return out
}

function Fill({ count, width, bg }: { count: number; width: number; bg: string }) {
  if (count <= 0 || width <= 0) return null
  const blank = ' '.repeat(width)
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <Text key={index} backgroundColor={bg}>
          {blank}
        </Text>
      ))}
    </>
  )
}

function pad(text: string, width: number): string {
  if (width <= 0) return ''
  if (text.length >= width) return text.slice(0, Math.max(0, width - 1)) + (width > 1 ? '…' : '')
  return text.padEnd(width)
}

function padRight(text: string, width: number): string {
  if (width <= 0) return ''
  if (text.length >= width) return text.slice(0, width)
  return text.padStart(width)
}
