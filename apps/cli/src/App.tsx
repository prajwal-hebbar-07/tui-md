import {
  ancestorDirs,
  bubbleGit,
  defaultExpanded,
  firstMarkdown,
  flattenFiles,
  gitChanges,
  isMarkdown,
  isMermaidFile,
  listTree,
  readTextFile,
  renderDocument,
  renderMermaid,
  renderSource,
  sliceSpans,
  spanWidth,
  visibleTree,
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
const DIM_SELECT = '#37373d'
const STATUS = '#007acc'
const MATCH = '#613214'
const CURRENT_MATCH = '#9e6a03'

type Hit = { line: number; col: number }

function badgeColor(badge: string): string {
  if (badge === 'D') return '#f14c4c'
  if (badge === 'M') return '#e2c08d'
  return '#73c991'
}

function rowLabel(node: TreeNode, depth: number, open: boolean): string {
  const chevron = node.kind === 'dir' ? (open ? '▾' : '▸') : ' '
  return `${'  '.repeat(depth)}${chevron} ${node.name}`
}

export function App({ root, initialFile }: { root: string; initialFile?: string }) {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [size, setSize] = useState({ cols: stdout.columns || 100, rows: stdout.rows || 32 })
  const tree = useMemo(() => listTree(root), [root])
  const git = useMemo(() => bubbleGit(tree.nodes, gitChanges(root)), [root, tree.nodes])
  const [expanded, setExpanded] = useState(() => {
    const next = new Set(defaultExpanded(tree.nodes))
    if (initialFile) for (const dir of ancestorDirs(initialFile)) next.add(dir)
    return next
  })
  const [rootOpen, setRootOpen] = useState(true)
  const [selected, setSelected] = useState(initialFile || firstMarkdown(tree.nodes) || '')
  const [focus, setFocus] = useState<'tree' | 'preview'>('tree')
  const [activity, setActivity] = useState<'files' | 'search'>('files')
  const [query, setQuery] = useState('')
  const [find, setFind] = useState('')
  const [findInput, setFindInput] = useState(false)
  const [hit, setHit] = useState(0)
  const [source, setSource] = useState(false)
  const [help, setHelp] = useState(false)
  const [scroll, setScroll] = useState(0)
  const [pan, setPan] = useState(0)
  const [treeScroll, setTreeScroll] = useState(0)

  useEffect(() => {
    const onResize = () => setSize({ cols: stdout.columns || 100, rows: stdout.rows || 32 })
    stdout.on('resize', onResize)
    return () => {
      stdout.off('resize', onResize)
    }
  }, [stdout])

  const cols = size.cols
  const rows = size.rows
  const activityW = cols < 64 ? 0 : 3
  const sidebarW = Math.max(22, Math.min(36, Math.floor(cols * 0.28)))
  const editorW = Math.max(20, cols - activityW - sidebarW - 1)
  const bodyH = Math.max(6, rows - 1)
  const previewH = Math.max(3, bodyH - 2)
  const filtering = activity === 'search'
  const treeHeader = filtering ? 3 : 2
  const treeH = Math.max(1, bodyH - treeHeader)

  const visible = useMemo(() => (rootOpen ? visibleTree(tree.nodes, expanded) : []), [rootOpen, tree.nodes, expanded])
  const matches = useMemo(() => {
    const files = flattenFiles(tree.nodes)
    const needle = query.trim().toLowerCase()
    if (!needle) return files
    return files.filter((file) => file.path.toLowerCase().includes(needle))
  }, [query, tree.nodes])
  const treeRows = filtering
    ? matches.map((file) => ({ node: { name: file.path, path: file.path, kind: 'file' as const }, depth: 0 }))
    : visible
  const found = treeRows.findIndex((row) => row.node.path === selected)
  const selectedIndex = found < 0 ? 0 : found

  useEffect(() => {
    if (selectedIndex < treeScroll) setTreeScroll(selectedIndex)
    else if (selectedIndex >= treeScroll + treeH) setTreeScroll(selectedIndex - treeH + 1)
  }, [selectedIndex, treeH, treeScroll])

  const doc = useMemo(() => (selected ? readTextFile(root, selected) : null), [root, selected])
  const markdown = Boolean(selected && isMarkdown(selected))
  const mermaidFile = Boolean(selected && isMermaidFile(selected))
  const lines = useMemo(() => {
    if (!doc || !doc.ok) return [[{ text: doc && !doc.ok ? doc.error : 'Open a markdown file', color: MUTED, dim: true }]]
    if (doc.binary) return [[{ text: 'Binary file', color: MUTED, dim: true }]]
    const notice = doc.truncated ? [[{ text: 'Showing the first 400 KB', color: MUTED, dim: true }], [{ text: '' }]] : []
    if (mermaidFile) {
      return [...notice, ...renderMermaid(doc.text, editorW - 2).map((line) => [{ text: line, color: '#d4d4d4' }])]
    }
    if (markdown && !source) return [...notice, ...renderDocument(doc.text, editorW - 2)]
    return [...notice, ...renderSource(doc.text, editorW - 2)]
  }, [doc, editorW, markdown, mermaidFile, source])

  const [lastFile, setLastFile] = useState(selected)
  if (lastFile !== selected) {
    setLastFile(selected)
    setScroll(0)
    setPan(0)
  }

  const maxScroll = Math.max(0, lines.length - previewH)
  const viewW = editorW
  const wide = lines.some((line) => spanWidth(line) > viewW)

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

  const slice = lines.slice(scroll, scroll + previewH).map((line, offset) => {
    const marks = hits.flatMap((target, index) =>
      target.line === scroll + offset ? [{ col: target.col, current: index === currentHit }] : [],
    )
    return sliceSpans(highlight(line, marks, find.length), pan, viewW)
  })
  const fileName = selected ? selected.split('/').pop() || selected : 'Welcome'
  const crumb = selected ? selected.split('/').join('  ›  ') : tree.name

  const moveTree = (delta: number) => {
    if (!treeRows.length) return
    const next = Math.min(treeRows.length - 1, Math.max(0, selectedIndex + delta))
    setSelected(treeRows[next].node.path)
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

  useInput((input, key) => {
    if (help) {
      if (input === '?' || key.escape || input === 'q') setHelp(false)
      return
    }
    if (findInput) {
      if (key.escape) {
        setFind('')
        setFindInput(false)
      } else if (key.return) {
        setFindInput(false)
        setFocus('preview')
      } else if (key.backspace || key.delete) setFind((value) => value.slice(0, -1))
      else if (key.downArrow && hits.length) reveal((currentHit + 1) % hits.length)
      else if (key.upArrow && hits.length) reveal((currentHit - 1 + hits.length) % hits.length)
      else if (input && !key.ctrl && !key.meta) setFind((value) => value + input)
      return
    }
    if (key.escape) {
      setActivity('files')
      setQuery('')
      setFind('')
      setHelp(false)
      setFocus('tree')
      return
    }
    if (filtering && !key.upArrow && !key.downArrow && !key.return && !key.tab && !key.escape) {
      if (key.backspace || key.delete) {
        setQuery((value) => value.slice(0, -1))
        return
      }
      if (input && !key.ctrl && !key.meta && input.length === 1) {
        setQuery((value) => value + input)
        return
      }
    }
    if (input === 'q') {
      exit()
      return
    }
    if (input === '?') {
      setHelp(true)
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
    if (input === '2' || (key.ctrl && input === 'p')) {
      setActivity('search')
      setFocus('tree')
      return
    }
    if (input === '1') {
      setActivity('files')
      setQuery('')
      return
    }
    if (key.tab) {
      setFocus((value) => (value === 'tree' ? 'preview' : 'tree'))
      return
    }
    if (input === 's' && markdown) {
      setSource((value) => !value)
      setScroll(0)
      return
    }
    if (focus === 'preview') {
      if (key.upArrow || input === 'k') setScroll((value) => Math.max(0, value - 1))
      else if (key.downArrow || input === 'j') setScroll((value) => Math.min(maxScroll, value + 1))
      else if (key.pageUp) setScroll((value) => Math.max(0, value - previewH))
      else if (key.pageDown) setScroll((value) => Math.min(maxScroll, value + previewH))
      else if (input === 'g') setScroll(0)
      else if (input === 'G') setScroll(maxScroll)
      else if (key.leftArrow || input === 'h') setPan((value) => Math.max(0, value - 4))
      else if (key.rightArrow || input === 'l') setPan((value) => value + 4)
      return
    }
    if (key.upArrow || input === 'k') moveTree(-1)
    else if (key.downArrow || input === 'j') moveTree(1)
    else if (input === 'g') moveTree(-treeRows.length)
    else if (input === 'G') moveTree(treeRows.length)
    else if (key.pageUp) moveTree(-treeH)
    else if (key.pageDown) moveTree(treeH)
    else if (key.leftArrow || input === 'h') {
      const row = treeRows[selectedIndex]
      if (!row) return
      if (row.node.kind === 'dir' && expanded.has(row.node.path)) toggleDir(row.node)
      else if (row.depth > 0) {
        const parent = row.node.path.split('/').slice(0, -1).join('/')
        if (parent) setSelected(parent)
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
      } else if (key.return) setFocus('preview')
    }
  })

  const mode = !markdown && !mermaidFile ? 'TEXT' : source ? 'SOURCE' : 'PREVIEW'
  const percent = lines.length <= previewH ? 100 : Math.round((scroll / maxScroll) * 100)
  const count = hits.length ? `${currentHit + 1}/${hits.length}` : find ? 'no match' : ''
  const status = findInput
    ? ` Find: ${find}▏   ${count}   ↑↓ match   enter keep   esc cancel `
    : ` ${tree.name}   ${mode}   ${selected || 'no file'}   ${percent}%${wide ? '   ↔ pan' : ''}${
        find ? `   "${find}" ${count}   n N match` : ''
      }   / find   ^p files   s source   q quit `
  const selectionBg = focus === 'tree' ? SELECT : DIM_SELECT

  const treeRoom = Math.max(0, treeH - (tree.truncated ? 1 : 0))
  const treeSlice = treeRows.slice(treeScroll, treeScroll + treeRoom)
  const sideUsed = (filtering ? 3 : 2) + treeSlice.length + (tree.truncated ? 1 : 0)
  const helpLines = [
    ' tui-md',
    '',
    ' ↑↓ j k    move or scroll',
    ' ← → h l   collapse, expand, or pan',
    ' tab       tree / preview',
    ' enter     open the preview',
    ' s         preview / source',
    ' / ctrl+f  find in the file',
    ' n N       next / previous match',
    ' ctrl+p    filter files',
    ' g G       top / bottom',
    ' q         quit',
  ]
  const tabLabel = ` ${fileName} `
  const tabShown = tabLabel.length >= editorW ? tabLabel.slice(0, editorW) : tabLabel
  const modeLabel = markdown || mermaidFile ? (source ? 'Source' : 'Markdown Preview') : ''

  return (
    <Box width={cols} height={rows} flexDirection="column">
      <Box height={bodyH} flexDirection="row">
        {activityW > 0 ? (
          <Box width={activityW} height={bodyH} flexDirection="column">
            <Text backgroundColor={SIDE} color={activity === 'files' ? '#ffffff' : MUTED}>
              {pad(activity === 'files' ? '┃☰' : ' ☰', activityW)}
            </Text>
            <Text backgroundColor={SIDE} color={activity === 'search' ? '#ffffff' : MUTED}>
              {pad(activity === 'search' ? '┃⌕' : ' ⌕', activityW)}
            </Text>
            <Fill count={bodyH - 2} width={activityW} bg={SIDE} />
          </Box>
        ) : null}
        <Box width={sidebarW} height={bodyH} flexDirection="column">
          <Text backgroundColor={SIDE} color={MUTED} bold wrap="truncate">
            {pad(' EXPLORER', sidebarW)}
          </Text>
          <Text backgroundColor={SIDE} color={TEXT} wrap="truncate">
            {pad(`${rootOpen ? '▾' : '▸'} ${tree.name}`, sidebarW)}
          </Text>
          {filtering ? (
            <Text backgroundColor="#252526" color="#ffffff">
              {pad(` /${query}`, sidebarW)}
            </Text>
          ) : null}
          {treeSlice.map((row) => {
            const active = row.node.path === selected
            const open = row.node.kind === 'dir' && expanded.has(row.node.path)
            const label = rowLabel(row.node, row.depth + 1, open)
            const badge = git[row.node.path]
            const room = sidebarW - (badge ? 1 : 0)
            const shown = label.length > room ? `${label.slice(0, Math.max(1, room - 1))}…` : label.padEnd(room)
            const bg = active ? selectionBg : SIDE
            return (
              <Text key={row.node.path} backgroundColor={bg} wrap="truncate">
                <Text backgroundColor={bg} color={active ? '#ffffff' : TEXT}>
                  {shown}
                </Text>
                {badge ? (
                  <Text backgroundColor={bg} color={active ? '#ffffff' : badgeColor(badge)}>
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
          <Fill count={bodyH - sideUsed} width={sidebarW} bg={SIDE} />
        </Box>
        <Box width={1} flexDirection="column">
          <Fill count={bodyH} width={1} bg="#2b2b2b" />
        </Box>
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
  if (text.length >= width) return text.slice(0, Math.max(0, width - 1)) + '…'
  return text.padEnd(width)
}

function padRight(text: string, width: number): string {
  if (width <= 0) return ''
  if (text.length >= width) return text.slice(0, width)
  return text.padStart(width)
}
