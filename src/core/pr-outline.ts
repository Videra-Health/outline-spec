/** Writes the spec edits between two versions of the specs as the change outline that would make them. */
import { applyEdit, parseOutline, parseSpec, reqName, sides, writeOutline, writeSpec, type Node, type Spec } from './outline/outline.js';
import { writeTable, type Table } from './outline/table.js';
import { wordDiff } from './review.js';

export interface PullRequestOutline {
  /** Outline item lines, as under a change's `## Requirements`. */
  lines: string[];
  /** 0-based indexes into `lines` of items the head adds. */
  newLines: number[];
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
/** Outline-level labels for requirements: a..z, then aa, ab, ... */
const letter = (i: number): string => (i < 26 ? LETTERS[i]! : letter(Math.floor(i / 26) - 1) + LETTERS[i % 26]!);
const pad = (depth: number) => '  '.repeat(depth);
const tidy = (s: string) => s.replace(/ {2,}/g, ' ').replace(/ ([.,;:)])/g, '$1').trim();

/** `old` marked into `now` word by word, or swapped whole when word marks wouldn't read back exactly. */
export function marked(old: string, now: string): string {
  let out = '';
  for (const seg of wordDiff(old, now)) {
    const lead = /^\s*/.exec(seg.text)![0];
    const trail = /\s*$/.exec(seg.text)![0];
    const core = seg.text.trim();
    if (!core) out += seg.text;
    else if (seg.removed) out += `${lead}~~${core}~~${trail}`;
    else if (seg.added) out += `${lead}**${core}**${trail}`;
    else out += seg.text;
  }
  out = out.replace(/~~ +\*\*/g, '~~ **').replace(/~~\*\*/g, '~~ **');
  const s = sides(out);
  if (s.old === tidy(old) && s.new === tidy(now)) return out;
  if (!old) return `**${now}**`;
  if (!now) return `~~${old}~~`;
  return `~~${old}~~ **${now}**`;
}

/** A table under an item that had one: changed cells, new and removed rows, and added or removed columns. */
function tableEdit(before: Table, after: Table): Table | null {
  const id = (t: Table) => new Map(t.rows.map((r) => [r[0] ?? '', r]));
  const [was, is] = [id(before), id(after)];
  const kept = after.columns.filter((c) => before.columns.includes(c));
  const added = after.columns.filter((c) => !before.columns.includes(c));
  const removed = before.columns.filter((c) => !after.columns.includes(c));
  const cell = (row: string[] | undefined, t: Table, col: string) => (row ? (row[t.columns.indexOf(col)] ?? '') : '');
  const columns = [after.columns[0] ?? 'id', ...kept.slice(1), ...removed.map((c) => `~~${c}~~`), ...added.map((c) => `**${c}**`)];
  const rows: string[][] = [];
  for (const [key, row] of is) {
    const old = was.get(key);
    if (!old) {
      rows.push([key, ...kept.slice(1).map((c) => cell(row, after, c)), ...removed.map(() => ''), ...added.map((c) => cell(row, after, c))]);
      continue;
    }
    const edits = kept.slice(1).map((c) => {
      const [a, b] = [cell(old, before, c), cell(row, after, c)];
      return a === b ? '' : a && b ? `~~${a}~~ **${b}**` : a ? `~~${a}~~` : `**${b}**`;
    });
    const fresh = added.map((c) => cell(row, after, c));
    if (edits.some(Boolean) || fresh.some(Boolean)) rows.push([key, ...edits, ...removed.map(() => ''), ...fresh]);
  }
  for (const key of was.keys()) if (!is.has(key)) rows.push([`~~${key}~~`, ...columns.slice(1).map(() => '')]);
  return rows.length || added.length || removed.length ? { columns, rows } : null;
}

type Out = { lines: string[]; newLines: number[] };
const emit = (out: Out, line: string, isNew = false) => {
  if (isNew) out.newLines.push(out.lines.length);
  out.lines.push(line);
};
/** Writes nodes plainly, every line new. */
const emitNew = (out: Out, nodes: Node[], depth: number) => {
  for (const line of writeOutline(nodes, depth)) emit(out, line, /^ *([0-9]+|[a-z]+)\. /.test(line));
};

/** Details under a requirement, by their labels: changed ones marked, new ones plain, removed ones struck. */
function details(out: Out, before: Node[], after: Node[], depth: number): boolean {
  let wrote = false;
  const labels = [...before.map((n) => n.label), ...after.map((n) => n.label).filter((l) => !before.some((n) => n.label === l))];
  for (const label of labels) {
    const [b, a] = [before.find((n) => n.label === label), after.find((n) => n.label === label)];
    if (!a) {
      emit(out, `${pad(depth)}${label}. ~~${b!.text}~~`);
      wrote = true;
      continue;
    }
    if (!b) {
      emitNew(out, [a], depth);
      wrote = true;
      continue;
    }
    const sub: Out = { lines: [], newLines: [] };
    const table = a.table && b.table ? tableEdit(b.table, a.table) : (a.table ?? null);
    if (table) sub.lines.push(...writeTable(table, pad(depth + 1)));
    const deeper = details(sub, b.children, a.children, depth + 1);
    if (tidy(a.text) === tidy(b.text) && !table && !deeper) continue;
    emit(out, `${pad(depth)}${label}.${tidy(a.text) === tidy(b.text) ? '' : ` ${marked(b.text, a.text)}`}`);
    const base = out.lines.length;
    out.lines.push(...sub.lines);
    out.newLines.push(...sub.newLines.map((i) => base + i));
    wrote = true;
  }
  return wrote;
}

const body = (n: Node) => [n.text.slice(reqName(n.text).length), ...(n.table ? writeTable(n.table, '') : []), ...writeOutline(n.children)].join('\n');

/** One spec's edits as outline lines under its top-level item. */
function specEdit(name: string, before: Spec | null, after: Spec | null, index: number): Out {
  const out: Out = { lines: [], newLines: [] };
  if (!after) {
    emit(out, `${index}. ~~${name}: ${before!.purpose}~~`);
    return out;
  }
  if (!before) {
    emit(out, `${index}. ${name}: ${after.purpose}`, true);
    emitNew(out, after.items.map((n, i) => ({ ...n, label: letter(i) })), 1);
    return out;
  }
  emit(out, `${index}. ${name}:${tidy(before.purpose) === tidy(after.purpose) ? '' : ` ${marked(before.purpose, after.purpose)}`}`);
  const gone = before.items.filter((b) => !after.items.some((a) => reqName(a.text) === reqName(b.text)));
  const fresh = after.items.filter((a) => !before.items.some((b) => reqName(b.text) === reqName(a.text)));
  let n = 0;
  const renamed = new Set<Node>();
  for (const b of gone) {
    const a = fresh.find((f) => !renamed.has(f) && body(f) === body(b));
    if (!a) {
      emit(out, `${pad(1)}${letter(n++)}. ~~${b.text}~~`);
      continue;
    }
    renamed.add(a);
    emit(out, `${pad(1)}${letter(n++)}. ~~${reqName(b.text)}~~ **${reqName(a.text)}** (patch):`);
  }
  for (const a of after.items) {
    if (renamed.has(a)) continue;
    const b = before.items.find((x) => reqName(x.text) === reqName(a.text));
    if (!b) {
      emitNew(out, [{ ...a, label: letter(n++) }], 1);
      continue;
    }
    const sub: Out = { lines: [], newLines: [] };
    const table = a.table && b.table ? tableEdit(b.table, a.table) : (a.table ?? null);
    if (table) sub.lines.push(...writeTable(table, pad(2)));
    const deeper = details(sub, b.children, a.children, 2);
    const [was, is] = [b.text.slice(reqName(b.text).length + 2), a.text.slice(reqName(a.text).length + 2)];
    if (tidy(was) === tidy(is) && !table && !deeper) continue;
    emit(out, `${pad(1)}${letter(n++)}. ${reqName(a.text)} (patch):${tidy(was) === tidy(is) ? '' : ` ${marked(was, is)}`}`);
    const base = out.lines.length;
    out.lines.push(...sub.lines);
    out.newLines.push(...sub.newLines.map((i) => base + i));
  }
  return out;
}

/** True when applying `lines` to `before` gives `after`, exactly as archive would. */
function archivesTo(name: string, lines: string[], before: Spec | null, after: Spec | null): boolean {
  try {
    const [node] = parseOutline(lines, `${name} outline`);
    if (!node) return false;
    const result = applyEdit(before, { spec: name, node });
    if (!result || !after) return !result && !after;
    return writeSpec(result) === writeSpec(after);
  } catch {
    return false;
  }
}

/**
 * Every spec that differs between `base` and `now` (spec id to file text), as change outline items.
 * A spec whose outline wouldn't archive back to its head text gets a note in its place.
 */
export function buildPullRequestOutline(base: Map<string, string>, now: Map<string, string>): PullRequestOutline {
  const result: PullRequestOutline = { lines: [], newLines: [] };
  let index = 0;
  for (const name of [...new Set([...base.keys(), ...now.keys()])].sort()) {
    const [b, a] = [base.get(name), now.get(name)];
    const before = b === undefined ? null : parseSpec(b, `${name} at base`);
    const after = a === undefined ? null : parseSpec(a, name);
    if (before && after && writeSpec(before) === writeSpec(after)) continue;
    index += 1;
    const edit = specEdit(name, before, after, index);
    const start = result.lines.length;
    if (archivesTo(name, edit.lines, before, after)) {
      result.lines.push(...edit.lines);
      result.newLines.push(...edit.newLines.map((i) => start + i));
    } else {
      result.lines.push(`${index}. ${name}: The outline of this spec's edits couldn't be written exactly; see Spec changes.`);
    }
  }
  return result;
}
