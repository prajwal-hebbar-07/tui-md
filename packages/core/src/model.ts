export type TreeNode = {
  name: string
  path: string
  kind: 'dir' | 'file'
  children?: TreeNode[]
}

export type TreeResult = {
  name: string
  nodes: TreeNode[]
  truncated: boolean
}

export type ReadResult =
  | {
      ok: true
      text: string
      truncated: boolean
      binary: boolean
      eol: 'LF' | 'CRLF'
    }
  | {
      ok: false
      error: string
    }

export function isMarkdown(name: string): boolean {
  return /\.mdx?$/i.test(name)
}

export function isMermaidFile(name: string): boolean {
  return /\.mmd$/i.test(name)
}

export function visibleTree(
  nodes: TreeNode[],
  expanded: ReadonlySet<string>,
  depth = 0,
): { node: TreeNode; depth: number }[] {
  const out: { node: TreeNode; depth: number }[] = []
  for (const node of nodes) {
    out.push({ node, depth })
    if (node.kind === 'dir' && node.children && expanded.has(node.path)) {
      out.push(...visibleTree(node.children, expanded, depth + 1))
    }
  }
  return out
}

export function flattenFiles(nodes: TreeNode[]): { name: string; path: string }[] {
  const out: { name: string; path: string }[] = []
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      if (node.kind === 'file') out.push({ name: node.name, path: node.path })
      else if (node.children) walk(node.children)
    }
  }
  walk(nodes)
  return out
}

export function firstMarkdown(nodes: TreeNode[]): string | null {
  for (const node of nodes) {
    if (node.kind === 'file' && (isMarkdown(node.name) || isMermaidFile(node.name))) return node.path
  }
  for (const node of nodes) {
    if (node.kind === 'dir' && node.children) {
      const hit = firstMarkdown(node.children)
      if (hit) return hit
    }
  }
  return null
}

export function defaultExpanded(nodes: TreeNode[]): string[] {
  const all: string[] = []
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      if (node.kind === 'dir') {
        all.push(node.path)
        if (node.children) walk(node.children)
      }
    }
  }
  walk(nodes)
  if (all.length > 200) return all.filter((item) => item.split('/').length <= 2)
  return all
}

export function ancestorDirs(rel: string): string[] {
  const parts = rel.split('/').filter(Boolean)
  const out: string[] = []
  for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(0, i + 1).join('/'))
  return out
}

export function bubbleGit(nodes: TreeNode[], changes: Record<string, string>): Record<string, string> {
  const out = { ...changes }
  const walk = (list: TreeNode[]): string | null => {
    let mark: string | null = null
    for (const node of list) {
      if (node.kind === 'file') {
        if (out[node.path]) mark = mark || out[node.path]
      } else if (node.children) {
        const child = walk(node.children)
        if (child) {
          out[node.path] = out[node.path] || child
          mark = mark || child
        }
      }
    }
    return mark
  }
  walk(nodes)
  return out
}

export function resolveRelative(fileRel: string, src: string): string | null {
  if (!src || /^(https?:|data:|mailto:|#)/i.test(src)) return null
  const base = fileRel.split('/').slice(0, -1)
  const stack = [...base]
  for (const part of src.split(/[\\/]/)) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (stack.length === 0) return null
      stack.pop()
    } else stack.push(part)
  }
  return stack.join('/')
}
