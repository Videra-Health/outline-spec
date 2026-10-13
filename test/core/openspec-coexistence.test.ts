import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { InitCommand } from '../../src/core/init.js';
import { UpdateCommand } from '../../src/core/update.js';
import type { GlobalConfig } from '../../src/core/global-config.js';

const mockState = { config: { featureFlags: {}, profile: 'core', delivery: 'both' } as GlobalConfig };

vi.mock('../../src/core/global-config.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/core/global-config.js')>(),
  getGlobalConfig: () => ({ ...mockState.config }),
  saveGlobalConfig: vi.fn(),
}));

// Files a real OpenSpec install leaves in a project; outline-spec must never touch them.
const OPENSPEC_FILES: Record<string, string> = {
  '.claude/skills/openspec-propose/SKILL.md':
    '---\nname: openspec-propose\nmetadata:\n  generatedBy: "1.3.0"\n---\nUse /opsx:apply next.\n',
  '.claude/skills/openspec-sync-specs/SKILL.md': '---\nname: openspec-sync-specs\n---\nSync.\n',
  '.claude/commands/opsx/propose.md': '---\nname: "OPSX: Propose"\n---\nPropose.\n',
  '.claude/commands/opsx/archive.md': '---\nname: "OPSX: Archive"\n---\nArchive.\n',
  '.claude/commands/openspec/proposal.md': '<!-- OPENSPEC:START -->\nLegacy proposal.\n<!-- OPENSPEC:END -->\n',
  '.cursor/commands/opsx-propose.md': 'Cursor propose.\n',
  'openspec/config.yaml': 'schema: spec-driven\n',
  'openspec/project.md': '# Project\n',
  'openspec/specs/auth/spec.md': '# auth\n\n## Requirements\n',
  'openspec/changes/archive/2025-01-01-x/proposal.md': '# x\n',
  'CLAUDE.md': '# Notes\n\n<!-- OPENSPEC:START -->\nOpenSpec instructions.\n<!-- OPENSPEC:END -->\n',
  'AGENTS.md': '<!-- OPENSPEC:START -->\nOpenSpec instructions.\n<!-- OPENSPEC:END -->\n',
};

async function snapshot(root: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const rel of Object.keys(OPENSPEC_FILES)) {
    out[rel] = await fs.readFile(path.join(root, rel), 'utf-8');
  }
  for (const dir of ['.claude/skills', '.claude/commands', '.cursor/commands', 'openspec']) {
    const entries = await fs.readdir(path.join(root, dir), { recursive: true });
    out[`${dir}/`] = entries
      .map(String)
      .filter((entry) => !entry.startsWith('outline-spec'))
      .sort()
      .join('\n');
  }
  return out;
}

describe('side by side with OpenSpec', () => {
  let testDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'outline-spec-coexist-'));
    process.env.HOME = path.join(testDir, 'home');
    process.env.USERPROFILE = path.join(testDir, 'home');
    process.env.CODEX_HOME = path.join(testDir, 'codex-home');
    for (const [rel, content] of Object.entries(OPENSPEC_FILES)) {
      await fs.mkdir(path.dirname(path.join(testDir, rel)), { recursive: true });
      await fs.writeFile(path.join(testDir, rel), content);
    }
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.env = originalEnv;
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('init and update leave every OpenSpec skill, command, folder, and marker block untouched', async () => {
    const before = await snapshot(testDir);

    await new InitCommand({ tools: 'claude,cursor' }).execute(testDir);
    await new UpdateCommand().execute(testDir);
    await new UpdateCommand({ force: true }).execute(testDir);

    expect(await snapshot(testDir)).toEqual(before);
    // outline-spec installed its own files beside them.
    await expect(fs.stat(path.join(testDir, '.claude/skills/outline-spec-propose/SKILL.md'))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(testDir, '.claude/commands/outline-spec/propose.md'))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(testDir, 'outline-spec/config.yaml'))).resolves.toBeTruthy();
  });

  it('update with only OpenSpec present reports no configured tools and changes nothing', async () => {
    await fs.mkdir(path.join(testDir, 'outline-spec'));
    const before = await snapshot(testDir);

    await new UpdateCommand({ force: true }).execute(testDir);

    expect(await snapshot(testDir)).toEqual(before);
    await expect(fs.stat(path.join(testDir, '.claude/skills/outline-spec-propose'))).rejects.toThrow();
  });
});
