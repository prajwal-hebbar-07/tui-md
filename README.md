# tui-md

A markdown viewer in two shells: a terminal layout modeled on the VS Code explorer and preview, and a desktop window that renders Mermaid for real.

```
apps/cli        terminal viewer, published as tui-md-viewer (command: tui-md)
apps/desktop    desktop viewer (Electron)
packages/core   file tree, markdown, and diagram layout
examples        sample notes
Formula         Homebrew formula
```

## Install

Homebrew:

```bash
brew tap prajwal-hebbar-07/tui-md https://github.com/prajwal-hebbar-07/tui-md
brew install tui-md
```

npm (Node 22 or newer):

```bash
npm install -g tui-md-viewer
```

GitHub Packages publishes the same CLI as `@prajwal-hebbar-07/tui-md`. GitHub's npm registry asks for a token even for public packages, so log in once with a personal access token that has `read:packages`:

```bash
npm login --scope=@prajwal-hebbar-07 --auth-type=legacy --registry=https://npm.pkg.github.com
npm install -g @prajwal-hebbar-07/tui-md
```

The desktop app is on the [Releases](https://github.com/prajwal-hebbar-07/tui-md/releases) page as a `.dmg` (macOS), `.exe` (Windows), and `.AppImage` (Linux). The builds are not code-signed. On macOS, clear the download flag after moving the app to Applications:

```bash
xattr -dr com.apple.quarantine /Applications/tui-md.app
```

Then run `tui-md` in a folder of notes to pick a file, or `tui-md path/to/file.md` to open that file. The picker lists only markdown (`.md`, `.mdx`) and Mermaid (`.mmd`) files, and hides folders that contain none.

## Develop

```bash
pnpm install
pnpm test
pnpm dev
pnpm dev:cli -- examples
```

`pnpm dev` opens the desktop app on the sample notes. Use **Open Folder** for another directory. In the browser preview at `http://127.0.0.1:5173`, the sample folder is already open.

Print one file without the full-screen UI:

```bash
pnpm build
node apps/cli/dist/cli.js --dump examples/README.md
```

## Install locally and test

Run the same checks as CI:

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

Install the CLI from the same tarball that npm and Homebrew receive:

```bash
(cd apps/cli && pnpm pack --pack-destination /tmp)
npm install -g /tmp/tui-md-viewer-0.1.0.tgz
tui-md --version
tui-md examples
npm uninstall -g tui-md-viewer
```

Test the Homebrew formula against that tarball in a throwaway tap:

```bash
brew tap-new "$USER/local"
TAP="$(brew --repository "$USER/local")"
cp Formula/tui-md.rb "$TAP/Formula/"
SHA="$(shasum -a 256 /tmp/tui-md-viewer-0.1.0.tgz | cut -d' ' -f1)"
sed -i '' -e 's|^  url .*|  url "file:///tmp/tui-md-viewer-0.1.0.tgz"|' -e "s|^  sha256 .*|  sha256 \"$SHA\"|" "$TAP/Formula/tui-md.rb"
brew install "$USER/local/tui-md"
brew test "$USER/local/tui-md"
tui-md examples
brew uninstall tui-md && brew untap "$USER/local"
```

Build the desktop installers for your platform into `apps/desktop/release`:

```bash
pnpm dist:desktop
```

## Release

Every push and pull request runs `.github/workflows/ci.yml`, which tests, typechecks, builds, installs the packed CLI, and packages the desktop app.

Pushing a `v*.*.*` tag runs `.github/workflows/release.yml`:

1. Checks that the tag matches the version in `apps/cli/package.json`, runs the tests, and packs the CLI.
2. Publishes `tui-md-viewer` to npm and `@prajwal-hebbar-07/tui-md` to GitHub Packages.
3. Builds the desktop app on macOS, Windows, and Linux.
4. Creates a GitHub release with the CLI tarball and the desktop installers.
5. Points `Formula/tui-md.rb` at the new tarball and commits that to `main`.

One-time setup: create an npm granular access token that can publish, then save it as a repository secret.

```bash
gh secret set NPM_TOKEN --repo prajwal-hebbar-07/tui-md
```

After the first publish you can switch to npm trusted publishing (package settings on npmjs.com, workflow `release.yml`) and delete the secret.

To cut a release:

```bash
cd apps/cli && npm version 0.1.1 --no-git-tag-version && cd ../..
git commit -am "chore: release 0.1.1"
git tag v0.1.1
git push origin main v0.1.1
```

## Keys in the terminal

Reading a file is the whole screen. There is no sidebar. `tui-md` with no path opens a fuzzy picker of the markdown files. `tui-md notes.md` opens that file.

| Key | Action |
| --- | --- |
| j k or ↑↓ | Scroll one line. A count repeats it: `5j` |
| h l or ←→ | Pan one column. `0` and `$` jump to the start and end |
| ctrl-d ctrl-u | Half page down and up |
| ctrl-f ctrl-b or d u | Full page down and up |
| gg G | Top and bottom. `12G` or `:12` goes to that line |
| { } | Previous and next paragraph |
| J K | Previous and next heading |
| / | Find in the open file. `n` and `N` move through matches |
| ctrl-p | Fuzzy file picker. Type to filter, enter opens, arrows or ctrl-j ctrl-k move |
| H | Recent files |
| w | Watch the file and reload on save |
| r | Reload now |
| ctrl-e | Open the file in `$EDITOR` |
| s | Toggle preview and source |
| q or :q | Quit |

`tui-md --history` and `tui-md --last` use the recent-file list in `~/.config/tui-md/history`. `tui-md --watch file.md` reloads when that file is saved. `tui-md --inline` prints one file and exits, which is the same idea as `--dump`. A pipe works too: `cat notes.md | tui-md`.

The desktop window opens on the document, with the outline in the sidebar. **Files** or **Cmd/Ctrl+P** jumps to a file, **Recent** or **H** opens files you have already read, and **Cmd/Ctrl+O** opens a folder. The open file reloads when it changes on disk. Preview is read-only.

## Diagrams

The desktop app renders every diagram Mermaid supports. The terminal lays out flowcharts, sequence, class, state, ER, pie, gantt, journey, mindmap, timeline, git, xy, and quadrant diagrams. Other types keep their source and a note to open the desktop app.

## License

MIT
