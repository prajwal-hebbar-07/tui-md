import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  ancestorDirs,
  bubbleGit,
  defaultExpanded,
  flattenFiles,
  fuzzyPaths,
  gitChanges,
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
  visibleTree,
  type PlacedHeading,
  type Span,
  type TreeNode,
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
type Screen = 'read' | 'fuzzy' | 'browser' | 'history'

function badgeColor(badge: string): string {
  if (badge === 'D') return '#f14c4c'
  if (badge === 'M') return '#e2c08d'
  return '#73c991'
}

function rowLabel(node: TreeNode, depth: number, open: boolean): string {
  const chevron = node.kind === 'dir' ? (open ? '▾' : '▸') : ' '
  return `${'  '.repeat(depth)}${chevron} ${node.name}`
}

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
  const git = useMemo(() => bubbleGit(tree.nodes, gitChanges(root)), [root, tree.nodes])
  const files = useMemo(() => flattenFiles(tree.nodes).map((file) => file.path), [tree.nodes])
  const [expanded, setExpanded] = useState(() => new Set(defaultExpanded(listTree(initialRoot).nodes)))
  const [rootOpen, setRootOpen] = useState(true)
  const [opened, setOpened] = useState(initialFile || '')
  const [cursor, setCursor] = useState(initialFile || '')
  const [screen, setScreen] = useState<Screen>(initialScreen)
  const [toc, setToc] = useState(true)
  const [watch, setWatch] = useState(watchStart)
  const [query, setQuery] = useState(fuzzyQuery)
  const [pickIndex, setPickIndex] = useState(0)
  const [history, setHistory] = useState(() => readHistory())
  const [find, setFind] = useState('')
  const [findInput, setFindInput] = useState(false)
  const [hit, setHit] = useState(0)
  const [source, setSource] = useState(false)
  const [help, setHelp] = useState(false)
  const [scroll, setScroll] = useState(0)
  const [pan, setPan] = useState(0)
  const [treeScroll, setTreeScroll] = useState(0)
  const [piped, setPiped] = useState<string | null>(stdinText ?? null)

  useEffect(() => {
    const onResize = () => setSize({ cols: stdout.columns || 100, rows: stdout.rows || 32 })
    stdout.on('resize', onResize)
    return () => {
      stdout.off('resize', onResize)
    }
  }, [stdout])

  useEffect(() => {
    setExpanded(new Set(defaultExpanded(tree.nodes)))
  }, [root])

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
  const reading = screen === 'read'
  const browsing = screen === 'browser'
  const picking = screen === 'fuzzy' || screen === 'history'
  const sidebarW = browsing || (reading && toc && !help) ? Math.max(22, Math.min(36, Math.floor(cols * 0.28))) : 0
  const editorW = Math.max(20, cols - sidebarW - (sidebarW ? 1 : 0))
  const bodyH = Math.max(6, rows - 1)
  const previewH = Math.max(3, bodyH - 2)

  const visible = useMemo(() => (rootOpen ? visibleTree(tree.nodes, expanded) : []), [rootOpen, tree.nodes, expanded])
  const treeRows = visible
  const found = treeRows.findIndex((row) => row.node.path === cursor)
  const selectedIndex = found < 0 ? 0 : found
  const treeHeader = 2
  const treeH = Math.max(1, bodyH - treeHeader)

  useEffect(() => {
    if (!browsing) return
    if (selectedIndex < treeScroll) setTreeScroll(selectedIndex)
    else if (selectedIndex >= treeScroll + treeH) setTreeScroll(selectedIndex - treeH + 1)
  }, [browsing, selectedIndex, treeH, treeScroll])

  const previewPath = browsing ? (treeRows[selectedIndex]?.node.kind === 'file' ? treeRows[selectedIndex].node.path : '') : opened
  const usingPipe = piped != null && !opened
  const doc = useMemo(() => {
    if (usingPipe) return { ok: true as const, text: piped || '', truncated: false, binary: false, eol: 'LF' as const }
    if (!previewPath) return null
    return readTextFile(root, previewPath)
  }, [usingPipe, piped, previewPath, root, reload])

  const markdown = Boolean((usingPipe || previewPath) && (usingPipe || isMarkdown(previewPath)))
  const mermaidFile = Boolean(previewPath && isMermaidFile(previewPath))
  const laid = useMemo(() => {
    if (!doc || !doc.ok || doc.binary) return { lines: [] as Span[][], headings: [] as PlacedHeading[] }
    if (mermaidFile) return { lines: renderMermaid(doc.text, editorW - 2).map((line) => [{ text: line, color: '#d4d4d4' }]), headings: [] }
    if (markdown && !source) return layoutDocument(doc.text, editorW - 2)
    return { lines: renderSource(doc.text, editorW - 2), headings: [] }
  }, [doc, editorW, markdown, mermaidFile, source])

  const notice = doc && doc.ok && doc.truncated ? 2 : 0
  const lines = useMemo(() => {
    if (!doc) return [[{ text: browsing ? 'Open a markdown file' : 'No file open', color: MUTED, dim: true }]]
    if (!doc.ok) return [[{ text: doc.error, color: MUTED, dim: true }]]
    if (doc.binary) return [[{ text: 'Binary file', color: MUTED, dim: true }]]
    const banner = notice ? [[{ text: 'Showing the first 400 KB', color: MUTED, dim: true }], [{ text: '' }]] : []
    return [...banner, ...laid.lines]
  }, [browsing, doc, laid.lines, notice])
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
  const wide = lines.some((line) => spanWidth(line) > viewW)
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
    setScroll(Math.min(maxScroll, Math.max(0, target.line - Math.floor(previewH / 3))))
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
  const fileName = usingPipe ? 'stdin' : previewPath ? previewPath.split('/').pop() || previewPath : 'Welcome'
  const crumb = usingPipe ? 'stdin' : previewPath ? previewPath.split('/').join('  ›  ') : tree.name

  const moveTree = (delta: number) => {
    if (!treeRows.length) return
    const next = Math.min(treeRows.length - 1, Math.max(0, selectedIndex + delta))
    setCursor(treeRows[next].node.path)
  }

  const toggleDir = (node: TreeNode) => {
    if (node.kind !== 'dir') return
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(node.path)) next.delete(node.path)
      else next.add(node.path)
      return next
    })
  }

  const openRel = (rel: string) => {
    setPiped(null)
    setOpened(rel)
    setCursor(rel)
    setScreen('read')
    setQuery('')
    setPickIndex(0)
    setHelp(false)
    setFindInput(false)
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

  const showBrowser = () => {
    setCursor(opened)
    setExpanded((current) => {
      const next = new Set(current.size ? current : defaultExpanded(tree.nodes))
      if (opened) for (const dir of ancestorDirs(opened)) next.add(dir)
      return next
    })
    setHelp(false)
    setFindInput(false)
    setScreen('browser')
  }

  const showFuzzy = () => {
    setScreen('fuzzy')
    setQuery('')
    setPickIndex(0)
    setHelp(false)
    setFindInput(false)
  }

  const showHistory = () => {
    setHistory(readHistory())
    setScreen('history')
    setQuery('')
    setPickIndex(0)
    setHelp(false)
    setFindInput(false)
  }

  const jumpHeading = (index: number) => {
    const heading = headings[index]
    if (!heading) return
    setScroll(Math.min(maxScroll, Math.max(0, heading.line)))
  }

  useInput((input, key) => {
    if (help) {
      if (input === '?' || key.escape || input === 'q') setHelp(false)
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
      if (key.downArrow || (input === 'j' && key.ctrl)) setPickIndex((value) => Math.min(pickRows.length - 1, value + 1))
      else if (key.upArrow || (input === 'k' && key.ctrl)) setPickIndex((value) => Math.max(0, value - 1))
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
      if (browsing && (opened || piped != null)) setScreen('read')
      return
    }
    if (input === 'q') {
      exit()
      return
    }
    if (input === '?' ) {
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
    if (input === 'P') {
      showBrowser()
      return
    }
    if (browsing) {
      if (key.upArrow || input === 'k') moveTree(-1)
      else if (key.downArrow || input === 'j') moveTree(1)
      else if (input === 'g') moveTree(-treeRows.length)
      else if (input === 'G') moveTree(treeRows.length)
      else if (key.pageUp || input === 'u') moveTree(-treeH)
      else if (key.pageDown || input === 'd') moveTree(treeH)
      else if (key.leftArrow || input === 'h') {
        const row = treeRows[selectedIndex]
        if (!row) return
        if (row.node.kind === 'dir' && expanded.has(row.node.path)) toggleDir(row.node)
        else if (row.depth > 0) {
          const parent = row.node.path.split('/').slice(0, -1).join('/')
          if (parent) setCursor(parent)
          else setRootOpen(false)
        } else setRootOpen(false)
      } else if (key.rightArrow || input === 'l' || key.return) {
        const row = treeRows[selectedIndex]
        if (!row) {
          setRootOpen(true)
          return
        }
        if (row.node.kind === 'dir') {
          if (!expanded.has(row.node.path)) toggleDir(row.node)
          else if (key.rightArrow || input === 'l') moveTree(1)
        } else if (key.return) openRel(row.node.path)
      }
      return
    }
    if (input === '/' || (key.ctrl && input === 'f')) {
      setFind('')
      setFindInput(true)
      return
    }
    if (hits.length && (input === 'n' || input === 'N')) {
      reveal(input === 'n' ? (currentHit + 1) % hits.length : (currentHit - 1 + hits.length) % hits.length)
      return
    }
    if (input === 't') {
      setToc((value) => !value)
      return
    }
    if (input === 's' && markdown) {
      setSource((value) => !value)
      setScroll(0)
      return
    }
    if (input === 'w' && !usingPipe) {
      setWatch((value) => !value)
      return
    }
    if (input === 'r') {
      setReload((value) => value + 1)
      setTreeTick((value) => value + 1)
      return
    }
    if (key.ctrl && input === 'e' && opened && !usingPipe) {
      openInEditor(editor, path.resolve(root, opened), scroll + 1)
      return
    }
    if (input >= '1' && input <= '9') {
      jumpHeading(Number(input) - 1)
      return
    }
    if (input === 'J') jumpHeading(Math.min(headings.length - 1, activeHeading + 1))
    else if (input === 'K') jumpHeading(Math.max(0, activeHeading - 1))
    else if (key.upArrow || input === 'k') setScroll((value) => Math.max(0, value - 1))
    else if (key.downArrow || input === 'j') setScroll((value) => Math.min(maxScroll, value + 1))
    else if (key.pageUp || input === 'u') setScroll((value) => Math.max(0, value - previewH))
    else if (key.pageDown || input === 'd') setScroll((value) => Math.min(maxScroll, value + previewH))
    else if (input === 'g') setScroll(0)
    else if (input === 'G') setScroll(maxScroll)
    else if (key.leftArrow || input === 'h') setPan((value) => Math.max(0, value - 4))
    else if (key.rightArrow || input === 'l') setPan((value) => value + 4)
  })

  const mode = !markdown && !mermaidFile ? 'TEXT' : source ? 'SOURCE' : 'PREVIEW'
  const percent = lines.length <= previewH ? 100 : Math.round((scroll / Math.max(1, maxScroll)) * 100)
  const count = hits.length ? `${currentHit + 1}/${hits.length}` : find ? 'no match' : ''
  const status = findInput
    ? ` Find: ${find}▏   ${count}   ↑↓ match   enter keep   esc cancel `
    : picking
      ? ` ${screen === 'history' ? 'Recent' : 'Files'}   ${pickRows.length ? `${shownPick + 1}/${pickRows.length}` : 'no matches'}   type to filter   enter open   esc back `
      : browsing
        ? ` ${tree.name}   browse   enter open   esc back   ^p files   H recent   q quit `
        : ` ${tree.name}   ${mode}${watch ? '  watch' : ''}   ${usingPipe ? 'stdin' : opened || 'no file'}   ${percent}%${
            wide ? '   ↔ pan' : ''
          }${find ? `   "${find}" ${count}   n N` : ''}   t outline   ^p files   P browse   H recent   / find   q quit `

  const tocRoom = Math.max(0, bodyH - 1)
  const tocStart = Math.min(Math.max(0, headings.length - tocRoom), Math.max(0, activeHeading - Math.floor(tocRoom / 2)))
  const tocSlice = headings.slice(tocStart, tocStart + tocRoom)
  const treeRoom = Math.max(0, treeH - (tree.truncated ? 1 : 0))
  const treeSlice = treeRows.slice(treeScroll, treeScroll + treeRoom)
  const helpLines = [
    ' tui-md',
    '',
    ' j k       scroll',
    ' d u       page',
    ' g G       top / bottom',
    ' t         outline',
    ' J K       next / previous heading',
    ' 1-9       jump to a heading',
    ' /         find    n N  match',
    ' ctrl+p    file picker',
    ' P         folder browser',
    ' H         recent files',
    ' w         watch for saves',
    ' ctrl+e    open in $EDITOR',
    ' s         preview / source',
    ' q         quit',
  ]
  const tabLabel = ` ${fileName} `
  const tabShown = tabLabel.length >= editorW ? tabLabel.slice(0, editorW) : tabLabel
  const modeLabel = markdown || mermaidFile ? (source ? 'Source' : 'Markdown Preview') : ''

  return (
    <Box width={cols} height={rows} flexDirection="column">
      <Box height={bodyH} flexDirection="row">
        {browsing ? (
          <Box width={sidebarW} height={bodyH} flexDirection="column">
            <Text backgroundColor={SIDE} color={MUTED} bold wrap="truncate">
              {pad(' EXPLORER', sidebarW)}
            </Text>
            <Text backgroundColor={SIDE} color={TEXT} wrap="truncate">
              {pad(`${rootOpen ? '▾' : '▸'} ${tree.name}`, sidebarW)}
            </Text>
            {treeSlice.map((row) => {
              const active = row.node.path === (treeRows[selectedIndex]?.node.path || '')
              const open = row.node.kind === 'dir' && expanded.has(row.node.path)
              const label = rowLabel(row.node, row.depth + 1, open)
              const badge = git[row.node.path]
              const room = sidebarW - (badge ? 1 : 0)
              const shown = label.length > room ? `${label.slice(0, Math.max(1, room - 1))}…` : label.padEnd(room)
              return (
                <Text key={row.node.path} backgroundColor={active ? SELECT : SIDE} wrap="truncate">
                  <Text backgroundColor={active ? SELECT : SIDE} color={active ? '#ffffff' : TEXT}>
                    {shown}
                  </Text>
                  {badge ? (
                    <Text backgroundColor={active ? SELECT : SIDE} color={active ? '#ffffff' : badgeColor(badge)}>
                      {badge}
                    </Text>
                  ) : null}
                </Text>
              )
            })}
            {tree.truncated ? (
              <Text backgroundColor={SIDE} color={MUTED} wrap="truncate">
                {pad(' …more files', sidebarW)}
              </Text>
            ) : null}
            <Fill count={bodyH - treeHeader - treeSlice.length - (tree.truncated ? 1 : 0)} width={sidebarW} bg={SIDE} />
          </Box>
        ) : null}
        {reading && toc && !help ? (
          <Box width={sidebarW} height={bodyH} flexDirection="column">
            <Text backgroundColor={SIDE} color={MUTED} bold wrap="truncate">
              {pad(' OUTLINE', sidebarW)}
            </Text>
            {tocSlice.map((heading, index) => {
              const active = tocStart + index === activeHeading
              const label = `${'  '.repeat(Math.max(0, heading.depth - 1))}${heading.text || 'Untitled'}`
              return (
                <Text key={heading.id} backgroundColor={active ? SELECT : SIDE} color={active ? '#ffffff' : TEXT} wrap="truncate">
                  {pad(label, sidebarW)}
                </Text>
              )
            })}
            {headings.length === 0 ? (
              <Text backgroundColor={SIDE} color={MUTED} wrap="truncate">
                {pad(' No headings', sidebarW)}
              </Text>
            ) : null}
            <Fill count={bodyH - 1 - tocSlice.length - (headings.length === 0 ? 1 : 0)} width={sidebarW} bg={SIDE} />
          </Box>
        ) : null}
        {sidebarW > 0 ? (
          <Box width={1} flexDirection="column">
            <Fill count={bodyH} width={1} bg="#2b2b2b" />
          </Box>
        ) : null}
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
      </Box>
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
