export { renderMarkdownHtml, mermaidDocument } from './html.js'
export { markdownOutline, renderDocument, renderSource, type Heading } from './markdown.js'
export { renderMermaid } from './mermaid.js'
export { linesToAnsi, linesToPlain, sliceSpans, spanWidth, type Span } from './text.js'
export {
  ancestorDirs,
  bubbleGit,
  defaultExpanded,
  firstMarkdown,
  flattenFiles,
  isMarkdown,
  isMermaidFile,
  resolveRelative,
  visibleTree,
  type ReadResult,
  type TreeNode,
  type TreeResult,
} from './model.js'
export { contentType, gitChanges, listTree, readTextFile, safePath } from './tree.js'

export const VERSION = '0.1.0'
