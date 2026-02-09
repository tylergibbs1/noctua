/**
 * Find the start position of the previous word from cursor position.
 */
export function findPrevWordStart(text: string, pos: number): number {
  if (pos <= 0) return 0;
  let i = pos - 1;
  while (i > 0 && !/\w/.test(text[i])) i--;
  while (i > 0 && /\w/.test(text[i - 1])) i--;
  return i;
}

/**
 * Find the end position of the next word from cursor position.
 */
export function findNextWordEnd(text: string, pos: number): number {
  const len = text.length;
  if (pos >= len) return len;
  let i = pos;
  while (i < len && !/\w/.test(text[i])) i++;
  while (i < len && /\w/.test(text[i])) i++;
  return i;
}

export function getLineAndColumn(text: string, pos: number): { line: number; column: number } {
  const beforeCursor = text.slice(0, pos);
  const lines = beforeCursor.split('\n');
  return {
    line: lines.length - 1,
    column: lines[lines.length - 1].length,
  };
}

export function getCursorPosition(text: string, line: number, column: number): number {
  const lines = text.split('\n');
  let pos = 0;
  for (let i = 0; i < line && i < lines.length; i++) {
    pos += lines[i].length + 1;
  }
  const targetLine = lines[line] || '';
  return pos + Math.min(column, targetLine.length);
}

export function getLineStart(text: string, pos: number): number {
  const lastNewline = text.lastIndexOf('\n', pos - 1);
  return lastNewline + 1;
}

export function getLineEnd(text: string, pos: number): number {
  const nextNewline = text.indexOf('\n', pos);
  return nextNewline === -1 ? text.length : nextNewline;
}

export function getLineCount(text: string): number {
  return text.split('\n').length;
}
