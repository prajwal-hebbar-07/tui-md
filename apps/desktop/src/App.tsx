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
import { Chevron, FileIcon, FilesIcon, FolderIcon, SearchIcon } from './icons'
import { Preview } from './Preview'
import { Tree } from './Tree'

type Tab = { path: string }
type Kind = 'markdown' | 'mermaid' | 'text' | 'binary'

function kindOf(name: string, body?: ReadResult): Kind {
  if (body && body.ok && body.binary) return 'binary'
  if (isMarkdown(name)) return 'markdown'
  if (isMermaidFile(name)) return 'mermaid'
  return 'text'
}

export function App() {
  const desktop = typeof window !== 'undefined' && Boolean(window.tuiMd)
  const platform = window.tuiMd?.platform || (navigator.platform.startsWith('Mac') ? 'darwin' : 'other')
  const [rootName, setRootName] = useState('Folder')
  const [hasRoot, setHasRoot] = useState(true)
  const [tree, setTree] = useState<TreeResult>({ name: '', nodes: [], truncated: false })
  const [git, setGit] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [rootOpen, setRootOpen] = useState(true)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [bodies, setBodies] = useState<Record<string, ReadResult>>({})
  const [mode, setMode] = useState<'preview' | 'source'>('preview')
  const [activity, setActivity] = useState<'files' | 'search'>('files')
  const [query, setQuery] = useState('')
  const [sideW, setSideW] = useState(280)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [quick, setQuick] = useState(false)
  const [quickQuery, setQuickQuery] = useState('')
  const [quickIndex, setQuickIndex] = useState(0)
  const [generation, setGeneration] = useState(0)
  const ready = useRef(false)

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
      setTree(listed)
      setGit(changes)
      if (ready.current) return
      ready.current = true
      const first = firstMarkdown(listed.nodes)
      setExpanded(new Set([...defaultExpanded(listed.nodes), ...(first ? ancestorDirs(first) : [])]))
      if (first) {
        setTabs([{ path: first }])
        setActive(first)
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
    api()
      .read(active)
      .then((result) => {
        if (!cancel) setBodies((current) => ({ ...current, [active]: result }))
      })
      .catch(() => {
        if (!cancel) setBodies((current) => ({ ...current, [active]: { ok: false, error: 'Unable to read file' } }))
      })
    return () => {
      cancel = true
    }
  }, [active, generation])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setQuick(true)
        setQuickQuery('')
        setQuickIndex(0)
      } else if (mod && event.key.toLowerCase() === 'o' && desktop) {
        event.preventDefault()
        void chooseFolder()
      } else if (event.key === 'Escape') setQuick(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [desktop])

  useEffect(() => {
    const onFocus = () => setGeneration((value) => value + 1)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const files = useMemo(() => flattenFiles(tree.nodes), [tree.nodes])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return files
    return files.filter((file) => file.path.toLowerCase().includes(needle))
  }, [files, query])
  const quickFiles = useMemo(() => {
    const needle = quickQuery.trim().toLowerCase()
    const list = needle ? files.filter((file) => file.path.toLowerCase().includes(needle)) : files
    return list.slice(0, 40)
  }, [files, quickQuery])

  const body = active ? bodies[active] : undefined
  const kind = active ? kindOf(active, body) : 'text'
  const outline =
    active && body && body.ok && !body.binary && isMarkdown(active) ? markdownOutline(body.text) : []
  const fileName = active ? active.split('/').pop() || active : rootName
  const crumb = active ? active.split('/') : []
  const eol = body && body.ok && body.eol === 'CRLF' ? 'CRLF' : 'LF'
  const language = kind === 'markdown' ? 'Markdown' : kind === 'mermaid' ? 'Mermaid' : active?.split('.').pop() || 'Text'

  useEffect(() => {
    document.title = active ? `${fileName} — ${rootName}` : rootName
  }, [active, fileName, rootName])

  function openFile(rel: string) {
    setTabs((current) => (current.some((tab) => tab.path === rel) ? current : [...current, { path: rel }]))
    setActive(rel)
    setExpanded((current) => {
      const next = new Set(current)
      for (const dir of ancestorDirs(rel)) next.add(dir)
      return next
    })
    setRootOpen(true)
    setQuick(false)
    if (!isMarkdown(rel)) setMode('source')
    else setMode('preview')
  }

  function closeTab(rel: string) {
    setTabs((current) => {
      const next = current.filter((tab) => tab.path !== rel)
      if (active === rel) setActive(next[next.length - 1]?.path ?? null)
      return next
    })
  }

  async function chooseFolder() {
    const next = await api().openFolder()
    if (!next) return
    ready.current = false
    setRootName(next.name)
    setTabs([])
    setActive(null)
    setBodies({})
    setExpanded(new Set())
    setGeneration((value) => value + 1)
  }

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
        <nav className="activity">
          <button
            type="button"
            className={activity === 'files' ? 'active' : ''}
            aria-label="Explorer"
            onClick={() => setActivity('files')}
          >
            <FilesIcon />
          </button>
          <button
            type="button"
            className={activity === 'search' ? 'active' : ''}
            aria-label="Search"
            onClick={() => setActivity('search')}
          >
            <SearchIcon />
          </button>
        </nav>
        <aside className="sidebar" style={{ width: sideW }}>
          <div className="side-title">{activity === 'files' ? 'Explorer' : 'Search'}</div>
          {activity === 'search' ? (
            <div className="search-pane">
              <input
                value={query}
                autoFocus
                placeholder="Filter files"
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="side-scroll">
                {filtered.map((file) => (
                  <button key={file.path} type="button" className="search-hit" onClick={() => openFile(file.path)}>
                    <FileIcon name={file.name} />
                    <span>{file.path}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="side-scroll">
                {hasRoot ? (
                  <div className="tree-row root-row" style={{ paddingLeft: 8 }} onClick={() => setRootOpen((value) => !value)}>
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
                  />
                ) : null}
                {tree.truncated ? <div className="more">More files were not shown</div> : null}
              </div>
              <section className={outlineOpen ? 'outline open' : 'outline'}>
                <button type="button" className="side-title" onClick={() => setOutlineOpen((value) => !value)}>
                  Outline
                </button>
                {outlineOpen
                  ? outline.map((heading) => (
                      <button
                        key={heading.id}
                        type="button"
                        className="outline-row"
                        style={{ paddingLeft: 8 + (heading.depth - 1) * 12 }}
                        onClick={() => document.getElementById(heading.id)?.scrollIntoView({ block: 'start' })}
                      >
                        {heading.text}
                      </button>
                    ))
                  : null}
                {outlineOpen && outline.length === 0 ? <div className="more">No headings</div> : null}
              </section>
            </>
          )}
        </aside>
        <div className="sash" onMouseDown={startResize} />
        <main className="editor">
          <div className="tabs">
            {tabs.map((tab) => (
              <div
                key={tab.path}
                className={tab.path === active ? 'tab active' : 'tab'}
                onClick={() => setActive(tab.path)}
                onAuxClick={(event) => {
                  if (event.button === 1) closeTab(tab.path)
                }}
              >
                <FileIcon name={tab.path} />
                <span>{tab.path.split('/').pop()}</span>
                <button
                  type="button"
                  className="tab-close"
                  aria-label="Close"
                  onClick={(event) => {
                    event.stopPropagation()
                    closeTab(tab.path)
                  }}
                >
                  ×
                </button>
              </div>
            ))}
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
          <div className="viewport">
            {active ? (
              <Preview file={active} body={body} mode={kind === 'markdown' ? mode : kind === 'mermaid' ? 'preview' : 'source'} kind={kind} />
            ) : (
              <div className="empty">
                <h1>tui-md</h1>
                <p>Open a folder of markdown to preview it, including Mermaid diagrams.</p>
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
        </div>
        <div>
          <span>{eol}</span>
          <span>UTF-8</span>
          <span>{language}</span>
        </div>
      </footer>
      {quick ? (
        <div className="palette" onMouseDown={() => setQuick(false)}>
          <div className="palette-card" onMouseDown={(event) => event.stopPropagation()}>
            <input
              autoFocus
              placeholder="Search files by name"
              value={quickQuery}
              onChange={(event) => {
                setQuickQuery(event.target.value)
                setQuickIndex(0)
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setQuickIndex((index) => Math.min(quickFiles.length - 1, index + 1))
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setQuickIndex((index) => Math.max(0, index - 1))
                } else if (event.key === 'Enter' && quickFiles[quickIndex]) openFile(quickFiles[quickIndex].path)
                else if (event.key === 'Escape') setQuick(false)
              }}
            />
            <div className="palette-list">
              {quickFiles.map((file, index) => (
                <button
                  key={file.path}
                  type="button"
                  className={index === quickIndex ? 'hit on' : 'hit'}
                  onMouseEnter={() => setQuickIndex(index)}
                  onClick={() => openFile(file.path)}
                >
                  <FileIcon name={file.name} />
                  <span>{file.path}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
