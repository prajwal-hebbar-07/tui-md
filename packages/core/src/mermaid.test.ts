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

const architecture = `
flowchart LR
    subgraph Browser
        SPA["React SPA<br/>SsoLoginProvider · AuthCallbackPage"]
    end
    subgraph Backend["Lyik backend"]
        EP["/v1/auth/login-url<br/>/v1/auth/callback"]
        Plugin["Okta SSO plugin<br/>client ID · client secret"]
    end
    Okta["Okta (Auth0)<br/>hosted login"]
    SPA -- "public client" --> EP
    EP --> Plugin
    Plugin <-- "OIDC code exchange" --> Okta
    SPA -. "redirect to login_url" .-> Okta
    Okta -. "redirect to /auth/callback" .-> SPA
`

test('flowchart keeps the decision and routes the return edge', () => {
  const diagram = renderMermaid(flow, 100).join('\n')
  if (process.env.SHOW) console.log(diagram)
  for (const text of ['Scout the existing code', 'Short interview', 'Solution sketch', 'Fits the current architecture', 'Open a reviewed PR']) {
    assert.match(diagram, new RegExp(text))
  }
  assert.match(diagram, /No/)
  assert.match(diagram, /Yes/)
  assert.match(diagram, /▼/)
  assert.match(diagram, /▲/)
  assert.doesNotMatch(diagram, /↺/)
})

test('labeled arrow syntax and left-to-right graphs render', () => {
  const diagram = renderMermaid('flowchart LR\nA[Read] -- open --> B[Preview]\nB --> C[Done]', 80).join('\n')
  assert.match(diagram, /Read/)
  assert.match(diagram, /Preview/)
  assert.match(diagram, /─ open ─/)
  assert.match(diagram, /►/)
})

test('quoted labels, subgraphs, and dotted or two-way edges render', () => {
  const lines = renderMermaid(architecture, 120)
  const diagram = lines.join('\n')
  if (process.env.SHOW) console.log(diagram)
  assert.doesNotMatch(diagram, /"/)
  assert.match(diagram, /┌─ Browser ─/)
  assert.match(diagram, /┌─ Lyik backend ─/)
  for (const label of ['public client', 'OIDC code exchange', 'redirect to login_url', 'redirect to /auth/callback']) {
    assert.match(diagram, new RegExp(` ${label.replace(/\//g, '\\/')} `))
  }
  assert.match(diagram, /┄/)
  assert.doesNotMatch(diagram, /↺/)
  const spa = lines.find((line) => line.includes('React SPA'))!
  assert.ok(!/redirect/.test(spa.slice(0, spa.indexOf('React SPA'))), 'labels stay off the boxes')
})

test('flowchart edge operators and grouped nodes', () => {
  const diagram = renderMermaid('graph TD\nA & B --> C\nC ==> D\nD --o E\nE --x F\nF -.- G\nG ~~~ H', 100).join('\n')
  for (const id of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) assert.match(diagram, new RegExp(`│ ${id} │`))
  assert.match(diagram, /┃/)
  assert.match(diagram, /●/)
  assert.match(diagram, /×/)
  assert.match(diagram, /┆/)
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