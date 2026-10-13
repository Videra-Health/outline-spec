import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import ora from 'ora';
import { ValidateCommand, projectValidationFindings } from '../../src/commands/validate.js';
import { resolveRootForCommand, toRootOutput, type ResolvedOpenSpecRoot } from '../../src/core/root-selection.js';
import { Validator } from '../../src/core/validation/validator.js';

vi.mock('../../src/core/root-selection.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/core/root-selection.js')>(),
  resolveRootForCommand: vi.fn(),
}));
vi.mock('ora', () => ({ default: vi.fn() }));

type Options = NonNullable<Parameters<ValidateCommand['execute']>[1]>;

describe('validate findings reports', () => {
  let directory: string;
  let root: ResolvedOpenSpecRoot;
  let previousExitCode: typeof process.exitCode;
  let stdout: string[];
  let stderr: string[];

  async function write(relative: string, contents: string): Promise<void> {
    const filename = path.join(directory, relative);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, contents);
  }

  /** A change outline that creates the `example` spec; `requirements: false` leaves it editing no specs. */
  function outline(requirements = true): string {
    const edits = '\n## Requirements\n1. example: A deterministic example.\n  a. Example behavior: The feature returns its documented result.\n';
    return `## Proposal\nExercise validation output contracts.\n${requirements ? edits : ''}`;
  }

  // A tracked tasks.md without a checkbox is the change-level WARNING.
  async function writeWarningChange(id: string): Promise<void> {
    await write(`openspec/changes/${id}/outline.md`, outline());
    await write(`openspec/changes/${id}/tasks.md`, '- an unchecked bullet\n');
  }

  async function seed(): Promise<void> {
    await write('openspec/changes/a-clean/outline.md', outline());
    await writeWarningChange('b-warning');
    await write('openspec/changes/c-info/outline.md', outline(false));
    await fs.mkdir(path.join(root.changesDir, 'd-error'));
    await write('openspec/specs/clean/spec.md', '# clean\nThis specification defines a deterministic example for testing validation output contracts.\n\n1. Example behavior: The feature returns its documented result.\n');
    await write('openspec/specs/error/spec.md', '# Invalid specification\n');
    // Left by older projects; discovery must not treat it as a change.
    await write('openspec/changes/archive/old/tasks.md', '- [ ] 1.1 Pending\n');
  }

  async function run(options: Options, item?: string) {
    stdout = [];
    stderr = [];
    process.exitCode = undefined;
    await new ValidateCommand().execute(item, { noInteractive: true, ...options });
    return { stdout: [...stdout], stderr: [...stderr], exitCode: process.exitCode ?? 0 };
  }

  async function json(options: Options) {
    const result = await run({ ...options, json: true });
    expect(result.stdout).toHaveLength(1);
    expect(result.stderr).toEqual([]);
    return { ...result, document: JSON.parse(result.stdout[0]) };
  }

  beforeEach(async () => {
    previousExitCode = process.exitCode;
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-findings-'));
    root = {
      path: directory,
      changesDir: path.join(directory, 'openspec', 'changes'),
      specsDir: path.join(directory, 'openspec', 'specs'),
      defaultSchema: 'outline',
      source: 'nearest',
    };
    await fs.mkdir(root.changesDir, { recursive: true });
    await fs.mkdir(root.specsDir, { recursive: true });
    vi.mocked(resolveRootForCommand).mockReset().mockResolvedValue(root);
    vi.mocked(ora).mockClear();
    vi.spyOn(console, 'log').mockImplementation((...args) => stdout.push(args.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...args) => stderr.push(args.join(' ')));
    // Timing is not part of report compatibility; fix it for byte-for-byte checks.
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = previousExitCode;
    await fs.rm(directory, { recursive: true, force: true });
  });

  const scopes: Array<[string, Options]> = [
    ['changes', { changes: true }],
    ['specs', { specs: true }],
    ['all', { all: true }],
    ['all', { changes: true, specs: true }],
    ['all', { all: true, changes: true }],
    ['all', { all: true, specs: true }],
  ];

  it.each(scopes)('preserves full output and projects the complete %s scope (%j)', async (scope, options) => {
    await seed();
    const full = await json(options);
    expect(await json({ ...options, report: 'full' })).toEqual(full);
    expect(await run({ ...options, report: 'full' })).toEqual(await run(options));
    const findings = await json({ ...options, report: 'findings' });
    const selected = full.document.items.filter((item: { issues: unknown[] }) => item.issues.length > 0);
    expect(findings.document).toEqual({
      report: { kind: 'validation-findings', version: '1.0', scope, returnedItems: selected.length, totalItems: full.document.summary.totals.items },
      itemFindings: selected,
      summary: full.document.summary,
      root: full.document.root,
    });
    expect(findings.document).not.toHaveProperty('items');
    expect(findings.document).not.toHaveProperty('version');
    expect(typeof findings.document.report.version).toBe('string');
    expect(findings.exitCode).toBe(full.exitCode);
  });

  it('preserves legacy mixed-flag precedence when report is omitted', async () => {
    await seed();
    for (const json of [false, true]) {
      expect(await run({ all: true, json }, 'ignored-item')).toEqual(await run({ all: true, json }));
    }
  });

  it.each([false, true])('retains warning and INFO records with full-mode verdicts (strict=%s)', async (strict) => {
    await seed();
    const full = await json({ changes: true, strict });
    const findings = await json({ changes: true, strict, report: 'findings' });
    const warning = findings.document.itemFindings.find((item: { id: string }) => item.id === 'b-warning');
    const info = findings.document.itemFindings.find((item: { id: string }) => item.id === 'c-info');
    expect(warning.issues.map((issue: { level: string }) => issue.level)).toEqual(['WARNING']);
    expect(warning.valid).toBe(!strict);
    expect(info.issues.map((issue: { level: string }) => issue.level)).toEqual(['INFO']);
    expect(info.valid).toBe(true);
    expect(findings.document.summary).toEqual(full.document.summary);
    expect(findings.exitCode).toBe(full.exitCode);
  });

  it.each([false, true])('preserves warning-only exit status without errors (strict=%s)', async (strict) => {
    await writeWarningChange('warning');
    const full = await json({ changes: true, strict });
    const findings = await json({ changes: true, strict, report: 'findings' });
    expect(findings.document.itemFindings).toHaveLength(1);
    expect(findings.exitCode).toBe(strict ? 1 : 0);
    expect(findings.exitCode).toBe(full.exitCode);
  });

  it('keeps an INFO-only strict run successful while displaying its finding', async () => {
    await write('openspec/changes/info/outline.md', outline(false));
    const findings = await json({ changes: true, strict: true, report: 'findings' });
    expect(findings.document.itemFindings).toHaveLength(1);
    expect(findings.document.itemFindings[0].issues[0].level).toBe('INFO');
    expect(findings.exitCode).toBe(0);
  });

  it('orders human streams independently and emits every issue without clean rows', async () => {
    await seed();
    const findings = await json({ all: true, report: 'findings' });
    const human = await run({ all: true, report: 'findings' });
    expect(human.stdout[0]).toMatch(/^Scope:/);
    expect(human.stdout[1]).toMatch(/^Totals:/);
    expect(human.stdout[2]).toMatch(/^Details: openspec validate d-error --type change/);
    expect(human.stdout).toHaveLength(3);
    const errorText = human.stderr.join('\n');
    expect(errorText).not.toContain('change/a-clean');
    expect(errorText).not.toContain('spec/clean');
    expect(errorText).not.toContain('change/archive');
    let offset = -1;
    for (const item of findings.document.itemFindings) {
      const heading = `${item.type}/${item.id}`;
      const headingOffset = errorText.indexOf(heading, offset + 1);
      expect(headingOffset).toBeGreaterThan(offset);
      expect(errorText.split(heading)).toHaveLength(2);
      offset = headingOffset;
      for (const issue of item.issues) {
        const issueOffset = errorText.indexOf(`[${issue.level}] ${issue.path}: ${issue.message}`, offset + 1);
        expect(issueOffset).toBeGreaterThan(offset);
        offset = issueOffset;
      }
    }
  });

  it.each(scopes)('keeps empty %s scopes explicit and successful (%j)', async (scope, options) => {
    const full = await json(options);
    expect(await json({ ...options, report: 'full' })).toEqual(full);
    expect(await run({ ...options, report: 'full' })).toEqual(await run(options));
    const findings = await json({ ...options, report: 'findings' });
    expect(findings.document.report).toEqual({ kind: 'validation-findings', version: '1.0', scope, returnedItems: 0, totalItems: 0 });
    expect(findings.document.itemFindings).toEqual([]);
    expect(findings.document.summary).toEqual(full.document.summary);
    expect(findings.document.root).toEqual(toRootOutput(root));
    expect(findings.exitCode).toBe(0);
    const human = await run({ ...options, report: 'findings' });
    expect(human.stdout).toEqual([expect.stringMatching(/^Scope:/), 'No item findings.', 'Totals: 0 passed, 0 failed (0 items)']);
    expect(human.stderr).toEqual([]);
    expect(human.exitCode).toBe(0);
  });

  it('distinguishes a clean non-empty scope from an empty scope', async () => {
    await write('openspec/changes/clean/outline.md', outline());
    const result = await json({ changes: true, report: 'findings' });
    expect(result.document.report).toMatchObject({ returnedItems: 0, totalItems: 1, scope: 'changes' });
    expect(result.document.itemFindings).toEqual([]);
    expect(result.document.summary.totals).toEqual({ items: 1, passed: 1, failed: 0 });
    const human = await run({ changes: true, report: 'findings' });
    expect(human.stdout).toEqual([expect.stringMatching(/^Scope:/), 'No item findings.', 'Totals: 1 passed, 0 failed (1 items)']);
    expect(human.stderr).toEqual([]);
    expect(human.exitCode).toBe(0);
  });

  it.each(['full', 'findings'])('rejects invalid %s requests before root resolution, progress, or validation', async (report) => {
    const validateSpec = vi.spyOn(Validator.prototype, 'validateSpec');
    const validateChange = vi.spyOn(Validator.prototype, 'validateChange');
    const invalid: Array<[Options, string?]> = [
      [{ report }],
      [{ report }, 'named-item'],
      [{ report, all: true }, 'named-item'],
      [{ report: 'unsupported', all: true }],
      [{ report: '', all: true }],
    ];
    for (const [options, item] of invalid) {
      const human = await run({ ...options, noInteractive: false }, item);
      expect(human.stdout).toEqual([]);
      expect(human.stderr.join('\n')).toMatch(/report/i);
      expect(human.exitCode).toBe(1);
      const result = await run({ ...options, json: true, noInteractive: false }, item);
      expect(result.stderr).toEqual([]);
      expect(result.stdout).toHaveLength(1);
      expect(JSON.parse(result.stdout[0])).toEqual({ status: [{ severity: 'error', code: 'invalid_validation_report_request', message: expect.any(String), fix: expect.any(String) }] });
      expect(result.exitCode).toBe(1);
    }
    expect(resolveRootForCommand).not.toHaveBeenCalled();
    expect(ora).not.toHaveBeenCalled();
    expect(validateSpec).not.toHaveBeenCalled();
    expect(validateChange).not.toHaveBeenCalled();
  });

  it('preserves selected-store records, root, verdict, and full output', async () => {
    await seed();
    root.source = 'store';
    root.storeId = 'team';
    const options = { all: true, store: 'team' };
    const full = await json(options);
    expect(await json({ ...options, report: 'full' })).toEqual(full);
    expect(await run({ ...options, report: 'full' })).toEqual(await run(options));
    const result = await json({ ...options, report: 'findings' });
    expect(resolveRootForCommand).toHaveBeenLastCalledWith(expect.objectContaining({ store: 'team' }), expect.any(Object));
    expect(result.document.root).toEqual(toRootOutput(root));
    expect(result.document.itemFindings).toEqual(full.document.items.filter((item: { issues: unknown[] }) => item.issues.length));
    expect(result.exitCode).toBe(full.exitCode);
    const human = await run({ ...options, report: 'findings' });
    expect(human.stdout.at(-1)).toContain('--store team');
  });

  describe('a namespace folder holding nested changes (#1846)', () => {
    async function seedNamespaceFolder(): Promise<void> {
      await write('openspec/changes/mobile/refresh-token/proposal.md', '# Refresh token\n');
      await write('openspec/changes/mobile/refresh-token/outline.md', outline());
    }

    it('reports the nesting instead of a missing outline, in the bulk sweep', async () => {
      await seedNamespaceFolder();

      const { document } = await json({ changes: true });

      const item = document.items.find((entry: { id: string }) => entry.id === 'mobile');
      expect(item.valid).toBe(false);
      expect(item.issues).toEqual([
        {
          level: 'ERROR',
          path: 'file',
          message: expect.stringContaining('"mobile" is not a change'),
        },
      ]);
      expect(JSON.stringify(item.issues)).not.toContain('no outline.md');
    });

    it('reports the same thing when the change is validated by name', async () => {
      await seedNamespaceFolder();

      const result = await run({}, 'mobile');

      expect(result.exitCode).toBe(1);
      expect(result.stderr.join('\n')).toContain('"mobile" is not a change');
      expect(result.stderr.join('\n')).not.toContain('no outline.md');
    });

    it('replaces the outline next steps with the flat-layout fix', async () => {
      await seedNamespaceFolder();

      const result = await run({}, 'mobile');

      const output = result.stderr.join('\n');
      expect(output).toContain('Move each nested change directly under openspec/changes/');
      expect(output).not.toContain('Edit outline.md');
    });

    it('leaves an ordinary change with an outline untouched', async () => {
      await write('openspec/changes/add-auth/outline.md', outline());

      const { document } = await json({ changes: true });

      expect(document.items.find((entry: { id: string }) => entry.id === 'add-auth')).toMatchObject({
        valid: true,
        issues: [],
      });
    });
  });

  it('projects whole records in input order without modifying the full report', () => {
    const issue = { level: 'INFO' as const, path: path.join('nested', 'spec.md'), message: 'Informational', line: 7 };
    const clean = { id: 'clean', type: 'change' as const, valid: true, issues: [], durationMs: 1 };
    const first = { ...clean, id: 'z-first', issues: [issue], futureField: { preserved: true } };
    const second = { ...first, id: 'a-second', valid: false };
    const full = { items: [first, clean, second], summary: { totals: { items: 3, passed: 2, failed: 1 }, byType: { change: { items: 3, passed: 2, failed: 1 } } }, version: '1.0' as const, root: toRootOutput(root) };
    const original = structuredClone(full);
    const result = projectValidationFindings(full, 'changes');
    expect(result.itemFindings).toEqual([first, second]);
    expect(result.itemFindings[0]).toBe(first);
    expect(result.itemFindings[1]).toBe(second);
    expect(result.report).toMatchObject({ returnedItems: 2, totalItems: 3 });
    expect(full).toEqual(original);
  });
});
