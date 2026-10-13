import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { isOutlineSpec, migrateSpec, type Unplaced } from '../core/outline/migrate.js';
import { resolveRootForCommand, toRootOutput } from '../core/root-selection.js';
import { discoverSpecFiles } from '../utils/spec-discovery.js';

export interface MigrateSpecsOptions {
  dryRun?: boolean;
  json?: boolean;
  store?: string;
  storePath?: string;
}

interface SpecReport {
  name: string;
  status: 'converted' | 'already-outline' | 'blocked';
  notes: string[];
  unplaced: Unplaced[];
  text?: string;
}

/** Converts old-format main specs to outlines; a spec with content it can't place is left untouched. */
export async function migrateSpecsCommand(options: MigrateSpecsOptions): Promise<void> {
  const root = await resolveRootForCommand(options, { json: options.json, failurePayload: { specs: [], root: null } });
  if (!root) return;
  const reports: SpecReport[] = [];
  for (const { id, specFile } of await discoverSpecFiles(root.specsDir)) {
    const src = readFileSync(specFile, 'utf-8');
    if (isOutlineSpec(src)) {
      reports.push({ name: id, status: 'already-outline', notes: [], unplaced: [] });
      continue;
    }
    const result = migrateSpec(src, id);
    const blocked = result.unplaced.length > 0;
    if (!blocked && !options.dryRun) writeFileSync(specFile, result.text);
    reports.push({
      name: id,
      status: blocked ? 'blocked' : 'converted',
      notes: result.notes,
      unplaced: result.unplaced,
      ...(options.dryRun && !blocked ? { text: result.text } : {}),
    });
  }
  if (reports.some((r) => r.status === 'blocked')) process.exitCode = 1;

  if (options.json) {
    console.log(JSON.stringify({ dryRun: !!options.dryRun, specs: reports, root: toRootOutput(root) }, null, 2));
    return;
  }
  if (reports.length === 0) {
    console.log('No specs found.');
    return;
  }
  for (const r of reports) {
    const rel = path.join('openspec', 'specs', r.name, 'spec.md');
    if (r.status === 'already-outline') {
      console.log(`- ${r.name}: already an outline`);
      continue;
    }
    if (r.status === 'blocked') {
      console.log(`✗ ${r.name}: not converted; these lines have no place in an outline:`);
      for (const u of r.unplaced) console.log(`    ${rel}:${u.line} (${u.reason}) ${u.text.trim()}`);
    } else {
      console.log(`✓ ${r.name}: ${options.dryRun ? 'would convert' : 'converted'}`);
    }
    for (const n of r.notes) console.log(`    note: ${n}`);
    if (r.text) console.log(`\n${r.text}`);
  }
  const blocked = reports.filter((r) => r.status === 'blocked').length;
  const converted = reports.filter((r) => r.status === 'converted').length;
  console.log(
    `\n${converted} ${options.dryRun ? 'would convert' : 'converted'}, ${blocked} blocked, ${reports.length - converted - blocked} already outlines.` +
      (blocked ? ' Move or rewrite the listed lines as requirement text, details, or scenarios, then rerun.' : '')
  );
}
