import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  DEFAULT_OUTLINE_SPEC_SCHEMA,
  ensureOutlineSpecRoot,
  inspectOutlineSpecRoot,
  rollbackCreatedPaths,
} from '../../src/core/index.js';

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
}));

describe('outline-spec root helper', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outline-spec-root-helper-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createHealthyRoot(root: string, configName = 'config.yaml'): void {
    fs.mkdirSync(path.join(root, 'outline-spec', 'specs'), { recursive: true });
    fs.mkdirSync(path.join(root, 'outline-spec', 'changes'), { recursive: true });
    fs.writeFileSync(path.join(root, 'outline-spec', configName), `schema: ${DEFAULT_OUTLINE_SPEC_SCHEMA}\n`);
  }

  it('inspects a healthy root with config.yaml', async () => {
    const root = path.join(tempDir, 'store');
    createHealthyRoot(root);

    await expect(inspectOutlineSpecRoot(root)).resolves.toEqual(expect.objectContaining({
      healthy: true,
      present: true,
      config: {
        present: true,
        path: 'outline-spec/config.yaml',
      },
      diagnostics: [],
    }));
  });

  it('inspects a healthy root with config.yml', async () => {
    const root = path.join(tempDir, 'store');
    createHealthyRoot(root, 'config.yml');

    await expect(inspectOutlineSpecRoot(root)).resolves.toEqual(expect.objectContaining({
      healthy: true,
      config: {
        present: true,
        path: 'outline-spec/config.yml',
      },
    }));
  });

  it('reports missing root pieces without mutating files', async () => {
    const root = path.join(tempDir, 'store');
    fs.mkdirSync(path.join(root, 'outline-spec', 'changes'), { recursive: true });

    const inspection = await inspectOutlineSpecRoot(root);

    expect(inspection.healthy).toBe(false);
    expect(inspection.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'outline_spec_config_missing',
    ]);
    expect(fs.existsSync(path.join(root, 'outline-spec', 'specs'))).toBe(false);
  });

  it('accepts roots before changes or applied specs exist', async () => {
    const root = path.join(tempDir, 'store');
    fs.mkdirSync(path.join(root, 'outline-spec'), { recursive: true });
    fs.writeFileSync(path.join(root, 'outline-spec', 'config.yaml'), `schema: ${DEFAULT_OUTLINE_SPEC_SCHEMA}\n`);

    const inspection = await inspectOutlineSpecRoot(root);

    expect(inspection).not.toHaveProperty('archive');
    expect(inspection).toEqual(expect.objectContaining({
      healthy: true,
      specs: { present: false },
      changes: { present: false },
      diagnostics: [],
    }));
  });

  it('reports malformed optional planning paths without throwing', async () => {
    const root = path.join(tempDir, 'store');
    fs.mkdirSync(path.join(root, 'outline-spec'), { recursive: true });
    fs.writeFileSync(path.join(root, 'outline-spec', 'config.yaml'), `schema: ${DEFAULT_OUTLINE_SPEC_SCHEMA}\n`);
    fs.writeFileSync(path.join(root, 'outline-spec', 'changes'), 'not a directory\n');

    const inspection = await inspectOutlineSpecRoot(root);

    expect(inspection.healthy).toBe(false);
    expect(inspection.changes).toEqual({ present: false });
    expect(inspection.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'outline_spec_changes_not_directory',
    ]);
  });

  it('ensures the default root shape and records created paths', async () => {
    const root = path.join(tempDir, 'store');

    const result = await ensureOutlineSpecRoot(root);

    expect(result.createdArtifacts).toEqual([
      'outline-spec/',
      'outline-spec/specs/',
      'outline-spec/changes/',
      'outline-spec/config.yaml',
    ]);
    expect(result.inspection.healthy).toBe(true);
    expect(fs.readFileSync(path.join(root, 'outline-spec', 'config.yaml'), 'utf-8')).toContain(
      `schema: ${DEFAULT_OUTLINE_SPEC_SCHEMA}`
    );
  });

  it('preserves existing config and user files', async () => {
    const root = path.join(tempDir, 'store');
    createHealthyRoot(root, 'config.yml');
    fs.writeFileSync(path.join(root, 'outline-spec', 'specs', 'note.md'), 'keep me\n');

    const result = await ensureOutlineSpecRoot(root);

    expect(result.createdArtifacts).toEqual([]);
    expect(fs.existsSync(path.join(root, 'outline-spec', 'config.yaml'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'outline-spec', 'config.yml'), 'utf-8')).toBe(
      `schema: ${DEFAULT_OUTLINE_SPEC_SCHEMA}\n`
    );
    expect(fs.readFileSync(path.join(root, 'outline-spec', 'specs', 'note.md'), 'utf-8')).toBe(
      'keep me\n'
    );
  });

  it('records only new anchors and includes them in rollback', async () => {
    const root = path.join(tempDir, 'store');
    createHealthyRoot(root);

    const result = await ensureOutlineSpecRoot(root, { anchorEmptyDirectories: true });

    expect(result.createdArtifacts).toEqual([
      'outline-spec/specs/.gitkeep',
      'outline-spec/changes/.gitkeep',
    ]);
    expect((await ensureOutlineSpecRoot(root, { anchorEmptyDirectories: true })).createdPaths).toEqual([]);

    await rollbackCreatedPaths(result.createdPaths);

    expect(fs.readdirSync(path.join(root, 'outline-spec', 'specs'))).toEqual([]);
    expect(fs.readdirSync(path.join(root, 'outline-spec', 'changes'))).toEqual([]);
  });

  it.each(['file', 'directory', 'symlink'] as const)(
    'preserves a competing %s created after checking an empty directory',
    async (kind) => {
      const root = path.join(tempDir, 'store');
      createHealthyRoot(root);
      const marker = path.join(root, 'outline-spec', 'specs', '.gitkeep');
      const target = path.join(tempDir, 'outside-target');
      fs.mkdirSync(target);
      fs.writeFileSync(path.join(target, 'user.txt'), 'keep me');
      vi.spyOn(fsPromises, 'readdir').mockImplementationOnce(async () => {
        if (kind === 'file') fs.writeFileSync(marker, 'keep me');
        if (kind === 'directory') fs.mkdirSync(marker);
        if (kind === 'symlink') fs.symlinkSync(target, marker, process.platform === 'win32' ? 'junction' : 'dir');
        return [];
      });

      const result = await ensureOutlineSpecRoot(root, { anchorEmptyDirectories: true });

      expect(result.createdArtifacts).toEqual(['outline-spec/changes/.gitkeep']);
      if (kind === 'file') expect(fs.readFileSync(marker, 'utf-8')).toBe('keep me');
      if (kind === 'directory') expect(fs.lstatSync(marker).isDirectory()).toBe(true);
      if (kind === 'symlink') expect(fs.lstatSync(marker).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(path.join(target, 'user.txt'), 'utf-8')).toBe('keep me');
    },
  );

  it('propagates anchor write failures other than an existing path', async () => {
    const root = path.join(tempDir, 'store');
    createHealthyRoot(root);
    const error = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    vi.spyOn(fsPromises, 'writeFile').mockRejectedValueOnce(error);

    await expect(ensureOutlineSpecRoot(root, { anchorEmptyDirectories: true })).rejects.toBe(error);
  });

  it('rolls back only ledger-created files and empty directories', async () => {
    const root = path.join(tempDir, 'store');
    const result = await ensureOutlineSpecRoot(root);
    fs.writeFileSync(path.join(root, 'user.md'), 'mine\n');

    await rollbackCreatedPaths(result.createdPaths);

    expect(fs.existsSync(path.join(root, 'outline-spec'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'user.md'), 'utf-8')).toBe('mine\n');
  });
});
