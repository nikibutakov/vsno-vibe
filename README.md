# VS No Vibe

**No vibe, just hands.** Retype AI-generated code by hand, file by file, with a read-only reference open side by side.

AI agents write code fast. Too fast. If you want a codebase you actually *understand* — and can maintain without asking the model what its own code does — there is an ancient technique: copywork. Read the reference, type every character yourself, and the code becomes yours.

VS No Vibe automates the boring parts of that workflow for VS Code.

<!-- TODO: add a screenshot/GIF of the diff view here -->

## How it works

1. Your agent generated a bunch of files (say, in `src/`). Right-click that folder in the Explorer → **VS No Vibe: Start Rewriting Folder…**
2. The extension scans it (skipping `node_modules`, binaries, lockfiles, dotfiles, huge files) and creates a mirror folder next to it — `src.handwritten/` — filled with **empty** copies of every file.
3. It opens a diff view: **your empty file on the left, the AI reference on the right (read-only)**.
4. You type. The status bar shows `✍ 42% · 3/12` — percent of reference lines retyped and files done. Paste is blocked.
5. When your copy matches the reference, the file is marked done and you jump to the next one with `Ctrl+Alt+N`.

Nothing touches your original files — they only serve as the reference. Your rewritten files are normal files on disk.

## Commands

| Command | Keybinding | Description |
| --- | --- | --- |
| `VS No Vibe: Start Rewriting Folder…` | — | Pick a folder, create the empty mirror, open the first file |
| `VS No Vibe: Start Rewriting File…` | — | Same, for a single file |
| `VS No Vibe: Next File` | `Ctrl+Alt+N` | Jump to the next file that is not done yet |
| `VS No Vibe: Previous File` | `Ctrl+Alt+P` | Browse one file back |
| `VS No Vibe: Choose File…` | `Ctrl+Alt+O` | Quick pick with the whole queue (✓ done, ● current) |
| `VS No Vibe: Mark Current File as Done` | — | When you finished a file your own way |
| `VS No Vibe: End Session` | — | Drop the session (rewritten files stay on disk) |

All commands also appear in the context menu of files and folders in the Explorer.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `vsnovibe.targetFolderSuffix` | `.handwritten` | Suffix for the mirror folder. When the source folder is a workspace root, a `handwritten/` folder is created inside it instead. |
| `vsnovibe.exclude` | `node_modules`, `.git`, `dist`, … | File/folder names to skip while scanning. Dotfiles, binaries, lockfiles and minified files are always skipped. |
| `vsnovibe.pasteBlock.enabled` | `true` | Block pasting into files being rewritten (the inserted text is reverted). |
| `vsnovibe.pasteBlock.minChars` | `8` | Minimum length of a single insert that counts as a paste. Note: this also blocks long autocomplete/snippet inserts — that is the spirit of the tool. |

## Details worth knowing

- The reference pane is a **virtual read-only document** — you cannot accidentally edit the original.
- "Done" is automatic when your file matches the reference line-for-line (lines are compared trimmed, so indentation slips don't hurt), or manual via *Mark as Done* when you deliberately restructured the code.
- Progress = longest common subsequence of lines, reference vs your file. Files over 5000 lines show `–`.
- The session survives window reloads; use *Choose File…* to reopen a diff.
- Existing files in the mirror folder are never overwritten — your work is safe.

## Install (from source)

Requires Node.js 18+.

```bash
git clone <this-repo>
cd vsno-vibe
npm install
npm run package          # → dist/extension.js
npx @vscode/vsce package # → vsno-vibe-0.1.0.vsix
code --install-extension vsno-vibe-0.1.0.vsix
```

For development: open the folder in VS Code and press `F5` (Extension Development Host).

Works in VS Code, Cursor, VSCodium and other VS Code-compatible editors.

## На русском

**No vibe, just hands.** Переписывай сгенерированный нейросетью код руками, файл за файлом: слева — твой пустой файл, справа — эталон от ИИ (только для чтения).

1. Агент нагенерировал файлов в папке → ПКМ по папке в Explorer → **VS No Vibe: Start Rewriting Folder…**
2. Расширение создаст рядом зеркало `имя-папки.handwritten/` с **пустыми** копиями всех текстовых файлов и откроет diff первого.
3. Печатаешь слева руками. Вставка (Ctrl+V) блокируется. Статус-бар показывает прогресс: `✍ 42% · 3/12` — процент переписанных строк эталона и число готовых файлов.
4. Файл совпал с эталоном — отмечается ✓ и переносит к следующему (`Ctrl+Alt+N`). Оригиналы ИИ-файлов не изменяются, твои копии — обычные файлы на диске.

Все команды доступны в контекстном меню файлов и папок. Настройки — по префиксу `vsnovibe.` (имя зеркальной папки, исключения при сканировании, блокировка вставки).

## Roadmap

- [ ] Publish to the VS Code Marketplace / Open VSX
- [ ] "By memory" mode: hide the reference until you ask to compare
- [ ] Per-file percent in the file picker
- [ ] Unit tests for `progress.ts` / `session.ts`
- [ ] Optional stricter mode: block autocomplete inserts too

## License

MIT (see the LICENSE file in this repository).
