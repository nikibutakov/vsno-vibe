**English** | [Русский](README.ru.md)

# VS No Vibe

**No vibe, just hands.** Retype AI-generated code by hand, file by file, with a read-only reference open side by side.

AI agents write code fast. Too fast. If you want a codebase you actually *understand* — and can maintain without asking the model what its own code does — there is an ancient technique: copywork. Read the reference, type every character yourself, and the code becomes yours.

VS No Vibe automates the boring parts of that workflow for VS Code.

<!-- TODO: add a screenshot/GIF of the diff view here -->

## How it works

1. Your agent generated a bunch of files (say, in `src/`). Right-click that folder in the Explorer → **VS No Vibe: Start Rewriting Folder…**
2. The extension scans it (skipping `node_modules`, binaries, lockfiles, dotfiles, huge files) and creates a mirror folder next to it — `src.handwritten/` — filled with **blank-line skeletons** of every file.
3. It opens a diff view: **your file on the left, the AI reference on the right (read-only)**.
4. You type. The status bar shows `✍ 42% · 3/12` — percent of reference lines retyped and files done. Real pasting is blocked; autocomplete works.
5. When your copy matches the reference, the file is marked done and you jump to the next one with `Ctrl+Alt+N`.

Nothing touches your original files — they only serve as the reference. Your rewritten files are normal files on disk.

## Commands

| Command | Keybinding | Description |
| --- | --- | --- |
| `VS No Vibe: Start Rewriting Folder…` | — | Pick a folder, create the mirror skeletons, open the first file |
| `VS No Vibe: Start Rewriting File…` | — | Same, for a single file |
| `VS No Vibe: Next File` | `Ctrl+Alt+N` | Jump to the next file that is not done yet |
| `VS No Vibe: Previous File` | `Ctrl+Alt+P` | Browse one file back |
| `VS No Vibe: Choose File…` | `Ctrl+Alt+O` | Quick pick with the whole queue (✓ done, ● current) |
| `VS No Vibe: Mark Current File as Done` | — | When you finished a file your own way |
| `VS No Vibe: End Session` | — | Drop the session (rewritten files stay on disk) |
| `VS No Vibe: Apply Calm Diff Colors` | — | Apply the calm diff palette (thin gutter strips) to your user settings |

All commands also appear in the context menu of files and folders in the Explorer.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `vsnovibe.targetFolderSuffix` | `.handwritten` | Suffix for the mirror folder. When the source folder is a workspace root, a `handwritten/` folder is created inside it instead. |
| `vsnovibe.exclude` | `node_modules`, `.git`, `dist`, … | File/folder names to skip while scanning. Dotfiles, binaries, lockfiles and minified files are always skipped. |
| `vsnovibe.typeableReference` | `true` | Show the reference with untypeable typography replaced: em dashes `—` → `-`, curly quotes → `'`/`"`, non-breaking spaces → spaces. What you see is what you can type, and the diff goes green when you finish a line. |
| `vsnovibe.skeletonLines` | `true` | Start your copy with as many blank lines as the reference has, instead of an empty file. Both diff panes stay the same length, so there is no striped filler under your text and the cursor never jumps on Enter. |
| `vsnovibe.maxExtraLines` | `5` | How many lines longer than the reference your copy may get. Extra blank lines beyond this budget are removed automatically ~0.4 s after you stop typing (content lines are never touched). |
| `vsnovibe.calmDiffColors` | `ask` | Offer calm diff colors on the first session: `ask`, `apply`, or `off`. |
| `vsnovibe.pasteBlock.enabled` | `true` | Block pasting into files being rewritten: inserts matching the clipboard are reverted. Autocomplete and snippets stay allowed. |
| `vsnovibe.pasteBlock.minChars` | `8` | Minimum length of a single insert that is checked against the clipboard. |

## Details worth knowing

- The reference pane is a **virtual read-only document** — you cannot accidentally edit the original.
- **Too much red/green?** The extension has you covered: on the first session it offers to apply calm colors (thin gutter strips + a faint tint on changed characters), or run *VS No Vibe: Apply Calm Diff Colors* anytime. Setting `vsnovibe.calmDiffColors` controls this (`ask`/`apply`/`off`); your own `diffEditor.*` customizations are never overwritten. To tune it by hand, add this to your user `settings.json` (*Preferences: Open User Settings (JSON)*):
  ```jsonc
  "workbench.colorCustomizations": {
    // full-line fills off
    "diffEditor.insertedLineBackground": "#00000000",
    "diffEditor.removedLineBackground": "#00000000",
    // faint tint inside changed characters
    "diffEditor.insertedTextBackground": "#2EA04320",
    "diffEditor.removedTextBackground": "#F8514920",
    // thin strips in the gutter
    "diffEditorGutter.insertedLineBackground": "#2EA043",
    "diffEditorGutter.removedLineBackground": "#F85149"
  }
  ```
- **The striped zone under your text** in the diff view is VS Code's filler for "beyond the end of the file" on the shorter side — clicking there clamps the cursor to the end of the document (that is why Enter seemed to "jump to the bottom"). Extensions cannot restyle it, so VS No Vibe removes the problem instead: with `vsnovibe.skeletonLines` on, both panes have the same number of lines and the filler is gone.
- "Done" is automatic when your file matches the reference line-for-line (lines are compared trimmed and dash/quote-normalized; blank lines don't count against you), or manual via *Mark as Done* when you deliberately restructured the code.
- Progress = longest common subsequence of non-blank lines, reference vs your file. Files over 5000 lines show `–`.
- The session survives window reloads; use *Choose File…* to reopen a diff.
- Existing mirror files with content are never overwritten; brand-empty copies get the skeleton filled in when you (re)start a session.

## Install (from source)

Requires Node.js 18+.

```bash
git clone <this-repo>
cd vsno-vibe
npm install
npm run package          # → dist/extension.js
npx @vscode/vsce package # → vsno-vibe-x.y.z.vsix
code --install-extension vsno-vibe-x.y.z.vsix
```

For development: open the folder in VS Code and press `F5` (Extension Development Host).
End-to-end smoke test: `npm run smoke` — runs the extension in a clean VS Code against a fixture folder (downloads a fresh build into `.vscode-test/` on first run).

Works in VS Code, Cursor, VSCodium and other VS Code-compatible editors.

## Roadmap

- [ ] Publish to the VS Code Marketplace / Open VSX
- [ ] "By memory" mode: hide the reference until you ask to compare
- [ ] Per-file percent in the file picker
- [ ] Unit tests for `progress.ts` / `session.ts`
- [ ] Optional stricter mode: block autocomplete inserts too

## License

MIT (see the LICENSE file in this repository).
