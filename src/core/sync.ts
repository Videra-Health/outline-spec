/** Sync: apply a change's spec edits now, record them under applied/, and keep the change open. */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { confirmPrompt, isInteractive } from '../utils/interactive.js';
import { type ResolvedOutlineSpecRoot } from './root-selection.js';
import {
  describeAndPreview,
  planOrBlock,
  resolveChange,
  runChangeCommand,
  writeAtomically,
  type ChangeCommandOptions,
  type PlannedSpec,
} from './change-apply.js';
import { requirementsRange } from './outline/outline.js';
import { APPLIED_DIR, changeOutlinePath } from './outline/specs.js';

export type SyncOptions = ChangeCommandOptions;

export interface SyncResult {
  synced: string;
  dryRun?: boolean;
  specs: PlannedSpec[];
  applied: string | null;
}

/** Today's local date as YYYY-MM-DD. */
function localDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The next free `<date>-<n>.md` in a change's applied/ folder. */
export function nextAppliedName(appliedDir: string, date: string): string {
  const taken = existsSync(appliedDir)
    ? readdirSync(appliedDir)
        .map((f) => new RegExp(`^${date}-(\\d+)\\.md$`).exec(f)?.[1])
        .filter((n): n is string => n !== undefined)
        .map(Number)
    : [];
  return `${date}-${Math.max(0, ...taken) + 1}.md`;
}

export class SyncCommand {
  async execute(changeName?: string, options: SyncOptions = {}): Promise<void> {
    await runChangeCommand('sync', options, { synced: null, specs: [], applied: null }, (root, json) =>
      this.run(changeName, options, root, json)
    );
  }

  private async run(
    changeName: string | undefined,
    options: SyncOptions,
    root: ResolvedOutlineSpecRoot,
    json: boolean
  ): Promise<SyncResult | null> {
    const resolved = await resolveChange('sync', root, changeName, json);
    if (!resolved) return null;
    changeName = resolved;

    const plan = planOrBlock('sync', root, changeName);
    if (plan.size === 0) {
      if (!json) console.log(`Nothing to sync: '${changeName}' has no spec edits under ## Requirements.`);
      return { synced: changeName, ...(options.dryRun ? { dryRun: true } : {}), specs: [], applied: null };
    }

    const outlineFile = changeOutlinePath(root.changesDir, changeName);
    const outline = readFileSync(outlineFile, 'utf-8');
    // A non-empty plan means parseChange found the section.
    const range = requirementsRange(outline)!;
    const section = outline.slice(range.start, range.end);
    const appliedDir = path.join(root.changesDir, changeName, APPLIED_DIR);
    const date = localDate();
    const appliedFile = path.join(appliedDir, nextAppliedName(appliedDir, date));
    const appliedRel = path.relative(root.path, appliedFile).split(path.sep).join('/');

    const specs = describeAndPreview(root, plan, !!options.dryRun, json);
    if (options.dryRun) {
      if (!json) {
        console.log(`\nDry run: nothing written. '${changeName}' would edit ${specs.length} spec(s) and record the edits in ${appliedRel}.`);
      }
      return { synced: changeName, dryRun: true, specs, applied: appliedRel };
    }

    if (!options.yes && !json && isInteractive() && process.stdout.isTTY) {
      const proceed = await confirmPrompt({
        message: `Apply ${specs.length} spec edit(s) from '${changeName}' and record them in ${appliedRel}?`,
        default: true,
      });
      if (!proceed) {
        console.log('Sync cancelled.');
        return null;
      }
    }

    const restoreSpecs = writeAtomically(root.specsDir, plan);
    try {
      mkdirSync(appliedDir, { recursive: true });
      writeFileSync(appliedFile, `# Applied ${date}\n\nChange: ${changeName}\n\n${section.replace(/\s+$/, '')}\n`, { flag: 'wx' });
      try {
        writeFileSync(outlineFile, `${outline.slice(0, range.start)}## Requirements\n\n${outline.slice(range.end)}`);
      } catch (error) {
        rmSync(appliedFile, { force: true });
        throw error;
      }
    } catch (error) {
      restoreSpecs();
      throw error;
    }

    if (!json) {
      for (const s of specs) console.log(`  ${s.action} ${s.name}`);
      console.log(`Synced '${changeName}'. Applied edits recorded in ${appliedRel}; the change stays open.`);
    }
    return { synced: changeName, specs, applied: appliedRel };
  }
}
