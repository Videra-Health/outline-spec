/** Builds a change's review page: the banner, file tabs, and the spec-changes view. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { diffWords } from 'diff';
import { collectPending } from '../commands/pending.js';
import type { ReviewTab } from './artifact-graph/types.js';
import { marksOf, reqName, sides, touches, writeOutline, type Node, type Spec, type SpecEdit } from './outline/outline.js';
import { planChange, readChangeEdits, readLiveSpec } from './outline/specs.js';
import { writeTable } from './outline/table.js';
import { Validator } from './validation/validator.js';

export type Segment = { text: string; added?: true; removed?: true };

export interface RequirementChange {
  label: string;
  name: string;
  renamedFrom?: string;
  kind: 'added' | 'edited' | 'removed';
  /** Live text, for edited and removed requirements. */
  live?: string;
  /** Text after archive, for added and edited requirements. */
  after?: string;
  /** Word diff of live against after, for edited requirements. */
  segments?: Segment[];
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

export type ReviewPageTab =
  | { title: string; kind: 'markdown'; files: Array<{ name: string; markdown: string }> }
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

function wordDiff(live: string, after: string): Segment[] {
  return diffWords(live, after).map((p) => ({ text: p.value, ...(p.added ? { added: true } : p.removed ? { removed: true } : {}) }));
}

function whole(node: Node, kind: 'added' | 'removed'): RequirementChange {
  const body = requirementBody(node);
  return { label: node.label, name: reqName(node.text), kind, ...(kind === 'added' ? { after: body } : { live: body }) };
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
      segments: wordDiff(liveText, afterText),
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
      .filter((name) => existsSync(path.join(changeDir, name)))
      .map((name) => ({ name, markdown: readFileSync(path.join(changeDir, name), 'utf-8').replace(/\r\n/g, '\n') }));
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
