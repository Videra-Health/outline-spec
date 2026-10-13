/** Outline specs: parse, patch from a change's outline.md, and write back. See docs/outlines.md. */
import { isTableLine, parseTable, tableProblems, writeTable, type Table } from './table.js';

export type { Table } from './table.js';
export type Node = { label: string; text: string; children: Node[]; table?: Table };
export type Spec = { name: string; purpose: string; items: Node[] };
export type SpecEdit = { spec: string; node: Node };

const LINE = /^( *)([0-9]+|[a-z]+)\.(?: (.*))?$/;

/** Parses indented `label. text` lines (two spaces per level) into a tree; a table sits one level under its item. */
export function parseOutline(lines: string[], where: string, offset = 0): Node[] {
  const roots: Node[] = [];
  const stack: Node[][] = [roots];
  const open: Node[] = []; // the latest item at each depth
  let block: { start: number; end: number; indent: number; lines: string[] } | null = null;
  const flush = () => {
    if (!block) return;
    const at = `${where}:${offset + block.start + 1}`;
    const depth = block.indent / 2;
    const item = Number.isInteger(depth) && depth > 0 && depth <= open.length ? open[depth - 1] : undefined;
    if (!item) throw new Error(`${at}: a table goes directly under its item, indented one level deeper`);
    if (item.children.length) throw new Error(`${at}: a table goes directly under its item, before the item's details`);
    if (item.table) throw new Error(`${at}: an item has at most one table`);
    item.table = parseTable(block.lines, at);
    block = null;
  };
  lines.forEach((line, i) => {
    if (isTableLine(line)) {
      const indent = line.length - line.trimStart().length;
      if (block && block.end === i - 1 && block.indent === indent) {
        block.lines.push(line);
        block.end = i;
        return;
      }
      flush();
      block = { start: i, end: i, indent, lines: [line] };
      return;
    }
    if (!line.trim()) return;
    flush();
    const m = LINE.exec(line);
    if (!m) throw new Error(`${where}:${offset + i + 1}: not an outline item: ${line}`);
    const depth = m[1].length / 2;
    if (!Number.isInteger(depth) || depth > stack.length - 1) throw new Error(`${where}:${offset + i + 1}: bad indent: ${line}`);
    stack.length = depth + 1;
    const node: Node = { label: m[2], text: m[3] ?? "", children: [] };
    stack[depth].push(node);
    stack.push(node.children);
    open.length = depth;
    open.push(node);
  });
  flush();
  return roots;
}

export function writeOutline(nodes: Node[], depth = 0): string[] {
  return nodes.flatMap((n) => [
    `${"  ".repeat(depth)}${n.label}. ${n.text}`,
    ...(n.table ? writeTable(n.table, "  ".repeat(depth + 1)) : []),
    ...writeOutline(n.children, depth + 1),
  ]);
}

export function parseSpec(src: string, where: string): Spec {
  const lines = src.split("\n");
  const title = /^# (\S+)\s*$/.exec(lines[0] ?? "");
  if (!title) throw new Error(`${where}:1: expected "# <spec-name>"`);
  const first = lines.findIndex((l, i) => i > 0 && LINE.test(l));
  const end = first < 0 ? lines.length : first;
  const purpose = lines.slice(1, end).join("\n").trim();
  return { name: title[1], purpose, items: first < 0 ? [] : parseOutline(lines.slice(first), where, first) };
}

export function writeSpec(s: Spec): string {
  return [`# ${s.name}`, s.purpose, "", ...writeOutline(s.items)].join("\n") + "\n";
}

/** A requirement's name: the text before its first ": ". */
export const reqName = (text: string): string => text.split(": ")[0];

// Labels: requirements are numbered; details cycle a. / i. / 1. by depth below them.
type Kind = "num" | "alpha" | "roman";
export const kindAt = (depth: number): Kind => (depth === 0 ? "num" : (["alpha", "roman", "num"] as const)[(depth - 1) % 3]);

const ROMAN: [number, string][] = [[10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
export function labelFor(kind: Kind, n: number): string {
  if (kind === "num") return String(n);
  if (kind === "roman") {
    let s = "";
    for (const [v, r] of ROMAN) {
      while (n >= v) {
        s += r;
        n -= v;
      }
    }
    return s;
  }
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(97 + ((n - 1) % 26)) + s;
  return s;
}
export function labelValue(kind: Kind, label: string): number {
  if (kind === "num") return Number(label);
  if (kind === "roman") {
    let n = 0;
    for (let i = 0; i < label.length; i++) {
      const v = ROMAN.find(([, r]) => r === label[i])?.[0] ?? NaN;
      const next = ROMAN.find(([, r]) => r === label[i + 1])?.[0] ?? 0;
      n += v < next ? -v : v;
    }
    return n;
  }
  return [...label].reduce((n, c) => n * 26 + c.charCodeAt(0) - 96, 0);
}

/** Gives every item a gapless label in order. */
export function relabel(nodes: Node[], depth = 0): Node[] {
  return nodes.map((n, i) => ({
    label: labelFor(kindAt(depth), i + 1),
    text: n.text,
    ...(n.table ? { table: n.table } : {}),
    children: relabel(n.children, depth + 1),
  }));
}

// Change marks: ~~removed~~ and **added**.
type Marks = "none" | "removed" | "added" | "edit";
const WHOLE_DEL = /^~~(.*)~~$/;
const WHOLE_INS = /^\*\*(.*)\*\*$/;
export function marksOf(text: string): Marks {
  const del = WHOLE_DEL.exec(text);
  if (del && !del[1].includes("~~")) return "removed";
  const ins = WHOLE_INS.exec(text);
  if (ins && !ins[1].includes("**")) return "added";
  return /~~|\*\*/.test(text) ? "edit" : "none";
}
const tidy = (s: string) => s.replace(/ {2,}/g, " ").replace(/ ([.,;:)])/g, "$1").trim();
/** The text before (`old`) and after (`new`) a marked edit; `~~a~~ **b**` swaps a for b. */
export function sides(text: string): { old: string; new: string } {
  const swapped = text.replace(/~~(.+?)~~ \*\*(.+?)\*\*/g, "\u0000$1\u0001$2\u0002");
  const old = swapped.replace(/\u0000(.*?)\u0001.*?\u0002/g, "$1").replace(/\*\*(.+?)\*\*/g, "").replace(/~~(.+?)~~/g, "$1");
  const neu = swapped.replace(/\u0000.*?\u0001(.*?)\u0002/g, "$1").replace(/~~(.+?)~~/g, "").replace(/\*\*(.+?)\*\*/g, "$1");
  return { old: tidy(old), new: tidy(neu) };
}
const plain = (text: string) => sides(text).new;
const same = (a: string, b: string) => tidy(a) === tidy(b);

/** Character offsets of the "## Requirements" section: its heading line through the line before the next "## " heading. */
export function requirementsRange(src: string): { start: number; end: number } | null {
  let at = 0;
  let start = -1;
  for (const line of src.split("\n")) {
    const bare = line.replace(/\r$/, "");
    if (start < 0 && /^## Requirements\s*$/.test(bare)) start = at;
    else if (start >= 0 && /^## /.test(bare)) return { start, end: at };
    at += line.length + 1;
  }
  return start < 0 ? null : { start, end: src.length };
}

/** Reads a change's outline.md: each top-level item under "## Requirements" edits one spec. */
export function parseChange(src: string, where: string): SpecEdit[] {
  const lines = src.split("\n");
  const start = lines.findIndex((l) => /^## Requirements\s*$/.test(l));
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const stop = rest.findIndex((l) => /^## /.test(l));
  const items = parseOutline(stop < 0 ? rest : rest.slice(0, stop), where, start + 1);
  return items.map((node) => ({ spec: (sides(node.text).old || sides(node.text).new).split(":")[0].trim(), node }));
}

const plainTable = (t: Table): Table => ({ columns: t.columns.map(plain), rows: t.rows.map((r) => r.map(plain)) });
const strip = (nodes: Node[]): Node[] =>
  nodes.map((n) => ({ label: n.label, text: plain(n.text), ...(n.table ? { table: plainTable(n.table) } : {}), children: strip(n.children) }));

/** Reports problems in the tables of items a change wrote whole. */
function checkTables(node: Node, here: string, errors: string[], sep = ".") {
  for (const p of node.table ? tableProblems(node.table) : []) if (p.level === "ERROR") errors.push(`${here}: ${p.message}`);
  for (const c of node.children) checkTables(c, `${here}${sep}${c.label}`, errors);
}

/** Applies one spec's edits, returning the new spec (null to delete it) or throwing with every problem found. */
export function applyEdit(live: Spec | null, edit: SpecEdit): Spec | null {
  const errors: string[] = [];
  const top = edit.node;
  if (marksOf(top.text) === "removed") {
    if (!live) errors.push(`${edit.spec}: can't remove a spec that doesn't exist`);
    if (errors.length) throw new Error(errors.join("\n"));
    return null;
  }
  const after = top.text.slice(top.text.indexOf(":") + 1).trim();
  let spec: Spec;
  if (!live) {
    if (!plain(after)) errors.push(`${edit.spec}: a new spec needs a purpose after "${edit.spec}:"`);
    spec = { name: edit.spec, purpose: plain(after), items: [] };
  } else {
    spec = structuredClone(live);
    if (marksOf(after) !== "none") {
      const s = sides(after);
      if (!same(s.old, spec.purpose)) errors.push(`${edit.spec}: purpose doesn't match the live spec`);
      spec.purpose = s.new;
    }
  }
  if (top.table) errors.push(`${edit.spec}: a table goes under a requirement or detail, not under a spec`);
  for (const req of top.children) applyReq(spec, req, `${edit.spec} › `, errors);
  if (errors.length) throw new Error(errors.join("\n"));
  return spec;
}

/** Splits a requirement line into name and sentence, dropping a "(patch)" or "(new)" tag. */
function splitReq(text: string): { name: string; sentence: string; patch: boolean } {
  const m = /^(.*?)(?: \((patch|new)\))?:(?: (.*))?$/.exec(text);
  if (!m) return { name: text, sentence: "", patch: false };
  return { name: m[1], sentence: m[3] ?? "", patch: m[2] === "patch" };
}
const sentenceOf = (text: string) => text.slice(text.indexOf(": ") + 2);

function applyReq(spec: Spec, req: Node, path: string, errors: string[]) {
  const marks = marksOf(req.text);
  const line = splitReq(marks === "removed" || marks === "added" ? sides(req.text)[marks === "added" ? "new" : "old"] : req.text);
  const name = sides(line.name);
  const live = spec.items.find((n) => reqName(n.text) === name.old);
  const here = `${path}${name.old}`;
  if (marks === "removed") {
    if (!live) return void errors.push(`${here}: no such requirement to remove`);
    spec.items.splice(spec.items.indexOf(live), 1);
    return;
  }
  if (!live) {
    if (line.patch) return void errors.push(`${here}: no such requirement to patch`);
    if (!line.sentence) errors.push(`${here}: a new requirement needs a sentence after its name`);
    const next = Math.max(0, ...spec.items.map((n) => Number(n.label))) + 1;
    const node: Node = { label: String(next), text: `${name.new}: ${plain(line.sentence)}`, ...(req.table ? { table: plainTable(req.table) } : {}), children: strip(req.children) };
    checkTables(node, here, errors, " › ");
    spec.items.push(node);
    return;
  }
  if (!line.patch) return void errors.push(`${here}: requirement already exists; mark it "(patch)"`);
  let sentence = sentenceOf(live.text);
  if (marksOf(line.sentence) !== "none") {
    const s = sides(line.sentence);
    if (!same(s.old, sentence)) errors.push(`${here}: struck sentence doesn't match the live requirement`);
    sentence = s.new;
  }
  live.text = `${name.new}: ${sentence}`;
  if (req.table) applyTable(live, req.table, here, errors);
  applyDetails(live.children, req.children, 1, `${here} › `, errors);
}

function applyDetails(live: Node[], edits: Node[], depth: number, path: string, errors: string[]) {
  for (const e of edits) {
    const here = `${path}${e.label}`;
    const node = live.find((n) => n.label === e.label);
    const marks = marksOf(e.text);
    // A label the live spec lacks can only be new, so its text needs no ** marks.
    if (marks === "added" || (marks === "none" && !node && e.text)) {
      if (node) { errors.push(`${here}: label already in use`); continue; }
      const kind = kindAt(depth);
      if (live.some((n) => labelValue(kind, n.label) >= labelValue(kind, e.label)))
        errors.push(`${here}: new items go at the end; use a label after ${live[live.length - 1].label}`);
      const [added] = strip([e]);
      checkTables(added, here, errors);
      live.push(added);
      continue;
    }
    if (!node) { errors.push(`${here}: no such item`); continue; }
    const s = sides(e.text);
    if (marks === "removed") {
      if (!same(s.old, node.text)) errors.push(`${here}: struck text doesn't match the live item`);
      live.splice(live.indexOf(node), 1);
      continue;
    }
    if (marks === "edit") {
      if (!same(s.old, node.text)) errors.push(`${here}: struck text doesn't match the live item`);
      node.text = s.new;
    }
    if (e.table) applyTable(node, e.table, here, errors);
    applyDetails(node.children, e.children, depth + 1, `${here}.`, errors);
  }
}

/** Applies a change's table to the live item's table: rows by id, columns by exact header text. */
function applyTable(node: Node, edit: Table, here: string, errors: string[]) {
  const err = (msg: string) => errors.push(`${here}${msg}`);
  const idHeader = edit.columns[0] ?? "";
  if (idHeader !== "id") {
    return void err(sides(idHeader).old === "id" || sides(idHeader).new === "id"
      ? `: never edit the "id" column; edit a name column instead`
      : `: a table's first column must be "id"`);
  }
  edit.rows.forEach((r, i) => {
    if (r.length !== edit.columns.length) err(` › ${plain(r[0] ?? "") || `row ${i + 1}`}: has ${r.length} cells; the change's header has ${edit.columns.length}`);
  });
  if (!node.table) {
    const marked = edit.columns.find((c) => marksOf(c) !== "none");
    if (marked) return void err(` › [${sides(marked).old || sides(marked).new}]: the item has no table to edit; write a new table's headers unmarked`);
    const struck = edit.rows.find((r) => marksOf(r[0] ?? "") === "removed");
    if (struck) return void err(` › ${sides(struck[0]).old}: the item has no table to remove a row from`);
    node.table = plainTable(edit);
    for (const p of tableProblems(node.table)) if (p.level === "ERROR") err(`: ${p.message}`);
    return;
  }
  const t = node.table;
  for (const r of t.rows) while (r.length < t.columns.length) r.push("");
  // Each change column's index in the live table; null when it's removed or unknown.
  const target: Array<number | null> = [0];
  const removed: number[] = [];
  const added = new Set<number>();
  for (const h of edit.columns.slice(1)) {
    const m = marksOf(h);
    const s = sides(h);
    if (m === "added") {
      if (t.columns.includes(s.new)) err(` › [${s.new}]: column already exists`);
      t.columns.push(s.new);
      for (const r of t.rows) r.push("");
      added.add(t.columns.length - 1);
      target.push(t.columns.length - 1);
      continue;
    }
    const idx = t.columns.indexOf(s.old);
    if (idx === 0) err(`: never edit the "id" column; edit a name column instead`);
    if (idx <= 0) {
      if (idx < 0) err(` › [${s.old}]: no such column`);
      target.push(null);
      continue;
    }
    if (m === "removed") {
      removed.push(idx);
      target.push(null);
      continue;
    }
    if (m === "edit") {
      if (t.columns.includes(s.new)) err(` › [${s.old}]: can't rename to "${s.new}"; that column already exists`);
      t.columns[idx] = s.new;
    }
    target.push(idx);
  }
  const seen = new Set<string>();
  for (const r of edit.rows) {
    const raw = r[0] ?? "";
    const m = marksOf(raw);
    const s = sides(raw);
    if (m === "edit") {
      err(` › ${s.old}: never change an id; edit a name column instead`);
      continue;
    }
    const id = m === "removed" ? s.old : s.new;
    if (!id) {
      err(`: a row has no id`);
      continue;
    }
    if (seen.has(id)) err(` › ${id}: listed twice`);
    seen.add(id);
    const at = t.rows.findIndex((x) => x[0] === id);
    if (m === "removed") {
      if (at < 0) err(` › ${id}: no such row to remove`);
      else t.rows.splice(at, 1);
      continue;
    }
    if (at < 0 || m === "added") {
      if (at >= 0) {
        err(` › ${id}: row already exists`);
        continue;
      }
      const row = t.columns.map(() => "");
      row[0] = id;
      r.slice(1).forEach((c, j) => {
        const idx = target[j + 1];
        if (idx != null) row[idx] = plain(c);
      });
      t.rows.push(row);
      continue;
    }
    const row = t.rows[at];
    r.slice(1).forEach((c, j) => {
      const idx = target[j + 1];
      if (idx == null) return;
      if (added.has(idx)) return void (row[idx] = plain(c));
      if (marksOf(c) === "none") return;
      const cs = sides(c);
      if (!same(cs.old, row[idx])) err(` › ${id} › ${sides(edit.columns[j + 1]).old}: struck text doesn't match the live cell "${row[idx]}"`);
      row[idx] = cs.new;
    });
  }
  for (const idx of removed.sort((a, b) => b - a)) {
    t.columns.splice(idx, 1);
    for (const r of t.rows) r.splice(idx, 1);
  }
  for (const p of tableProblems(t)) if (p.level === "ERROR") err(`: ${p.message}`);
}

/** Every requirement › label path an edit touches, for spotting overlap between pending changes. Pass the live spec to tell new table rows from edited ones. */
export function touches(edit: SpecEdit, live?: Spec | null): string[] {
  const out: string[] = [];
  const known = live !== undefined;
  const walk = (nodes: Node[], liveNodes: Node[] | undefined, prefix: string) =>
    nodes.forEach((n) => {
      const ln = liveNodes?.find((l) => l.label === n.label);
      if (marksOf(n.text) !== "none" || (n.text && !n.children.length && !n.table)) out.push(`${prefix}${n.label}`);
      if (n.table && marksOf(n.text) === "none" && (!known || ln)) tableTouches(n.table, ln?.table, known, `${prefix}${n.label}`, out);
      walk(n.children, ln?.children, `${prefix}${n.label}.`);
    });
  for (const req of edit.node.children) {
    // Read marks from the raw line; a wholly struck or bold line is a removal or addition.
    const whole = marksOf(req.text) === "removed" || marksOf(req.text) === "added";
    const line = splitReq(whole ? sides(req.text).old || sides(req.text).new : req.text);
    const name = sides(line.name).old || sides(line.name).new;
    if (whole || !line.patch || marksOf(line.sentence) !== "none" || marksOf(line.name) !== "none") out.push(`${edit.spec} › ${name}`);
    const liveReq = live?.items.find((n) => reqName(n.text) === name);
    if (req.table && !whole && line.patch) tableTouches(req.table, liveReq?.table, known && !!liveReq, `${edit.spec} › ${name}`, out);
    walk(req.children, liveReq?.children, `${edit.spec} › ${name} › `);
  }
  return out;
}

/** Table paths: `<id> › <Column>` per edited cell, `<id>` per added or removed row, `[Column]` per column change. */
function tableTouches(edit: Table, live: Table | undefined, known: boolean, base: string, out: string[]) {
  const name = (s: string) => sides(s).old || sides(s).new;
  if (known && !live) {
    for (const c of edit.columns.slice(1)) out.push(`${base} › [${plain(c)}]`);
    for (const r of edit.rows) out.push(`${base} › ${plain(r[0] ?? "")}`);
    return;
  }
  for (const c of edit.columns.slice(1)) if (marksOf(c) !== "none") out.push(`${base} › [${name(c)}]`);
  for (const r of edit.rows) {
    const id = name(r[0] ?? "");
    const cells = r.slice(1);
    const exists = live ? live.rows.some((x) => x[0] === id) : cells.every((c) => !c) || cells.some((c) => marksOf(c) !== "none");
    if (marksOf(r[0] ?? "") !== "none" || !exists) {
      out.push(`${base} › ${id}`);
      continue;
    }
    cells.forEach((c, j) => {
      const h = edit.columns[j + 1];
      if (h === undefined || marksOf(c) === "none" || marksOf(h) === "added" || marksOf(h) === "removed") return;
      out.push(`${base} › ${id} › ${name(h)}`);
    });
  }
}
