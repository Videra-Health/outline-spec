import { afterAll, describe, it, expect } from 'vitest';
import { promises as fs, realpathSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'node:child_process';
import { runCLI, cliProjectRoot } from '../helpers/run-cli.js';
import { isolatedGitEnv } from '../helpers/store-git.js';
import { AI_TOOLS } from '../../src/core/config.js';
import { getGlobalDataDir, registerStore } from '../../src/core/index.js';
import { createOutlineSpecRoot } from '../helpers/outline-spec-fixtures.js';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const tempRoots: string[] = [];

async function prepareFixture(fixtureName: string): Promise<string> {
  const base = await fs.mkdtemp(path.join(tmpdir(), 'outline-spec-cli-e2e-'));
  tempRoots.push(base);
  const projectDir = path.join(base, 'project');
  await fs.mkdir(projectDir, { recursive: true });
  const fixtureDir = path.join(cliProjectRoot, 'test', 'fixtures', fixtureName);
  await fs.cp(fixtureDir, projectDir, { recursive: true });
  return projectDir;
}

function expectJsonOnlyOutput(result: Awaited<ReturnType<typeof runCLI>>) {
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe('');
  expect(() => JSON.parse(result.stdout)).not.toThrow();
}

afterAll(async () => {
  await Promise.all(tempRoots.map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('outline-spec CLI e2e basics', () => {
  it('preserves initialized directories through a Git clone without listing anchors as work', async () => {
    const base = await fs.mkdtemp(path.join(tmpdir(), 'outline-spec-init-clone-'));
    tempRoots.push(base);
    const projectDir = path.join(base, 'project');
    const cloneDir = path.join(base, 'clone');
    await fs.mkdir(projectDir);
    const env = {
      ...isolatedGitEnv(base),
      XDG_CONFIG_HOME: path.join(base, 'config'),
      XDG_DATA_HOME: path.join(base, 'data'),
    };
    const initialized = await runCLI(['init', '--tools', 'none'], { cwd: projectDir, env });
    expect(initialized.exitCode).toBe(0);

    const gitOptions = { cwd: projectDir, env: { ...process.env, ...env }, stdio: 'pipe' as const };
    execFileSync('git', ['init'], gitOptions);
    execFileSync('git', ['add', 'outline-spec'], gitOptions);
    execFileSync('git', ['commit', '-m', 'Initialize outline-spec'], gitOptions);
    execFileSync('git', ['clone', '--no-local', projectDir, cloneDir], gitOptions);

    expect(await fs.readdir(path.join(cloneDir, 'outline-spec', 'specs'))).toEqual(['.gitkeep']);
    expect(await fs.readdir(path.join(cloneDir, 'outline-spec', 'changes'))).toEqual(['.gitkeep']);
    const changes = await runCLI(['list', '--json'], { cwd: cloneDir, env });
    expectJsonOnlyOutput(changes);
    expect(JSON.parse(changes.stdout).changes).toEqual([]);
    const specs = await runCLI(['list', '--specs'], { cwd: cloneDir, env });
    expect(specs.exitCode).toBe(0);
    expect(specs.stdout).toContain('No specs found.');
    // Seven subprocesses (3 CLI, 4 git): ~2.6s on the Windows runner, past 10s under load.
  }, 60_000);

  it('shows help output', async () => {
    const result = await runCLI(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: outline-spec');
    expect(result.stderr).toBe('');

  });

  it('shows dynamic tool ids in init help', async () => {
    const result = await runCLI(['init', '--help']);
    expect(result.exitCode).toBe(0);

    const expectedTools = AI_TOOLS.filter((tool) => tool.available)
      .map((tool) => tool.value)
      .join(', ');
    const normalizedOutput = result.stdout.replace(/\s+/g, ' ').trim();
    expect(normalizedOutput).toContain(
      `Use "all", "none", or a comma-separated list of: ${expectedTools}`
    );
    expect(normalizedOutput).toContain('--language <language>');
  });

  it('reports the package version', async () => {
    const pkgRaw = await fs.readFile(path.join(cliProjectRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw);
    const result = await runCLI(['--version']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(pkg.version);
  });

  describe('version command', () => {
    it('reports the local version', async () => {
      const cwd = await fs.mkdtemp(path.join(tmpdir(), 'outline-spec-version-empty-'));
      tempRoots.push(cwd);
      const pkgRaw = await fs.readFile(path.join(cliProjectRoot, 'package.json'), 'utf-8');
      const pkg = JSON.parse(pkgRaw);

      const result = await runCLI(['version'], { cwd });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(`outline-spec ${pkg.version}\n`);
      expect(result.stderr).toBe('');
    });

    it('prints one schema-versioned JSON document', async () => {
      const result = await runCLI(['version', '--json']);

      expectJsonOnlyOutput(result);
      expect(JSON.parse(result.stdout)).toEqual({ schemaVersion: 1, version: expect.any(String) });
    });

    it('has no update check', async () => {
      const result = await runCLI(['version', '--check']);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("error: unknown option '--check'");
    });

    it('rejects upgrades without invoking a package manager', async () => {
      const result = await runCLI(['version', '--upgrade']);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain("error: unknown option '--upgrade'");
    });
  });

  it('validates the tmp-init fixture with --all --json', async () => {
    const projectDir = await prepareFixture('tmp-init');
    const result = await runCLI(['validate', '--all', '--json'], { cwd: projectDir });
    expect(result.exitCode).toBe(0);
    const output = result.stdout.trim();
    expect(output).not.toBe('');
    const json = JSON.parse(output);
    expect(json.summary?.totals?.failed).toBe(0);
    expect(json.items.some((item: any) => item.id === 'c1' && item.type === 'change')).toBe(true);
  });

  it('keeps list --json free of spinner output', async () => {
    const projectDir = await prepareFixture('tmp-init');
    const result = await runCLI(['list', '--json'], { cwd: projectDir });
    expectJsonOnlyOutput(result);
  });

  it('reports a malformed changes/ as an error instead of an empty JSON list', async () => {
    const projectDir = await prepareFixture('tmp-init');
    const malformedPath = path.join(projectDir, 'outline-spec', 'changes');
    await fs.rm(malformedPath, { recursive: true, force: true });
    await fs.writeFile(malformedPath, 'not a directory\n');

    const result = await runCLI(['list', '--json'], { cwd: projectDir });

    expect(result.exitCode).toBe(1);
    const output = JSON.parse(result.stdout);
    expect(output.changes).toEqual([]);
    expect(output.status).toEqual([expect.objectContaining({ severity: 'error', code: 'list_error' })]);
  });

  describe('legacy change list compatibility', () => {
    it.each([
      { args: [], output: 'c1\n' },
      { args: ['--long'], output: 'c1: [specs 1]\n' },
    ])('preserves text output with $args and warns on stderr', async ({ args, output }) => {
      const projectDir = await prepareFixture('tmp-init');
      const result = await runCLI(['change', 'list', ...args], { cwd: projectDir });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(output);
      expect(result.stderr).toContain('Warning: "outline-spec change list" is deprecated. Use "outline-spec list".');
    });

    it('preserves JSON output and warns on stderr', async () => {
      const projectDir = await prepareFixture('tmp-init');
      const result = await runCLI(['change', 'list', '--json'], { cwd: projectDir });

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual([
        { id: 'c1', title: 'c1', specCount: 1, taskStatus: { total: 0, completed: 0 } },
      ]);
      expect(result.stderr).toContain('Warning: "outline-spec change list" is deprecated. Use "outline-spec list".');
    });

    it('rejects the unsupported --all option', async () => {
      const projectDir = await prepareFixture('tmp-init');
      const result = await runCLI(['change', 'list', '--all'], { cwd: projectDir });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain("error: unknown option '--all'");
    });
  });

  it.each([
    { tasks: '', completedTasks: 0, totalTasks: 0, status: 'no-tasks' },
    { tasks: '- [x] Done\n- [ ] Pending\n', completedTasks: 1, totalTasks: 2, status: 'in-progress' },
    { tasks: '- [x] Done\n', completedTasks: 1, totalTasks: 1, status: 'complete' },
  ])('lists custom-schema task status ($status) without inventing a schema field', async (expected) => {
    const projectDir = await prepareFixture('tmp-init');
    const schemaDir = path.join(projectDir, 'outline-spec', 'schemas', 'custom-workflow');
    await fs.mkdir(schemaDir, { recursive: true });
    await fs.writeFile(path.join(schemaDir, 'schema.yaml'), [
      'name: custom-workflow',
      'version: 1',
      'description: Custom tracked work',
      'artifacts:',
      '  - id: work',
      '    generates: work.md',
      '    description: Implementation work',
      '    template: work.md',
      '    requires: []',
      'apply:',
      '  requires: [work]',
      '  tracks: work.md',
      '',
    ].join('\n'));
    const changeDir = path.join(projectDir, 'outline-spec', 'changes', 'custom-change');
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(path.join(changeDir, '.outline-spec.yaml'), 'schema: custom-workflow\n');
    await fs.writeFile(path.join(changeDir, 'work.md'), expected.tasks);

    const listResult = await runCLI(['list', '--json'], { cwd: projectDir });
    expectJsonOnlyOutput(listResult);
    const change = JSON.parse(listResult.stdout).changes.find(
      (entry: { name: string }) => entry.name === 'custom-change'
    );
    expect(change).toMatchObject({
      name: 'custom-change',
      completedTasks: expected.completedTasks,
      totalTasks: expected.totalTasks,
      status: expected.status,
      lastModified: expect.any(String),
    });
    expect(Number.isFinite(Date.parse(change.lastModified))).toBe(true);
    expect(change).not.toHaveProperty('schema');
    expect(change).not.toHaveProperty('schemaName');

    const statusResult = await runCLI(['status', '--change', 'custom-change', '--json'], { cwd: projectDir });
    expectJsonOnlyOutput(statusResult);
    expect(JSON.parse(statusResult.stdout).schemaName).toBe('custom-workflow');
  });

  it('keeps schemas --json free of spinner output', async () => {
    const projectDir = await prepareFixture('tmp-init');
    const result = await runCLI(['schemas', '--json'], { cwd: projectDir });
    expectJsonOnlyOutput(result);
  });

  it('keeps status --json free of spinner output', async () => {
    const projectDir = await prepareFixture('tmp-init');
    const result = await runCLI(['status', '--change', 'c1', '--json'], { cwd: projectDir });
    expectJsonOnlyOutput(result);
  });

  it('keeps instructions --json free of spinner output', async () => {
    const projectDir = await prepareFixture('tmp-init');
    const result = await runCLI(['instructions', 'outline', '--change', 'c1', '--json'], {
      cwd: projectDir,
    });
    expectJsonOnlyOutput(result);
  });

  it('keeps instructions apply --json free of spinner output', async () => {
    const projectDir = await prepareFixture('tmp-init');
    const result = await runCLI(['instructions', 'apply', '--change', 'c1', '--json'], {
      cwd: projectDir,
    });
    expectJsonOnlyOutput(result);
  });

  it('keeps templates --json free of spinner output', async () => {
    const projectDir = await prepareFixture('tmp-init');
    const result = await runCLI(['templates', '--json'], { cwd: projectDir });
    expectJsonOnlyOutput(result);
  });

  it('returns an error for unknown items in the fixture', async () => {
    const projectDir = await prepareFixture('tmp-init');
    const result = await runCLI(['validate', 'does-not-exist'], { cwd: projectDir });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown item 'does-not-exist'");
  });

  describe('init command non-interactive options', () => {
    it('initializes artifact language non-interactively', async () => {
      const projectDir = await prepareFixture('tmp-init');
      const emptyProjectDir = path.join(projectDir, '..', 'language-project');
      await fs.mkdir(emptyProjectDir, { recursive: true });

      const result = await runCLI(
        ['init', '--tools', 'none', '--language', 'French', '--no-animation'],
        { cwd: emptyProjectDir },
      );

      expect(result.exitCode).toBe(0);
      const config = await fs.readFile(
        path.join(emptyProjectDir, 'outline-spec', 'config.yaml'),
        'utf-8',
      );
      expect(config).toContain('Language: French');
      expect(config).toContain('All artifacts must be written in French.');
      expect(config).toContain('Keep outline-spec structural headings (such as ## Requirements) in English.');

      const created = await runCLI(['new', 'change', 'language-check'], {
        cwd: emptyProjectDir,
      });
      expect(created.exitCode).toBe(0);
      const instructions = await runCLI(
        ['instructions', 'outline', '--change', 'language-check', '--json'],
        { cwd: emptyProjectDir },
      );
      expect(instructions.exitCode).toBe(0);
      expect(JSON.parse(instructions.stdout).context).toContain('Language: French');
    });

    it('initializes with --tools all option', async () => {
      const projectDir = await prepareFixture('tmp-init');
      const emptyProjectDir = path.join(projectDir, '..', 'empty-project');
      await fs.mkdir(emptyProjectDir, { recursive: true });

      const codexHome = path.join(emptyProjectDir, '.codex');
      const testHome = path.join(emptyProjectDir, 'home');
      const result = await runCLI(['init', '--tools', 'all'], {
        cwd: emptyProjectDir,
        env: { CODEX_HOME: codexHome, HOME: testHome, USERPROFILE: testHome },
        timeoutMs: 20000,
      });
      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('outline-spec Setup Complete');

      // Check that skills were created for multiple tools
      const claudeSkillPath = path.join(emptyProjectDir, '.claude/skills/outl-explore/SKILL.md');
      const cursorSkillPath = path.join(emptyProjectDir, '.cursor/skills/outl-explore/SKILL.md');
      const minimaxSkillPath = path.join(
        testHome,
        '.minimax/skills/outl-explore/SKILL.md'
      );
      expect(await fileExists(claudeSkillPath)).toBe(true);
      expect(await fileExists(cursorSkillPath)).toBe(true);
      expect(await fileExists(minimaxSkillPath)).toBe(true);
    }, 25000);

    it('initializes with --tools list option', async () => {
      const projectDir = await prepareFixture('tmp-init');
      const emptyProjectDir = path.join(projectDir, '..', 'empty-project');
      await fs.mkdir(emptyProjectDir, { recursive: true });

      const result = await runCLI(['init', '--tools', 'claude'], { cwd: emptyProjectDir });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('outline-spec Setup Complete');
      expect(result.stdout).toContain('Claude Code');

      // New init creates skills, not CLAUDE.md
      const claudeSkillPath = path.join(emptyProjectDir, '.claude/skills/outl-explore/SKILL.md');
      const cursorSkillPath = path.join(emptyProjectDir, '.cursor/skills/outl-explore/SKILL.md');
      expect(await fileExists(claudeSkillPath)).toBe(true);
      expect(await fileExists(cursorSkillPath)).toBe(false); // Not selected
    });

    it('initializes with --tools agents option', async () => {
      const projectDir = await prepareFixture('tmp-init');
      const emptyProjectDir = path.join(projectDir, '..', 'empty-project');
      await fs.mkdir(emptyProjectDir, { recursive: true });

      const result = await runCLI(['init', '--tools', 'agents'], { cwd: emptyProjectDir });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('outline-spec Setup Complete');

      const skillPath = path.join(emptyProjectDir, '.agents', 'skills', 'outl-explore', 'SKILL.md');
      expect(await fileExists(skillPath)).toBe(true);
    });

    it('initializes with --tools zed option', async () => {
      const projectDir = await prepareFixture('tmp-init');
      const emptyProjectDir = path.join(projectDir, '..', 'empty-project');
      await fs.mkdir(emptyProjectDir, { recursive: true });

      const result = await runCLI(['init', '--tools', 'zed'], { cwd: emptyProjectDir });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('outline-spec Setup Complete');
      expect(result.stdout).toContain('Zed Agent');
      expect(result.stdout).not.toContain('Restart your IDE');

      const skillPath = path.join(emptyProjectDir, '.agents', 'skills', 'outl-explore', 'SKILL.md');
      expect(await fileExists(skillPath)).toBe(true);
      expect(await fs.readFile(
        path.join(emptyProjectDir, '.agents', 'skills', '.outline-spec-target'),
        'utf-8'
      )).toBe('zed\n');

      const updateResult = await runCLI(['update'], { cwd: emptyProjectDir });
      expect(updateResult.exitCode).toBe(0);
      expect(await fs.readFile(
        path.join(emptyProjectDir, '.agents', 'skills', '.outline-spec-target'),
        'utf-8'
      )).toBe('zed\n');
      const updatedSkill = await fs.readFile(skillPath, 'utf-8');
      expect(updatedSkill).toContain('/outl-explore');
      expect(updatedSkill).not.toContain('$outl-explore');
    });

    it('initializes with --tools none option', async () => {
      const projectDir = await prepareFixture('tmp-init');
      const emptyProjectDir = path.join(projectDir, '..', 'empty-project');
      await fs.mkdir(emptyProjectDir, { recursive: true });

      const result = await runCLI(['init', '--tools', 'none'], { cwd: emptyProjectDir });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('outline-spec Setup Complete');

      // With --tools none, no tool skills should be created
      const claudeSkillPath = path.join(emptyProjectDir, '.claude/skills/outl-explore/SKILL.md');
      const cursorSkillPath = path.join(emptyProjectDir, '.cursor/skills/outl-explore/SKILL.md');

      expect(await fileExists(claudeSkillPath)).toBe(false);
      expect(await fileExists(cursorSkillPath)).toBe(false);
    });

    it('returns error for invalid tool names', async () => {
      const projectDir = await prepareFixture('tmp-init');
      const emptyProjectDir = path.join(projectDir, '..', 'empty-project');
      await fs.mkdir(emptyProjectDir, { recursive: true });

      const result = await runCLI(['init', '--tools', 'invalid-tool'], { cwd: emptyProjectDir });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid tool(s): invalid-tool');
      expect(result.stderr).toContain('Available values:');
    });

    it('returns error when combining reserved keywords with explicit ids', async () => {
      const projectDir = await prepareFixture('tmp-init');
      const emptyProjectDir = path.join(projectDir, '..', 'empty-project');
      await fs.mkdir(emptyProjectDir, { recursive: true });

      const result = await runCLI(['init', '--tools', 'all,claude'], { cwd: emptyProjectDir });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Cannot combine reserved values "all" or "none" with specific tool IDs');
    });
  });

  describe('archive with no terminal to answer its prompts (#1479)', () => {
    // runCLI closes the child's stdin, which is exactly how an AI agent or a
    // CI script invokes the CLI.
    const OUTLINE = '## Proposal\nDocument greeting behavior.\n\n## Requirements\n1. greeting: How the system greets.\n  a. Greeting: The system greets the user.\n';

    async function prepareChange(options: { tasksComplete?: boolean } = {}): Promise<string> {
      const base = await fs.mkdtemp(path.join(tmpdir(), 'outline-spec-archive-e2e-'));
      tempRoots.push(base);
      const changeDir = path.join(base, 'outline-spec', 'changes', 'add-greeting');
      await fs.mkdir(changeDir, { recursive: true });
      await fs.mkdir(path.join(base, 'outline-spec', 'specs'), { recursive: true });
      await fs.writeFile(path.join(changeDir, 'outline.md'), OUTLINE);
      await fs.writeFile(
        path.join(changeDir, 'tasks.md'),
        options.tasksComplete === false ? '- [ ] Task 1\n' : '- [x] Task 1\n'
      );
      return base;
    }

    it('reports the flag to pass instead of a closed-prompt error', async () => {
      const projectDir = await prepareChange({ tasksComplete: false });
      const result = await runCLI(['archive', 'add-greeting'], { cwd: projectDir });

      const output = `${result.stdout}${result.stderr}`;
      expect(result.exitCode).toBe(1);
      expect(output).not.toContain('force closed the prompt');
      expect(output).toContain('1 incomplete task(s) found');
      expect(output).toContain('no answer could be read from stdin');
      expect(output).toContain('outline-spec archive add-greeting --yes');

      // The change is untouched: nothing was archived.
      expect(await fileExists(path.join(projectDir, 'outline-spec', 'changes', 'add-greeting', 'outline.md'))).toBe(true);
      expect(await fileExists(path.join(projectDir, 'outline-spec', 'specs', 'greeting', 'spec.md'))).toBe(false);
    });

    it('archives without prompting when every task is done', async () => {
      const projectDir = await prepareChange();
      const result = await runCLI(['archive', 'add-greeting'], { cwd: projectDir });

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stderr).not.toContain('Note:');
      expect(await fileExists(path.join(projectDir, 'outline-spec', 'specs', 'greeting', 'spec.md'))).toBe(true);
      expect(await fileExists(path.join(projectDir, 'outline-spec', 'changes', 'add-greeting'))).toBe(false);
    });

    it('archives normally once that flag is passed', async () => {
      const projectDir = await prepareChange({ tasksComplete: false });
      const result = await runCLI(['archive', 'add-greeting', '--yes'], { cwd: projectDir });

      expect(result.exitCode).toBe(0);
      expect(await fs.readFile(path.join(projectDir, 'outline-spec', 'specs', 'greeting', 'spec.md'), 'utf-8')).toBe(
        '# greeting\nHow the system greets.\n\n1. Greeting: The system greets the user.\n'
      );
    });

    it('asks for a change name instead of exiting 0 without archiving', async () => {
      const projectDir = await prepareChange();
      const result = await runCLI(['archive'], { cwd: projectDir });

      const output = `${result.stdout}${result.stderr}`;
      expect(result.exitCode).toBe(1);
      expect(output).toContain('A change name is required');
      expect(await fileExists(path.join(projectDir, 'outline-spec', 'changes', 'add-greeting', 'outline.md'))).toBe(true);
    });

    async function prepareStoreChange(base: string, changeName: string): Promise<NodeJS.ProcessEnv> {
      const env = {
        XDG_DATA_HOME: path.join(base, 'data'),
        XDG_CONFIG_HOME: path.join(base, 'config'),
      };
      const storeRoot = path.join(base, 'team-store');
      createOutlineSpecRoot(storeRoot);
      await registerStore({
        id: 'team-store',
        localPath: storeRoot,
        globalDataDir: getGlobalDataDir({ env }),
      });

      const changeDir = path.join(storeRoot, 'outline-spec', 'changes', changeName);
      await fs.mkdir(changeDir, { recursive: true });
      await fs.writeFile(path.join(changeDir, 'outline.md'), OUTLINE);
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '- [ ] Task 1\n');

      await fs.mkdir(path.join(base, 'no-root-here'), { recursive: true });
      return env;
    }

    it('keeps --store in the suggested rerun for a store-rooted change', async () => {
      // The rerun has to name the same root the blocked run used, or pasting
      // it archives from the wrong place - or from nowhere.
      const base = await fs.mkdtemp(path.join(tmpdir(), 'outline-spec-archive-store-e2e-'));
      tempRoots.push(base);
      const env = await prepareStoreChange(base, 'add-greeting');

      const result = await runCLI(['archive', 'add-greeting', '--store', 'team-store'], {
        cwd: path.join(base, 'no-root-here'),
        env,
      });

      const output = `${result.stdout}${result.stderr}`;
      expect(result.exitCode).toBe(1);
      expect(output).toContain('outline-spec archive add-greeting --yes --store team-store');
    });

    it('keeps --store in front of the `--` for a dash-leading change name', async () => {
      // The store flag stays an option (in front of `--`) while the name stays an argument (behind it).
      const base = await fs.mkdtemp(path.join(tmpdir(), 'outline-spec-archive-store-dash-e2e-'));
      tempRoots.push(base);
      const env = await prepareStoreChange(base, '--force');

      const result = await runCLI(['archive', '--store', 'team-store', '--', '--force'], {
        cwd: path.join(base, 'no-root-here'),
        env,
      });

      const output = `${result.stdout}${result.stderr}`;
      expect(result.exitCode).toBe(1);
      expect(output).toContain('outline-spec archive --yes --store team-store -- --force');
    });
  });
});
