import chalk from 'chalk';

const BOX = {
  topLeft: '\u250c',
  topRight: '\u2510',
  bottomLeft: '\u2514',
  bottomRight: '\u2518',
  horizontal: '\u2500',
  vertical: '\u2502',
  topT: '\u252c',
  bottomT: '\u2534',
  leftT: '\u251c',
  rightT: '\u2524',
  cross: '\u253c',
};

function isNumeric(value: string): boolean {
  const trimmed = value.trim();
  return /^[$]?[-+]?[\d,]+\.?\d*[%BMK]?$/.test(trimmed);
}

export function parseMarkdownTable(tableText: string): { headers: string[]; rows: string[][] } | null {
  const lines = tableText.trim().split('\n').map(line => line.trim());
  if (lines.length < 2) return null;

  const headerLine = lines[0];
  if (!headerLine.includes('|')) return null;

  const headers = headerLine
    .split('|')
    .map(cell => cell.trim())
    .filter((_, i, arr) => i > 0 && i < arr.length - 1 || arr.length === 1);

  if (headers.length === 0) {
    const rawHeaders = headerLine.split('|').map(cell => cell.trim());
    if (rawHeaders.length > 0) headers.push(...rawHeaders);
  }

  if (headers.length === 0) return null;

  const separatorLine = lines[1];
  if (!separatorLine || !/^[\s|:-]+$/.test(separatorLine)) return null;

  const rows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('|')) continue;
    const cells = line.split('|').map(cell => cell.trim());
    if (cells[0] === '') cells.shift();
    if (cells[cells.length - 1] === '') cells.pop();
    if (cells.length > 0) rows.push(cells);
  }

  return { headers, rows };
}

export function renderBoxTable(headers: string[], rows: string[][]): string {
  const termWidth = process.stdout.columns || 120;
  // Reserve space for borders: each col has "| " + " " padding = 3 chars, plus final "|"
  const borderOverhead = headers.length * 3 + 1;
  const maxTotalContent = termWidth - borderOverhead;

  const colWidths: number[] = headers.map(h => h.length);
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      if (i < colWidths.length) {
        colWidths[i] = Math.max(colWidths[i]!, row[i]!.length);
      }
    }
  }

  // Cap columns so the table fits the terminal
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  if (totalWidth > maxTotalContent) {
    const maxCol = Math.max(12, Math.floor(maxTotalContent / headers.length));
    for (let i = 0; i < colWidths.length; i++) {
      colWidths[i] = Math.min(colWidths[i]!, maxCol);
    }
  }

  // Truncate cell values to fit column widths
  const truncCell = (value: string, width: number): string => {
    if (value.length <= width) return value;
    return value.slice(0, width - 1) + '\u2026';
  };

  const alignRight: boolean[] = headers.map((_, colIndex) => {
    let numericCount = 0;
    for (const row of rows) {
      if (row[colIndex] && isNumeric(row[colIndex])) numericCount++;
    }
    return numericCount > rows.length / 2;
  });

  const padCell = (value: string, width: number, right: boolean): string => {
    return right ? value.padStart(width) : value.padEnd(width);
  };

  const lines: string[] = [];

  lines.push(
    BOX.topLeft +
    colWidths.map(w => BOX.horizontal.repeat(w + 2)).join(BOX.topT) +
    BOX.topRight
  );

  lines.push(
    BOX.vertical +
    headers.map((h, i) => ` ${padCell(truncCell(h, colWidths[i]!), colWidths[i]!, false)} `).join(BOX.vertical) +
    BOX.vertical
  );

  lines.push(
    BOX.leftT +
    colWidths.map(w => BOX.horizontal.repeat(w + 2)).join(BOX.cross) +
    BOX.rightT
  );

  for (const row of rows) {
    lines.push(
      BOX.vertical +
      colWidths.map((w, i) => {
        const value = truncCell(row[i] || '', w);
        return ` ${padCell(value, w, alignRight[i]!)} `;
      }).join(BOX.vertical) +
      BOX.vertical
    );
  }

  lines.push(
    BOX.bottomLeft +
    colWidths.map(w => BOX.horizontal.repeat(w + 2)).join(BOX.bottomT) +
    BOX.bottomRight
  );

  return lines.join('\n');
}

export function transformMarkdownTables(content: string): string {
  const normalized = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n');

  const tableRegex = /^(\|[^\n]+\|\n\|[-:| \t]+\|(?:\n\|[^\n]+\|)*)/gm;
  const tableRegex2 = /^([^\n|]*\|[^\n]+\n[-:| \t]+(?:\n[^\n|]*\|[^\n]+)*)/gm;

  let result = normalized;

  result = result.replace(tableRegex, (match) => {
    const parsed = parseMarkdownTable(match);
    if (parsed && parsed.headers.length > 0 && parsed.rows.length > 0) {
      return renderBoxTable(parsed.headers, parsed.rows);
    }
    return match;
  });

  result = result.replace(tableRegex2, (match) => {
    if (match.includes(BOX.topLeft)) return match;
    const parsed = parseMarkdownTable(match);
    if (parsed && parsed.headers.length > 0 && parsed.rows.length > 0) {
      return renderBoxTable(parsed.headers, parsed.rows);
    }
    return match;
  });

  return result;
}

export function transformBold(content: string): string {
  return content.replace(/\*\*([^*]+)\*\*/g, (_, text) => chalk.bold(text));
}

export function formatResponse(content: string): string {
  let result = content;
  result = transformMarkdownTables(result);
  result = transformBold(result);
  return result;
}
