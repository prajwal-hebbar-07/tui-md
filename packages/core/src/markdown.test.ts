import assert from 'node:assert/strict'
import test from 'node:test'
import { renderMarkdownHtml } from './html.js'
import { layoutDocument, markdownOutline, renderDocument } from './markdown.js'
import { linesToPlain } from './text.js'

const source = `---
title: demo
---

# Viewer

A paragraph with **bold** and \`code\`.

- [ ] unread
- [x] read

| Name | Kind |
| --- | --- |
| README | markdown |

> A quoted line

\`\`\`ts
const n = 1
\`\`\`

\`\`\`mermaid
flowchart TD
  A[Start<br/>here] --> B{Ready?}
  B -->|Yes| C[Ship]
\`\`\`
`

test('markdown preview keeps structure and renders mermaid', () => {
  const text = linesToPlain(renderDocument(source, 72))
  assert.match(text, /Viewer/)
  assert.match(text, /bold/)
  assert.match(text, /☐/)
  assert.match(text, /☑/)
  assert.match(text, /README/)
  assert.match(text, /quoted line/)
  assert.match(text, /const n = 1/)
  assert.match(text, /Start/)
  assert.match(text, /Ready/)
  assert.doesNotMatch(text, /title: demo/)
  const laid = layoutDocument(source, 72)
  const heading = laid.headings[0]
  assert.equal(heading?.text, 'Viewer')
  assert.match(laid.lines[heading.line].map((span) => span.text).join(''), /Viewer/)
})

test('html preview marks headings and mermaid blocks', () => {
  const html = renderMarkdownHtml(source, {
    rewriteImage: (src) => `/api/asset?path=${src}`,
  })
  assert.match(html, /id="h-0"/)
  assert.match(html, /class="mermaid"/)
  assert.match(html, /Start/)
  assert.match(html, /&lt;/)
  assert.doesNotMatch(html, /<script/i)
  assert.deepEqual(markdownOutline(source), [{ id: 'h-0', depth: 1, text: 'Viewer' }])
})
