import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

export interface FileEntry {
  /** Relative to sourceRoot, '/'-separated. */
  rel: string;
  done: boolean;
}

export interface Session {
  sourceRoot: string;
  targetRoot: string;
  files: FileEntry[];
  /** Index into files, -1 = nothing open yet. */
  current: number;
}

const DEFAULT_EXCLUDE = ['node_modules', '.git', 'dist', 'build', 'out', '.vscode', 'coverage'];

const SKIP_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp', '.tiff', '.icns',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.zip', '.gz', '.tar', '.bz2', '.xz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.msi', '.bin', '.wasm', '.obj', '.o', '.a', '.lib',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.mp3', '.wav', '.ogg', '.mp4', '.avi', '.mov', '.mkv', '.webm',
  '.db', '.sqlite', '.sqlite3',
  '.jar', '.class', '.pyd', '.node',
]);

const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'composer.lock', 'poetry.lock', 'Cargo.lock',
]);

const MAX_BYTES = 512 * 1024;

const SESSION_KEY = 'vsnovibe.session';

export function samePath(a: string, b: string): boolean {
  const na = path.normalize(a);
  const nb = path.normalize(b);
  return process.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

/**
 * The mirror folder: a sibling named "<source>.handwritten", or "handwritten"
 * inside the source when the source itself is a workspace root (a sibling
 * would land outside the workspace).
 */
export function resolveTargetRoot(sourceRoot: string, suffix: string): string {
  const src = path.normalize(sourceRoot);
  const wsRoots = (vscode.workspace.workspaceFolders ?? []).map((f) => path.normalize(f.uri.fsPath));
  if (wsRoots.some((root) => samePath(root, src))) {
    return path.join(src, 'handwritten');
  }
  return path.join(path.dirname(src), path.basename(src) + suffix);
}

/**
 * Collect relative paths of rewriteable text files under sourceRoot.
 * Skips excluded names, dotfiles, binaries, lockfiles, minified files,
 * anything under targetRoot and anything bigger than MAX_BYTES.
 */
export async function scanSource(sourceRoot: string, targetRoot: string): Promise<string[]> {
  const cfg = vscode.workspace.getConfiguration('vsnovibe');
  const configured = cfg.get<string[]>('exclude') ?? DEFAULT_EXCLUDE;
  const excludeNames = new Set(configured.map((n) => n.toLowerCase()));
  const rels: string[] = [];
  await walk(path.normalize(sourceRoot), path.normalize(sourceRoot), path.normalize(targetRoot), excludeNames, rels);
  rels.sort((a, b) => a.localeCompare(b));
  return rels;
}

async function walk(
  root: string,
  dir: string,
  targetRoot: string,
  excludeNames: Set<string>,
  out: string[]
): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || excludeNames.has(entry.name.toLowerCase())) {
        continue;
      }
      await walk(root, abs, targetRoot, excludeNames, out);
    } else if (entry.isFile()) {
      if (entry.name.startsWith('.') || excludeNames.has(entry.name.toLowerCase())) {
        continue;
      }
      if (SKIP_FILES.has(entry.name) || /\.min\.\w+$/.test(entry.name)) {
        continue;
      }
      if (SKIP_EXTS.has(path.extname(entry.name).toLowerCase())) {
        continue;
      }
      if (isInside(targetRoot, abs)) {
        continue;
      }
      try {
        const stat = await fs.promises.stat(abs);
        if (stat.size > MAX_BYTES) {
          continue;
        }
      } catch {
        continue;
      }
      out.push(path.relative(root, abs).split(path.sep).join('/'));
    }
  }
}

function isInside(folder: string, filePath: string): boolean {
  return samePath(folder, filePath) || path.normalize(filePath).startsWith(path.normalize(folder) + path.sep);
}

/** Blank lines in the exact count and layout of the source file. */
function blankSkeleton(sourcePath: string): string {
  try {
    return fs.readFileSync(sourcePath, 'utf8').replace(/[^\r\n]/g, '');
  } catch {
    return '';
  }
}

/**
 * Create mirror files; never touches files that already have content.
 * New copies (and brand-empty leftovers from older sessions) start as a
 * blank-line skeleton of the reference, so both diff panes have equal length.
 */
export async function createMirror(sourceRoot: string, targetRoot: string, rels: string[]): Promise<number> {
  const skeleton = vscode.workspace
    .getConfiguration('vsnovibe')
    .get<boolean>('skeletonLines', true);
  let created = 0;
  for (const rel of rels) {
    const target = path.join(targetRoot, ...rel.split('/'));
    const skeletonText = skeleton ? blankSkeleton(path.join(sourceRoot, ...rel.split('/'))) : '';
    if (fs.existsSync(target)) {
      if (skeleton && fs.statSync(target).size === 0) {
        await fs.promises.writeFile(target, skeletonText, 'utf8');
      }
      continue;
    }
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, skeletonText, 'utf8');
    created += 1;
  }
  return created;
}

export function load(context: vscode.ExtensionContext): Session | undefined {
  return context.workspaceState.get<Session>(SESSION_KEY);
}

export function save(context: vscode.ExtensionContext, session: Session | undefined): void {
  void context.workspaceState.update(SESSION_KEY, session);
}
