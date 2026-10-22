import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const MAX = 30

export function historyFile(): string {
  return path.join(os.homedir(), '.config', 'tui-md', 'history')
}

export function readHistory(file = historyFile()): string[] {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, MAX)
  } catch {
    return []
  }
}

export function rememberFile(abs: string, file = historyFile()): void {
  const next = [abs, ...readHistory(file).filter((item) => item !== abs)].slice(0, MAX)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${next.join('\n')}\n`)
}

export function fuzzyPaths(paths: string[], query: string): string[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return paths
  const scored: { path: string; score: number }[] = []
  for (const item of paths) {
    const score = fuzzyScore(item.toLowerCase(), needle)
    if (score >= 0) scored.push({ path: item, score })
  }
  scored.sort((a, b) => a.score - b.score || a.path.length - b.path.length)
  return scored.map((item) => item.path)
}

function fuzzyScore(hay: string, needle: string): number {
  let score = 0
  let at = 0
  for (const ch of needle) {
    const found = hay.indexOf(ch, at)
    if (found < 0) return -1
    score += found - at
    at = found + 1
  }
  return score
}
