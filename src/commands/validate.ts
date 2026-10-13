import ora from 'ora';
import path from 'path';
import {
  describeNestedChange,
  findNestedChangesIn,
  NESTED_CHANGE_ISSUE_MARKER,
} from '../utils/nested-change.js';
import { Validator } from '../core/validation/validator.js';
import type { ValidationIssue } from '../core/validation/types.js';
import {
  resolveRootForCommand,
  toRootOutput,
  withStoreFlag,
  type ResolvedOutlineSpecRoot,
  isStoreSelectedRoot,
} from '../core/root-selection.js';
import { isInteractive, resolveNoInteractive } from '../utils/interactive.js';
import { getSpecIds } from '../utils/item-discovery.js';
import { getAvailableChanges } from './workflow/shared.js';
import { nearestMatches } from '../utils/match.js';
import { folderStyleNameProblem } from '../core/id.js';

type ItemType = 'change' | 'spec';

interface ExecuteOptions {
  all?: boolean;
  changes?: boolean;
  specs?: boolean;
  report?: string;
  type?: string;
  strict?: boolean;
  json?: boolean;
  noInteractive?: boolean;
  interactive?: boolean; // Commander sets this to false when --no-interactive is used
  concurrency?: string;
  store?: string;
  storePath?: string;
}

interface BulkItemResult {
  id: string;
  type: ItemType;
  valid: boolean;
  issues: { level: 'ERROR' | 'WARNING' | 'INFO'; path: string; message: string }[];
  durationMs: number;
}

type BulkScope = 'all' | 'changes' | 'specs';

interface BulkValidationResult<T extends BulkItemResult = BulkItemResult> {
  items: T[];
  summary: {
    totals: { items: number; passed: number; failed: number };
    byType: Partial<Record<ItemType, { items: number; passed: number; failed: number }>>;
  };
  root: ReturnType<typeof toRootOutput>;
}

/** Findings are a distinct report, not a partial full-v1 items collection. */
export function projectValidationFindings<T extends BulkItemResult>(full: BulkValidationResult<T>, scope: BulkScope) {
  const itemFindings = full.items.filter(item => item.issues.length > 0);
  return {
    report: {
      kind: 'validation-findings' as const,
      version: '1.0' as const,
      scope,
      returnedItems: itemFindings.length,
      totalItems: full.summary.totals.items,
    },
    itemFindings,
    summary: full.summary,
    root: full.root,
  };
}

export class ValidateCommand {
  async execute(itemName: string | undefined, options: ExecuteOptions = {}): Promise<void> {
    const bulk = options.all || options.changes || options.specs;
    let findingsScope: BulkScope | undefined;
    if (options.report !== undefined) {
      const message = options.report !== 'full' && options.report !== 'findings'
        ? `Unknown validation report '${options.report}'.`
        : itemName !== undefined
          ? 'A validation report cannot be combined with an item name.'
          : !bulk
            ? 'A validation report requires an explicit bulk scope.'
            : undefined;
      if (message) {
        const fix = 'Use --report full|findings with --all, --changes, or --specs, without an item name.';
        if (options.json) {
          console.log(JSON.stringify({ status: [{ severity: 'error', code: 'invalid_validation_report_request', message, fix }] }, null, 2));
        } else {
          console.error(`Error: ${message}`);
          console.error(`Fix: ${fix}`);
        }
        process.exitCode = 1;
        return;
      }
      if (options.report === 'findings') {
        findingsScope = options.all || (options.changes && options.specs) ? 'all'
            : options.changes ? 'changes' : 'specs';
      }
    }
    const root = await resolveRootForCommand(options, {
      json: options.json,
      ...(bulk ? { allowImplicitRoot: false } : {}),
    });
    if (!root) {
      return;
    }

    const interactive = isInteractive(options);

    // Handle bulk flags first
    if (bulk) {
      await this.runBulkValidation(root, {
        changes: !!options.all || !!options.changes,
        specs: !!options.all || !!options.specs,
      }, { strict: !!options.strict, json: !!options.json, concurrency: options.concurrency, noInteractive: resolveNoInteractive(options), findingsScope });
      return;
    }

    // No item and no flags
    if (!itemName) {
      if (interactive) {
        await this.runInteractiveSelector(root, { strict: !!options.strict, json: !!options.json, concurrency: options.concurrency });
        return;
      }
      this.printNonInteractiveHint(root);
      process.exitCode = 1;
      return;
    }

    // Direct item validation with type detection or override
    const typeOverride = this.normalizeType(options.type);
    await this.validateDirectItem(root, itemName, { typeOverride, strict: !!options.strict, json: !!options.json });
  }

  private normalizeType(value?: string): ItemType | undefined {
    if (!value) return undefined;
    const v = value.toLowerCase();
    if (v === 'change' || v === 'spec') return v;
    return undefined;
  }

  /**
   * Resolve change IDs by directory existence within the resolved root — the
   * same rule `outline-spec status`/`instructions` use (`getAvailableChanges`) —
   * rather than requiring `proposal.md`. This lets `validate` resolve a
   * scaffolded or still-authoring change that the sibling commands already
   * resolve (#1182). Sorted to preserve the prior `getActiveChangeIds` ordering.
   */
  private async listChangeIds(root: ResolvedOutlineSpecRoot): Promise<string[]> {
    const ids = await getAvailableChanges(root.path, root.changesDir);
    return ids.sort();
  }

  private async runInteractiveSelector(root: ResolvedOutlineSpecRoot, opts: { strict: boolean; json: boolean; concurrency?: string }): Promise<void> {
    const { select } = await import('@inquirer/prompts');
    const choice = await select({
      message: 'What would you like to validate?',
      choices: [
        { name: 'All (changes + specs)', value: 'all' },
        { name: 'All changes', value: 'changes' },
        { name: 'All specs', value: 'specs' },
        { name: 'Pick a specific change or spec', value: 'one' },
      ],
    });

    if (choice === 'all') return this.runBulkValidation(root, { changes: true, specs: true }, opts);
    if (choice === 'changes') return this.runBulkValidation(root, { changes: true, specs: false }, opts);
    if (choice === 'specs') return this.runBulkValidation(root, { changes: false, specs: true }, opts);

    // one
    const [changes, specs] = await Promise.all([this.listChangeIds(root), getSpecIds(root.path)]);
    const items: { name: string; value: { type: ItemType; id: string } }[] = [];
    items.push(...changes.map(id => ({ name: `change/${id}`, value: { type: 'change' as const, id } })));
    items.push(...specs.map(id => ({ name: `spec/${id}`, value: { type: 'spec' as const, id } })));
    if (items.length === 0) {
      console.error('No items found to validate.');
      process.exitCode = 1;
      return;
    }
    const picked = await select<{ type: ItemType; id: string }>({ message: 'Pick an item', choices: items });
    await this.validateByType(root, picked.type, picked.id, opts);
  }

  private printNonInteractiveHint(root: ResolvedOutlineSpecRoot): void {
    console.error('Nothing to validate. Try one of:');
    console.error(`  ${withStoreFlag(root, 'outline-spec validate --all')}`);
    console.error(`  ${withStoreFlag(root, 'outline-spec validate --changes')}`);
    console.error(`  ${withStoreFlag(root, 'outline-spec validate --specs')}`);
    console.error(`  ${withStoreFlag(root, 'outline-spec validate <item-name>')}`);
    console.error('Or run in an interactive terminal.');
  }

  private async validateDirectItem(root: ResolvedOutlineSpecRoot, itemName: string, opts: { typeOverride?: ItemType; strict: boolean; json: boolean }): Promise<void> {
    const [changes, specs] = await Promise.all([this.listChangeIds(root), getSpecIds(root.path)]);
    const isChange = changes.includes(itemName);
    const isSpec = specs.includes(itemName);

    const type = opts.typeOverride ?? (isChange ? 'change' : isSpec ? 'spec' : undefined);

    if (!type) {
      const suggestions = nearestMatches(itemName, [...changes, ...specs]);
      const message = suggestions.length
        ? `Unknown item '${itemName}'. Did you mean: ${suggestions.join(', ')}?`
        : `Unknown item '${itemName}'.`;
      if (opts.json) {
        console.log(
          JSON.stringify(
            { status: [{ severity: 'error', code: 'unknown_item', message }] },
            null,
            2
          )
        );
      } else {
        console.error(message);
      }
      process.exitCode = 1;
      return;
    }

    if (!opts.typeOverride && isChange && isSpec) {
      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              status: [
                {
                  severity: 'error',
                  code: 'ambiguous_item',
                  message: `Ambiguous item '${itemName}' matches both a change and a spec.`,
                  fix: 'Pass --type change|spec.',
                },
              ],
            },
            null,
            2
          )
        );
        process.exitCode = 1;
        return;
      }
      console.error(`Ambiguous item '${itemName}' matches both a change and a spec.`);
      // The noun-form commands are cwd-based and cannot reach a selected store.
      if (isStoreSelectedRoot(root)) {
        console.error('Pass --type change|spec.');
      } else {
        console.error('Pass --type change|spec, or use: outline-spec change validate / outline-spec spec validate');
      }
      process.exitCode = 1;
      return;
    }

    await this.validateByType(root, type, itemName, opts);
  }

  /**
   * A namespace folder wrapping nested change directories has no deltas of its
   * own and never will. The usual "add a delta spec" error points the author at
   * a directory that is not the change, so the nesting is reported instead
   * (#1846). Returns undefined for every ordinary change.
   */
  private async nestedChangeReport(
    root: ResolvedOutlineSpecRoot,
    id: string
  ): Promise<{ valid: false; issues: ValidationIssue[] } | undefined> {
    const nested = await findNestedChangesIn(root.changesDir, id);
    if (!nested) return undefined;
    return {
      valid: false,
      issues: [{ level: 'ERROR', path: 'file', message: describeNestedChange(nested) }],
    };
  }

  private async validateByType(root: ResolvedOutlineSpecRoot, type: ItemType, id: string, opts: { strict: boolean; json: boolean }): Promise<void> {
    // `--type` skips the membership check above, so the name still has to be
    // guarded before it is joined onto a directory. `show` already rejects a
    // traversing id.
    //
    // Spec ids are nested (`specs/<area>/<capability>/spec.md`, #1353), so the
    // guard runs per segment - rejecting the whole id for containing a `/`
    // would break every nested capability, including the hint that
    // `validate --specs` prints. Change names are flat, so they keep the
    // whole-value check.
    const nameProblem =
      type === 'change'
        ? folderStyleNameProblem(id, 'Change name')
        : (id.split('/').map((segment) => folderStyleNameProblem(segment, 'Spec id')).find(Boolean) ?? null);
    if (nameProblem) {
      if (opts.json) {
        console.log(
          JSON.stringify(
            { status: [{ severity: 'error', code: 'invalid_item', message: nameProblem }] },
            null,
            2
          )
        );
      } else {
        console.error(nameProblem);
      }
      process.exitCode = 1;
      return;
    }
    const validator = new Validator(opts.strict);
    if (type === 'change') {
      const changeDir = path.join(root.changesDir, id);
      const start = Date.now();
      const nestedReport = await this.nestedChangeReport(root, id);
      if (nestedReport) {
        this.printReport('change', id, nestedReport, Date.now() - start, opts.json, root);
        process.exitCode = 1;
        return;
      }
      const report = await validator.validateChange(changeDir, {
        specsDir: root.specsDir,
        projectRoot: root.path,
      });
      const durationMs = Date.now() - start;
      this.printReport('change', id, report, durationMs, opts.json, root);
      // Non-zero exit if invalid (keeps enriched output test semantics)
      process.exitCode = report.valid ? 0 : 1;
      return;
    }
    const file = path.join(root.specsDir, id, 'spec.md');
    const start = Date.now();
    const report = await validator.validateSpec(file, id);
    const durationMs = Date.now() - start;
    this.printReport('spec', id, report, durationMs, opts.json, root);
    process.exitCode = report.valid ? 0 : 1;
  }

  private printReport(type: ItemType, id: string, report: { valid: boolean; issues: any[] }, durationMs: number, json: boolean, root: ResolvedOutlineSpecRoot): void {
    if (json) {
      const out = { items: [{ id, type, valid: report.valid, issues: report.issues, durationMs }], summary: { totals: { items: 1, passed: report.valid ? 1 : 0, failed: report.valid ? 0 : 1 }, byType: { [type]: { items: 1, passed: report.valid ? 1 : 0, failed: report.valid ? 0 : 1 } } }, version: '1.0', root: toRootOutput(root) };
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    if (report.valid) {
      console.log(`${type === 'change' ? 'Change' : 'Specification'} '${id}' is valid`);
    } else {
      console.error(`${type === 'change' ? 'Change' : 'Specification'} '${id}' has issues`);
    }
    for (const issue of report.issues) {
      const prefix = issue.level === 'ERROR' ? '✗' : issue.level === 'WARNING' ? '⚠' : 'ℹ';
      console.error(`${prefix} [${issue.level}] ${issue.path}: ${issue.message}`);
    }
    if (!report.valid) {
      this.printNextSteps(type, id, root, report.issues);
    }
  }

  private printNextSteps(type: ItemType, id: string, root: ResolvedOutlineSpecRoot, issues: Array<{ message: string }> = []): void {
    const bullets: string[] = [];
    // A namespace folder has nothing to archive, so outline advice would point at the wrong directory (#1846).
    const nestedIssue = issues.some(i => i.message.includes(NESTED_CHANGE_ISSUE_MARKER));
    if (type === 'change' && nestedIssue) {
      bullets.push('- Move each nested change directly under outline-spec/changes/, folding the namespace into its name');
      bullets.push('- Only specs may be nested by domain; change directories are always flat');
    } else if (type === 'change') {
      bullets.push('- Edit outline.md so its "## Requirements" items match the live specs (struck text, labels, "(patch)")');
      bullets.push(`- Preview the result: ${withStoreFlag(root, `outline-spec archive ${id} --dry-run`)}`);
    } else {
      bullets.push('- A spec is "# <name>", a purpose line, then numbered requirements with a./i./1. details');
      bullets.push('- Convert old-format specs with: outline-spec migrate-specs');
    }
    console.error('Next steps:');
    bullets.forEach(b => console.error(`  ${b}`));
  }

  private printFindingsReport(full: BulkValidationResult, scope: BulkScope, json: boolean, root: ResolvedOutlineSpecRoot): void {
    const findings = projectValidationFindings(full, scope);
    if (json) {
      console.log(JSON.stringify(findings, null, 2));
      return;
    }
    console.log(`Scope: ${scope} (${findings.report.totalItems} items)`);
    if (findings.itemFindings.length === 0) {
      console.log('No item findings.');
    }
    for (const item of findings.itemFindings) {
      console.error(`${item.type}/${item.id}`);
      for (const issue of item.issues) {
        console.error(`  [${issue.level}] ${issue.path}: ${issue.message}`);
      }
    }
    const totals = findings.summary.totals;
    console.log(`Totals: ${totals.passed} passed, ${totals.failed} failed (${totals.items} items)`);
    this.printBulkDetails(full.items, root);
  }

  private printBulkDetails(results: BulkItemResult[], root: ResolvedOutlineSpecRoot): void {
    const firstFailure = results.find((res) => !res.valid);
    if (firstFailure) {
      const storeFlag = isStoreSelectedRoot(root) ? ` --store ${root.storeId}` : '';
      console.log(
        `Details: outline-spec validate ${firstFailure.id} --type ${firstFailure.type}${storeFlag}`
      );
    }
  }

  private async runBulkValidation(root: ResolvedOutlineSpecRoot, scope: { changes: boolean; specs: boolean }, opts: { strict: boolean; json: boolean; concurrency?: string; noInteractive?: boolean; findingsScope?: BulkScope }): Promise<void> {
    const spinner = !opts.json && !opts.noInteractive ? ora('Validating...').start() : undefined;
    const [changeIds, specIds] = await Promise.all([
      scope.changes ? this.listChangeIds(root) : Promise.resolve<string[]>([]),
      scope.specs ? getSpecIds(root.path) : Promise.resolve<string[]>([]),
    ]);

    const DEFAULT_CONCURRENCY = 6;
    const maxSuggestions = 5; // used by nearestMatches
    const concurrency = normalizeConcurrency(opts.concurrency) ?? normalizeConcurrency(process.env.OUTLINE_SPEC_CONCURRENCY) ?? DEFAULT_CONCURRENCY;
    const validator = new Validator(opts.strict);
    const queue: Array<() => Promise<BulkItemResult>> = [];

    for (const id of changeIds) {
      queue.push(async () => {
        const start = Date.now();
        const changeDir = path.join(root.changesDir, id);
        const nestedReport = await this.nestedChangeReport(root, id);
        if (nestedReport) {
          return {
            id,
            type: 'change' as const,
            valid: false,
            issues: nestedReport.issues,
            durationMs: Date.now() - start,
          };
        }
        const report = await validator.validateChange(changeDir, {
          specsDir: root.specsDir,
          projectRoot: root.path,
        });
        const durationMs = Date.now() - start;
        return { id, type: 'change' as const, valid: report.valid, issues: report.issues, durationMs };
      });
    }
    for (const id of specIds) {
      queue.push(async () => {
        const start = Date.now();
        const file = path.join(root.specsDir, id, 'spec.md');
        const report = await validator.validateSpec(file, id);
        const durationMs = Date.now() - start;
        return { id, type: 'spec' as const, valid: report.valid, issues: report.issues, durationMs };
      });
    }

    if (queue.length === 0) {
      spinner?.stop();

      const summary = {
        totals: { items: 0, passed: 0, failed: 0 },
        byType: {
          ...(scope.changes ? { change: { items: 0, passed: 0, failed: 0 } } : {}),
          ...(scope.specs ? { spec: { items: 0, passed: 0, failed: 0 } } : {}),
        },
      } as const;

      if (opts.findingsScope) {
        this.printFindingsReport({ items: [], summary, root: toRootOutput(root) }, opts.findingsScope, opts.json, root);
      } else if (opts.json) {
        const out = { items: [] as BulkItemResult[], summary, version: '1.0', root: toRootOutput(root) };
        console.log(JSON.stringify(out, null, 2));
      } else {
        console.log('No items found to validate.');
      }

      process.exitCode = 0;
      return;
    }

    const results: BulkItemResult[] = [];
    let index = 0;
    let running = 0;
    let passed = 0;
    let failed = 0;

    await new Promise<void>((resolve) => {
      const next = () => {
        while (running < concurrency && index < queue.length) {
          const currentIndex = index++;
          const task = queue[currentIndex];
          running++;
          if (spinner) spinner.text = `Validating (${currentIndex + 1}/${queue.length})...`;
          task()
            .then(res => {
              results.push(res);
              if (res.valid) passed++; else failed++;
            })
            .catch((error: any) => {
              const message = error?.message || 'Unknown error';
              const res: BulkItemResult = { id: getPlannedId(currentIndex, changeIds, specIds) ?? 'unknown', type: getPlannedType(currentIndex, changeIds, specIds) ?? 'change', valid: false, issues: [{ level: 'ERROR', path: 'file', message }], durationMs: 0 };
              results.push(res);
              failed++;
            })
            .finally(() => {
              running--;
              if (index >= queue.length && running === 0) resolve();
              else next();
            });
        }
      };
      next();
    });

    spinner?.stop();

    results.sort((a, b) => a.id.localeCompare(b.id));
    const summary = {
      totals: { items: results.length, passed, failed },
      byType: {
        ...(scope.changes ? { change: summarizeType(results, 'change') } : {}),
        ...(scope.specs ? { spec: summarizeType(results, 'spec') } : {}),
      },
    } as const;

    if (opts.findingsScope) {
      this.printFindingsReport({ items: results, summary, root: toRootOutput(root) }, opts.findingsScope, opts.json, root);
    } else if (opts.json) {
      const out = { items: results, summary, version: '1.0', root: toRootOutput(root) };
      console.log(JSON.stringify(out, null, 2));
    } else {
      for (const res of results) {
        if (res.valid) console.log(`✓ ${res.type}/${res.id}`);
        else console.error(`✗ ${res.type}/${res.id}`);
        for (const issue of res.issues) {
          const prefix = issue.level === 'ERROR' ? '✗' : issue.level === 'WARNING' ? '⚠' : 'ℹ';
          console.error(`  ${prefix} [${issue.level}] ${issue.path}: ${issue.message}`);
        }
      }
      console.log(`Totals: ${summary.totals.passed} passed, ${summary.totals.failed} failed (${summary.totals.items} items)`);
      this.printBulkDetails(results, root);
    }

    process.exitCode = failed > 0 ? 1 : 0;
  }
}

function summarizeType(results: BulkItemResult[], type: ItemType) {
  const filtered = results.filter(r => r.type === type);
  const items = filtered.length;
  const passed = filtered.filter(r => r.valid).length;
  const failed = items - passed;
  return { items, passed, failed };
}

function normalizeConcurrency(value?: string): number | undefined {
  if (!value) return undefined;
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n <= 0) return undefined;
  return n;
}

function getPlannedId(index: number, changeIds: string[], specIds: string[]): string | undefined {
  const totalChanges = changeIds.length;
  if (index < totalChanges) return changeIds[index];
  const specIndex = index - totalChanges;
  return specIds[specIndex];
}

function getPlannedType(index: number, changeIds: string[], specIds: string[]): ItemType | undefined {
  const totalChanges = changeIds.length;
  if (index < totalChanges) return 'change';
  const specIndex = index - totalChanges;
  if (specIndex >= 0 && specIndex < specIds.length) return 'spec';
  return undefined;
}
