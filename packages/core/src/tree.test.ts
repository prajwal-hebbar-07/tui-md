import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { firstMarkdown } from './model.js'
import { createEntry, listTree, readTextFile, removeEntry, renameEntry, safePath } from './tree.js'

test('tree listing shows only markdown, hides ignored directories, and blocks path escape', () => {
  const scratch = path.join(path.dirname(fileURLToPath(import.meta.url)), '../.tmp')
  fs.mkdirSync(scratch, { recursive: true })
  const root = fs.mkdtempSync(path.join(scratch, 'tree-'))
  try {
    fs.mkdirSync(path.join(root, 'docs'))
    fs.mkdirSync(path.join(root, 'assets'))
    fs.mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true })
    fs.writeFileSync(path.join(root, 'README.md'), '# Hello\n')
    fs.writeFileSync(path.join(root, 'notes.yaml'), 'a: 1\n')
    fs.writeFileSync(path.join(root, 'docs', 'a.md'), 'docs\n')
    fs.writeFileSync(path.join(root, 'docs', 'flow.mmd'), 'graph TD\nA-->B\n')
    fs.writeFileSync(path.join(root, 'assets', 'mark.svg'), '<svg/>')
    fs.writeFileSync(path.join(root, 'node_modules', 'pkg', 'skip.md'), 'nope\n')
    const tree = listTree(root)
    const names = JSON.stringify(tree.nodes)
    assert.match(names, /README.md/)
    assert.match(names, /docs/)
    assert.match(names, /flow.mmd/)
    assert.doesNotMatch(names, /notes.yaml/)
    assert.doesNotMatch(names, /assets/)
    assert.doesNotMatch(names, /node_modules/)
    assert.equal(firstMarkdown(tree.nodes), 'README.md')
    assert.equal(safePath(root, '../secret'), null)
    assert.equal(safePath(root, '/etc/passwd'), null)
    const doc = readTextFile(root, 'README.md')
    assert.equal(doc.ok && doc.text, '# Hello\n')
    assert.equal(createEntry(root, 'empty', 'dir').ok, true)
    assert.doesNotMatch(JSON.stringify(listTree(root).nodes), /empty/)
    assert.match(JSON.stringify(listTree(root, { keepEmpty: true }).nodes), /empty/)
    assert.equal(createEntry(root, 'empty/note.md', 'file').ok, true)
    assert.equal(renameEntry(root, 'empty/note.md', 'empty/renamed.md').ok, true)
    assert.equal(readTextFile(root, 'empty/renamed.md').ok, true)
    assert.equal(removeEntry(root, 'empty').ok, true)
    assert.equal(readTextFile(root, 'empty/renamed.md').ok, false)
    assert.equal(createEntry(root, '../escape.md', 'file').ok, false)
    assert.equal(renameEntry(root, 'README.md', '../escape.md').ok, false)
    assert.equal(removeEntry(root, '../secret').ok, false)
    assert.equal(removeEntry(root, '').ok, false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
