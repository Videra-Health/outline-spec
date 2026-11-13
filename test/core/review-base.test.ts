import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { baseSpecTexts, branchName, changedPaths, repoPath, resolveBase, toRepoPath, touchedChanges } from '../../src/core/review-base.js';

let repo: string;
const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
const write = (rel: string, text: string) => {
  const file = path.join(repo, ...rel.split('/'));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};
const commit = (msg: string) => {
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', msg);
  return git('rev-parse', 'HEAD');
};

beforeEach(() => {
  repo = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'outline-spec-review-base-')));
  git('init', '-q', '-b', 'main');
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('resolveBase', () => {
  it('names the commit a ref points at', () => {
    write('a.txt', 'a');
    const sha = commit('one');
    expect(resolveBase(repo, 'main')).toBe(sha);
  });

  it('fails naming a ref git cannot resolve', () => {
    write('a.txt', 'a');
    commit('one');
    expect(() => resolveBase(repo, 'nope')).toThrow("Can't resolve base 'nope' to a commit");
  });
});

describe('toRepoPath', () => {
  it('joins with / on Windows paths', () => {
    expect(toRepoPath('C:\\work\\repo', 'C:\\work\\repo\\docs\\outline-spec\\specs', path.win32)).toBe('docs/outline-spec/specs');
  });

  it('is empty at the top level', () => {
    expect(toRepoPath('/work/repo', '/work/repo', path.posix)).toBe('');
  });
});

describe('changes since a base', () => {
  it('finds only changes with a file changed since the base that still exist', () => {
    write('outline-spec/changes/stale/outline.md', 'old');
    write('outline-spec/changes/gone/outline.md', 'old');
    const base = commit('base');
    write('outline-spec/changes/stale/notes.txt', 'untracked files are not part of the diff');
    write('outline-spec/changes/fresh/outline.md', 'new');
    write('outline-spec/changes/archive/old/outline.md', 'archived');
    write('outline-spec/changes/README.md', 'not a change');
    rmSync(path.join(repo, 'outline-spec', 'changes', 'gone'), { recursive: true });
    git('add', 'outline-spec/changes/fresh', 'outline-spec/changes/archive', 'outline-spec/changes/README.md', '-A', 'outline-spec/changes/gone');
    const changed = changedPaths(repo, base);
    const changesDir = path.join(repo, 'outline-spec', 'changes');
    expect(touchedChanges(changed, repoPath(repo, changesDir), changesDir)).toEqual(['fresh']);
  });

  it('reads each spec as it was at the base, nested ones by their / id', () => {
    write('outline-spec/specs/ships.md', '# ships\nOld.\n');
    write('outline-spec/specs/area/cargo.md', '# cargo\nOld.\n');
    write('outline-spec/specs/notes.txt', 'not a spec');
    const base = commit('base');
    write('outline-spec/specs/ships.md', '# ships\nNew.\n');
    commit('edit');
    const texts = baseSpecTexts(repo, base, repoPath(repo, path.join(repo, 'outline-spec', 'specs')));
    expect([...texts.keys()].sort()).toEqual(['area/cargo', 'ships']);
    expect(texts.get('ships')).toBe('# ships\nOld.\n');
  });
});

describe('branchName', () => {
  it('names the current branch, or the short commit when detached', () => {
    write('a.txt', 'a');
    const sha = commit('one');
    expect(branchName(repo)).toBe('main');
    git('checkout', '-q', '--detach');
    expect(sha.startsWith(branchName(repo))).toBe(true);
  });
});
