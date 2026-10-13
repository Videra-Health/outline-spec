import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getSchemaDir, resolveSchema } from '../core/artifact-graph/resolver.js';
import { readProjectConfig, REVIEW_WORKFLOWS, type ReviewWorkflow } from '../core/project-config.js';
import { buildBanner, buildTabs, defaultReviewPath, fillTemplate, hasPayloadSlot } from '../core/review.js';
import { resolveRootForCommand } from '../core/root-selection.js';
import { readChangeMetadata, resolveSchemaForChange, setChangeReviewUrl } from '../utils/change-metadata.js';
import { validateChangeExists } from './workflow/shared.js';

export interface ReviewOptions {
  json?: boolean;
  for?: string;
  url?: string;
  out?: string;
  store?: string;
  storePath?: string;
}

function print(options: ReviewOptions, json: Record<string, unknown>, text: string): void {
  console.log(options.json ? JSON.stringify(json, null, 2) : text);
}

export async function reviewCommand(change: string, options: ReviewOptions): Promise<void> {
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
  const schemaDir = getSchemaDir(schemaName, root.path);
  const templatePath = path.join(schemaDir ?? '', 'templates', schema.review.template);
  let template: string;
  try {
    template = readFileSync(templatePath, 'utf-8');
  } catch {
    throw new Error(`Review template '${schema.review.template}' not found for schema '${schemaName}' (looked in ${templatePath})`);
  }
  if (!hasPayloadSlot(template)) {
    throw new Error(`Review template ${templatePath} has no <script type="application/json" id="outline-spec-review"></script>`);
  }

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
