# tui-md

Markdown and Mermaid viewer with two shells over one core library. pnpm workspace (`pnpm-workspace.yaml`), Node >= 22, ESM everywhere, TypeScript `strict` (`tsconfig.base.json`).

## Layout

| Path | What |
| --- | --- |
| `packages/core` (`@tui-md/core`) | File tree, markdown rendering, Mermaid layout, recent-file history. Built with `tsc` to `dist/`; both apps import the built output. |
| `apps/cli` (`tui-md-viewer`, command `tui-md`) | Terminal viewer (Ink + React), bundled with esbuild to `dist/cli.js`. |
| `apps/desktop` (`@tui-md/desktop`) | Electron viewer. Renderer: React + Vite in `src/`. Main process: `electron/main.js`, bundled to `electron/main.bundle.mjs`. Preload: `electron/preload.cjs`. |
| `examples` | Sample notes; the desktop dev server and CI smoke test read them. |
| `Formula` | Homebrew formula; the release workflow rewrites it. |

## Commands (run from the repo root)

| Purpose | Command |
| --- | --- |
| Install | `pnpm install` |
| Test | `pnpm test` (core only: `node --test` via `tsx` over `packages/core/src/*.test.ts`) |
| Typecheck | `pnpm typecheck` (builds core, then `tsc` for cli and desktop) |
| Build | `pnpm build` |
| Desktop dev | `pnpm dev` (Vite on `127.0.0.1:5173` + Electron) |
| Desktop in a browser | `pnpm --filter ./apps/desktop preview`, then open `http://127.0.0.1:5173` (the `examples` folder is already open) |
| CLI dev | `pnpm dev:cli -- examples` |
| Desktop installers | `pnpm dist:desktop` |

There is no lint script and no E2E suite. CI (`.github/workflows/ci.yml`) runs `pnpm test`, `pnpm typecheck`, `pnpm build`, a packed-CLI smoke test, and an unpacked Linux desktop package.

## Desktop app conventions

- The renderer reaches the filesystem only through `api()` in `apps/desktop/src/api.ts`: `window.tuiMd` (preload bridge) in Electron, else the HTTP fallback served by the `fileApi()` Vite plugin in `apps/desktop/vite.config.ts`.
- A new filesystem operation needs all four: an `ipcMain.handle` in `electron/main.js`, the bridge entry in `electron/preload.cjs`, the `Api` type and browser fallback in `src/api.ts`, and the `/api/*` route in `vite.config.ts`.
- Existing operations: `root`, `tree`, `git`, `read`, `create` (file or dir), `rename`, `remove`, `open-folder`, `open-diagram`, `diagram-source`.
- Paths crossing the bridge are relative to the open root.
- Icons live in `src/icons.tsx`; styles in `src/styles.css`. Reuse them before adding new ones.

## Working rules

- Put shared logic in `packages/core` with a `*.test.ts` next to it and add the file to the `test` script in `packages/core/package.json`; the apps have no test runner.
- Do not hand-edit generated output: `dist/`, `apps/desktop/electron/main.bundle.mjs`, `apps/desktop/release/`.
- Keep `README.md` current when user-visible behaviour (keys, buttons, commands) changes.
- Commit messages are Conventional Commits (`feat:`, `fix:`, `chore:`).
