import { promises as fs } from 'fs';
import path from 'path';
import { Validator } from '../core/validation/validator.js';
import type { RootOutput } from '../core/root-selection.js';
import { touches, writeSpec } from '../core/outline/outline.js';
import { CHANGE_OUTLINE, describePlan, planEdits, readChangeEdits } from '../core/outline/specs.js';
import { isInteractive } from '../utils/interactive.js';
import { getActiveChangeIds } from '../utils/item-discovery.js';
import { describeNestedChange, findNestedChangesIn } from '../utils/nested-change.js';
import { getTaskProgressForChange } from '../utils/task-progress.js';
import { FileSystemUtils } from '../utils/file-system.js';

/** A change is a directory directly under changes/, so a traversing name never reads outside it. */
function isChangeDirectoryName(changesPath: string, changeDir: string): boolean {
  return path.dirname(path.resolve(changeDir)) === path.resolve(changesPath);
}

async function readOutline(changesPath: string, changeName: string): Promise<string | null> {
  const file = path.join(changesPath, changeName, CHANGE_OUTLINE);
  try {
    FileSystemUtils.assertPathWithin(path.join(changesPath, changeName), file);
    return await fs.readFile(file, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw error;
  }
}

export class ChangeCommand {
  private rootPath?: string;

  // rootPath is set only by root-aware callers (top-level `show`); the
  // deprecated noun-form commands stay cwd-based.
  constructor(rootPath?: string) {
    this.rootPath = rootPath;
  }

  private getChangesPath(): string {
    return path.join(this.rootPath ?? process.cwd(), 'outline-spec', 'changes');
  }

  private getSpecsPath(): string {
    return path.join(this.rootPath ?? process.cwd(), 'outline-spec', 'specs');
  }

  /** Prints a change's outline.md; --diff adds the spec text each touched spec would have once landed. */
  async show(
    changeName?: string,
    options?: { json?: boolean; diff?: boolean; noInteractive?: boolean; rootOutput?: RootOutput }
  ): Promise<void> {
    const changesPath = this.getChangesPath();

    if (!changeName) {
      const changes = await getActiveChangeIds(this.rootPath ?? process.cwd());
      if (isInteractive(options) && changes.length > 0) {
        const { select } = await import('@inquirer/prompts');
        changeName = await select({
          message: 'Select a change to show',
          choices: changes.map((id) => ({ name: id, value: id })),
        });
      } else {
        console.error(
          changes.length === 0
            ? 'No change specified. No active changes found.'
            : `No change specified. Available IDs: ${changes.join(', ')}`
        );
        console.error('Hint: use "outline-spec list" to view available changes.');
        process.exitCode = 1;
        return;
      }
    }

    const changeDir = path.join(changesPath, changeName);
    if (!isChangeDirectoryName(changesPath, changeDir)) {
      throw new Error(`Change "${changeName}" not found at ${changeDir}`);
    }
    const isDir = await fs.stat(changeDir).then((s) => s.isDirectory()).catch(() => false);
    if (!isDir) throw new Error(`Change "${changeName}" not found at ${changeDir}`);

    const outline = await readOutline(changesPath, changeName);
    if (outline === null) {
      // A folder wrapping nested changes has no outline of its own and never will (#1846).
      const nested = await findNestedChangesIn(changesPath, changeName);
      if (nested) throw new Error(describeNestedChange(nested));
      throw new Error(
        `Change "${changeName}" has no ${CHANGE_OUTLINE} yet. ` +
          `Run "outline-spec status --change ${changeName}" to see which artifact comes next.`
      );
    }

    let edits: ReturnType<typeof readChangeEdits> = [];
    let landed: Array<{ name: string; action: string; text?: string }> | undefined;
    let landError: string | undefined;
    try {
      edits = readChangeEdits(changesPath, changeName);
    } catch (error) {
      landError = (error as Error).message;
    }
    if (options?.diff && !landError) {
      try {
        const plan = planEdits(this.getSpecsPath(), edits);
        landed = describePlan(this.getSpecsPath(), plan).map((s) => {
          const spec = plan.get(s.name);
          return { ...s, ...(spec ? { text: writeSpec(spec) } : {}) };
        });
      } catch (error) {
        landError = (error as Error).message;
        process.exitCode = 1;
      }
    }

    if (options?.json) {
      const output = {
        id: changeName,
        outline,
        touches: edits.flatMap(touches),
        ...(landed ? { landed } : {}),
        ...(landError ? { landError: landError.split('\n') } : {}),
        ...(options.rootOutput ? { root: options.rootOutput } : {}),
      };
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    console.log(outline);
    if (!options?.diff) return;
    if (landError) {
      console.error(`Cannot land "${changeName}":\n${landError}`);
      return;
    }
    if (!landed || landed.length === 0) {
      console.log(`"${changeName}" edits no specs.`);
      return;
    }
    for (const s of landed) {
      console.log(s.text !== undefined ? `\n--- outline-spec/specs/${s.name}/spec.md (${s.action})\n${s.text.trimEnd()}` : `\n--- outline-spec/specs/${s.name}/spec.md (deleted)`);
    }
  }

  /**
   * List active changes.
   * - Text default: IDs only; --long prints the number of specs each edits and task counts
   * - JSON: array of { id, title, specCount, taskStatus }, sorted by id
   */
  async list(options?: { json?: boolean; long?: boolean }): Promise<void> {
    const changesPath = path.join(process.cwd(), 'outline-spec', 'changes');
    const changes = await getActiveChangeIds();
    const specCount = (name: string): number | null => {
      try {
        return new Set(readChangeEdits(changesPath, name).map((e) => e.spec)).size;
      } catch {
        return null;
      }
    };

    if (options?.json) {
      const details = await Promise.all(
        changes.map(async (id) => ({
          id,
          title: id,
          specCount: specCount(id) ?? 0,
          taskStatus: await getTaskProgressForChange(changesPath, id, process.cwd()),
        }))
      );
      console.log(JSON.stringify(details.sort((a, b) => a.id.localeCompare(b.id)), null, 2));
      return;
    }
    if (changes.length === 0) {
      console.log('No items found');
      return;
    }
    const sorted = [...changes].sort();
    if (!options?.long) {
      sorted.forEach((id) => console.log(id));
      return;
    }
    for (const id of sorted) {
      const { total, completed } = await getTaskProgressForChange(changesPath, id, process.cwd());
      const tasks = total > 0 ? ` [tasks ${completed}/${total}]` : '';
      const count = specCount(id);
      console.log(`${id}: ${count === null ? `(no readable ${CHANGE_OUTLINE})` : `[specs ${count}]`}${tasks}`);
    }
  }

  async validate(changeName?: string, options?: { strict?: boolean; json?: boolean; noInteractive?: boolean }): Promise<void> {
    const changesPath = path.join(process.cwd(), 'outline-spec', 'changes');

    if (!changeName) {
      const changes = await getActiveChangeIds();
      if (isInteractive(options) && changes.length > 0) {
        const { select } = await import('@inquirer/prompts');
        changeName = await select({
          message: 'Select a change to validate',
          choices: changes.map((id) => ({ name: id, value: id })),
        });
      } else {
        console.error(
          changes.length === 0
            ? 'No change specified. No active changes found.'
            : `No change specified. Available IDs: ${changes.join(', ')}`
        );
        console.error('Hint: use "outline-spec list" to view available changes.');
        process.exitCode = 1;
        return;
      }
    }

    const changeDir = path.join(changesPath, changeName);
    if (!isChangeDirectoryName(changesPath, changeDir)) {
      throw new Error(`Change "${changeName}" not found at ${changeDir}`);
    }
    try {
      await fs.access(changeDir);
    } catch {
      throw new Error(`Change "${changeName}" not found at ${changeDir}`);
    }

    const report = await new Validator(options?.strict || false).validateChange(changeDir, {
      specsDir: path.join(path.dirname(changesPath), 'specs'),
      projectRoot: path.dirname(path.dirname(changesPath)),
    });

    if (options?.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      if (report.valid) console.log(`Change "${changeName}" is valid`);
      else console.error(`Change "${changeName}" has issues`);
      report.issues.forEach((issue) => {
        const prefix = issue.level === 'ERROR' ? '✗' : issue.level === 'WARNING' ? '⚠' : 'ℹ';
        console.error(`${prefix} [${issue.level}] ${issue.path}: ${issue.message}`);
      });
      if (!report.valid) {
        console.error('Next steps:');
        console.error('  - Edit outline.md so its "## Requirements" items match the live specs');
        console.error(`  - Preview the result: outline-spec land ${changeName} --dry-run`);
      }
    }
    if (!report.valid) process.exitCode = 1;
  }
}
