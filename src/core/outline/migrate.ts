/** Converts old `## Requirements` / `### Requirement:` specs into outlines. */
import { kindAt, labelFor, labelValue, parseOutline, parseSpec, writeSpec, type Node } from './outline.js';

export interface Unplaced {
  line: number;
  text: string;
  reason: string;
}

export interface MigrationResult {
  text: string;
  /** Things worth a look that were still converted, like a TBD purpose. */
  notes: string[];
  /** Lines with no place in an outline; the caller must not write `text` while any exist. */
  unplaced: Unplaced[];
}

const ITEM = /^( *)([0-9]+|[a-z]+)\. (.*)$/;
const LIST = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();
// Bold pairs only; a lone `**` (as in a `**/*.md` glob) or one inside backticks stays.
const unbold = (s: string) => s.replace(/\*\*([^*`]+?)\*\*/g, '$1');

/** True when the file already reads as an outline spec. */
export function isOutlineSpec(src: string): boolean {
  if (/^#{2,} /m.test(src)) return false;
  try {
    parseSpec(src.replace(/\r\n/g, '\n'), 'spec');
    return true;
  } catch {
    return false;
  }
}

interface Requirement {
  name: string;
  line: number;
  body: string[];
  list: string[];
  details: Array<{ line: number; text: string }>;
  scenarios: Array<{ name: string; lines: string[] }>;
}

export function migrateSpec(src: string, name: string): MigrationResult {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const notes: string[] = [];
  const unplaced: Unplaced[] = [];
  const purpose: string[] = [];
  const reqs: Requirement[] = [];
  let section: string | null = null;
  let sub: 'body' | 'details' | 'scenario' | 'other' = 'body';
  let fence: string | null = null;

  const drop = (i: number, reason: string) => unplaced.push({ line: i + 1, text: lines[i], reason });

  lines.forEach((line, i) => {
    const f = FENCE.exec(line);
    if (fence || f) {
      if (f && (fence === null || f[1] === fence)) fence = fence === null ? f[1] : null;
      return void drop(i, 'code block');
    }
    if (i === 0 && /^# /.test(line)) return;
    const h2 = /^## +(.+?)\s*$/.exec(line);
    if (h2) {
      section = h2[1].toLowerCase() === 'purpose' ? 'purpose' : h2[1].toLowerCase() === 'requirements' ? 'requirements' : h2[1];
      if (section !== 'purpose' && section !== 'requirements') drop(i, `section "${h2[1]}"`);
      return;
    }
    if (!line.trim()) return;
    if (section === 'purpose') {
      if (/^#/.test(line)) return void drop(i, 'heading in purpose');
      return void purpose.push(line.trim());
    }
    if (section !== 'requirements') return void drop(i, section ? `section "${section}"` : 'text outside any section');

    const h3 = /^### +Requirement:\s*(.+?)\s*$/.exec(line);
    if (h3) {
      reqs.push({ name: h3[1], line: i + 1, body: [], list: [], details: [], scenarios: [] });
      sub = 'body';
      return;
    }
    if (/^### /.test(line)) return void drop(i, 'heading that is not "### Requirement:"');
    const req = reqs[reqs.length - 1];
    if (!req) return void drop(i, 'text before the first requirement');
    const h4 = /^#### +(.+?)\s*$/.exec(line);
    if (h4) {
      const scenario = /^Scenario:?\s*(.*)$/i.exec(h4[1]);
      if (scenario) {
        req.scenarios.push({ name: scenario[1], lines: [] });
        sub = 'scenario';
      } else if (/^Details$/i.test(h4[1])) {
        sub = 'details';
      } else {
        sub = 'other';
        drop(i, `heading "${h4[1]}"`);
      }
      return;
    }
    if (/^#/.test(line)) return void drop(i, 'heading');
    if (/^\s*\|/.test(line)) return void drop(i, 'table row');
    if (sub === 'other') return void drop(i, 'text under an unknown heading');
    if (sub === 'details') {
      if (!ITEM.test(line)) return void drop(i, 'details line without a label');
      return void req.details.push({ line: i + 1, text: line });
    }
    if (sub === 'scenario') return void req.scenarios[req.scenarios.length - 1].lines.push(line);
    const item = /^\s*(?:[-*+])\s+(.*)$/.exec(line);
    if (item) return void req.list.push(item[1]);
    if (req.list.length) return void drop(i, 'text after a list in a requirement body');
    req.body.push(line.trim());
  });

  const purposeText = tidy(purpose.join(' '));
  if (!purposeText) notes.push('no purpose');
  else if (/^TBD\b/.test(purposeText)) notes.push(`placeholder purpose kept: ${purposeText}`);
  if (ITEM.test(purposeText)) unplaced.push({ line: 0, text: purposeText, reason: 'purpose reads as an outline item' });

  const items: Node[] = reqs.map((req, r) => {
    const sentence = tidy(req.body.join(' '));
    if (!sentence) notes.push(`requirement "${req.name}" has no sentence`);
    if (req.name.includes(': ')) notes.push(`requirement "${req.name}" has ": " in its name`);
    let children: Node[] = [];
    if (req.details.length) {
      try {
        children = parseOutline(req.details.map((d) => d.text), `${name} › ${req.name}`);
      } catch (e) {
        unplaced.push({ line: req.details[0].line, text: req.details[0].text, reason: (e as Error).message });
      }
      if (children.length === 1 && !children[0].children.length && tidy(children[0].text) === sentence) children = [];
    }
    const kind = kindAt(1);
    let next = Math.max(0, ...children.map((n) => labelValue(kind, n.label))) + 1;
    for (const text of req.list) children.push({ label: labelFor(kind, next++), text: tidy(text), children: [] });
    for (const s of req.scenarios) {
      const joined = tidy(s.lines.map((l) => unbold(l.replace(LIST, '$1'))).join(' '));
      const text = joined ? (s.name ? `${s.name}: ${joined}` : joined) : s.name;
      children.push({ label: labelFor(kind, next++), text, children: [] });
    }
    return { label: String(r + 1), text: sentence ? `${req.name}: ${sentence}` : `${req.name}:`, children };
  });

  return { text: writeSpec({ name, purpose: purposeText, items }), notes, unplaced };
}

