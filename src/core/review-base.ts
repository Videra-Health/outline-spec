/** Reads what a pull request's work changed since a base commit, through git only. */
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { GIT_EXEC_OPTIONS } from './store/git.js';
import { SPEC_EXT } from './outline/specs.js';

const git = (cwd: string, args: string[]): string => execFileSync('git', ['-C', cwd, ...args], { ...GIT_EXEC_OPTIONS, stdio: ['ignore', 'pipe', 'pipe'] });
const nulList = (out: string): string[] => out.split('\0').filter(Boolean);

/** The commit `ref` names, or an error naming the ref. */
export function resolveBase(cwd: string, ref: string): string {
  try {
    return git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
  } catch {
    throw new Error(`Can't resolve base '${ref}' to a commit`);
  }
}

/** `dir` relative to `top`, `/`-joined whatever the platform's separator; '' when they're the same. */
export function toRepoPath(top: string, dir: string, p: path.PlatformPath = path): string {
  return p.relative(p.resolve(top), p.resolve(dir)).split(p.sep).filter(Boolean).join('/');
}

/** A directory's path from the repository's top level, as git names it; links are resolved, as git resolves its top level. */
export function repoPath(cwd: string, dir: string): string {
  const real = (p: string) => (existsSync(p) ? realpathSync.native(p) : path.resolve(p));
  return toRepoPath(real(git(cwd, ['rev-parse', '--show-toplevel']).trim()), real(dir));
}

const under = (prefix: string, p: string): string | null => {
  if (!prefix) return p;
  return p.startsWith(`${prefix}/`) ? p.slice(prefix.length + 1) : null;
};

/** Paths changed between `sha` and the working tree, relative to the top level. */
export function changedPaths(cwd: string, sha: string): string[] {
  return nulList(git(cwd, ['diff', '--name-only', '-z', sha]));
}

/** Spec id to text for every spec under `specsPrefix` at `sha`. */
export function baseSpecTexts(cwd: string, sha: string, specsPrefix: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of nulList(git(cwd, ['ls-tree', '-r', '--name-only', '-z', sha, '--', `${specsPrefix}/`]))) {
    const rel = under(specsPrefix, file);
    if (!rel || !rel.endsWith(SPEC_EXT) || rel.split('/').some((s) => s.startsWith('.'))) continue;
    out.set(rel.slice(0, -SPEC_EXT.length), git(cwd, ['show', `${sha}:${file}`]).replace(/\r\n/g, '\n'));
  }
  return out;
}

/** Open changes with a file changed since the base that still exist; `archive` and dot folders aren't changes. */
export function touchedChanges(changed: string[], changesPrefix: string, changesDir: string): string[] {
  const names = new Set<string>();
  for (const p of changed) {
    const rel = under(changesPrefix, p);
    const name = rel?.split('/')[0];
    if (!rel || !name || rel === name || name === 'archive' || name.startsWith('.')) continue;
    const dir = path.join(changesDir, name);
    if (existsSync(dir) && statSync(dir).isDirectory()) names.add(name);
  }
  return [...names].sort();
}

/** The current branch's name, or the short commit when detached. */
export function branchName(cwd: string): string {
  const name = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  return name === 'HEAD' ? git(cwd, ['rev-parse', '--short', 'HEAD']).trim() : name;
}
