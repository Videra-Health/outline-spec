import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ChangeCommand } from '../../../src/commands/change.js';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';

describe('ChangeCommand.show/validate', () => {
  let cmd: ChangeCommand;
  let changeName: string;
  let tempRoot: string;
  let originalCwd: string;

  beforeAll(async () => {
    cmd = new ChangeCommand();
    originalCwd = process.cwd();
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'outline-spec-change-command-'));
    const changesDir = path.join(tempRoot, 'outline-spec', 'changes', 'sample-change');
    await fs.mkdir(changesDir, { recursive: true });
    const outline = '## Proposal\nConsistency in tests.\n\n## Requirements\n1. auth: Sign-in.\n  a. Login: Users sign in.\n';
    await fs.writeFile(path.join(changesDir, 'outline.md'), outline, 'utf-8');
    process.chdir(tempRoot);
    changeName = 'sample-change';
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('show --json prints the outline and the items it touches', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    try {
      console.log = (msg?: any, ...args: any[]) => {
        logs.push([msg, ...args].filter(Boolean).join(' '));
      };

      await cmd.show(changeName, { json: true });

      const parsed = JSON.parse(logs.join('\n'));
      expect(parsed.id).toBe(changeName);
      expect(parsed.outline).toContain('## Requirements');
      expect(parsed.touches).toEqual(['auth › Login']);
    } finally {
      console.log = origLog;
    }
  });

  it('error when no change specified: prints available IDs', async () => {
    const logsErr: string[] = [];
    const origErr = console.error;
    try {
      console.error = (msg?: any, ...args: any[]) => {
        logsErr.push([msg, ...args].filter(Boolean).join(' '));
      };
      await cmd.show(undefined as unknown as string, { json: false } as any);
      // Should have set exit code and printed hint
      expect(process.exitCode).toBe(1);
      const errOut = logsErr.join('\n');
      expect(errOut).toMatch(/No change specified/);
      expect(errOut).toMatch(/Available IDs/);
    } finally {
      console.error = origErr;
      process.exitCode = 0;
    }
  });

  describe('resolving a change that has no outline.md', () => {
    it('names the missing outline and points at status', async () => {
      await fs.mkdir(path.join(tempRoot, 'outline-spec', 'changes', 'scaffolded'), { recursive: true });

      await expect(cmd.show('scaffolded', { json: false })).rejects.toThrow(
        /Change "scaffolded" has no outline\.md yet\..*outline-spec status --change scaffolded/s
      );
    });

    it('does not treat a stray file under changes/ as a change', async () => {
      await fs.writeFile(path.join(tempRoot, 'outline-spec', 'changes', 'notes.md'), 'not a change', 'utf-8');

      // Must stay the plain not-found error: `status --change notes.md` cannot work.
      await expect(cmd.show('notes.md', { json: false })).rejects.toThrow(/not found at/);
      await expect(cmd.show('notes.md', { json: false })).rejects.not.toThrow(/has no outline\.md yet/);
    });

    it('does not read an outline outside changes/ via a traversing name', async () => {
      // Reachable target: outline-spec/changes/../../outline.md is tempRoot/outline.md.
      // Without containment this resolves and the file is printed verbatim.
      await fs.writeFile(path.join(tempRoot, 'outline.md'), '## Proposal\nOutside the changes directory', 'utf-8');
      const traversal = path.join('..', '..');

      await expect(cmd.show(traversal, { json: false })).rejects.toThrow(/not found at/);
      await expect(cmd.show(traversal, { json: false })).rejects.not.toThrow(/has no outline\.md yet/);
    });

    it.skipIf(process.platform === 'win32')(
      'does not read an outline symlink outside changes/',
      async () => {
        const outsideOutline = path.join(tempRoot, 'outside-outline.md');
        const linkedOutline = path.join(
          tempRoot,
          'outline-spec',
          'changes',
          'linked-outline',
          'outline.md'
        );
        await fs.writeFile(outsideOutline, '## Proposal\nOutside sentinel', 'utf-8');
        await fs.mkdir(path.dirname(linkedOutline), { recursive: true });
        await fs.symlink(outsideOutline, linkedOutline);

        await expect(cmd.show('linked-outline', { json: false })).rejects.toThrow(
          /outside the allowed directory/u
        );
      }
    );

    it.skipIf(process.platform === 'win32')(
      'allows a linked change directory as its own trust root',
      async () => {
        const sharedChange = path.join(tempRoot, 'shared-change');
        await fs.mkdir(sharedChange);
        await fs.writeFile(
          path.join(sharedChange, 'outline.md'),
          '## Proposal\nReuse a shared plan.\n',
          'utf-8'
        );
        await fs.symlink(
          sharedChange,
          path.join(tempRoot, 'outline-spec', 'changes', 'shared-change')
        );

        await expect(cmd.show('shared-change', { json: false })).resolves.toBeUndefined();
      }
    );

    it('does not treat a nested name as a change', async () => {
      const nested = path.join('sample-change', 'specs');
      await fs.mkdir(path.join(tempRoot, 'outline-spec', 'changes', 'sample-change', 'specs'), { recursive: true });

      await expect(cmd.show(nested, { json: false })).rejects.toThrow(/not found at/);
      await expect(cmd.show(nested, { json: false })).rejects.not.toThrow(/has no outline\.md yet/);
    });
  });

  it('validate --strict --json returns a report with valid boolean', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    try {
      console.log = (msg?: any, ...args: any[]) => {
        logs.push([msg, ...args].filter(Boolean).join(' '));
      };

      await cmd.validate(changeName, { strict: true, json: true });

      const output = logs.join('\n');
      const parsed = JSON.parse(output);
      expect(parsed.valid).toBe(true);
      expect(parsed.issues).toEqual([]);
    } finally {
      console.log = origLog;
    }
  });

  it('validate rejects a traversing change name', async () => {
    await expect(cmd.validate(path.join('..', '..', 'outside'))).rejects.toThrow(/not found at/u);
  });
});
