import { mermaidDocument, renderMarkdownHtml, resolveRelative, type ReadResult } from '@tui-md/core'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import mermaid from 'mermaid'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { assetUrl } from './api'
import { DiagramBoard } from './DiagramBoard'
import { ensureMermaid } from './mermaid'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('css', css)
hljs.registerLanguage('go', go)
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('md', markdown)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('javascript', typescript)
hljs.registerLanguage('js', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)

export function Preview({
  file,
  body,
  mode,
  kind,
}: {
  file: string
  body: ReadResult | undefined
  mode: 'preview' | 'source'
  kind: 'markdown' | 'mermaid' | 'text' | 'binary'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [board, setBoard] = useState<string | null>(null)
  const html =
    body && body.ok && !body.binary && mode === 'preview'
      ? kind === 'mermaid'
        ? mermaidDocument(body.text)
        : kind === 'markdown'
          ? renderMarkdownHtml(body.text, {
              rewriteImage: (src) => {
                const rel = resolveRelative(file, src)
                return rel ? assetUrl(rel) : src
              },
            })
          : ''
      : ''

  useEffect(() => {
    const root = ref.current
    if (!root || !html) return
    let cancel = false
    root.querySelectorAll('pre code').forEach((node) => {
      const el = node as HTMLElement
      if (el.dataset.highlighted === 'yes') return
      hljs.highlightElement(el)
    })
    const nodes = [...root.querySelectorAll<HTMLElement>('pre.mermaid')]
    for (const node of nodes) {
      const diagram = node.closest<HTMLElement>('.diagram')
      if (diagram) diagram.dataset.source = node.textContent || ''
    }
    if (!nodes.length) return
    ensureMermaid()
    ;(async () => {
      for (const node of nodes) {
        if (cancel) return
        const source = node.textContent || ''
        try {
          const id = `mmd-${Math.random().toString(36).slice(2)}`
          const { svg } = await mermaid.render(id, source)
          if (!cancel) node.outerHTML = svg
        } catch (error) {
          if (!cancel) node.textContent = error instanceof Error ? error.message : String(error)
        }
      }
    })()
    return () => {
      cancel = true
    }
  }, [html])

  async function openDiagram(source: string) {
    try {
      if (window.tuiMd?.openDiagram) {
        await window.tuiMd.openDiagram(source)
        return
      }
    } catch {
      // Browser preview has no desktop bridge.
    }
    setBoard(source)
  }

  const onClick = (event: MouseEvent) => {
    const opener = (event.target as HTMLElement).closest('button[data-open]')
    if (opener) {
      const diagram = opener.closest<HTMLElement>('.diagram')
      const source = diagram?.dataset.source || diagram?.querySelector('pre.mermaid')?.textContent || ''
      void openDiagram(source)
      return
    }
    const button = (event.target as HTMLElement).closest('button[data-zoom]')
    if (!button) return
    const canvas = button.closest('.diagram')?.querySelector<HTMLElement>('.diagram-canvas')
    if (!canvas) return
    const current = Number(canvas.dataset.scale || '1')
    const action = button.getAttribute('data-zoom')
    const next = action === 'in' ? Math.min(2.5, current + 0.25) : action === 'out' ? Math.max(0.5, current - 0.25) : 1
    canvas.dataset.scale = String(next)
    canvas.style.setProperty('zoom', String(next))
  }

  if (!body) return <div className="empty">Opening…</div>
  if (!body.ok) return <div className="empty">{body.error}</div>
  if (body.binary || kind === 'binary') return <div className="empty">Binary file</div>
  if (mode === 'source' || kind === 'text') {
    const rows = body.text.replace(/\n$/, '').split('\n')
    return (
      <div className="source">
        {body.truncated ? <div className="banner">Showing the first 400 KB</div> : null}
        {rows.map((line, index) => (
          <div className="src-line" key={index}>
            <span className="ln">{index + 1}</span>
            <span>{line || ' '}</span>
          </div>
        ))}
      </div>
    )
  }
  return (
    <>
      <div className="preview" ref={ref} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
      {board != null ? <DiagramBoard source={board} onClose={() => setBoard(null)} /> : null}
    </>
  )
}
