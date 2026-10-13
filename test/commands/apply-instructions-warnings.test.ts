import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateApplyInstructions } from '../../src/commands/workflow/instructions.js';

// Apply never blocks on the outline, but it says when outline.md would not land, as validate does.
describe('generateApplyInstructions warnings', () => {
  let tempDir: string;
  let changeDir: string;
  const outline = (reqs: string) => fs.writeFileSync(path.join(changeDir, 'outline.md'), `## Requirements\n${reqs}`);

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-apply-warnings-'));
    changeDir = path.join(tempDir, 'openspec', 'changes', 'my-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'openspec', 'specs', 'demo'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'openspec', 'specs', 'demo', 'spec.md'), '# demo\nA demo.\n\n1. Demo: It demos.\n');
    fs.writeFileSync(path.join(changeDir, '.openspec.yaml'), 'schema: outline\n');
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), '## 1. Implementation\n- [ ] 1.1 Write the code\n');
  });

  afterEach(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  it('warns when outline.md would not land', async () => {
    outline('1. demo:\n  a. Missing (patch):\n');
    const instructions = await generateApplyInstructions(tempDir, 'my-change');
    expect(instructions.state).toBe('ready');
    expect(instructions.warnings).toEqual([expect.stringContaining('demo › Missing: no such requirement to patch')]);
  });

  it('stays quiet when outline.md lands cleanly', async () => {
    outline('1. demo:\n  a. Demo (patch): It ~~demos~~ **shows**.\n');
    expect((await generateApplyInstructions(tempDir, 'my-change')).warnings).toBeUndefined();
  });

  it('stays quiet when there is no outline.md', async () => {
    expect((await generateApplyInstructions(tempDir, 'my-change')).warnings).toBeUndefined();
  });
});
