import { visibleTree, type TreeNode } from '@tui-md/core'
import { Chevron, FileIcon, FolderIcon } from './icons'

export function Tree({
  nodes,
  depth,
  expanded,
  selected,
  git,
  onToggle,
  onOpen,
}: {
  nodes: TreeNode[]
  depth: number
  expanded: ReadonlySet<string>
  selected: string
  git: Record<string, string>
  onToggle: (path: string) => void
  onOpen: (path: string) => void
}) {
  const rows = visibleTree(nodes, expanded)
  return (
    <>
      {rows.map(({ node, depth: rowDepth }) => {
        const open = node.kind === 'dir' && expanded.has(node.path)
        const badge = git[node.path]
        return (
          <div
            key={node.path}
            className={node.path === selected ? 'tree-row active' : 'tree-row'}
            style={{ paddingLeft: 8 + (rowDepth + depth) * 14 }}
            onClick={() => (node.kind === 'dir' ? onToggle(node.path) : onOpen(node.path))}
          >
            {node.kind === 'dir' ? <Chevron open={open} /> : <span className="chev-spacer" />}
            {node.kind === 'dir' ? <FolderIcon open={open} /> : <FileIcon name={node.name} />}
            <span className="name">{node.name}</span>
            {badge ? <span className={`badge badge-${badge}`}>{badge}</span> : null}
          </div>
        )
      })}
    </>
  )
}
