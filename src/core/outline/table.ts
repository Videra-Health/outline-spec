/** Tables under outline items: a Markdown table whose first column is `id`. See docs/outlines.md#tables. */

export type Table = { columns: string[]; rows: string[][] };

export const TABLE_ID = /^[a-z0-9][a-z0-9_.-]*$/;
const SEPARATOR = /^:?-+:?$/;

export const isTableLine = (line: string): boolean => /^ *\|/.test(line);

/** Splits `| a | b\|c |` into trimmed cells, unescaping `\|`. */
export function splitRow(line: string): string[] {
  let s = line.trim().slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cell = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cell += '|';
      i++;
    } else if (s[i] === '|') {
      cells.push(cell.trim());
      cell = '';
    } else cell += s[i];
  }
  cells.push(cell.trim());
  return cells;
}

/** Parses a header row, a separator row, and data rows; `where` prefixes errors. */
export function parseTable(lines: string[], where: string): Table {
  const sep = lines.length > 1 ? splitRow(lines[1]) : [];
  if (!sep.length || !sep.every((c) => SEPARATOR.test(c))) throw new Error(`${where}: a table needs a separator row (|---|---|) under its header`);
  return { columns: splitRow(lines[0]), rows: lines.slice(2).map(splitRow) };
}

/** Canonical, unpadded form: a wide cell never re-pads other rows. */
export function writeTable(t: Table, indent: string): string[] {
  const row = (cells: string[]) => `${indent}| ${cells.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`;
  return [row(t.columns), `${indent}|${t.columns.map(() => '---').join('|')}|`, ...t.rows.map(row)];
}

export type TableProblem = { level: 'ERROR' | 'WARNING'; message: string };

/** Everything wrong with a table: ids, header, and cell counts are errors; a blank column is a warning. */
export function tableProblems(t: Table): TableProblem[] {
  const out: TableProblem[] = [];
  const error = (message: string) => out.push({ level: 'ERROR', message });
  if (t.columns[0] !== 'id') error(`a table's first column must be "id", not "${t.columns[0] ?? ''}"`);
  const headers = new Set<string>();
  t.columns.forEach((c, i) => {
    if (!c) error(`column ${i + 1} has no header`);
    else if (headers.has(c)) error(`duplicate column "${c}"`);
    headers.add(c);
  });
  const ids = new Set<string>();
  t.rows.forEach((r, i) => {
    const id = r[0] ?? '';
    const name = id ? `row "${id}"` : `row ${i + 1}`;
    if (r.length !== t.columns.length) error(`${name} has ${r.length} cells; the header has ${t.columns.length}`);
    if (!id) error(`row ${i + 1} has no id`);
    else if (!TABLE_ID.test(id)) error(`id "${id}" must be lowercase letters, digits, "_", ".", or "-", starting with a letter or digit`);
    else if (ids.has(id)) error(`duplicate id "${id}"`);
    ids.add(id);
  });
  if (t.rows.length) {
    t.columns.forEach((c, i) => {
      if (i > 0 && c && t.rows.every((r) => !r[i])) out.push({ level: 'WARNING', message: `column "${c}" is blank in every row` });
    });
  }
  return out;
}
