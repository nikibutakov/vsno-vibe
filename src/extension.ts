import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { registerPasteGuard } from './pasteGuard';
import { REF_SCHEME, ReferenceProvider } from './refProvider';
import { matchPercent, splitLines } from './progress';
import * as sessionStore from './session';

const CTX_ACTIVE = 'vsnovibe.sessionActive';
const REFMAP_KEY = 'vsnovibe.refmap';

/** Calm diff colors: thin gutter strips instead of full-line red/green fills. */
const CALM_COLORS: Record<string, string> = {
  'diffEditor.insertedLineBackground': '#00000000',
  'diffEditor.removedLineBackground': '#00000000',
  'diffEditor.insertedTextBackground': '#2EA04320',
  'diffEditor.removedTextBackground': '#F8514920',
  'diffEditorGutter.insertedLineBackground': '#2EA043',
  'diffEditorGutter.removedLineBackground': '#F85149',
};

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
  let refTotalLines: number | undefined;
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

  const calmDecided = { value: context.globalState.get<boolean>('vsnovibe.calmColorsDecided', false) };
  const markCalmDecided = () => {
    calmDecided.value = true;
    void context.globalState.update('vsnovibe.calmColorsDecided', true);
  };
  const hasOwnDiffColors = (): boolean => {
    const current = vscode.workspace
      .getConfiguration('workbench')
      .get<Record<string, unknown>>('colorCustomizations', {});
    return Object.keys(current).some((k) => k.startsWith('diffEditor'));
  };
  const applyCalmDiffColors = async (): Promise<void> => {
    const workbench = vscode.workspace.getConfiguration('workbench');
    const current = workbench.get<Record<string, unknown>>('colorCustomizations', {});
    await workbench.update('colorCustomizations', { ...current, ...CALM_COLORS }, vscode.ConfigurationTarget.Global);
  };
  const maybeOfferCalmColors = async (): Promise<void> => {
    const mode = vscode.workspace.getConfiguration('vsnovibe').get<string>('calmDiffColors', 'ask');
    if (mode === 'off' || calmDecided.value || hasOwnDiffColors()) {
      return;
    }
    if (mode === 'apply') {
      await applyCalmDiffColors();
      markCalmDecided();
      return;
    }
    const choice = await vscode.window.showInformationMessage(
      'VS No Vibe: calm down the diff colors? Thin gutter strips instead of full-line red/green fills — customizable later.',
      'Apply calm colors',
      'Keep mine'
    );
    markCalmDecided();
    if (choice === 'Apply calm colors') {
      await applyCalmDiffColors();
    }
  };

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

  /**
   * Keeps the copy close to the reference in size: blank lines beyond
   * maxExtraLines (reflexive Enters) are removed, bottom-up. Content lines
   * are never touched, and the line under the cursor is left alone so the
   * cleanup never fights active typing.
   */
  const tidyBlankLines = async (doc: vscode.TextDocument): Promise<number> => {
    if (refTotalLines === undefined) {
      return 0;
    }
    const cap = vscode.workspace.getConfiguration('vsnovibe').get<number>('maxExtraLines', 5);
    const budget = refTotalLines + cap;
    let excess = doc.lineCount - budget;
    if (excess <= 0) {
      return 0;
    }
    const editor = vscode.window.activeTextEditor;
    const cursorLine =
      editor && editor.document.uri.fsPath === doc.uri.fsPath ? editor.selection.active.line : -1;
    const blankIdx: number[] = [];
    for (let i = doc.lineCount - 1; i >= 0; i--) {
      if (doc.lineAt(i).isEmptyOrWhitespace) {
        blankIdx.push(i);
      }
    }
    const edit = new vscode.WorkspaceEdit();
    let removed = 0;
    for (const i of blankIdx) {
      if (excess <= 0) {
        break;
      }
      if (i >= doc.lineCount - 1 || i === cursorLine || i === cursorLine + 1) {
        continue;
      }
      edit.delete(doc.uri, new vscode.Range(doc.lineAt(i).range.start, doc.lineAt(i + 1).range.start));
      removed += 1;
      excess -= 1;
    }
    if (removed === 0) {
      return 0;
    }
    await vscode.workspace.applyEdit(edit);
    return removed;
  };

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
    refTotalLines = splitLines(reference).length;
    currentPercent = matchPercent(reference, doc.getText());
    updateStatusBar();
    await tidyBlankLines(doc);
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
    refTotalLines = undefined;
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
    await maybeOfferCalmColors();
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
    const created = await sessionStore.createMirror(srcRoot, targetRoot, rels);
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
      `VS No Vibe: ${rels.length} file${rels.length === 1 ? '' : 's'} in the queue (${created} new skeleton cop${created === 1 ? 'y' : 'ies'}). Type in the left pane — the AI reference on the right is read-only.`
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
    const doc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === targetPath(entry.rel));
    if (doc) {
      await tidyBlankLines(doc);
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
    vscode.commands.registerCommand('vsnovibe.applyCalmDiffColors', async () => {
      await applyCalmDiffColors();
      markCalmDecided();
      void vscode.window.showInformationMessage(
        'Calm diff colors applied to your user settings (workbench.colorCustomizations).'
      );
    }),
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
    void maybeOfferCalmColors();
    void vscode.window.showInformationMessage(
      'VS No Vibe session restored. Ctrl+Alt+O to pick a file, Ctrl+Alt+N for the next one.'
    );
  }
}
