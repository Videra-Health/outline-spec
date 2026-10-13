import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  generateSkillContent,
  getCommandTemplates,
  getSkillTemplates,
} from '../../../src/core/shared/skill-generation.js';
import { getGlobalDataDir, registerStore } from '../../../src/core/index.js';
import { runCLI } from '../../helpers/run-cli.js';

// Go through getSkillTemplates/getCommandTemplates rather than the raw
// templates: these workflows carry optional-workflow blocks, and only these
// entry points resolve them against an installed set. Building from the raw
// template leaves `[[outline-spec:if-workflow ...]]` in the text, which skill
// generation rejects.
const WORKFLOWS = ['land', 'archive'];
const skill = (workflowId: string): string =>
  generateSkillContent(
    getSkillTemplates(WORKFLOWS).find((entry) => entry.workflowId === workflowId)!.template,
    'test'
  );
const command = (id: string): string =>
  getCommandTemplates(WORKFLOWS).find((entry) => entry.id === id)!.template.content;

const surfaces = [
  ['land skill', skill('land')],
  ['land command', command('land')],
  ['archive skill', skill('archive')],
  ['archive command', command('archive')],
] as const;

describe('land task discovery uses schema-resolved CLI progress', () => {
  let root: string;
  let callerRoot: string;
  let env: NodeJS.ProcessEnv;
  const storeId = 'task-store';

  async function write(relative: string, content: string) {
    const file = path.join(root, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  }

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'outline-spec-land-task-guidance-'));
    env = {
      XDG_DATA_HOME: path.join(root, 'data'),
      XDG_CONFIG_HOME: path.join(root, 'config'),
    };
    await write('outline-spec/config.yaml', 'schema: custom\n');
    await fs.mkdir(path.join(root, 'outline-spec/specs'), { recursive: true });
    // Include another change so callers must match the selected name, not
    // take the first list entry or aggregate progress across the whole root.
    await write('outline-spec/changes/other/tasks.md', '- [x] Unrelated completed work\n');
    await registerStore({ id: storeId, localPath: root, globalDataDir: getGlobalDataDir({ env }) });

    // The caller's nearest root contains the same change name, but its tasks
    // are all done. Omitting --store must therefore produce different progress.
    callerRoot = path.join(root, 'caller');
    await write('caller/outline-spec/config.yaml', 'schema: outline\n');
    await write('caller/outline-spec/changes/selected/tasks.md', '- [x] Local work is done\n');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  for (const [surface, content] of surfaces) {
    it.each([
      ['custom output', 'planning/work-items.md', ['planning/work-items.md']],
      ['multiple outputs', 'work/*.md', ['work/backend.md', 'work/frontend.md']],
    ] as const)(`${surface}: counts unfinished tasks in %s`, async (_label, generates, files) => {
      await write('outline-spec/schemas/custom/schema.yaml', [
        'name: custom',
        'version: 1',
        'artifacts:',
        '  - id: implementation',
        `    generates: "${generates}"`,
        '    description: Implementation checklist',
        '    template: checklist.md',
        '    requires: []',
        'apply:',
        '  requires: [implementation]',
        `  tracks: "${generates}"`,
      ].join('\n'));
      await write('outline-spec/changes/selected/.outline-spec.yaml', 'schema: custom\n');
      for (const file of files) {
        await write(`outline-spec/changes/selected/${file}`, '- [ x ] Finished\n- [~] Pending\n- [ ] Pending\n');
      }

      // Execute the lookup actually taught in the task-checking step.
      const step = content.split('3. **')[1].split('4. **')[0];
      const command = step.match(/`outline-spec (list[^`]*)`/);
      expect(command, surface).not.toBeNull();
      expect(step).toContain('`completedTasks < totalTasks`');
      expect(step).not.toContain('artifactPaths.tasks');

      const args = command![1].trim().split(/\s+/);
      expect(args).toEqual(['list', '--json']);
      const storeFlag = content.match(/then pass `(--store) <id>`/);
      expect(storeFlag).not.toBeNull();
      expect(content).toContain('Every unscoped example of those commands below is shorthand: before running it, append the flag');
      const scopedArgs = [...args, storeFlag![1], storeId];
      expect(scopedArgs).toEqual(['list', '--json', '--store', storeId]);

      const unscoped = await runCLI(args, { cwd: callerRoot, env });
      expect(unscoped.exitCode, unscoped.stderr).toBe(0);
      expect(JSON.parse(unscoped.stdout).changes).toEqual([
        expect.objectContaining({ name: 'selected', totalTasks: 1, completedTasks: 1 }),
      ]);

      const result = await runCLI(scopedArgs, { cwd: callerRoot, env });
      expect(result.exitCode, result.stderr).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.root).toMatchObject({ source: 'store', store_id: storeId });
      const changes = report.changes;
      expect(changes).toHaveLength(2);
      expect(changes.find((change: { name: string }) => change.name === 'selected')).toMatchObject({
        totalTasks: files.length * 3,
        completedTasks: files.length,
        status: 'in-progress',
      });
      await expect(fs.access(path.join(root, 'outline-spec/changes/selected/tasks.md'))).rejects.toThrow();
    });
  }
});
