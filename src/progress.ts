// Line-based similarity between the reference file and what you typed so far.

const MAX_LINES = 5000;

export function splitLines(content: string): string[] {
  const lines = content.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  return lines;
}

function lcsLength(a: string[], b: string[]): number {
  let prev = new Uint16Array(b.length + 1);
  let curr = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    const ai = a[i - 1];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = ai === b[j - 1] && ai !== '' ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Percentage of reference lines that were retyped (order preserved).
 * Returns undefined when the file is too big for a cheap comparison.
 * Lines are compared trimmed, so an indentation slip does not hide progress.
 */
export function matchPercent(reference: string, typed: string): number | undefined {
  const refLines = splitLines(reference).map((l) => l.trim());
  if (refLines.length === 0) {
    return 100;
  }
  if (refLines.length > MAX_LINES) {
    return undefined;
  }
  const typedLines = splitLines(typed).map((l) => l.trim());
  if (typedLines.length > MAX_LINES) {
    return undefined;
  }
  const lcs = lcsLength(refLines, typedLines);
  return Math.round((lcs / refLines.length) * 100);
}
