import { describe, it, expect } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import os from 'os';
import { discoverSpecFiles } from '../../src/utils/spec-discovery.js';

async function withTempDir(run: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'outline-spec-spec-discovery-'));
  try {
    await run(dir);
  } finally {
    try { await fs.rm(dir, { recursive: true, force: true }); } catch {}
  }
}

async function writeSpec(root: string, ...segments: string[]) {
  const file = path.join(root, ...segments) + '.md';
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, '# Spec\n', 'utf8');
}

describe('discoverSpecFiles', () => {
  it('discovers spec files directly in the root', async () => {
    await withTempDir(async (dir) => {
      await writeSpec(dir, 'auth');
      await writeSpec(dir, 'payments');

      const found = await discoverSpecFiles(dir);
      expect(found.map((s) => s.id)).toEqual(['auth', 'payments']);
      expect(found[0].specFile).toBe(path.join(dir, 'auth.md'));
    });
  });

  it('discovers nested specs and returns forward-slash ids (#1353)', async () => {
    await withTempDir(async (dir) => {
      await writeSpec(dir, 'platform', 'platform-session-layout');
      await writeSpec(dir, 'mobile', 'mobile-session-layout');
      await writeSpec(dir, 'flat-capability');

      const found = await discoverSpecFiles(dir);
      expect(found.map((s) => s.id)).toEqual([
        'flat-capability',
        'mobile/mobile-session-layout',
        'platform/platform-session-layout',
      ]);
      expect(found[2].specFile).toBe(
        path.join(dir, 'platform', 'platform-session-layout.md')
      );
    });
  });

  it('ignores dot entries and files not ending in .md', async () => {
    await withTempDir(async (dir) => {
      await writeSpec(dir, '.hidden', 'secret');
      await writeSpec(dir, '.draft');
      await writeSpec(dir, 'real');
      await fs.writeFile(path.join(dir, 'notes.txt'), 'notes\n', 'utf8');
      await fs.writeFile(path.join(dir, '.md'), '# Nameless\n', 'utf8');

      const found = await discoverSpecFiles(dir);
      expect(found.map((s) => s.id)).toEqual(['real']);
    });
  });

  it('keeps a spec and a same-named area folder as two specs', async () => {
    await withTempDir(async (dir) => {
      await writeSpec(dir, 'platform');
      await writeSpec(dir, 'platform', 'session-layout');

      const found = await discoverSpecFiles(dir);
      expect(found.map((s) => s.id)).toEqual(['platform', 'platform/session-layout']);
    });
  });

  it('returns an empty list when the specs root does not exist', async () => {
    await withTempDir(async (dir) => {
      const found = await discoverSpecFiles(path.join(dir, 'missing'));
      expect(found).toEqual([]);
    });
  });

  it('throws on a non-ENOENT read error instead of silently dropping specs', async () => {
    await withTempDir(async (dir) => {
      // A file where a directory is expected surfaces ENOTDIR from readdir.
      const notADir = path.join(dir, 'not-a-dir');
      await fs.writeFile(notADir, 'not a directory\n', 'utf8');

      await expect(discoverSpecFiles(notADir)).rejects.toMatchObject({
        code: 'ENOTDIR',
      });
    });
  });

  it('surfaces an unreadable nested directory rather than skipping it', async () => {
    await withTempDir(async (dir) => {
      await writeSpec(dir, 'platform', 'session-layout');
      const nested = path.join(dir, 'platform');
      await fs.chmod(nested, 0o000);

      // Root (and some CI/filesystems) ignore permission bits — skip if not enforced.
      let enforced = false;
      try {
        await fs.readdir(nested);
      } catch {
        enforced = true;
      }
      if (!enforced) {
        await fs.chmod(nested, 0o755);
        return;
      }

      try {
        await expect(discoverSpecFiles(dir)).rejects.toMatchObject({
          code: 'EACCES',
        });
      } finally {
        await fs.chmod(nested, 0o755);
      }
    });
  });

  it.skipIf(process.platform === 'win32')('discovers an in-area symlinked spec file', async () => {
    await withTempDir(async (dir) => {
      await fs.mkdir(path.join(dir, 'platform', '.shared'), { recursive: true });
      const target = path.join(dir, 'platform', '.shared', 'auth.md');
      await fs.writeFile(target, '# Spec\n', 'utf8');
      await fs.symlink(target, path.join(dir, 'platform', 'auth.md'), 'file');

      const found = await discoverSpecFiles(dir);
      expect(found.map((s) => s.id)).toEqual(['platform/auth']);
      expect(found[0].specFile).toBe(path.join(dir, 'platform', 'auth.md'));
    });
  });

  it.skipIf(process.platform === 'win32')('discovers a spec symlink to elsewhere in the specs root', async () => {
    await withTempDir(async (dir) => {
      const target = path.join(dir, '.shared.md');
      await fs.writeFile(target, '# Shared\n', 'utf8');
      await fs.mkdir(path.join(dir, 'area'), { recursive: true });
      await fs.symlink(target, path.join(dir, 'area', 'auth.md'), 'file');

      const found = await discoverSpecFiles(dir);
      expect(found.map((s) => s.id)).toEqual(['area/auth']);
    });
  });

  it.skipIf(process.platform === 'win32')('rejects a spec symlink outside the specs root', async () => {
    await withTempDir(async (dir) => {
      const target = path.join(path.dirname(dir), `${path.basename(dir)}-outside.md`);
      await fs.writeFile(target, '# Outside\n', 'utf8');
      await fs.symlink(target, path.join(dir, 'auth.md'), 'file');

      await expect(discoverSpecFiles(dir)).rejects.toThrow(
        'Path is outside the allowed directory'
      );
      await fs.rm(target, { force: true });
    });
  });

  it.skipIf(process.platform === 'win32')('skips a dangling spec symlink', async () => {
    await withTempDir(async (dir) => {
      await writeSpec(dir, 'real');
      await fs.symlink(path.join(dir, 'missing-target.md'), path.join(dir, 'ghost.md'), 'file');

      const found = await discoverSpecFiles(dir);
      expect(found.map((s) => s.id)).toEqual(['real']);
    });
  });

  it.skipIf(process.platform === 'win32')('does not follow symlinked directories', async () => {
    await withTempDir(async (dir) => {
      await writeSpec(dir, 'area', 'real');
      const target = path.join(dir, 'area');
      const link = path.join(dir, 'linked');
      await fs.symlink(target, link, 'dir');

      const found = await discoverSpecFiles(dir);
      expect(found.map((s) => s.id)).toEqual(['area/real']);
    });
  });
});
