import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getSchemaDir, resolveSchema } from '../core/artifact-graph/resolver.js';
import { readProjectConfig, REVIEW_WORKFLOWS, type ReviewWorkflow } from '../core/project-config.js';
import { buildBanner, buildBaseSpecChanges, buildTabs, defaultReviewPath, fillTemplate, hasPayloadSlot, type ReviewPageTab } from '../core/review.js';
import { baseSpecTexts, branchName, changedPaths, repoPath, resolveBase, touchedChanges } from '../core/review-base.js';
import { resolveOutlineSpecRoot, resolveRootForCommand, type ResolvedOutlineSpecRoot } from '../core/root-selection.js';
import { Validator } from '../core/validation/validator.js';
import { readChangeMetadata, resolveSchemaForChange, setChangeReviewUrl } from '../utils/change-metadata.js';
import { validateChangeExists } from './workflow/shared.js';

export interface ReviewOptions {
  json?: boolean;
  for?: string;
  url?: string;
  out?: string;
  base?: string;
  summary?: string;
  title?: string;
  store?: string;
  storePath?: string;
}

function print(options: ReviewOptions, json: Record<string, unknown>, text: string): void {
  console.log(options.json ? JSON.stringify(json, null, 2) : text);
}

/** The schema's page template, checked for its payload slot. */
function readTemplate(schemaName: string, template: string, projectRoot?: string): string {
  const templatePath = path.join(getSchemaDir(schemaName, projectRoot) ?? '', 'templates', template);
  let html: string;
  try {
    html = readFileSync(templatePath, 'utf-8');
  } catch {
    throw new Error(`Review template '${template}' not found for schema '${schemaName}' (looked in ${templatePath})`);
  }
  if (!hasPayloadSlot(html)) {
    throw new Error(`Review template ${templatePath} has no <script type="application/json" id="outline-spec-review"></script>`);
  }
  return html;
}

/** The nearest project root, or null in a repository without outline-spec; stores and defaults don't apply. */
async function nearestRoot(): Promise<ResolvedOutlineSpecRoot | null> {
  try {
    const root = await resolveOutlineSpecRoot();
    return root.source === 'nearest' || root.source === 'declared' ? root : null;
  } catch {
    return null;
  }
}

/** Renders one page for the work between `options.base` and the working tree. */
async function reviewPullRequest(options: ReviewOptions & { base: string }): Promise<void> {
  const cwd = process.cwd();
  const sha = resolveBase(cwd, options.base);
  const root = await nearestRoot();
  const tabs: ReviewPageTab[] = [];
  if (options.summary !== undefined) {
    const markdown = readFileSync(path.resolve(options.summary), 'utf-8').replace(/\r\n/g, '\n');
    tabs.push({ title: 'Summary', kind: 'markdown', files: [{ name: path.basename(options.summary), kind: 'markdown', markdown, untrusted: true }] });
  }

  const errors: string[] = [];
  const changes: string[] = [];
  let schemaName = 'outline';
  if (root) {
    const specs = await buildBaseSpecChanges(root.specsDir, baseSpecTexts(cwd, sha, repoPath(cwd, root.specsDir)));
    if (specs.length) tabs.push({ title: 'Spec changes', kind: 'spec-changes', specs });
    const config = readProjectConfig(root.path);
    for (const change of touchedChanges(changedPaths(cwd, sha), repoPath(cwd, root.changesDir), root.changesDir)) {
      const changeSchema = resolveSchemaForChange(path.join(root.changesDir, change), undefined, root.path);
      const review = resolveSchema(changeSchema, root.path).review;
      if (!review) continue;
      const fileTabs = (config?.review?.tabs ?? review.tabs).filter((t) => !t.view);
      for (const tab of buildTabs(root.changesDir, root.specsDir, change, fileTabs)) tabs.push({ ...tab, title: `${change} · ${tab.title}` });
      const report = await new Validator().validateChange(path.join(root.changesDir, change), { specsDir: root.specsDir, projectRoot: root.path });
      errors.push(...report.issues.filter((i) => i.level === 'ERROR').map((i) => `${change}: ${i.message}`));
      changes.push(change);
    }
    schemaName = config?.schema ?? schemaName;
  }

  const schema = resolveSchema(schemaName, root?.path);
  if (!schema.review) throw new Error(`Schema '${schemaName}' has no review block, so there is no review page.`);
  const title = options.title ?? branchName(cwd);
  const html = fillTemplate(readTemplate(schemaName, schema.review.template, root?.path), {
    change: title,
    title,
    base: sha,
    generatedAt: new Date().toISOString(),
    banner: errors.length ? { valid: false, errors, overlaps: [] } : null,
    tabs,
  });
  const out = options.out ? path.resolve(options.out) : defaultReviewPath(root?.path ?? cwd, 'pull-request');
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, html);
  print(options, { path: out, base: sha, changes }, out);
}

export async function reviewCommand(change: string | undefined, options: ReviewOptions): Promise<void> {
  if (change === undefined) {
    if (options.base === undefined) throw new Error('Name a change to review, or pass --base <ref> for a pull request page.');
    return reviewPullRequest({ ...options, base: options.base });
  }
  const root = await resolveRootForCommand(options, { json: options.json });
  if (!root) return;
  await validateChangeExists(change, root.path, root.changesDir);
  const changeDir = path.join(root.changesDir, change);
  const schemaName = resolveSchemaForChange(changeDir, undefined, root.path);

  if (options.url !== undefined) {
    if (!options.url.trim()) throw new Error('--url needs a link');
    setChangeReviewUrl(changeDir, options.url, schemaName, root.path);
    print(options, { change, reviewUrl: options.url }, `Recorded the review page link for ${change}.`);
    return;
  }

  if (options.for !== undefined && !(REVIEW_WORKFLOWS as readonly string[]).includes(options.for)) {
    throw new Error(`Unknown workflow '${options.for}' for --for. Workflows: ${REVIEW_WORKFLOWS.join(', ')}`);
  }
  const config = readProjectConfig(root.path);
  const reviewOn = config?.reviewOn ?? [...REVIEW_WORKFLOWS];
  const enabled = options.for ? reviewOn.includes(options.for as ReviewWorkflow) : reviewOn.length > 0;
  if (!enabled) {
    const why = options.for ? `review-on doesn't include ${options.for}` : 'review-on is empty';
    print(options, { change, enabled: false }, `The review page is off (${why} in outline-spec/config.yaml).`);
    return;
  }

  const schema = resolveSchema(schemaName, root.path);
  if (!schema.review) throw new Error(`Schema '${schemaName}' has no review block, so ${change} has no review page.`);
  const template = readTemplate(schemaName, schema.review.template, root.path);

  const html = fillTemplate(template, {
    change,
    generatedAt: new Date().toISOString(),
    banner: await buildBanner(root.changesDir, root.specsDir, change, root.path),
    tabs: buildTabs(root.changesDir, root.specsDir, change, config?.review?.tabs ?? schema.review.tabs),
  });
  const out = options.out ? path.resolve(options.out) : defaultReviewPath(root.path, change);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, html);

  let reviewUrl: string | undefined;
  try {
    reviewUrl = readChangeMetadata(changeDir, root.path)?.reviewUrl;
  } catch {
    // An unreadable metadata file has its own diagnostics in validate; the page still renders.
  }
  print(options, { path: out, change, ...(reviewUrl ? { reviewUrl } : {}), enabled: true }, out);
}
