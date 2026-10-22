# tui-md

A markdown viewer in two shells: a terminal layout modeled on the VS Code explorer and preview, and a desktop window that renders Mermaid for real.

```
apps/cli        terminal viewer
apps/desktop    desktop viewer
packages/core   file tree, markdown, and diagram layout
examples        sample notes
```

## Run

```bash
pnpm install
pnpm test
pnpm dev:cli -- examples
pnpm dev:desktop
```

`pnpm dev:desktop` opens the sample notes. Use **Open Folder** for another directory. In the browser preview at `http://127.0.0.1:5173`, the sample folder is already open.

After a build:

```bash
pnpm build
pnpm --filter @tui-md/cli exec tui-md examples
pnpm start:desktop
```

Print one file without the full-screen UI:

```bash
pnpm --filter @tui-md/cli exec tui-md --dump examples/README.md
```

## Keys in the terminal

| Key | Action |
| --- | --- |
| ↑↓ or j k | Move in the tree, or scroll the preview |
| ← → or h l | Collapse, expand, or pan a wide diagram |
| tab | Switch between the tree and the preview |
| s | Toggle preview and source |
| / | Filter files |
| q | Quit |

The desktop window uses the file tree, **Cmd/Ctrl+P** to jump to a file, and **Cmd/Ctrl+O** to open a folder. Preview is read-only.

## Diagrams

The desktop app renders every diagram Mermaid supports. The terminal lays out flowcharts, sequence, class, state, ER, pie, gantt, journey, mindmap, timeline, git, xy, and quadrant diagrams. Other types keep their source and a note to open the desktop app.

## License

MIT
