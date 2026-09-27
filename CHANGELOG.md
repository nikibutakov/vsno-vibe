# Changelog

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
