import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCLI } from '../helpers/run-cli.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'markdown-mermaid');

let root: string;
const cli = (...args: string[]) => runCLI(args, { cwd: root });

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'outline-spec-validate-markdown-')));
  copyFileSync(path.join(FIXTURES, 'good.md'), path.join(root, 'good.md'));
  copyFileSync(path.join(FIXTURES, 'bad.md'), path.join(root, 'broken.md'));
  writeFileSync(path.join(root, 'none.md'), '# No diagrams\n');
  mkdirSync(path.join(root, 'nested'));
  copyFileSync(path.join(FIXTURES, 'good.md'), path.join(root, 'nested', 'x.md'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('validate --markdown', () => {
  it('checks each named file in the order given, with no outline-spec folder', async () => {
    const nested = path.join('nested', 'x.md');
    const absolute = path.join(root, 'good.md');
    const r = await cli('validate', '--markdown', 'good.md', 'broken.md', 'missing.md', '--markdown', 'none.md', nested, absolute, '--json');
    expect(r.exitCode).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.items.map((i: { id: string }) => i.id)).toEqual(['good.md', 'broken.md', 'missing.md', 'none.md', nested, absolute]);
    expect(out.items.map((i: { valid: boolean }) => i.valid)).toEqual([true, false, false, true, true, true]);
    expect(out.items.every((i: { type: string }) => i.type === 'markdown')).toBe(true);
    expect(out.items[1].issues).toEqual([{
      level: 'ERROR', path: 'broken.md:5', file: 'broken.md', line: 5,
      message: expect.stringMatching(/^Mermaid diagram does not parse: Parse error on line 4/),
      error: expect.stringMatching(/^Parse error on line 4/),
    }]);
    expect(out.items[2].issues).toEqual([{ level: 'ERROR', path: 'missing.md', file: 'missing.md', message: expect.stringContaining('missing.md') }]);
    expect(out.summary).toEqual({ totals: { items: 6, passed: 4, failed: 2 }, byType: { markdown: { items: 6, passed: 4, failed: 2 } } });
    expect(out.version).toBe('1.0');
    expect(existsSync(path.join(root, 'outline-spec'))).toBe(false);
  }, 60_000);

  it('refuses another way of choosing what to validate, and checks nothing', async () => {
    const r = await cli('validate', '--markdown', 'broken.md', '--all', '--json');
    expect(r.exitCode).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.items).toBeUndefined();
    expect(out.status[0].message).toMatch(/--markdown checks only the files it names.*--all/);
  });
});
