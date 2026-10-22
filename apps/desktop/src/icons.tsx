const FILE_COLORS: Record<string, string> = {
  md: '#519aba',
  mdx: '#519aba',
  mmd: '#b180d7',
  json: '#cbcb41',
  js: '#cbcb41',
  jsx: '#519aba',
  ts: '#519aba',
  tsx: '#519aba',
  yml: '#a074c4',
  yaml: '#a074c4',
  css: '#519aba',
  html: '#e37933',
  svg: '#c27ba0',
  png: '#a074c4',
  jpg: '#a074c4',
  gif: '#a074c4',
  gitignore: '#858585',
}

export function FileIcon({ name }: { name: string }) {
  const ext = name.startsWith('.') ? name.slice(1).toLowerCase() : (name.split('.').pop() || '').toLowerCase()
  const color = FILE_COLORS[ext] || '#8a8a8a'
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path fill={color} d="M3.2 1.4h6.1L13 5.1v9.5H3.2z" />
      <path fill="#1b1b1b" fillOpacity="0.35" d="M9.2 1.4v3.8H13" />
    </svg>
  )
}

export function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path fill={open ? '#dcb67a' : '#c09553'} d="M1.4 3.2h5.1l1.2 1.5h6.9v8.1H1.4z" />
    </svg>
  )
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={open ? 'chev open' : 'chev'} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 4.2 10.2 8 6 11.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

export function FilesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7.2h6.2L11.6 9H20V18H4z" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15.2 15.2 19 19" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}
