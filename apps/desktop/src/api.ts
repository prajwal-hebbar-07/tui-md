import type { ReadResult, TreeResult } from '@tui-md/core'

export type RootInfo = { name: string; path: string }

export type Api = {
  platform: string
  getRoot: () => Promise<RootInfo | null>
  list: () => Promise<TreeResult>
  git: () => Promise<Record<string, string>>
  read: (rel: string) => Promise<ReadResult>
  openFolder: () => Promise<RootInfo | null>
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json() as Promise<T>
}

function browserApi(): Api {
  return {
    platform: navigator.platform.startsWith('Mac') ? 'darwin' : 'browser',
    getRoot: () => getJson('/api/root'),
    list: () => getJson('/api/tree'),
    git: () => getJson('/api/git'),
    read: (rel) => getJson(`/api/file?path=${encodeURIComponent(rel)}`),
    openFolder: async () => null,
  }
}

export function api(): Api {
  return window.tuiMd ?? browserApi()
}

export function assetUrl(rel: string): string {
  if (window.tuiMd) return `tumd-asset://local/?path=${encodeURIComponent(rel)}`
  return `/api/asset?path=${encodeURIComponent(rel)}`
}
