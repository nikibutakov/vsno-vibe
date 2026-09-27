import * as vscode from 'vscode';

/**
 * Reverts real pastes inside files being rewritten, so the only way to get
 * the code onto the page is to type it. An insert counts as a paste only when
 * it matches the clipboard — autocomplete suggestions and snippets (which also
 * insert more than minChars in one go) are typing aids and stay allowed.
 */
export function registerPasteGuard(
  context: vscode.ExtensionContext,
  isGuardedFile: (uri: vscode.Uri) => boolean
): void {
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(async (e) => {
      const cfg = vscode.workspace.getConfiguration('vsnovibe.pasteBlock');
      if (cfg.get('enabled') !== true) {
        return;
      }
      if (!isGuardedFile(e.document.uri)) {
        return;
      }
      const minChars = cfg.get<number>('minChars') ?? 8;
      const suspects = e.contentChanges.filter((c) => c.text.length >= minChars);
      if (suspects.length === 0) {
        return;
      }
      let clipboard: string;
      try {
        clipboard = await vscode.env.clipboard.readText();
      } catch {
        return;
      }
      const pasted = suspects.filter(
        (c) => c.text.trim().length > 0 && c.text.trim() === clipboard.trim()
      );
      if (pasted.length === 0) {
        return; // autocomplete/snippet insert, not a paste
      }
      const doc = e.document;
      const revert = new vscode.WorkspaceEdit();
      for (const change of [...pasted].sort((a, b) => b.rangeOffset - a.rangeOffset)) {
        const from = doc.positionAt(change.rangeOffset);
        const to = doc.positionAt(change.rangeOffset + change.text.length);
        revert.delete(doc.uri, new vscode.Range(from, to));
      }
      await vscode.workspace.applyEdit(revert);
      void vscode.window.showWarningMessage('No vibe, just hands — paste is blocked while rewriting. Type it out ✍');
    })
  );
}
