import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Validator } from '../../src/core/validation/validator.js';

const spec = (items: string, purpose = 'What it is for.') => `# radar\n${purpose}\n\n${items}`;
const check = async (text: string, strict = false) => new Validator(strict).validateSpecContent('radar', text);
const messages = async (text: string) => (await check(text)).issues.map((i) => `${i.level} ${i.path}: ${i.message}`);

describe('validateSpecContent', () => {
  it('accepts a well-formed outline', async () => {
    const r = await check(spec('1. Radar: A round radar.\n  a. A circle.\n    i. Clipped.\n      1. Even here.\n  b. Range.\n2. Sweep: A ring sweeps.\n'));
    expect(r).toMatchObject({ valid: true, issues: [] });
  });

  it('requires a purpose', async () => {
    expect(await messages('# radar\n\n1. Radar: A round radar.\n')).toContain(
      'ERROR purpose: Spec needs a purpose: one or more lines after the title'
    );
  });

  it('warns on a placeholder purpose and fails strict', async () => {
    const text = spec('1. Radar: A round radar.\n', 'TBD - created by archiving change x. Update Purpose after archive.');
    expect(await check(text)).toMatchObject({ valid: true, summary: { warnings: 1 } });
    expect(await check(text, true)).toMatchObject({ valid: false });
  });

  it('checks label kinds by depth', async () => {
    expect(await messages(spec('1. Radar: A.\n  1. Wrong kind.\n  b. Fine.\n    a. Wrong kind.\n'))).toEqual([
      'ERROR 1.1: Label "1." should be a / b / c at this depth',
      'ERROR 1.b.a: Label "a." should be i / ii / iii at this depth',
    ]);
  });

  it('rejects duplicate sibling labels and empty items', async () => {
    expect(await messages(spec('1. Radar: A.\n  a. One.\n  a. Again.\n  b.\n'))).toEqual([
      'WARNING 1.a: Label "a." is out of order',
      'ERROR 1.a: Duplicate label "a." among its siblings',
      'ERROR 1.b: Item 1.b has no text',
    ]);
  });

  it('needs "Name: sentence" requirements with unique names', async () => {
    expect(await messages(spec('1. Just a sentence.\n2. Radar: A.\n3. Radar: B.\n'))).toEqual([
      'ERROR 1: Requirement 1 needs "Name: sentence"',
      'ERROR 3: Duplicate requirement name "Radar"',
    ]);
  });

  it('warns when the title is not the folder name', async () => {
    const r = await new Validator().validateSpecContent('scope', spec('1. Radar: A.\n'));
    expect(r.issues).toEqual([expect.objectContaining({ level: 'WARNING', path: 'title' })]);
  });

  it('points old-format specs at migrate-specs', async () => {
    const r = await check('# radar Specification\n\n## Purpose\nP.\n\n## Requirements\n### Requirement: R\nThe system SHALL.\n');
    expect(r.valid).toBe(false);
    expect(r.issues[0].message).toContain('run "outline-spec migrate-specs"');
  });

  it('reports lines that are not outline items', async () => {
    const r = await check(spec('1. Radar: A.\nstray\n'));
    expect(r.issues[0]).toMatchObject({ level: 'ERROR', message: expect.stringContaining('not an outline item') });
  });
});

describe('validateChange', () => {
  let root: string;
  const changesDir = () => path.join(root, 'outline-spec', 'changes');
  const write = (rel: string, text: string) => {
    const file = path.join(root, 'outline-spec', rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  const validate = () => new Validator().validateChange(path.join(changesDir(), 'c1'));

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'outline-spec-validate-'));
    write('specs/radar/spec.md', spec('1. Radar: A round radar.\n  a. A circle.\n'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('requires outline.md', async () => {
    mkdirSync(path.join(changesDir(), 'c1'), { recursive: true });
    expect((await validate()).issues).toEqual([{ level: 'ERROR', path: 'outline.md', message: 'Change has no outline.md' }]);
  });

  it('accepts an outline that lands cleanly', async () => {
    write('changes/c1/outline.md', '## Requirements\n1. radar:\n  a. Radar (patch):\n    a. A ~~circle~~ **disc**.\n');
    expect(await validate()).toMatchObject({ valid: true, issues: [] });
  });

  it('reports every landing problem as its own error', async () => {
    write('changes/c1/outline.md', '## Requirements\n1. radar:\n  a. Radar (patch):\n    a. A ~~square~~ **disc**.\n  b. Radar: Again.\n');
    expect((await validate()).issues.map((i) => i.message)).toEqual([
      "radar › Radar › a: struck text doesn't match the live item",
      'radar › Radar: requirement already exists; mark it "(patch)"',
    ]);
  });

  it('notes an outline that edits no specs', async () => {
    write('changes/c1/outline.md', '## Proposal\nTooling only.\n');
    expect(await validate()).toMatchObject({ valid: true, issues: [{ level: 'INFO' }] });
  });
});

describe('validateChange metadata keys', () => {
  it('warns on keys .outline-spec.yaml no longer knows, like skip_specs', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'outline-spec-validate-keys-'));
    const dir = path.join(root, 'outline-spec', 'changes', 'c1');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'outline.md'), '## Proposal\nx\n');
    writeFileSync(path.join(dir, '.outline-spec.yaml'), 'schema: outline\nskip_specs: true\n');
    const r = await new Validator(true).validateChange(dir);
    rmSync(root, { recursive: true, force: true });
    expect(r.valid).toBe(false);
    expect(r.issues).toContainEqual(expect.objectContaining({ level: 'WARNING', path: '.outline-spec.yaml', message: expect.stringContaining('skip_specs') }));
  });
});
