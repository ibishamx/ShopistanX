/** Parses CSV text (comma, semicolon or tab separated; quoted fields allowed) into rows of cells. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [',', ';', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((v) => v !== '')) rows.push(row);
  return rows;
}

/** "Rs 2,250.00" → 225000 paisa; null when not an amount. */
export function amountToPaisa(value: string): number | null {
  const cleaned = value.replace(/rs\.?|pkr|,|\s/gi, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export function guessColumn(headers: string[], patterns: RegExp[]): number {
  for (const pattern of patterns) {
    const i = headers.findIndex((h) => pattern.test(h));
    if (i >= 0) return i;
  }
  return -1;
}
