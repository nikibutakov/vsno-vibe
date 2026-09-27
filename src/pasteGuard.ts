import * as vscode from 'vscode';

/**
 * Reverts any single large edit inside files being rewritten, so the only way
 * to get the code onto the page is to type it. Covers Ctrl+V, context-menu
 * paste, middle-click paste and big autocomplete inserts alike.
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
      if (e.contentChanges.length !== 1 || !isGuardedFile(e.document.uri)) {
        return;
      }
      const change = e.contentChanges[0];
      const minChars = cfg.get<number>('minChars') ?? 8;
      if (change.text.length < minChars) {
        return;
      }
      const doc = e.document;
      const from = doc.positionAt(change.rangeOffset);
      const to = doc.positionAt(change.rangeOffset + change.text.length);
      const revert = new vscode.WorkspaceEdit();
      revert.delete(doc.uri, new vscode.Range(from, to));
      await vscode.workspace.applyEdit(revert);
      void vscode.window.showWarningMessage('No vibe, just hands — paste is blocked while rewriting. Type it out ✍');
    })
  );
}
