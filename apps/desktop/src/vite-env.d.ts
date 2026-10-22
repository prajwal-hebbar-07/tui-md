/// <reference types="vite/client" />

type TuiApi = {
  platform: string
  getRoot: () => Promise<{ name: string; path: string } | null>
  list: () => Promise<import('@tui-md/core').TreeResult>
  git: () => Promise<Record<string, string>>
  read: (rel: string) => Promise<import('@tui-md/core').ReadResult>
  openFolder: () => Promise<{ name: string; path: string } | null>
  create: (rel: string, kind: 'file' | 'dir') => Promise<{ ok: true } | { ok: false; error: string }>
  rename: (from: string, to: string) => Promise<{ ok: true } | { ok: false; error: string }>
  remove: (rel: string) => Promise<{ ok: true } | { ok: false; error: string }>
}

interface Window {
  tuiMd?: TuiApi
}
