/** Outline specs: parse, patch from a change's outline.md, and write back. See docs/outlines.md. */

export type Node = { label: string; text: string; children: Node[] };
export type Spec = { name: string; purpose: string; items: Node[] };
export type SpecEdit = { spec: string; node: Node };

const LINE = /^( *)([0-9]+|[a-z]+)\.(?: (.*))?$/;

/** Parses indented `label. text` lines (two spaces per level) into a tree. */
export function parseOutline(lines: string[], where: string): Node[] {
  const roots: Node[] = [];
  const stack: Node[][] = [roots];
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const m = LINE.exec(line);
    if (!m) throw new Error(`${where}:${i + 1}: not an outline item: ${line}`);
    const depth = m[1].length / 2;
    if (!Number.isInteger(depth) || depth > stack.length - 1) throw new Error(`${where}:${i + 1}: bad indent: ${line}`);
    stack.length = depth + 1;
    const node = { label: m[2], text: m[3] ?? "", children: [] };
    stack[depth].push(node);
    stack.push(node.children);
  });
  return roots;
}

export function writeOutline(nodes: Node[], depth = 0): string[] {
  return nodes.flatMap((n) => [`${"  ".repeat(depth)}${n.label}. ${n.text}`, ...writeOutline(n.children, depth + 1)]);
}

export function parseSpec(src: string, where: string): Spec {
  const lines = src.split("\n");
  const title = /^# (\S+)\s*$/.exec(lines[0] ?? "");
  if (!title) throw new Error(`${where}:1: expected "# <spec-name>"`);
  const first = lines.findIndex((l, i) => i > 0 && LINE.test(l));
  const end = first < 0 ? lines.length : first;
  const purpose = lines.slice(1, end).join("\n").trim();
  return { name: title[1], purpose, items: first < 0 ? [] : parseOutline(lines.slice(first), where) };
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
  return nodes.map((n, i) => ({ label: labelFor(kindAt(depth), i + 1), text: n.text, children: relabel(n.children, depth + 1) }));
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

/** Reads a change's outline.md: each top-level item under "## Requirements" edits one spec. */
export function parseChange(src: string, where: string): SpecEdit[] {
  const lines = src.split("\n");
  const start = lines.findIndex((l) => /^## Requirements\s*$/.test(l));
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const stop = rest.findIndex((l) => /^## /.test(l));
  const items = parseOutline(stop < 0 ? rest : rest.slice(0, stop), where);
  return items.map((node) => ({ spec: (sides(node.text).old || sides(node.text).new).split(":")[0].trim(), node }));
}

const strip = (nodes: Node[]): Node[] => nodes.map((n) => ({ label: n.label, text: plain(n.text), children: strip(n.children) }));

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
    spec.items.push({ label: String(next), text: `${name.new}: ${plain(line.sentence)}`, children: strip(req.children) });
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
      live.push({ label: e.label, text: plain(e.text), children: strip(e.children) });
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
    applyDetails(node.children, e.children, depth + 1, `${here}.`, errors);
  }
}

/** Every requirement › label path an edit touches, for spotting overlap between pending changes. */
export function touches(edit: SpecEdit): string[] {
  const out: string[] = [];
  const walk = (nodes: Node[], prefix: string) =>
    nodes.forEach((n) => {
      if (marksOf(n.text) !== "none" || (n.text && !n.children.length)) out.push(`${prefix}${n.label}`);
      walk(n.children, `${prefix}${n.label}.`);
    });
  for (const req of edit.node.children) {
    const line = splitReq(sides(req.text).old || sides(req.text).new);
    const name = sides(line.name).old;
    if (!line.patch || marksOf(line.sentence) !== "none" || marksOf(line.name) !== "none") out.push(`${edit.spec} › ${name}`);
    walk(req.children, `${edit.spec} › ${name} › `);
  }
  return out;
}
