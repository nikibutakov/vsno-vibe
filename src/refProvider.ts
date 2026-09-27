import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

export const REF_SCHEME = 'vsnovibe-ref';

interface RefMapData {
  seq: number;
  paths: [string, string][];
}

/**
 * Serves the reference (AI-generated) file contents as read-only virtual
 * documents, so the diff pane on the right cannot be edited by accident.
 */
export class ReferenceProvider implements vscode.TextDocumentContentProvider {
  private seq = 0;
  private readonly paths = new Map<string, string>();

  provideTextDocumentContent(uri: vscode.Uri): string {
    const filePath = this.paths.get(uri.toString());
    if (!filePath) {
      return '';
    }
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch {
      return `// [VS No Vibe] reference file is gone: ${filePath}`;
    }
  }

  createReference(filePath: string): vscode.Uri {
    this.seq += 1;
    const uri = vscode.Uri.from({
      scheme: REF_SCHEME,
      path: `/${this.seq}/${path.basename(filePath)}`,
    });
    this.paths.set(uri.toString(), filePath);
    return uri;
  }

  toJSON(): RefMapData {
    return { seq: this.seq, paths: [...this.paths] };
  }

  restore(data: unknown): void {
    const d = data as RefMapData | undefined;
    if (!d || !Array.isArray(d.paths)) {
      return;
    }
    this.seq = d.seq ?? 0;
    for (const [key, value] of d.paths) {
      this.paths.set(key, value);
    }
  }
}
