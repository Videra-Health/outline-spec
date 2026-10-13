import { existsSync, mkdirSync, promises as fs, readFileSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { getTaskProgressForChange, formatTaskStatus } from '../utils/task-progress.js';
import { confirmPrompt, isNonInteractivePromptError } from '../utils/interactive.js';
import { folderStyleNameProblem } from './id.js';
import { describeNestedChange, findNestedChangesIn } from '../utils/nested-change.js';
import {
  emitStoreRootBanner,
  isRootSelectionError,
  resolveOpenSpecRoot,
  toRootOutput,
  withStoreFlag,
  type ResolvedOpenSpecRoot,
} from './root-selection.js';
import { writeSpec } from './outline/outline.js';
import {
  describePlan,
  listChanges,
  planChange,
  specFile,
  writePlan,
  type SpecAction,
  type SpecPlan,
} from './outline/specs.js';

export interface LandOptions {
  yes?: boolean;
  dryRun?: boolean;
  json?: boolean;
  store?: string;
  storePath?: string;
}

interface LandDiagnostic {
  severity: 'error';
  code: string;
  message: string;
  fix?: string;
}

export interface LandResult {
  landed: string;
  dryRun?: boolean;
  specs: Array<{ name: string; action: SpecAction; text?: string }>;
}

/** A point land can't get past on its own; carries a diagnostic for --json and a Fix: line. */
export class LandBlockedError extends Error {
  readonly diagnostic: LandDiagnostic;

  constructor(code: string, message: string, fix?: string) {
    super(message);
    this.name = 'LandBlockedError';
    this.diagnostic = { severity: 'error', code, message, ...(fix ? { fix } : {}) };
  }
}

function toDiagnostic(error: unknown): LandDiagnostic {
  if (error instanceof LandBlockedError) return error.diagnostic;
  if (isRootSelectionError(error)) return error.diagnostic;
  return { severity: 'error', code: 'land_error', message: error instanceof Error ? error.message : String(error) };
}

// Names are folder-style, so quoting only matters for the rare name a shell would split.
const quote = (name: string) => (/^[A-Za-z0-9._/-]+$/.test(name) ? name : `"${name}"`);

export class LandCommand {
  async execute(changeName?: string, options: LandOptions = {}): Promise<void> {
    const json = !!options.json;
    let root: ResolvedOpenSpecRoot;
    try {
      root = await resolveOpenSpecRoot({
        ...(options.store !== undefined ? { store: options.store } : {}),
        ...(options.storePath !== undefined ? { storePath: options.storePath } : {}),
      });
    } catch (error) {
      if (json && isRootSelectionError(error)) return this.printJsonFailure(undefined, toDiagnostic(error));
      throw error;
    }

    if (json) {
      try {
        const result = await this.run(changeName, options, root, true);
        if (result) console.log(JSON.stringify({ ...result, root: toRootOutput(root) }, null, 2));
      } catch (error) {
        this.printJsonFailure(root, toDiagnostic(error));
      }
      return;
    }

    emitStoreRootBanner(root);
    await this.run(changeName, options, root, false);
  }

  private printJsonFailure(root: ResolvedOpenSpecRoot | undefined, diagnostic: LandDiagnostic): void {
    console.log(
      JSON.stringify({ landed: null, specs: [], ...(root ? { root: toRootOutput(root) } : {}), status: [diagnostic] }, null, 2)
    );
    process.exitCode = 1;
  }

  private async run(
    changeName: string | undefined,
    options: LandOptions,
    root: ResolvedOpenSpecRoot,
    json: boolean
  ): Promise<LandResult | null> {
    const { changesDir, specsDir } = root;
    // A dash-leading name would read as an option, so it goes after `--`, behind any --store.
    const rerun = (name: string) =>
      name.startsWith('-')
        ? `${withStoreFlag(root, 'openspec land --yes')} -- ${quote(name)}`
        : withStoreFlag(root, `openspec land ${quote(name)} --yes`);

    if (!changeName) {
      if (json) {
        throw new LandBlockedError(
          'land_change_name_required',
          'A change name is required: land --json is non-interactive.',
          withStoreFlag(root, 'openspec land <change-name> --json')
        );
      }
      const selected = await this.selectChange(root);
      if (!selected) {
        console.log('No change selected. Aborting.');
        return null;
      }
      changeName = selected;
    }

    const nameProblem = folderStyleNameProblem(changeName, 'Change name');
    if (nameProblem) throw new LandBlockedError('land_change_name_invalid', nameProblem);

    const changeDir = path.join(changesDir, changeName);
    const stat = await fs.lstat(changeDir).catch(() => null);
    if (!stat?.isDirectory() || changeName === 'archive') {
      const available = listChanges(changesDir);
      throw new LandBlockedError(
        'land_change_not_found',
        available.length > 0
          ? `Change '${changeName}' not found. Available changes: ${available.join(', ')}`
          : `Change '${changeName}' not found. No active changes exist in this root.`
      );
    }

    const nested = await findNestedChangesIn(changesDir, changeName);
    if (nested) {
      throw new LandBlockedError('land_change_is_namespace_folder', `Cannot land '${changeName}': ${describeNestedChange(nested)}`);
    }

    let plan: SpecPlan;
    try {
      plan = planChange(specsDir, changesDir, changeName);
    } catch (error) {
      throw new LandBlockedError(
        'land_conflicts',
        `Cannot land '${changeName}'; nothing was written:\n${(error as Error).message}`,
        `Fix outline.md in openspec/changes/${changeName}/ so it matches the live specs, then rerun.`
      );
    }

    const progress = await getTaskProgressForChange(changesDir, changeName, root.path);
    if (!json) console.log(`Task status: ${formatTaskStatus(progress)}`);
    const incomplete = Math.max(progress.total - progress.completed, 0);
    if (incomplete > 0 && !options.dryRun) {
      if (options.yes) {
        if (!json) console.log(`Warning: ${incomplete} incomplete task(s) found. Continuing due to --yes flag.`);
      } else if (json) {
        throw new LandBlockedError(
          'land_tasks_incomplete',
          `${incomplete} incomplete task(s) found for change '${changeName}'.`,
          `Complete the tasks or rerun with ${rerun(changeName).replace('openspec land', 'openspec land --json')}`
        );
      } else {
        let proceed: boolean;
        try {
          proceed = await confirmPrompt({ message: `Warning: ${incomplete} incomplete task(s) found. Continue?`, default: false });
        } catch (error) {
          if (!isNonInteractivePromptError(error)) throw error;
          throw new LandBlockedError(
            'land_tasks_incomplete',
            `${incomplete} incomplete task(s) found for change '${changeName}', and no answer could be read from stdin.`,
            `Complete the tasks or rerun with ${rerun(changeName)}`
          );
        }
        if (!proceed) {
          console.log('Land cancelled.');
          return null;
        }
      }
    }

    const specs = describePlan(specsDir, plan);
    if (options.dryRun) {
      const withText = specs.map((s) => {
        const spec = plan.get(s.name);
        return { ...s, ...(spec ? { text: writeSpec(spec) } : {}) };
      });
      if (!json) {
        for (const s of withText) {
          const rel = path.relative(root.path, specFile(specsDir, s.name)).split(path.sep).join('/');
          console.log(s.text !== undefined ? `\n--- ${rel} (${s.action})\n${s.text.trimEnd()}` : `\n--- ${rel} (deleted)`);
        }
        console.log(`\nDry run: nothing written. '${changeName}' would ${specs.length ? `edit ${specs.length} spec(s)` : 'edit no specs'}.`);
      }
      return { landed: changeName, dryRun: true, specs: withText };
    }

    writeAtomically(specsDir, plan);
    await fs.rm(changeDir, { recursive: true, force: true });

    if (!json) {
      for (const s of specs) console.log(`  ${s.action} ${s.name}`);
      console.log(`Landed '${changeName}'${specs.length ? '' : ' (no spec edits)'}.`);
    }
    return { landed: changeName, specs };
  }

  private async selectChange(root: ResolvedOpenSpecRoot): Promise<string | null> {
    const names = listChanges(root.changesDir);
    if (names.length === 0) {
      console.log('No active changes found.');
      return null;
    }
    // @inquirer's select writes cursor escapes even into a pipe, so it needs a real terminal.
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new LandBlockedError(
        'land_change_name_required',
        'A change name is required: no terminal is available to choose one from a list.',
        withStoreFlag(root, 'openspec land <change-name>')
      );
    }
    const width = Math.max(...names.map((n) => n.length));
    const choices = await Promise.all(
      names.map(async (name) => {
        const progress = await getTaskProgressForChange(root.changesDir, name, root.path).catch(() => null);
        return { name: progress ? `${name.padEnd(width)}     ${formatTaskStatus(progress)}` : name, value: name };
      })
    );
    const { select } = await import('@inquirer/prompts');
    try {
      return await select({ message: 'Select a change to land', choices });
    } catch (error) {
      if (isNonInteractivePromptError(error)) {
        throw new LandBlockedError(
          'land_change_name_required',
          'A change name is required: no answer could be read from stdin.',
          withStoreFlag(root, 'openspec land <change-name>')
        );
      }
      return null;
    }
  }
}

/** Writes every spec or none: a failure partway restores what was there. */
function writeAtomically(specsDir: string, plan: SpecPlan): void {
  const before = new Map<string, string | null>();
  for (const name of plan.keys()) {
    const file = specFile(specsDir, name);
    before.set(file, existsSync(file) ? readFileSync(file, 'utf-8') : null);
  }
  try {
    writePlan(specsDir, plan);
  } catch (error) {
    for (const [file, content] of before) {
      try {
        if (content === null) rmSync(file, { force: true });
        else {
          // A deleted spec lost its folder too.
          mkdirSync(path.dirname(file), { recursive: true });
          writeFileSync(file, content);
        }
      } catch {
        // Best effort; the original error below is what the caller needs.
      }
    }
    throw error;
  }
}
