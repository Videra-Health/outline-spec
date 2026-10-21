/** Reads and writes outline specs and change outlines on disk. */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import { applyEdit, parseChange, parseSpec, touches, writeSpec, type Spec, type SpecEdit } from './outline.js';
import { folderStyleNameProblem } from '../id.js';

export const CHANGE_OUTLINE = 'outline.md';
/** A live spec is `specs/<id>.md`. */
export const SPEC_EXT = '.md';
/** The old layout's file name, `specs/<id>/spec.md`; only the guard and migrate-specs look for it. */
export const OLD_SPEC_FILE = 'spec.md';
/** Where sync records the edits it applied; a record only, never read as an artifact or outline. */
export const APPLIED_DIR = 'applied';

export type SpecAction = 'updated' | 'created' | 'deleted';
export type SpecPlan = Map<string, Spec | null>;

/** Spec ids may be nested (`area/name`), so each segment is checked on its own. */
export function specNameProblem(name: string): string | null {
  const segments = name.split('/');
  const problem = segments.map((s) => folderStyleNameProblem(s, 'Spec name')).find(Boolean);
  if (problem) return problem;
  // `area/spec.md` would read as an old-layout spec for `area`.
  return segments.length > 1 && segments[segments.length - 1] === 'spec' ? "A nested spec name must not end in 'spec'" : null;
}

export function specFile(specsDir: string, name: string): string {
  return path.join(specsDir, ...name.split('/')) + SPEC_EXT;
}

/** Old-layout spec files (`<id>/spec.md`) under `specsDir`, as `/`-joined paths relative to it. */
export function findOldLayoutSpecs(specsDir: string): string[] {
  const found: string[] = [];
  const walk = (dir: string, segments: string[]): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT' || (err as NodeJS.ErrnoException).code === 'ENOTDIR') return;
      throw err;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory()) walk(path.join(dir, e.name), [...segments, e.name]);
      else if (e.name === OLD_SPEC_FILE && segments.length > 0) found.push([...segments, e.name].join('/'));
    }
  };
  walk(specsDir, []);
  return found.sort();
}

/** Removes folders emptied under `specsDir`, from `dir` upward, never `specsDir` itself. */
export function removeEmptySpecFolders(specsDir: string, dir: string): void {
  const root = path.resolve(specsDir);
  for (let d = path.resolve(dir); d !== root && d.startsWith(root + path.sep); d = path.dirname(d)) {
    if (!existsSync(d) || readdirSync(d).length > 0) return;
    rmdirSync(d);
  }
}

/** The on-disk id when it differs from `name` only in case, as a case-insensitive file system allows. */
function caseConflict(specsDir: string, name: string): string | null {
  const wanted = [...name.split('/').slice(0, -1), name.split('/').pop()! + SPEC_EXT];
  const actual: string[] = [];
  let dir = specsDir;
  for (const seg of wanted) {
    const found = readdirSync(dir).find((e) => e.toLowerCase() === seg.toLowerCase()) ?? seg;
    actual.push(found);
    dir = path.join(dir, found);
  }
  const id = actual.join('/').slice(0, -SPEC_EXT.length);
  return id === name ? null : id;
}

export function readLiveSpec(specsDir: string, name: string): Spec | null {
  const file = specFile(specsDir, name);
  if (!existsSync(file)) return null;
  const other = caseConflict(specsDir, name);
  if (other) throw new Error(`${name}: conflicts with spec '${other}'; spec names differing only in case can't coexist`);
  return parseSpec(readFileSync(file, 'utf-8').replace(/\r\n/g, '\n'), file);
}

/** Open changes: every directory under changes/ except `archive` (left by older projects) and dot dirs. */
export function listChanges(changesDir: string): string[] {
  if (!existsSync(changesDir)) return [];
  return readdirSync(changesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== 'archive' && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort();
}

export function changeOutlinePath(changesDir: string, change: string): string {
  return path.join(changesDir, change, CHANGE_OUTLINE);
}

export function hasChangeOutline(changesDir: string, change: string): boolean {
  const file = changeOutlinePath(changesDir, change);
  return existsSync(file) && statSync(file).isFile();
}

export function readChangeEdits(changesDir: string, change: string): SpecEdit[] {
  const file = changeOutlinePath(changesDir, change);
  if (!existsSync(file)) throw new Error(`${change}: no ${CHANGE_OUTLINE}`);
  return parseChange(readFileSync(file, 'utf-8').replace(/\r\n/g, '\n'), path.join(change, CHANGE_OUTLINE));
}

/** Every spec a change would write, or an error listing every problem. Nothing touches disk. */
export function planEdits(specsDir: string, edits: SpecEdit[]): SpecPlan {
  const out: SpecPlan = new Map();
  const errors: string[] = [];
  for (const edit of edits) {
    const problem = specNameProblem(edit.spec);
    if (problem) {
      errors.push(`${edit.spec}: ${problem}`);
      continue;
    }
    try {
      const live = out.has(edit.spec) ? out.get(edit.spec)! : readLiveSpec(specsDir, edit.spec);
      out.set(edit.spec, applyEdit(live, edit));
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return out;
}

/** What each edit touches, read against the live spec when it parses so new table rows read as adds. */
export function editTouches(specsDir: string, edits: SpecEdit[]): string[] {
  return edits.flatMap((edit) => {
    let live: Spec | null | undefined;
    try {
      live = specNameProblem(edit.spec) ? undefined : readLiveSpec(specsDir, edit.spec);
    } catch {
      live = undefined;
    }
    return touches(edit, live);
  });
}

export function planChange(specsDir: string, changesDir: string, change: string): SpecPlan {
  return planEdits(specsDir, readChangeEdits(changesDir, change));
}

export function describePlan(specsDir: string, plan: SpecPlan): Array<{ name: string; action: SpecAction }> {
  return [...plan].map(([name, spec]) => ({
    name,
    action: spec === null ? 'deleted' : existsSync(specFile(specsDir, name)) ? 'updated' : 'created',
  }));
}

/** Writes a plan: new specs get their area folders, removed specs lose their file and any area folders left empty. */
export function writePlan(specsDir: string, plan: SpecPlan): void {
  for (const [name, spec] of plan) {
    const file = specFile(specsDir, name);
    if (spec) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, writeSpec(spec));
    } else {
      rmSync(file, { force: true });
      removeEmptySpecFolders(specsDir, path.dirname(file));
    }
  }
}

/** The specs a pending change edits, for refusing relabels underneath it. */
export function changesEditing(changesDir: string, spec: string): string[] {
  return listChanges(changesDir).filter((c) => {
    if (!hasChangeOutline(changesDir, c)) return false;
    try {
      return readChangeEdits(changesDir, c).some((e) => e.spec === spec);
    } catch {
      // An unreadable outline might edit this spec, so it blocks too.
      return true;
    }
  });
}
