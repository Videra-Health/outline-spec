import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { InitCommand } from '../../src/core/init.js';
import { UpdateCommand } from '../../src/core/update.js';
import { toLegacyPrefixPath } from '../../src/core/legacy-prefix.js';

vi.mock('@inquirer/prompts', () => ({ confirm: vi.fn().mockResolvedValue(true) }));
vi.mock('../../src/ui/welcome-screen.js', () => ({ showWelcomeScreen: vi.fn() }));

const LEGACY_SKILL = `---
name: outline-spec-propose
metadata:
  author: outline-spec
  generatedBy: "0.2.0"
---
Use /outline-spec:apply next.
`;

async function exists(target: string): Promise<boolean> {
  return fs.access(target).then(() => true, () => false);
}

async function writeFile(target: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}

describe('old outline-spec prefix cleanup', () => {
  let testDir: string;
  let configDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'outl-legacy-prefix-'));
    configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'outl-legacy-prefix-config-'));
    process.env.XDG_CONFIG_HOME = configDir;
    process.env.HOME = path.join(testDir, 'home');
    process.env.USERPROFILE = path.join(testDir, 'home');
    process.env.CODEX_HOME = path.join(testDir, 'codex-home');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await fs.mkdir(path.join(testDir, 'outline-spec'), { recursive: true });
  });

  afterEach(async () => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.rm(configDir, { recursive: true, force: true });
  });

  it('maps current command paths back to the old prefix', () => {
    expect(toLegacyPrefixPath(path.join('.claude', 'commands', 'outl', 'apply.md')))
      .toBe(path.join('.claude', 'commands', 'outline-spec', 'apply.md'));
    expect(toLegacyPrefixPath(path.join('.cursor', 'commands', 'outl-apply.md')))
      .toBe(path.join('.cursor', 'commands', 'outline-spec-apply.md'));
    expect(toLegacyPrefixPath(path.join('.cospec', 'outl', 'commands', 'outl-apply.md')))
      .toBe(path.join('.cospec', 'outline-spec', 'commands', 'outline-spec-apply.md'));
  });

  it('update replaces old-prefix skills and commands and keeps files it did not generate', async () => {
    const skills = path.join(testDir, '.claude', 'skills');
    const commands = path.join(testDir, '.claude', 'commands');
    await writeFile(path.join(skills, 'outline-spec-propose', 'SKILL.md'), LEGACY_SKILL);
    await writeFile(path.join(skills, 'outline-spec-apply-change', 'SKILL.md'), LEGACY_SKILL);
    await writeFile(path.join(skills, 'outline-spec-custom', 'SKILL.md'), 'mine');
    await writeFile(path.join(commands, 'outline-spec', 'propose.md'), 'old');
    await writeFile(path.join(commands, 'outline-spec', 'apply.md'), 'old');
    await writeFile(path.join(commands, 'outline-spec', 'mine.md'), 'mine');

    await new UpdateCommand().execute(testDir);

    expect(await exists(path.join(skills, 'outl-propose', 'SKILL.md'))).toBe(true);
    expect(await exists(path.join(commands, 'outl', 'propose.md'))).toBe(true);
    expect(await exists(path.join(skills, 'outline-spec-propose'))).toBe(false);
    expect(await exists(path.join(skills, 'outline-spec-apply-change'))).toBe(false);
    expect(await exists(path.join(commands, 'outline-spec', 'propose.md'))).toBe(false);
    expect(await exists(path.join(commands, 'outline-spec', 'apply.md'))).toBe(false);
    expect(await exists(path.join(skills, 'outline-spec-custom', 'SKILL.md'))).toBe(true);
    expect(await exists(path.join(commands, 'outline-spec', 'mine.md'))).toBe(true);
  });

  it('update removes the emptied old commands directory', async () => {
    const commands = path.join(testDir, '.claude', 'commands');
    await writeFile(path.join(testDir, '.claude', 'skills', 'outline-spec-propose', 'SKILL.md'), LEGACY_SKILL);
    await writeFile(path.join(commands, 'outline-spec', 'propose.md'), 'old');

    await new UpdateCommand().execute(testDir);

    expect(await exists(path.join(commands, 'outline-spec'))).toBe(false);
    expect(await exists(path.join(commands, 'outl', 'propose.md'))).toBe(true);
  });

  it('init removes old flat-named commands', async () => {
    const commands = path.join(testDir, '.cursor', 'commands');
    await writeFile(path.join(commands, 'outline-spec-propose.md'), 'old');
    await writeFile(path.join(testDir, '.cursor', 'skills', 'outline-spec-propose', 'SKILL.md'), LEGACY_SKILL);

    await new InitCommand({ tools: 'cursor' }).execute(testDir);

    expect(await exists(path.join(commands, 'outl-propose.md'))).toBe(true);
    expect(await exists(path.join(commands, 'outline-spec-propose.md'))).toBe(false);
    expect(await exists(path.join(testDir, '.cursor', 'skills', 'outline-spec-propose'))).toBe(false);
  });
});
