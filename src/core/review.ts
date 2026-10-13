/** Builds a change's review page: the banner, file tabs, and the spec-changes view. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { diffArrays } from 'diff';
import { collectPending } from '../commands/pending.js';
import type { ReviewTab } from './artifact-graph/types.js';
import { marksOf, reqName, sides, touches, writeOutline, type Node, type Spec, type SpecEdit } from './outline/outline.js';
import { planChange, readChangeEdits, readLiveSpec } from './outline/specs.js';
import { isTableLine, parseTable, writeTable, type Table } from './outline/table.js';
import { Validator } from './validation/validator.js';
import { isGlobPattern, resolveArtifactOutputs } from './artifact-graph/outputs.js';
import { FileSystemUtils } from '../utils/file-system.js';

export type Segment = { text: string; added?: true; removed?: true };

/** A row's cells in the diff's column order; an added or removed row's cells are unmarked. */
export type TableRowDiff = { added?: true; removed?: true; changed?: true; cells: Segment[][] };

/** Columns marked added or removed, and rows matched by id. */
export type TableDiff = { columns: Segment[]; rows: TableRowDiff[] };

export type DiffLine = { segments: Segment[]; changed?: true } | { table: TableDiff; depth: number; changed?: true };

export interface RequirementChange {
  label: string;
  name: string;
  renamedFrom?: string;
  kind: 'added' | 'edited' | 'removed';
  /** Live text, for edited and removed requirements. */
  live?: string;
  /** Text after archive, for added and edited requirements. */
  after?: string;
  /** The text as lines and tables; an edited requirement's carry its diff, with `changed` on each line that differs. */
  lines: DiffLine[];
  /** Table cells, rows, and columns the change touches, as `outline-spec pending` names them. */
  tableEdits?: string[];
}

export interface SpecChange {
  name: string;
  status: 'new' | 'removed' | 'changed';
  purpose?: Segment[];
  requirements: RequirementChange[];
}

export interface Banner {
  valid: boolean;
  errors: string[];
  overlaps: Array<{ change: string; requirements: string[] }>;
}

/** A file tab's file; `markdown` holds the file text whatever its kind, so older templates still read it. */
export interface ReviewFile {
  name: string;
  kind: 'markdown' | 'html';
  markdown: string;
}

export type ReviewPageTab =
  | { title: string; kind: 'markdown'; files: ReviewFile[] }
  | { title: string; kind: 'spec-changes'; specs: SpecChange[]; error?: string };

export interface ReviewPayload {
  change: string;
  generatedAt: string;
  banner: Banner;
  tabs: ReviewPageTab[];
}

const SEP = ' › ';
const requirementOf = (touch: string) => touch.split(SEP).slice(0, 2).join(SEP);

/** Validation result and every other open change sharing a requirement with this one. */
export async function buildBanner(changesDir: string, specsDir: string, change: string, projectRoot?: string): Promise<Banner> {
  const report = await new Validator().validateChange(path.join(changesDir, change), { specsDir, projectRoot });
  const errors = report.issues.filter((i) => i.level === 'ERROR').map((i) => i.message);
  const pending = collectPending(changesDir, specsDir).changes;
  const mine = new Set((pending.find((c) => c.name === change)?.touches ?? []).map(requirementOf));
  const overlaps = pending
    .filter((c) => c.name !== change)
    .map((c) => ({ change: c.name, requirements: [...new Set(c.touches.map(requirementOf))].filter((r) => mine.has(r)).sort() }))
    .filter((o) => o.requirements.length > 0);
  return { valid: report.valid, errors, overlaps };
}

/** A requirement's sentence, table, and details as outline text, without its label and name. */
function requirementBody(node: Node): string {
  const sentence = node.text.slice(reqName(node.text).length + 2);
  return [sentence, ...(node.table ? writeTable(node.table, '') : []), ...writeOutline(node.children)].join('\n');
}

/** Diffs whole whitespace-separated words, so `1,400,000` changes as one value; a space between two changes joins them. */
function wordDiff(live: string, after: string): Segment[] {
  const words = (s: string) => s.split(/(\s+)/).filter(Boolean);
  const parts = diffArrays(words(live), words(after));
  const out: Segment[] = [];
  let del = '';
  let add = '';
  const flush = () => {
    if (del) out.push({ text: del, removed: true });
    if (add) out.push({ text: add, added: true });
    del = add = '';
  };
  parts.forEach((p, i) => {
    const text = p.value.join('');
    const next = parts[i + 1];
    if (p.removed) del += text;
    else if (p.added) add += text;
    else if (/^\s+$/.test(text) && (del || add) && (next?.added || next?.removed)) {
      if (del) del += text;
      if (add) add += text;
    } else {
      flush();
      out.push({ text });
    }
  });
  flush();
  return out;
}

const plainLine = (text: string): DiffLine => ({ segments: [{ text }] });
const depthOf = (line: string) => Math.floor((line.length - line.trimStart().length) / 2);
const ITEM_LABEL = /^ *([0-9]+|[a-z]+)\. /;

/** Outline text as lines, with each run of table lines parsed as one table. */
function blocks(text: string): Array<{ line: string } | { table: Table; depth: number }> {
  const lines = text.split('\n');
  const out: Array<{ line: string } | { table: Table; depth: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isTableLine(lines[i])) {
      out.push({ line: lines[i] });
      continue;
    }
    const start = i;
    while (i + 1 < lines.length && isTableLine(lines[i + 1])) i++;
    out.push({ table: parseTable(lines.slice(start, i + 1), 'review'), depth: depthOf(lines[start]) });
  }
  return out;
}

/** Whole-value replacement for one-word cells such as numbers; a word diff for prose. */
function cellDiff(live: string, after: string): Segment[] {
  if (live === after) return [{ text: live }];
  if (/\s/.test(live) || /\s/.test(after)) return wordDiff(live, after);
  return [...(live ? [{ text: live, removed: true as const }] : []), ...(after ? [{ text: after, added: true as const }] : [])];
}

/** Compares cells only by row id and column header, so a value never matches a different cell. */
function tableDiff(live: Table | undefined, after: Table | undefined): TableDiff {
  const [oldCols, newCols] = [live?.columns ?? [], after?.columns ?? []];
  const columns: Segment[] = diffArrays(oldCols, newCols).flatMap((p) =>
    p.value.map((text) => ({ text, ...(p.added ? { added: true as const } : p.removed ? { removed: true as const } : {}) }))
  );
  const cellOf = (t: Table | undefined, row: string[] | undefined, col: string) => {
    const i = t?.columns.indexOf(col) ?? -1;
    return i < 0 || !row ? '' : (row[i] ?? '');
  };
  const oldRows = new Map((live?.rows ?? []).map((r) => [r[0], r]));
  const newRows = new Map((after?.rows ?? []).map((r) => [r[0], r]));
  const ids = diffArrays([...oldRows.keys()], [...newRows.keys()]).flatMap((p) => p.value);
  const rows = [...new Set(ids)].map((id): TableRowDiff => {
    const [o, n] = [oldRows.get(id), newRows.get(id)];
    const cells = columns.map((c) => {
      const [ov, nv] = [cellOf(live, o, c.text), cellOf(after, n, c.text)];
      if (!n || c.removed) return [{ text: ov }];
      return !o || c.added ? [{ text: nv }] : cellDiff(ov, nv);
    });
    const status = !o ? { added: true as const } : !n ? { removed: true as const } : {};
    const changed = !o || !n || cells.some((cell) => cell.some((s) => s.added || s.removed));
    return { ...status, ...(changed ? { changed: true as const } : {}), cells };
  });
  return { columns, rows };
}

const tableChanged = (t: TableDiff) => t.columns.some((c) => c.added || c.removed) || t.rows.some((r) => r.changed);
const label = (line: string) => ITEM_LABEL.exec(line)?.[0];

/** Pairs a removed line with an added one only when they share an item label or most of their words. */
function alike(a: string, b: string): boolean {
  if (label(a) !== undefined && label(a) === label(b)) return true;
  const same = wordDiff(a, b).filter((s) => !s.added && !s.removed).reduce((n, s) => n + s.text.length, 0);
  return same >= 0.5 * Math.max(a.length, b.length);
}

/** One diff of a requirement: lines and tables aligned, changed lines word-diffed, and tables diffed by cell. */
function requirementDiff(live: string, after: string): DiffLine[] {
  const [oldBlocks, newBlocks] = [blocks(live), blocks(after)];
  const key = (b: { line: string } | { table: Table }) => ('line' in b ? b.line : '\u0000table');
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let removed: typeof oldBlocks = [];
  let added: typeof newBlocks = [];
  const flush = () => {
    const oldLines = removed.filter((b): b is { line: string } => 'line' in b);
    const oldTables = removed.filter((b): b is { table: Table; depth: number } => 'table' in b);
    for (const b of added) {
      if ('table' in b) {
        const t = tableDiff(oldTables.shift()?.table, b.table);
        out.push({ table: t, depth: b.depth, changed: true });
        continue;
      }
      const k = oldLines.findIndex((o) => alike(o.line, b.line));
      for (const o of oldLines.splice(0, k < 0 ? 0 : k)) out.push({ segments: [{ text: o.line, removed: true }], changed: true });
      const pair = k < 0 ? undefined : oldLines.shift();
      out.push({ segments: pair ? wordDiff(pair.line, b.line) : [{ text: b.line, added: true }], changed: true });
    }
    for (const o of oldLines) out.push({ segments: [{ text: o.line, removed: true }], changed: true });
    for (const o of oldTables) out.push({ table: tableDiff(o.table, undefined), depth: o.depth, changed: true });
    removed = [];
    added = [];
  };
  for (const p of diffArrays(oldBlocks.map(key), newBlocks.map(key))) {
    const n = p.count ?? p.value.length;
    if (p.removed) removed.push(...oldBlocks.slice(i, (i += n)));
    else if (p.added) added.push(...newBlocks.slice(j, (j += n)));
    else {
      flush();
      for (let k = 0; k < n; k++, i++, j++) {
        const [o, b] = [oldBlocks[i], newBlocks[j]];
        if ('line' in b) out.push(plainLine(b.line));
        else {
          const t = tableDiff((o as { table: Table }).table, b.table);
          out.push({ table: t, depth: b.depth, ...(tableChanged(t) ? { changed: true as const } : {}) });
        }
      }
    }
  }
  flush();
  return out;
}

/** A requirement's text as unmarked lines, with tables parsed so the page can draw them. */
const plainDiff = (text: string): DiffLine[] =>
  blocks(text).map((b) => ('line' in b ? plainLine(b.line) : { table: tableDiff(b.table, b.table), depth: b.depth }));

function whole(node: Node, kind: 'added' | 'removed'): RequirementChange {
  const body = requirementBody(node);
  return { label: node.label, name: reqName(node.text), kind, ...(kind === 'added' ? { after: body } : { live: body }), lines: plainDiff(body) };
}

/** Old name to new name for each requirement the change renames with `~~Old~~ **New** (patch):`. */
function renames(edits: SpecEdit[], spec: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const req of edits.filter((e) => e.spec === spec).flatMap((e) => e.node.children)) {
    const name = /^(.*?) \(patch\):/.exec(req.text)?.[1];
    if (name && marksOf(name) === 'edit') out.set(sides(name).old, sides(name).new);
  }
  return out;
}

/** Requirements match by name, following renames; archive may reuse a removed requirement's label. */
function compareSpecs(name: string, live: Spec | null, after: Spec | null, edits: SpecEdit[], tablePaths: string[]): SpecChange {
  if (!live) return { name, status: 'new', purpose: [{ text: after!.purpose, added: true }], requirements: after!.items.map((n) => whole(n, 'added')) };
  if (!after) return { name, status: 'removed', purpose: [{ text: live.purpose, removed: true }], requirements: live.items.map((n) => whole(n, 'removed')) };
  const renamed = renames(edits, name);
  const requirements: RequirementChange[] = [];
  const matched = new Set<Node>();
  for (const old of live.items) {
    const oldName = reqName(old.text);
    const newName = renamed.get(oldName) ?? oldName;
    const neu = after.items.find((n) => reqName(n.text) === newName);
    if (!neu) {
      requirements.push(whole(old, 'removed'));
      continue;
    }
    matched.add(neu);
    const [liveText, afterText] = [requirementBody(old), requirementBody(neu)];
    if (old.text === neu.text && liveText === afterText) continue;
    const prefix = `${name}${SEP}${oldName}${SEP}`;
    const tableEdits = tablePaths.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length));
    requirements.push({
      label: neu.label,
      name: newName,
      ...(oldName !== newName ? { renamedFrom: oldName } : {}),
      kind: 'edited',
      live: liveText,
      after: afterText,
      lines: requirementDiff(liveText, afterText),
      ...(tableEdits.length ? { tableEdits } : {}),
    });
  }
  for (const n of after.items) if (!matched.has(n)) requirements.push(whole(n, 'added'));
  return { name, status: 'changed', ...(live.purpose !== after.purpose ? { purpose: wordDiff(live.purpose, after.purpose) } : {}), requirements };
}

/** Every spec the change touches with its added, edited, and removed requirements; throws when the outline doesn't apply. */
export function buildSpecChanges(changesDir: string, specsDir: string, change: string): SpecChange[] {
  const plan = planChange(specsDir, changesDir, change);
  const edits = readChangeEdits(changesDir, change);
  const tablePaths: string[] = [];
  for (const edit of edits) touches(edit, readLiveSpec(specsDir, edit.spec), tablePaths);
  return [...plan].map(([name, after]) => compareSpecs(name, readLiveSpec(specsDir, name), after, edits, tablePaths));
}

const HTML_EXTENSIONS = ['.html', '.htm'];

/** An entry's files as change-relative `/` paths: a glob's matches by name, or the plain file if present. */
function tabFileNames(changeDir: string, entry: string): string[] {
  if (!isGlobPattern(entry)) return existsSync(path.join(changeDir, entry)) ? [entry] : [];
  if (!existsSync(changeDir)) return [];
  const base = FileSystemUtils.canonicalizeExistingPath(changeDir);
  return resolveArtifactOutputs(changeDir, entry).map((file) => FileSystemUtils.toPosixPath(path.relative(base, file)));
}

export function buildTabs(changesDir: string, specsDir: string, change: string, tabs: ReviewTab[]): ReviewPageTab[] {
  const changeDir = path.join(changesDir, change);
  const out: ReviewPageTab[] = [];
  for (const tab of tabs) {
    if (tab.view === 'spec-changes') {
      try {
        out.push({ title: tab.title, kind: 'spec-changes', specs: buildSpecChanges(changesDir, specsDir, change) });
      } catch (e) {
        out.push({ title: tab.title, kind: 'spec-changes', specs: [], error: (e as Error).message });
      }
      continue;
    }
    const files = (tab.from ?? [])
      .flatMap((entry) => tabFileNames(changeDir, entry))
      .map((name): ReviewFile => ({
        name,
        kind: HTML_EXTENSIONS.includes(path.extname(name).toLowerCase()) ? 'html' : 'markdown',
        markdown: readFileSync(path.join(changeDir, name), 'utf-8').replace(/\r\n/g, '\n'),
      }));
    if (files.length) out.push({ title: tab.title, kind: 'markdown', files });
  }
  return out;
}

const PAYLOAD = /(<script type="application\/json" id="outline-spec-review">)[\s\S]*?(<\/script>)/;

export const hasPayloadSlot = (template: string): boolean => PAYLOAD.test(template);

/** Fills the template's payload script and `{{change}}`; `<` is escaped so file text can't end the tag. */
export function fillTemplate(template: string, payload: ReviewPayload): string {
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  const name = payload.change.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return template
    .replace(/\{\{change\}\}/g, () => name)
    .replace(PAYLOAD, (_m, open: string, close: string) => `${open}${json}${close}`);
}

/** `<tmp>/outline-spec-review/<hash>-<basename>/<change>.html`, one folder per project. */
export function defaultReviewPath(projectRoot: string, change: string): string {
  const hash = createHash('sha256').update(projectRoot).digest('hex').slice(0, 8);
  return path.join(os.tmpdir(), 'outline-spec-review', `${hash}-${path.basename(projectRoot)}`, `${change}.html`);
}
