import type { ReadResult, TreeResult } from '@tui-md/core'

export type RootInfo = { name: string; path: string }

export type FsResult = { ok: true } | { ok: false; error: string }

export type Api = {
  platform: string
  getRoot: () => Promise<RootInfo | null>
  list: () => Promise<TreeResult>
  git: () => Promise<Record<string, string>>
  read: (rel: string) => Promise<ReadResult>
  openFolder: () => Promise<RootInfo | null>
  create: (rel: string, kind: 'file' | 'dir') => Promise<FsResult>
  rename: (from: string, to: string) => Promise<FsResult>
  remove: (rel: string) => Promise<FsResult>
}

async function post(url: string): Promise<FsResult> {
  const response = await fetch(url, { method: 'POST' })
  return response.json() as Promise<FsResult>
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
    create: (rel, kind) => post(`/api/create?path=${encodeURIComponent(rel)}&kind=${kind}`),
    rename: (from, to) => post(`/api/rename?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    remove: (rel) => post(`/api/remove?path=${encodeURIComponent(rel)}`),
  }
}

export function api(): Api {
  return window.tuiMd ?? browserApi()
}

export function assetUrl(rel: string): string {
  if (window.tuiMd) return `tumd-asset://local/?path=${encodeURIComponent(rel)}`
  return `/api/asset?path=${encodeURIComponent(rel)}`
}
