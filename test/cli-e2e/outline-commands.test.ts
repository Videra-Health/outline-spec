import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCLI } from '../helpers/run-cli.js';

const OUTFITTING = `# outfitting
Ships carry add-on equipment.

1. Makers: Every item is from one maker.
  a. Kessler makes radiators.
2. Catalog: The catalog is these items.
  a. RP-2 Radiator Panel: 0.5 / 2 / 0.
  c. Bracing Kit: 3 / 0 / 0.
`;
const HULL = `# hull
Ships have a hull.

1. Plating: Hull plating stops damage.
`;

let root: string;
const file = (...p: string[]) => path.join(root, 'openspec', ...p);
const write = (rel: string, text: string) => {
  mkdirSync(path.dirname(file(rel)), { recursive: true });
  writeFileSync(file(rel), text);
};
const read = (rel: string) => readFileSync(file(rel), 'utf-8');
const change = (name: string, reqs: string, tasks = '- [x] 1.1 Done\n') => {
  write(`changes/${name}/outline.md`, `## Proposal\nWhy.\n\n## Requirements\n${reqs}`);
  write(`changes/${name}/tasks.md`, tasks);
};
const cli = (...args: string[]) => runCLI(args, { cwd: root });

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'openspec-outline-'));
  write('config.yaml', 'schema: spec-driven\n');
  write('specs/outfitting/spec.md', OUTFITTING);
  write('specs/hull/spec.md', HULL);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('openspec land', () => {
  it('applies edits, creates and deletes specs, and removes the change', async () => {
    change(
      'c1',
      '1. outfitting:\n  a. Catalog (patch):\n    d. Salvage Plate: 2 / 0 / 0.\n2. docking: Ships dock at stations.\n  a. Clamps: Docking takes 2 s.\n3. ~~hull: Ships have a hull.~~\n'
    );
    const r = await cli('land', 'c1', '--json');
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({
      landed: 'c1',
      specs: [
        { name: 'outfitting', action: 'updated' },
        { name: 'docking', action: 'created' },
        { name: 'hull', action: 'deleted' },
      ],
    });
    expect(read('specs/outfitting/spec.md')).toContain('  c. Bracing Kit: 3 / 0 / 0.\n  d. Salvage Plate: 2 / 0 / 0.\n');
    expect(read('specs/docking/spec.md')).toBe('# docking\nShips dock at stations.\n\n1. Clamps: Docking takes 2 s.\n');
    expect(existsSync(file('specs/hull'))).toBe(false);
    expect(existsSync(file('changes/c1'))).toBe(false);
  });

  it('writes nothing when any edit fails, and lists every problem', async () => {
    change('c1', '1. docking: Ships dock.\n  a. Clamps: 2 s.\n2. outfitting:\n  a. Catalog (patch):\n    y. ~~A.~~\n    z. ~~B.~~\n');
    const r = await cli('land', 'c1', '--yes');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr + r.stdout).toMatch(/Catalog › y: no such item[\s\S]*Catalog › z: no such item/);
    expect(existsSync(file('specs/docking'))).toBe(false);
    expect(read('specs/outfitting/spec.md')).toBe(OUTFITTING);
    expect(existsSync(file('changes/c1/outline.md'))).toBe(true);
  });

  it('reports a failure as one JSON document', async () => {
    change('c1', '1. outfitting:\n  a. Nope (patch):\n');
    const r = await cli('land', 'c1', '--json');
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout)).toMatchObject({ landed: null, specs: [], status: [{ code: 'land_conflicts' }] });
  });

  it('prints the result on --dry-run and writes nothing', async () => {
    change('c1', '1. outfitting:\n  a. Catalog (patch): The catalog is ~~these~~ **all of the** items.\n');
    const r = await cli('land', 'c1', '--dry-run');
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('--- openspec/specs/outfitting/spec.md (updated)');
    expect(r.stdout).toContain('2. Catalog: The catalog is all of the items.');
    expect(read('specs/outfitting/spec.md')).toBe(OUTFITTING);
    expect(existsSync(file('changes/c1'))).toBe(true);
  });

  it('includes spec text in --dry-run --json', async () => {
    change('c1', '1. docking: Ships dock.\n  a. Clamps: 2 s.\n');
    const r = await cli('land', 'c1', '--dry-run', '--json');
    expect(JSON.parse(r.stdout)).toMatchObject({
      landed: 'c1',
      dryRun: true,
      specs: [{ name: 'docking', action: 'created', text: '# docking\nShips dock.\n\n1. Clamps: 2 s.\n' }],
    });
  });

  it('blocks --json on incomplete tasks unless --yes', async () => {
    change('c1', '1. docking: Ships dock.\n  a. Clamps: 2 s.\n', '- [ ] 1.1 Not yet\n');
    const blocked = await cli('land', 'c1', '--json');
    expect(blocked.exitCode).toBe(1);
    expect(JSON.parse(blocked.stdout).status[0]).toMatchObject({ code: 'land_tasks_incomplete' });
    expect(existsSync(file('changes/c1'))).toBe(true);

    const forced = await cli('land', 'c1', '--json', '--yes');
    expect(forced.exitCode).toBe(0);
    expect(existsSync(file('changes/c1'))).toBe(false);
  });

  it('asks before landing incomplete tasks, and stops when no answer can be read', async () => {
    change('c1', '1. docking: Ships dock.\n  a. Clamps: 2 s.\n', '- [ ] 1.1 Not yet\n');
    const r = await runCLI(['land', 'c1'], { cwd: root, input: 'n\n' });
    expect(r.stdout).toContain('1 incomplete task(s) found');
    expect(existsSync(file('changes/c1'))).toBe(true);
  });

  it('requires a change name in --json', async () => {
    const r = await cli('land', '--json');
    expect(JSON.parse(r.stdout).status[0]).toMatchObject({ code: 'land_change_name_required' });
  });

  it('names the available changes when one is missing', async () => {
    change('c1', '');
    const r = await cli('land', 'nope', '--json');
    expect(JSON.parse(r.stdout).status[0]).toMatchObject({ code: 'land_change_not_found', message: expect.stringContaining('c1') });
  });

  it('lands a change that edits no specs', async () => {
    change('c1', '');
    const r = await cli('land', 'c1', '--json');
    expect(JSON.parse(r.stdout)).toMatchObject({ landed: 'c1', specs: [] });
    expect(existsSync(file('changes/c1'))).toBe(false);
  });
});

describe('openspec archive', () => {
  it('lands the change and notes the rename on stderr only', async () => {
    change('c1', '1. docking: Ships dock.\n  a. Clamps: 2 s.\n');
    const r = await cli('archive', 'c1', '--json');
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain('"openspec archive" is now "openspec land"');
    expect(JSON.parse(r.stdout)).toMatchObject({ landed: 'c1' });
    expect(existsSync(file('specs/docking/spec.md'))).toBe(true);
  });
});

describe('openspec instructions land', () => {
  it('serves land inputs under both names', async () => {
    change('c1', '');
    write('config.yaml', 'schema: spec-driven\noperations:\n  archive:\n    guidance:\n      - Say what landed\n');
    for (const name of ['land', 'archive']) {
      const r = await cli('instructions', name, '--change', 'c1', '--json');
      expect(JSON.parse(r.stdout)).toMatchObject({ changeName: 'c1', operationGuidance: ['Say what landed'] });
    }
  });
});

describe('openspec pending', () => {
  it('lists what each change touches and where they overlap', async () => {
    change('a', '1. outfitting:\n  a. Catalog (patch):\n    c. ~~Bracing Kit: 3 / 0 / 0.~~\n');
    change('b', '1. outfitting:\n  a. Catalog (patch):\n    c. Bracing Kit: ~~3~~ **4** / 0 / 0.\n  b. Hull rating: Frame items add Hk.\n');
    mkdirSync(file('changes/archive/2024-01-01-old'), { recursive: true });
    const r = await cli('pending', '--json');
    expect(JSON.parse(r.stdout)).toMatchObject({
      changes: [
        { name: 'a', touches: ['outfitting › Catalog › c'] },
        { name: 'b', touches: ['outfitting › Catalog › c', 'outfitting › Hull rating'] },
      ],
      overlaps: [{ path: 'outfitting › Catalog › c', changes: ['a', 'b'] }],
    });
    const text = await cli('pending');
    expect(text.stdout).toContain('overlaps:\n  outfitting › Catalog › c: a, b');
  });

  it('reports an outline that does not parse and exits non-zero', async () => {
    change('a', '1. outfitting:\nstray line\n');
    const r = await cli('pending', '--json');
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).changes[0]).toMatchObject({ name: 'a', error: expect.stringContaining('not an outline item') });
  });
});

describe('openspec relabel', () => {
  it('closes label gaps', async () => {
    const r = await cli('relabel', 'outfitting');
    expect(r.exitCode).toBe(0);
    expect(read('specs/outfitting/spec.md')).toContain('  a. RP-2 Radiator Panel: 0.5 / 2 / 0.\n  b. Bracing Kit: 3 / 0 / 0.\n');
  });

  it('refuses while a pending change edits the spec', async () => {
    change('c1', '1. outfitting:\n  a. Catalog (patch):\n    c. ~~Bracing Kit: 3 / 0 / 0.~~\n');
    const r = await cli('relabel', 'outfitting');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr + r.stdout).toContain('outfitting has pending edits in c1');
    expect(read('specs/outfitting/spec.md')).toBe(OUTFITTING);
  });
});

describe('openspec migrate-specs', () => {
  const OLD = '# legacy Specification\n\n## Purpose\nOld purpose.\n\n## Requirements\n### Requirement: R\nThe system SHALL work.\n\n#### Scenario: S\n- **WHEN** x\n- **THEN** y\n';

  it('converts old-format specs and skips outlines', async () => {
    write('specs/legacy/spec.md', OLD);
    const r = await cli('migrate-specs', '--json');
    expect(r.exitCode).toBe(0);
    const specs = JSON.parse(r.stdout).specs;
    expect(specs).toContainEqual(expect.objectContaining({ name: 'legacy', status: 'converted' }));
    expect(specs).toContainEqual(expect.objectContaining({ name: 'outfitting', status: 'already-outline' }));
    expect(read('specs/legacy/spec.md')).toBe('# legacy\nOld purpose.\n\n1. R: The system SHALL work.\n  a. S: WHEN x THEN y\n');
    expect(read('specs/outfitting/spec.md')).toBe(OUTFITTING);
  });

  it('writes nothing on --dry-run', async () => {
    write('specs/legacy/spec.md', OLD);
    const r = await cli('migrate-specs', '--dry-run');
    expect(r.stdout).toContain('legacy: would convert');
    expect(read('specs/legacy/spec.md')).toBe(OLD);
  });

  it('leaves a spec with unplaceable content untouched and says where it is', async () => {
    const blocked = OLD + '\n## Why\nBecause.\n';
    write('specs/legacy/spec.md', blocked);
    const r = await cli('migrate-specs');
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/legacy\/spec\.md:15 \(section "Why"\)/);
    expect(read('specs/legacy/spec.md')).toBe(blocked);
  });
});

describe('validate on outlines', () => {
  it('passes clean specs and changes and fails a change that would not land', async () => {
    change('good', '1. outfitting:\n  a. Catalog (patch):\n    d. Salvage Plate: 2 / 0 / 0.\n');
    change('bad', '1. outfitting:\n  a. Catalog (patch):\n    b. ~~Nothing here.~~\n');
    const r = await cli('validate', '--all', '--json');
    const items = Object.fromEntries(JSON.parse(r.stdout).items.map((i: { id: string; valid: boolean }) => [i.id, i]));
    expect(items.good.valid).toBe(true);
    expect(items.outfitting.valid).toBe(true);
    expect(items.bad).toMatchObject({ valid: false, issues: [{ level: 'ERROR', path: 'outline.md', message: 'outfitting › Catalog › b: no such item' }] });
  });
});
