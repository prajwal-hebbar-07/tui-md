/// <reference types="vite/client" />

type TuiApi = {
  platform: string
  getRoot: () => Promise<{ name: string; path: string }>
  list: () => Promise<import('@tui-md/core').TreeResult>
  git: () => Promise<Record<string, string>>
  read: (rel: string) => Promise<import('@tui-md/core').ReadResult>
  openFolder: () => Promise<{ name: string; path: string } | null>
}

interface Window {
  tuiMd?: TuiApi
}
