# Changelog

## 0.2.0 — 2026-09-28

- **Typeable reference**: the read-only pane shows em dashes as `-`, curly quotes as `'`/`"`, non-breaking spaces as regular spaces — everything the AI wrote is now typeable (setting `vsnovibe.typeableReference`). Progress matching uses the same normalization.
- **Skeleton instead of empty files**: your copy starts with as many blank lines as the reference (setting `vsnovibe.skeletonLines`). Both diff panes stay the same length — no striped filler zone under your text and no more cursor jumps on Enter. Existing empty copies get the skeleton too; files with content are never touched.
- **Fix**: progress is now scored over non-blank reference lines — files containing blank lines could never reach 100% before, so auto-done never fired for them.

## 0.1.0 — 2026-09-27

Initial release.

- Start rewriting a folder or a single file by hand (Explorer context menu or Command Palette)
- Mirror folder with empty copies of every rewriteable file; originals are never touched
- Diff view: your file on the left, read-only AI reference on the right
- Paste blocking with revert + warning (configurable threshold)
- Progress in the status bar: % of reference lines retyped (LCS), files done / total
- Automatic "done" at 100% match, manual *Mark as Done*
- File navigation: Next/Previous, QuickPick queue with ✓/● markers
- Session survives window reloads
