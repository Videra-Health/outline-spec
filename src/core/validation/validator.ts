import { readFileSync, promises as fs } from 'fs';
import path from 'path';
import { ValidationReport, ValidationIssue } from './types.js';
import { kindAt, labelFor, labelValue, parseSpec, reqName, type Node } from '../outline/outline.js';
import { CHANGE_OUTLINE, planEdits, readChangeEdits } from '../outline/specs.js';
import { FileSystemUtils } from '../../utils/file-system.js';
import {
  METADATA_FILENAME,
  formatUnknownChangeMetadataKeysMessage,
  readUnknownChangeMetadataKeys,
  resolveSchemaForChange,
} from '../../utils/change-metadata.js';
import { resolveTaskFilesForChange } from '../../utils/task-progress.js';
import { findTaskNumberingIssues } from './task-numbering.js';
import { findMissingTaskCheckboxIssues } from './task-checkboxes.js';
import { getPackageSchemasDir, getSchemaDir } from '../artifact-graph/index.js';

const LABEL_SHAPE = { num: /^[1-9][0-9]*$/, alpha: /^[a-z]+$/, roman: /^[ivxlcdm]+$/ } as const;

export class Validator {
  private strictMode: boolean;

  constructor(strictMode: boolean = false) {
    this.strictMode = strictMode;
  }

  async validateSpec(filePath: string, specId?: string): Promise<ValidationReport> {
    const specName = specId ?? this.extractNameFromPath(filePath);
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch (error) {
      return this.createReport([{ level: 'ERROR', path: 'file', message: (error as Error).message }]);
    }
    return this.validateSpecContent(specName, content);
  }

  /** Checks a spec's text: it parses as an outline with a purpose and well-formed labels. */
  async validateSpecContent(specName: string, content: string): Promise<ValidationReport> {
    const issues: ValidationIssue[] = [];
    const src = content.replace(/\r\n/g, '\n');
    let spec;
    try {
      spec = parseSpec(src, 'spec.md');
    } catch (error) {
      return this.createReport([{ level: 'ERROR', path: 'file', message: this.oldFormatHint(src, (error as Error).message) }]);
    }
    if (/^#{1,6} /m.test(spec.purpose)) {
      return this.createReport([{ level: 'ERROR', path: 'file', message: this.oldFormatHint(src, 'Spec has headings after its title') }]);
    }
    if (spec.name !== specName) {
      issues.push({ level: 'WARNING', path: 'title', line: 1, message: `Title "# ${spec.name}" should be the spec's folder name, "# ${specName}"` });
    }
    if (!spec.purpose) {
      issues.push({ level: 'ERROR', path: 'purpose', line: 2, message: 'Spec needs a purpose: one or more lines after the title' });
    } else if (/^(TBD|TODO)\b/i.test(spec.purpose)) {
      issues.push({ level: 'WARNING', path: 'purpose', line: 2, message: 'Purpose is still a placeholder; say what this spec is for' });
    }
    if (spec.items.length === 0) {
      issues.push({ level: 'WARNING', path: 'file', message: 'Spec has no requirements' });
    }
    const names = new Set<string>();
    for (const req of spec.items) {
      if (!req.text.includes(': ') || !reqName(req.text).trim()) {
        issues.push({ level: 'ERROR', path: req.label, message: `Requirement ${req.label} needs "Name: sentence"` });
        continue;
      }
      const name = reqName(req.text);
      if (names.has(name)) issues.push({ level: 'ERROR', path: req.label, message: `Duplicate requirement name "${name}"` });
      names.add(name);
    }
    issues.push(...this.labelIssues(spec.items, 0, ''));
    return this.createReport(issues);
  }

  private labelIssues(nodes: Node[], depth: number, prefix: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const kind = kindAt(depth);
    const seen = new Set<string>();
    let last = 0;
    for (const n of nodes) {
      const here = `${prefix}${n.label}`;
      const valid = LABEL_SHAPE[kind].test(n.label) && (kind !== 'roman' || labelFor('roman', labelValue('roman', n.label)) === n.label);
      if (!valid) {
        const example = [1, 2, 3].map((i) => labelFor(kind, i)).join(' / ');
        issues.push({ level: 'ERROR', path: here, message: `Label "${n.label}." should be ${example} at this depth` });
      } else {
        const value = labelValue(kind, n.label);
        if (value <= last) issues.push({ level: 'WARNING', path: here, message: `Label "${n.label}." is out of order` });
        last = Math.max(last, value);
      }
      if (seen.has(n.label)) issues.push({ level: 'ERROR', path: here, message: `Duplicate label "${n.label}." among its siblings` });
      seen.add(n.label);
      if (!n.text.trim()) issues.push({ level: 'ERROR', path: here, message: `Item ${here} has no text` });
      issues.push(...this.labelIssues(n.children, depth + 1, `${here}.`));
    }
    return issues;
  }

  private oldFormatHint(src: string, message: string): string {
    return /^### Requirement:/m.test(src)
      ? `${message}. This spec is in the old "### Requirement:" format; run "outline-spec migrate-specs" to convert it`
      : message;
  }

  /**
   * Checks a change: its outline.md archives cleanly against the live specs.
   * When `projectRoot` is given, its tracked task files are linted too.
   */
  async validateChange(
    changeDir: string,
    options: { specsDir?: string; projectRoot?: string } = {}
  ): Promise<ValidationReport> {
    const issues: ValidationIssue[] = [];
    const specsDir = options.specsDir ?? path.join(path.dirname(path.dirname(changeDir)), 'specs');
    const changesDir = path.dirname(changeDir);
    const change = path.basename(changeDir);
    const outlineStat = await fs.stat(path.join(changeDir, CHANGE_OUTLINE)).catch(() => null);
    if (!outlineStat?.isFile()) {
      issues.push({ level: 'ERROR', path: CHANGE_OUTLINE, message: `Change has no ${CHANGE_OUTLINE}` });
    } else {
      try {
        const edits = readChangeEdits(changesDir, change);
        if (edits.length === 0) {
          issues.push({ level: 'INFO', path: CHANGE_OUTLINE, message: 'Change edits no specs (no "## Requirements" items)' });
        }
        planEdits(specsDir, edits);
      } catch (error) {
        for (const line of (error as Error).message.split('\n')) {
          issues.push({ level: 'ERROR', path: CHANGE_OUTLINE, message: line });
        }
      }
    }
    const unknownKeys = readUnknownChangeMetadataKeys(changeDir);
    if (unknownKeys.length > 0) {
      issues.push({ level: 'WARNING', path: METADATA_FILENAME, message: formatUnknownChangeMetadataKeysMessage(unknownKeys) });
    }
    if (options.projectRoot) {
      issues.push(...await this.collectTaskFileIssues(changeDir, options.projectRoot));
    }
    return this.createReport(issues);
  }

  /**
   * Lints the change's task files.
   *
   * Two checks with deliberately different reach. Checkbox formatting is read
   * from whatever the change's own schema declares as its tracked task output,
   * because every schema's progress, apply and archive behavior is computed by
   * counting checkboxes in exactly those files. Numbering stays scoped to the
   * built-in `outline` schema, whose template is the one that numbers tasks
   * in the first place.
   *
   * The checkbox check never falls back to a bare top-level `tasks.md`: a file
   * no artifact declares is not a tracked task list, and warning about its
   * formatting would be a guess about a file the tool does not read.
   */
  private async collectTaskFileIssues(
    changeDir: string,
    projectRoot: string
  ): Promise<ValidationIssue[]> {
    let trackedFiles: string[];
    try {
      trackedFiles = resolveTaskFilesForChange(changeDir, projectRoot);
    } catch {
      return [];
    }

    const files = trackedFiles.length > 0 ? trackedFiles : [path.join(changeDir, 'tasks.md')];
    const { documents, unreadable } = await this.readTaskDocuments(changeDir, files);
    const toWarning = (issue: { path: string; line: number; message: string }): ValidationIssue => ({
      level: 'WARNING',
      path: issue.path,
      line: issue.line,
      message: issue.message,
    });

    const issues: ValidationIssue[] = [];
    // "No file here holds a checkbox" is a claim about the whole tracked set, so
    // a file that exists but could not be read withdraws it: the checkboxes may
    // be in exactly that file, so this check must not guess from it.
    if (trackedFiles.length > 0 && unreadable === 0) {
      issues.push(...findMissingTaskCheckboxIssues(documents).map(toWarning));
    }
    if (this.usesBuiltInOutlineSchema(changeDir, projectRoot)) {
      issues.push(...findTaskNumberingIssues(documents).map(toWarning));
    }
    return issues;
  }

  /**
   * Reads task files into change-relative documents, counting the ones that
   * exist but could not be read. A file that is simply absent is not counted:
   * the resolver only returns files it found, so the remaining read failures
   * are permissions and I/O, and a check that reasons over the whole set needs
   * to know its evidence was incomplete.
   */
  private async readTaskDocuments(
    changeDir: string,
    files: readonly string[]
  ): Promise<{ documents: Array<{ path: string; content: string }>; unreadable: number }> {
    const documents: Array<{ path: string; content: string }> = [];
    let unreadable = 0;
    for (const file of files) {
      let content: string;
      try {
        content = await fs.readFile(file, 'utf-8');
      } catch (error: any) {
        if (error?.code !== 'ENOENT') unreadable++;
        continue;
      }

      documents.push({ path: this.taskDocumentPath(changeDir, file), content });
    }

    documents.sort((left, right) => left.path.localeCompare(right.path));
    return { documents, unreadable };
  }

  /**
   * Names a task file relative to its change, POSIX-separated.
   *
   * Both sides are canonicalized first. `resolveArtifactOutputs` hands back real
   * paths, while `changeDir` carries whatever spelling the caller resolved, and
   * the two can differ without being apart: on Windows a short 8.3 alias
   * (`RUNNER~1`) against its expanded form turned `tasks.md` into a
   * `../../../..`-prefixed absolute path in the report, and a symlinked project
   * directory does the same elsewhere. Canonicalizing recovers the real
   * relationship. The Windows CI job is the regression guard — the mismatch
   * cannot be staged on POSIX, where the spawned CLI's `process.cwd()` is
   * already physical.
   *
   * A path that still escapes would be a resolver bug rather than a spelling
   * difference, but the report must never leak an absolute filesystem path, so
   * the file name stands in.
   */
  private taskDocumentPath(changeDir: string, file: string): string {
    const relative = path.relative(
      FileSystemUtils.canonicalizeExistingPath(changeDir),
      FileSystemUtils.canonicalizeExistingPath(file)
    );
    const escapes = relative === '' || relative.startsWith('..') || path.isAbsolute(relative);
    return escapes ? path.basename(file) : FileSystemUtils.toPosixPath(relative);
  }

  /**
   * True when the change resolves to the package's own `outline` schema. A
   * project schema that merely reuses the name is not it, so checks written
   * against the built-in template never fire on someone else's task format.
   */
  private usesBuiltInOutlineSchema(changeDir: string, projectRoot: string): boolean {
    try {
      const schemaName = resolveSchemaForChange(changeDir, undefined, projectRoot).replace(
        /\.ya?ml$/,
        ''
      );
      if (schemaName !== 'outline') return false;
      const schemaDir = getSchemaDir(schemaName, projectRoot);
      if (schemaDir === null) return false;
      const builtInSchemaDir = path.join(getPackageSchemasDir(), 'outline');
      return (
        FileSystemUtils.canonicalizeExistingPath(schemaDir) ===
        FileSystemUtils.canonicalizeExistingPath(builtInSchemaDir)
      );
    } catch {
      return false;
    }
  }

  private extractNameFromPath(filePath: string): string {
    const normalizedPath = FileSystemUtils.toPosixPath(filePath);
    const parts = normalizedPath.split('/');
    
    // Look for the directory name after 'specs' or 'changes'
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i] === 'specs' || parts[i] === 'changes') {
        if (i < parts.length - 1) {
          return parts[i + 1];
        }
      }
    }
    
    // Fallback to filename without extension if not in expected structure
    const fileName = parts[parts.length - 1] ?? '';
    const dotIndex = fileName.lastIndexOf('.');
    return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  }

  private createReport(issues: ValidationIssue[]): ValidationReport {
    const errors = issues.filter(i => i.level === 'ERROR').length;
    const warnings = issues.filter(i => i.level === 'WARNING').length;
    const info = issues.filter(i => i.level === 'INFO').length;
    
    const valid = this.strictMode 
      ? errors === 0 && warnings === 0
      : errors === 0;
    
    return {
      valid,
      issues,
      summary: {
        errors,
        warnings,
        info,
      },
    };
  }

  isValid(report: ValidationReport): boolean {
    return report.valid;
  }
}
