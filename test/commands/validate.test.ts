import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { runCLI } from '../helpers/run-cli.js';

describe('top-level validate command', () => {
  const projectRoot = process.cwd();
  const testDir = path.join(projectRoot, 'test-validate-command-tmp');
  const changesDir = path.join(testDir, 'outline-spec', 'changes');
  const specsDir = path.join(testDir, 'outline-spec', 'specs');

  beforeEach(async () => {
    await fs.mkdir(changesDir, { recursive: true });
    await fs.mkdir(specsDir, { recursive: true });

    const specContent = (name: string) => [
      `# ${name}`,
      'This spec ensures the validation harness exercises a deterministic alpha module for automated tests.',
      '',
      '1. Deterministic output: The alpha module produces a deterministic response for validation.',
      '  a. Run with the default flow, the output matches the expected fixture result.',
      '',
    ].join('\n');
    await fs.mkdir(path.join(specsDir, 'alpha'), { recursive: true });
    await fs.writeFile(path.join(specsDir, 'alpha', 'spec.md'), specContent('alpha'), 'utf-8');

    await fs.mkdir(path.join(changesDir, 'c1'), { recursive: true });
    await fs.writeFile(path.join(changesDir, 'c1', 'outline.md'), changeOutline('alpha'), 'utf-8');

    // Duplicate name for ambiguity test
    await fs.mkdir(path.join(changesDir, 'dup'), { recursive: true });
    await fs.writeFile(path.join(changesDir, 'dup', 'outline.md'), changeOutline('alpha'), 'utf-8');
    await fs.mkdir(path.join(specsDir, 'dup'), { recursive: true });
    await fs.writeFile(path.join(specsDir, 'dup', 'spec.md'), specContent('dup'), 'utf-8');
  });

  /** A change outline adding one requirement to an existing spec. */
  const changeOutline = (spec: string, eol = '\n') => [
    '## Proposal',
    'Because reasons that are sufficiently long for validation.',
    '',
    '## Requirements',
    `1. ${spec}:`,
    '  a. Change support: The validator accepts changes provided by the test harness.',
    '',
  ].join(eol);

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('prints a helpful hint when no args in non-interactive mode', async () => {
    const result = await runCLI(['validate'], { cwd: testDir });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Nothing to validate. Try one of:');
  });

  it('reports a change without outline.md and points at outline next steps', async () => {
    await fs.mkdir(path.join(changesDir, 'plain-empty'), { recursive: true });

    const result = await runCLI(['validate', 'plain-empty', '--type', 'change'], { cwd: testDir });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Change has no outline.md');
    expect(result.stderr).toContain('outline-spec land plain-empty --dry-run');
  });

  it('reports every place an outline does not land on the live specs', async () => {
    const chDir = path.join(changesDir, 'conflicting');
    await fs.mkdir(chDir, { recursive: true });
    await fs.writeFile(
      path.join(chDir, 'outline.md'),
      '## Requirements\n1. alpha:\n  a. Deterministic output: Already exists.\n  b. Missing (patch):\n',
      'utf-8'
    );

    const result = await runCLI(['validate', 'conflicting', '--type', 'change', '--json'], { cwd: testDir });
    expect(result.exitCode).toBe(1);
    const messages = JSON.parse(result.stdout).items[0].issues.map((i: { message: string }) => i.message);
    expect(messages).toEqual([
      expect.stringContaining('requirement already exists'),
      expect.stringContaining('no such requirement to patch'),
    ]);
  });

  it('reports an outline that edits no specs as INFO, valid even under --strict', async () => {
    const chDir = path.join(changesDir, 'no-edits');
    await fs.mkdir(chDir, { recursive: true });
    await fs.writeFile(path.join(chDir, 'outline.md'), '## Proposal\nTooling only.\n', 'utf-8');

    const result = await runCLI(['validate', 'no-edits', '--type', 'change', '--strict', '--json'], { cwd: testDir });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).items[0].issues).toEqual([
      expect.objectContaining({ level: 'INFO', message: expect.stringContaining('edits no specs') }),
    ]);
  });

  it('rejects an old-format spec with a migrate-specs hint', async () => {
    await fs.mkdir(path.join(specsDir, 'legacy'), { recursive: true });
    await fs.writeFile(
      path.join(specsDir, 'legacy', 'spec.md'),
      '# legacy\n\n## Purpose\nOld.\n\n## Requirements\n### Requirement: Old\nThe system SHALL be old.\n',
      'utf-8'
    );

    const result = await runCLI(['validate', 'legacy', '--type', 'spec'], { cwd: testDir });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('outline-spec migrate-specs');
  });

  it('validates all with --all and outputs JSON summary', async () => {
    const result = await runCLI(['validate', '--all', '--json'], { cwd: testDir });
    expect(result.exitCode).toBe(0);
    const output = result.stdout.trim();
    expect(output).not.toBe('');
    const json = JSON.parse(output);
    expect(Array.isArray(json.items)).toBe(true);
    expect(json.summary?.totals?.items).toBeDefined();
    expect(json.version).toBe('1.0');
  });

  it('validates only specs with --specs and respects --concurrency', async () => {
    const result = await runCLI(['validate', '--specs', '--json', '--concurrency', '1'], { cwd: testDir });
    expect(result.exitCode).toBe(0);
    const output = result.stdout.trim();
    expect(output).not.toBe('');
    const json = JSON.parse(output);
    expect(json.items.every((i: any) => i.type === 'spec')).toBe(true);
  });

  it('errors on ambiguous item names and suggests type override', async () => {
    const result = await runCLI(['validate', 'dup'], { cwd: testDir });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Ambiguous item');
  });

  it('accepts change outlines saved with CRLF line endings', async () => {
    const changeId = 'crlf-change';
    await fs.mkdir(path.join(changesDir, changeId), { recursive: true });
    await fs.writeFile(path.join(changesDir, changeId, 'outline.md'), changeOutline('alpha', '\r\n'), 'utf-8');

    const result = await runCLI(['validate', changeId], { cwd: testDir });
    expect(result.exitCode).toBe(0);
  });

  // #1182 — validate resolves a change by directory existence (matching
  // status/instructions), not by requiring proposal.md.
  it('resolves and validates a scaffolded change without proposal.md (#1182)', async () => {
    const changeDir = path.join(changesDir, 'scaffolded');
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(path.join(changeDir, '.outline-spec.yaml'), 'schema: outline\n', 'utf-8');
    await fs.writeFile(path.join(changeDir, 'outline.md'), changeOutline('alpha'), 'utf-8');

    const result = await runCLI(['validate', 'scaffolded'], { cwd: testDir });
    expect(result.stderr).not.toContain('Unknown item');
    expect(result.exitCode).toBe(0);
  });

  it('a resolved-but-invalid proposal-less change exits non-zero, not "Unknown item" (#1182)', async () => {
    // Resolves by directory existence, then fails validation (no outline.md).
    const changeDir = path.join(changesDir, 'scaffolded-empty');
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(path.join(changeDir, '.outline-spec.yaml'), 'schema: outline\n', 'utf-8');

    const result = await runCLI(['validate', 'scaffolded-empty'], { cwd: testDir });
    expect(result.stderr).not.toContain('Unknown item');
    expect(result.exitCode).toBe(1);
  });

  it('includes a sole proposal-less change in --all (not "No items found") (#1182)', async () => {
    const isoRoot = path.join(projectRoot, 'test-validate-iso-tmp');
    const isoChanges = path.join(isoRoot, 'outline-spec', 'changes');
    await fs.mkdir(path.join(isoChanges, 'only'), { recursive: true });
    try {
      await fs.writeFile(path.join(isoChanges, 'only', '.outline-spec.yaml'), 'schema: outline\n', 'utf-8');
      await fs.writeFile(
        path.join(isoChanges, 'only', 'outline.md'),
        '## Requirements\n1. alpha: A brand-new spec.\n  a. First requirement: It exists.\n',
        'utf-8'
      );

      const result = await runCLI(['validate', '--all'], { cwd: isoRoot });
      expect(result.stdout + result.stderr).not.toContain('No items found to validate');
      expect(result.exitCode).toBe(0);
    } finally {
      await fs.rm(isoRoot, { recursive: true, force: true });
    }
  });

  it('respects --no-interactive flag passed via CLI', async () => {
    // This test ensures Commander.js --no-interactive flag is correctly parsed
    // and passed to the validate command. The flag sets options.interactive = false
    // (not options.noInteractive = true) due to Commander.js convention.
    const result = await runCLI(['validate', '--specs', '--no-interactive'], {
      cwd: testDir,
      // Don't set OPEN_SPEC_INTERACTIVE to ensure we're testing the flag itself
      env: { ...process.env, OPEN_SPEC_INTERACTIVE: undefined },
    });
    expect(result.exitCode).toBe(0);
    // Should complete without hanging and without prompts
    expect(result.stderr).not.toContain('What would you like to validate?');
  });
});
