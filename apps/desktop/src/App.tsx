import {
  ancestorDirs,
  defaultExpanded,
  firstMarkdown,
  flattenFiles,
  isMarkdown,
  isMermaidFile,
  markdownOutline,
  type ReadResult,
  type TreeResult,
} from '@tui-md/core'
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouse } from 'react'
import { api } from './api'
import { Chevron, FileIcon, FolderIcon } from './icons'
import { Preview } from './Preview'
import { Tree } from './Tree'

type Kind = 'markdown' | 'mermaid' | 'text' | 'binary'
type Palette = 'files' | 'history' | null
type HistItem = { root: string; path: string }
type Menu = { x: number; y: number; path: string; kind: 'file' | 'dir' | 'root' }
type Draft = { mode: 'file' | 'dir'; dir: string } | { mode: 'rename'; path: string; kind: 'file' | 'dir' }

function parentDir(rel: string): string {
  const slash = rel.lastIndexOf('/')
  return slash < 0 ? '' : rel.slice(0, slash)
}

function joinRel(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}

function folderName(raw: string): string {
  const name = raw.trim()
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) return ''
  return name
}

function markdownName(raw: string): string {
  const name = raw.trim()
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) return ''
  const withExt = name.includes('.') ? name : `${name}.md`
  return isMarkdown(withExt) || isMermaidFile(withExt) ? withExt : ''
}

function kindOf(name: string, body?: ReadResult): Kind {
  if (body && body.ok && body.binary) return 'binary'
  if (isMarkdown(name)) return 'markdown'
  if (isMermaidFile(name)) return 'mermaid'
  return 'text'
}

function loadHistory(root: string): string[] {
  try {
    const all = JSON.parse(localStorage.getItem('tui-md-history') || '[]') as HistItem[]
    return all.filter((item) => item.root === root).map((item) => item.path)
  } catch {
    return []
  }
}

function remember(root: string, rel: string) {
  try {
    const all = JSON.parse(localStorage.getItem('tui-md-history') || '[]') as HistItem[]
    const next = [{ root, path: rel }, ...all.filter((item) => !(item.root === root && item.path === rel))].slice(0, 30)
    localStorage.setItem('tui-md-history', JSON.stringify(next))
  } catch {
    /* storage can be blocked */
  }
}

function fuzzy(paths: string[], query: string): string[] {
  const needle = query.trim().toLowerCase()
  const ranked = needle
    ? paths.flatMap((item) => {
        const hay = item.toLowerCase()
        let at = 0
        let score = 0
        for (const ch of needle) {
          const found = hay.indexOf(ch, at)
          if (found < 0) return []
          score += found - at
          at = found + 1
        }
        return [{ item, score }]
      })
    : paths.map((item) => ({ item, score: 0 }))
  ranked.sort((a, b) => a.score - b.score || a.item.length - b.item.length)
  return ranked.slice(0, 40).map((item) => item.item)
}

function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ block: 'start' })
}

export function App() {
  const desktop = typeof window !== 'undefined' && Boolean(window.tuiMd)
  const platform = window.tuiMd?.platform || (navigator.platform.startsWith('Mac') ? 'darwin' : 'other')
  const modLabel = platform === 'darwin' ? '⌘' : 'Ctrl+'
  const [rootName, setRootName] = useState('Folder')
  const [rootPath, setRootPath] = useState('')
  const [hasRoot, setHasRoot] = useState(true)
  const [tree, setTree] = useState<TreeResult>({ name: '', nodes: [], truncated: false })
  const [git, setGit] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [rootOpen, setRootOpen] = useState(true)
  const [tabs, setTabs] = useState<string[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [bodies, setBodies] = useState<Record<string, ReadResult>>({})
  const [mode, setMode] = useState<'preview' | 'source'>('preview')
  const [outlineOpen, setOutlineOpen] = useState(true)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftName, setDraftName] = useState('')
  const [notice, setNotice] = useState('')
  const [sideW, setSideW] = useState(280)
  const [palette, setPalette] = useState<Palette>(null)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [paletteIndex, setPaletteIndex] = useState(0)
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [currentHeading, setCurrentHeading] = useState('')
  const [generation, setGeneration] = useState(0)
  const ready = useRef(false)
  const viewport = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancel = false
    ;(async () => {
      const client = api()
      const info = await client.getRoot()
      const listed = await client.list()
      const changes = await client.git()
      if (cancel) return
      setHasRoot(Boolean(info))
      setRootName(info?.name ?? 'No folder open')
      setRootPath(info?.path ?? '')
      setTree(listed)
      setGit(changes)
      if (ready.current) return
      ready.current = true
      const first = firstMarkdown(listed.nodes)
      setExpanded(new Set([...defaultExpanded(listed.nodes), ...(first ? ancestorDirs(first) : [])]))
      if (first) {
        setTabs([first])
        setActive(first)
        if (info?.path) remember(info.path, first)
      }
    })().catch((error: unknown) => {
      if (!cancel) setRootName(error instanceof Error ? error.message : 'Unable to open folder')
    })
    return () => {
      cancel = true
    }
  }, [generation])

  useEffect(() => {
    if (!active) return
    let cancel = false
    const pull = () => {
      api()
        .read(active)
        .then((result) => {
          if (cancel) return
          setBodies((current) => {
            const prev = current[active]
            if (prev && prev.ok && result.ok && prev.text === result.text && prev.binary === result.binary) return current
            return { ...current, [active]: result }
          })
        })
        .catch(() => {
          if (!cancel) setBodies((current) => ({ ...current, [active]: { ok: false, error: 'Unable to read file' } }))
        })
    }
    pull()
    const timer = window.setInterval(pull, 1500)
    return () => {
      cancel = true
      window.clearInterval(timer)
    }
  }, [active, generation])

  const files = useMemo(() => flattenFiles(tree.nodes).map((file) => file.path), [tree.nodes])
  const history = useMemo(() => (rootPath ? loadHistory(rootPath).filter((item) => files.includes(item)) : []), [rootPath, files, palette])
  const paletteRows = useMemo(
    () => fuzzy(palette === 'history' ? history : files, paletteQuery),
    [palette, history, files, paletteQuery],
  )

  const body = active ? bodies[active] : undefined
  const kind = active ? kindOf(active, body) : 'text'
  const outline = active && body && body.ok && !body.binary && isMarkdown(active) ? markdownOutline(body.text) : []
  const fileName = active ? active.split('/').pop() || active : rootName
  const crumb = active ? active.split('/') : []
  const eol = body && body.ok && body.eol === 'CRLF' ? 'CRLF' : 'LF'
  const language = kind === 'markdown' ? 'Markdown' : kind === 'mermaid' ? 'Mermaid' : active?.split('.').pop() || 'Text'

  useEffect(() => {
    document.title = active ? `${fileName} — ${rootName}` : rootName
  }, [active, fileName, rootName])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'p' && !event.shiftKey) {
        event.preventDefault()
        setPalette('files')
        setPaletteQuery('')
        setPaletteIndex(0)
        return
      }
      if (mod && event.key.toLowerCase() === 'o' && desktop) {
        event.preventDefault()
        void chooseFolder()
        return
      }
      if (typing) return
      if (event.key === 'Escape') {
        setPalette(null)
        setFindOpen(false)
        return
      }
      if (event.key === 't') setOutlineOpen((value) => !value)
      else if (event.key === 'H') {
        setPalette('history')
        setPaletteQuery('')
        setPaletteIndex(0)
      } else if (event.key === '/' || (mod && event.key.toLowerCase() === 'f')) {
        event.preventDefault()
        setFindOpen(true)
      } else if (event.key === 's' && kind === 'markdown') setMode((value) => (value === 'preview' ? 'source' : 'preview'))
      else if (event.key === 'n' || event.key === 'N') runFind(event.key === 'N')
      else if (event.key >= '1' && event.key <= '9') {
        const heading = outline[Number(event.key) - 1]
        if (heading) {
          setMode('preview')
          window.setTimeout(() => jumpTo(heading.id), 0)
        }
      } else if (event.key === 'J' || event.key === 'K') {
        const found = outline.findIndex((heading) => heading.id === currentHeading)
        const at = found < 0 ? -1 : found
        const nextIndex = event.key === 'J' ? Math.min(outline.length - 1, at + 1) : Math.max(0, at - 1)
        const next = outline[nextIndex]
        if (next) {
          setMode('preview')
          window.setTimeout(() => jumpTo(next.id), 0)
        }
      } else if (viewport.current && (event.key === 'j' || event.key === 'ArrowDown')) {
        event.preventDefault()
        viewport.current.scrollBy({ top: 48 })
      } else if (viewport.current && (event.key === 'k' || event.key === 'ArrowUp')) {
        event.preventDefault()
        viewport.current.scrollBy({ top: -48 })
      } else if (viewport.current && (event.key === 'd' || event.key === 'PageDown')) {
        event.preventDefault()
        viewport.current.scrollBy({ top: viewport.current.clientHeight - 48 })
      } else if (viewport.current && (event.key === 'u' || event.key === 'PageUp')) {
        event.preventDefault()
        viewport.current.scrollBy({ top: -(viewport.current.clientHeight - 48) })
      } else if (viewport.current && event.key === 'g') viewport.current.scrollTop = 0
      else if (viewport.current && event.key === 'G') viewport.current.scrollTop = viewport.current.scrollHeight
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [currentHeading, desktop, findText, kind, outline])

  function trackHeading() {
    const root = viewport.current
    if (!root) return
    const edge = root.getBoundingClientRect().top + 16
    let current = ''
    for (const el of root.querySelectorAll<HTMLElement>('[id^="h-"]')) {
      if (el.getBoundingClientRect().top <= edge) current = el.id
    }
    setCurrentHeading(current)
  }

  function runFind(backwards: boolean) {
    const finder = (window as Window & { find?: (text: string, caseSensitive?: boolean, backwards?: boolean, wrap?: boolean) => boolean }).find
    if (!findText || !finder) return
    finder(findText, false, backwards, true)
  }

  function openFile(rel: string) {
    setTabs((current) => (current.includes(rel) ? current : [...current, rel]))
    setActive(rel)
    setExpanded((current) => {
      const next = new Set(current)
      for (const dir of ancestorDirs(rel)) next.add(dir)
      return next
    })
    setRootOpen(true)
    setPalette(null)
    setMenu(null)
    if (!isMarkdown(rel)) setMode('source')
    else setMode('preview')
    if (rootPath) remember(rootPath, rel)
  }

  function closeTab(rel: string, event?: ReactMouse) {
    event?.stopPropagation()
    const next = tabs.filter((item) => item !== rel)
    if (active === rel) setActive(next[tabs.indexOf(rel)] ?? next[tabs.indexOf(rel) - 1] ?? null)
    setTabs(next)
  }

  function reveal(dir: string) {
    if (!dir) {
      setRootOpen(true)
      return
    }
    setExpanded((current) => new Set([...current, dir, ...ancestorDirs(dir)]))
    setRootOpen(true)
  }

  function refreshTree() {
    setGeneration((value) => value + 1)
  }

  function relocate(from: string, to: string) {
    const map = (item: string) => (item === from || item.startsWith(`${from}/`) ? `${to}${item.slice(from.length)}` : item)
    setTabs((current) => current.map(map))
    setActive((current) => (current ? map(current) : current))
    setBodies((current) => {
      const next: Record<string, ReadResult> = {}
      for (const [key, value] of Object.entries(current)) next[map(key)] = value
      return next
    })
  }

  function startDraft(next: Draft, name = '') {
    setMenu(null)
    setNotice('')
    setDraft(next)
    setDraftName(name)
    if (next.mode !== 'rename') reveal(next.dir)
  }

  async function commitDraft() {
    if (!draft) return
    if (draft.mode === 'rename') {
      const name = draft.kind === 'dir' ? folderName(draftName) : markdownName(draftName)
      if (!name) {
        setNotice(draft.kind === 'dir' ? 'Enter a folder name.' : 'Use a .md or .mmd name.')
        return
      }
      const to = joinRel(parentDir(draft.path), name)
      if (to === draft.path) {
        setDraft(null)
        return
      }
      const result = await api().rename(draft.path, to)
      if (!result.ok) {
        setNotice(result.error)
        return
      }
      relocate(draft.path, to)
      reveal(parentDir(to))
      setDraft(null)
      refreshTree()
      return
    }
    const name = draft.mode === 'dir' ? folderName(draftName) : markdownName(draftName)
    if (!name) {
      setNotice(draft.mode === 'dir' ? 'Enter a folder name.' : 'Use a .md or .mmd name.')
      return
    }
    const rel = joinRel(draft.dir, name)
    const result = await api().create(rel, draft.mode === 'dir' ? 'dir' : 'file')
    if (!result.ok) {
      setNotice(result.error)
      return
    }
    reveal(draft.mode === 'dir' ? rel : draft.dir)
    setDraft(null)
    refreshTree()
    if (draft.mode === 'file') openFile(rel)
  }

  async function destroy(rel: string, kind: 'file' | 'dir') {
    setMenu(null)
    const label = rel.split('/').pop() || rel
    const question = kind === 'dir' ? `Delete folder “${label}” and everything inside it?` : `Delete ${label}?`
    if (!window.confirm(question)) return
    const result = await api().remove(rel)
    if (!result.ok) {
      setNotice(result.error)
      return
    }
    setNotice('')
    const next = tabs.filter((item) => item !== rel && !item.startsWith(`${rel}/`))
    if (active && (active === rel || active.startsWith(`${rel}/`))) {
      const index = tabs.indexOf(active)
      setActive(next[index] ?? next[index - 1] ?? null)
    }
    setTabs(next)
    refreshTree()
  }

  async function chooseFolder() {
    const next = await api().openFolder()
    if (!next) return
    ready.current = false
    setRootName(next.name)
    setRootPath(next.path)
    setTabs([])
    setActive(null)
    setBodies({})
    setExpanded(new Set())
    setDraft(null)
    setMenu(null)
    setNotice('')
    setGeneration((value) => value + 1)
  }

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  function startResize(event: ReactMouse) {
    event.preventDefault()
    const startX = event.clientX
    const startW = sideW
    const move = (ev: MouseEvent) => setSideW(Math.min(520, Math.max(180, startW + ev.clientX - startX)))
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div className={platform === 'darwin' ? 'shell mac' : 'shell'}>
      <header className="titlebar">
        <span className="title">{active ? `${fileName} — ${rootName}` : rootName}</span>
        <div className="title-actions">
          <button
            type="button"
            onClick={() => {
              setPalette('history')
              setPaletteQuery('')
              setPaletteIndex(0)
            }}
          >
            Recent
          </button>
          <button type="button" className={outlineOpen ? 'on' : ''} onClick={() => setOutlineOpen((value) => !value)}>
            Outline
          </button>
          {desktop ? (
            <button type="button" onClick={() => void chooseFolder()}>
              Open Folder
            </button>
          ) : null}
          {kind === 'markdown' ? (
            <div className="mode">
              <button type="button" className={mode === 'preview' ? 'on' : ''} onClick={() => setMode('preview')}>
                Preview
              </button>
              <button type="button" className={mode === 'source' ? 'on' : ''} onClick={() => setMode('source')}>
                Source
              </button>
            </div>
          ) : null}
        </div>
      </header>
      <div className="body">
        <aside className="sidebar" style={{ width: sideW }}>
          <div className="side-title">
            <span>Explorer</span>
            <span className="side-actions">
              <button type="button" onClick={() => startDraft({ mode: 'file', dir: active ? parentDir(active) : '' })}>
                New File
              </button>
              <button type="button" onClick={() => startDraft({ mode: 'dir', dir: active ? parentDir(active) : '' })}>
                New Folder
              </button>
            </span>
          </div>
          {draft ? (
            <form
              className="draft"
              onSubmit={(event) => {
                event.preventDefault()
                void commitDraft()
              }}
            >
              <input
                autoFocus
                value={draftName}
                placeholder={draft.mode === 'dir' ? 'Folder name' : draft.mode === 'rename' ? 'New name' : 'File name'}
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation()
                    setDraft(null)
                  }
                }}
              />
            </form>
          ) : null}
          {notice ? <div className="notice">{notice}</div> : null}
          <div className="side-scroll">
            {hasRoot ? (
              <div
                className="tree-row root-row"
                style={{ paddingLeft: 8 }}
                onClick={() => setRootOpen((value) => !value)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  setMenu({ x: event.clientX, y: event.clientY, path: '', kind: 'root' })
                }}
              >
                <Chevron open={rootOpen} />
                <FolderIcon open={rootOpen} />
                <span className="name">{rootName}</span>
              </div>
            ) : (
              <div className="more">No folder open</div>
            )}
            {hasRoot && rootOpen ? (
              <Tree
                nodes={tree.nodes}
                depth={1}
                expanded={expanded}
                selected={active || ''}
                git={git}
                onToggle={(rel) =>
                  setExpanded((current) => {
                    const next = new Set(current)
                    if (next.has(rel)) next.delete(rel)
                    else next.add(rel)
                    return next
                  })
                }
                onOpen={openFile}
                onMenu={(node, x, y) => setMenu({ x, y, path: node.path, kind: node.kind })}
              />
            ) : null}
            {tree.truncated ? <div className="more">More files were not shown</div> : null}
          </div>
          <div className={outlineOpen ? 'outline open' : 'outline'}>
            <button type="button" className="side-title" onClick={() => setOutlineOpen((value) => !value)}>
              Outline
            </button>
            {outlineOpen ? (
              <div className="side-scroll">
                {outline.map((heading) => (
                  <button
                    key={heading.id}
                    type="button"
                    className={heading.id === currentHeading ? 'outline-row active' : 'outline-row'}
                    style={{ paddingLeft: 8 + (heading.depth - 1) * 12 }}
                    onClick={() => {
                      setMode('preview')
                      window.setTimeout(() => jumpTo(heading.id), 0)
                    }}
                  >
                    {heading.text}
                  </button>
                ))}
                {outline.length === 0 ? <div className="more">No headings</div> : null}
              </div>
            ) : null}
          </div>
        </aside>
        <div className="sash" onMouseDown={startResize} />
        <main className="editor">
          <div className="tabs">
            {tabs.map((rel) => {
              const name = rel.split('/').pop() || rel
              return (
                <div key={rel} className={rel === active ? 'tab active' : 'tab'} onClick={() => openFile(rel)}>
                  <FileIcon name={rel} />
                  <span>{name}</span>
                  <button type="button" className="tab-close" aria-label={`Close ${name}`} onClick={(event) => closeTab(rel, event)}>
                    ×
                  </button>
                </div>
              )
            })}
          </div>
          <div className="crumb">
            <span>{rootName}</span>
            {crumb.map((part, index) => (
              <span key={`${part}-${index}`}>
                <span className="sep">›</span>
                {part}
              </span>
            ))}
            <span className="crumb-mode">{mode === 'preview' && kind !== 'text' ? 'Markdown Preview' : 'Source'}</span>
          </div>
          {findOpen ? (
            <div className="find-bar">
              <input
                autoFocus
                placeholder="Find"
                value={findText}
                onChange={(event) => setFindText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    runFind(event.shiftKey)
                    ;(event.target as HTMLInputElement).blur()
                  } else if (event.key === 'Escape') setFindOpen(false)
                }}
              />
            </div>
          ) : null}
          <div className="viewport" ref={viewport} onScroll={trackHeading}>
            {active ? (
              <Preview file={active} body={body} mode={kind === 'markdown' ? mode : kind === 'mermaid' ? 'preview' : 'source'} kind={kind} />
            ) : (
              <div className="empty">
                <h1>tui-md</h1>
                <p>Open a markdown file from the outline, the file list, or {modLabel}P.</p>
                {desktop && !hasRoot ? (
                  <button type="button" className="open-folder" onClick={() => void chooseFolder()}>
                    Open Folder
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </main>
      </div>
      <footer className="status">
        <div>
          <span>{rootName}</span>
          <span>{active || 'No file open'}</span>
          <span>
            {modLabel}P files  t outline  H recent  / find
          </span>
        </div>
        <div>
          <span>{eol}</span>
          <span>UTF-8</span>
          <span>{language}</span>
        </div>
      </footer>
      {palette ? (
        <div className="palette" onMouseDown={() => setPalette(null)}>
          <div className="palette-card" onMouseDown={(event) => event.stopPropagation()}>
            <input
              autoFocus
              placeholder={palette === 'history' ? 'Recent files' : 'Search files by name'}
              value={paletteQuery}
              onChange={(event) => {
                setPaletteQuery(event.target.value)
                setPaletteIndex(0)
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setPaletteIndex((index) => Math.min(paletteRows.length - 1, index + 1))
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setPaletteIndex((index) => Math.max(0, index - 1))
                } else if (event.key === 'Enter' && paletteRows[paletteIndex]) openFile(paletteRows[paletteIndex])
                else if (event.key === 'Escape') setPalette(null)
              }}
            />
            <div className="palette-list">
              {paletteRows.map((file, index) => (
                <button
                  key={file}
                  type="button"
                  className={index === paletteIndex ? 'hit on' : 'hit'}
                  onMouseEnter={() => setPaletteIndex(index)}
                  onClick={() => openFile(file)}
                >
                  <FileIcon name={file} />
                  <span>{file}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {menu ? (
        <div className="ctx" style={{ left: menu.x, top: menu.y }} onMouseDown={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => startDraft({ mode: 'file', dir: menu.kind === 'dir' ? menu.path : parentDir(menu.path) })}>
            New File
          </button>
          <button type="button" onClick={() => startDraft({ mode: 'dir', dir: menu.kind === 'dir' ? menu.path : parentDir(menu.path) })}>
            New Folder
          </button>
          {menu.kind !== 'root' ? (
            <button
              type="button"
              onClick={() =>
                startDraft(
                  { mode: 'rename', path: menu.path, kind: menu.kind === 'dir' ? 'dir' : 'file' },
                  menu.path.split('/').pop() || '',
                )
              }
            >
              Rename
            </button>
          ) : null}
          {menu.kind !== 'root' ? (
            <button type="button" onClick={() => void destroy(menu.path, menu.kind === 'dir' ? 'dir' : 'file')}>
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
