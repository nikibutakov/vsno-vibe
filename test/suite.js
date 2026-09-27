// Executed inside the VS Code extension host by runSmoke.js.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

const REF_A = `// Reference file the agent "generated".
export function add(a: number, b: number): number {
  return a + b;
}

export interface Point {
  x: number;
  y: number;
}
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Emulates real typing: inserts in chunks small enough to pass the paste guard. */
async function typeChunks(doc, text) {
  let typed = 0;
  while (typed < text.length) {
    const chunk = text.slice(typed, typed + 5);
    typed += chunk.length;
    const edit = new vscode.WorkspaceEdit();
    edit.insert(doc.uri, doc.positionAt(doc.getText().length), chunk);
    const ok = await vscode.workspace.applyEdit(edit);
    assert.ok(ok, 'applyEdit failed while typing');
  }
}

async function activeDiffOriginalName() {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (!tab || !(tab.input instanceof vscode.TabInputTextDiff)) {
    return undefined;
  }
  return path.basename(tab.input.original.fsPath);
}

async function run() {
  const ws = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const srcFolder = path.join(ws, 'ai-output');
  const mirror = path.join(ws, 'ai-output.handwritten');

  // 1. Start a session over the fixture folder.
  await vscode.commands.executeCommand('vsnovibe.startFolder', vscode.Uri.file(srcFolder));

  // 2. The mirror contains empty text copies, skipping binaries and dotfiles.
  assert.ok(fs.existsSync(path.join(mirror, 'a.ts')), 'mirror a.ts was not created');
  assert.ok(fs.existsSync(path.join(mirror, 'nested', 'b.js')), 'nested mirror b.js was not created');
  assert.strictEqual(fs.readFileSync(path.join(mirror, 'a.ts'), 'utf8'), '', 'a.ts should start empty');
  assert.ok(!fs.existsSync(path.join(mirror, 'logo.png')), 'binary file should be skipped');
  assert.ok(!fs.existsSync(path.join(mirror, '.hidden')), 'dotfile should be skipped');

  // 3. The diff editor opened on a.ts.
  assert.strictEqual(await activeDiffOriginalName(), 'a.ts', 'diff editor did not open on a.ts');

  const doc = await vscode.workspace.openTextDocument(path.join(mirror, 'a.ts'));

  // 4. Paste guard: a large insert gets reverted.
  const paste = new vscode.WorkspaceEdit();
  paste.insert(doc.uri, new vscode.Position(0, 0), REF_A);
  await vscode.workspace.applyEdit(paste);
  await sleep(500);
  assert.strictEqual(doc.getText(), '', 'paste guard did not revert a large insert');

  // 5. Typing in small chunks survives and reaches a 100% match.
  await typeChunks(doc, REF_A);
  await sleep(1500);
  const normalized = doc.getText().replace(/\r\n/g, '\n');
  assert.strictEqual(normalized, REF_A, 'chunked typing did not produce the reference content');

  // 6. a.ts auto-completed at 100%, so "next file" opens nested/b.js.
  await vscode.commands.executeCommand('vsnovibe.nextFile');
  await sleep(500);
  assert.strictEqual(await activeDiffOriginalName(), 'b.js', 'nextFile did not move to b.js (was a.ts auto-marked done?)');

  console.log('ALL SMOKE ASSERTIONS PASSED');
}

module.exports = { run };
