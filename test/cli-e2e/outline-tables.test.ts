import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCLI } from '../helpers/run-cli.js';

const SHIPS = `# ships
Every hull the yards sell.

1. Catalog: The yards sell these hulls.
  | id | Name | Mass | Cost |
  |---|---|---|---|
  | prototype | Prototype | 40 | 12000 |
  | m60 | M-60 Courier | 25 | 8000 |
3. Fit budgets: Each hull has a fit budget.
  b. Budgets by hull:
    | id | Slots |
    |---|---|
    | prototype | 4 |
`;

let root: string;
const file = (...p: string[]) => path.join(root, 'outline-spec', ...p);
const write = (rel: string, text: string) => {
  mkdirSync(path.dirname(file(rel)), { recursive: true });
  writeFileSync(file(rel), text);
};
const read = (rel: string) => readFileSync(file(rel), 'utf-8');
const change = (name: string, reqs: string) => {
  write(`changes/${name}/outline.md`, `## Proposal\nWhy.\n\n## Requirements\n1. ships:\n${reqs}`);
  write(`changes/${name}/tasks.md`, '- [x] 1.1 Done\n');
};
const cli = (...args: string[]) => runCLI(args, { cwd: root });

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'outline-spec-tables-'));
  write('config.yaml', 'schema: outline\n');
  write('specs/ships/spec.md', SHIPS);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('archive with tables', () => {
  it('applies cell, row, and column edits', async () => {
    change(
      'c1',
      '  a. Catalog (patch):\n    | id | Cost | **Crew** |\n    |---|---|---|\n    | m60 | ~~8000~~ **9000** | 2 |\n    | ~~prototype~~ |  |  |\n    | hauler | 100 | 6 |\n'
    );
    const r = await cli('archive', 'c1', '--yes');
    expect(r.exitCode).toBe(0);
    expect(read('specs/ships/spec.md')).toContain(
      '  | id | Name | Mass | Cost | Crew |\n  |---|---|---|---|---|\n  | m60 | M-60 Courier | 25 | 9000 | 2 |\n  | hauler |  |  | 100 | 6 |\n3.'
    );
  });

  it('writes nothing when one cell edit fails among good ones', async () => {
    change('c1', '  a. Catalog (patch):\n    | id | Cost |\n    |---|---|\n    | m60 | ~~8000~~ **9000** |\n    | prototype | ~~1~~ **2** |\n2. docks: New spec.\n  a. Clamps: Docking takes 2 s.\n');
    const r = await cli('archive', 'c1', '--yes');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr + r.stdout).toContain('ships › Catalog › prototype › Cost: struck text doesn\'t match the live cell "12000"');
    expect(read('specs/ships/spec.md')).toBe(SHIPS);
    expect(existsSync(file('specs/docks'))).toBe(false);
  });

  it('validate on a change dry-runs its table edits', async () => {
    change('bad', '  a. Fit budgets (patch):\n    b.\n      | id | Slots |\n      |---|---|\n      | prototype | ~~5~~ **6** |\n');
    const r = await cli('validate', 'bad', '--json');
    expect(r.exitCode).not.toBe(0);
    expect(r.stdout).toContain('ships › Fit budgets › b › prototype › Slots: struck text');
  });
});

describe('pending with tables', () => {
  it('reports overlaps by cell, row, and column', async () => {
    change('a', '  a. Catalog (patch):\n    | id | Cost | ~~Mass~~ |\n    |---|---|---|\n    | m60 | ~~8000~~ **9000** |  |\n    | hauler | 1 |  |\n');
    change('b', '  a. Catalog (patch):\n    | id | Cost | Name | ~~Mass~~ |\n    |---|---|---|---|\n    | m60 | ~~8000~~ **8500** |  |  |\n    | prototype |  | ~~Prototype~~ **Proto** |  |\n    | hauler | 2 |  |  |\n');
    const r = await cli('pending', '--json');
    const out = JSON.parse(r.stdout);
    expect(out.changes[0].touches).toEqual(['ships › Catalog › [Mass]', 'ships › Catalog › m60 › Cost', 'ships › Catalog › hauler']);
    expect(out.overlaps).toEqual([
      { path: 'ships › Catalog › [Mass]', changes: ['a', 'b'] },
      { path: 'ships › Catalog › m60 › Cost', changes: ['a', 'b'] },
      { path: 'ships › Catalog › hauler', changes: ['a', 'b'] },
    ]);
    expect(out.changes[1].touches).toContain('ships › Catalog › prototype › Name');
  });
});

describe('show --item with tables', () => {
  it('returns a row by requirement and id, or through detail labels', async () => {
    const r = await cli('show', 'ships', '--type', 'spec', '--item', 'Catalog.m60', '--json');
    expect(JSON.parse(r.stdout)).toMatchObject({ item: 'Catalog.m60', row: { id: 'm60', Name: 'M-60 Courier', Mass: '25', Cost: '8000' } });
    const text = await cli('show', 'ships', '--type', 'spec', '--item', 'Fit budgets.b.prototype');
    expect(text.stdout.trim()).toBe('| id | Slots |\n|---|---|\n| prototype | 4 |');
  });

  it('includes the table with its item', async () => {
    const r = await cli('show', 'ships', '--type', 'spec', '--item', 'Catalog', '--json');
    expect(JSON.parse(r.stdout).node.table).toEqual({
      columns: ['id', 'Name', 'Mass', 'Cost'],
      rows: [['prototype', 'Prototype', '40', '12000'], ['m60', 'M-60 Courier', '25', '8000']],
    });
    const text = await cli('show', 'ships', '--type', 'spec', '--item', 'Catalog');
    expect(text.stdout).toContain('1. Catalog: The yards sell these hulls.\n  | id | Name | Mass | Cost |');
  });
});

describe('relabel and migrate-specs with tables', () => {
  it('relabel keeps tables on their items', async () => {
    const r = await cli('relabel', 'ships');
    expect(r.exitCode).toBe(0);
    expect(read('specs/ships/spec.md')).toBe(SHIPS.replace('3. Fit budgets', '2. Fit budgets').replace('  b. Budgets', '  a. Budgets'));
  });

  it('migrate-specs treats a spec with tables as an outline', async () => {
    const r = await cli('migrate-specs', '--json');
    expect(JSON.parse(r.stdout).specs).toContainEqual(expect.objectContaining({ name: 'ships', status: 'already-outline' }));
    expect(read('specs/ships/spec.md')).toBe(SHIPS);
  });
});
