import mermaid from 'mermaid'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ensureMermaid } from './mermaid'

const MIN = 0.02
const MAX = 16

type View = { x: number; y: number; k: number }

function zoomAt(view: View, px: number, py: number, factor: number): View {
  const k = Math.min(MAX, Math.max(MIN, view.k * factor))
  const ratio = k / view.k
  return { k, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio }
}

export function DiagramBoard({ source, onClose }: { source: string; onClose: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const pctRef = useRef<HTMLButtonElement>(null)
  const viewRef = useRef<View>({ x: 0, y: 0, k: 1 })
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const [markup, setMarkup] = useState('')
  const [error, setError] = useState('')

  function paint(view: View) {
    viewRef.current = view
    const layer = layerRef.current
    if (layer) {
      layer.style.visibility = 'visible'
      layer.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`
    }
    if (pctRef.current) pctRef.current.textContent = `${Math.round(view.k * 100)}%`
  }

  function fit(tries = 0) {
    const stage = stageRef.current
    const svg = layerRef.current?.querySelector('svg')
    if (!stage || !svg) return
    if (stage.clientWidth < 10 || stage.clientHeight < 10) {
      if (tries < 30) requestAnimationFrame(() => fit(tries + 1))
      return
    }
    const box = svg.viewBox.baseVal
    const w = box.width || svg.clientWidth
    const h = box.height || svg.clientHeight
    if (!w || !h) {
      paint(viewRef.current)
      return
    }
    const pad = 72
    const raw = Math.min((stage.clientWidth - pad) / w, (stage.clientHeight - pad) / h)
    const k = Math.min(MAX, Math.max(MIN, Math.min(raw, 1.25)))
    paint({ k, x: (stage.clientWidth - w * k) / 2, y: (stage.clientHeight - h * k) / 2 })
  }

  function centerZoom(factor: number) {
    const stage = stageRef.current
    if (!stage) return
    paint(zoomAt(viewRef.current, stage.clientWidth / 2, stage.clientHeight / 2, factor))
  }

  function actualSize() {
    const stage = stageRef.current
    const view = viewRef.current
    if (!stage || view.k === 1) return
    paint(zoomAt(view, stage.clientWidth / 2, stage.clientHeight / 2, 1 / view.k))
  }

  useEffect(() => {
    let cancel = false
    ensureMermaid()
    ;(async () => {
      try {
        const id = `board-${Math.random().toString(36).slice(2)}`
        const { svg } = await mermaid.render(id, source)
        if (!cancel) setMarkup(svg)
      } catch (err) {
        if (!cancel) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancel = true
    }
  }, [source])

  useEffect(() => {
    const svg = layerRef.current?.querySelector('svg')
    if (!svg) return
    const box = svg.viewBox.baseVal
    if (box.width && box.height) {
      svg.setAttribute('width', String(box.width))
      svg.setAttribute('height', String(box.height))
    }
    svg.style.maxWidth = 'none'
    fit()
  }, [markup])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = stage.getBoundingClientRect()
      const view = viewRef.current
      if (event.ctrlKey || event.metaKey) {
        const dy = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
        paint(zoomAt(view, event.clientX - rect.left, event.clientY - rect.top, Math.exp(-dy * 0.003)))
      } else {
        paint({ ...view, x: view.x - event.deltaX, y: view.y - event.deltaY })
      }
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      else if (event.key === '+' || event.key === '=') centerZoom(1.25)
      else if (event.key === '-' || event.key === '_') centerZoom(0.8)
      else if (event.key === '0') fit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function endDrag() {
    drag.current = null
    stageRef.current?.classList.remove('grabbing')
  }

  return createPortal(
    <div
      className="board"
      ref={stageRef}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        if ((event.target as HTMLElement).closest('.board-bar')) return
        const view = viewRef.current
        drag.current = { px: event.clientX, py: event.clientY, x: view.x, y: view.y }
        stageRef.current?.setPointerCapture(event.pointerId)
        stageRef.current?.classList.add('grabbing')
      }}
      onPointerMove={(event) => {
        const start = drag.current
        if (!start) return
        paint({ ...viewRef.current, x: start.x + event.clientX - start.px, y: start.y + event.clientY - start.py })
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest('.board-bar')) return
        const rect = stageRef.current?.getBoundingClientRect()
        if (!rect) return
        paint(zoomAt(viewRef.current, event.clientX - rect.left, event.clientY - rect.top, 1.5))
      }}
    >
      <div className="board-layer" ref={layerRef} dangerouslySetInnerHTML={{ __html: markup }} />
      {error ? <div className="board-error">{error}</div> : null}
      <div className="board-bar">
        <button type="button" onClick={() => centerZoom(1 / 1.25)} aria-label="Zoom out">
          −
        </button>
        <button type="button" ref={pctRef} onClick={actualSize} aria-label="Actual size">
          100%
        </button>
        <button type="button" onClick={() => centerZoom(1.25)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => fit()} aria-label="Fit diagram">
          Fit
        </button>
        <button type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="board-hint">Drag to move. Scroll to pan. Pinch or Ctrl/Cmd-scroll to zoom.</div>
    </div>,
    document.body,
  )
}

export function DiagramWindow({ id }: { id: string }) {
  const [source, setSource] = useState<string | null>(null)
  useEffect(() => {
    document.title = 'Diagram'
    let cancel = false
    const load = window.tuiMd?.diagramSource
    if (!load) {
      setSource('')
      return
    }
    void load(id).then(
      (text) => {
        if (!cancel) setSource(text || '')
      },
      () => {
        if (!cancel) setSource('')
      },
    )
    return () => {
      cancel = true
    }
  }, [id])
  if (source == null) return <div className="board" />
  return <DiagramBoard source={source} onClose={() => window.close()} />
}
