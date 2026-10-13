/** Reads and writes outline specs and change outlines on disk. */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import { applyEdit, parseChange, parseSpec, touches, writeSpec, type Spec, type SpecEdit } from './outline.js';
import { folderStyleNameProblem } from '../id.js';

export const CHANGE_OUTLINE = 'outline.md';

export type SpecAction = 'updated' | 'created' | 'deleted';
export type SpecPlan = Map<string, Spec | null>;

/** Spec ids may be nested (`area/name`), so each segment is checked on its own. */
export function specNameProblem(name: string): string | null {
  return name.split('/').map((s) => folderStyleNameProblem(s, 'Spec name')).find(Boolean) ?? null;
}

export function specFile(specsDir: string, name: string): string {
  return path.join(specsDir, ...name.split('/'), 'spec.md');
}

export function readLiveSpec(specsDir: string, name: string): Spec | null {
  const file = specFile(specsDir, name);
  return existsSync(file) ? parseSpec(readFileSync(file, 'utf-8').replace(/\r\n/g, '\n'), file) : null;
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

/** Writes a plan: new specs get folders, removed specs lose their file and folder. */
export function writePlan(specsDir: string, plan: SpecPlan): void {
  for (const [name, spec] of plan) {
    const file = specFile(specsDir, name);
    if (spec) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, writeSpec(spec));
    } else {
      rmSync(path.dirname(file), { recursive: true, force: true });
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
