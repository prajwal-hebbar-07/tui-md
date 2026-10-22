import assert from 'node:assert/strict'
import test from 'node:test'
import { renderMermaid } from './mermaid.js'

const flow = `
flowchart TD
    A[Scout the existing code:<br/>architecture notes, nearby code, tests] --> B[Short interview:<br/>outcome, acceptance criteria,<br/>and what is out of scope]
    B --> C[Solution sketch:<br/>one design, files touched,<br/>and a simplicity pass]
    C --> D{Fits the current architecture<br/>and takes at most five commits?}
    D -->|No| B
    D -->|Yes| E[Open a reviewed PR]
`

test('flowchart keeps the decision and the return edge', () => {
  const diagram = renderMermaid(flow, 100).join('\n')
  if (process.env.SHOW) console.log(diagram)
  assert.match(diagram, /Scout the existing code/)
  assert.match(diagram, /Short interview/)
  assert.match(diagram, /Solution sketch/)
  assert.match(diagram, /Fits the current architecture/)
  assert.match(diagram, /Open a reviewed PR/)
  assert.match(diagram, /No/)
  assert.match(diagram, /Yes/)
  assert.match(diagram, /▼/)
  assert.match(diagram, /◄/)
  const decision = diagram.indexOf('Fits the current architecture')
  const back = diagram.indexOf('No')
  assert.ok(decision !== -1 && back !== -1)
})

test('labeled arrow syntax and left-to-right graphs render', () => {
  const diagram = renderMermaid('flowchart LR\nA[Read] -- open --> B[Preview]\nB --> C[Done]', 80).join('\n')
  assert.match(diagram, /Read/)
  assert.match(diagram, /Preview/)
  assert.match(diagram, /open/)
  assert.match(diagram, /►/)
})

test('sequence, pie, and class diagrams stay readable', () => {
  const sequence = renderMermaid(
    'sequenceDiagram\nparticipant Editor\nparticipant Preview\nEditor->>Preview: open README.md\nPreview-->>Editor: rendered page',
    80,
  ).join('\n')
  assert.match(sequence, /Editor/)
  assert.match(sequence, /open README.md/)

  const pie = renderMermaid('pie showData\ntitle Time\n"Write" : 40\n"Review" : 60', 60).join('\n')
  assert.match(pie, /Write/)
  assert.match(pie, /40%|60%/)

  const classes = renderMermaid(
    'classDiagram\nclass Document {\n  +string path\n}\nDocument --> Diagram',
    60,
  ).join('\n')
  assert.match(classes, /Document/)
  assert.match(classes, /path/)
})

test('unknown diagrams keep their source', () => {
  const diagram = renderMermaid('sankey-beta\nA,B,10', 60).join('\n')
  assert.match(diagram, /sankey-beta/)
  assert.match(diagram, /desktop app/)
})
