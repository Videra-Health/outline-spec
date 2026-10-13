import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { ListCommand } from '../../src/core/list.js';
import { runCLI } from '../helpers/run-cli.js';

describe('ListCommand', () => {
  let tempDir: string;
  let originalLog: typeof console.log;
  let logOutput: string[] = [];

  beforeEach(async () => {
    // Create temp directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'outline-spec-list-test-'));

    // Mock console.log to capture output
    originalLog = console.log;
    console.log = (...args: any[]) => {
      logOutput.push(args.join(' '));
    };
    logOutput = [];
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Restore console.log
    console.log = originalLog;

    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('change listing', () => {
    async function writeChange(name: string, tasks = '- [x] Done\n- [ ] Pending\n'): Promise<string> {
      const changeDir = path.join(tempDir, 'outline-spec', 'changes', name);
      await fs.mkdir(changeDir, { recursive: true });
      await fs.writeFile(path.join(changeDir, 'tasks.md'), tasks);
      return changeDir;
    }

    it('ignores an archive folder left by older projects', async () => {
      await writeChange('active');
      await writeChange('archive/2026-01-01-old-change');

      await new ListCommand().execute(tempDir, 'changes');

      expect(logOutput).toEqual(['Changes:', '  active     1/2 tasks     just now']);
    });

    it('preserves the exact default JSON shape and excludes the archive folder', async () => {
      const changeDir = await writeChange('active');
      await writeChange('archive/old');
      const modified = new Date('2026-01-02T03:04:05.000Z');
      await fs.utimes(path.join(changeDir, 'tasks.md'), modified, modified);

      await new ListCommand().execute(tempDir, 'changes', { json: true });

      expect(logOutput).toEqual([JSON.stringify({
        changes: [{
          name: 'active',
          completedTasks: 1,
          totalTasks: 2,
          lastModified: modified.toISOString(),
          status: 'in-progress'
        }]
      }, null, 2)]);
    });

    it('preserves root metadata and task-derived status in JSON', async () => {
      await writeChange('complete', '- [x] Done\n');
      await writeChange('incomplete');
      await writeChange('no-tasks', 'No checkboxes\n');
      const root = { path: path.join(tempDir, 'outline-spec'), source: 'nearest' as const };

      await new ListCommand().execute(tempDir, 'changes', { json: true, sort: 'name', root });

      const result = JSON.parse(logOutput[0]);
      expect(result.root).toEqual(root);
      expect(result.changes.map(({ name, status }: { name: string; status: string }) => ({ name, status }))).toEqual([
        { name: 'complete', status: 'complete' },
        { name: 'incomplete', status: 'in-progress' },
        { name: 'no-tasks', status: 'no-tasks' }
      ]);
    });

    it('preserves root metadata in empty JSON', async () => {
      const root = { path: path.join(tempDir, 'outline-spec'), source: 'nearest' as const };

      await new ListCommand().execute(tempDir, 'changes', { json: true, root });

      expect(JSON.parse(logOutput[0])).toEqual({ changes: [], root });
    });

    it.each([
      ['recent', ['z-change', 'm-change', 'a-change']],
      ['name', ['a-change', 'm-change', 'z-change']]
    ] as const)('sorts JSON by %s', async (sort, names) => {
      for (const [name, timestamp] of [
        ['a-change', '2026-01-01T00:00:00Z'],
        ['m-change', '2026-01-02T00:00:00Z'],
        ['z-change', '2026-01-03T00:00:00Z']
      ]) {
        const changeDir = await writeChange(name);
        const modified = new Date(timestamp);
        await fs.utimes(path.join(changeDir, 'tasks.md'), modified, modified);
      }

      await new ListCommand().execute(tempDir, 'changes', { json: true, sort });

      expect(JSON.parse(logOutput[0]).changes.map((change: { name: string }) => change.name)).toEqual(names);
    });

    it('uses recursive file modification times', async () => {
      const old = await writeChange('old');
      const recent = await writeChange('recent');
      const modified = new Date('2026-01-01T00:00:00Z');
      await fs.utimes(path.join(old, 'tasks.md'), modified, modified);
      await fs.utimes(path.join(recent, 'tasks.md'), modified, modified);
      await fs.mkdir(path.join(recent, 'nested'));
      await fs.writeFile(path.join(recent, 'nested', 'design.md'), 'New design');

      await new ListCommand().execute(tempDir, 'changes', { json: true });

      expect(JSON.parse(logOutput[0]).changes.map((change: { name: string }) => change.name)).toEqual(['recent', 'old']);
    });

    it('preserves linked-target modification times for active changes', async () => {
      const changeDir = await writeChange('active');
      const target = path.join(tempDir, 'shared-notes');
      await fs.mkdir(target);
      await fs.symlink(target, path.join(changeDir, 'notes'), process.platform === 'win32' ? 'junction' : 'dir');
      const modified = new Date('2030-01-01T00:00:00Z');
      await fs.utimes(target, modified, modified);

      await new ListCommand().execute(tempDir, 'changes', { json: true });

      expect(JSON.parse(logOutput[0]).changes[0].lastModified).toBe(modified.toISOString());
    });

    it('resolves task progress using project-local schema metadata', async () => {
      const schemaDir = path.join(tempDir, 'outline-spec', 'schemas', 'custom-tasks');
      await fs.mkdir(schemaDir, { recursive: true });
      await fs.writeFile(path.join(schemaDir, 'schema.yaml'), [
        'name: custom-tasks',
        'version: 1',
        'description: Nested implementation checklists',
        'artifacts:',
        '  - id: implementation',
        '    generates: "**/checklist.md"',
        '    description: Implementation checklist',
        '    template: tasks.md',
        '    requires: []',
        'apply:',
        '  requires: [implementation]',
        '  tracks: "**/checklist.md"',
        ''
      ].join('\n'));
      const changeDir = await writeChange('custom-change', '- [x] Wrong tasks file\n');
      await fs.writeFile(path.join(changeDir, '.outline-spec.yaml'), 'schema: custom-tasks\n');
      await fs.mkdir(path.join(changeDir, 'backend'));
      await fs.writeFile(path.join(changeDir, 'backend', 'checklist.md'), '- [x] Parent\n  - [ ] Child\n');
      await fs.mkdir(path.join(changeDir, 'frontend'));
      await fs.writeFile(path.join(changeDir, 'frontend', 'checklist.md'), '- [x] Done\n');

      await new ListCommand().execute(tempDir, 'changes', { json: true });

      expect(JSON.parse(logOutput[0]).changes).toEqual([expect.objectContaining({
        name: 'custom-change', completedTasks: 2, totalTasks: 3, status: 'in-progress'
      })]);
    });
  });

  describe('execute', () => {
    it('should treat a missing outline-spec/changes directory as no active changes', async () => {
      const listCommand = new ListCommand();

      await listCommand.execute(tempDir, 'changes');

      expect(logOutput).toEqual(['No active changes found.']);
    });

    it('should handle empty changes directory', async () => {
      const changesDir = path.join(tempDir, 'outline-spec', 'changes');
      await fs.mkdir(changesDir, { recursive: true });

      const listCommand = new ListCommand();
      await listCommand.execute(tempDir, 'changes');

      expect(logOutput).toEqual(['No active changes found.']);
    });

    it('should not report a malformed outline-spec/changes path as empty', async () => {
      await fs.mkdir(path.join(tempDir, 'outline-spec'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'outline-spec', 'changes'), 'not a directory\n');

      const listCommand = new ListCommand();

      await expect(listCommand.execute(tempDir, 'changes')).rejects.toThrow();
      expect(logOutput).toEqual([]);
    });

    it('should exclude archive directory', async () => {
      const changesDir = path.join(tempDir, 'outline-spec', 'changes');
      await fs.mkdir(path.join(changesDir, 'archive'), { recursive: true });
      await fs.mkdir(path.join(changesDir, 'my-change'), { recursive: true });
      
      // Create tasks.md with some tasks
      await fs.writeFile(
        path.join(changesDir, 'my-change', 'tasks.md'),
        '- [x] Task 1\n- [ ] Task 2\n'
      );

      const listCommand = new ListCommand();
      await listCommand.execute(tempDir, 'changes');

      expect(logOutput).toContain('Changes:');
      expect(logOutput.some(line => line.includes('my-change'))).toBe(true);
      expect(logOutput.some(line => line.includes('archive'))).toBe(false);
    });

    it('should count tasks correctly', async () => {
      const changesDir = path.join(tempDir, 'outline-spec', 'changes');
      await fs.mkdir(path.join(changesDir, 'test-change'), { recursive: true });
      
      await fs.writeFile(
        path.join(changesDir, 'test-change', 'tasks.md'),
        `# Tasks
- [x] Completed task 1
- [x] Completed task 2
- [ ] Incomplete task 1
- [ ] Incomplete task 2
- [ ] Incomplete task 3
Regular text that should be ignored
`
      );

      const listCommand = new ListCommand();
      await listCommand.execute(tempDir, 'changes');

      expect(logOutput.some(line => line.includes('2/5 tasks'))).toBe(true);
    });

    it('should show complete status for fully completed changes', async () => {
      const changesDir = path.join(tempDir, 'outline-spec', 'changes');
      await fs.mkdir(path.join(changesDir, 'completed-change'), { recursive: true });
      
      await fs.writeFile(
        path.join(changesDir, 'completed-change', 'tasks.md'),
        '- [x] Task 1\n- [x] Task 2\n- [x] Task 3\n'
      );

      const listCommand = new ListCommand();
      await listCommand.execute(tempDir, 'changes');

      expect(logOutput.some(line => line.includes('✓ Complete'))).toBe(true);
    });

    it('does not report a change with unfinished sub-tasks as complete (#1485)', async () => {
      const changesDir = path.join(tempDir, 'outline-spec', 'changes');
      await fs.mkdir(path.join(changesDir, 'nested-change'), { recursive: true });

      await fs.writeFile(
        path.join(changesDir, 'nested-change', 'tasks.md'),
        '- [x] 1.1 Parent task\n  - [ ] 1.1.1 Unfinished sub-task\n'
      );

      const listCommand = new ListCommand();
      await listCommand.execute(tempDir, 'changes');

      expect(logOutput.some(line => line.includes('1/2 tasks'))).toBe(true);
      expect(logOutput.some(line => line.includes('✓ Complete'))).toBe(false);
    });

    it('does not report a change whose remaining work uses an unrecognised marker as complete (#1761)', async () => {
      const changesDir = path.join(tempDir, 'outline-spec', 'changes');
      await fs.mkdir(path.join(changesDir, 'deferred-change'), { recursive: true });

      await fs.writeFile(
        path.join(changesDir, 'deferred-change', 'tasks.md'),
        '- [x] 1.1 Done\n- [~] 1.2 Deferred\n- [] 1.3 Empty box\n'
      );

      const listCommand = new ListCommand();
      await listCommand.execute(tempDir, 'changes');

      expect(logOutput.some(line => line.includes('1/3 tasks'))).toBe(true);
      expect(logOutput.some(line => line.includes('✓ Complete'))).toBe(false);
    });

    it('should handle changes without tasks.md', async () => {
      const changesDir = path.join(tempDir, 'outline-spec', 'changes');
      await fs.mkdir(path.join(changesDir, 'no-tasks'), { recursive: true });

      const listCommand = new ListCommand();
      await listCommand.execute(tempDir, 'changes');

      expect(logOutput.some(line => line.includes('no-tasks') && line.includes('No tasks'))).toBe(true);
    });

    it('should sort changes alphabetically when sort=name', async () => {
      const changesDir = path.join(tempDir, 'outline-spec', 'changes');
      await fs.mkdir(path.join(changesDir, 'zebra'), { recursive: true });
      await fs.mkdir(path.join(changesDir, 'alpha'), { recursive: true });
      await fs.mkdir(path.join(changesDir, 'middle'), { recursive: true });

      const listCommand = new ListCommand();
      await listCommand.execute(tempDir, 'changes', { sort: 'name' });

      const changeLines = logOutput.filter(line =>
        line.includes('alpha') || line.includes('middle') || line.includes('zebra')
      );

      expect(changeLines[0]).toContain('alpha');
      expect(changeLines[1]).toContain('middle');
      expect(changeLines[2]).toContain('zebra');
    });

    it('should handle multiple changes with various states', async () => {
      const changesDir = path.join(tempDir, 'outline-spec', 'changes');
      
      // Complete change
      await fs.mkdir(path.join(changesDir, 'completed'), { recursive: true });
      await fs.writeFile(
        path.join(changesDir, 'completed', 'tasks.md'),
        '- [x] Task 1\n- [x] Task 2\n'
      );

      // Partial change
      await fs.mkdir(path.join(changesDir, 'partial'), { recursive: true });
      await fs.writeFile(
        path.join(changesDir, 'partial', 'tasks.md'),
        '- [x] Done\n- [ ] Not done\n- [ ] Also not done\n'
      );

      // No tasks
      await fs.mkdir(path.join(changesDir, 'no-tasks'), { recursive: true });

      const listCommand = new ListCommand();
      await listCommand.execute(tempDir);

      expect(logOutput).toContain('Changes:');
      expect(logOutput.some(line => line.includes('completed') && line.includes('✓ Complete'))).toBe(true);
      expect(logOutput.some(line => line.includes('partial') && line.includes('1/3 tasks'))).toBe(true);
      expect(logOutput.some(line => line.includes('no-tasks') && line.includes('No tasks'))).toBe(true);
    });

    describe('a namespace folder holding nested changes (#1846)', () => {
      async function seedNestedChange(): Promise<string> {
        const changesDir = path.join(tempDir, 'outline-spec', 'changes');
        await fs.mkdir(path.join(changesDir, 'mobile', 'refresh-token'), { recursive: true });
        await fs.writeFile(
          path.join(changesDir, 'mobile', 'refresh-token', 'tasks.md'),
          '- [ ] Not done\n'
        );
        await fs.mkdir(path.join(changesDir, 'add-auth'), { recursive: true });
        await fs.writeFile(path.join(changesDir, 'add-auth', 'tasks.md'), '- [x] Done\n');
        return changesDir;
      }

      it('is listed as "not a change" instead of a task-less change', async () => {
        await seedNestedChange();

        await new ListCommand().execute(tempDir);

        expect(
          logOutput.some(line => line.includes('mobile') && line.includes('not a change'))
        ).toBe(true);
        expect(
          logOutput.some(line => line.includes('mobile') && line.includes('No tasks'))
        ).toBe(false);
      });

      it('explains the nesting and how to fix it', async () => {
        await seedNestedChange();

        await new ListCommand().execute(tempDir);

        const warning = logOutput.find(line => line.startsWith('Warning:'));
        expect(warning).toBeDefined();
        expect(warning).toContain('outline-spec/changes/mobile/refresh-token/');
        expect(warning).toContain('mobile-refresh-token');
      });

      it('still lists the real changes around it', async () => {
        await seedNestedChange();

        await new ListCommand().execute(tempDir);

        expect(
          logOutput.some(line => line.includes('add-auth') && line.includes('Complete'))
        ).toBe(true);
      });

      it('reports the nesting in --json without changing the entry shape', async () => {
        await seedNestedChange();

        await new ListCommand().execute(tempDir, 'changes', { json: true });

        const payload = JSON.parse(logOutput.join('\n'));
        expect(payload.warnings).toEqual([
          expect.objectContaining({
            code: 'nested_change_directory',
            name: 'mobile',
            nested: ['mobile/refresh-token'],
          }),
        ]);
        const entry = payload.changes.find((c: { name: string }) => c.name === 'mobile');
        expect(entry).toMatchObject({ name: 'mobile', nested: ['mobile/refresh-token'] });
        expect(payload.changes.find((c: { name: string }) => c.name === 'add-auth')).not.toHaveProperty('nested');
      });

      it('omits warnings from --json when nothing is nested', async () => {
        const changesDir = path.join(tempDir, 'outline-spec', 'changes');
        await fs.mkdir(path.join(changesDir, 'add-auth'), { recursive: true });

        await new ListCommand().execute(tempDir, 'changes', { json: true });

        expect(JSON.parse(logOutput.join('\n'))).not.toHaveProperty('warnings');
      });
    });
  });

  describe('entries that cannot be stat-ed', () => {
    // Emacs drops a `.#<file>` lock symlink, pointing at a nonexistent target,
    // next to every file with unsaved edits. One such entry used to fail the
    // whole listing with ENOENT, so `list --json` reported zero changes.
    async function writeChange(name: string): Promise<string> {
      const changeDir = path.join(tempDir, 'outline-spec', 'changes', name);
      await fs.mkdir(changeDir, { recursive: true });
      await fs.writeFile(path.join(changeDir, 'tasks.md'), '- [x] Task 1\n- [ ] Task 2\n');
      return changeDir;
    }

    async function listJson(): Promise<Array<{ name: string; completedTasks: number; totalTasks: number }>> {
      await new ListCommand().execute(tempDir, 'changes', { json: true });
      return JSON.parse(logOutput.join('\n')).changes;
    }

    it.skipIf(process.platform === 'win32')('lists every change while a dangling symlink sits inside one', async () => {
      const changeDir = await writeChange('locked-change');
      await writeChange('other-change');
      await fs.symlink('user@host.4242:1789000000', path.join(changeDir, '.#tasks.md'));

      const changes = await listJson();

      expect(changes.map(change => change.name).sort()).toEqual(['locked-change', 'other-change']);
      expect(changes.find(change => change.name === 'locked-change')).toMatchObject({
        completedTasks: 1,
        totalTasks: 2,
      });
    });

    it.skipIf(process.platform === 'win32')('lists a change holding a dangling symlink in a nested directory', async () => {
      const changeDir = await writeChange('nested-lock');
      await fs.mkdir(path.join(changeDir, 'specs', 'billing'), { recursive: true });
      await fs.symlink('missing-target', path.join(changeDir, 'specs', 'billing', '.#spec.md'));

      expect((await listJson()).map(change => change.name)).toEqual(['nested-lock']);
    });

    it.skipIf(process.platform === 'win32')('lists a change holding a symlink loop', async () => {
      const changeDir = await writeChange('loop-change');
      await fs.symlink('loop-b', path.join(changeDir, 'loop-a'));
      await fs.symlink('loop-a', path.join(changeDir, 'loop-b'));

      expect((await listJson()).map(change => change.name)).toEqual(['loop-change']);
    });

    it.skipIf(process.platform === 'win32')('still lists and dates a change holding a valid symlink', async () => {
      const changeDir = await writeChange('linked-change');
      const target = path.join(changeDir, 'notes.md');
      await fs.writeFile(target, 'notes\n');
      const future = new Date('2099-01-01T00:00:00.000Z');
      await fs.utimes(target, future, future);
      await fs.symlink('notes.md', path.join(changeDir, 'notes-link.md'));

      await new ListCommand().execute(tempDir, 'changes', { json: true });
      const [change] = JSON.parse(logOutput.join('\n')).changes;

      expect(change.lastModified).toBe(future.toISOString());
    });

    // Permissions are not enforced on Windows or for root.
    it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
      'still fails on a permission error rather than hiding it',
      async () => {
        const changeDir = await writeChange('locked-dir');
        const unreadable = path.join(changeDir, 'specs');
        await fs.mkdir(unreadable);
        await fs.chmod(unreadable, 0o000);
        try {
          await expect(new ListCommand().execute(tempDir, 'changes', { json: true })).rejects.toMatchObject({
            code: 'EACCES',
          });
        } finally {
          await fs.chmod(unreadable, 0o755);
        }
      }
    );

    it.skipIf(process.platform === 'win32')('keeps list --json working end to end', async () => {
      const changeDir = await writeChange('cli-change');
      await fs.mkdir(path.join(tempDir, 'outline-spec', 'specs'), { recursive: true });
      await fs.symlink('user@host.4242:1789000000', path.join(changeDir, '.#tasks.md'));
      const home = path.join(tempDir, 'home');
      await fs.mkdir(home, { recursive: true });

      const result = await runCLI(['list', '--json'], {
        cwd: tempDir,
        env: {
          HOME: home,
          XDG_CONFIG_HOME: path.join(home, '.config'),
          XDG_DATA_HOME: path.join(home, '.local', 'share'),
        },
      });

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout).changes.map((change: { name: string }) => change.name)).toEqual([
        'cli-change',
      ]);
    }, 60_000);
  });
});
