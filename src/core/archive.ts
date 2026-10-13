import { promises as fs } from 'fs';
import path from 'path';
import { getTaskProgressForChange, formatTaskStatus } from '../utils/task-progress.js';
import { confirmPrompt, isNonInteractivePromptError } from '../utils/interactive.js';
import { withStoreFlag, type ResolvedOutlineSpecRoot } from './root-selection.js';
import {
  ChangeBlockedError,
  describeAndPreview,
  planOrBlock,
  quote,
  resolveChange,
  runChangeCommand,
  writeAtomically,
  type ChangeCommandOptions,
  type PlannedSpec,
} from './change-apply.js';

export type ArchiveOptions = ChangeCommandOptions;

export interface ArchiveResult {
  archived: string;
  dryRun?: boolean;
  specs: PlannedSpec[];
}

export class ArchiveCommand {
  async execute(changeName?: string, options: ArchiveOptions = {}): Promise<void> {
    await runChangeCommand('archive', options, { archived: null, specs: [] }, (root, json) =>
      this.run(changeName, options, root, json)
    );
  }

  private async run(
    changeName: string | undefined,
    options: ArchiveOptions,
    root: ResolvedOutlineSpecRoot,
    json: boolean
  ): Promise<ArchiveResult | null> {
    const { changesDir, specsDir } = root;
    // A dash-leading name would read as an option, so it goes after `--`, behind any --store.
    const rerun = (name: string) =>
      name.startsWith('-')
        ? `${withStoreFlag(root, 'outline-spec archive --yes')} -- ${quote(name)}`
        : withStoreFlag(root, `outline-spec archive ${quote(name)} --yes`);

    const resolved = await resolveChange('archive', root, changeName, json);
    if (!resolved) return null;
    changeName = resolved;

    const plan = planOrBlock('archive', root, changeName);

    const progress = await getTaskProgressForChange(changesDir, changeName, root.path);
    if (!json) console.log(`Task status: ${formatTaskStatus(progress)}`);
    const incomplete = Math.max(progress.total - progress.completed, 0);
    if (incomplete > 0 && !options.dryRun) {
      if (options.yes) {
        if (!json) console.log(`Warning: ${incomplete} incomplete task(s) found. Continuing due to --yes flag.`);
      } else if (json) {
        throw new ChangeBlockedError(
          'archive_tasks_incomplete',
          `${incomplete} incomplete task(s) found for change '${changeName}'.`,
          `Complete the tasks or rerun with ${rerun(changeName).replace('outline-spec archive', 'outline-spec archive --json')}`
        );
      } else {
        let proceed: boolean;
        try {
          proceed = await confirmPrompt({ message: `Warning: ${incomplete} incomplete task(s) found. Continue?`, default: false });
        } catch (error) {
          if (!isNonInteractivePromptError(error)) throw error;
          throw new ChangeBlockedError(
            'archive_tasks_incomplete',
            `${incomplete} incomplete task(s) found for change '${changeName}', and no answer could be read from stdin.`,
            `Complete the tasks or rerun with ${rerun(changeName)}`
          );
        }
        if (!proceed) {
          console.log('Archive cancelled.');
          return null;
        }
      }
    }

    const specs = describeAndPreview(root, plan, !!options.dryRun, json);
    if (options.dryRun) {
      if (!json) {
        console.log(`\nDry run: nothing written. '${changeName}' would ${specs.length ? `edit ${specs.length} spec(s)` : 'edit no specs'}.`);
      }
      return { archived: changeName, dryRun: true, specs };
    }

    writeAtomically(specsDir, plan);
    // applied/ goes too: git history keeps the record of earlier syncs.
    await fs.rm(path.join(changesDir, changeName), { recursive: true, force: true });

    if (!json) {
      for (const s of specs) console.log(`  ${s.action} ${s.name}`);
      console.log(`Archived '${changeName}'${specs.length ? '' : ' (no spec edits)'}.`);
    }
    return { archived: changeName, specs };
  }
}
