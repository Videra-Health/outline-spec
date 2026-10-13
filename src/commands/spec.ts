import { existsSync, readFileSync } from 'fs';
import path, { join } from 'path';
import { parseSpec, type Spec } from '../core/outline/outline.js';
import { findItem, rowObject, writeItem } from '../core/outline/item.js';
import { Validator } from '../core/validation/validator.js';
import type { RootOutput } from '../core/root-selection.js';
import { isInteractive } from '../utils/interactive.js';
import { getSpecIds } from '../utils/item-discovery.js';
import { discoverSpecFiles } from '../utils/spec-discovery.js';
import { FileSystemUtils } from '../utils/file-system.js';

const SPECS_DIR = 'outline-spec/specs';

function assertSpecPath(specsDir: string, specPath: string): void {
  const relativePath = path.relative(path.resolve(specsDir), path.resolve(specPath));
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Path is outside the allowed directory: ${specPath}`);
  }

  try {
    // Preserve confined spec.md links, including links to a sibling capability.
    FileSystemUtils.assertPathWithin(specsDir, specPath);
  } catch {
    // A capability directory may intentionally be a monorepo symlink. Treat it
    // as the trust root while still rejecting a link outside that capability.
    FileSystemUtils.assertPathWithin(path.dirname(specPath), specPath);
  }
}

export interface ShowOptions {
  json?: boolean;
  /** One item: a requirement name or label, then labels, e.g. "Catalog.n.ii". */
  item?: string;
  noInteractive?: boolean;
  rootOutput?: RootOutput;
}

function parseSpecFromFile(specsDir: string, specPath: string): Spec {
  assertSpecPath(specsDir, specPath);
  return parseSpec(readFileSync(specPath, 'utf-8').replace(/\r\n/g, '\n'), specPath);
}

/**
 * Print the raw markdown content for a spec file without any formatting.
 * Raw-first behavior ensures text mode is a passthrough for deterministic output.
 */
function printSpecTextRaw(specsDir: string, specPath: string): void {
  assertSpecPath(specsDir, specPath);
  const content = readFileSync(specPath, 'utf-8');
  console.log(content);
}

export class SpecCommand {
  private specsDir: string;
  private rootPath?: string;

  // rootPath is set only by root-aware callers (top-level `show`); the
  // deprecated noun-form commands stay cwd-based.
  constructor(rootPath?: string) {
    this.rootPath = rootPath;
    this.specsDir = rootPath ? join(rootPath, 'outline-spec', 'specs') : SPECS_DIR;
  }

  async show(specId?: string, options: ShowOptions = {}): Promise<void> {
    if (!specId) {
      const canPrompt = isInteractive(options);
      const specIds = await getSpecIds(this.rootPath ?? process.cwd());
      if (canPrompt && specIds.length > 0) {
        const { select } = await import('@inquirer/prompts');
        specId = await select({
          message: 'Select a spec to show',
          choices: specIds.map(id => ({ name: id, value: id })),
        });
      } else {
        throw new Error('Missing required argument <spec-id>');
      }
    }

    const specPath = join(this.specsDir, specId, 'spec.md');
    assertSpecPath(this.specsDir, specPath);
    if (!existsSync(specPath)) {
      // Root-aware callers get the absolute path; the cwd-based noun form
      // keeps its historical forward-slash relative message on all platforms.
      const displayPath = this.rootPath ? specPath : `outline-spec/specs/${specId}/spec.md`;
      throw new Error(`Spec '${specId}' not found at ${displayPath}`);
    }

    if (options.item !== undefined) {
      const spec = parseSpecFromFile(this.specsDir, specPath);
      const found = findItem(spec, options.item);
      if (options.json) {
        const out = { name: spec.name, item: options.item, ...(found.row ? { row: rowObject(found) } : { node: found.node }), ...(options.rootOutput ? { root: options.rootOutput } : {}) };
        console.log(JSON.stringify(out, null, 2));
      } else {
        console.log(writeItem(found));
      }
      return;
    }
    if (options.json) {
      const spec = parseSpecFromFile(this.specsDir, specPath);
      const out = { name: spec.name, purpose: spec.purpose, items: spec.items, ...(options.rootOutput ? { root: options.rootOutput } : {}) };
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    printSpecTextRaw(this.specsDir, specPath);
  }
}

export async function specShowCommand(
  specId: string | undefined,
  options: ShowOptions & { noInteractive?: boolean }
): Promise<void> {
  try {
    const cmd = new SpecCommand();
    await cmd.show(specId, options as any);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exitCode = 1;
  }
}

export async function specListCommand(options: { json?: boolean; long?: boolean }): Promise<void> {
  try {
    if (!existsSync(SPECS_DIR)) {
      console.log('No items found');
      return;
    }

    const discovered = await discoverSpecFiles(SPECS_DIR);
    const specs = discovered
      .map(({ id, specFile }) => {
        try {
          assertSpecPath(SPECS_DIR, specFile);
          const spec = parseSpecFromFile(SPECS_DIR, specFile);

          return {
            id,
            title: spec.name,
            requirementCount: spec.items.length
          };
        } catch {
          return {
            id,
            title: id,
            requirementCount: 0
          };
        }
      })
      .sort((a, b) => a.id.localeCompare(b.id));

    if (options.json) {
      console.log(JSON.stringify(specs, null, 2));
    } else {
      if (specs.length === 0) {
        console.log('No items found');
        return;
      }
      if (!options.long) {
        specs.forEach(spec => console.log(spec.id));
        return;
      }
      specs.forEach(spec => {
        console.log(`${spec.id}: ${spec.title} [requirements ${spec.requirementCount}]`);
      });
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exitCode = 1;
  }
}

export async function specValidateCommand(
  specId: string | undefined,
  options: { strict?: boolean; json?: boolean; noInteractive?: boolean }
): Promise<void> {
  try {
    if (!specId) {
      const canPrompt = isInteractive(options);
      const specIds = await getSpecIds();
      if (canPrompt && specIds.length > 0) {
        const { select } = await import('@inquirer/prompts');
        specId = await select({
          message: 'Select a spec to validate',
          choices: specIds.map(id => ({ name: id, value: id })),
        });
      } else {
        throw new Error('Missing required argument <spec-id>');
      }
    }

    const specPath = join(SPECS_DIR, specId, 'spec.md');
    assertSpecPath(SPECS_DIR, specPath);
    
    if (!existsSync(specPath)) {
      throw new Error(`Spec '${specId}' not found at outline-spec/specs/${specId}/spec.md`);
    }

    const validator = new Validator(options.strict);
    assertSpecPath(SPECS_DIR, specPath);
    const report = await validator.validateSpec(specPath, specId);

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      if (report.valid) {
        console.log(`Specification '${specId}' is valid`);
      } else {
        console.error(`Specification '${specId}' has issues`);
        report.issues.forEach(issue => {
          const label = issue.level === 'ERROR' ? 'ERROR' : issue.level;
          const prefix = issue.level === 'ERROR' ? '✗' : issue.level === 'WARNING' ? '⚠' : 'ℹ';
          console.error(`${prefix} [${label}] ${issue.path}: ${issue.message}`);
        });
      }
    }
    process.exitCode = report.valid ? 0 : 1;
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exitCode = 1;
  }
}
