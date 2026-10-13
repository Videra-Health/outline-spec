import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

describe('change show (interactive behavior)', () => {
  const projectRoot = process.cwd();
  const testDir = path.join(projectRoot, 'test-change-show-tmp');
  const changesDir = path.join(testDir, 'outline-spec', 'changes');
  const bin = path.join(projectRoot, 'bin', 'outline-spec.js');


  beforeEach(async () => {
    await fs.mkdir(changesDir, { recursive: true });
    const content = `## Proposal\nBecause reasons.\n\n## Requirements\n1. spec-x: Something.\n  a. Thing: It does something.\n`;
    await fs.mkdir(path.join(changesDir, 'demo'), { recursive: true });
    await fs.writeFile(path.join(changesDir, 'demo', 'outline.md'), content, 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('prints list hint and exits non-zero when no arg and non-interactive', () => {
    const originalCwd = process.cwd();
    const originalEnv = { ...process.env };
    try {
      process.chdir(testDir);
      process.env.OUTLINE_SPEC_INTERACTIVE = '0';
      let err: any;
      try {
        execFileSync('node', [bin, 'change', 'show'], { encoding: 'utf-8' });
      } catch (e) { err = e; }
      expect(err).toBeDefined();
      expect(err.status).not.toBe(0);
      expect(err.stderr.toString()).toContain('Available IDs:');
      expect(err.stderr.toString()).toContain('Hint: use "outline-spec list"');
    } finally {
      process.chdir(originalCwd);
      process.env = originalEnv;
    }
  });
});


