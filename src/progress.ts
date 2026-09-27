// Line-based similarity between the reference file and what you typed so far.

const MAX_LINES = 5000;

/** Characters AI text loves that a keyboard cannot produce in one press. */
const TYPEABLE_MAP: Array<[RegExp, string]> = [
  [/[—–−―]/g, '-'],
  [/[‘’‚‛]/g, "'"],
  [/[“”„]/g, '"'],
  [/…/g, '...'],
  [/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' '],
];

/**
 * Replaces untypeable typography with its plain equivalent, so "what you see
 * is what you can type" and the diff goes green when you finish a line.
 */
export function normalizeForTyping(text: string): string {
  for (const [pattern, replacement] of TYPEABLE_MAP) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

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
 * Percentage of non-blank reference lines that were retyped (order preserved).
 * Blank lines are excluded from the score: there is nothing to retype in them.
 * Both sides are normalized (dashes, quotes, spaces) and compared trimmed, so
 * an indentation slip or a typographic dash does not hide progress.
 * Returns undefined when the file is too big for a cheap comparison.
 */
export function matchPercent(reference: string, typed: string): number | undefined {
  const refLines = splitLines(normalizeForTyping(reference))
    .map((l) => l.trim())
    .filter((l) => l !== '');
  if (refLines.length === 0) {
    return 100;
  }
  if (refLines.length > MAX_LINES) {
    return undefined;
  }
  const typedLines = splitLines(normalizeForTyping(typed)).map((l) => l.trim());
  if (typedLines.length > MAX_LINES) {
    return undefined;
  }
  const lcs = lcsLength(refLines, typedLines);
  return Math.round((lcs / refLines.length) * 100);
}
