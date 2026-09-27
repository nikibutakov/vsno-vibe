import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { registerPasteGuard } from './pasteGuard';
import { REF_SCHEME, ReferenceProvider } from './refProvider';
import { matchPercent } from './progress';
import * as sessionStore from './session';

const CTX_ACTIVE = 'vsnovibe.sessionActive';
const REFMAP_KEY = 'vsnovibe.refmap';

export function activate(context: vscode.ExtensionContext): void {
  const refProvider = new ReferenceProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(REF_SCHEME, refProvider)
  );
  refProvider.restore(context.workspaceState.get(REFMAP_KEY));

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.name = 'VS No Vibe';
  status.command = 'vsnovibe.chooseFile';
  context.subscriptions.push(status);

  let session: sessionStore.Session | undefined = sessionStore.load(context);
  let currentPercent: number | undefined;
  let progressTimer: ReturnType<typeof setTimeout> | undefined;
  let progressRetries = 0;

  const persist = () => sessionStore.save(context, session);
  const setActiveCtx = () => {
    void vscode.commands.executeCommand('setContext', CTX_ACTIVE, session !== undefined);
  };

  const sourcePath = (rel: string) => path.join(session!.sourceRoot, ...rel.split('/'));
  const targetPath = (rel: string) => path.join(session!.targetRoot, ...rel.split('/'));

  const isGuardedFile = (uri: vscode.Uri): boolean => {
    if (!session) {
      return false;
    }
    return uri.fsPath.startsWith(session.targetRoot + path.sep);
  };
  registerPasteGuard(context, isGuardedFile);

  const updateStatusBar = (): void => {
    if (!session) {
      status.hide();
      return;
    }
    const done = session.files.filter((f) => f.done).length;
    const pct = currentPercent === undefined ? '–' : `${currentPercent}%`;
    status.text = `$(pencil) ${pct} · ${done}/${session.files.length}`;
    const entry = session.current >= 0 ? session.files[session.current] : undefined;
    status.tooltip = entry
      ? `${entry.rel}\n${session.sourceRoot} → ${session.targetRoot}`
      : `${session.sourceRoot} → ${session.targetRoot}`;
    status.show();
  };

  const scheduleProgress = (delayMs = 400): void => {
    if (progressTimer) {
      clearTimeout(progressTimer);
    }
    progressTimer = setTimeout(() => {
      progressTimer = undefined;
      void recomputeProgress();
    }, delayMs);
  };
  context.subscriptions.push({
    dispose: () => {
      if (progressTimer) {
        clearTimeout(progressTimer);
      }
    },
  });

  const recomputeProgress = async (): Promise<void> => {
    if (!session || session.current < 0) {
      return;
    }
    const entry = session.files[session.current];
    const doc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === targetPath(entry.rel));
    if (!doc) {
      if (progressRetries < 3) {
        progressRetries += 1;
        scheduleProgress(700);
      }
      return;
    }
    progressRetries = 0;
    let reference: string;
    try {
      reference = fs.readFileSync(sourcePath(entry.rel), 'utf8');
    } catch {
      updateStatusBar();
      return;
    }
    currentPercent = matchPercent(reference, doc.getText());
    updateStatusBar();
    if (currentPercent === 100 && !entry.done) {
      entry.done = true;
      persist();
      updateStatusBar();
      void vscode.window
        .showInformationMessage(`"${entry.rel}" matches the reference — done ✍`, 'Next file')
        .then((choice) => {
          if (choice === 'Next file') {
            void vscode.commands.executeCommand('vsnovibe.nextFile');
          }
        });
    }
  };

  const openFile = async (index: number): Promise<void> => {
    if (!session || index < 0 || index >= session.files.length) {
      return;
    }
    session.current = index;
    persist();
    currentPercent = undefined;
    updateStatusBar();
    const entry = session.files[index];
    const target = vscode.Uri.file(targetPath(entry.rel));
    const ref = refProvider.createReference(sourcePath(entry.rel));
    void context.workspaceState.update(REFMAP_KEY, refProvider.toJSON());
    await vscode.commands.executeCommand('vscode.diff', target, ref, `${entry.rel} ✍`, { preview: true });
    try {
      await vscode.commands.executeCommand('workbench.action.compareEditor.focusPrimarySide');
    } catch {
      // focus command is best-effort
    }
    scheduleProgress();
  };

  const startSession = async (uri: vscode.Uri | undefined, kind: 'folder' | 'file'): Promise<void> => {
    if (session) {
      const go = await vscode.window.showWarningMessage(
        'A VS No Vibe session is already active. Drop it and start a new one?',
        'Start new'
      );
      if (go !== 'Start new') {
        return;
      }
    }
    let picked = uri;
    if (!picked) {
      const uris = await vscode.window.showOpenDialog({
        canSelectFolders: kind === 'folder',
        canSelectFiles: kind === 'file',
        canSelectMany: false,
        openLabel: 'Rewrite by hand',
      });
      if (!uris || uris.length !== 1) {
        return;
      }
      picked = uris[0];
    }
    const srcRoot = kind === 'folder' ? picked.fsPath : path.dirname(picked.fsPath);
    const suffix =
      vscode.workspace.getConfiguration('vsnovibe').get<string>('targetFolderSuffix') ?? '.handwritten';
    if (path.basename(srcRoot).endsWith(suffix)) {
      void vscode.window.showWarningMessage(
        `"${path.basename(srcRoot)}" looks like a handwritten mirror itself. Pick the original folder instead.`
      );
      return;
    }
    const targetRoot = sessionStore.resolveTargetRoot(srcRoot, suffix);
    if (sessionStore.samePath(srcRoot, targetRoot)) {
      void vscode.window.showErrorMessage('Source and target folders must differ.');
      return;
    }
    let rels = await sessionStore.scanSource(srcRoot, targetRoot);
    if (kind === 'file') {
      const rel = path.relative(srcRoot, picked.fsPath).split(path.sep).join('/');
      rels = rels.filter((r) => r === rel);
    }
    if (rels.length === 0) {
      void vscode.window.showWarningMessage(
        'No text files found to rewrite (binaries, dotfiles, lockfiles and huge files are skipped).'
      );
      return;
    }
    const created = await sessionStore.createMirror(targetRoot, rels);
    session = {
      sourceRoot: srcRoot,
      targetRoot,
      files: rels.map((rel) => ({ rel, done: false })),
      current: -1,
    };
    currentPercent = undefined;
    persist();
    setActiveCtx();
    updateStatusBar();
    await openFile(0);
    void vscode.window.showInformationMessage(
      `VS No Vibe: ${rels.length} file${rels.length === 1 ? '' : 's'} in the queue (${created} new empty cop${created === 1 ? 'y' : 'ies'}). Type in the left pane — the AI reference on the right is read-only.`
    );
  };

  const nextFile = async (): Promise<void> => {
    const s = session;
    if (!s) {
      return;
    }
    const n = s.files.length;
    for (let step = 1; step <= n; step++) {
      const idx = ((s.current + step) % n + n) % n;
      if (!s.files[idx].done) {
        await openFile(idx);
        return;
      }
    }
    void vscode.window
      .showInformationMessage('Every file in the queue is rewritten. No vibe left ✍🎉', 'End session')
      .then((choice) => {
        if (choice === 'End session') {
          void vscode.commands.executeCommand('vsnovibe.endSession');
        }
      });
  };

  const prevFile = async (): Promise<void> => {
    const s = session;
    if (!s) {
      return;
    }
    const idx = s.current <= 0 ? s.files.length - 1 : s.current - 1;
    await openFile(idx);
  };

  const chooseFile = async (): Promise<void> => {
    const s = session;
    if (!s) {
      return;
    }
    const items = s.files.map((f, i) => ({
      label: `${f.done ? '$(check)' : i === s.current ? '$(circle-filled)' : '$(circle-outline)'} ${f.rel}`,
      index: i,
    }));
    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: 'Rewriting queue — pick a file (✓ done, ● current)',
    });
    if (pick) {
      await openFile(pick.index);
    }
  };

  const markDone = async (): Promise<void> => {
    const s = session;
    if (!s || s.current < 0) {
      return;
    }
    const entry = s.files[s.current];
    if (entry.done) {
      return;
    }
    entry.done = true;
    persist();
    updateStatusBar();
    const nextIdx = s.files.findIndex((f, i) => i > s.current && !f.done);
    const buttons = nextIdx >= 0 ? ['Next file'] : [];
    void vscode.window
      .showInformationMessage(`"${entry.rel}" marked as done ✍`, ...buttons)
      .then((choice) => {
        if (choice === 'Next file' && nextIdx >= 0) {
          void openFile(nextIdx);
        }
      });
  };

  const endSession = async (): Promise<void> => {
    if (!session) {
      return;
    }
    const answer = await vscode.window.showWarningMessage(
      'End the VS No Vibe session? Your rewritten files stay on disk.',
      { modal: true },
      'End session'
    );
    if (answer !== 'End session') {
      return;
    }
    session = undefined;
    currentPercent = undefined;
    sessionStore.save(context, undefined);
    setActiveCtx();
    updateStatusBar();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('vsnovibe.startFolder', (uri?: vscode.Uri) => startSession(uri, 'folder')),
    vscode.commands.registerCommand('vsnovibe.startFile', (uri?: vscode.Uri) => startSession(uri, 'file')),
    vscode.commands.registerCommand('vsnovibe.nextFile', () => nextFile()),
    vscode.commands.registerCommand('vsnovibe.prevFile', () => prevFile()),
    vscode.commands.registerCommand('vsnovibe.chooseFile', () => chooseFile()),
    vscode.commands.registerCommand('vsnovibe.markDone', () => markDone()),
    vscode.commands.registerCommand('vsnovibe.endSession', () => endSession()),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (!session || session.current < 0 || e.contentChanges.length === 0) {
        return;
      }
      if (e.document.uri.fsPath !== targetPath(session.files[session.current].rel)) {
        return;
      }
      scheduleProgress();
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!session || session.current < 0) {
        return;
      }
      if (doc.uri.fsPath === targetPath(session.files[session.current].rel)) {
        void recomputeProgress();
      }
    })
  );

  if (session) {
    setActiveCtx();
    updateStatusBar();
    void vscode.window.showInformationMessage(
      'VS No Vibe session restored. Ctrl+Alt+O to pick a file, Ctrl+Alt+N for the next one.'
    );
  }
}
