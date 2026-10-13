import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';

describe('top-level show command', () => {
  const projectRoot = process.cwd();
  const testDir = path.join(projectRoot, 'test-show-command-tmp');
  const changesDir = path.join(testDir, 'openspec', 'changes');
  const specsDir = path.join(testDir, 'openspec', 'specs');
  const openspecBin = path.join(projectRoot, 'bin', 'openspec.js');


  beforeEach(async () => {
    await fs.mkdir(changesDir, { recursive: true });
    await fs.mkdir(specsDir, { recursive: true });

    const changeContent = `## Proposal\nBecause reasons.\n\n## Requirements\n1. auth:\n  b. Logout: Users can sign out.\n`;
    await fs.mkdir(path.join(changesDir, 'demo'), { recursive: true });
    await fs.writeFile(path.join(changesDir, 'demo', 'outline.md'), changeContent, 'utf-8');

    const specContent = `# auth\nAuth spec.\n\n1. User Authentication: Users sign in.\n  a. Valid credentials sign the user in.\n    i. The session lasts one day.\n`;
    await fs.mkdir(path.join(specsDir, 'auth'), { recursive: true });
    await fs.writeFile(path.join(specsDir, 'auth', 'spec.md'), specContent, 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('prints hint and non-zero exit when no args and non-interactive', () => {
    const originalCwd = process.cwd();
    const originalEnv = { ...process.env };
    try {
      process.chdir(testDir);
      process.env.OPEN_SPEC_INTERACTIVE = '0';
      let err: any;
      try {
        execFileSync('node', [openspecBin, 'show'], { encoding: 'utf-8' });
      } catch (e) { err = e; }
      expect(err).toBeDefined();
      expect(err.status).not.toBe(0);
      const stderr = err.stderr.toString();
      expect(stderr).toContain('Nothing to show.');
      expect(stderr).toContain('openspec show <item>');
      expect(stderr).toContain('openspec change show');
      expect(stderr).toContain('openspec spec show');
    } finally {
      process.chdir(originalCwd);
      process.env = originalEnv;
    }
  });

  it('auto-detects change id and supports --json', () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(testDir);
      const output = execFileSync('node', [openspecBin, 'show', 'demo', '--json'], { encoding: 'utf-8' });
      const json = JSON.parse(output);
      expect(json.id).toBe('demo');
      expect(json.outline).toContain('## Requirements');
      expect(json.touches).toEqual(['auth › Logout']);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('does not warn about spec-only flags that were never passed', () => {
    // A plain `show <change>` must not warn about a flag the user never typed.
    const res = spawnSync('node', [openspecBin, 'show', 'demo', '--json'], {
      encoding: 'utf-8',
      cwd: testDir,
    });
    expect(res.status).toBe(0);
    expect(res.stderr).not.toContain('not applicable');
  });

  it('still warns when --item is explicitly passed for a change', () => {
    const res = spawnSync(
      'node',
      [openspecBin, 'show', 'demo', '--json', '--item', '1'],
      { encoding: 'utf-8', cwd: testDir }
    );
    expect(res.status).toBe(0);
    expect(res.stderr).toContain('Ignoring flags not applicable to change: item');
  });

  it('warns when --diff is passed for a spec', () => {
    const res = spawnSync('node', [openspecBin, 'show', 'auth', '--diff'], { encoding: 'utf-8', cwd: testDir });
    expect(res.status).toBe(0);
    expect(res.stderr).toContain('Ignoring flags not applicable to spec: diff');
  });

  it('auto-detects spec id and supports spec-only flags', () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(testDir);
      const output = execFileSync('node', [openspecBin, 'show', 'auth', '--json', '--item', 'User Authentication'], { encoding: 'utf-8' });
      const json = JSON.parse(output);
      expect(json.name).toBe('auth');
      expect(json.node).toMatchObject({ label: '1', text: 'User Authentication: Users sign in.' });
    } finally {
      process.chdir(originalCwd);
    }
  });

  it.each([
    ['1.a', '  a. Valid credentials sign the user in.\n    i. The session lasts one day.'],
    ['User Authentication.a.i', '    i. The session lasts one day.'],
  ])('shows the spec item at --item %s', (item, expected) => {
    const res = spawnSync('node', [openspecBin, 'show', 'auth', '--item', item], { encoding: 'utf-8', cwd: testDir });
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout.trimEnd()).toBe(expected);
  });

  it('reports an unknown --item and exits non-zero', () => {
    const res = spawnSync('node', [openspecBin, 'show', 'auth', '--item', '1.z'], { encoding: 'utf-8', cwd: testDir });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('No item "z" under 1. in auth');
  });

  it('handles ambiguity and suggests --type', async () => {
    // create matching spec and change named 'foo'
    await fs.mkdir(path.join(changesDir, 'foo'), { recursive: true });
    await fs.writeFile(path.join(changesDir, 'foo', 'outline.md'), '## Proposal\nFoo.\n', 'utf-8');
    await fs.mkdir(path.join(specsDir, 'foo'), { recursive: true });
    await fs.writeFile(path.join(specsDir, 'foo', 'spec.md'), '# foo\nFoo spec.\n\n1. R: X.\n', 'utf-8');

    const originalCwd = process.cwd();
    try {
      process.chdir(testDir);
      let err: any;
      try {
        execFileSync('node', [openspecBin, 'show', 'foo'], { encoding: 'utf-8' });
      } catch (e) { err = e; }
      expect(err).toBeDefined();
      expect(err.status).not.toBe(0);
      const stderr = err.stderr.toString();
      expect(stderr).toContain('Ambiguous item');
      expect(stderr).toContain('--type change|spec');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('resolves a scaffolded change that has no outline.md yet', async () => {
    // `openspec new change <name>` writes only .openspec.yaml, so `show` must
    // resolve the change the same way `list` and `status` already do.
    await fs.mkdir(path.join(changesDir, 'scaffolded'), { recursive: true });
    await fs.writeFile(path.join(changesDir, 'scaffolded', '.openspec.yaml'), 'schema: spec-driven\n', 'utf-8');

    const originalCwd = process.cwd();
    try {
      process.chdir(testDir);
      let err: any;
      try {
        execFileSync('node', [openspecBin, 'show', 'scaffolded'], { encoding: 'utf-8' });
      } catch (e) { err = e; }
      expect(err).toBeDefined();
      const stderr = err.stderr.toString();
      // Resolved as a change, not rejected as an unknown item.
      expect(stderr).not.toContain('Unknown item');
      expect(stderr).toContain('has no outline.md yet');
      expect(stderr).toContain('openspec status --change scaffolded');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('reports a namespace folder as such instead of an outline-less change (#1846)', async () => {
    // `changes/mobile/refresh-token/` is not a layout OpenSpec supports: the
    // nested change is invisible and the folder around it reads as an empty
    // change. Saying "no outline.md yet" would send the user to a second dead
    // end (`status --change mobile`).
    await fs.mkdir(path.join(changesDir, 'mobile', 'refresh-token'), { recursive: true });
    await fs.writeFile(
      path.join(changesDir, 'mobile', 'refresh-token', 'outline.md'),
      '## Proposal\nRefresh token.\n',
      'utf-8'
    );

    const originalCwd = process.cwd();
    try {
      process.chdir(testDir);
      let err: any;
      try {
        execFileSync('node', [openspecBin, 'show', 'mobile'], { encoding: 'utf-8' });
      } catch (e) { err = e; }
      expect(err).toBeDefined();
      expect(err.status).not.toBe(0);
      const stderr = err.stderr.toString();
      expect(stderr).toContain('"mobile" is not a change');
      expect(stderr).toContain('openspec/changes/mobile/refresh-token/');
      expect(stderr).toContain('mobile-refresh-token');
      expect(stderr).not.toContain('has no outline.md yet');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('reports a namespace folder from "status --change" too (#1846)', async () => {
    await fs.mkdir(path.join(changesDir, 'mobile', 'refresh-token'), { recursive: true });
    await fs.writeFile(
      path.join(changesDir, 'mobile', 'refresh-token', 'tasks.md'),
      '- [ ] Not done\n',
      'utf-8'
    );

    const originalCwd = process.cwd();
    try {
      process.chdir(testDir);
      const result = spawnSync('node', [openspecBin, 'status', '--change', 'mobile'], {
        encoding: 'utf-8',
      });
      expect(result.status).not.toBe(0);
      expect(`${result.stderr}${result.stdout}`).toContain('"mobile" is not a change');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('offers a scaffolded change when "change show" is called without a name', async () => {
    await fs.mkdir(path.join(changesDir, 'scaffolded'), { recursive: true });
    await fs.writeFile(path.join(changesDir, 'scaffolded', '.openspec.yaml'), 'schema: spec-driven\n', 'utf-8');

    const originalCwd = process.cwd();
    const originalEnv = { ...process.env };
    try {
      process.chdir(testDir);
      process.env.OPEN_SPEC_INTERACTIVE = '0';
      let err: any;
      try {
        execFileSync('node', [openspecBin, 'change', 'show'], { encoding: 'utf-8' });
      } catch (e) { err = e; }
      expect(err).toBeDefined();
      const stderr = err.stderr.toString();
      expect(stderr).toContain('Available IDs:');
      expect(stderr).toContain('scaffolded');
    } finally {
      process.chdir(originalCwd);
      process.env = originalEnv;
    }
  });

  it('prints nearest matches when not found', () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(testDir);
      let err: any;
      try {
        execFileSync('node', [openspecBin, 'show', 'unknown-item'], { encoding: 'utf-8' });
      } catch (e) { err = e; }
      expect(err).toBeDefined();
      expect(err.status).not.toBe(0);
      const stderr = err.stderr.toString();
      expect(stderr).toContain("Unknown item 'unknown-item'");
      expect(stderr).toContain('Did you mean:');
    } finally {
      process.chdir(originalCwd);
    }
  });
});


