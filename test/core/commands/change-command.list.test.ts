import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChangeCommand } from '../../../src/commands/change.js';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';

describe('ChangeCommand.list', () => {
  let cmd: ChangeCommand;
  let tempRoot: string;
  let originalCwd: string;

  beforeAll(async () => {
    cmd = new ChangeCommand();
    originalCwd = process.cwd();
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-change-command-list-'));
    const changeDir = path.join(tempRoot, 'openspec', 'changes', 'demo');
    await fs.mkdir(changeDir, { recursive: true });
    const outline = '## Proposal\nTest list.\n\n## Requirements\n1. auth: Sign-in.\n  a. Login: Users sign in.\n2. billing: Invoices.\n  a. Invoice: Users get invoices.\n';
    await fs.writeFile(path.join(changeDir, 'outline.md'), outline, 'utf-8');
    await fs.writeFile(path.join(changeDir, 'tasks.md'), '- [x] Task 1\n- [ ] Task 2\n', 'utf-8');
    process.chdir(tempRoot);
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('returns JSON with expected shape', async () => {
    // Capture console output
    const logs: string[] = [];
    const origLog = console.log;
    try {
      console.log = (msg?: any, ...args: any[]) => {
        logs.push([msg, ...args].filter(Boolean).join(' '));
      };

      await cmd.list({ json: true });

      const output = logs.join('\n');
      const parsed = JSON.parse(output);
      expect(parsed).toEqual([
        { id: 'demo', title: 'demo', specCount: 2, taskStatus: { total: 2, completed: 1 } },
      ]);
    } finally {
      console.log = origLog;
    }
  });

  it('prints IDs by default and details with --long', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    try {
      console.log = (msg?: any, ...args: any[]) => {
        logs.push([msg, ...args].filter(Boolean).join(' '));
      };
      await cmd.list({});
      const idsOnly = logs.join('\n');
      expect(idsOnly).toBe('demo');
      logs.length = 0;
      await cmd.list({ long: true });
      const longOut = logs.join('\n');
      expect(longOut).toBe('demo: [specs 2] [tasks 1/2]');
    } finally {
      console.log = origLog;
    }

  });
});

describe('ChangeCommand.list with a change that has no outline.md', () => {
  let cmd: ChangeCommand;
  let tempRoot: string;
  let originalCwd: string;

  const capture = async (run: () => Promise<void>): Promise<string> => {
    const logs: string[] = [];
    const origLog = console.log;
    try {
      console.log = (msg?: any, ...args: any[]) => {
        logs.push([msg, ...args].filter(Boolean).join(' '));
      };
      await run();
      return logs.join('\n');
    } finally {
      console.log = origLog;
    }
  };

  beforeAll(async () => {
    cmd = new ChangeCommand();
    originalCwd = process.cwd();
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'openspec-change-list-noproposal-'));
    // What `openspec new change` leaves behind, plus tasks: no outline.md.
    const scaffolded = path.join(tempRoot, 'openspec', 'changes', 'scaffolded');
    await fs.mkdir(scaffolded, { recursive: true });
    await fs.writeFile(path.join(scaffolded, '.openspec.yaml'), 'schema: outline\n', 'utf-8');
    await fs.writeFile(path.join(scaffolded, 'tasks.md'), '- [x] Task 1\n- [ ] Task 2\n', 'utf-8');
    process.chdir(tempRoot);
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('lists it, matching what `openspec list` resolves', async () => {
    expect(await capture(() => cmd.list({}))).toContain('scaffolded');
  });

  it('--long reports the missing outline and keeps task counts', async () => {
    const out = await capture(() => cmd.list({ long: true }));
    expect(out).toContain('scaffolded: (no readable outline.md)');
    expect(out).toContain('[tasks 1/2]');
    expect(out).not.toContain('(unable to read)');
  });

  it('--json names the change instead of "Unknown" and keeps task counts', async () => {
    const parsed = JSON.parse(await capture(() => cmd.list({ json: true })));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      id: 'scaffolded',
      title: 'scaffolded',
      specCount: 0,
      taskStatus: { total: 2, completed: 1 },
    });
  });
});
