/** What archive and sync share: resolving a change, planning its outline, and writing specs all or nothing. */
import { existsSync, mkdirSync, promises as fs, readFileSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { getTaskProgressForChange, formatTaskStatus } from '../utils/task-progress.js';
import { isNonInteractivePromptError } from '../utils/interactive.js';
import { folderStyleNameProblem } from './id.js';
import { describeNestedChange, findNestedChangesIn } from '../utils/nested-change.js';
import {
  emitStoreRootBanner,
  isRootSelectionError,
  resolveOutlineSpecRoot,
  toRootOutput,
  withStoreFlag,
  type ResolvedOutlineSpecRoot,
} from './root-selection.js';
import { writeSpec } from './outline/outline.js';
import { describePlan, listChanges, planChange, specFile, writePlan, type SpecAction, type SpecPlan } from './outline/specs.js';

export type ChangeVerb = 'archive' | 'sync';

export interface ChangeCommandOptions {
  yes?: boolean;
  dryRun?: boolean;
  json?: boolean;
  store?: string;
  storePath?: string;
}

export interface ChangeDiagnostic {
  severity: 'error';
  code: string;
  message: string;
  fix?: string;
}

export type PlannedSpec = { name: string; action: SpecAction; text?: string };

/** A point archive or sync can't get past on its own; carries a diagnostic for --json and a Fix: line. */
export class ChangeBlockedError extends Error {
  readonly diagnostic: ChangeDiagnostic;

  constructor(code: string, message: string, fix?: string) {
    super(message);
    this.name = 'ChangeBlockedError';
    this.diagnostic = { severity: 'error', code, message, ...(fix ? { fix } : {}) };
  }
}

function toDiagnostic(error: unknown, verb: ChangeVerb): ChangeDiagnostic {
  if (error instanceof ChangeBlockedError) return error.diagnostic;
  if (isRootSelectionError(error)) return error.diagnostic;
  return { severity: 'error', code: `${verb}_error`, message: error instanceof Error ? error.message : String(error) };
}

// Names are folder-style, so quoting only matters for the rare name a shell would split.
export const quote = (name: string) => (/^[A-Za-z0-9._/-]+$/.test(name) ? name : `"${name}"`);

/** Resolves the root, then runs the command; --json prints one document, success or failure. */
export async function runChangeCommand<T extends object>(
  verb: ChangeVerb,
  options: ChangeCommandOptions,
  failure: Record<string, unknown>,
  run: (root: ResolvedOutlineSpecRoot, json: boolean) => Promise<T | null>
): Promise<void> {
  const json = !!options.json;
  const printFailure = (root: ResolvedOutlineSpecRoot | undefined, error: unknown) => {
    console.log(
      JSON.stringify({ ...failure, ...(root ? { root: toRootOutput(root) } : {}), status: [toDiagnostic(error, verb)] }, null, 2)
    );
    process.exitCode = 1;
  };
  let root: ResolvedOutlineSpecRoot;
  try {
    root = await resolveOutlineSpecRoot({
      ...(options.store !== undefined ? { store: options.store } : {}),
      ...(options.storePath !== undefined ? { storePath: options.storePath } : {}),
    });
  } catch (error) {
    if (json && isRootSelectionError(error)) return printFailure(undefined, error);
    throw error;
  }

  if (json) {
    try {
      const result = await run(root, true);
      if (result) console.log(JSON.stringify({ ...result, root: toRootOutput(root) }, null, 2));
    } catch (error) {
      printFailure(root, error);
    }
    return;
  }

  emitStoreRootBanner(root);
  await run(root, false);
}

/** The change to act on: the named one, or one picked from a list in a terminal. Null when none was picked. */
export async function resolveChange(
  verb: ChangeVerb,
  root: ResolvedOutlineSpecRoot,
  changeName: string | undefined,
  json: boolean
): Promise<string | null> {
  const { changesDir } = root;
  if (!changeName) {
    if (json) {
      throw new ChangeBlockedError(
        `${verb}_change_name_required`,
        `A change name is required: ${verb} --json is non-interactive.`,
        withStoreFlag(root, `outline-spec ${verb} <change-name> --json`)
      );
    }
    const selected = await selectChange(verb, root);
    if (!selected) {
      console.log('No change selected. Aborting.');
      return null;
    }
    changeName = selected;
  }

  const nameProblem = folderStyleNameProblem(changeName, 'Change name');
  if (nameProblem) throw new ChangeBlockedError(`${verb}_change_name_invalid`, nameProblem);

  const stat = await fs.lstat(path.join(changesDir, changeName)).catch(() => null);
  if (!stat?.isDirectory() || changeName === 'archive') {
    const available = listChanges(changesDir);
    throw new ChangeBlockedError(
      `${verb}_change_not_found`,
      available.length > 0
        ? `Change '${changeName}' not found. Available changes: ${available.join(', ')}`
        : `Change '${changeName}' not found. No active changes exist in this root.`
    );
  }

  const nested = await findNestedChangesIn(changesDir, changeName);
  if (nested) {
    throw new ChangeBlockedError(
      `${verb}_change_is_namespace_folder`,
      `Cannot ${verb} '${changeName}': ${describeNestedChange(nested)}`
    );
  }
  return changeName;
}

/** Every spec the change's outline.md would write, or a blocked error listing every mismatch. */
export function planOrBlock(verb: ChangeVerb, root: ResolvedOutlineSpecRoot, changeName: string): SpecPlan {
  try {
    return planChange(root.specsDir, root.changesDir, changeName);
  } catch (error) {
    throw new ChangeBlockedError(
      `${verb}_conflicts`,
      `Cannot ${verb} '${changeName}'; nothing was written:\n${(error as Error).message}`,
      `Fix outline.md in outline-spec/changes/${changeName}/ so it matches the live specs, then rerun.`
    );
  }
}

/** The plan as name/action pairs, with each spec's resulting text on a dry run (printed unless --json). */
export function describeAndPreview(
  root: ResolvedOutlineSpecRoot,
  plan: SpecPlan,
  dryRun: boolean,
  json: boolean
): PlannedSpec[] {
  const specs = describePlan(root.specsDir, plan);
  if (!dryRun) return specs;
  const withText = specs.map((s) => {
    const spec = plan.get(s.name);
    return { ...s, ...(spec ? { text: writeSpec(spec) } : {}) };
  });
  if (!json) {
    for (const s of withText) {
      const rel = path.relative(root.path, specFile(root.specsDir, s.name)).split(path.sep).join('/');
      console.log(s.text !== undefined ? `\n--- ${rel} (${s.action})\n${s.text.trimEnd()}` : `\n--- ${rel} (deleted)`);
    }
  }
  return withText;
}

async function selectChange(verb: ChangeVerb, root: ResolvedOutlineSpecRoot): Promise<string | null> {
  const names = listChanges(root.changesDir);
  if (names.length === 0) {
    console.log('No active changes found.');
    return null;
  }
  // @inquirer's select writes cursor escapes even into a pipe, so it needs a real terminal.
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new ChangeBlockedError(
      `${verb}_change_name_required`,
      'A change name is required: no terminal is available to choose one from a list.',
      withStoreFlag(root, `outline-spec ${verb} <change-name>`)
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
    return await select({ message: `Select a change to ${verb}`, choices });
  } catch (error) {
    if (isNonInteractivePromptError(error)) {
      throw new ChangeBlockedError(
        `${verb}_change_name_required`,
        'A change name is required: no answer could be read from stdin.',
        withStoreFlag(root, `outline-spec ${verb} <change-name>`)
      );
    }
    return null;
  }
}

/** Writes every spec or none, returning a function that puts back what was there. */
export function writeAtomically(specsDir: string, plan: SpecPlan): () => void {
  const before = new Map<string, string | null>();
  for (const name of plan.keys()) {
    const file = specFile(specsDir, name);
    before.set(file, existsSync(file) ? readFileSync(file, 'utf-8') : null);
  }
  const restore = () => {
    for (const [file, content] of before) {
      try {
        if (content === null) rmSync(file, { force: true });
        else {
          // A deleted spec lost its folder too.
          mkdirSync(path.dirname(file), { recursive: true });
          writeFileSync(file, content);
        }
      } catch {
        // Best effort; the original error is what the caller needs.
      }
    }
  };
  try {
    writePlan(specsDir, plan);
  } catch (error) {
    restore();
    throw error;
  }
  return restore;
}
