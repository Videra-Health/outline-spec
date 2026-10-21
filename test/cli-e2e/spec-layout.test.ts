import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCLI } from '../helpers/run-cli.js';
import { isolatedGitEnv } from '../helpers/store-git.js';

const SPEC = (name: string) => `# ${name}\nA ${name} spec.\n\n1. Thing: It does a thing.\n`;

let root: string;
const file = (...p: string[]) => path.join(root, 'outline-spec', ...p);
const write = (rel: string, text: string) => {
  const f = file(...rel.split('/'));
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, text);
};
const cli = (...args: string[]) => runCLI(args, { cwd: root, env: isolatedGitEnv(root) });
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, env: { ...process.env, ...isolatedGitEnv(root) }, encoding: 'utf8' });

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'outline-spec-layout-'));
  write('config.yaml', 'schema: outline\n');
  write('changes/.keep', '');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('old spec layout is refused', () => {
  beforeEach(() => {
    write('specs/auth/spec.md', SPEC('auth'));
    write('specs/platform/session/spec.md', SPEC('platform/session'));
  });

  it('lists each old-layout spec and points at migrate-specs', async () => {
    const r = await cli('list', '--specs');
    expect(r.exitCode).not.toBe(0);
    const out = r.stdout + r.stderr;
    expect(out).toContain('outline-spec/specs/auth/spec.md');
    expect(out).toContain('outline-spec/specs/platform/session/spec.md');
    expect(out).toContain('outline-spec migrate-specs');
  });

  it('reports the error as JSON with its code and paths', async () => {
    const r = await cli('validate', '--specs', '--json');
    expect(r.exitCode).not.toBe(0);
    const status = JSON.parse(r.stdout).status[0];
    expect(status).toMatchObject({
      code: 'old_spec_layout',
      paths: ['outline-spec/specs/auth/spec.md', 'outline-spec/specs/platform/session/spec.md'],
    });
  });

  it('refuses archive and the noun-form spec commands too', async () => {
    write('changes/c1/outline.md', '## Proposal\nWhy.\n\n## Requirements\n');
    const archive = await cli('archive', 'c1', '--json');
    expect(JSON.parse(archive.stdout).status[0].code).toBe('old_spec_layout');
    const show = await cli('spec', 'show', 'auth');
    expect(show.exitCode).not.toBe(0);
    expect(show.stderr).toContain('outline-spec migrate-specs');
  });
});

describe('migrate-specs moves specs to the flat layout', () => {
  it('moves each spec as a git rename and removes emptied folders', async () => {
    write('specs/auth/spec.md', SPEC('auth'));
    write('specs/platform/session/spec.md', SPEC('platform/session'));
    git('init', '-q');
    git('add', '.');
    git('commit', '-qm', 'init');

    const r = await cli('migrate-specs', '--json');
    expect(r.exitCode).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.moves).toEqual([
      { id: 'auth', from: 'outline-spec/specs/auth/spec.md', to: 'outline-spec/specs/auth.md' },
      { id: 'platform/session', from: 'outline-spec/specs/platform/session/spec.md', to: 'outline-spec/specs/platform/session.md' },
    ]);
    expect(out.conflicts).toEqual([]);
    expect(readFileSync(file('specs', 'auth.md'), 'utf-8')).toBe(SPEC('auth'));
    expect(existsSync(file('specs', 'auth'))).toBe(false);
    expect(existsSync(file('specs', 'platform', 'session'))).toBe(false);
    const staged = git('status', '--porcelain');
    expect(staged).toContain('R  outline-spec/specs/auth/spec.md -> outline-spec/specs/auth.md');

    const list = await cli('list', '--specs', '--json');
    expect(JSON.parse(list.stdout).specs.map((s: { id: string }) => s.id)).toEqual(['auth', 'platform/session']);
  });

  it('moves files outside git and keeps a folder that holds other files', async () => {
    write('specs/auth/spec.md', SPEC('auth'));
    write('specs/auth/notes.txt', 'notes\n');
    const r = await cli('migrate-specs');
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('outline-spec/specs/auth/spec.md moved to outline-spec/specs/auth.md');
    expect(r.stdout).toContain('kept outline-spec/specs/auth/ for: notes.txt');
    expect(existsSync(file('specs', 'auth.md'))).toBe(true);
    expect(existsSync(file('specs', 'auth', 'notes.txt'))).toBe(true);
  });

  it('reports a conflict, moves the rest, and exits non-zero', async () => {
    write('specs/auth/spec.md', SPEC('auth'));
    write('specs/auth.md', SPEC('auth'));
    write('specs/billing/spec.md', SPEC('billing'));
    const r = await cli('migrate-specs', '--json');
    expect(r.exitCode).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.conflicts).toEqual([expect.objectContaining({ id: 'auth', reason: 'auth.md already exists' })]);
    expect(out.moves.map((m: { id: string }) => m.id)).toEqual(['billing']);
    expect(existsSync(file('specs', 'auth', 'spec.md'))).toBe(true);
    expect(existsSync(file('specs', 'billing.md'))).toBe(true);
  });

  it('lists moves on --dry-run and touches nothing', async () => {
    write('specs/auth/spec.md', SPEC('auth'));
    const r = await cli('migrate-specs', '--dry-run');
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('outline-spec/specs/auth/spec.md would move to outline-spec/specs/auth.md');
    expect(r.stdout).toContain('auth: already an outline');
    expect(existsSync(file('specs', 'auth', 'spec.md'))).toBe(true);
    expect(existsSync(file('specs', 'auth.md'))).toBe(false);
  });

  it('says so when every spec is already flat', async () => {
    write('specs/auth.md', SPEC('auth'));
    const r = await cli('migrate-specs');
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('No old-layout specs to move.');
  });
});
