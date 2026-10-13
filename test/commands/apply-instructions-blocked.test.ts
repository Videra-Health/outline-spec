import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  generateApplyInstructions,
  printApplyInstructionsText,
} from '../../src/commands/workflow/instructions.js';

/**
 * Apply blocks on the schema's `apply.requires` alone, so its own list stops at
 * the first hop: "Missing artifacts: tasks" for a change that has nothing yet.
 * Taken literally that is an instruction to write the tracking file without
 * the outline it is built from.
 */
describe('generateApplyInstructions blocked prerequisites', () => {
  let tempDir: string;
  let changeDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outline-spec-apply-blocked-'));
    changeDir = path.join(tempDir, 'outline-spec', 'changes', 'my-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, '.outline-spec.yaml'), 'schema: outline\n');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function writeOutline(): void {
    fs.writeFileSync(path.join(changeDir, 'outline.md'), '## Proposal\nx\n\n## Requirements\n1. demo: A demo.\n  a. Demo: It demos.\n');
  }

  it('names the whole chain, not just the artifact apply blocks on', async () => {
    const instructions = await generateApplyInstructions(tempDir, 'my-change');

    expect(instructions.state).toBe('blocked');
    expect(instructions.missingArtifacts).toEqual(['tasks']);
    expect(instructions.missingPrerequisites).toEqual(['outline', 'tasks']);
    expect(instructions.instruction).toContain(
      'Not created yet, in build order: outline, tasks'
    );
  });

  it('leaves the conditional artifacts to the schema rather than demanding them', async () => {
    const instructions = await generateApplyInstructions(tempDir, 'my-change');

    expect(instructions.instruction).toContain('the schema says which are conditional');
    // Naming one artifact would skip the ones it depends on.
    expect(instructions.instruction).toContain('outline-spec instructions <artifact>');
  });

  it('drops the chain line once only the required artifact is left', async () => {
    writeOutline();

    const instructions = await generateApplyInstructions(tempDir, 'my-change');

    expect(instructions.missingPrerequisites).toEqual(['tasks']);
    expect(instructions.instruction).not.toContain('Not created yet');
    expect(instructions.instruction).toContain(
      'outline-spec instructions tasks --change my-change'
    );
  });

  it('points at a command every profile has, never at a skill it may not', async () => {
    const instructions = await generateApplyInstructions(tempDir, 'my-change');

    // `continue` is not in CORE_WORKFLOWS, so the default install never had the
    // skill the old message named.
    expect(instructions.instruction).not.toContain('outline-spec-continue-change');
    expect(instructions.instruction).toContain('outline-spec status --change my-change');
  });

  it('reports no prerequisites once the change is ready to apply', async () => {
    writeOutline();
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), '## 1. W\n- [ ] 1.1 Do it\n');

    const instructions = await generateApplyInstructions(tempDir, 'my-change');

    expect(instructions.state).toBe('ready');
    expect(instructions.missingPrerequisites).toBeUndefined();
  });

  it('prints the chain under the blocked heading', async () => {
    const instructions = await generateApplyInstructions(tempDir, 'my-change');

    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.join(' '));
    });
    printApplyInstructionsText(instructions);
    vi.restoreAllMocks();
    const output = lines.join('\n');

    expect(output).toContain('Missing artifacts: tasks');
    expect(output).toContain('Not created yet, in build order: outline, tasks');
    expect(output).not.toContain('outline-spec-continue-change');
  });
});
