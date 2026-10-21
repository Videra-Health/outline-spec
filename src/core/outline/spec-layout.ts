/** Moves old-layout specs (`<id>/spec.md`) to the flat layout (`<id>.md`). */
import { execFile } from 'node:child_process';
import { existsSync, promises as fs, readdirSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { GIT_EXEC_OPTIONS, GIT_WRITE_EXEC_OPTIONS } from '../store/git.js';
import { findOldLayoutSpecs, OLD_SPEC_FILE, removeEmptySpecFolders, specFile, specNameProblem } from './specs.js';

const execFileAsync = promisify(execFile);

export interface LayoutMove {
  id: string;
  /** Absolute paths. */
  from: string;
  to: string;
}

export interface LayoutConflict extends LayoutMove {
  reason: string;
}

export interface LayoutPlan {
  moves: LayoutMove[];
  conflicts: LayoutConflict[];
}

/** A folder a move left behind because it still holds other files. */
export interface KeptFolder {
  dir: string;
  files: string[];
}

export function planSpecLayout(specsDir: string): LayoutPlan {
  const plan: LayoutPlan = { moves: [], conflicts: [] };
  for (const rel of findOldLayoutSpecs(specsDir)) {
    const id = rel.slice(0, -(OLD_SPEC_FILE.length + 1));
    const from = path.join(specsDir, ...rel.split('/'));
    const to = specFile(specsDir, id);
    const problem = specNameProblem(id);
    if (problem) plan.conflicts.push({ id, from, to, reason: problem });
    else if (existsSync(to)) plan.conflicts.push({ id, from, to, reason: `${path.basename(to)} already exists` });
    else plan.moves.push({ id, from, to });
  }
  return plan;
}

async function inGitWorkTree(dir: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], GIT_EXEC_OPTIONS);
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

/** Applies the moves: a git rename inside a work tree, a plain move otherwise. Returns folders kept for other files. */
export async function applySpecLayout(specsDir: string, plan: LayoutPlan, options: { git?: boolean } = {}): Promise<KeptFolder[]> {
  const git = options.git !== false && plan.moves.length > 0 && (await inGitWorkTree(specsDir));
  const kept: KeptFolder[] = [];
  for (const move of plan.moves) {
    await fs.mkdir(path.dirname(move.to), { recursive: true });
    let moved = false;
    if (git) {
      try {
        await execFileAsync('git', ['mv', move.from, move.to], { ...GIT_WRITE_EXEC_OPTIONS, cwd: specsDir });
        moved = true;
      } catch {
        // An untracked spec can't be git-moved; a plain move still works.
      }
    }
    if (!moved) await fs.rename(move.from, move.to);
  }
  // Checked after every move, so a folder holding only moved specs isn't reported.
  const targets = new Set(plan.moves.map((m) => m.to));
  for (const dir of [...new Set(plan.moves.map((m) => path.dirname(m.from)))].sort().reverse()) {
    if (!existsSync(dir)) continue;
    const files = filesUnder(dir).filter((f) => !targets.has(f));
    if (files.length > 0) kept.push({ dir, files: files.map((f) => path.relative(dir, f)) });
    else removeEmptySpecFolders(specsDir, dir);
  }
  return kept.reverse();
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? filesUnder(p) : [p];
  }).sort();
}
