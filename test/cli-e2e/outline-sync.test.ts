import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCLI } from '../helpers/run-cli.js';

const HULL = `# hull
Ships have a hull.

1. Plating: Hull plating stops damage.
2. Repair: Docks repair the hull.
`;
const SHIPS = `# ships
Every hull the yards sell.

1. Catalog: The yards sell these hulls.
  | id | Name | Cost |
  |---|---|---|
  | prototype | Prototype | 12000 |
  | m60 | M-60 Courier | 8000 |
`;

const REQS = '1. hull:\n  a. Plating (patch): Hull plating stops ~~damage~~ **most damage**.\n';
const outline = (reqs: string) =>
  `# Outline\n\n## Proposal\nWhy.\n\n## Requirements\n${reqs}\n## Out of Scope\nNothing   here.\n`;

let root: string;
const file = (...p: string[]) => path.join(root, 'outline-spec', ...p);
const write = (rel: string, text: string) => {
  mkdirSync(path.dirname(file(rel)), { recursive: true });
  writeFileSync(file(rel), text);
};
const read = (rel: string) => readFileSync(file(rel), 'utf-8');
const cli = (...args: string[]) => runCLI(args, { cwd: root });
const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'outline-spec-sync-'));
  write('config.yaml', 'schema: outline\n');
  write('specs/hull/spec.md', HULL);
  write('specs/ships/spec.md', SHIPS);
  write('changes/c1/outline.md', outline(REQS));
  write('changes/c1/tasks.md', '- [ ] 1.1 Not yet\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('outline-spec sync', () => {
  it('applies the edits, records them under applied/, and empties Requirements', async () => {
    const r = await cli('sync', 'c1', '--yes');
    expect(r.exitCode).toBe(0);
    expect(read('specs/hull/spec.md')).toContain('1. Plating: Hull plating stops most damage.');

    const name = `${today()}-1.md`;
    expect(readdirSync(file('changes/c1/applied'))).toEqual([name]);
    expect(read(`changes/c1/applied/${name}`)).toBe(`# Applied ${today()}\n\nChange: c1\n\n## Requirements\n${REQS}`);
    expect(read('changes/c1/outline.md')).toBe(
      '# Outline\n\n## Proposal\nWhy.\n\n## Requirements\n\n## Out of Scope\nNothing   here.\n'
    );
    // Sync doesn't check tasks and keeps the change open.
    expect(read('changes/c1/tasks.md')).toBe('- [ ] 1.1 Not yet\n');
  });

  it('numbers a second sync on the same day -2', async () => {
    expect((await cli('sync', 'c1', '--yes')).exitCode).toBe(0);
    write('changes/c1/outline.md', outline('1. hull:\n  b. Repair (patch): Docks repair the hull **for a fee**.\n'));
    const r = await cli('sync', 'c1', '--yes', '--json');
    expect(JSON.parse(r.stdout).applied).toBe(`outline-spec/changes/c1/applied/${today()}-2.md`);
    expect(readdirSync(file('changes/c1/applied')).sort()).toEqual([`${today()}-1.md`, `${today()}-2.md`]);
    expect(read('specs/hull/spec.md')).toContain('2. Repair: Docks repair the hull for a fee.');
  });

  it('reports nothing to sync and writes nothing when Requirements is empty', async () => {
    write('changes/c1/outline.md', outline(''));
    const r = await cli('sync', 'c1');
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('Nothing to sync');
    expect(existsSync(file('changes/c1/applied'))).toBe(false);
    expect(read('changes/c1/outline.md')).toBe(outline(''));

    const j = await cli('sync', 'c1', '--json');
    expect(JSON.parse(j.stdout)).toMatchObject({ synced: 'c1', specs: [], applied: null });
  });

  it('leaves everything untouched on a mismatch', async () => {
    write('changes/c1/outline.md', outline('1. hull:\n  a. Plating (patch): Hull plating stops ~~lasers~~ **beams**.\n'));
    const before = read('changes/c1/outline.md');
    const r = await cli('sync', 'c1', '--yes');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr + r.stdout).toMatch(/Cannot sync 'c1'; nothing was written:[\s\S]*struck sentence doesn't match/);
    expect(read('specs/hull/spec.md')).toBe(HULL);
    expect(read('changes/c1/outline.md')).toBe(before);
    expect(existsSync(file('changes/c1/applied'))).toBe(false);

    const j = await cli('sync', 'c1', '--json');
    expect(j.exitCode).toBe(1);
    expect(JSON.parse(j.stdout)).toMatchObject({ synced: null, specs: [], applied: null, status: [{ code: 'sync_conflicts' }] });
  });

  it('prints the result and the applied/ path on --dry-run and writes nothing', async () => {
    const r = await cli('sync', 'c1', '--dry-run');
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('--- outline-spec/specs/hull/spec.md (updated)');
    expect(r.stdout).toContain('1. Plating: Hull plating stops most damage.');
    expect(r.stdout).toContain(`outline-spec/changes/c1/applied/${today()}-1.md`);
    expect(read('specs/hull/spec.md')).toBe(HULL);
    expect(read('changes/c1/outline.md')).toBe(outline(REQS));
    expect(existsSync(file('changes/c1/applied'))).toBe(false);

    const j = JSON.parse((await cli('sync', 'c1', '--dry-run', '--json')).stdout);
    expect(j).toMatchObject({
      synced: 'c1',
      dryRun: true,
      specs: [{ name: 'hull', action: 'updated', text: expect.stringContaining('most damage') }],
      applied: `outline-spec/changes/c1/applied/${today()}-1.md`,
    });
  });

  it('reports synced specs and the applied file in --json', async () => {
    write('changes/c1/outline.md', outline(`${REQS}2. docking: Ships dock at stations.\n  a. Clamps: Docking takes 2 s.\n`));
    const r = await cli('sync', 'c1', '--json');
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({
      synced: 'c1',
      specs: [
        { name: 'hull', action: 'updated' },
        { name: 'docking', action: 'created' },
      ],
      applied: `outline-spec/changes/c1/applied/${today()}-1.md`,
    });
  });

  it('requires a change name in --json and names missing changes', async () => {
    expect(JSON.parse((await cli('sync', '--json')).stdout).status[0]).toMatchObject({ code: 'sync_change_name_required' });
    expect(JSON.parse((await cli('sync', 'nope', '--json')).stdout).status[0]).toMatchObject({
      code: 'sync_change_not_found',
      message: expect.stringContaining('c1'),
    });
  });

  it('syncs table edits and records the table verbatim', async () => {
    const reqs =
      '1. ships:\n  a. Catalog (patch):\n    | id | Cost |\n    |---|---|\n    | m60 | ~~8000~~ **8500** |\n    | hauler | 9000 |\n';
    write('changes/c1/outline.md', outline(reqs));
    const r = await cli('sync', 'c1', '--yes');
    expect(r.exitCode).toBe(0);
    expect(read('specs/ships/spec.md')).toContain('| m60 | M-60 Courier | 8500 |\n  | hauler |  | 9000 |\n');
    expect(read(`changes/c1/applied/${today()}-1.md`)).toContain(`## Requirements\n${reqs}`);
  });
});

describe('applied/ is a record only', () => {
  beforeEach(async () => {
    expect((await cli('sync', 'c1', '--yes')).exitCode).toBe(0);
    // A stray outline-looking file in applied/ must not be read as an artifact or outline.
    write('changes/c1/applied/outline.md', '## Requirements\n1. ~~hull: Ships have a hull.~~\n');
    write('changes/c1/applied/tasks.md', '- [ ] 9.9 Stray\n');
  });

  it('validate, pending, status, and change show ignore it', async () => {
    const v = await cli('validate', 'c1', '--json');
    expect(v.exitCode).toBe(0);

    const p = JSON.parse((await cli('pending', '--json')).stdout);
    expect(p.overlaps).toEqual([]);
    expect(JSON.stringify(p)).not.toContain('hull');

    const s = JSON.parse((await cli('status', '--change', 'c1', '--json')).stdout);
    const ids = s.artifacts.filter((a: { status: string }) => a.status === 'done').map((a: { id: string }) => a.id);
    expect(ids).toEqual(['outline', 'tasks']);

    const show = JSON.parse((await cli('show', 'c1', '--type', 'change', '--json')).stdout);
    expect(show.touches).toEqual([]);
    expect(show.applied).toEqual([`${today()}-1.md`, 'outline.md', 'tasks.md']);

    const apply = JSON.parse((await cli('instructions', 'apply', '--change', 'c1', '--json')).stdout);
    expect(JSON.stringify(apply.tasks)).not.toContain('Stray');
  });

  it('archive applies what remains and deletes the folder, applied/ included', async () => {
    write('changes/c1/outline.md', outline('1. hull:\n  b. Repair (patch): Docks repair the hull **for a fee**.\n'));
    const r = await cli('archive', 'c1', '--yes', '--json');
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ archived: 'c1', specs: [{ name: 'hull', action: 'updated' }] });
    expect(read('specs/hull/spec.md')).toContain('1. Plating: Hull plating stops most damage.\n2. Repair: Docks repair the hull for a fee.\n');
    expect(existsSync(file('changes/c1'))).toBe(false);
  });

  it('archive after a sync with nothing left still deletes the folder', async () => {
    const r = await cli('archive', 'c1', '--yes', '--json');
    expect(JSON.parse(r.stdout)).toMatchObject({ archived: 'c1', specs: [] });
    expect(existsSync(file('changes/c1'))).toBe(false);
  });
});
