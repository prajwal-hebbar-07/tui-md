import MarkdownIt from 'markdown-it'

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type HtmlOptions = {
  rewriteImage?: (src: string) => string
}

const md = new MarkdownIt({ html: false, linkify: true, breaks: false })

md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const count = Number(env.headingCount || 0)
  env.headingCount = count + 1
  tokens[idx].attrSet('id', `h-${count}`)
  return self.renderToken(tokens, idx, options)
}

const linkOpen = md.renderer.rules.link_open
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank')
  tokens[idx].attrSet('rel', 'noreferrer')
  if (linkOpen) return linkOpen(tokens, idx, options, env, self)
  return self.renderToken(tokens, idx, options)
}

md.renderer.rules.image = (tokens, idx, _options, env) => {
  const token = tokens[idx]
  const src = token.attrGet('src') || ''
  const alt = token.content || ''
  const href = env.rewriteImage && !/^(https?:|data:|mailto:)/i.test(src) ? env.rewriteImage(src) : src
  return `<img src="${esc(href)}" alt="${esc(alt)}" />`
}

md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  const lang = token.info.trim().split(/\s+/)[0] || ''
  if (lang === 'mermaid') {
    return `<div class="diagram"><div class="diagram-bar"><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-zoom="out" aria-label="Zoom out">−</button><button type="button" data-zoom="reset" aria-label="Reset zoom">↺</button></div><div class="diagram-canvas"><pre class="mermaid">${esc(token.content)}</pre></div></div>`
  }
  const cls = lang ? ` class="language-${esc(lang)}"` : ''
  return `<pre class="hljs"><code${cls}>${esc(token.content)}</code></pre>`
}

export function renderMarkdownHtml(src: string, options: HtmlOptions = {}): string {
  const env: Record<string, unknown> = {
    headingCount: 0,
    rewriteImage: options.rewriteImage,
  }
  return `<div class="markdown-body">${md.render(src, env)}</div>`
}

export function mermaidDocument(src: string): string {
  return `<div class="markdown-body"><div class="diagram"><div class="diagram-bar"><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-zoom="out" aria-label="Zoom out">−</button><button type="button" data-zoom="reset" aria-label="Reset zoom">↺</button></div><div class="diagram-canvas"><pre class="mermaid">${esc(src)}</pre></div></div></div>`
}
