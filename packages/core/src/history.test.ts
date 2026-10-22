import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fuzzyPaths, readHistory, rememberFile } from './history.js'

test('fuzzy match keeps subsequence order and prefers a tighter hit', () => {
  const ranked = fuzzyPaths(['docs/readme.md', 'src/render.md', 'notes/draft.md'], 'rdm')
  assert.deepEqual(ranked, ['docs/readme.md', 'src/render.md'])
})

test('recent files stay newest-first and drop duplicates', () => {
  const file = path.join(os.tmpdir(), `tui-md-history-${process.pid}.txt`)
  fs.rmSync(file, { force: true })
  rememberFile('/notes/a.md', file)
  rememberFile('/notes/b.md', file)
  rememberFile('/notes/a.md', file)
  assert.deepEqual(readHistory(file), ['/notes/a.md', '/notes/b.md'])
  fs.rmSync(file, { force: true })
})
